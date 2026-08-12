import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BINDER_PUBLISHED_COMMANDS, formatBinderCommandInvocation, isProcessableBinderEvent, } from "./commands.js";
test("publishes only commands the adapter documents", () => {
    assert.deepEqual(BINDER_PUBLISHED_COMMANDS.map((command) => command.name), ["schedule", "help"]);
});
test("routes Binder command webhooks through the message pipeline", () => {
    assert.equal(isProcessableBinderEvent("command_invoked"), true);
    assert.equal(isProcessableBinderEvent("ping"), false);
    assert.equal(isProcessableBinderEvent("unknown_future_event"), false);
});
test("turns a Binder slash command into model-visible text", () => {
    const body = formatBinderCommandInvocation({
        command: { name: "schedule", args: "remind us tomorrow at 9" },
        fallbackBody: "/schedule remind us tomorrow at 9",
        groupId: "group-123",
    });
    assert.equal(body.startsWith("/"), false);
    assert.match(body, /Binder slash command \/schedule/);
    assert.match(body, /remind us tomorrow at 9/);
    assert.match(body, /binderr_schedule_message/);
    assert.match(body, /group-123/);
});
test("keeps the message when an older payload has no command block", () => {
    assert.equal(formatBinderCommandInvocation({
        fallbackBody: "/legacy argument",
        groupId: "group-123",
    }), "/legacy argument");
});
