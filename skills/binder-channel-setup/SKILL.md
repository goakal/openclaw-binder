---
name: binder-channel-setup
description: "Install the Binder channel plugin and register this OpenClaw gateway as a Binder bot via owner token. One-time transport setup; multi-account supported. Guides the owner step-by-step in plain language."
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

Connect this OpenClaw gateway to Binder — a group-chat app — so people in the owner's groups can talk to this agent by @mentioning it.

## READ THIS FIRST: how to communicate with your owner

Your owner is a person setting up an app, not an engineer reading logs. The setup only feels seamless if you narrate it well. These rules override your default reporting style:

1. **Send the Kickoff message BEFORE running any command** (template below). It explains what Binder is and shows the 5-step plan.
2. **After finishing each step, send the Progress checklist** (template below). Never skip it.
3. **Plain language only.** Never paste raw command output, JSON, or stack traces unless the owner asks. Translate errors into one plain sentence.
4. **Separate your work from the owner's work.** Steps 1–4 are yours. Step 5 is always the owner's. Some steps may need the owner mid-way (e.g. installing a tunnel tool, logging in) — when that happens, say exactly what to do or click.
5. **Bias to action.** After the Kickoff is confirmed, proceed on your own. Never ask the owner technical choices you can resolve yourself — e.g. do NOT ask which tunnel *tool* to use; check what's installed (`command -v cloudflared tailscale`) and pick one. Ask only when a step needs something only the owner has (an account login, a software install, a domain), after two failed attempts, or for a genuine product decision that outlives setup — currently exactly one: the temporary-vs-permanent tunnel question in Step 3.
6. **Two-strikes rule.** If the same step fails twice, STOP retrying. Send the Blocked message (template below): what's stuck in plain words, 2–3 options with a recommendation, and what you need from the owner. Never loop silently.
7. **End every message with exactly one of:** "Next, I will …" or "I need you to …".
8. **Never reveal secrets.** Do not echo `owner_token`, `token`, or `webhook_secret` to the owner or into chat logs. Refer to them as "your token" / "the bot's credentials".
9. **Retry in a dirty session: verify, don't remember.** If this setup was attempted before — in this conversation or an earlier one — do NOT trust conversation memory about what is done, what failed, or what the owner chose. Files, config, and this skill may all have changed since. Re-read this skill from disk, then verify actual state with commands:
   ```bash
   openclaw plugins list | grep binder
   openclaw config get channels.binder.accounts
   openclaw channels status
   ```
   Rebuild the checklist from what the commands show (✅ only what is verifiably done), continue from the first incomplete step, and re-attempt previously "stuck" steps fresh — a step that failed last time may work now.

### The 5 steps you present to the owner

| # | Step | Who does it |
|---|------|-------------|
| 1 | Install the Binder plugin on this gateway | Me (agent) |
| 2 | Register your bot on Binder | Me (agent) |
| 3 | Make this gateway reachable from the internet | Me — may need your help |
| 4 | Connect and verify everything works | Me (agent) |
| 5 | Add the bot to a group and say hi | You (owner) |

### Message templates

**Kickoff** (send first, before any command):

```
Binder is a group-chat app. I'm going to connect myself to it as a bot,
so people in your groups can talk to me by @mentioning me.

Here's the plan — 5 steps:
🔲 1. Install the Binder plugin on my gateway (me)
🔲 2. Register your bot on Binder (me)
🔲 3. Make my gateway reachable from the internet (me — I may need your help)
🔲 4. Connect and verify everything works (me)
🔲 5. You add the bot to a group and say hi (you)

I'd like to name the bot "<suggested name>" with the handle
@<suggested-username>.ai — reply "go" to accept, or tell me a
different name.

I need you to: confirm the name (or just say "go").
```

**Progress** (after each completed step):

```
✅ 1. Plugin installed
✅ 2. Bot registered as @<username>.ai
⏳ 3. Making my gateway reachable — working on it
🔲 4. Connect and verify
🔲 5. You add the bot to a group

Next, I will <one plain sentence>.
```

**Blocked** (after the same step fails twice):

```
⚠️ I'm stuck on step <N>: <one plain sentence, no jargon>.

Your options:
1. <option> (recommended — <why>)
2. <option>
3. <option, if any>

I need you to: <exact action — command to run, thing to install, or link to click>.
```

