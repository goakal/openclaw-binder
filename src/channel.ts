import { buildComputedAccountStatusSnapshot } from "openclaw/plugin-sdk/status-helpers";
import { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
import { createScopedChannelConfigBase } from "openclaw/plugin-sdk/channel-config-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { getChatChannelMeta } from "openclaw/plugin-sdk/core";
import { runPassiveAccountLifecycle } from "openclaw/plugin-sdk/channel-lifecycle";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  listBinderAccountIds,
  resolveBinderAccount,
  resolveDefaultBinderAccountId,
  type ResolvedBinderAccount,
} from "./accounts.js";
import { postBinderMessage, probeBinderToken, uploadBinderMedia } from "./api.js";
import {
  monitorBinderProvider,
  resolveBinderWebhookPath,
} from "./monitor.js";

const meta = getChatChannelMeta("binder");

// Cache last incoming message ID per group so `message` tool replies always have a parent
const lastMessageIdByGroup = new Map<string, string>();
export function setBinderLastMessageId(groupId: string, messageId: string): void {
  lastMessageIdByGroup.set(groupId, messageId);
}
function getBinderLastMessageId(groupId: string): string | undefined {
  return lastMessageIdByGroup.get(groupId);
}

const binderConfigBase = createScopedChannelConfigBase<ResolvedBinderAccount>({
  sectionKey: "binder",
  listAccountIds: listBinderAccountIds,
  resolveAccount: (cfg, accountId) => resolveBinderAccount({ cfg, accountId }),
  defaultAccountId: resolveDefaultBinderAccountId,
  clearBaseFields: ["apiUrl", "botId", "token", "webhookSecret", "botUsername", "webhookPath", "verbose"],
});

