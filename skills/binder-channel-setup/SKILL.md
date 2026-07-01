---
name: binder-channel-setup
description: "Install the Binder channel plugin and register this OpenClaw gateway as a Binder bot via owner token. One-time transport setup; multi-account supported."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔌",
        "requires": { "bins": ["curl"] },
      },
  }
---

# Binder Channel Setup

Configure this OpenClaw gateway to receive Binder @mention events and send replies. This skill:

1. Installs the `@openclaw/binder` plugin (if not installed)
2. Registers a bot on the Binder backend with `owner_token`
3. Writes the channel config (`channels.binder.accounts.<id>`)
4. Sets the bot's `callback_url` to this gateway's public webhook endpoint
5. Verifies the channel is healthy

Once configured, the `binder` bundled skill handles capability discovery from the **live backend catalog** — no per-family skill updates needed.

## When to use

- "Set up Binder on my OpenClaw gateway"
- "Register me a Binder bot"
- "Install the Binder plugin"
- "Update binder plugin" or "Upgrade binder plugin"
- User provides a Binder `owner_token`

## Prerequisites

- OpenClaw gateway running (`openclaw gateway status`)
- Gateway must be reachable via **public HTTPS URL** (see NAT guidance below)
- Binder backend `api_url` + valid `owner_token` (obtained from Binder account settings)

## Installation options

### Option A: Prebuilt release (primary, no build toolchain)

```bash
VERSION=$(curl -sL https://api.github.com/repos/goakal/openclaw-binder/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -sLO "https://github.com/goakal/openclaw-binder/releases/download/$VERSION/binder-${VERSION#v}.tgz"
openclaw plugins install ./binder-${VERSION#v}.tgz
```

### Option B: Source install (for self-maintenance; enables agent to patch SDK drift)

```bash
git clone https://github.com/goakal/openclaw-binder.git
cd openclaw-binder
npm install
npm run build         # compiles against local OpenClaw SDK — surfaces drift early
openclaw plugins install --link ./openclaw-binder
```

## Registration workflow

### Step 1: Resolve the Binder API URL

Check in order:
1. User-provided `api_url` or `Binder API URL` from prompt
2. Default: `https://api.heybinder.com`

If prompt includes `Binder API URL`, use it directly. Ask user if unsure.

### Step 2: Get the gateway URL (for callback)

```bash
# Check for explicit remote URL first
openclaw config get gateway.remote.url

# Fallback: local bind address + port
openclaw config get gateway.bind
openclaw config get gateway.port
```

If `gateway.remote.url` exists, use it directly. Otherwise construct:
```
<scheme>://<host>:<port>
```
Default port `18789`. Scheme is `https` if TLS enabled, else `http`.

**Important:** Binder needs an **HTTPS** callback URL the internet can reach. See NAT guidance below if the gateway is on localhost or a private IP.

### Step 3: Verify reachability from Binder

Before registering, check Binder can reach the gateway's callback URL. Skip this if the gateway explicitly has `gateway.remote.url` set (user already configured public access).

```bash
# Ping the gateway from Binder's perspective
curl -s -o /dev/null -w "%{http_code}" \
  "https://binder.openclaw.ai/api/bots/v1/ping-url" \
  --data-urlencode "url=${GATEWAY_URL}/health"
```

Or just Binder's generic webhook verification endpoint:

```bash
# Ask Binder to check reachability
curl -s "${API_URL}/api/bots/v1/check-reachability" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${GATEWAY_URL}/binder\"}"
```

If the OpenClaw instance is behind NAT/localhost/private network, the reachability check fails:

```
Response: {"reachable": false, "error": "connection refused"}
```

**What to do when unreachable:**

1. Tell user: "Your OpenClaw gateway needs a public HTTPS URL for Binder webhooks."
2. Guide through NAT tunnel setup (see NAT section below).
3. After tunnel is running, get the public URL and update `${GATEWAY_URL}`.
4. Re-run reachability check. **Do not proceed until reachable.**

**If you cannot find a reachability endpoint on the Binder backend, use a simpler check:**

```bash
# Test callback URL resolves publicly — catch DNS + port issues
curl -s --connect-timeout 5 "${GATEWAY_URL}/health" 2>&1 || echo "UNREACHABLE"
```

This checks from *the gateway's own perspective* (not Binder's), so it only catches gateway-down issues. The real check is whether Binder can reach it. If you're unsure, **assume unreachable** and guide through NAT tunnel setup.

