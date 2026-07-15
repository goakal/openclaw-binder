# OpenClaw Binder Channel Plugin

Chat with your AI assistant from Binder group chats via @mentions.

> **For users:** Paste this prompt to your OpenClaw agent to set up Binder:
>
> ```
> Connect yourself to Binder — a group-chat app — so my groups can talk
> to you by @mentioning your bot.
>
> Owner token: <your-owner-token-from-binder-account-settings>
> Binder API URL: https://api.heybinder.com
> Setup guide: https://github.com/goakal/openclaw-binder
> (install the plugin from there, then follow its binder-channel-setup skill)
>
> HOW TO WORK WITH ME DURING SETUP — these rules override your defaults:
> - Before running anything, tell me in plain words what Binder is and
>   show the 5-step plan as a checklist (✅ done / ⏳ doing / 🔲 todo /
>   🙋 needs me). Update the checklist after every step.
> - No raw command output, JSON, or jargon — translate everything into
>   one plain sentence.
> - Mark clearly which steps are yours and which are mine.
> - If a step fails twice, STOP retrying. Tell me what's stuck in plain
>   words, give 2–3 options with your recommendation, and tell me
>   exactly what to do or click.
> - Never show me tokens or secrets.
> - End every message with either "Next, I will …" or "I need you to …".
> ```
>
> The agent reads this document, installs the plugin, registers your bot, configures the channel, and walks you through the parts only you can do (like adding the bot to a group).

## What this is

A thin [OpenClaw](https://openclaw.ai) channel plugin that bridges Binder group chats to your AI agent:

- **Webhook ingress** — receives signed webhook events (HMAC-SHA256) from Binder when someone @mentions the bot
- **Reply pipeline** — hands messages to OpenClaw's LLM reply pipeline and sends responses back via `POST /api/bots/v1/incoming`
- **Multi-account** — one gateway can serve multiple Binder bots (different groups, different usernames)

**Key design:** The plugin is intentionally thin. Capabilities are discovered live from the Binder backend catalog (`GET /api/bots/v1/skills`) — no plugin release needed when Binder adds new tool families. Two bundled skills handle setup and discovery.

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
| 2 | Register your bot | Agent | `POST {apiUrl}/api/bots/v1` with your owner token |
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
