// Toll-Free Verification (TFV).
//
// US/Canada toll-free numbers cannot send SMS reliably until they pass
// Twilio's Toll-Free Verification review (separate from 10DLC, ~days). Voice
// works immediately; SMS is filtered/blocked until verified. This module
// reads verification status from Twilio and caches it onto
// account_numbers.tfv_status so the UI can surface whether a TF number can text.

import { twilioClient } from './twilio.js';
import { db } from './db.js';
import { log } from './log.js';

export type TfvStatus = 'pending' | 'in_review' | 'verified' | 'rejected' | 'unverified';

// Twilio's verification status strings → our compact set. `unverified` covers
// "no verification record exists yet" as well as any unrecognized value.
function normalize(raw: string | null | undefined): TfvStatus {
  switch (String(raw || '').toUpperCase()) {
    case 'TWILIO_APPROVED': return 'verified';
    case 'TWILIO_REJECTED': return 'rejected';
    case 'IN_REVIEW':       return 'in_review';
    case 'PENDING_REVIEW':  return 'pending';
    default:                return 'unverified';
  }
}

/**
 * Every toll-free verification on the Twilio account, keyed by the verified
 * number's Twilio SID. Defensive: returns an empty map on any API failure or
 * if the SDK/account lacks Toll-Free Verification access.
 */
export async function listTfvByNumberSid(): Promise<Map<string, TfvStatus>> {
  const out = new Map<string, TfvStatus>();
  try {
    // `as any`: the TFV resource may be untyped on older twilio SDKs — same
    // defensive pattern a2p.ts uses for the A2P brand-registration resource.
    const tfv: any = (twilioClient.messaging.v1 as any).tollfreeVerifications;
    if (!tfv?.list) {
      log.warn('tollfree', 'tollfreeVerifications API not available on this SDK/account');
      return out;
    }
    const verifications = await tfv.list({ limit: 200 });
    for (const v of verifications as any[]) {
      if (v?.tollfreePhoneNumberSid) out.set(v.tollfreePhoneNumberSid, normalize(v.status));
    }
  } catch (e) {
    log.warn('tollfree', 'could not list toll-free verifications', e);
  }
  return out;
}

/**
 * Refresh account_numbers.tfv_status for all toll-free numbers from Twilio.
 * Returns the count of rows updated. Safe to call on demand or on a schedule.
 */
export async function refreshTfvStatuses(): Promise<number> {
  const statuses = await listTfvByNumberSid();
  if (statuses.size === 0) return 0;

  const rows = db.prepare(
    `SELECT id, twilio_sid FROM account_numbers
     WHERE type = 'tollfree' AND twilio_sid IS NOT NULL`
  ).all() as { id: number; twilio_sid: string }[];

  const update = db.prepare(`UPDATE account_numbers SET tfv_status = ? WHERE id = ?`);
  let updated = 0;
  db.transaction(() => {
    for (const r of rows) {
      const status = statuses.get(r.twilio_sid);
      if (status) { update.run(status, r.id); updated++; }
    }
  })();
  return updated;
}
