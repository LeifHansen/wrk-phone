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
  log.warn('db.migrate', 'legacy agent_settings migration failed', e);
}

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
