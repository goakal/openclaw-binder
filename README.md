# OpenClaw Binder Channel Plugin

Chat with your AI assistant from Binder group chats via @mentions.

> **For users:** Paste this prompt to your OpenClaw agent to set up Binder:
>
> ```
> Set up Binder on my OpenClaw gateway.
> Install plugin from https://github.com/goakal/openclaw-binder (download latest .tgz, openclaw plugins install, gateway restart).
> Then use the binder-channel-setup skill to register.
> Owner token: <your-owner-token-from-binder-account-settings>
> Binder API URL: https://api.heybinder.com
> ```
>
> The agent reads this document, installs the plugin, registers your bot, and configures the channel.

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

After you paste the prompt above, the agent:

1. Reads this guide
2. Installs the plugin (Option A or B)
3. Resolves the Binder API URL (your provided URL or default `https://binder.openclaw.ai`)
4. Checks if your gateway is **publicly reachable** from Binder — if behind NAT/localhost, guides through tunnel setup
5. Registers a bot via `POST {apiUrl}/api/bots/v1` with owner token
6. Writes channel config (`channels.binder.accounts.default.*`)
7. Restarts the gateway
8. Verifies with `openclaw channels status`
9. Confirms setup is complete

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
