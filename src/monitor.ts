import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk/channel-reply-options-runtime";
import {
  createWebhookInFlightLimiter,
  readWebhookBodyOrReject,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookPath,
  withResolvedWebhookRequestPipeline,
} from "openclaw/plugin-sdk/webhook-ingress";
import { resolveInboundRouteEnvelopeBuilderWithRuntime } from "openclaw/plugin-sdk/inbound-envelope";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { ResolvedBinderAccount } from "./accounts.js";
import { postBinderMessage } from "./api.js";
import { getBinderRuntime } from "./runtime.js";

export type BinderRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type BinderWebhookTarget = {
  account: ResolvedBinderAccount;
  config: OpenClawConfig;
  runtime: BinderRuntimeEnv;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type BinderMonitorOptions = {
  account: ResolvedBinderAccount;
  config: OpenClawConfig;
  runtime: BinderRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

type BinderInboundData = {
  message_id: string;
  content: string | null;
  group_id: string | null;
  thread_id: string | null;
  parent_message_id: string;
  sender: { id: string; name: string; username: string | null };
  bot_id: string;
  timestamp: string;
};

type BinderWebhookPayload = {
  event: string;
  data: BinderInboundData;
};

function verifyBinderSignature(body: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function isTimestampFresh(timestampHeader: string | string[] | undefined): boolean {
  const raw = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  if (!raw) {
    return false;
  }
  const ts = parseInt(raw, 10);
  if (isNaN(ts)) {
    return false;
  }
  return Math.abs(Date.now() - ts) < 5 * 60 * 1000;
}

const webhookTargets = new Map<string, BinderWebhookTarget[]>();
const webhookInFlightLimiter = createWebhookInFlightLimiter();

export function registerBinderWebhookTarget(target: BinderWebhookTarget): () => void {
  return registerWebhookTargetWithPluginRoute({
    targetsByPath: webhookTargets,
    target,
    route: {
      auth: "plugin",
      match: "exact",
      pluginId: "binder",
      source: "binder-webhook",
      accountId: target.account.accountId,
      log: target.runtime.log,
      handler: async (req, res) => {
        const handled = await handleBinderWebhookRequest(req, res);
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
        }
      },
    },
  }).unregister;
}

async function handleBinderWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return await withResolvedWebhookRequestPipeline({
    req,
    res,
    targetsByPath: webhookTargets,
    allowMethods: ["POST"],
    inFlightLimiter: webhookInFlightLimiter,
    handle: async ({ targets }) => {
      const bodyResult = await readWebhookBodyOrReject({ req, res, profile: "pre-auth" });
      if (!bodyResult.ok) {
        return true;
      }
      const rawBody = bodyResult.value;

      // Binderr backend sends these header names (protocol-level, not renamed)
      const signatureHeader = req.headers["x-binderr-signature"] as string | undefined;
      const timestampHeader = req.headers["x-binderr-timestamp"];

      if (!signatureHeader) {
        res.statusCode = 401;
        res.end("missing signature");
        return true;
      }

      if (!isTimestampFresh(timestampHeader)) {
        res.statusCode = 401;
        res.end("timestamp expired or missing");
        return true;
      }

      const target = targets.find((t) =>
        verifyBinderSignature(rawBody, signatureHeader, t.account.config.webhookSecret),
      );

      if (!target) {
        res.statusCode = 401;
        res.end("invalid signature");
        return true;
      }

      let payload: BinderWebhookPayload;
      try {
        payload = JSON.parse(rawBody) as BinderWebhookPayload;
      } catch {
        res.statusCode = 400;
        res.end("invalid json");
        return true;
      }

      if (payload.event !== "message_created" || !payload.data) {
        res.statusCode = 200;
        res.end("{}");
        return true;
      }

      target.statusSink?.({ lastInboundAt: Date.now() });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end("{}");

      processBinderEvent(payload.data, target).catch((err) => {
        target.runtime.error?.(
          `[${target.account.accountId}] Binderr webhook processing failed: ${String(err)}`,
        );
      });

      return true;
    },
  });
}

async function processBinderEvent(
  data: BinderInboundData,
  target: BinderWebhookTarget,
): Promise<void> {
  const { account, config, runtime } = target;

  const groupId = data.group_id;
  if (!groupId) {
    return;
  }

  const rawBody = (data.content ?? "").trim();
  const cleanBody = rawBody
    .replace(new RegExp(`@${account.config.botUsername}\\b`, "gi"), "")
    .trim();

  if (!cleanBody) {
    return;
  }

  const core = getBinderRuntime();

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "binder",
    accountId: account.accountId,
    peer: { kind: "group" as const, id: groupId },
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  const { storePath, body } = buildEnvelope({
    channel: "Binderr",
    from: data.sender.name || `user:${data.sender.id}`,
    timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
    body: cleanBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: cleanBody,
    RawBody: rawBody,
    CommandBody: cleanBody,
    From: `binderr:${data.sender.id}`,
    To: `binderr:${groupId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "channel",
    ConversationLabel: `Binderr group ${groupId}`,
    SenderName: data.sender.name || undefined,
    SenderId: data.sender.id,
    SenderUsername: data.sender.username ?? undefined,
    WasMentioned: true,
    Provider: "binderr",
    Surface: "binder",
    MessageSid: data.message_id,
    ReplyToId: data.parent_message_id,
    MessageThreadId: data.thread_id ?? undefined,
    OriginatingChannel: "binder",
    OriginatingTo: `binderr:${groupId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(`binder: failed updating session meta: ${String(err)}`);
    });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "binder",
    accountId: route.accountId,
  });

  const parentMessageId = data.parent_message_id;

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        runtime.log?.(
          `[${account.accountId}] Binder deliver: sending reply to group ${groupId}, parent=${parentMessageId}, text.len=${payload.text?.length ?? 0}`,
        );
        await postBinderMessage({
          account,
          groupId,
          parentMessageId,
          content: payload.text,
        });
        target.statusSink?.({ lastOutboundAt: Date.now() });
        runtime.log?.(`[${account.accountId}] Binder deliver: reply sent successfully`);
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] Binderr ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

export function monitorBinderProvider(options: BinderMonitorOptions): () => void {
  const webhookPath =
    resolveWebhookPath({
      webhookPath: options.account.config.webhookPath,
      defaultPath: "/binder",
    }) ?? "/binder";

  const unregister = registerBinderWebhookTarget({
    account: options.account,
    config: options.config,
    runtime: options.runtime,
    path: webhookPath,
    statusSink: options.statusSink,
  });

  options.runtime.log?.(
    `[${options.account.accountId}] Binder webhook listener registered at ${webhookPath}`,
  );

  return unregister;
}

export function resolveBinderWebhookPath(params: { account: ResolvedBinderAccount }): string {
  return (
    resolveWebhookPath({
      webhookPath: params.account.config.webhookPath,
      defaultPath: "/binder",
    }) ?? "/binder"
  );
}
