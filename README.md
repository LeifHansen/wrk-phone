# Wrk Phone

A separate work phone line for iOS, Android, and the web — built on Twilio Voice + Programmable Messaging, with a trainable OpenAI auto-responder.

```
wrk-phone/
├── server/   Express + SQLite + Twilio + OpenAI (webhooks, API, agent loop)
├── mobile/   Expo (React Native) — iOS + Android, native softphone
└── web/      Vite + React — desktop softphone via @twilio/voice-sdk
```

## Design system

Light grey + white surfaces. Six high-energy accents do the work:

| Token | Hex | Used for |
| --- | --- | --- |
| `--lime` | `#C6F432` | Send button, "Auto" mode pill, Optimize hero |
| `--pink` | `#FF3D9A` | Unread dot, "Tone" optimization tag |
| `--orange` | `#FF6A00` | Campaign sending, "Mode" optimization tag |
| `--neon` | `#2D7CFF` | "Suggest" mode pill, Train hero, primary action |
| `--red` | `#FF3B30` | Destructive, "Guardrails" tag |
| `--black` | `#0A0A0A` | Outgoing message bubbles, primary CTAs, "Default" badge |

Each agent picks one of those 6 colors as its identity — visible everywhere it shows up (cards, inbox chip, conversation header strip).

## What's built

| Capability | How |
| --- | --- |
| **Multi-agent system** | Unlimited agents per user. Each has its own emoji + color + persona + rules + examples. Per-conversation routing — set a different agent on a per-thread basis, with a default fallback. |
| **Auto-routing rules** | Rules evaluated on every cold inbound. Conditions: keyword match, AI intent, sender (known/unknown), specific number, area code, time of day. AND-joined within a rule, ordered by priority across rules. First match wins; result sticks to the conversation. |
| **Easy training (Quick Wizard)** | 3 steps: pick a role preset (Personal / Sales / Recruiter / Support / Side Hustle / Custom) → pick a vibe (Chill, Direct, Hype, …) → name it. AI fills the rest. Or just type a one-liner and AI drafts the whole agent. |
| **AI optimizations** | One-tap "✨ Optimize" analyzes recent traffic + current config and returns up to 5 structured patches (tone tweaks, new rules, new examples, mode changes). Each one applies in one click. |
| **AI quick-train** | Generates 3 realistic inbound messages your agent might receive. You type how you'd actually reply. We save it as a few-shot example. |
| **Two-way SMS inbox (iPhone Messages look)** | Twilio Programmable Messaging + webhook → SQLite → polled by clients |
| **Outbound calls (softphone)** | Twilio Voice SDK (`@twilio/voice-react-native-sdk` on mobile, `@twilio/voice-sdk` on web) |
| **Inbound calls ring the softphone** | TwiML `<Dial><Client>` to the registered identity |
| **Voicemail w/ AI greeting + transcription** | Per-agent voicemail mode (Off = default greeting / Suggest = AI generates / Auto = same). Recordings transcribed to messages. |
| **Mass text campaigns** | Create with `{{name}}` template; throttled send loop with per-recipient status |
| **Native + browser softphone** | Same access-token endpoint, two SDKs |

## What is NOT real (be honest with yourself before you ship)

- **eSIM was scrapped per request.** This is a pure softphone — calls/texts go through Twilio over data (Wi-Fi/LTE), not over a SIM-bound carrier voice channel.
- **RCS via Twilio is outbound-only and gated.** Twilio's RCS Business Messaging is for businesses sending to consumers via a verified RCS Agent. There is no two-way peer RCS chat. The campaign system can route through a Messaging Service that has an RCS sender attached (channel field = `rcs`), but you'll need to apply for an RCS Agent through Twilio first. **Default is SMS — leave it on SMS until your RCS sender is approved.**
- **Auth is single-user demo mode.** Everything keys off `DEMO_USER_ID`. Add real auth (Clerk, Auth0, or a JWT pass) before letting anyone else in.
- **No rate-limit/retry on the campaign loop beyond a 100ms delay.** If you hit Twilio's per-MSID throttle, recipients flip to `failed` — no auto-retry yet.
- **Twilio Voice React Native SDK requires a custom dev build.** Won't run in Expo Go. Use `expo prebuild && expo run:ios` (or `:android`).

