// Per-account phone number management (multi-tenant foundation).
//
// Model: every account gets ONE toll-free number free at signup, drawn at
// random from a pre-bought pool (status='pool', user_id=NULL). Accounts may
// also purchase extra local numbers ($2 activation + $2/mo passthrough).
// `account_numbers` is the single source of truth for which account owns
// which number — inbound webhooks resolve the owner from the dialed number.

import { db } from './db.js';
import { OWNER_ID } from './auth.js';

export interface AccountNumber {
  id: number;
  user_id: string | null;            // NULL = unassigned pool inventory
  phone: string;                     // E.164
  twilio_sid: string | null;         // Twilio IncomingPhoneNumber SID
  type: 'tollfree' | 'local';
  is_default: number;                // 1 = the account's default sending line
  status: 'pool' | 'active' | 'pending' | 'released';
  tfv_status: string | null;         // toll-free verification status
  monthly_cost_cents: number;
  activation_paid: number;
  stripe_sub_id: string | null;
  created_at: number;
  assigned_at: number | null;
  released_at: number | null;
}

// NANP toll-free area codes.
const TOLLFREE_AREA_CODES = new Set(['800', '833', '844', '855', '866', '877', '888']);

/** True for a US/Canada toll-free E.164 number (+1 8XX …). */
export function isTollFree(e164: string): boolean {
  const m = /^\+1(\d{3})\d{7}$/.exec((e164 || '').trim());
  return !!m && TOLLFREE_AREA_CODES.has(m[1]);
}

type PoolEntry = { phone: string; twilioSid?: string | null; type?: 'tollfree' | 'local' };

/**
 * Register numbers as unassigned pool inventory. Phones already present are
 * skipped (the `phone` column is UNIQUE). Returns counts.
 */
export function importToPool(entries: PoolEntry[]): { added: number; skipped: number } {
  const now = Date.now();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO account_numbers (phone, twilio_sid, type, status, created_at)
     VALUES (?, ?, ?, 'pool', ?)`
  );
  let added = 0;
  db.transaction((rows: PoolEntry[]) => {
    for (const e of rows) {
      const phone = String(e.phone || '').trim();
      if (!phone) continue;
      const type = e.type || (isTollFree(phone) ? 'tollfree' : 'local');
      if (insert.run(phone, e.twilioSid ?? null, type, now).changes > 0) added++;
    }
  })(entries);
  return { added, skipped: entries.length - added };
}

/**
 * Claim a random unassigned toll-free number for an account. Atomic — two
 * concurrent signups cannot grab the same number. Returns null if the pool
 * is empty (caller must handle exhaustion). The account's first number
 * becomes its default sending line.
 */
export function assignFromPool(userId: string): AccountNumber | null {
  return db.transaction((uid: string): AccountNumber | null => {
    const pick = db.prepare(
      `SELECT id FROM account_numbers
       WHERE status = 'pool' AND user_id IS NULL AND type = 'tollfree'
       ORDER BY RANDOM() LIMIT 1`
    ).get() as { id: number } | undefined;
    if (!pick) return null;

    const hasDefault = db.prepare(
      `SELECT 1 FROM account_numbers
       WHERE user_id = ? AND status = 'active' AND is_default = 1 LIMIT 1`
    ).get(uid);
    db.prepare(
      `UPDATE account_numbers
       SET user_id = ?, status = 'active', is_default = ?, assigned_at = ?
       WHERE id = ?`
    ).run(uid, hasDefault ? 0 : 1, Date.now(), pick.id);

    return db.prepare(`SELECT * FROM account_numbers WHERE id = ?`).get(pick.id) as AccountNumber;
  })(userId);
}

/**
 * Pick a random toll-free number from the shared pool WITHOUT consuming it.
 *
 * Sharing model: many accounts may be assigned the same toll-free number
 * (the pool is small and intentionally recycled), so assignment must never
 * remove a number from availability — unlike assignFromPool(), which is the
 * exclusive-ownership path. Returns null if the account has no toll-free
 * numbers at all.
 */
export function pickSharedTollfree(): { phone: string; twilioSid: string | null } | null {
  const row = db.prepare(
    `SELECT phone, twilio_sid FROM account_numbers
     WHERE type = 'tollfree' AND status IN ('pool', 'active')
     ORDER BY RANDOM() LIMIT 1`
  ).get() as { phone: string; twilio_sid: string | null } | undefined;
  return row ? { phone: row.phone, twilioSid: row.twilio_sid } : null;
}

/** All of an account's live numbers, default first. */
export function listAccountNumbers(userId: string): AccountNumber[] {
  return db.prepare(
    `SELECT * FROM account_numbers
     WHERE user_id = ? AND status != 'released'
     ORDER BY is_default DESC, created_at ASC`
  ).all(userId) as AccountNumber[];
}

/** The account's default sending line, or null if it has none. */
export function getDefaultNumber(userId: string): AccountNumber | null {
  return (db.prepare(
    `SELECT * FROM account_numbers
     WHERE user_id = ? AND status = 'active' AND is_default = 1 LIMIT 1`
  ).get(userId) as AccountNumber | undefined) ?? null;
}

/** Switch which of the account's numbers is the default. Returns false if the
 *  number isn't an active number owned by this account. */
export function setDefaultNumber(userId: string, id: number): boolean {
  return db.transaction((uid: string, numId: number): boolean => {
    const owned = db.prepare(
      `SELECT 1 FROM account_numbers
       WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1`
    ).get(numId, uid);
    if (!owned) return false;
    db.prepare(`UPDATE account_numbers SET is_default = 0 WHERE user_id = ?`).run(uid);
    db.prepare(`UPDATE account_numbers SET is_default = 1 WHERE id = ?`).run(numId);
    return true;
  })(userId, id);
}

/** Record a number the account purchased (e.g. a paid local number). */
export function addPurchasedNumber(userId: string, opts: {
  phone: string;
  twilioSid?: string | null;
  type?: 'tollfree' | 'local';
  monthlyCostCents?: number;
  activationPaid?: boolean;
  stripeSubId?: string | null;
  makeDefault?: boolean;
}): AccountNumber {
  const now = Date.now();
  const phone = opts.phone.trim();
  const type = opts.type || (isTollFree(phone) ? 'tollfree' : 'local');
  return db.transaction((): AccountNumber => {
    const hasDefault = db.prepare(
      `SELECT 1 FROM account_numbers
       WHERE user_id = ? AND status = 'active' AND is_default = 1 LIMIT 1`
    ).get(userId);
    const makeDefault = opts.makeDefault || !hasDefault;
    if (makeDefault) {
      db.prepare(`UPDATE account_numbers SET is_default = 0 WHERE user_id = ?`).run(userId);
    }
    const r = db.prepare(
      `INSERT INTO account_numbers
         (user_id, phone, twilio_sid, type, is_default, status, monthly_cost_cents,
          activation_paid, stripe_sub_id, created_at, assigned_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
    ).run(
      userId, phone, opts.twilioSid ?? null, type, makeDefault ? 1 : 0,
      opts.monthlyCostCents ?? 0, opts.activationPaid ? 1 : 0,
      opts.stripeSubId ?? null, now, now,
    );
    return db.prepare(`SELECT * FROM account_numbers WHERE id = ?`)
      .get(Number(r.lastInsertRowid)) as AccountNumber;
  })();
}

