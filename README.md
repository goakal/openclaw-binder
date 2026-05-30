# OpenClaw Binder Channel Plugin

Chat with your AI assistant from [Binderr](https://github.com/your-org/binderr) group chats via @mentions.

## Install

### From release archive

```bash
# Download latest release
curl -LO https://github.com/your-org/openclaw-binderr/releases/latest/download/binder.tgz

# Install plugin
openclaw plugins install binder.tgz

# Restart gateway
openclaw gateway restart
```

### From source

```bash
git clone https://github.com/your-org/openclaw-binderr.git
openclaw plugins install --link ./openclaw-binderr
openclaw gateway restart
```

## Configure

```bash
openclaw config set channels.binder.enabled true
openclaw config set channels.binder.accounts.default.apiUrl "https://your-binderr.com"
openclaw config set channels.binder.accounts.default.botId "BOT_ID"
openclaw config set channels.binder.accounts.default.token "BOT_TOKEN"
openclaw config set channels.binder.accounts.default.botUsername "openclaw"
openclaw config set channels.binder.accounts.default.webhookPath "/binder"

openclaw gateway restart
```

### Config values

| Key | Description |
|---|---|
| `apiUrl` | Your Binderr instance URL |
| `botId` | Bot ID from Binderr (`POST /api/bots/v1` response) |
| `token` | Bot bearer token (shown once on creation). Also used to verify inbound webhook signatures. |
| `botUsername` | Bot's @handle without the `@` |
| `webhookPath` | Webhook endpoint path (default: `/binder`) |

## Setup Binderr webhook

Point the bot's callback URL to your OpenClaw gateway:

```
https://your-openclaw-host/binder
```

## Verify

```bash
openclaw channels status
```

Then test by typing `@openclaw hello` in a Binderr group chat.

## Requirements

- OpenClaw >= 2026.5.6
- Binderr backend with bot API enabled