export const binderPlugin: ChannelPlugin<ResolvedBinderAccount> = {
  id: "binder",
  meta: { ...meta },
  capabilities: {
    chatTypes: ["group", "direct"],
    reactions: false,
    media: true,
    threads: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  messaging: {
    targetPrefixes: ["binder"],
    normalizeTarget: (raw: string): string | undefined => {
      const trimmed = raw?.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(/^binder:/i, "");
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
        return normalized;
      }
      return undefined;
    },
    targetResolver: {
      hint: "Binder group ID (UUID)",
      looksLikeId: (raw: string, normalized?: string): boolean => {
        const check = normalized ?? raw ?? "";
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          check.replace(/^binder:/i, "")
        );
      },
      resolveTarget: async ({
        cfg,
        accountId,
        input,
        normalized,
        preferredKind,
      }: {
        cfg: unknown;
        accountId?: string | null;
        input: string;
        normalized?: string;
        preferredKind?: string;
      }) => {
        const raw = normalized?.trim() || input?.trim();
        if (!raw) return null;
        const groupId = raw.replace(/^binder:/i, "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
          return null;
        }
        return {
          to: groupId,
          kind: "group" as const,
          display: groupId,
        };
      },
    },
    resolveDeliveryTarget: ({ conversationId, parentConversationId }: { conversationId: string; parentConversationId?: string | null }) => {
      const groupId = conversationId?.trim();
      if (!groupId) return null;
      return { to: groupId };
    },
    resolveSessionTarget: ({ id }: { id: string }) => {
      const groupId = id?.trim();
      if (!groupId) return undefined;
      return groupId;
    },
    parseExplicitTarget: ({ raw }: { raw: string }) => {
      const trimmed = raw?.trim() ?? "";
      const groupId = trimmed.replace(/^binder:/i, "");
      if (!groupId) return null;
      return { to: groupId, chatType: "group" as const };
    },
    inferTargetChatType: () => "group" as const,
  },
  reload: { configPrefixes: ["channels.binder"] },
  config: {
    ...binderConfigBase,
    isConfigured: (account) =>
      Boolean(
        account.config.apiUrl?.trim() &&
          account.config.botId?.trim() &&
          account.config.token?.trim() &&
          account.config.webhookSecret?.trim() &&
          account.config.botUsername?.trim(),
      ),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(
        account.config.apiUrl?.trim() &&
          account.config.botId?.trim() &&
          account.config.token?.trim() &&
          account.config.webhookSecret?.trim(),
      ),
      apiUrl: account.config.apiUrl,
      botId: account.config.botId,
      botUsername: account.config.botUsername,
      webhookPath: account.config.webhookPath,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    validateInput: ({ input }) => {
      const i = input as {
        apiUrl?: string;
        botId?: string;
        token?: string;
        webhookSecret?: string;
        botUsername?: string;
        verbose?: boolean;
      };
      if (!i.apiUrl?.trim()) return "Binder requires --api-url (e.g. https://binder.example.com)";
      if (!i.botId?.trim()) return "Binder requires --bot-id";
      if (!i.token?.trim()) return "Binder requires --token (bearer token)";
      if (!i.webhookSecret?.trim()) return "Binder requires --webhook-secret (from bot creation response)";
      if (!i.botUsername?.trim()) return "Binder requires --bot-username (the bot's @handle)";
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const i = input as {
        apiUrl?: string;
        botId?: string;
        token?: string;
        webhookSecret?: string;
        botUsername?: string;
        webhookPath?: string;
        name?: string;
        verbose?: boolean;
      };
      const section = (cfg.channels as Record<string, unknown>)?.["binder"] ?? {};
      const accounts = ((section as Record<string, unknown>)?.["accounts"] as Record<string, unknown>) ?? {};
      const effectiveAccountId = normalizeAccountId(accountId);
      const patch: Record<string, unknown> = {};
      if (i.apiUrl?.trim()) patch["apiUrl"] = i.apiUrl.trim();
      if (i.botId?.trim()) patch["botId"] = i.botId.trim();
      if (i.token?.trim()) patch["token"] = i.token.trim();
      if (i.webhookSecret?.trim()) patch["webhookSecret"] = i.webhookSecret.trim();
      if (i.botUsername?.trim()) patch["botUsername"] = i.botUsername.trim();
      if (i.webhookPath?.trim()) patch["webhookPath"] = i.webhookPath.trim();
      if (i.name?.trim()) patch["name"] = i.name.trim();
      if (i.verbose !== undefined) patch["verbose"] = i.verbose;

      return {
        ...cfg,
        channels: {
          ...(cfg.channels as Record<string, unknown>),
          binder: {
            ...section,
            accounts: {
              ...accounts,
              [effectiveAccountId]: {
                ...((accounts[effectiveAccountId] as Record<string, unknown>) ?? {}),
                ...patch,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  outbound: {
    deliveryMode: "gateway",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return { ok: false, error: new Error("Binder target is required (group ID or binder:groupId)") };
      }
      // Strip binder: prefix if present; bare UUIDs pass through
      const normalized = trimmed.replace(/^binder:/i, "");
      if (!normalized) {
        return { ok: false, error: new Error("Invalid Binder target") };
      }
      return { ok: true, to: normalized };
    },
    sendText: async ({ cfg, to, text, accountId, replyToId }) => {
      const account = resolveBinderAccount({ cfg, accountId });
      const rawTo = to?.trim() ?? "";
      const groupId = rawTo.replace(/^binder:/i, "");
      if (!groupId) {
        throw new Error("Binder sendText: missing target group_id (to)");
      }
      // Binder API requires parent_message_id for every message; fall back to last seen
      const parentMessageId = (replyToId as string | undefined)?.trim() || getBinderLastMessageId(groupId) || "";
      await postBinderMessage({ account, groupId, parentMessageId, content: text });
      return { channel: "binder", messageId: parentMessageId || groupId };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, mediaReadFile, accountId, replyToId }) => {
      const account = resolveBinderAccount({ cfg, accountId });
      const rawTo = to?.trim() ?? "";
      const groupId = rawTo.replace(/^binder:/i, "");
      if (!groupId) {
        throw new Error("Binder sendMedia: missing target group_id (to)");
      }
      if (!mediaUrl) {
        throw new Error("Binder sendMedia: missing mediaUrl");
      }
      // Binder API requires parent_message_id for every message; fall back to last seen
      const parentMessageId = (replyToId as string | undefined)?.trim() || getBinderLastMessageId(groupId) || "";
      const attachmentId = await uploadBinderMedia({
        account,
        groupId,
        source: mediaUrl,
        readFile: mediaReadFile,
      });
      await postBinderMessage({
        account,
        groupId,
        parentMessageId,
        content: text ?? "",
        attachmentIds: [attachmentId],
      });
      return { channel: "binder", messageId: parentMessageId || groupId };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    probeAccount: async ({ account }) => probeBinderToken(account),
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      const base = buildComputedAccountStatusSnapshot({
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: Boolean(account.config.apiUrl?.trim() && account.config.token?.trim() && account.config.webhookSecret?.trim()),
        runtime,
        probe,
      });
      return base;
    },
    buildChannelSummary: ({ snapshot, account }) => ({
      configured: snapshot.configured ?? false,
      apiUrl: account?.config?.apiUrl ?? null,
      botId: account?.config?.botId ?? null,
      botUsername: account?.config?.botUsername ?? null,
      webhookPath: account ? resolveBinderWebhookPath({ account }) : null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const statusSink = createAccountStatusSink({
        accountId: account.accountId,
        setStatus: ctx.setStatus,
      });

      ctx.log?.info(`[${account.accountId}] starting Binder webhook listener`);
      statusSink({
        running: true,
        lastStartAt: Date.now(),
        webhookPath: resolveBinderWebhookPath({ account }),
      });

      await runPassiveAccountLifecycle({
        abortSignal: ctx.abortSignal,
        start: async () =>
          monitorBinderProvider({
            account,
            config: ctx.cfg,
            runtime: ctx.runtime,
            abortSignal: ctx.abortSignal,
            statusSink,
          }),
        stop: async (unregister) => {
          unregister?.();
        },
        onStop: async () => {
          statusSink({ running: false, lastStopAt: Date.now() });
        },
      });
    },
  },
};