## Setup

### 0. Twilio prerequisites

In the Twilio console:
1. **Buy a phone number** with Voice + SMS capabilities.
2. **Create an API Key** (Account → API Keys → Create) → grab `SK…` SID and the secret.
3. **Create a TwiML App** (Voice → TwiML Apps → Create):
   - Voice Request URL: `https://YOUR_PUBLIC_URL/api/voice/outbound`
   - Save the `AP…` SID.
4. **Create Push Credentials** (only for mobile native softphone):
   - iOS: upload your APNs auth key, get a `CR…` SID.
   - Android: upload your FCM server credentials, get a `CR…` SID.
5. (Optional) **Messaging Service** (`MG…`) for sender-pool/A2P 10DLC + RCS.
6. **Wire your phone number's webhooks** to your public server:
   - Voice → `POST https://YOUR_PUBLIC_URL/api/voice/inbound`
   - Messaging → `POST https://YOUR_PUBLIC_URL/api/sms/inbound`
   - Status callback (optional) → `/api/voice/status` and `/api/sms/status`

For local dev: run `ngrok http 4000` and use the ngrok URL as `YOUR_PUBLIC_URL`.

### 1. Server

```bash
cd server
cp .env.example .env   # fill in Twilio + OpenAI keys
npm install
npm run dev            # http://localhost:4000
```

Hit `http://localhost:4000/health` — should return `{ok:true}`.

### 2. Web

```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api/*` → `http://localhost:4000`. Open the app, go to Settings, click **Register browser softphone** (mic permission required).

### 3. Mobile (Expo)

```bash
cd mobile
npm install
# Point the app at your server (LAN IP, not localhost, for device testing):
# Edit `app.json` → expo.extra.apiBaseUrl, OR set EXPO_PUBLIC_API_BASE_URL.
npx expo prebuild
npx expo run:ios       # or run:android
```

> The Twilio Voice React Native SDK requires a custom dev build. Plain Expo Go will load the rest of the UI but voice calls will throw.

## How agents work

### Multi-agent

You can create as many agents as you want. Each has:
- **Name + emoji + color** (one of lime / pink / orange / neon / red / black)
- **Persona** — the voice ("dry, lowercase, brief")
- **Instructions** — what to do ("answer questions when you can, ask a clarifying question when you can't")
- **Rules** — things never to do ("don't share my address", "don't quote prices")
- **Examples** — few-shot pairs that show your style
- **Mode** for messaging and **mode** for voicemail (Off / Suggest / Auto)

Exactly one agent is marked **default**. Conversations can override which agent handles them via the on-thread "Switch agent" sheet — useful for letting your sales agent handle a specific lead while the personal agent runs everything else.

### Three modes per channel

- **Off** — the AI never runs.
- **Suggest** — every inbound SMS gets an AI-drafted reply that appears in the thread as a yellow suggestion bubble. You tap *Send* or *Dismiss*.
- **Auto** — for messages that pass a safety filter (no `urgent|emergency|legal|medical|payment|password|ssn|...`), the reply is sent immediately via Twilio's `<Message>` TwiML response. Sensitive messages still appear as suggestions, never auto-sent.

### Easy training (the wizard)

`/agents/new` is 3 short steps:

1. **Pick a role.** Personal / Sales / Recruiter / Support / Side Hustle preset, or pick **Custom** and type one sentence — AI drafts the entire agent (`POST /api/agents/from-brief`).
2. **Pick a vibe.** Chill / Warm / Direct / Hype etc. — fills in the persona.
3. **Name it.** Done.

### Quick Train (`/agents/:id/train`)

