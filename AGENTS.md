# Agent Notes for @openclaw/binder

## Versioning
- Bump the version in **both** `package.json` and `openclaw.plugin.json` when making any change to `main`.
- Follow the existing calver scheme: `YYYY.M.D.PATCH` (e.g. `2026.5.6.1`).
- Increment the patch segment for every release. If the patch segment is missing, add `.1`.

## API Endpoints

### Probe / Health Check (`probeBinderToken`)
- **Current:** Uses `GET /api/bots/v1/ping` — a dedicated ping endpoint on the Binderr backend.
- The ping endpoint returns **200** for valid + active bots, **401** for unauthorized/inactive bots.
- If you need to change probe logic, keep the ping endpoint; don't revert to the messages hack.

### Outbound Messages (`postBinderMessage`)
- Uses `POST /api/bots/v1/messages` with `group_id`, `parent_message_id`, and `content`.
- Requires headers: `Authorization: Bearer <token>` and `X-Bot-ID: <botId>`.

## Webhook Signature Verification
- Binderr signs webhooks with a **dedicated per-bot webhook secret** (`webhookSecret`).
- The secret is generated on bot creation and returned alongside the bearer token. It must be captured during setup and stored in the extension config.
- The extension verifies the `x-binderr-signature` header against `SHA256(webhookSecret)` using `timingSafeEqual`.
- The `x-binderr-timestamp` header must be within 5 minutes of `Date.now()`.

## Peer Dependency
- `openclaw` is a peer dependency (>= current extension version). It is declared optional so the extension can build in CI without the full OpenClaw package installed.
- `tsc` may emit unresolved-type warnings for `openclaw/*` imports in CI; this is expected and harmless.

## Build
- `npm run build` runs `tsc` and allows failure (`|| true`) so CI doesn't break on peer-dep type resolution.
- The extension exports `dist/index.js` (runtime) and `dist/setup-entry.js` (setup / CLI entry).

## Target Resolution (`messaging` config)
The extension defines a `messaging` block so OpenClaw's `message` tool can resolve `binder:UUID` targets:
- `targetPrefixes: ["binder"]` — registers `binder:` as a valid target prefix.
- `normalizeTarget` — strips the `binder:` prefix and validates the UUID format.
- `targetResolver` — resolves raw targets into `{ to, kind: "group", display, source: "resolved" }`.
- `resolveDeliveryTarget` / `resolveSessionTarget` — map conversation/session IDs back to group IDs.
- `parseExplicitTarget` — parses explicit `binder:UUID` into `{ kind: "group", id }`.
- `inferTargetChatType` — always returns `"group"`.

Without this section, the `message` tool cannot route to Binder groups and will emit `Unknown target` errors.

## Outbound Reply Tracking
- Because Binderr requires `parent_message_id` on every message, the extension caches the last incoming message ID per group (`lastMessageIdByGroup`).
- When the agent uses the `message` tool (no `replyToId`), `sendText` falls back to the cached last message ID so the API call succeeds.
- `processBinderEvent` updates the cache with `data.message_id` on every inbound webhook.
- `postBinderMessage` only includes `parent_message_id` in the payload when it's truthy, avoiding empty-string failures.