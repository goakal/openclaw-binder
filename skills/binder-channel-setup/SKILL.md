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

## What this skill covers, and what it doesn't

Registering a bot, getting a public URL, the webhook contract and the connection check are the same on every agent framework, and Binder documents them itself. This skill does **not** repeat them — a copy here would drift out of date the moment the platform changed, and it did: the webhook headers were renamed once and every copy had to be found by hand.

So **fetch the setup guide before Step 2 and keep it open**:

```bash
curl -s "${API_URL}/docs/agents/setup-guide.md"
```

This skill covers what the guide cannot know: how the plugin is installed on this gateway, where the credentials go in gateway config, how the gateway serves the webhook route, and how to restart it. Where a step is in the guide, this file says so and tells you what is different here.

The owner-communication rules below are **not** in that category. They are how you behave for the whole setup, they come from the owner, and they stay here.

## READ THIS FIRST: how to communicate with your owner

Your owner is a person setting up an app, not an engineer reading logs. The setup only feels seamless if you narrate it well. These rules override your default reporting style:

1. **Send the Kickoff message BEFORE running any command** (template below). It explains what Binder is and shows the 5-step plan.
2. **After finishing each step, send the Progress checklist** (template below). Never skip it.
3. **Plain language only.** Never paste raw command output, JSON, or stack traces unless the owner asks. Translate errors into one plain sentence.
4. **Separate your work from the owner's work.** Steps 1–4 are yours. Step 5 is always the owner's. Some steps may need the owner mid-way (e.g. installing a tunnel tool, logging in) — when that happens, say exactly what to do or click.
5. **Bias to action.** After the Kickoff is confirmed, proceed on your own. Never ask the owner technical choices you can resolve yourself — e.g. do NOT ask which tunnel *tool* to use; check what's installed (`command -v cloudflared tailscale`) and pick one. Ask only when a step needs something only the owner has (an account login, a software install, a domain), after two failed attempts, or for a genuine product decision that outlives setup — currently exactly one: the temporary-vs-permanent tunnel question in Step 3.
6. **Two-strikes rule.** If the same step fails twice, STOP retrying. Send the Blocked message (template below): what's stuck in plain words, 2–3 options with a recommendation, and what you need from the owner. Never loop silently.
7. **End every message with exactly one of:** "Next, I will …" or "I need you to …".
8. **Never reveal secrets.** Do not echo `owner_token`, `token`, or `webhook_secret` to the owner or into chat logs. Refer to them as "your token" / "the bot's credentials". **`claim_url` and `claim_code` are NOT secrets** — they are the owner's own claim link, useless to anyone else, and the only way they can finish setup. Print the `claim_url` in full, exactly as returned, on its own line. Never redact, mask, shorten, or replace part of the code with `***` or `…`. A masked link is a broken link: if what you printed is not complete and clickable, print it again.
9. **Retry in a dirty session: verify, don't remember.** If this setup was attempted before — in this conversation or an earlier one — do NOT trust conversation memory about what is done, what failed, or what the owner chose. Files, config, and this skill may all have changed since. Re-read this skill from disk, re-fetch the setup guide, then verify actual state with commands:
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

I'm registering it as "<chosen name>" with the handle
@<chosen-username>.ai — tell me any time if you want a
different name and I'll change it.

Next, I will install the plugin on my gateway.
```

Announce the name, don't ask for it. Waiting on a name is the most
common reason setup stalls, and renaming later is cheap.

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
- "My bot stopped replying" / "is Binder still connected?" — run the Step 4c connection check and report which step broke (it is safe to re-run and changes nothing)

## Prerequisites

- OpenClaw gateway running (`openclaw gateway status`)
- Binder backend `api_url`
- Optionally a valid `owner_token` (from Binder account settings). **Not required** — without one, registration returns a `claim_url` you give the user to claim the bot.

If either is missing, send a Blocked message telling the owner where to get it (owner token: Binder app → Account Settings → AI Agents).

---

# Technical runbook

Internal procedure for the 5 owner-visible steps. Report progress with the templates above; never dump these commands' output at the owner.

## Step 0: Resolve inputs + send Kickoff

Resolve the Binder API URL, in order:
1. User-provided `api_url` / `Binder API URL` from the prompt
2. Default: `https://api.heybinder.com`

Then fetch the setup guide — Steps 2, 3 and 4c follow it:

```bash
curl -s "${API_URL}/docs/agents/setup-guide.md"
```