Click "🎓 Quick Train" on any agent. We hit `POST /api/agents/:id/training-prompts` — OpenAI generates 3 realistic inbound messages your agent might receive (1 easy, 1 awkward, 1 sensitive). You type how *you* would reply. Each "Teach this" tap appends a few-shot example to the agent.

### Optimize (`/agents/:id/optimize`)

Click "✨ Optimize" on any agent. We hit `POST /api/agents/:id/optimize` — OpenAI analyzes:
- Current persona / instructions / rules / examples
- Recent message history (50 most recent)
- Counts of: AI-sent vs. dismissed suggestions, safety-filter blocks

Returns up to 5 structured suggestions like:

```jsonc
{
  "id": "add-pricing-rule",
  "type": "rules",
  "title": "Add a rule: never quote prices",
  "rationale": "You dismissed 3 of the agent's pricing replies last week. Adding a rule prevents that.",
  "patch": { "rules": ["… existing rules …", "Never quote prices — say I'll follow up"] }
}
```

Each card has an **Apply** button that PATCHes the agent in one tap.

Voicemail greeting works the same way as messaging: in non-Off mode, OpenAI generates a 1-2 sentence greeting from the agent's persona at call time.

## Auto-routing rules

`/routing` (web) or **Agents tab → ⚡ Auto-routing** (mobile).

A rule is a list of **conditions** (AND-joined) plus an **agent** to route to. On every inbound for a conversation that doesn't yet have an agent, rules are evaluated in priority order. First match wins. The matched agent is then **stuck** to the conversation — subsequent messages skip routing. Manual switch (the agent bar in the conversation header) still overrides.

### Condition types

| Type | UI label | Cost | What it matches |
| --- | --- | --- | --- |
| `keyword`      | Contains words           | free  | Any/all of comma-separated terms appear in the body (case-insensitive) |
| `intent`       | AI understands intent    | 1 OpenAI call | Free-text description ("messages about pricing or quotes") — uses gpt-4o-mini classifier |
| `sender`       | New / known contact      | free  | Sender phone is / is not in your `contacts` table |
| `sender_phone` | Specific number          | free  | Exact E.164 match |
| `area_code`    | Area code                | free  | First 3 digits of the local number |
| `time`         | Time of day              | free  | Day-of-week + HH:MM range in a given tz (default `America/Los_Angeles`) |

### Performance

Cheap conditions are checked first per rule. If a rule has an `intent` condition AND all its cheap conditions pass, the intent is queued. All queued intents go to OpenAI in **a single batched classification call** (one prompt, returns the matching indexes). So 5 intent rules across a single inbound = 1 OpenAI call, not 5.

### Examples

```jsonc
// Pricing → Sales
{
  "name": "Pricing → Sales",
  "agent_id": 2,
  "conditions": [
    { "type": "keyword", "terms": ["price", "quote", "cost", "pricing"], "mode": "any" }
  ]
}

// Cold inbounds during business hours → Sales (else fall through to Personal)
{
  "name": "Business hours cold lead → Sales",
  "agent_id": 2,
  "conditions": [
    { "type": "sender", "match": "unknown" },
    { "type": "time", "days": ["mon","tue","wed","thu","fri"], "start": "09:00", "end": "17:00" }
  ]
}

// AI-routed support intent
{
  "name": "Support questions → Support agent",
  "agent_id": 3,
  "conditions": [
    { "type": "intent", "description": "questions about an existing order, refund, or product issue" }
  ]
}
```

### Endpoints

- `GET /api/routing-rules` — list (joined with the agent meta for display)
- `POST /api/routing-rules` — create
- `PATCH /api/routing-rules/:id` — update (name, conditions, agent_id, enabled)
- `DELETE /api/routing-rules/:id`
- `POST /api/routing-rules/reorder` body `{ ids: [orderedIds] }`
- `POST /api/routing-rules/test` body `{ from, body, conditions }` — dry-run a candidate rule against a sample inbound; returns `{ matched, reason }` with a step-by-step trace