/** Mark a number released (cancelled). Does not touch Twilio — callers that
 *  also need to release it on Twilio's side must do so separately. */
export function releaseNumber(id: number): void {
  db.prepare(
    `UPDATE account_numbers SET status = 'released', is_default = 0, released_at = ? WHERE id = ?`
  ).run(Date.now(), id);
}

/** Update a number's cached toll-free verification status. */
export function setTfvStatus(phone: string, status: string | null): void {
  db.prepare(`UPDATE account_numbers SET tfv_status = ? WHERE phone = ?`).run(status, phone.trim());
}

/**
 * The account that owns a given number, or null if none does. Used by inbound
 * webhooks to route a call/text to the right account's inbox.
 */
export function ownerForNumber(e164: string): string | null {
  const phone = (e164 || '').trim();
  if (!phone) return null;
  const row = db.prepare(
    `SELECT user_id FROM account_numbers
     WHERE phone = ? AND status = 'active' AND user_id IS NOT NULL LIMIT 1`
  ).get(phone) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

/**
 * Resolve the owning account for an inbound webhook.
 *
 * Routing order:
 *  1. EXCLUSIVE owner — a purchased (10DLC) number belongs to exactly one
 *     account; that account always wins.
 *  2. SHARED toll-free — many accounts may share the number, so the dialed
 *     number alone is ambiguous. Disambiguate by the contact: if exactly one
 *     account already has a conversation with this peer ON THIS number, the
 *     inbound is a reply to that thread → route there.
 *  3. UNATTRIBUTABLE → null. Cold inbound (no prior thread) or a collision
 *     (multiple accounts both have a thread with this contact on a shared
 *     number) can't be assigned to anyone — per product decision the inbound
 *     is dropped. Callers MUST treat null as "ignore this webhook."
 *
 * Existing conversations are backfilled with our_number at migration time, so
 * a reply to an established thread always hits step 2 — only genuinely cold
 * inbound returns null.
 */
export function resolveInboundOwner(toNumber: string, fromPeer?: string): string | null {
  const dialed = (toNumber || '').trim();
  // 1. Exclusive owner (purchased number).
  const exclusive = ownerForNumber(dialed);
  if (exclusive) return exclusive;
  // 2. Shared toll-free — disambiguate by the contact.
  const peer = (fromPeer || '').trim();
  if (dialed && peer) {
    const matches = db.prepare(
      `SELECT DISTINCT user_id FROM conversations
       WHERE our_number = ? AND peer_phone = ? AND user_id IS NOT NULL`
    ).all(dialed, peer) as { user_id: string }[];
    if (matches.length === 1) return matches[0].user_id;
  }
  // 3. Cold inbound or collision — unattributable, drop it.
  return null;
}

/** Pool inventory summary (toll-free), for the superadmin dashboard. */
export function poolStats(): {
  total: number;
  available: number;
  assignedTollfree: number;
  activeLocal: number;
  released: number;
} {
  const row = db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'pool'   AND type = 'tollfree' THEN 1 ELSE 0 END) AS available,
       SUM(CASE WHEN status = 'active' AND type = 'tollfree' THEN 1 ELSE 0 END) AS assignedTollfree,
       SUM(CASE WHEN status = 'active' AND type = 'local'    THEN 1 ELSE 0 END) AS activeLocal,
       SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) AS released
     FROM account_numbers`
  ).get() as Record<string, number>;
  return {
    total: row.total || 0,
    available: row.available || 0,
    assignedTollfree: row.assignedTollfree || 0,
    activeLocal: row.activeLocal || 0,
    released: row.released || 0,
  };
}
