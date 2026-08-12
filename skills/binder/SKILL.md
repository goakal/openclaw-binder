---
name: binder
description: "Discover Binder capabilities from the live backend catalog, then use the plugin-native path or a bot-authenticated HTTP route the adapter actually supports."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧰",
        "requires": { "bins": ["curl"] },
      },
  }
---

# Binder Capability Discovery

Binder exposes tool capabilities via a **live catalog** at the backend. This skill tells you how to discover and use them.

**Key principle:** Any tool family deployed on the Binder backend is discoverable here. Discovery is not execution: use it only when this plugin has a native path or the family documents a bot-authenticated HTTP route this harness can call.

**Second key principle:** the catalog is written for a *generic* agent talking raw HTTP to Binder. You are not one — you are running behind this channel plugin, which already implements some of those capabilities natively. **When a capability is handled natively, use the native path.** See [Native path vs catalog tools](#native-path-vs-catalog-tools) before reaching for a `binderr_*` tool.

## When to use

- User asks to use any Binder capability (notes, groups, memory, course, etc.)
- User invokes `/schedule` or asks for a reminder, recurring message, or digest
- User says "What can my Binder bot do?"
- A Binder family is mentioned but you don't have a specific tool skill for it
- You need to call `binderr_*` tools

## Prerequisites

- Binder channel plugin installed and configured (`binder-channel-setup` skill)
- Bot is active (channel status shows ✅)

## Native path vs catalog tools

The live catalog stays the source of truth for **what the backend can do**. It is
not the source of truth for **how you should do it from here**.

The catalog documents raw HTTP endpoints for an agent with no Binder integration.
This plugin already wires several of those capabilities into OpenClaw's normal
message pipeline, with the credentials, target ids, retries and server-side caps
handled for you. Hand-rolling the HTTP call instead duplicates that work and
usually fails on ids you don't have in scope.

**Rule: if the plugin handles it natively, prefer native. Reach for a `binderr_*`
tool when there is no native equivalent — or when you are calling Binder from
outside this plugin.**

| Capability | Native here? | What to do |
|---|---|---|
| Reply with text | ✅ | Just reply. The plugin posts it. |
| Send an image / video | ✅ | Attach the media to your reply as usual. The plugin uploads it and links it to the message. Do **not** call the `attachments` family or the presigned-upload endpoints. |
| Read an image the user sent | ✅ | It is already in your context — viewable media is handed to you directly, other files appear as `[attachment: name url]`. No fetch tool, no download step. |
| Notify a group member | ✅ | Write `@username` in the reply text (see below). |
| Scheduled chats | ✅ | Use `binderr_schedule_message` / `binderr_list_scheduled_messages` / `binderr_cancel_scheduled_message`. They are plugin-native and keep credentials and the current group out of model arguments. |
| Notes, groups, memory, and every other family | ❌ | Use the catalog tools. |
| Edit a message you already sent | ❌ (not wired yet) | Use the `messages` family from the catalog. |

The table is a snapshot; the principle is what matters. When a family shows up in
the catalog that overlaps something you can already do as part of sending or
receiving a message, the native path wins.

## Capability discovery workflow

### Step 1: Fetch the family catalog

All available tool families. Bot-authenticated, returns what this bot can use.

```bash
curl -s "${BOT_API_URL}/api/bots/v1/skills" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}"
```

**Response shape:**
```json
{
  "version": 1,
  "skills": [
    {
      "id": "notes",
      "title": "Bot Notes",
      "description": "Create, read, update, and delete notes in a group.",
      "toolCount": 6,
      "docUrl": "/api/bots/v1/skills/notes"
    }
  ]
}
```

> **Live:** This list reflects exactly what the backend has. A new family (e.g. `course`) appears here the moment it deploys — no plugin release, no skill dir to write.

### Step 2: Fetch a family's detailed tools

Each family returns a Markdown document with tool names, parameters, constraints,
errors, and worked HTTP requests.

```bash
curl -s "${BOT_API_URL}/api/bots/v1/skills/notes" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}"
```

Read the returned Markdown before acting; its **Example request** is the wire
contract for that family.

### Step 3: Execute only supported routes

Tools use the `binderr_` prefix, but this channel plugin does **not** dynamically register every catalog entry as an OpenClaw function tool. Prefer the native paths above. Otherwise follow the detailed family's bot-authenticated HTTP example from trusted harness-side code.

```bash
# Example pattern only; use the method/path/body from the family document.
curl -s "${BOT_API_URL}/api/bots/v1/<documented-path>" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}"
```

If the family only points at a logged-in v3 route, it is not executable from
this webhook adapter. Never substitute the owner's browser session or claim
that fetching the catalog performed the action.

### Step 4: Extract credentials from channel config

For trusted harness-side HTTP calls, resolve the configured values without
printing them into chat or logs:

```bash
openclaw config get channels.binder.accounts.default.apiUrl
openclaw config get channels.binder.accounts.default.botId
openclaw config get channels.binder.accounts.default.token  # secret: never echo
```

Or for a specific account:
```bash
openclaw config get channels.binder.accounts.<accountId>.apiUrl
openclaw config get channels.binder.accounts.<accountId>.botId
openclaw config get channels.binder.accounts.<accountId>.token
```

## Usage examples

### "Create a note with my Binder bot"

1. Fetch catalog: notes family is available
2. Fetch `/skills/notes` for tool params
3. Follow `binderr_create_note`'s worked HTTP request with the current group,
   title, and body
4. The plugin delivers the reply via webhook

### "What tools do I have?"

```bash
curl -s "${API_URL}/api/bots/v1/skills" -H "Authorization: Bearer ${TOKEN}" -H "X-Bot-ID: ${BOT_ID}"
```

Summarize each entry in the response's `skills` array: title, description, and
`toolCount`.

### "Manage groups"

1. Fetch `/skills/groups` for the `binderr_groups_*` tools
2. Follow the selected tool's worked HTTP request and required parameters

### "/schedule remind us tomorrow at 09:00"

1. Resolve the time in the requesting user's timezone; ask only if the time is
   genuinely ambiguous.
2. Call `binderr_schedule_message`. Choose `announce` for fixed text or
   `agent_task` when the agent should execute the instruction at fire time.
3. Read the returned description, timezone, recurrence, and id back to the
   user.
4. Use `binderr_list_scheduled_messages` before review/cancellation, and
   `binderr_cancel_scheduled_message` to stop one.

These are native plugin tools backed by Binder's bot-authenticated scheduling
routes. Jobs appear in Binder's Scheduled Messages screen. OpenClaw cron is a
separate option for private/internal gateway jobs the agent chooses to run.

## Reference: current Binder tool families

| Family | Description | Tool prefix |
|--------|-------------|-------------|
| notes | Group notes CRUD | `binderr_notes_*` |
| groups | Group management | `binderr_groups_*` |
| memory | Agent memory | `binderr_memory_*` |
| scheduling | Scheduled messages (native tools are registered by this plugin) | `binderr_*scheduled*` |

> **Note:** This table is informational. Always fetch the live catalog — the backend is the source of truth for what exists. Unlisted families (e.g. `course`, `reactions`) work identically once deployed; no skill update required. A family being in the catalog does not mean calling it by hand is the right move here — check [Native path vs catalog tools](#native-path-vs-catalog-tools) first.

## How it works

The `@openclaw/binder` plugin implements the Binder channel. When the plugin receives a webhook event:

1. Verifies HMAC-SHA256 signature
2. Accepts mentions, direct messages, and published `command_invoked` events
3. Converts Binder slash commands to model-visible instructions (so OpenClaw's own slash parser cannot consume them)
4. Strips the `@botUsername` mention from ordinary message content
5. Hands clean message to OpenClaw's reply pipeline (dispatch + LLM generation)
6. Sends the reply back via `POST /api/bots/v1/incoming`

The tool catalog (`GET /api/bots/v1/skills`) is served by the Binder backend from `src/modules/agent-tools/registry`. Any family registered there is immediately discoverable.

## Images and attachments

Both directions are handled by the plugin — see
[Native path vs catalog tools](#native-path-vs-catalog-tools).

**Receiving.** When a user sends an image, it reaches you as media you can
actually look at. Non-viewable files arrive as a
`[attachment: name (type) url]` line instead. The `url` is public — fetch it
with a plain GET if you need the bytes; never send the bot token to it.

A message can be **attachment-only**: empty text with an image is a real turn,
not an empty one. Answer it.

**Sending.** Attach the media to your reply the normal way. The plugin uploads
it as the bot and links it to the message you send. Limits enforced by Binder:

- Types: `image/jpeg`, `image/png`, `video/mp4`, `video/quicktime`, `video/webm`
- Max 100 MB per file, max 10 attachments per message
- A caption is optional — media with no text is allowed

## Mentioning group members

In a **group** reply you can notify a member by writing `@username` in your
reply content — no special tool, just the text. The backend parses it, links
the mention, and sends that member a push notification.

- Only **active members of that group** can be mentioned. An `@handle` that
  isn't a current member is left as plain text (no link, no notification).
- There is a per-message cap on how many members one reply may mention, so
  don't try to `@`-notify the whole group — it will be truncated.
- This applies to group replies only; it has no effect in a 1-on-1 direct
  message.

## Related

- `binder-channel-setup` — install plugin and configure channel (must be done first)
- `binder` backend API docs — served at `{apiUrl}/docs/agents/`