### Stickiness model

We deliberately **don't** re-route mid-thread:
- Conversation has `agent_id = NULL` → run rules; if matched, persist `agent_id` and use that agent for the inbound's reply.
- Conversation has `agent_id` → skip routing entirely; use the assigned agent.
- User taps "Switch" in the conversation header → manual `agent_id` set; rules continue to be skipped.

This keeps the experience predictable. If you want re-routing later (e.g. a Sales lead matures and you want it on the Personal agent), null out the agent via the switcher's "Use default" option — the next inbound will re-evaluate.

## Mass text campaigns

Create a campaign with:
- **Template** — supports `{{name}}` substitution
- **Recipients** — pasted as one per line: `+15551234567, Sam` (name optional)

Hit Send → background loop fires messages at ~10/sec via the Messaging Service (or default From number). Per-recipient status is recorded.

For RCS: set the campaign's `channel` to `rcs` AND make sure your `TWILIO_MESSAGING_SERVICE_SID` has an approved RCS Agent attached. Twilio will route through RCS where possible, fall back to SMS where not — but you must have an approved agent to send anything.

## Architecture sketch

```
                 ┌─────────────────┐
                 │  Twilio Cloud   │
                 └────────┬────────┘
                          │ webhooks (voice, sms, status)
                          ▼
   ┌────────────────────────────────────────┐
   │  Express server (server/)              │
   │  • /api/token         — Voice JWTs     │
   │  • /api/voice/*       — TwiML          │
   │  • /api/sms/*         — TwiML + send   │
   │  • /api/conversations — inbox API      │
   │  • /api/agent         — OpenAI config  │
   │  • /api/campaigns     — mass text loop │
   │  → SQLite (data/wrk.db)                │
   │  → OpenAI (chat completions)           │
   └────┬──────────────────┬────────────────┘
        │ REST/poll        │ REST/poll
        ▼                  ▼
   ┌─────────┐        ┌─────────┐
   │ Mobile  │        │  Web    │
   │ (Expo)  │        │ (Vite)  │
   │ + Voice │        │ + Voice │
   │   RN SDK│        │  JS SDK │
   └─────────┘        └─────────┘
```

## Production checklist (the parts I deliberately left out)

- [ ] Real auth (replace `DEMO_USER_ID` with a logged-in user; per-user Twilio numbers if multi-tenant)
- [ ] Twilio webhook signature validation (`twilio.validateRequest`) on all `/api/voice/*` and `/api/sms/*`
- [ ] WebSockets / push instead of 4s polling (huge battery + UX win)
- [ ] APNs/FCM push for inbound calls when the app is killed (push credentials are wired but the actual VoIP push handler is SDK-side)
- [ ] A2P 10DLC registration for SMS deliverability in the US
- [ ] Quiet hours / opt-out (`STOP` keyword) handling for campaigns — required by carriers
- [ ] OpenAI cost guardrails (max tokens per day per user)
- [ ] Postgres instead of SQLite when you have >1 instance
- [ ] Sentry / structured logging

## Cost notes (rough, US numbers, Q2 2026 rates)

- Twilio number: ~$1.15/mo
- SMS: ~$0.0083 in / ~$0.0083 out per segment
- Voice: ~$0.014/min in (toll-free $0.022) + ~$0.0140/min out PSTN + $0.004/min Voice SDK leg
- OpenAI gpt-4o-mini: ~$0.15/M in, $0.60/M out — basically rounding error vs. Twilio at SMS volumes

A single user doing ~100 SMS + ~20 min calls/mo lands around $5/mo before margin.

## Deployment

The repo is set up to deploy as **one container** on Fly.io: the Express server hosts both `/api/*` and the built web SPA from the same origin. SQLite lives on a Fly Volume mounted at `/data`.

### One-time Fly setup

