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

Set up this OpenClaw gateway to receive Binder @mention events and send replies.

**Agent flow:**
1. Resolve env details (API URL, owner token) — present plan to user for confirmation
2. Register bot on Binder backend
3. Install the `@openclaw/binder` plugin on the gateway
4. If gateway not publicly reachable — set up tunnel
5. Update bot's `callback_url` to point at gateway
6. Verify end-to-end webhook delivery
7. Write channel config + restart + verify

Once configured, the `binder` bundled skill handles capability discovery from the **live backend catalog** — no per-family skill updates needed.

## When to use

- "Set up Binder on my OpenClaw gateway"
- "Register me a Binder bot"
- "Install the Binder plugin"
- "Update binder plugin" or "Upgrade binder plugin"
- User provides a Binder `owner_token`

## Prerequisites

- OpenClaw gateway running (`openclaw gateway status`)
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

### Step 2: Present plan to user

Before doing anything, summarize what you're about to do and show the user:

```
I'll register a new Binder bot with:
  - Name: <generated-name>
  - Username: <generated-username>.ai
  - API URL: <api-url>
  - Owner token: <masked>
  
Then install the binder plugin on this gateway and
configure the channel.

Proceed? (y/n)
```

Wait for user to confirm before continuing.

### Step 3: Register the bot with Binder

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

### Step 4: Install the plugin

Install the `@openclaw/binder` plugin on the gateway. See **Installation options** above for prebuilt .tgz or source install.

```bash
openclaw plugins list | grep binder
```

If plugin not listed, run install steps from the **Installation options** section.

### Step 5: Set up public URL if needed

Check if gateway has a public HTTPS URL Binder can reach:

```bash
# Is there an explicit remote URL?
openclaw config get gateway.remote.url

# Or check local bind
openclaw config get gateway.bind
openclaw config get gateway.port
```

If the gateway is on `127.0.0.1` (localhost) or a private IP, Binder cannot reach it. Use the **Public URL** section below to set up a tunnel. After tunnel is running, the public URL becomes your `callback_url`.

### Step 6: Update the bot's callback URL

Registration step already set `callback_url`. If you set up a tunnel after registration, update it:

```bash
# PATCH the bot to set/update callback_url
curl -s -X PATCH "${API_URL}/api/bots/v1/${BOT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -d "{\"callback_url\": \"${PUBLIC_URL}/binder\"}"
```

> Use `owner_token` auth here, not the bot token.

### Step 7: Configure the channel

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

> **Why configure before verify:** The plugin needs the bot's `webhookSecret` to verify inbound webhook HMAC signatures. Without it, the ping check would fail with `404 Not Found` or `invalid signature`.

### Step 8: Restart gateway

```bash
openclaw gateway restart
```

### Step 9: Verify end-to-end delivery

Plugin is now installed, configured, and the gateway is running. Verify Binder can reach the `callback_url` and the plugin responds correctly. This sends a signed `ping` event and waits for the plugin to echo back a nonce:

```bash
curl -s -X POST "${API_URL}/api/bots/v1/verify-callback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -d "{\"url\": \"${PUBLIC_URL}/binder\"}"
```

**Response — reachable:**
```json
{ "reachable": true, "latency_ms": 45 }
```

**Response — unreachable:**
```json
{ "reachable": false, "error": "connection_refused", "latency_ms": 2000 }
```

If unreachable, check:
- Tunnel/proxy is running
- `callback_url` matches the tunnel URL + `/binder`
- Gateway restarted after config change
- Channel config has correct `webhookSecret`

### Step 10: Verify channel health

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

### Step 11: Test with a @mention

After everything is green, test by @mentioning `@<botUsername>` in a Binder group chat. The agent should receive the message and reply.

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

## Public URL (Webhook-only)

Binder webhooks require a **public HTTPS endpoint** reachable from the internet. The OpenClaw gateway listens on `127.0.0.1:18789` by default (loopback). Pick the option that fits your use case.

### Option A: Cloudflare Tunnel

Production-ready with proper setup. Two modes:

**Quick mode (testing):** Ephemeral random URL. Good for initial setup, dies when process stops.

```bash
cloudflared tunnel --url http://localhost:18789
```

**Persistent mode (production):** Stable URL, survives restarts.

```bash
# 1. Login
cloudflared tunnel login

# 2. Create named tunnel
cloudflared tunnel create binder-webhook

# 3. Create config.yml:
# tunnel: binder-webhook
# credentials-file: /home/user/.cloudflared/binder-webhook.json
# ingress:
#   - hostname: binder-webhook.yourdomain.com
#     service: http://localhost:18789
#   - service: http_status:404

# 4. Route DNS
cloudflared tunnel route dns binder-webhook binder-webhook.yourdomain.com

# 5. Install as service
cloudflared service install

# 6. Start
sudo systemctl start cloudflared
```

Your public URL: `https://binder-webhook.yourdomain.com/binder`

### Option B: Tailscale Funnel (persistent, recommended for ongoing use)

Requires [Tailscale](https://tailscale.com) installed and logged in. Persistent HTTPS URL tied to your tailnet node. Survives restarts.

```bash
# Expose only the webhook path:
tailscale funnel --bg --set-path /binder http://127.0.0.1:18789/binder
```

Your public URL: `https://<node-name>.<tailnet>.ts.net/binder`

### Option C: Reverse Proxy (production)

Use if you have a domain and reverse proxy (Caddy, nginx, Traefik). Full control, persistent, production-grade.

```caddy
your-domain.com {
    reverse_proxy /binder* localhost:18789
}
```

Set `callback_url` to `https://your-domain.com/binder`.

> **Keep loopback:** Leave gateway bound to `127.0.0.1`. The tunnel or proxy handles external access. Do not change to `0.0.0.0`.

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