### Step 4: Register the bot with Binder

```bash
curl -s -X POST "${API_URL}/api/bots/v1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -d '{
    "name": "<agent-given-name>",
    "username": "<agent-given-username>.ai",
    "callback_url": "<gateway-public-url>/binder"
  }'
```

**Required fields:**
- `name` — human-friendly bot name (e.g. "My OpenClaw")
- `username` — unique handle, must end in `.ai` (e.g. "my-openclaw.ai"). The `.ai` suffix is mandatory — Binder reserves it for AI agents.
- `callback_url` — where Binder sends webhook events. Must be **public HTTPS** + resolves to this gateway. Path should be `/binder` (matches plugin default webhook path).

**Success response (201):**
```json
{
  "bot": {
    "id": "uuid-here",
    "name": "My OpenClaw",
    "username": "my-openclaw.ai",
    "owner_id": "..."
  },
  "token": "binder_bot_abc123...",
  "webhook_secret": "whsec_xyz789..."
}
```

Save these for the next step:
- `bot.id` → `botId`
- `bot.username` → `botUsername`
- `token` (shown once)
- `webhook_secret` (shown once)

> **Security:** The `token` and `webhook_secret` are returned only at creation. Store them immediately in config. Never echo them to the user.

**Error responses:**
- `409` — username already taken. Pick a different `username`.
- `401` — invalid or expired `owner_token`.
- `400` — missing/invalid fields.

### Step 5: Configure the channel

```bash
openclaw config set channels.binder.accounts.default.apiUrl "${API_URL}"
openclaw config set channels.binder.accounts.default.botId "<bot.id>"
openclaw config set channels.binder.accounts.default.token "<token>"
openclaw config set channels.binder.accounts.default.webhookSecret "<webhook_secret>"
openclaw config set channels.binder.accounts.default.botUsername "<bot.username>"
openclaw config set channels.binder.accounts.default.webhookPath "/binder"
openclaw config set channels.binder.accounts.default.enabled true
```

The `default` account works for single-bot setups. For multi-account, use a different `<id>` (e.g. `work`, `personal`) in place of `default`.

### Step 6: Restart gateway

```bash
openclaw gateway restart
```

### Step 7: Verify channel health

```bash
openclaw channels status
```

Look for:
```
binder  default  ✅  running  apiUrl=${API_URL}  botUsername=my-openclaw.ai  webhookPath=/binder
```

If status shows ❌ or `stopped`, check:
- Config values match registration response exactly
- Gateway restarted after config changes
- Webhook `callback_url` matches `gatewayUrl + webhookPath`

### Step 8: Test with a @mention

After verification, test by @mentioning `@<botUsername>` in a Binder group chat. The agent should receive the message and reply.

## Register another Binder agent (multi-account)

Plugin supports multiple Binder accounts on one gateway. Each gets its own bot, config entry, and webhook path.

```bash
# Register new bot (Step 3 with different username)
curl -s -X POST "${API_URL}/api/bots/v1" -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -d '{"name": "...", "username": "<unique>.ai", "callback_url": "<gateway-url>/binder-2"}'

# Configure under a different account ID
openclaw config set channels.binder.accounts.second.botId "<bot.id>"
openclaw config set channels.binder.accounts.second.token "<token>"
openclaw config set channels.binder.accounts.second.webhookSecret "..."
openclaw config set channels.binder.accounts.second.botUsername "..."
openclaw config set channels.binder.accounts.second.apiUrl "${API_URL}"
openclaw config set channels.binder.accounts.second.webhookPath "/binder-2"
openclaw config set channels.binder.accounts.second.enabled true

openclaw gateway restart
```

**Important:** Each account must use a **different webhook path** so the gateway can route inbound webhooks correctly. The `callback_url` must match the webhook path.

## NAT / public URL guidance

If the gateway is behind NAT or on localhost, Binder cannot reach the `callback_url` directly.

### Option: Cloudflare Tunnel (recommended)

```bash
cloudflared tunnel --url http://localhost:18789
```

### Option: ngrok

```bash
ngrok http 18789 --scheme https
```

### Option: Tailscale Funnel

```bash
tailscale funnel --bg 18789
```

Set the `callback_url` to the tunnel's public HTTPS URL + `/binder`. The tunnel must stay running for webhooks to work.