```bash
# 0. Install flyctl + log in
brew install flyctl       # or: curl -L https://fly.io/install.sh | sh
fly auth login

# 1. From the repo root
cd wrk-phone
fly launch --no-deploy --copy-config       # claims an app name, keeps fly.toml as-is
                                           # If app name collides, edit fly.toml's `app =` first.

# 2. Create the SQLite volume (1GB is plenty to start)
fly volumes create wrk_data --region iad --size 1

# 3. Wire up secrets (everything from server/.env.example except PORT/PUBLIC_BASE_URL)
fly secrets set \
  TWILIO_ACCOUNT_SID=ACxxxx \
  TWILIO_AUTH_TOKEN=xxxx \
  TWILIO_API_KEY_SID=SKxxxx \
  TWILIO_API_KEY_SECRET=xxxx \
  TWILIO_TWIML_APP_SID=APxxxx \
  TWILIO_DEFAULT_FROM_NUMBER=+15551234567 \
  TWILIO_MESSAGING_SERVICE_SID=MGxxxx \
  TWILIO_PUSH_CREDENTIAL_SID_IOS=CRxxxx \
  TWILIO_PUSH_CREDENTIAL_SID_ANDROID=CRxxxx \
  OPENAI_API_KEY=sk-xxxx

# 4. Ship it
fly deploy
```

After deploy:

1. Grab your URL: `https://<app>.fly.dev` — open it in a browser, you'll see the web app.
2. In the Twilio console, on your phone number's settings, set:
   - **Voice → A call comes in** → `https://<app>.fly.dev/api/voice/inbound` (POST)
   - **Messaging → A message comes in** → `https://<app>.fly.dev/api/sms/inbound` (POST)
   - Optional status callbacks → `/api/voice/status` and `/api/sms/status`
3. In your TwiML App, set the **Voice Request URL** → `https://<app>.fly.dev/api/voice/outbound` (POST). This is what powers outgoing calls from the softphone.

### Subsequent deploys

```bash
fly deploy
```

That's it. The Dockerfile rebuilds the web SPA + server in two stages and ships a single image (~150MB).

### Mobile app builds (EAS)

The mobile app reads `EXPO_PUBLIC_API_BASE_URL` at build time (`mobile/eas.json` already points the `preview` and `production` profiles at `https://wrk-phone.fly.dev` — change to your actual app URL).

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure                    # one-time link to your Expo project
eas build --profile preview --platform ios       # internal TestFlight-style build
eas build --profile production --platform all    # store-ready
```

Note: native voice (`@twilio/voice-react-native-sdk`) requires a custom dev build — Expo Go won't work for calling. The text/agent/campaign UIs work fine in Expo Go.

### Local dev

```bash
# Terminal 1 — server
cd server && cp .env.example .env && npm install && npm run dev   # :4000

# Terminal 2 — web
cd web && npm install && npm run dev                              # :5173, proxies /api → :4000

# Terminal 3 — Twilio webhooks tunnel (only needed for inbound testing)
ngrok http 4000
# Use the ngrok URL on your Twilio number's webhook fields.

# Terminal 4 — mobile (separate)
cd mobile && npm install && npx expo prebuild && npx expo run:ios
```

### What's NOT in this scaffold (intentional, but you'll want them before letting strangers in)

- **Auth.** Single-user demo (`DEMO_USER_ID`). Add Clerk/Auth0/Supabase Auth + per-user Twilio number provisioning.
- **Webhook signature validation.** Wrap `/api/voice/*` and `/api/sms/*` with `twilio.validateRequest` middleware.
- **A2P 10DLC registration.** Required for US SMS deliverability at scale.
- **STOP keyword handling.** Carriers require it. Easy add: SMS inbound checks `body.trim().toUpperCase() === 'STOP'` and skips agent response + flips a `do_not_contact` flag on the contact.
- **Postgres.** SQLite is great for single-tenant; for multi-instance, swap to Postgres before scaling horizontally.
