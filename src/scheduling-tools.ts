import type {
  AnyAgentTool,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/core";
import { jsonResult } from "openclaw/plugin-sdk/core";
import { Type } from "typebox";

import { resolveBinderAccount } from "./accounts.js";
import {
  cancelBinderScheduledMessage,
  createBinderScheduledMessage,
  listBinderScheduledMessages,
  type BinderScheduleWire,
} from "./api.js";

export const BINDER_SCHEDULING_TOOL_NAMES = [
  "binderr_schedule_message",
  "binderr_list_scheduled_messages",
  "binderr_cancel_scheduled_message",
] as const;

const binderContextBySession = new Map<
  string,
  { groupId: string; accountId?: string }
>();
const MAX_TRACKED_SESSIONS = 2_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remember the trusted group id before dispatching an inbound turn. Thread
 * delivery contexts contain the thread id, which is not accepted by Binder's
 * group-scoped scheduling endpoint.
 */
export function setBinderSessionGroupId(
  sessionKey: string,
  groupId: string,
  accountId?: string,
): void {
  if (binderContextBySession.size >= MAX_TRACKED_SESSIONS) {
    const oldest = binderContextBySession.keys().next().value;
    if (typeof oldest === "string") binderContextBySession.delete(oldest);
  }
  binderContextBySession.set(sessionKey, { groupId, accountId });
}

function resolveGroupId(ctx: OpenClawPluginToolContext): string | null {
  if (ctx.sessionKey) {
    const trusted = binderContextBySession.get(ctx.sessionKey);
    if (trusted) return trusted.groupId;
  }

  const raw = ctx.deliveryContext?.to?.trim() ?? "";
  if (/^dm:/i.test(raw) || /^thread:/i.test(raw)) return null;
  const candidate = raw.replace(/^(binder:|group:)/i, "");
  return UUID.test(candidate) ? candidate : null;
}

function resolveToolTarget(ctx: OpenClawPluginToolContext): {
  account: ReturnType<typeof resolveBinderAccount>;
  groupId: string;
} | null {
  const messageChannel =
    ctx.deliveryContext?.channel ??
    ctx.messageChannel;
  if (messageChannel?.toLowerCase() !== "binder") return null;
  const cfg =
    ctx.getRuntimeConfig?.() ??
    ctx.runtimeConfig ??
    ctx.config;
  const groupId = resolveGroupId(ctx);
  if (!cfg || !groupId) return null;

  const account = resolveBinderAccount({
    cfg,
    accountId:
      ctx.deliveryContext?.accountId ??
      (ctx.sessionKey
        ? binderContextBySession.get(ctx.sessionKey)?.accountId
        : undefined) ??
      ctx.agentAccountId,
  });
  if (
    !account.enabled ||
    !account.config.apiUrl?.trim() ||
    !account.config.botId?.trim() ||
    !account.config.token?.trim()
  ) {
    return null;
  }
  return { account, groupId };
}

const Weekday = Type.Union([
  Type.Literal("MO"),
  Type.Literal("TU"),
  Type.Literal("WE"),
  Type.Literal("TH"),
  Type.Literal("FR"),
  Type.Literal("SA"),
  Type.Literal("SU"),
]);

const Schedule = Type.Object(
  {
    repeat: Type.Union([
      Type.Literal("never"),
      Type.Literal("daily"),
      Type.Literal("weekly"),
    ]),
    starts_at: Type.String({
      description:
        "Local date-time with no offset, for example 2026-08-30T19:00.",
    }),
    interval: Type.Optional(Type.Integer({ minimum: 1, maximum: 52 })),
    by_weekday: Type.Optional(Type.Array(Weekday)),
    ends_at: Type.Optional(
      Type.Union([
        Type.String({
          description: "Optional local end date-time with no offset.",
        }),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);

const CreateScheduleParams = Type.Object(
  {
    content: Type.String({
      minLength: 1,
      description:
        "Exact text for announce mode, or the instruction to execute at fire time for agent_task mode.",
    }),
    mode: Type.Optional(
      Type.Union([
        Type.Literal("announce"),
        Type.Literal("agent_task"),
      ]),
    ),
    timezone: Type.Optional(
      Type.String({
        description:
          "IANA timezone such as Asia/Jakarta. Omit to use the Binder owner's timezone.",
      }),
    ),
    schedule: Schedule,
  },
  { additionalProperties: false },
);

const ListScheduleParams = Type.Object(
  {
    filter: Type.Optional(
      Type.Union([
        Type.Literal("all"),
        Type.Literal("once"),
        Type.Literal("repeated"),
        Type.Literal("sent"),
      ]),
    ),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

const CancelScheduleParams = Type.Object(
  {
    scheduled_message_id: Type.String({
      minLength: 1,
      description: "Id returned by binderr_list_scheduled_messages.",
    }),
  },
  { additionalProperties: false },
);

/**
 * Native, credential-safe Binder scheduling tools. They are registered only
 * for a live Binder group turn and resolve account/target from trusted runtime
 * context instead of model-supplied ids or secrets.
 */
export function createBinderSchedulingTools(
  ctx: OpenClawPluginToolContext,
): AnyAgentTool[] | null {
  const target = resolveToolTarget(ctx);
  if (!target) return null;
  const { account, groupId } = target;

  return [
    {
      name: "binderr_schedule_message",
      label: "Schedule Binder Message",
      description:
        "Create a one-off or repeating message in the current Binder group. Use announce to post fixed text, or agent_task when the agent must do work at fire time. The schedule is visible in Binder.",
      parameters: CreateScheduleParams,
      execute: async (_toolCallId, rawParams) => {
        const params = rawParams as {
          content: string;
          mode?: "announce" | "agent_task";
          timezone?: string;
          schedule: BinderScheduleWire;
        };
        return jsonResult(await createBinderScheduledMessage({
          account,
          groupId,
          ...params,
        }));
      },
    },
    {
      name: "binderr_list_scheduled_messages",
      label: "List Binder Schedules",
      description:
        "List messages this agent has scheduled in the current Binder group. Use this before cancelling and when the user asks what is scheduled.",
      parameters: ListScheduleParams,
      execute: async (_toolCallId, rawParams) => {
        const params = rawParams as {
          filter?: "all" | "once" | "repeated" | "sent";
          limit?: number;
        };
        return jsonResult(await listBinderScheduledMessages({
          account,
          groupId,
          ...params,
        }));
      },
    },
    {
      name: "binderr_cancel_scheduled_message",
      label: "Cancel Binder Schedule",
      description:
        "Cancel one message this agent scheduled in the current Binder group. Confirm the id by listing schedules first.",
      parameters: CancelScheduleParams,
      execute: async (_toolCallId, rawParams) => {
        const params = rawParams as { scheduled_message_id: string };
        return jsonResult(await cancelBinderScheduledMessage({
          account,
          groupId,
          scheduledMessageId: params.scheduled_message_id,
        }));
      },
    },
  ];
}