> **Tunnel tip:** The `callback_url` must be the **tunnel URL**, not the gateway's internal address. Update config `webhookPath` if the tunnel uses a different path prefix.

## Troubleshooting

### Plugin not found after install

```bash
openclaw plugins list
```

If `binder` not listed, re-run install. For source install (`--link`), verify the repo dir still exists and `dist/` is built.

### Channel status shows ❌ / stopped

```bash
# Check logs
openclaw logs binder
```

Common causes:
- `apiUrl` points at wrong backend
- `token` or `webhook_secret` mistyped (they are long random strings)
- Gateway not restarted after config change
- Another plugin registered the same webhook path

### Webhook returns 401 / invalid signature

- `webhook_secret` in config must match what `POST /api/bots/v1` returned
- `callback_url` path and `webhookPath` in config must match
- `token` must be live (not rotated on backend)

### Binder API unreachable

```bash
curl -s "${API_URL}/api/bots/v1/ping"
```

If the ping endpoint doesn't respond, Binder may be down or the URL is wrong.

## Self-patch (plugin SDK drift)

The `@openclaw/binder` plugin imports from `openclaw/plugin-sdk/*` subpaths. When OpenClaw updates its SDK, imports may break. This is expected — the plugin is intentionally thin (~7 source files, ~13 subpath imports).

### How to detect breakage

```bash
# For source installs:
cd openclaw-binder
npm run build

# For .tgz installs, check OpenClaw logs for load errors:
openclaw logs binder | grep -i "import\|plugin\|error"
```

**If `npm run build` fails with import errors**, the plugin needs import path updates:

### Repair procedure

1. **Discover the current SDK exports** in the host OpenClaw installation:

```bash
# Find the SDK module
find /usr/lib/node_modules/openclaw -name "package.json" -path "*/plugin-sdk/*" -maxdepth 5 2>/dev/null
# or
npm explore openclaw -- cat node_modules/openclaw/plugin-sdk/exports.json 2>/dev/null
# or if openclaw is globally installed
ls $(dirname $(which openclaw))/../lib/node_modules/openclaw/plugin-sdk/ 2>/dev/null
```

2. **Map broken imports** by checking each `openclaw/plugin-sdk/*` subpath used in `src/` files:

Files with SDK imports:
- `src/monitor.ts` — `channel-reply-options-runtime`, `webhook-ingress`, `inbound-envelope`, `config-contracts`
- `src/channel.ts` — `status-helpers`, `channel-lifecycle`, `channel-config-helpers`, `account-id`, `core`, `channel-core`, `config-contracts`
- `src/accounts.ts` — `account-helpers`, `account-id`, `config-contracts`
- `src/runtime.ts` — `runtime-store`, `plugin-runtime`

3. **For each broken import**, update the path to match the host SDK's current exports. The exports are typically `openclaw/plugin-sdk/<module-name>`.

4. **Rebuild and reinstall**:

```bash
cd openclaw-binder
npm install      # may update peerDep resolution
npm run build
openclaw plugins install ./openclaw-binder
openclaw gateway restart
```

### When to upstream

If the import changes are mechanical (renamed paths, same exports), apply them locally. If the SDK's public API contract changed (different function signatures, removed exports), open an issue at `https://github.com/goakal/openclaw-binder` or submit a PR.

The thin plugin design means a full port takes ~15 minutes once the SDK changes are understood.

## Update plugin

Update to latest release when a new version is available.

```bash
# Get latest version
VERSION=$(curl -sL https://api.github.com/repos/goakal/openclaw-binder/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
VERSION=${VERSION#v}

# Download
curl -sLO "https://github.com/goakal/openclaw-binder/releases/download/v${VERSION}/binder-${VERSION}.tgz"

# Install (replaces old version)
openclaw plugins install ./binder-${VERSION}.tgz

# Restart
openclaw gateway restart

# Verify upgrade
openclaw plugins list | grep binder
openclaw channels status
```

For source installs, `git pull` then rebuild:
```bash
cd openclaw-binder
git pull origin main
npm install
npm run build
openclaw plugins install --link ./openclaw-binder
openclaw gateway restart
```

> **Note:** The plugin is at `github.com/goakal/openclaw-binder`, not in OpenClaw's official plugin registry. Always download from GitHub releases.

## Related skills

- `binder` — capability discovery: fetches available tools from the live Binder backend catalog. No per-family skill updates needed.
