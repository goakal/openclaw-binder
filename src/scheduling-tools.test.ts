import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";

import {
  BINDER_SCHEDULING_TOOL_NAMES,
  createBinderSchedulingTools,
  setBinderSessionGroupId,
} from "./scheduling-tools.js";

const config = {
  channels: {
    binder: {
      accounts: {
        default: {
          apiUrl: "https://api.heybinder.com",
          botId: "bot-1",
          token: "secret",
        },
        second: {
          apiUrl: "https://api.heybinder.com",
          botId: "bot-2",
          token: "secret-2",
        },
      },
    },
  },
} as never;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("registers native scheduling tools only in a Binder group turn", () => {
  const tools = createBinderSchedulingTools({
    config,
    deliveryContext: {
      channel: "binder",
      accountId: "default",
      to: "group:11111111-1111-4111-8111-111111111111",
    },
  });

  assert.deepEqual(
    tools?.map((tool) => tool.name),
    BINDER_SCHEDULING_TOOL_NAMES,
  );
  assert.equal(createBinderSchedulingTools({
    config,
    deliveryContext: {
      channel: "binder",
      accountId: "default",
      to: "dm:11111111-1111-4111-8111-111111111111",
    },
  }), null);
});

test("uses the trusted group and account for a Binder thread", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({
      data: {
        id: "schedule-1",
        kind: "AGENT_ANNOUNCE",
        status: "SCHEDULED",
        content: "Stand-up",
      },
    }), { status: 200 });
  };

  setBinderSessionGroupId(
    "session-1",
    "22222222-2222-4222-8222-222222222222",
    "second",
  );
  const tools = createBinderSchedulingTools({
    config,
    sessionKey: "session-1",
    deliveryContext: {
      channel: "binder",
      to: "thread:33333333-3333-4333-8333-333333333333",
    },
  });

  assert.equal(tools?.length, 3);
  const createTool = tools?.find(
    (tool) => tool.name === "binderr_schedule_message",
  );
  assert.ok(createTool);
  await createTool.execute("call-1", {
    content: "Stand-up",
    schedule: {
      repeat: "daily",
      starts_at: "2026-08-13T09:00",
    },
  });

  assert.equal(
    request?.url,
    "https://api.heybinder.com/api/bots/v1/groups/22222222-2222-4222-8222-222222222222/scheduled-messages",
  );
  assert.equal(
    (request?.init?.headers as Record<string, string>)["X-Bot-ID"],
    "bot-2",
  );
});