**Done** (after step 4 verifies green):

```
🎉 Setup complete — only your part is left.

✅ 1–4 done. Your bot @<username>.ai is live and connected.

🙋 5. Your turn:
   1. Open Binder (app or web)
   2. Go to any group chat (or create one)
   3. Add @<username>.ai as a member
   4. Send: "@<username>.ai hello!"

I'll reply in the group when your message arrives.
I need you to: do step 5 and tell me if I don't reply within a minute.
```

If the owner chose the temporary tunnel in Step 3, append to the Done message:

```
⏳ Reminder: your bot runs on a temporary link — it goes offline if
this machine or the tunnel restarts. Say "make it permanent" anytime
and I'll set up the stable link.
```

## When to use

- "Set up Binder on my OpenClaw gateway"
- "Register me a Binder bot"
- "Install the Binder plugin"
- "Update binder plugin" or "Upgrade binder plugin"
- User provides a Binder `owner_token`
- User has **no** Binder account/token yet and wants to get started (claim-link flow)
- A previous Binder setup attempt is visible in this conversation (finish it — see protocol rule 9: verify state, don't trust memory)

## Prerequisites

- OpenClaw gateway running (`openclaw gateway status`)
- Binder backend `api_url`
- Optionally a valid `owner_token` (from Binder account settings). **Not required** — without one, registration returns a `claim_url` you give the user to claim the bot (Step 2, Path B).

If either is missing, send a Blocked message telling the owner where to get it (owner token: Binder app → Account Settings → AI Agents).

---

# Technical runbook

Internal procedure for the 5 owner-visible steps. Report progress with the templates above; never dump these commands' output at the owner.

## Step 0: Resolve inputs + send Kickoff

Resolve the Binder API URL, in order:
1. User-provided `api_url` / `Binder API URL` from the prompt
2. Default: `https://api.heybinder.com`

Suggest a bot name + username (must end in `.ai`). Send the **Kickoff** template and wait for the owner's confirmation before continuing.

**Retry?** If a previous attempt is visible in this conversation, skip the full Kickoff: verify actual state first (protocol rule 9), then send a **Progress** checklist reflecting verified state and continue from the first incomplete step. Don't re-ask questions the owner already answered (bot name, chosen options) — but do re-verify everything the machine controls.

## Step 1: Install the plugin

Check first:

```bash
openclaw plugins list | grep binder
```

If already installed, mark step 1 ✅ and continue.

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

**If install fails twice** → Blocked message. Likely options: no network on gateway host, GitHub unreachable, OpenClaw version too old (needs >= 2026.5.6 — check `openclaw --version`).

## Step 2: Register the bot

There are two registration paths. **Pick based on whether the user gave you an `owner_token`:**

- **Have an owner token** (user copied a prompt from Binder account settings) → **Path A** (owned registration). Bot is linked to their account immediately.
- **No owner token** (user started from the Binder homepage; may not even have a Binder account yet) → **Path B** (claim-link registration). Register unclaimed, then hand the user a `claim_url` to finish setup.

#### Path A — with an owner token

```bash
curl -s -X POST "${API_URL}/api/bots/v1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<confirmed-name>",
    "username": "<confirmed-username>.ai",
    "callback_url": "<gateway-public-url>/binder",
    "owner_token": "'"${OWNER_TOKEN}"'"
  }'
```

#### Path B — no owner token (claim link)

Omit `owner_token` entirely. Do **not** send an empty string or a Bearer header.

```bash
curl -s -X POST "${API_URL}/api/bots/v1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<agent-given-name>",
    "username": "<agent-given-username>.ai",
    "callback_url": "<gateway-public-url>/binder"
  }'
```

The response includes `claim_code` **and** `claim_url` (in addition to `token` + `webhook_secret`). **Show the owner the `claim_url` verbatim and tell them to open it** to claim you into their Binder account — the link walks them through sign-up / log-in and a final confirm. You do **not** need their `owner_token`. Continue with Steps 3–4 in parallel; the bot works once claimed and reachable.

> **Auth:** this endpoint is **unauthenticated**. When present, the `owner_token` goes in the **request body**, not an `Authorization` header — a Bearer header is ignored, and the bot registers unclaimed anyway (returning a `claim_code` + `claim_url` instead of being linked to the account).

**Required fields:**
- `name` — human-friendly bot name (e.g. "My OpenClaw")
- `username` — unique handle, must end in `.ai`. The `.ai` suffix is mandatory — Binder reserves it for AI agents.
- `callback_url` — where Binder sends webhook events. Must be **public HTTPS**. If you don't have a public URL yet, register with your best guess and update it in Step 3 via PATCH.

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

Save these for Step 4:
- `bot.id` → `botId`
- `bot.username` → `botUsername`
- `token` (shown once)
- `webhook_secret` (shown once)

**Path B additionally returns** `claim_code` and `claim_url`. The `claim_url` is the one thing you DO show the owner (it is not a secret like `token`/`webhook_secret`) — present it and ask them to open it.

> **Security:** `token` and `webhook_secret` are returned only at creation. Store them immediately in config. Never echo them to the owner. (`claim_url` is safe to show — it's the owner's claim link.)

**Error handling (translate for the owner — don't paste JSON):**
- `409` — "That bot name is taken." Suggest 2 alternatives, ask owner to pick, retry. Does NOT count as a strike.
- `400` with an owner-token error — Blocked message: "Your Binder token isn't valid — it may have been regenerated. Please copy a fresh one from Binder → Account Settings → AI Agents and paste it here." (This route is unauthenticated, so a bad owner token is a `400`, not a `401`.)
- `400` for anything else — fix the request yourself (field format issue); counts as a strike.

## Step 3: Make the gateway reachable (the step that usually blocks)

Check whether the gateway already has a public HTTPS URL:

```bash
openclaw config get gateway.remote.url
openclaw config get gateway.bind
openclaw config get gateway.port
```

**Decision tree — follow it, do not loop:**

1. `gateway.remote.url` set and public HTTPS → use it. Done.
2. Bind is `127.0.0.1` / private IP (the default) → Binder **cannot** reach this gateway. A tunnel is required. Check what's available:
   ```bash
   command -v cloudflared; command -v tailscale
   ```
3. **A tunnel tool exists** → ask the owner ONE question before running it — temporary or permanent (template below). This is a real owner decision because it affects whether the bot survives a restart; it is NOT a safety question. Pick the tool yourself from what's installed — do not ask which tool, and do not ask permission to tunnel. A tunnel is safe: it creates an outbound connection to the tunnel provider, opens no inbound port, changes no firewall rule, and the gateway stays on loopback.

   ```
   My gateway needs a public link so Binder can reach it. Two ways:

   1. Quick temporary link (recommended to start) — works in seconds,
      no login needed. Downside: the link dies if this machine or the
      tunnel restarts, and the bot goes offline until I set it up again.
   2. Permanent link — survives restarts, the proper long-term setup.
      Needs a bit from you: <a Cloudflare login + a domain you own |
      a Tailscale login> — I'll walk you through it click by click,
      one step at a time.

   You can start with 1 now and I'll upgrade to 2 later.
   I need you to: pick 1 or 2.
   ```

   Then run the chosen mode (commands below). If the tunnel comes up, you have your public URL. Done.
4. **No tunnel tool installed, or tunnel fails twice** → STOP. This is not solvable alone: installing software and logging into tunnel accounts are owner decisions. Send a Blocked message like:

```
⚠️ I'm stuck on step 3: my gateway runs on this machine only, and Binder
(on the internet) has no way to reach it. I need a tunnel, and there's
no tunnel tool installed that I can use.

Your options:
1. Cloudflare Tunnel (recommended — free, quickest): install with
   <one-line install command for this OS>, then I'll handle the rest.
2. Tailscale Funnel (best if you already use Tailscale): install
   Tailscale and log in, then I'll expose only the webhook path.
3. You already have a domain + reverse proxy? Tell me the domain and
   I'll give you the exact proxy rule.

I need you to: pick an option (1, 2, or 3).
```

Never retry the same failing tunnel command more than twice. Never silently wait.

### Tunnel commands

**Cloudflare Tunnel — quick mode** (owner chose 1, temporary — ephemeral URL):

```bash
cloudflared tunnel --url http://localhost:18789
```

After it's up, remind the owner: "Heads-up: this is the temporary link — it dies if this machine or the tunnel restarts, and the bot goes offline until I recreate it. Say 'make it permanent' anytime and I'll upgrade it."

**Cloudflare Tunnel — persistent mode** (owner chose 2, permanent — stable URL, production):

Permanent setup mixes your work with the owner's. Rule for every owner touchpoint: pause, send ONE "I need you to" message with the exact link or command, say what they will see and what "done" looks like, then wait for their confirmation. One action per message — never a list of three things to go do.

*2a. Check prerequisites (ask, owner-only knowledge):*

```
For the permanent link I need a Cloudflare account with a domain added
to it (any domain you own works, even one you don't otherwise use).
I need you to: tell me the domain — or say "no domain" and I'll use
the Tailscale route instead (no domain needed).
```

If no domain and no Tailscale → fall back to the temporary tunnel and say why.

*2b. Authorize (owner does the browser part):* run `cloudflared tunnel login`, capture the URL it prints, then:

```
I need you to: open this link, log in to Cloudflare, click your domain
<domain>, then press "Authorize". Tell me "done" when the page says
you can close it.
→ <the URL cloudflared printed>
```

Wait for the owner. Verify `~/.cloudflared/cert.pem` now exists; if not, resend the link (counts toward two strikes).

*2c. You do the rest (no asking):*

```bash
cloudflared tunnel create binder-webhook
# write ~/.cloudflared/config.yml:
# tunnel: binder-webhook
# credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json
# ingress:
#   - hostname: binder-webhook.<domain>
#     service: http://localhost:18789
#   - service: http_status:404
cloudflared tunnel route dns binder-webhook binder-webhook.<domain>
```

*2d. Install as a service (may need the owner for sudo):* try `cloudflared service install && sudo systemctl start cloudflared`. If sudo needs a password you can't provide:

```
I need you to: run this one command in a terminal on this machine —
it installs the tunnel as a background service so it survives reboots:
  sudo cloudflared service install && sudo systemctl start cloudflared
Tell me "done" when it finishes.
```

*2e. Verify before moving on:* `curl -sI https://binder-webhook.<domain>` returns a response (any HTTP status — you're checking DNS + tunnel, the webhook path comes later). DNS can take a minute; retry twice with a short wait before calling it a failure.

Public URL: `https://binder-webhook.<domain>/binder`.

**Tailscale Funnel** (owner chose 2, permanent — survives restarts, no domain needed):

*T1. Check login:* `tailscale status`. If logged out, run `tailscale up`, capture the login URL it prints, and send:

```
I need you to: open this link and log in to Tailscale (create a free
account if you don't have one). Tell me "done" when it says success.
→ <the URL tailscale printed>
```

*T2. Start the funnel:*

```bash
tailscale funnel --bg --set-path /binder http://127.0.0.1:18789/binder
```

If the command prints an approval URL instead of starting (Funnel or HTTPS not yet enabled on the tailnet), send it to the owner the same way: "open this link and press Enable, tell me 'done'." Then re-run the command.

*T3. Verify:* `tailscale funnel status` shows the path, and `curl -sI https://<node-name>.<tailnet>.ts.net/binder` responds.

Public URL: `https://<node-name>.<tailnet>.ts.net/binder`.

**Reverse proxy** (owner has a domain):

```caddy
your-domain.com {
    reverse_proxy /binder* localhost:18789
}
```

Public URL: `https://your-domain.com/binder`.

> **Keep loopback:** Leave the gateway bound to `127.0.0.1`. The tunnel or proxy handles external access. Do not change to `0.0.0.0`.

### Update the bot's callback URL

If the public URL was obtained (or changed) after registration:

```bash
curl -s -X PATCH "${API_URL}/api/bots/v1/${BOT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}" \
  -d "{\"callback_url\": \"${PUBLIC_URL}/binder\"}"
```

> Use **bot auth** here (`Authorization: Bearer <token>` + `X-Bot-ID: <bot.id>`, both from the Step 2 registration response) — this route is wrapped in `BotAuthMiddleware`, not owner-token auth. `${BOT_TOKEN}` is the `token` returned at registration.

## Step 4: Connect and verify

### 4a. Write channel config

```bash
openclaw config set channels.binder.accounts.default.apiUrl "${API_URL}"
openclaw config set channels.binder.accounts.default.botId "<bot.id>"
openclaw config set channels.binder.accounts.default.token "<token>"
openclaw config set channels.binder.accounts.default.webhookSecret "<webhook_secret>"
openclaw config set channels.binder.accounts.default.botUsername "<bot.username>"
openclaw config set channels.binder.accounts.default.webhookPath "/binder"
openclaw config set channels.binder.accounts.default.enabled true
```

The `default` account works for single-bot setups. For multi-account, use a different `<id>` (e.g. `work`, `personal`).

> **Why configure before verify:** The plugin needs `webhookSecret` to verify inbound webhook HMAC signatures. Without it, the ping check fails with `404` or `invalid signature`.

### 4b. Restart gateway

```bash
openclaw gateway restart
```

### 4c. Verify end-to-end delivery

Sends a signed `ping` through Binder to the callback URL and waits for the plugin to echo a nonce:

```bash
curl -s -X POST "${API_URL}/api/bots/v1/verify-callback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}" \
  -d "{\"url\": \"${PUBLIC_URL}/binder\"}"
```

> Bot auth again (`BOT_TOKEN` + `X-Bot-ID`), same as the PATCH above.

Reachable: `{ "reachable": true, "latency_ms": 45 }` — continue.
Unreachable: `{ "reachable": false, "error": "connection_refused" }` — check in order: tunnel still running, `callback_url` matches tunnel URL + `/binder`, gateway restarted after config, `webhookSecret` correct. Two failed fix attempts → Blocked message.

### 4d. Verify channel health

```bash
openclaw channels status
```

Expect: `binder  default  ✅  running ...`. If ❌/stopped: check config values match the registration response exactly, gateway restarted, no other plugin on the same webhook path (`openclaw logs binder` for detail). Two failed fix attempts → Blocked message.

## Step 5: Hand over to the owner

Everything green → send the **Done** template. Step 5 is the owner's: open Binder, add `@<botUsername>` to a group, @mention it. When the first webhook arrives and your reply lands, confirm in chat.

---

## Register another Binder agent (multi-account)

Plugin supports multiple Binder accounts on one gateway. Each gets its own bot, config entry, and webhook path. Use the same owner-communication templates (the plan shrinks to steps 2, 4, 5 — plugin and tunnel already exist).

```bash
# Register new bot (Step 2 with different username)
curl -s -X POST "${API_URL}/api/bots/v1" -H "Content-Type: application/json" \
  -d '{"name": "...", "username": "<unique>.ai", "callback_url": "<gateway-url>/binder-2", "owner_token": "'"${OWNER_TOKEN}"'"}'

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

**Important:** Each account must use a **different webhook path** so the gateway can route inbound webhooks. The `callback_url` must match the webhook path.

## Troubleshooting

### Plugin not found after install

```bash
openclaw plugins list
```

If `binder` not listed, re-run install. For source install (`--link`), verify the repo dir still exists and `dist/` is built.

### Channel status shows ❌ / stopped

```bash
openclaw logs binder
```

Common causes:
- `apiUrl` points at wrong backend
- `token` or `webhook_secret` mistyped (long random strings)
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

If the ping endpoint doesn't respond, Binder may be down or the URL is wrong. Tell the owner in plain words and suggest checking the URL in their prompt.

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

3. **For each broken import**, update the path to match the host SDK's current exports (typically `openclaw/plugin-sdk/<module-name>`).

4. **Rebuild and reinstall**:

```bash
cd openclaw-binder
npm install
npm run build
openclaw plugins install ./openclaw-binder
openclaw gateway restart
```

### When to upstream

If the import changes are mechanical (renamed paths, same exports), apply them locally. If the SDK's public API contract changed (different signatures, removed exports), open an issue at `https://github.com/goakal/openclaw-binder` or submit a PR.

The thin plugin design means a full port takes ~15 minutes once the SDK changes are understood.

## Update plugin

```bash
VERSION=$(curl -sL https://api.github.com/repos/goakal/openclaw-binder/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
VERSION=${VERSION#v}
curl -sLO "https://github.com/goakal/openclaw-binder/releases/download/v${VERSION}/binder-${VERSION}.tgz"
openclaw plugins install ./binder-${VERSION}.tgz
openclaw gateway restart
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
