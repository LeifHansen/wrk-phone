import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

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

  -- Indexes for hot read paths (defined last; all tables exist by here).
  CREATE INDEX IF NOT EXISTS idx_conversations_user_recent ON conversations(user_id, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_campaign_recipients ON campaign_recipients(campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_user_name ON contacts(user_id, name);
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

// Migrate legacy agent_settings (single row per user) into agents.
try {
  const legacy = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_settings'`
  ).get();
  if (legacy) {
    const rows = db.prepare(`SELECT * FROM agent_settings`).all() as any[];
    for (const r of rows) {
      const exists = db.prepare(
        `SELECT id FROM agents WHERE user_id = ? AND name = ?`
      ).get(r.user_id, 'Default') as { id: number } | undefined;
      if (exists) continue;
      const now = Date.now();
      db.prepare(
        `INSERT INTO agents (user_id, name, emoji, color, role, persona, instructions, examples_json,
                             mode, voice_mode, is_default, created_at, updated_at)
         VALUES (?, 'Default', '🤖', 'lime', 'personal', ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        r.user_id,
        r.persona || '',
        r.instructions || '',
        r.examples_json || '[]',
        r.mode || 'off',
        r.voice_mode || 'off',
        now,
        now
      );
    }
  }
} catch (e) {
  console.warn('legacy agent_settings migration failed', e);
}

export function getOrCreateConversation(userId: string, peerPhone: string): number {
  const existing = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? AND peer_phone = ?'
  ).get(userId, peerPhone) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(
    'INSERT INTO conversations (user_id, peer_phone, last_message_at) VALUES (?, ?, ?)'
  ).run(userId, peerPhone, Date.now());
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

// The number to send/call FROM: the user's provisioned number, else env default.
export function getActiveNumber(userId: string): string {
  const s = getAppSettings(userId);
  return s.active_number || process.env.TWILIO_DEFAULT_FROM_NUMBER || '';
}

// ---- credits ----
export function getCredits(userId: string): number {
  return getAppSettings(userId).credits ?? 0;
}
export function addCredits(userId: string, amount: number): number {
  getAppSettings(userId);
  db.prepare(`UPDATE app_settings SET credits = credits + ?, updated_at = ? WHERE user_id = ?`)
    .run(amount, Date.now(), userId);
  return getCredits(userId);
}
/** Atomically spend credits. Returns true if spent, false if insufficient. */
export function spendCredits(userId: string, amount: number): boolean {
  getAppSettings(userId);
  const r = db.prepare(
    `UPDATE app_settings SET credits = credits - ?, updated_at = ? WHERE user_id = ? AND credits >= ?`
  ).run(amount, Date.now(), userId, amount);
  return r.changes > 0;
}
/** SMS = 1 credit / 160-char segment (min 1). MMS = flat 3 credits. */
export function messageCost(body: string, hasMedia: boolean): number {
  if (hasMedia) return 3;
  return Math.max(1, Math.ceil((body || '').length / 160));
}
export const MMS_MAX_CHARS = 560;
