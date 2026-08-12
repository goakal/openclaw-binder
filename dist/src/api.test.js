import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { cancelBinderScheduledMessage, createBinderScheduledMessage, listBinderScheduledMessages, syncBinderCommands, } from "./api.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});
const account = {
    accountId: "default",
    config: {
        apiUrl: "https://api.heybinder.com/",
        botId: "bot-1",
        token: "secret",
        verbose: false,
    },
};
test("syncs the complete Binder command list with bot auth", async () => {
    let request;
    globalThis.fetch = async (input, init) => {
        request = { url: String(input), init };
        return new Response(JSON.stringify({
            commands: [{ name: "schedule" }, { name: "help" }],
        }), { status: 200 });
    };
    await syncBinderCommands(account);
    assert.equal(request?.url, "https://api.heybinder.com/api/bots/v1/commands");
    assert.equal(request?.init?.method, "PUT");
    assert.equal((request?.init?.headers)["X-Bot-ID"], "bot-1");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
        commands: [
            {
                name: "schedule",
                description: "Create, review, or cancel scheduled Binder messages",
            },
            {
                name: "help",
                description: "Show what this Binder agent can do and how to ask",
            },
        ],
    });
});
test("fails setup when Binder reads back a different command registry", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ commands: [{ name: "schedule" }] }), { status: 200 });
    await assert.rejects(syncBinderCommands(account), /command sync mismatch/);
});
test("creates, lists, and cancels Binder-native scheduled messages", async () => {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        requests.push({ url: String(input), init });
        const method = init?.method ?? "GET";
        if (method === "POST") {
            return new Response(JSON.stringify({
                data: {
                    id: "schedule-1",
                    kind: "AGENT_TASK",
                    status: "SCHEDULED",
                    content: "Prepare the digest",
                },
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    const created = await createBinderScheduledMessage({
        account,
        groupId: "group-1",
        content: "Prepare the digest",
        mode: "agent_task",
        timezone: "Asia/Jakarta",
        schedule: {
            repeat: "weekly",
            starts_at: "2026-08-14T09:00",
            by_weekday: ["FR"],
        },
    });
    await listBinderScheduledMessages({
        account,
        groupId: "group-1",
        filter: "repeated",
    });
    await cancelBinderScheduledMessage({
        account,
        groupId: "group-1",
        scheduledMessageId: created.id,
    });
    assert.equal(created.id, "schedule-1");
    assert.deepEqual(requests.map((request) => request.init?.method ?? "GET"), ["POST", "GET", "DELETE"]);
    assert.match(requests[0].url, /groups\/group-1\/scheduled-messages$/);
    assert.match(requests[1].url, /filter=repeated/);
    assert.match(requests[2].url, /scheduled-messages\/schedule-1$/);
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
        content: "Prepare the digest",
        mode: "agent_task",
        timezone: "Asia/Jakarta",
        schedule: {
            repeat: "weekly",
            starts_at: "2026-08-14T09:00",
            by_weekday: ["FR"],
        },
    });
});
