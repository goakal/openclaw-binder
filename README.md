# OpenClaw Binder Channel Plugin

Chat with your AI assistant from Binder group chats via @mentions.

> **For users:** Paste one of these prompts to your OpenClaw agent to set up Binder.
>
> Each prompt is deliberately **one single line**. Some agent CLIs treat every
> newline in a paste as "send", which would split the prompt into half a dozen
> half-messages — keep it on one line when you copy it.
>
> **Have a Binder account** (owner token from account settings):
>
> ```
> Connect yourself to Binder — a group-chat app — so my groups can talk to you by @mentioning your bot. Owner token: <your-owner-token-from-binder-account-settings>. Binder API URL: https://api.heybinder.com. Setup: install the plugin from https://github.com/goakal/openclaw-binder and follow its binder-channel-setup skill. How to work with me during setup, overriding your defaults: tell me in plain words what Binder is and show the 5-step plan as a checklist (✅ done / ⏳ doing / 🔲 todo / 🙋 needs me) before running anything, and update it after every step; no raw command output, JSON, or jargon — one plain sentence per error; mark which steps are yours and which are mine; pick the bot's name and handle yourself and keep going — never ask me to choose between options you haven't actually tried; if a step fails twice, STOP retrying and give me 2–3 options with your recommendation and exactly what to click; never show me tokens or secrets; when everything works, tell me the bot's @handle and how to @mention it in a group; end every message with "Next, I will …" or "I need you to …".
> ```
>
> **No Binder account yet** (register first, then claim via a link — no token needed):
>
> ```
> Connect yourself to Binder — a group-chat app — so I can talk to you by @mentioning your bot. Binder API URL: https://api.heybinder.com. I don't have a Binder account yet, so install the plugin from https://github.com/goakal/openclaw-binder and follow its binder-channel-setup skill, registering WITHOUT an owner token. The registration response includes a claim_url — show it to me in full, exactly as returned: it is not a secret, so never mask, shorten, or star out any part of the code, or the link won't work. How to work with me during setup, overriding your defaults: tell me in plain words what Binder is and show the plan as a checklist before running anything, and update it after every step; no raw command output, JSON, or jargon — one plain sentence per error; pick the bot's name and handle yourself and keep going — never ask me to choose between options you haven't actually tried; if a step fails twice, STOP retrying and give me 2–3 options with your recommendation and exactly what to click; never show me tokens or secrets; end every message with "Next, I will …" or "I need you to …".
> ```
>
> The agent reads this document, installs the plugin, registers your bot, configures the channel, and walks you through the parts only you can do (like adding the bot to a group). In the no-account flow it also hands you a `claim_url` to finish setup.

## What this is

