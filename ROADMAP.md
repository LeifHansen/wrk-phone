# WrkPhn Roadmap — Beta Launch

Sequenced plan from "feature-complete single-tenant prototype" → "public
beta with paying customers." Phases run in order — each is a prerequisite
for the next.

| Phase | Goal | Est. effort | Status |
| --- | --- | --- | --- |
| 1 | Unified token economy + AI guardrails | 2–3 days | not started |
| 2 | Multi-tenant migration | 3–5 days | not started |
| 3 | Beta launch (invite codes, polish) | 2–3 days | not started |
| 4 | Post-beta P2 (live audio, retries, Postgres) | ongoing | not started |
| 5 | Mobile (parallel track) | 1–2 weeks | not started |

---

## Phase 1 — Unified Token Economy + AI Guardrails

**Why first:** unmetered OpenAI spend is the #1 financial risk for a beta
launch. The fix is also the primary revenue driver — token packages as
in-app purchases. Doing this first lets every subsequent feature ship
with metering already wired in.

### The model

One unit ("**token**") covers everything billable. Same accounting math
the credit system uses today, just renamed in the UI and extended to AI.

| Action | Cost |
| --- | --- |
| SMS (per 160-char segment) | 1 token |
| MMS | 3 tokens |
| Outbound voice call (~1.5 min budget) | 10 tokens |
| AI text reply (per turn, GPT-4o-mini default) | 1 token |
| AI voice cloning (per ElevenLabs synthesis) | 2 tokens |
| AI optimizer / quick-train pass | 3 tokens |
| Voice-clone training (per upload) | 5 tokens |

**Unit cost:** 1 token = $0.01. Mirrors the current `credits` math, so
no migration needed for existing rows.

### Monthly allowances (auto-reset on billing anniversary)

| Tier | Monthly tokens | Stripe SKU |
| --- | --- | --- |
| Free | 50 | n/a |
| Sole Prop ($5/mo) | 500 | existing `sole_prop` |
| Business ($10/mo) | 2,500 | existing `a2p` |

### Token packages (in-app purchase)

| Package | Tokens | Price | $/token | Notes |
| --- | --- | --- | --- | --- |
| Top-up | 500 | $5 | $0.010 | Baseline |
| Pack | 2,500 | $20 | $0.008 | Best value badge |
| Bulk | 8,000 | $50 | $0.00625 | Premium tier |
| Mega | 25,000 | $125 | $0.005 | Power user / agency |

Bigger packages = better per-token value → drives upsells. All packages
buy from Stripe, mid-flow can preserve cart so the user doesn't lose
context.

### Tasks

1. **DB schema**
   - Keep `app_settings.credits` column (no rename) to avoid migration
   - Add `subscriptions.monthly_token_allowance INTEGER`
   - Add `subscriptions.tokens_reset_at INTEGER` (next reset timestamp)
   - New table `token_ledger` (id, user_id, action, amount, balance_after, meta_json, created_at) for visibility + abuse detection
2. **OpenAI wrapper** — single `chat()` helper in `server/src/lib/openai.ts` that:
   - Pre-checks balance (reject if insufficient)
   - Calls OpenAI with cost-aware model selection
   - Reads `usage.total_tokens` from response
   - Maps OpenAI tokens → WrkPhn tokens (always ≥1)
   - Spends atomically post-call
   - Writes to `token_ledger`
3. **Cost helpers** — `aiTextCost()`, `voiceCloneCost()`, etc. all in `lib/costs.ts` (one source of truth)
4. **Refactor every OpenAI call site** through the wrapper (`agent.ts`, `agentOptimize.ts`, `agentTrain.ts`, `a2p.ts`, `voices.ts` for ElevenLabs, `media.ts` for DALL-E)
5. **Monthly reset cron** — boot-time check + nightly tick: if `tokens_reset_at < now()` AND subscription active, credit allowance and roll forward
6. **Stripe products** — add 4 new one-time products in Stripe for the packages, store SKUs in `STRIPE_TOKEN_PACKAGES` env
7. **Webhook** — `checkout.session.completed` for `mode=payment` (one-time) → credit tokens, write ledger entry, idempotent
8. **UI: rename Credits → Tokens** across the app (one find/replace pass + sidebar/labels)
9. **Tokens page** — current balance, next allowance reset, last-30-days spend graph, package buy buttons, full ledger
10. **Spend alerts** — when balance drops below 50, email + in-app toast on next session
11. **Per-feature cost preview** — every action that spends shows "this will cost N tokens" before confirmation

### Success criteria
- No OpenAI call can run without a balance check
- Every spend is in the ledger
- A user with 0 tokens cannot send SMS, generate AI, or make calls
- Monthly resets fire reliably across machine restarts
- Test buy of a $5 pack credits 500 tokens in <10s

---

## Phase 2 — Multi-Tenant Migration

**Why second:** beta means real users. Today every route hardcodes
`USER = OWNER_ID`. Until that's `req.userId`, two users' inboxes
collide. Schema is already per-user-keyed, this is mostly a route audit.

### Tasks

1. **Audit pass** — grep every route file for `OWNER_ID` / `DEMO_USER_ID` / `USER =`. Build a table of every read/write that's currently single-tenant. ~30 routes.
2. **`getUserId(req)` helper** — already exists in `auth.ts`, use it everywhere
3. **Route-by-route conversion** — replace `USER` with `getUserId(req)` per route, test each in isolation
4. **Twilio number ownership**
   - Today: one shared `TWILIO_FROM_NUMBER` env var
   - Move to: per-user assignment via `account_numbers` table (mostly already there)
   - Inbound webhook (`/api/voice/incoming`, `/api/sms/inbound`) looks up the called number → finds owning user → routes to their agent
   - Outbound uses the user's `default_from_number` from `account_numbers`
