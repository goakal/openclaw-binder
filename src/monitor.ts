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
import { postBinderMessage, uploadBinderMedia } from "./api.js";
import { getBinderRuntime } from "./runtime.js";
import { setBinderLastMessageId } from "./channel.js";

import { binderLog, binderError } from "./log.js";

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
  conversation_id?: string;
  pending_message_id?: string;
  nonce?: string;
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
  // Binder sends Unix timestamp in seconds; Date.now() is ms.
  // Detect: if value fits in 32-bit range (< 2^32=4294967296), treat as seconds.
  const tsMs = ts < 4294967296 ? ts * 1000 : ts;
  return Math.abs(Date.now() - tsMs) < 5 * 60 * 1000;
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

      if (payload.event === "ping") {
        target.runtime.log?.(`[${target.account.accountId}] Webhook ping`);
        target.statusSink?.({ lastInboundAt: Date.now() });
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, nonce: payload.data?.nonce ?? null }));
        return true;
      }

      if (!["message_created", "direct_message"].includes(payload.event) || !payload.data) {
        res.statusCode = 200;
        res.end("{}");
        return true;
      }

      target.runtime.log?.(
        `[${target.account.accountId}] Webhook inbound: event=${payload.event} msg=${payload.data.message_id} group=${payload.data.group_id ?? "(dm)"} sender=${payload.data.sender.id}`,
      );
      const verbose = target.account.config.verbose ?? false;
      binderLog(verbose, "Webhook inbound:", payload.event, payload.data.message_id);

      target.statusSink?.({ lastInboundAt: Date.now() });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end("{}");

      processBinderEvent(payload.event, payload.data, target).catch((err) => {
        target.runtime.error?.(
          `[${target.account.accountId}] Binderr webhook processing failed: ${String(err)}`,
        );
      });

      return true;
    },
  });
}

async function processBinderEvent(
  event: string,
  data: BinderInboundData,
  target: BinderWebhookTarget,
): Promise<void> {
  const { account, config, runtime } = target;
  const verbose = account.config.verbose ?? false;
  const isDm = event === "direct_message";

  binderLog(verbose, "processBinderEvent:", event, data.message_id, data.sender.id, data.group_id);

  const rawPeerId = isDm ? (data.conversation_id || data.message_id) : (data.thread_id || data.group_id);
  if (!rawPeerId) {
    binderLog(verbose, "processBinderEvent: no peer id, dropping");
    return;
  }
  const peerId = isDm ? `dm:${rawPeerId}` : (data.thread_id ? `thread:${rawPeerId}` : `group:${rawPeerId}`);
  const apiPeerId = rawPeerId; // bare UUID for API calls
  binderLog(verbose, "processBinderEvent: peerId=", peerId);

  setBinderLastMessageId(peerId, data.message_id);

  const rawBody = (data.content ?? "").trim();
  const cleanBody = isDm ? rawBody : rawBody
    .replace(new RegExp(`@${account.config.botUsername}\\b`, "gi"), "")
    .trim();

  if (!cleanBody) {
    binderLog(verbose, "processBinderEvent: empty body, dropping");
    return;
  }

  const core = getBinderRuntime();
  if (!core) {
    runtime.error?.(`[${account.accountId}] processBinderEvent: getBinderRuntime returned null/undefined`);
    return;
  }

  // Cast peer to avoid SDK generic inference mismatch
  const peer = { kind: (isDm ? "direct" : "group") as "direct" | "group", id: peerId };
  const { route, buildEnvelope } = (resolveInboundRouteEnvelopeBuilderWithRuntime as any)({
    cfg: config,
    channel: "binder",
    accountId: account.accountId,
    peer,
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  const { storePath, body } = buildEnvelope({
    channel: "binder",
    from: data.sender.name || `user:${data.sender.id}`,
    timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
    body: cleanBody,
  });

  const replyTo = isDm ? (data.pending_message_id ?? "") : data.parent_message_id;
  const chatType = isDm ? "direct" : "channel";
  const isThread = !isDm && !!data.thread_id;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: cleanBody,
    RawBody: rawBody,
    CommandBody: cleanBody,
    From: `binder:${data.sender.id}`,
    To: peerId,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: isDm ? `DM with ${data.sender.name || data.sender.id}` : (isThread ? `Binder thread ${peerId}` : `Binder group ${peerId}`),
    SenderName: data.sender.name || undefined,
    SenderId: data.sender.id,
    SenderUsername: data.sender.username ?? undefined,
    WasMentioned: !isDm,
    Provider: "binder",
    Surface: "binder",
    MessageSid: data.message_id,
    ReplyToId: replyTo,
    MessageThreadId: data.thread_id ?? undefined,
    OriginatingChannel: "binder",
    OriginatingTo: peerId,
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

  if (!core.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    runtime.error?.(`[${account.accountId}] processBinderEvent: dispatchReplyWithBufferedBlockDispatcher missing`);
    return;
  }

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        // Collect any media the agent attached to this reply (URLs or local
        // paths). Upload each to Binder as the bot, then send the message
        // with the resulting attachment ids. A failed upload is logged and
        // skipped so a broken image never drops the text reply.
        const mediaSources = [
          ...(payload.mediaUrl ? [payload.mediaUrl] : []),
          ...(payload.mediaUrls ?? []),
        ];
        let attachmentIds: string[] | undefined;
        if (mediaSources.length > 0) {
          const ids: string[] = [];
          for (const source of mediaSources) {
            try {
              const id = await uploadBinderMedia({
                account,
                ...(isDm ? { conversationId: apiPeerId } : { groupId: apiPeerId }),
                source,
              });
              ids.push(id);
            } catch (err) {
              binderError(verbose, `deliver: media upload failed for ${source}: ${String(err)}`);
            }
          }
          if (ids.length > 0) attachmentIds = ids;
        }

        binderLog(
          verbose,
          `deliver: reply to ${isDm ? "DM" : "group"} ${apiPeerId}, replyTo=${replyTo}, attachments=${attachmentIds?.length ?? 0}`,
        );
        await postBinderMessage({
          account,
          groupId: apiPeerId,
          parentMessageId: replyTo,
          content: payload.text ?? "",
          isDm,
          attachmentIds,
        });
        target.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] Binder ${info.kind} reply failed: ${String(err)}`,
        );
        binderError(verbose, `deliver onError: kind=${info.kind}, err=${String(err)}`);
      },
      onSkip: (reason) => {
        binderLog(verbose, "onSkip: reply skipped, reason=", reason);
      },
      onReplyStart: () => {
        binderLog(verbose, "onReplyStart: reply generation started");
      },
      onIdle: () => {
        binderLog(verbose, "onIdle: dispatcher idle");
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
