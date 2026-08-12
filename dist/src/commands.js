/** Slash commands this adapter can actually route and fulfil. */
export const BINDER_PUBLISHED_COMMANDS = [
    {
        name: "schedule",
        description: "Create, review, or cancel scheduled Binder messages",
    },
    {
        name: "help",
        description: "Show what this Binder agent can do and how to ask",
    },
];
const PROCESSABLE_BINDER_EVENTS = new Set([
    "message_created",
    "command_invoked",
    "direct_message",
]);
export function isProcessableBinderEvent(event) {
    return PROCESSABLE_BINDER_EVENTS.has(event);
}
/**
 * Turn a Binder-native command event into an ordinary agent instruction.
 *
 * OpenClaw reserves leading-slash input for its own command parser. Passing
 * `/schedule ...` through as CommandBody can therefore consume the Binder
 * command before the model sees it. This phrasing preserves the user's intent
 * and arguments without pretending the command came from OpenClaw itself.
 */
export function formatBinderCommandInvocation(params) {
    const name = params.command?.name?.trim().replace(/^\//, "");
    if (!name)
        return params.fallbackBody;
    const args = params.command?.args?.trim();
    const target = params.groupId
        ? ` The current Binder group id is ${params.groupId}.`
        : "";
    const directive = name === "schedule"
        ? " Use the Binder-native binderr_schedule_message, binderr_list_scheduled_messages, and binderr_cancel_scheduled_message tools; list first before cancelling."
        : name === "help"
            ? " Explain the Binder capabilities this OpenClaw adapter actually supports."
            : "";
    if (!args) {
        return `The user invoked your Binder slash command /${name}. Handle that command.${directive}${target}`;
    }
    const punctuatedArgs = /[.!?]$/.test(args) ? args : `${args}.`;
    return `The user invoked your Binder slash command /${name}. Handle that command with these arguments: ${punctuatedArgs}${directive}${target}`;
}
