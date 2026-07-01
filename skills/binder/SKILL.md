---
name: binder
description: "Discover and use Binder capabilities from the live backend tool catalog. New tool families (notes, course, groups, etc.) are available automatically — no skill update needed."
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

**Key principle:** Any tool family deployed on the Binder backend is available here. The catalog is fetched live — no plugin release, no skill update, no per-family content to install.

## When to use

- User asks to use any Binder capability (notes, groups, memory, course, etc.)
- User says "What can my Binder bot do?"
- A Binder family is mentioned but you don't have a specific tool skill for it
- You need to call `binderr_*` tools

## Prerequisites

- Binder channel plugin installed and configured (`binder-channel-setup` skill)
- Bot is active (channel status shows ✅)

## Capability discovery workflow

### Step 1: Fetch the family catalog

All available tool families. Bot-authenticated, returns what this bot can use.

```bash
curl -s "${BOT_API_URL}/api/bots/v1/skills" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}"
```

**Response:**
```json
[
  {
    "id": "notes",
    "name": "Notes",
    "description": "Create, read, update, and delete group notes",
    "version": "1.0.0"
  },
  {
    "id": "groups",
    "name": "Groups",
    "description": "Group management and membership tools",
    "version": "1.0.0"
  }
]
```

> **Live:** This list reflects exactly what the backend has. A new family (e.g. `course`) appears here the moment it deploys — no plugin release, no skill dir to write.

### Step 2: Fetch a family's detailed tools

Each family has a detailed spec with tool names, parameters, and usage guidance.

```bash
curl -s "${BOT_API_URL}/api/bots/v1/skills/notes" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}"
```

**Response:**
```json
{
  "id": "notes",
  "name": "Notes",
  "tools": [
    {
      "name": "binderr_notes_create",
      "description": "Create a new note in a group",
      "parameters": {
        "group_id": { "type": "string", "required": true, "description": "Binder group ID" },
        "title": { "type": "string", "required": true, "description": "Note title" },
        "content": { "type": "string", "required": false, "description": "Note content (markdown)" }
      }
    },
    {
      "name": "binderr_notes_list",
      "description": "List notes in a group",
      "parameters": {
        "group_id": { "type": "string", "required": true }
      }
    }
  ]
}
```

The backend returns the full tool spec (Tool calling style) for each family.

### Step 3: Call the tools

Tools use the `binderr_` prefix. They are HTTP-based tools that call the Binder API with the bot's credentials.

```bash
# Pattern for call_bot_tool / generic tool-calling mechanism
# (Use the webhook-channel-enriched tool dispatch, not raw curl)
#
# The tools are callable via the Binder channel's tool dispatch.
# The `apiUrl`, `token`, and `botId` from channel config are used automatically.
#
# Example tool call (conceptual — the actual dispatch is handled by the channel):
# tool_use: { name: "binderr_notes_create", input: { group_id: "...", title: "...", content: "..." } }
```

### Step 4: Extract credentials from channel config

To call tools manually (e.g. via curl as a fallback), read the configured values:

```bash
openclaw config get channels.binder.accounts.default.apiUrl
openclaw config get channels.binder.accounts.default.botId
openclaw config get channels.binder.accounts.default.token
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
3. Call `binderr_notes_create` with group_id, title, content
4. The plugin delivers the reply via webhook

### "What tools do I have?"

```bash
curl -s "${API_URL}/api/bots/v1/skills" -H "Authorization: Bearer ${TOKEN}" -H "X-Bot-ID: ${BOT_ID}"
```

Summarize each family's name, description, and tool count.

### "Manage groups"

1. Fetch `/skills/groups` for the `binderr_groups_*` tools
2. Call the appropriate tool with required params

## Reference: current Binder tool families

| Family | Description | Tool prefix |
|--------|-------------|-------------|
| notes | Group notes CRUD | `binderr_notes_*` |
| groups | Group management | `binderr_groups_*` |
| memory | Agent memory | `binderr_memory_*` |

> **Note:** This table is informational. Always fetch the live catalog — the backend is the source of truth. Unlisted families (e.g. `course`, `reactions`) work identically once deployed; no skill update required.

## How it works

The `@openclaw/binder` plugin implements the Binder channel. When the plugin receives a webhook event:

1. Verifies HMAC-SHA256 signature
2. Strips the `@botUsername` mention from message content
3. Hands clean message to OpenClaw's reply pipeline (dispatch + LLM generation)
4. Sends the reply back via `POST /api/bots/v1/incoming`

The tool catalog (`GET /api/bots/v1/skills`) is served by the Binder backend from `src/modules/agent-tools/registry`. Any family registered there is immediately discoverable.

## Related

- `binder-channel-setup` — install plugin and configure channel (must be done first)
- `binder` backend API docs — served at `{apiUrl}/docs/agents/`
