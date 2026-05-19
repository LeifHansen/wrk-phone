# Wrk Phone — context for Claude

Standalone project. Not related to any other repo. GitHub: `LeifHansen/wrk-phone`.

A work phone line (SMS inbox, softphone, AI auto-responder agents, mass-text
campaigns, Stripe billing) on Twilio + OpenAI.

## Layout

```
server/   Express + TypeScript + SQLite (better-sqlite3) + Twilio + OpenAI
web/      Vite + React 18 + TypeScript (browser softphone via @twilio/voice-sdk)
mobile/   Expo / React Native (native softphone — needs a custom dev build)
```

## Build & run (local)

```bash
# server  → http://localhost:4000
cd server && cp .env.example .env && npm install && npm run dev
# web     → http://localhost:5173 (proxies /api → :4000)
cd web && npm install && npm run dev
```

Build checks: `cd server && npm run build` (tsc), `cd web && npm run build`
(tsc -b && vite build). There is no test suite yet.

## Architecture constraints (read before "fixing" data scoping)

- **Single shared line.** ALL telephony/inbox/campaign data is bound to
  `OWNER_ID` (`server/src/lib/auth.ts`). Conversations created by Twilio
  webhooks belong to the owner. Per-user Twilio numbers / true multi-tenant
  is a separate, larger build — do NOT add per-user row scoping expecting
  multi-tenant; it would blank every non-owner inbox.
- **Auth model.** `AUTH_REQUIRED=1` turns on real login. `requireOwner`
  (mounted in `index.ts`) then restricts the shared `/api` surface to the
  owner/superadmin. Default (no `AUTH_REQUIRED`) = single-user prototype,
  guard is a no-op. Unauthenticated requests resolve to `OWNER_ID` so
  signature-verified Twilio/Stripe webhooks still pass.
- **PUBLIC_BASE_URL** must be the public https origin Twilio reaches.
  Production: set in `fly.toml` (`https://wrk-phone-8ebcfd.fly.dev`).
  Local: your tunnel URL (`ngrok http 4000`) in `server/.env`, also pasted
  into the Twilio number's webhook fields. Webhook signature validation
  fails closed in production if this is missing.

## Done (committed)

Security + perf hardening pass: SSRF guard on contacts/import-url, webhook
idempotency + fail-closed validation, `requireOwner` IDOR guard, blog HTML
sanitization, atomic campaign credit reservation + correct refund logic,
route-level code splitting, visibility-aware polling, single Twilio incoming
handler.

## Known remaining gaps (from audit, not yet done)

- Stripe webhook signature verification (`/api/credits/webhook`).
- `area_code` routing condition mis-matches non-US (`+44…`) numbers
  (`server/src/lib/routing.ts`) — country code not stripped.
- Frontend Twilio `Device` is never destroyed on logout / identity change
  (`web/src/lib/voice.ts`) — stale registration after re-login.
- Plus the README "Production checklist": per-user auth/numbers, A2P 10DLC,
  WebSockets instead of 4s polling, OpenAI cost guardrails, Postgres for
  multi-instance, structured logging.

See `README.md` for the full product/feature/deploy detail.