A thin [OpenClaw](https://openclaw.ai) channel plugin that bridges Binder group chats to your AI agent:

- **Webhook ingress** — receives signed webhook events (HMAC-SHA256) from Binder when someone @mentions the bot
- **Reply pipeline** — hands messages to OpenClaw's LLM reply pipeline and sends responses back via `POST /api/bots/v1/incoming`
- **Multi-account** — one gateway can serve multiple Binder bots (different groups, different usernames)
- **Images both ways** — user images arrive as agent media context; the agent's media replies are uploaded and attached automatically

**Key design:** The plugin is intentionally thin. Capabilities are discovered live from the Binder backend catalog (`GET /api/bots/v1/skills`) — no plugin release needed when Binder adds new tool families. Two bundled skills handle setup and discovery.

The catalog says what the backend *can* do; it does not say how the agent *should* do it from here. Where the plugin implements a capability natively (sending media, reading inbound media, `@`-mentions), the agent uses the native path instead of the raw endpoint — see the "Native path vs catalog tools" section in `skills/binder/SKILL.md`.

## Bundled skills

| Skill | Role | File |
|---|---|---|
| `binder-channel-setup` | Install plugin, register bot, configure channel, verify reachability | `skills/binder-channel-setup/SKILL.md` |
| `binder` | Capability discovery — fetch live tool catalog from backend | `skills/binder/SKILL.md` |

Both skills load automatically when the plugin is enabled. No ClawHub or npm needed.

## Quick install

### Option A: Prebuilt release (recommended)

```bash
VERSION=$(curl -sL https://api.github.com/repos/goakal/openclaw-binder/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -sLO "https://github.com/goakal/openclaw-binder/releases/download/$VERSION/binder-${VERSION#v}.tgz"
openclaw plugins install ./binder-${VERSION#v}.tgz
openclaw gateway restart
```

### Option B: Source install (enables self-patch)

```bash
git clone https://github.com/goakal/openclaw-binder.git
cd openclaw-binder
npm install
npm run build
openclaw plugins install --link ./openclaw-binder
openclaw gateway restart
```

Source install compiles against your local OpenClaw SDK. If an SDK update breaks imports, `npm run build` detects it early and the skill's self-patch section guides repair.

## Bootstrap flow (what the agent does)

After you paste the prompt above, the agent presents this 5-step plan and keeps a running checklist:

| # | Step | Who | Under the hood |
|---|------|-----|----------------|
| 1 | Install the Binder plugin | Agent | Download latest .tgz, `openclaw plugins install` |
| 2 | Register your bot | Agent | `POST {apiUrl}/api/bots/v1` — with your owner token (linked immediately), or without one (returns a `claim_url` for you to claim it) |
| 3 | Make the gateway reachable | Agent (+ you if a tunnel tool must be installed) | Detect localhost/NAT, set up cloudflared / Tailscale Funnel / reverse proxy, `PATCH` callback URL |
| 4 | Connect and verify | Agent | Write `channels.binder.accounts.default.*` config, restart gateway, `verify-callback` ping, `channels status` |
| 5 | Add the bot to a group and say hi | **You** | Open Binder, invite `@<bot>.ai`, @mention it |

If the agent gets blocked (most commonly step 3 — no public URL), it stops, explains the problem in plain words, and offers options instead of retrying silently. See the **owner communication protocol** at the top of `skills/binder-channel-setup/SKILL.md`.

### Register another bot

With the plugin already installed, just say:

```
Register another Binder agent. Owner token: <token>
```

No docs URL needed — the `binder-channel-setup` skill is already resident.

## Requirements

- OpenClaw >= 2026.5.6
- Binder backend with bot API enabled
- Gateway reachable via **public HTTPS** (or tunnel — see skill doc for ngrok/cloudflared/Tailscale guidance)

## Config reference

```bash
openclaw config set channels.binder.accounts.<id>.apiUrl "https://your-binder.com"
openclaw config set channels.binder.accounts.<id>.botId "<from-registration>"
openclaw config set channels.binder.accounts.<id>.token "<from-registration>"
openclaw config set channels.binder.accounts.<id>.webhookSecret "<from-registration>"
openclaw config set channels.binder.accounts.<id>.botUsername "<@handle-without-@>"
openclaw config set channels.binder.accounts.<id>.webhookPath "/binder"
openclaw config set channels.binder.accounts.<id>.enabled true
```

| Key | Description |
|---|---|
| `apiUrl` | Binder instance URL |
| `botId` | Bot ID from `POST /api/bots/v1` response |
| `token` | Bearer token (shown once on creation) |
| `webhookSecret` | HMAC secret (shown once on creation) |
| `botUsername` | Bot @handle without `@` |
| `webhookPath` | Webhook endpoint path (default: `/binder`) |
| `enabled` | Enable this account |

## Self-maintenance

See the **Self-patch** section in `skills/binder-channel-setup/SKILL.md` for detailed instructions. TL;DR:

1. Plugin has 13 subpath imports from `openclaw/plugin-sdk/*` across 7 source files
2. SDK bumps may rename/reorganize these — `npm run build` catches it
3. Skill doc has a repair procedure: discover host SDK exports → map broken paths → rebuild
4. Full port takes ~15 minutes per SDK break

## Project structure

```
openclaw-binder/
├── skills/
│   ├── binder-channel-setup/SKILL.md   # Transport setup skill
│   └── binder/SKILL.md                 # Capability discovery skill
├── src/
│   ├── accounts.ts                     # Account resolution
│   ├── api.ts                          # Binder API calls (outbound + ping)
│   ├── channel.ts                      # ChannelPlugin definition
│   ├── log.ts                          # Conditional logger
│   ├── monitor.ts                      # Webhook ingress handler
│   ├── runtime.ts                      # Plugin runtime store
│   └── types.config.ts                 # Config type
├── index.ts                            # Plugin entry
├── setup-entry.ts                      # Setup CLI entry
├── openclaw.plugin.json                # Plugin manifest
├── package.json
└── tsconfig.json
```

## License

MIT
