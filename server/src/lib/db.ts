import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { log } from './log.js';
import { sanitizeBodyHtml } from './sanitize.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'wrk.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    UNIQUE(user_id, phone)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    peer_phone TEXT NOT NULL,
    last_message_at INTEGER NOT NULL DEFAULT 0,
    unread_count INTEGER NOT NULL DEFAULT 0,
    agent_id INTEGER,
    UNIQUE(user_id, peer_phone)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK(direction IN ('in','out')),
    body TEXT NOT NULL,
    twilio_sid TEXT,
    status TEXT,
    created_at INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0,
    is_suggestion INTEGER NOT NULL DEFAULT 0,
    agent_id INTEGER,
    safety_blocked INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  -- Hot path: every inbound Twilio webhook checks idempotency by twilio_sid.
  -- Without this index a growing messages table forces a full scan per webhook.
  CREATE INDEX IF NOT EXISTS idx_messages_twilio_sid ON messages(twilio_sid) WHERE twilio_sid IS NOT NULL;

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    peer_phone TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('in','out')),
    duration_sec INTEGER,
    twilio_sid TEXT,
    started_at INTEGER NOT NULL
  );

  -- Multi-agent. One user can have many agents.
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🤖',
    color TEXT NOT NULL DEFAULT 'lime',
    role TEXT,                       -- preset slug, eg 'personal','sales','recruiter'
    persona TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    examples_json TEXT NOT NULL DEFAULT '[]',
    rules_json TEXT NOT NULL DEFAULT '[]',   -- ["don't book meetings","don't share address",...]
    mode TEXT NOT NULL DEFAULT 'off' CHECK(mode IN ('off','suggest','auto')),
    voice_mode TEXT NOT NULL DEFAULT 'off' CHECK(voice_mode IN ('off','suggest','auto')),
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms' CHECK(channel IN ('sms','rcs','mms')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','done','failed')),
    sent_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','delivered')),
    twilio_sid TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS routing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,        -- lower = higher priority
    conditions_json TEXT NOT NULL,               -- array of conditions, AND-joined
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    match_count INTEGER NOT NULL DEFAULT 0,
    last_matched_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rules_user_priority ON routing_rules(user_id, priority);

  CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
    token TEXT NOT NULL,
    PRIMARY KEY(user_id, platform)
  );

  CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS contact_segments (
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, segment_id)
  );

  CREATE TABLE IF NOT EXISTS voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'grok',
    tts_voice TEXT NOT NULL,         -- concrete engine voice used to synthesize today
    style TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    prompt TEXT,
    kind TEXT NOT NULL DEFAULT 'generated' CHECK(kind IN ('generated','upload')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,                 -- 'a2p' | 'number'
    ref TEXT,                            -- e.g. the phone number for 'number'
    stripe_sub_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending|active|canceled|dev
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, plan);

  CREATE TABLE IF NOT EXISTS a2p_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    profile_json TEXT NOT NULL,        -- business info
    package_json TEXT NOT NULL,        -- AI-drafted campaign content
    status TEXT NOT NULL DEFAULT 'draft',  -- draft|submitted|in_review|approved|failed|manual
    twilio_brand_sid TEXT,
    twilio_campaign_sid TEXT,
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Per-user provisioned phone number (selected during onboarding).
  CREATE TABLE IF NOT EXISTS app_settings (
    user_id TEXT PRIMARY KEY,
    active_number TEXT,
    active_number_sid TEXT,
    onboarded INTEGER NOT NULL DEFAULT 0,
    credits INTEGER NOT NULL DEFAULT 100,
    avatar_url TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  -- SEO blog. Posts are public; an AI agent can auto-generate weekly.
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',   -- draft | published
    author TEXT NOT NULL DEFAULT 'WrkPhn AI',
    ai INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    published_at INTEGER
  );

  -- Single-row config for the weekly blog agent (id is always 1).
  CREATE TABLE IF NOT EXISTS blog_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    cadence_days INTEGER NOT NULL DEFAULT 7,
    autopublish INTEGER NOT NULL DEFAULT 1,
    tone TEXT NOT NULL DEFAULT 'practical, friendly, expert',
    topics TEXT NOT NULL DEFAULT '',
    last_run_at INTEGER,
    next_run_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  -- Per-account phone numbers (multi-tenant). A row with user_id = NULL is
  -- unassigned pool inventory; assignment sets user_id + status = 'active'.
  -- Each account gets one toll-free number free at signup; extra local
  -- numbers are paid ($2 activation + $2/mo passthrough).
  CREATE TABLE IF NOT EXISTS account_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    phone TEXT NOT NULL UNIQUE,
    twilio_sid TEXT,
    type TEXT NOT NULL DEFAULT 'tollfree' CHECK(type IN ('tollfree','local')),
    is_default INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pool' CHECK(status IN ('pool','active','pending','released')),
    tfv_status TEXT,                          -- toll-free verification: null|pending|in_review|verified|rejected
    monthly_cost_cents INTEGER NOT NULL DEFAULT 0,
    activation_paid INTEGER NOT NULL DEFAULT 0,
    stripe_sub_id TEXT,
    created_at INTEGER NOT NULL,
    assigned_at INTEGER,
    released_at INTEGER
  );

  -- Reusable message templates. Selectable from the conversation composer
  -- (one-off sends) and the campaigns form. {{first_name}} (and any future
  -- {{token}}) is resolved at send time from the recipient's contact row.
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    media_url TEXT,                     -- optional MMS image
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id, updated_at DESC);

  -- Outbound AI voice calls. The "Call with Agent" feature: pick an agent,
  -- write a script, pick recipients, dial them automatically. On a live human
  -- the agent holds a two-way conversation (the script is its opener); on a
  -- machine it leaves the script as voicemail. Mirrors the campaigns flow.
  -- NOTE: the consent_acknowledged* columns are legacy (an earlier in-app TCPA
  -- gate, since removed). Kept for historical audit rows; no longer written.
  CREATE TABLE IF NOT EXISTS agent_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    script TEXT NOT NULL,
    from_number TEXT,                                -- caller ID; null = use active
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','done','failed')),
    placed_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    -- TCPA audit trail
    consent_acknowledged INTEGER NOT NULL DEFAULT 0,
    consent_acknowledged_at INTEGER,
    consent_acknowledged_ip TEXT,
    consent_acknowledged_ua TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_call_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_call_id INTEGER NOT NULL REFERENCES agent_calls(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    -- 'skipped-*' lets the UI explain WHY we didn't dial (quiet hours,
    -- voice opt-out, invalid number) instead of just showing 'failed'.
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','initiated','ringing','in-progress','completed',
                       'busy','no-answer','failed','canceled',
                       'skipped-opted-out','skipped-quiet-hours')),
    twilio_sid TEXT,
    duration_sec INTEGER,
    answered_by TEXT,                                -- Twilio machine-detection result
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_agent_call_recipients ON agent_call_recipients(agent_call_id, status);
  CREATE INDEX IF NOT EXISTS idx_agent_call_recipients_sid ON agent_call_recipients(twilio_sid) WHERE twilio_sid IS NOT NULL;

  -- Token ledger — every grant + spend (SMS, MMS, voice call, AI text
  -- reply, voice cloning synth, allowance reset, Stripe top-up) writes
  -- one row. The user's current balance lives on app_settings.credits
  -- (1 token = 1 credit = $0.01, unchanged math). The ledger is the
  -- forensic record for "where did my tokens go" + the abuse detection
  -- signal for "this user just burned 5,000 tokens in a minute".
  CREATE TABLE IF NOT EXISTS token_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,              -- 'sms_out'|'mms_out'|'voice_out'|'ai_text'|'voice_clone'|'image_gen'|'topup'|'allowance_reset'|'refund'
    amount INTEGER NOT NULL,           -- negative = spend, positive = grant
    balance_after INTEGER NOT NULL,
    meta_json TEXT,                    -- e.g. {"messageId":123,"openaiTokens":487,"stripeSession":"cs_..."}
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_token_ledger_user_recent ON token_ledger(user_id, created_at DESC);

  -- Invite codes — beta gate. Each code may be single-use (default) or
  -- multi-use (e.g. an evangelist's referral code with max_uses=10). A
  -- code burns on successful signup, not on attempt, so typos don't
  -- waste invites.
  CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    expires_at INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL
  );

  -- Waitlist — public "request invite" form. You manually review +
  -- promote rows to invite codes for the most promising signups.
  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    use_case TEXT,
    created_at INTEGER NOT NULL,
    invited_at INTEGER
  );

  -- Live voice-agent call turns. When an inbound call hits an agent
  -- with voice_mode='auto', we run the call as a turn-by-turn AI
  -- conversation. Each (caller speech, agent reply) pair is appended
  -- here keyed by Twilio CallSid so subsequent TwiML requests can
  -- rehydrate the conversation history (Twilio doesn't carry state
  -- between webhook hits — every callback is stateless).
  CREATE TABLE IF NOT EXISTS live_call_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT NOT NULL,
    user_id TEXT NOT NULL,
    agent_id INTEGER,
    role TEXT NOT NULL CHECK(role IN ('caller','agent')),
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_live_call_turns_sid ON live_call_turns(call_sid, id);

  -- Live agent-call feed. Each row is one spoken turn (the agent's line or the
  -- caller's recognized speech) written by the voice handlers as a call
  -- progresses. The Live Calls panel reads from here in real time so the user
  -- can watch the conversation unfold.
  CREATE TABLE IF NOT EXISTS live_call_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT NOT NULL,            -- Twilio CallSid (matches recipient row)
    user_id TEXT NOT NULL,             -- denormalized for the read query's WHERE
    sequence INTEGER NOT NULL,         -- monotonic per call_sid
    source TEXT NOT NULL,              -- 'inbound' (callee) | 'outbound' (agent) | 'system'
    text TEXT NOT NULL,
    is_final INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lce_call ON live_call_events(call_sid, sequence);
  CREATE INDEX IF NOT EXISTS idx_lce_user_recent ON live_call_events(user_id, created_at DESC);

  -- Indexes for hot read paths (defined last; all tables exist by here).
  CREATE INDEX IF NOT EXISTS idx_conversations_user_recent ON conversations(user_id, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_campaign_recipients ON campaign_recipients(campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_user_name ON contacts(user_id, name);
  CREATE INDEX IF NOT EXISTS idx_account_numbers_user ON account_numbers(user_id, status);
`);

// Lightweight migrations for upgrades from the v0.1 single-agent schema.
function tryAddColumn(table: string, def: string) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch {}
}
tryAddColumn('conversations', 'agent_id INTEGER');
tryAddColumn('messages', 'agent_id INTEGER');
tryAddColumn('messages', 'safety_blocked INTEGER NOT NULL DEFAULT 0');
tryAddColumn('messages', 'media_url TEXT');
tryAddColumn('campaigns', 'media_url TEXT');
tryAddColumn('app_settings', 'credits INTEGER NOT NULL DEFAULT 100');
tryAddColumn('agents', 'voice_id INTEGER');
tryAddColumn('agents', 'voice_name TEXT');
tryAddColumn('agents', 'tts_voice TEXT');
tryAddColumn('agents', 'avatar_url TEXT');
tryAddColumn('app_settings', 'avatar_url TEXT');
tryAddColumn('contacts', 'opted_out INTEGER NOT NULL DEFAULT 0');
tryAddColumn('conversations', 'autopilot INTEGER NOT NULL DEFAULT 0');
// WHICH of our numbers this conversation is on. Needed once toll-free numbers
// are shared across accounts: inbound is routed by the (our_number, peer) pair,
// not the dialed number alone. NULL on rows that predate multi-number support.
tryAddColumn('conversations', 'our_number TEXT');
tryAddColumn('agents', 'send_number TEXT');
tryAddColumn('agents', 'hidden INTEGER NOT NULL DEFAULT 0');
// Voice opt-out lives separately from SMS opt-out — TCPA treats them as
// distinct channels and a recipient may consent to texts but not calls.
tryAddColumn('contacts', 'voice_opted_out INTEGER NOT NULL DEFAULT 0');
// User-set quiet hours (UTC offset minutes, e.g. -480 = PT). Stored per
// user; falls back to America/Los_Angeles if unset. The send loop enforces
// "no automated calls outside 8am–9pm local time" for TCPA hygiene.
tryAddColumn('app_settings', 'quiet_hours_tz_offset INTEGER');
// Twilio TrustHub sole-prop registration: persist the customer-profile
// + end-user SIDs so the OTP step (a separate request) can look them
// up. Without these columns the user receives a code but the app has
// no way to verify it.
tryAddColumn('a2p_registrations', 'twilio_customer_profile_sid TEXT');
tryAddColumn('a2p_registrations', 'twilio_end_user_sid TEXT');
tryAddColumn('a2p_registrations', 'twilio_evaluation_sid TEXT');
tryAddColumn('a2p_registrations', 'otp_verified INTEGER NOT NULL DEFAULT 0');

// Voices: enforce one row per (user, name). Prevents the "I uploaded a
// voice and got two of them, and clicking one highlights both" bug — the
// duplicate row was created silently because there was no constraint.
// Existing duplicates get collapsed (keep newest, since it's most likely
// the one the user wanted) AND their orphaned sample files unlinked from
// disk before adding the index — otherwise the previous version of this
// sweep leaked a sample file per dedup on every boot.
try {
  const orphans = db.prepare(`
    SELECT id, sample_url FROM voices v
     WHERE id < (SELECT MAX(id) FROM voices v2 WHERE v2.user_id = v.user_id AND v2.name = v.name)
  `).all() as { id: number; sample_url: string | null }[];
  if (orphans.length > 0) {
    // Lazy fs + path so the import doesn't run on cold start when there
    // are no duplicates (which is the common case after the first sweep).
    Promise.resolve().then(async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
      const VOICE_SAMPLE_DIR = path.join(DATA_DIR, 'voice-samples');
      for (const o of orphans) {
        if (!o.sample_url) continue;
        try { fs.unlinkSync(path.join(VOICE_SAMPLE_DIR, o.sample_url)); } catch { /* already gone */ }
      }
    });
    db.prepare(`DELETE FROM voices WHERE id IN (${orphans.map(() => '?').join(',')})`).run(...orphans.map((o) => o.id));
    log.warn('db.voices', `dedup: removed ${orphans.length} duplicate voice rows (+ unlinked their sample files)`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_voices_user_name ON voices(user_id, name);`);
} catch (e) {
  log.warn('db.voices', 'dedup + unique-index failed (will retry next boot)', e);
}
// Voice cloning: store the user-uploaded reference sample + the cloned
// provider voice id (e.g. ElevenLabs voice_id). `cloned=1` means the
// `tts_voice` column holds an actual cloned voice id (format
// `provider:id`, e.g. `elevenlabs:abc123`), not a generic Polly preset.
tryAddColumn('voices', 'sample_url TEXT');
tryAddColumn('voices', 'cloned INTEGER NOT NULL DEFAULT 0');

// Phase 1 — token economy. Each subscription tier ships with a monthly
// token allowance that gets credited automatically on the billing
// anniversary (handled by the reset cron in lib/tokens.ts). Stored on
// the subscription row so different tiers (sole_prop, a2p) can carry
// different allowances without a hard-coded lookup.
tryAddColumn('subscriptions', 'monthly_token_allowance INTEGER NOT NULL DEFAULT 0');
tryAddColumn('subscriptions', 'tokens_reset_at INTEGER');
// Agent calls: voicemail-only mode — drop a voicemail without leaving a
// message on a live human pickup. Twilio AMD classifies the answer; if
// human, the call apologizes briefly and hangs up; if voicemail, the
// agent leaves the script as the voicemail message.
tryAddColumn('agent_calls', 'voicemail_only INTEGER NOT NULL DEFAULT 0');
// `status='draft'` lets the messages table double as the drafts store —
// avoids a parallel `drafts` table that would drift on conversation delete.
// Existing CHECK on status is a free-form TEXT; no constraint to alter.

// ---------- Phone-normalization + dedupe sweep ----------
// Pre-fix, contacts.phone and conversations.peer_phone were stored
// byte-literal — so "2068173472" and "+12068173472" were different rows
// even though they're the same person. This sweep:
//   1. Normalizes every existing row to E.164 (best-effort via the same
//      regex the API uses — see lib/phone.ts).
//   2. Merges duplicates: keeps the row with a NAME (or oldest), redirects
//      contact_segments + messages + campaigns_recipients references to
//      the kept row, deletes the loser.
// Idempotent — safe to re-run; rows that are already canonical pass through.
import { normalizePhone as _normPhone } from './phone.js';
function dedupePhoneRows() {
  try {
    // ---- Contacts ----
    const contactRows = db.prepare(
      `SELECT id, user_id, phone, name FROM contacts`
    ).all() as { id: number; user_id: string; phone: string; name: string | null }[];
    type ContactGroup = { allIds: number[]; canonicalPhone: string; allNames: string[] };
    const contactGroups = new Map<string, ContactGroup>(); // key = user_id|canonicalPhone
    // Two-pass: collect every row's id + name into the group first, THEN
    // pick the best name (longest non-empty) across the whole group. The
    // prior one-pass logic discarded names that arrived after a non-empty
    // keeper was already chosen.
    for (const r of contactRows) {
      const canonical = _normPhone(r.phone) || r.phone; // keep as-is if unparseable
      const key = `${r.user_id}|${canonical}`;
      const g = contactGroups.get(key);
      if (!g) {
        contactGroups.set(key, { allIds: [r.id], canonicalPhone: canonical, allNames: r.name ? [r.name] : [] });
      } else {
        g.allIds.push(r.id);
        if (r.name) g.allNames.push(r.name);
      }
    }
    let mergedContacts = 0, renormalized = 0;
    db.transaction(() => {
      for (const g of contactGroups.values()) {
        // Keep the oldest (smallest id) row; the keep choice is stable and
        // doesn't matter for content because we re-stamp name + phone below.
        const sortedIds = [...g.allIds].sort((a, b) => a - b);
        const keepId = sortedIds[0];
        const mergeIds = sortedIds.slice(1);
        // Best name = longest non-empty (gives "Leif Hansen" priority over
        // "Leif"); fall back to whatever's there, or null.
        const bestName = g.allNames.length === 0
          ? null
          : g.allNames.reduce((a, b) => (b.trim().length > a.trim().length ? b : a));
        if (mergeIds.length > 0) {
          const inList = mergeIds.map(() => '?').join(',');
          // Redirect contact_segments to the kept contact, then drop dupes.
          db.prepare(
            `INSERT OR IGNORE INTO contact_segments (contact_id, segment_id)
             SELECT ?, segment_id FROM contact_segments WHERE contact_id IN (${inList})`
          ).run(keepId, ...mergeIds);
          db.prepare(`DELETE FROM contact_segments WHERE contact_id IN (${inList})`).run(...mergeIds);
          db.prepare(`DELETE FROM contacts WHERE id IN (${inList})`).run(...mergeIds);
          mergedContacts += mergeIds.length;
        }
        // Snap the kept row to canonical phone form + bestName (unconditional
        // so a longer name in a now-deleted dupe still wins).
        const cur = db.prepare(`SELECT phone, name FROM contacts WHERE id = ?`).get(keepId) as { phone: string; name: string | null } | undefined;
        if (cur && (cur.phone !== g.canonicalPhone || cur.name !== bestName)) {
          db.prepare(`UPDATE contacts SET phone = ?, name = ? WHERE id = ?`)
            .run(g.canonicalPhone, bestName, keepId);
          renormalized++;
        }
      }
    })();

    // ---- Conversations ----
    const convRows = db.prepare(
      `SELECT id, user_id, peer_phone, last_message_at FROM conversations`
    ).all() as { id: number; user_id: string; peer_phone: string; last_message_at: number }[];
    type ConvGroup = { keepId: number; mergeIds: number[]; canonical: string };
    const convGroups = new Map<string, ConvGroup>();
    for (const r of convRows) {
      const canonical = _normPhone(r.peer_phone) || r.peer_phone;
      const key = `${r.user_id}|${canonical}`;
      const g = convGroups.get(key);
      if (!g) {
        convGroups.set(key, { keepId: r.id, mergeIds: [], canonical });
      } else {
        // Prefer the one with the most recent activity as the keeper, since
        // that's the thread the user actually engages with; otherwise oldest.
        const keepRow = db.prepare(`SELECT last_message_at FROM conversations WHERE id = ?`).get(g.keepId) as { last_message_at: number };
        if (r.last_message_at > (keepRow?.last_message_at || 0)) {
          g.mergeIds.push(g.keepId);
          g.keepId = r.id;
        } else {
          g.mergeIds.push(r.id);
        }
      }
    }
    let mergedConvs = 0;
    db.transaction(() => {
      for (const g of convGroups.values()) {
        if (g.mergeIds.length > 0) {
          const inList = g.mergeIds.map(() => '?').join(',');
          // Re-point messages to the kept conversation (preserves history).
          db.prepare(`UPDATE messages SET conversation_id = ? WHERE conversation_id IN (${inList})`)
            .run(g.keepId, ...g.mergeIds);
          // Sum unread counts; bump last_message_at to the latest across the group.
          const agg = db.prepare(
            `SELECT COALESCE(SUM(unread_count),0) AS unread, MAX(last_message_at) AS latest
               FROM conversations WHERE id IN (${[g.keepId, ...g.mergeIds].map(()=>'?').join(',')})`
          ).get(g.keepId, ...g.mergeIds) as { unread: number; latest: number };
          db.prepare(`UPDATE conversations SET unread_count = ?, last_message_at = ? WHERE id = ?`)
            .run(agg.unread, agg.latest, g.keepId);
          db.prepare(`DELETE FROM conversations WHERE id IN (${inList})`).run(...g.mergeIds);
          mergedConvs += g.mergeIds.length;
        }
        // Canonicalize the kept row's peer_phone.
        db.prepare(`UPDATE conversations SET peer_phone = ? WHERE id = ?`).run(g.canonical, g.keepId);
      }
    })();

    if (mergedContacts || mergedConvs || renormalized) {
      log.warn('db.dedupe',
        `phone dedupe sweep: merged ${mergedContacts} contacts + ${mergedConvs} conversations, renormalized ${renormalized} contact phones`);
    }
  } catch (e) {
    log.error('db.dedupe', 'phone dedupe sweep failed', e);
  }
}
dedupePhoneRows();

// ---------- Media → R2 backfill (one-time per file) ----------
// When R2 was wired AFTER files had already been written to the local Fly
// volume, those rows still point at /media/<file>. This sweep moves each
// local file to R2 and updates the DB URL. Idempotent — the SELECT
// excludes rows already on the R2 public base, so re-runs short-circuit at
// the DB level instead of scanning every row in JS.
//
// Exported so index.ts can `await` it BEFORE recoverInterrupted*() runs —
// otherwise a recovery could re-send an MMS using a media_url that's being
// rewritten under it.
export async function migrateMediaToR2(): Promise<void> {
  const r2Base = (process.env.R2_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  if (!r2Base) return;
  try {
    const { saveBytes, MEDIA_DIR } = await import('./storage.js');
    const fs = await import('node:fs');
    const path = await import('node:path');
    // SELECT excludes rows already on R2 so re-runs are O(0) at the DB level.
    const rows = db.prepare(
      `SELECT id, url FROM media WHERE url LIKE '%/media/%' AND url NOT LIKE ?`
    ).all(`${r2Base}/%`) as { id: number; url: string }[];
    let moved = 0, missing = 0, failed = 0;
    for (const row of rows) {
      const m = row.url.match(/\/media\/([^/?#]+)$/);
      if (!m) continue;
      const file = m[1];
      const local = path.join(MEDIA_DIR, file);
      if (!fs.existsSync(local)) { missing++; continue; }
      try {
        const buf = fs.readFileSync(local);
        const ext = (file.split('.').pop() || 'bin').toLowerCase();
        const saved = await saveBytes(buf, ext);
        if (saved.url.startsWith(r2Base + '/')) {
          db.prepare(`UPDATE media SET url = ? WHERE id = ?`).run(saved.url, row.id);
          try { fs.unlinkSync(local); } catch { /* already gone is fine */ }
          moved++;
        } else {
          // R2 PUT failed → saveBytes fell back to local with a NEW hex key.
          // Clean up that bonus local file and leave the original row alone
          // so the next boot tries again (without orphaning disk space).
          const newFileMatch = saved.url.match(/\/media\/([^/?#]+)$/);
          if (newFileMatch) {
            try { fs.unlinkSync(path.join(MEDIA_DIR, newFileMatch[1])); } catch {}
          }
          failed++;
        }
      } catch (e) {
        failed++;
        log.warn('db.r2-migrate', `failed to move ${file}`, e);
      }
    }
    if (moved || missing || failed) {
      log.warn('db.r2-migrate',
        `media→R2 backfill: moved ${moved}, missing ${missing}, failed ${failed}`);
    }
  } catch (e) {
    log.error('db.r2-migrate', 'migration sweep crashed', e);
  }
}

// One-time backfill: stamp our_number on conversations created before the
// column existed, using each account's current sending number. Without it a
// reply to an established thread would look "cold" to resolveInboundOwner and
// be dropped. Idempotent — only touches rows still NULL.
db.prepare(
  `UPDATE conversations
   SET our_number = (
     SELECT active_number FROM app_settings
     WHERE app_settings.user_id = conversations.user_id
   )
   WHERE our_number IS NULL
     AND EXISTS (
       SELECT 1 FROM app_settings
       WHERE app_settings.user_id = conversations.user_id
         AND active_number IS NOT NULL AND active_number != ''
     )`
).run();

// Legacy `agent_settings` -> `agents` migration was a one-shot for the v0.1
// schema. Prod has been on the multi-agent schema for months; the table no
// longer exists. Code removed to avoid a sqlite_master poll on every boot.

export function getOrCreateConversation(
  userId: string,
  peerPhone: string,
  ourNumber?: string | null,
): number {
  const existing = db.prepare(
    'SELECT id, our_number FROM conversations WHERE user_id = ? AND peer_phone = ?'
  ).get(userId, peerPhone) as { id: number; our_number: string | null } | undefined;
  if (existing) {
    // Backfill our_number on rows created before multi-number support, the
    // first time we learn which line the thread is on.
    if (ourNumber && !existing.our_number) {
      db.prepare('UPDATE conversations SET our_number = ? WHERE id = ?').run(ourNumber, existing.id);
    }
    return existing.id;
  }
  const result = db.prepare(
    'INSERT INTO conversations (user_id, peer_phone, our_number, last_message_at) VALUES (?, ?, ?, ?)'
  ).run(userId, peerPhone, ourNumber ?? null, Date.now());
  return Number(result.lastInsertRowid);
}

export interface AgentRow {
  id: number;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  role: string | null;
  persona: string;
  instructions: string;
  examples_json: string;
  rules_json: string;
  mode: 'off' | 'suggest' | 'auto';
  voice_mode: 'off' | 'suggest' | 'auto';
  is_default: number;
  created_at: number;
  updated_at: number;
}

export function getDefaultAgent(userId: string): AgentRow | null {
  let row = db.prepare(
    `SELECT * FROM agents WHERE user_id = ? AND is_default = 1 LIMIT 1`
  ).get(userId) as AgentRow | undefined;
  if (!row) {
    // First-run fallback: create a Default agent so the system has something.
    const now = Date.now();
    const r = db.prepare(
      `INSERT INTO agents (user_id, name, emoji, color, role, mode, voice_mode, is_default, created_at, updated_at)
       VALUES (?, 'Default', '🤖', 'lime', 'personal', 'off', 'off', 1, ?, ?)`
    ).run(userId, now, now);
    row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(Number(r.lastInsertRowid)) as AgentRow;
  }
  return row || null;
}

export function getAgentForConversation(userId: string, conversationId: number): AgentRow | null {
  const conv = db.prepare(
    `SELECT agent_id FROM conversations WHERE id = ? AND user_id = ?`
  ).get(conversationId, userId) as { agent_id: number | null } | undefined;
  if (conv?.agent_id) {
    const a = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(conv.agent_id) as AgentRow | undefined;
    if (a) return a;
  }
  return getDefaultAgent(userId);
}

export function hydrateAgent(a: AgentRow) {
  return {
    ...a,
    examples: safeJSON(a.examples_json, [] as { in: string; out: string }[]),
    rules: safeJSON(a.rules_json, [] as string[]),
  };
}

function safeJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export interface AppSettings {
  user_id: string;
  active_number: string | null;
  active_number_sid: string | null;
  onboarded: number;
  credits: number;
  updated_at: number;
}

export function getAppSettings(userId: string): AppSettings {
  let row = db.prepare(`SELECT * FROM app_settings WHERE user_id = ?`).get(userId) as AppSettings | undefined;
  if (!row) {
    db.prepare(`INSERT INTO app_settings (user_id, updated_at) VALUES (?, ?)`).run(userId, Date.now());
    row = db.prepare(`SELECT * FROM app_settings WHERE user_id = ?`).get(userId) as AppSettings;
  }
  return row;
}

export function setActiveNumber(userId: string, number: string, sid: string) {
  getAppSettings(userId); // ensure row exists
  db.prepare(
    `UPDATE app_settings SET active_number = ?, active_number_sid = ?, onboarded = 1, updated_at = ? WHERE user_id = ?`
  ).run(number, sid, Date.now(), userId);
}

/** Drop the account back to the shared default line (e.g. after its purchased
 *  number is released on subscription cancel). */
export function clearActiveNumber(userId: string) {
  db.prepare(
    `UPDATE app_settings SET active_number = NULL, active_number_sid = NULL, updated_at = ? WHERE user_id = ?`
  ).run(Date.now(), userId);
}

// The number to send/call FROM: the user's provisioned number, else env default.
export function getActiveNumber(userId: string): string {
  const s = getAppSettings(userId);
  return s.active_number || process.env.TWILIO_DEFAULT_FROM_NUMBER || '';
}

// ---- tokens (aliased internally as "credits" for backward compat) ----
// User-facing copy says "tokens" everywhere as of Phase 1 of the
// roadmap; the column kept the legacy `credits` name so the migration
// is purely additive (no data rewrite).
//
// Action labels used in the ledger meta. Keep them open-ended (string)
// so new actions don't need a schema change; the listed set is what
// the UI knows how to render in the spend chart.
export type TokenAction =
  | 'sms_out'
  | 'mms_out'
  | 'voice_out'
  | 'ai_text'
  | 'voice_clone'
  | 'image_gen'
  | 'topup'
  | 'allowance_reset'
  | 'refund'
  | 'manual_grant';

export function getCredits(userId: string): number {
  return getAppSettings(userId).credits ?? 0;
}
// Internal — writes a ledger entry. Called by every grant/spend path so
// the ledger never gets out of sync with the balance column.
function writeLedger(
  userId: string,
  action: TokenAction,
  amount: number,
  balanceAfter: number,
  meta?: Record<string, unknown>,
): void {
  try {
    db.prepare(
      `INSERT INTO token_ledger (user_id, action, amount, balance_after, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      action,
      amount,
      balanceAfter,
      meta ? JSON.stringify(meta) : null,
      Date.now(),
    );
  } catch (e) {
    // Never let ledger failure break a real spend — log + continue.
    log.error('db.tokens', 'ledger write failed', e);
  }
}
/**
 * Grant tokens. Logs an entry with the given action (e.g. 'topup',
 * 'allowance_reset', 'refund'). Returns the new balance.
 */
export function addCredits(
  userId: string,
  amount: number,
  action: TokenAction = 'manual_grant',
  meta?: Record<string, unknown>,
): number {
  getAppSettings(userId);
  db.prepare(`UPDATE app_settings SET credits = credits + ?, updated_at = ? WHERE user_id = ?`)
    .run(amount, Date.now(), userId);
  const bal = getCredits(userId);
  writeLedger(userId, action, amount, bal, meta);
  return bal;
}
/**
 * Atomically spend tokens. Returns true if spent, false if insufficient.
 * On success, writes a ledger entry with the given action + meta.
 */
export function spendCredits(
  userId: string,
  amount: number,
  action: TokenAction = 'manual_grant',
  meta?: Record<string, unknown>,
): boolean {
  getAppSettings(userId);
  const r = db.prepare(
    `UPDATE app_settings SET credits = credits - ?, updated_at = ? WHERE user_id = ? AND credits >= ?`
  ).run(amount, Date.now(), userId, amount);
  if (r.changes > 0) {
    writeLedger(userId, action, -amount, getCredits(userId), meta);
    return true;
  }
  return false;
}
/**
 * Recent ledger entries (most recent first). Used by the Tokens page
 * to show "where did my tokens go" + the spend chart aggregation.
 */
export function getLedger(
  userId: string,
  limit = 200,
): { id: number; action: TokenAction; amount: number; balance_after: number; meta: Record<string, unknown> | null; created_at: number }[] {
  const rows = db.prepare(
    `SELECT id, action, amount, balance_after, meta_json, created_at
       FROM token_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  ).all(userId, limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    amount: r.amount,
    balance_after: r.balance_after,
    meta: r.meta_json ? (() => { try { return JSON.parse(r.meta_json); } catch { return null; } })() : null,
    created_at: r.created_at,
  }));
}
/** SMS = 1 credit / 160-char segment (min 1). MMS = flat 3 credits. */
export function messageCost(body: string, hasMedia: boolean): number {
  if (hasMedia) return 3;
  return Math.max(1, Math.ceil((body || '').length / 160));
}
export const MMS_MAX_CHARS = 560;

// ---- SMS compliance (carrier-required opt-out) ----
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out']);
const START_WORDS = new Set(['start', 'unstop', 'yes', 'optin', 'opt-in']);
const HELP_WORDS = new Set(['help', 'info']);
export type ComplianceKind = 'stop' | 'start' | 'help' | null;

export function classifyCompliance(body: string): ComplianceKind {
  const w = (body || '').trim().toLowerCase().replace(/[^\w-]/g, '');
  if (STOP_WORDS.has(w)) return 'stop';
  if (START_WORDS.has(w)) return 'start';
  if (HELP_WORDS.has(w)) return 'help';
  return null;
}
export function setOptOut(userId: string, phone: string, optedOut: boolean) {
  // Ensure the contact row exists so the flag sticks even for unknown senders.
  db.prepare(
    `INSERT INTO contacts (user_id, phone, name, opted_out) VALUES (?, ?, '', ?)
     ON CONFLICT(user_id, phone) DO UPDATE SET opted_out = ?`
  ).run(userId, phone, optedOut ? 1 : 0, optedOut ? 1 : 0);
}
export function isOptedOut(userId: string, phone: string): boolean {
  const r = db.prepare(`SELECT opted_out FROM contacts WHERE user_id = ? AND phone = ?`).get(userId, phone) as any;
  return !!r?.opted_out;
}

// ---- Voice opt-out (separate from SMS opt-out) ----
// Voice and SMS are distinct channels, so a contact flagged voice_opted_out is
// excluded from automated call campaigns regardless of SMS opt-in state. Read
// as a defensive pre-dial filter in the agent-calls send path.
export function isVoiceOptedOut(userId: string, phone: string): boolean {
  const r = db.prepare(`SELECT voice_opted_out FROM contacts WHERE user_id = ? AND phone = ?`).get(userId, phone) as any;
  return !!r?.voice_opted_out;
}

// ---- Outbound agent-call cost ----
// Twilio outbound voice (US local/TF) runs ~$0.014/min; pick a flat per-call
// budget covering ~1.5 min of audio + carrier surcharges. 10 credits = $0.10
// at the same rate SMS uses ($5 / 500 credits = $0.01 per credit), giving
// the user a clear "one call ≈ ten SMS" mental model.
export const VOICE_CALL_COST = 10;
export function voiceCallCost(): number { return VOICE_CALL_COST; }

// ---- Quiet hours (TCPA: no automated calls outside 8am–9pm local time) ----
// We don't store recipient timezones, so we use the SENDER's tz as a proxy.
// Until per-recipient tz is available, this is the conservative call: a 9am
// blast from a PT-based business won't fire until 11am ET locally — better
// to be safe by default than expose the user to TCPA risk for a few extra
// "ringing at 7am" minutes saved.
export function isInQuietHours(userId: string, now = new Date()): boolean {
  const s = getAppSettings(userId) as any;
  // tz offset in MINUTES east of UTC. Default America/Los_Angeles (PT, -480
  // in winter / -420 in summer — use a static -480 as a safe default; a
  // DST-aware version would use Intl.DateTimeFormat).
  const tzMin = typeof s.quiet_hours_tz_offset === 'number' ? s.quiet_hours_tz_offset : -480;
  const localMs = now.getTime() + tzMin * 60 * 1000;
  const localHour = new Date(localMs).getUTCHours();   // 0-23 in target tz
  // Allowed window: 08:00 ≤ hour < 21:00 (so up to but not including 9pm).
  return !(localHour >= 8 && localHour < 21);
}

// ---- subscriptions ----
export function recordSubscription(userId: string, plan: string, ref: string | null, status: string, stripeSubId?: string) {
  const now = Date.now();
  const existing = db.prepare(
    `SELECT id FROM subscriptions WHERE user_id=? AND plan=? AND IFNULL(ref,'')=IFNULL(?, '')`
  ).get(userId, plan, ref) as { id: number } | undefined;
  if (existing) {
    db.prepare(`UPDATE subscriptions SET status=?, stripe_sub_id=COALESCE(?, stripe_sub_id), updated_at=? WHERE id=?`)
      .run(status, stripeSubId || null, now, existing.id);
    return existing.id;
  }
  const r = db.prepare(
    `INSERT INTO subscriptions (user_id, plan, ref, stripe_sub_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, plan, ref, stripeSubId || null, status, now, now);
  return Number(r.lastInsertRowid);
}
export function listSubscriptions(userId: string) {
  return db.prepare(`SELECT plan, ref, status, created_at FROM subscriptions WHERE user_id=? ORDER BY created_at DESC`).all(userId);
}
/** True if the account holds a usable subscription to `plan`. 'dev' counts so
 *  the no-Stripe local flow still unlocks gated features. */
export function hasActiveSubscription(userId: string, plan: string): boolean {
  return !!db.prepare(
    `SELECT 1 FROM subscriptions WHERE user_id=? AND plan=? AND status IN ('active','dev') LIMIT 1`
  ).get(userId, plan);
}
export function setSubscriptionStatusByStripeId(stripeSubId: string, status: string) {
  db.prepare(`UPDATE subscriptions SET status=?, updated_at=? WHERE stripe_sub_id=?`).run(status, Date.now(), stripeSubId);
}

// ─────────────────── Blog ───────────────────
export interface BlogPost {
  id: number; slug: string; title: string; excerpt: string; body_html: string;
  tags: string; keywords: string; status: 'draft' | 'published'; author: string;
  ai: number; created_at: number; updated_at: number; published_at: number | null;
}
export interface BlogSettings {
  id: number; enabled: number; cadence_days: number; autopublish: number;
  tone: string; topics: string; last_run_at: number | null;
  next_run_at: number | null; updated_at: number;
}

export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70).replace(/^-|-$/g, '');
}

export function uniqueSlug(base: string): string {
  let slug = slugify(base) || 'post';
  let n = 1;
  while (db.prepare(`SELECT 1 FROM blog_posts WHERE slug = ?`).get(slug)) {
    slug = `${slugify(base)}-${++n}`;
  }
  return slug;
}

export function listBlogPosts(opts: { includeDrafts?: boolean; limit?: number } = {}): BlogPost[] {
  const where = opts.includeDrafts ? '' : `WHERE status = 'published'`;
  const lim = opts.limit ? `LIMIT ${Number(opts.limit)}` : '';
  return db.prepare(
    `SELECT * FROM blog_posts ${where} ORDER BY COALESCE(published_at, created_at) DESC ${lim}`
  ).all() as BlogPost[];
}
export function getBlogPostBySlug(slug: string): BlogPost | null {
  return (db.prepare(`SELECT * FROM blog_posts WHERE slug = ?`).get(slug) as BlogPost) || null;
}
export function getBlogPost(id: number): BlogPost | null {
  return (db.prepare(`SELECT * FROM blog_posts WHERE id = ?`).get(id) as BlogPost) || null;
}
export function createBlogPost(p: {
  title: string; excerpt?: string; body_html?: string; tags?: string;
  keywords?: string; status?: 'draft' | 'published'; author?: string; ai?: boolean; slug?: string;
}): BlogPost {
  const now = Date.now();
  const slug = uniqueSlug(p.slug || p.title);
  const status = p.status === 'published' ? 'published' : 'draft';
  const r = db.prepare(
    `INSERT INTO blog_posts (slug, title, excerpt, body_html, tags, keywords, status, author, ai, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    slug, p.title, p.excerpt || '', sanitizeBodyHtml(p.body_html || ''), p.tags || '', p.keywords || '',
    status, p.author || 'WrkPhn AI', p.ai ? 1 : 0, now, now,
    status === 'published' ? now : null,
  );
  return getBlogPost(Number(r.lastInsertRowid))!;
}
export function updateBlogPost(id: number, patch: Partial<BlogPost>): BlogPost | null {
  const cur = getBlogPost(id);
  if (!cur) return null;
  const next = {
    title: patch.title ?? cur.title,
    excerpt: patch.excerpt ?? cur.excerpt,
    body_html: patch.body_html !== undefined ? sanitizeBodyHtml(patch.body_html) : cur.body_html,
    tags: patch.tags ?? cur.tags,
    keywords: patch.keywords ?? cur.keywords,
    status: (patch.status as string) ?? cur.status,
    author: patch.author ?? cur.author,
  };
  const wasPublished = cur.status === 'published';
  const publishedAt = next.status === 'published'
    ? (cur.published_at || Date.now())
    : (next.status === 'draft' && wasPublished ? null : cur.published_at);
  db.prepare(
    `UPDATE blog_posts SET title=?, excerpt=?, body_html=?, tags=?, keywords=?, status=?, author=?, updated_at=?, published_at=? WHERE id=?`
  ).run(next.title, next.excerpt, next.body_html, next.tags, next.keywords, next.status, next.author, Date.now(), publishedAt, id);
  return getBlogPost(id);
}
export function deleteBlogPost(id: number) {
  db.prepare(`DELETE FROM blog_posts WHERE id = ?`).run(id);
}

export function getBlogSettings(): BlogSettings {
  let row = db.prepare(`SELECT * FROM blog_settings WHERE id = 1`).get() as BlogSettings | undefined;
  if (!row) {
    db.prepare(`INSERT INTO blog_settings (id, updated_at) VALUES (1, ?)`).run(Date.now());
    row = db.prepare(`SELECT * FROM blog_settings WHERE id = 1`).get() as BlogSettings;
  }
  return row;
}
export function saveBlogSettings(patch: Partial<BlogSettings>): BlogSettings {
  const cur = getBlogSettings();
  const n = {
    enabled: patch.enabled != null ? (patch.enabled ? 1 : 0) : cur.enabled,
    cadence_days: patch.cadence_days != null ? Math.max(1, Number(patch.cadence_days)) : cur.cadence_days,
    autopublish: patch.autopublish != null ? (patch.autopublish ? 1 : 0) : cur.autopublish,
    tone: patch.tone != null ? String(patch.tone) : cur.tone,
    topics: patch.topics != null ? String(patch.topics) : cur.topics,
    last_run_at: patch.last_run_at !== undefined ? patch.last_run_at : cur.last_run_at,
    next_run_at: patch.next_run_at !== undefined ? patch.next_run_at : cur.next_run_at,
  };
  db.prepare(
    `UPDATE blog_settings SET enabled=?, cadence_days=?, autopublish=?, tone=?, topics=?, last_run_at=?, next_run_at=?, updated_at=? WHERE id=1`
  ).run(n.enabled, n.cadence_days, n.autopublish, n.tone, n.topics, n.last_run_at, n.next_run_at, Date.now());
  return getBlogSettings();
}