5. **Number provisioning on signup**
   - Auto-buy a Twilio local number to the user's area code (Twilio API: `incomingPhoneNumbers.create({ areaCode })`)
   - Charge baseline tokens (50? = $0.50 first-month coverage)
   - Or: let user search + pick from a list (better UX, slight friction)
   - Decision: **auto-buy on signup**, surface "change number" later
6. **TwiML App** — already shared, fine. Identity is per-user.
7. **SSE channel multiplexing** — `events.ts` currently broadcasts. Filter by `req.userId` so user A doesn't receive user B's events
8. **Webhook → user resolution** — single canonical helper `resolveInboundOwner(toNumber)` already exists in voice.ts, generalize and use everywhere
9. **Data migration script** — `scripts/migrate-to-multitenant.ts`
   - Find the existing `DEMO_USER_ID` rows
   - Look up `leifhansen@…`'s real user_id (or whatever's the owner email)
   - `UPDATE every_table SET user_id = ? WHERE user_id = DEMO_USER_ID`
   - Run inside a transaction, dry-run flag, rollback on error
10. **Soft cutover** — deploy with both ID paths working, run migration, then remove the `OWNER_ID` fallback
11. **Per-user rate limiting** — extend `rateLimit()` middleware to key by user_id, not just IP

### Test plan
- Two test accounts: `alice@test`, `bob@test`
- Both create agents, contacts, campaigns
- Alice cannot see Bob's data (manual check + automated test)
- Alice's incoming SMS to her number doesn't appear in Bob's inbox
- Alice's spend doesn't decrement Bob's balance
- SSE: Alice's new-message event doesn't push to Bob's browser

### Success criteria
- Zero `OWNER_ID` references in routes (only in `auth.ts` as the legacy export)
- Two-account isolation test passes
- Existing data (your line) still works after migration

---

## Phase 3 — Beta Launch

**Why third:** depends on tokens (no unmetered AI) + multi-tenant (no
user collision). Once both are in, this is mostly polish + the gate.

### Tasks

1. **Invite code system**
   - Table: `invite_codes (code TEXT PK, max_uses INT, used_count INT, created_by, expires_at, note)`
   - Signup form: required invite code field, server-validates before creating user
   - Failed code: friendly error, NOT a generic 400
   - Admin UI under `/admin` (already has Superadmin page) — mint codes, see usage, revoke
   - Mint 50 codes to start, hand them out personally
2. **Email verification**
   - Twilio Verify or SendGrid → 6-digit code → user confirms email
   - Gates account activation, NOT signup (so codes don't get burned on typos)
3. **Auto-provision Twilio number** on first login (Phase 2 dep)
4. **Per-user A2P 10DLC** — already mostly there; verify each user's registration is scoped properly
5. **Beta landing modification**
   - Add a "Request invite" form to `/lp` that collects email + use case
   - Stores to `waitlist` table for follow-up
   - Existing `/register` requires invite code
6. **Welcome email** sequence — send 1 day after first login with onboarding tips
7. **In-app first-run tour** — verify it works for fresh accounts (the Agents tour just got a fix)
8. **Spending alerts** — email when balance < 50 tokens, when subscription due to renew, when usage spikes
9. **Per-user error tracking** — Sentry or similar so a user-specific bug surfaces with context
10. **Status page** — `/status` showing Twilio/OpenAI/Stripe/R2 uptime (basic, pulls from `/api/_diag`)
11. **Support inbox** — `support@wrkphn.com` → forwards to your Gmail, replies via your work line if you want to dogfood
12. **Beta launch announcement** — blog post on `/blog`, X/LinkedIn drip

### Success criteria
- 10 invited users can complete: signup → email verify → get number → send SMS → create agent → receive auto-reply
- No cross-user data leaks (validated by 2-account smoke test)
- Token balance accurate to within 1 unit at all times
- Stripe webhook idempotency holds under double-fire (test with Stripe CLI)

---

## Phase 4 — Post-Beta P2 (ongoing)

Items from "What is NOT real" in the README that don't block beta.

| Item | Notes | Priority |
| --- | --- | --- |
| In-browser live audio for agent calls | Media Streams websocket relay; substantial server build (~1 wk) | P1 — high user value |
| Per-recipient retry inside campaign run | Backoff queue, currently fails immediately on transient Twilio errors | P1 |
| Postgres migration | When SQLite hits write contention or you need multi-instance | P2 |
| True WebSockets | Replace SSE + 30s polling fallback | P2 |
| RCS Agent application | Apply via Twilio; outbound-only and gated | P3 |
| eSIM | Out of scope by design | won't do |

---

## Phase 5 — Mobile (parallel track)

Can run alongside Phase 1–3 since they're disjoint.

1. **Custom dev build** — `expo prebuild && expo run:ios` with Twilio Voice RN SDK
2. **TestFlight** — internal testers first, then external
3. **Push notifications** — APNs for inbound calls (so the app rings when backgrounded)
4. **Contact sync** — `expo-contacts` (already scaffolded)
5. **App Store submission** — `mobile/SUBMISSION.md` has the checklist; needs screenshots, privacy nutrition label, App Store Connect setup
6. **Android release** — Play Store after iOS is stable

---

## Decision log

- **Beta gate:** invite codes (you hand-pick early users — controlled growth, Twilio/OpenAI spend stays predictable, quality feedback)
- **Data migration:** existing single-tenant data is re-keyed to your real user_id as user #1 (no downtime, no lost history)
- **Pricing posture:** generous allowances + premium packages (Free 50/mo, Sole Prop 500/mo, Business 2,500/mo; packages from $5/500 to $125/25,000)
- **Roadmap tracking:** this file + per-task GitHub Issues

---

Last updated: 2026-05-25