Choose a bot name + username yourself (must end in `.ai`; derive it from the gateway or the owner's handle). Send the **Kickoff** template and continue immediately — do not wait for a reply. If the owner names a different bot later, PATCH it.

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

**Follow the setup guide's "How to register" section.** It covers both paths (with and without an `owner_token`), the response shape, the `claim_url` rules, and how to translate each error for the owner.

Two things are specific to this gateway:

- **`callback_url`** is your public gateway URL plus the webhook path, e.g. `https://<gateway-public-url>/binder`. You may not have the public URL yet — register with your best guess and PATCH it in Step 3, as the guide describes.
- **Keep these four values for Step 4a**, from the registration response: `bot.id` → `botId`, `bot.username` → `botUsername`, `token`, `webhook_secret`. The last two are shown exactly once; write them into config before doing anything else.

## Step 3: Make the gateway reachable (the step that usually blocks)

**Follow the setup guide's "Make yourself reachable" section** — tunnel choice, the one temporary-vs-permanent question to ask the owner, the Cloudflare and Tailscale walkthroughs, when to stop, and the PATCH that updates `callback_url`.

Gateway-specific parts:

Check whether this gateway already has a public HTTPS URL before doing anything else:

```bash
openclaw config get gateway.remote.url
openclaw config get gateway.bind
openclaw config get gateway.port
```

If `gateway.remote.url` is set and public HTTPS, use it — no tunnel needed.

The local port the tunnel points at is the gateway's port, **18789** by default (`gateway.port` if changed). The webhook path is `/binder` unless you set a different `webhookPath` in Step 4a — the two must match.

> **Keep loopback:** leave `gateway.bind` as `127.0.0.1`. The tunnel handles external access. Do not change it to `0.0.0.0`.

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

> **Why configure before verify:** The plugin needs `webhookSecret` to verify inbound webhook HMAC signatures and to sign its reply to the connection check. Without it, the check fails at `webhook_delivered` or `response_signature`.

### 4b. Restart gateway

```bash
openclaw gateway restart
```

Config changes do nothing until the gateway restarts. Restart before running the check, not after it fails.

### 4c. Verify end-to-end delivery

```bash
curl -s -X POST "${API_URL}/api/bots/v1/verify-callback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "X-Bot-ID: ${BOT_ID}" \
  -d "{\"url\": \"${PUBLIC_URL}/binder\"}"
```

**The setup guide explains the response** — it is an ordered checklist, and `failed_step` names the one that broke. Read the `hint` on the failed step; it says what to do. Never report a raw code like `signature_mismatch` to the owner — translate it into one plain sentence.

What a failure usually means **on this gateway**:

| `failed_step` | Cause here | Fix |
|---|---|---|
| `url_valid` / `dns_resolves` | Tunnel died, or `callback_url` is a stale tunnel URL | Back to Step 3, then PATCH the new URL |
| `connected` (timeout) | Gateway accepted but never answered | `openclaw gateway restart`, then `openclaw logs binder` |
| `connected` (refused) | Nothing listening there | Tunnel not running, or pointing at the wrong port |
| `webhook_delivered` 404 | Path mismatch | `callback_url` path must equal `channels.binder.accounts.<id>.webhookPath` |
| `webhook_delivered` 401 | Plugin rejected Binder's signature | `webhookSecret` in config ≠ the one from registration |
| `response_signature` | Reply unsigned, or signed with a different secret | Update the plugin to ≥ 2026.7.27.0 (older versions did not sign replies), then restart. If already current, re-copy `webhookSecret` |
| `nonce_echo` | Something other than this plugin answered | Another service owns that path or port |

Two failed fix attempts on the same step → Blocked message.

**Re-runnable any time.** The check changes nothing, so use it whenever the owner says the bot went quiet, after moving or restarting a tunnel, or before asking them to check anything on their side.

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

Register the new bot exactly as in Step 2, with a different `username` and a `callback_url` ending in the new path, then:

```bash
openclaw config set channels.binder.accounts.second.apiUrl "${API_URL}"
openclaw config set channels.binder.accounts.second.botId "<bot.id>"
openclaw config set channels.binder.accounts.second.token "<token>"
openclaw config set channels.binder.accounts.second.webhookSecret "..."
openclaw config set channels.binder.accounts.second.botUsername "..."
openclaw config set channels.binder.accounts.second.webhookPath "/binder-2"
openclaw config set channels.binder.accounts.second.enabled true

openclaw gateway restart
```

**Important:** Each account must use a **different webhook path** so the gateway can route inbound webhooks. The `callback_url` must match the webhook path.

## Troubleshooting

Anything not listed here is probably not specific to this gateway — run the Step 4c check and follow the hint on the failed step.

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
- `token` or `webhookSecret` mistyped (long random strings)
- Gateway not restarted after config change
- Another plugin registered the same webhook path

### Webhook returns 401 / invalid signature

- `webhookSecret` in config must match what registration returned
- `callback_url` path and `webhookPath` in config must match
- `token` must be live (not rotated on the backend)

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
