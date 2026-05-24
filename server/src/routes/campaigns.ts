import { Router } from 'express';
import { db } from '../lib/db.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { spendCredits, addCredits, getCredits, messageCost, isOptedOut, getActiveNumber } from '../lib/db.js';
import { listSenderNumbers, isTollFree } from '../lib/numbers-store.js';
import { processBatch } from '../lib/messagingProcessor.js';
import { log } from '../lib/log.js';

export const campaignsRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// Recover campaigns left in 'sending' from a previous process (Fly deploy /
// OOM / crash mid-loop). Without this, the in-memory send loop is gone but
// the row is stuck at 'sending' forever and the reserved-but-unsent credits
// silently float. Refund every still-pending recipient and flip the campaign
// back to 'draft' so it can be re-sent. Idempotent — safe to call at every boot.
export function recoverInterruptedCampaigns(): void {
  try {
    const stuck = db.prepare(
      `SELECT * FROM campaigns WHERE status = 'sending'`
    ).all() as any[];
    for (const c of stuck) {
      // Only refund rows we hadn't yet handed to Twilio. A row WITH a
      // twilio_sid was already accepted by Twilio (it just won't get its
      // success-write because the process died) — those will resolve via
      // the SMS status callback when delivery completes. Refunding them
      // would credit the user for a message Twilio actually sent.
      const refundable = db.prepare(
        `SELECT id FROM campaign_recipients
          WHERE campaign_id = ? AND status = 'pending' AND twilio_sid IS NULL`
      ).all(c.id) as { id: number }[];
      const cost = messageCost(String(c.template), !!c.media_url);
      const refunded = refundable.length * cost;
      if (refunded > 0) addCredits(c.user_id, refunded);
      db.prepare(`UPDATE campaigns SET status = 'draft' WHERE id = ?`).run(c.id);
      log.warn('campaigns.recover',
        `campaign ${c.id} ("${c.name}") was 'sending' at boot — refunded ${refunded} credits for ${refundable.length} unsent recipients and reset to draft`);
    }
  } catch (e) {
    log.error('campaigns.recover', 'recovery sweep failed', e);
  }
}

// GET /api/campaigns
campaignsRouter.get('/campaigns', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC`
  ).all(USER);
  res.json(rows);
});

// POST /api/campaigns
// body: { name, template, channel?, mediaUrl?, recipients?, segmentId?, allContacts? }
// Recipients can be supplied directly, OR resolved from a contact segment,
// OR the entire contact list (allContacts=true).
campaignsRouter.post('/campaigns', (req, res) => {
  const name = String(req.body.name || '').trim();
  const template = String(req.body.template || '').trim();
  const channel = (['sms', 'rcs', 'mms'] as const).includes(req.body.channel) ? req.body.channel : 'sms';
  const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl) : null;

  let recipients: { phone: string; name?: string }[] = Array.isArray(req.body.recipients) ? req.body.recipients : [];
  if (req.body.segmentId) {
    recipients = db.prepare(
      `SELECT c.phone, c.name FROM contacts c
       JOIN contact_segments cs ON cs.contact_id = c.id
       WHERE c.user_id = ? AND cs.segment_id = ?`
    ).all(USER, Number(req.body.segmentId)) as any[];
  } else if (req.body.allContacts) {
    recipients = db.prepare(`SELECT phone, name FROM contacts WHERE user_id = ?`).all(USER) as any[];
  }

  if (!name || (!template && !mediaUrl) || recipients.length === 0) {
    return res.status(400).json({ error: 'name, template (or mediaUrl), and at least one recipient required' });
  }
  const cId = Number(
    db.prepare(
      `INSERT INTO campaigns (user_id, name, template, channel, total_count, created_at, status, media_url)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).run(USER, name, template, channel, recipients.length, Date.now(), mediaUrl).lastInsertRowid
  );
  const ins = db.prepare(
    `INSERT INTO campaign_recipients (campaign_id, phone, name) VALUES (?, ?, ?)`
  );
  const tx = db.transaction((rows: typeof recipients) => {
    for (const r of rows) ins.run(cId, r.phone, r.name || null);
  });
  tx(recipients);
  res.json({ id: cId });
});

// POST /api/campaigns/:id/send
campaignsRouter.post('/campaigns/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(id, USER) as any;
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'sending' || campaign.status === 'done') {
    return res.status(409).json({ error: `already ${campaign.status}` });
  }
  const recipients = db.prepare(
    `SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'`
  ).all(id) as any[];

  // Build the worklist up front so cost is known before we charge anything.
  // Opted-out recipients are excluded from the reservation (we never send to
  // them) and marked failed without a charge.
  const work = recipients.map((r) => {
    const body = String(campaign.template).replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');
    return { r, body, cost: messageCost(body, !!campaign.media_url), optedOut: isOptedOut(USER, r.phone) };
  });
  const reserve = work.reduce((sum, w) => sum + (w.optedOut ? 0 : w.cost), 0);

  // Atomically reserve the WHOLE campaign cost before sending. Either it all
  // fits (campaign runs to completion) or it doesn't start — no half-sent
  // campaign that aborts mid-loop on a transient balance dip. The campaign
  // stays 'draft' so it can be re-sent after a top-up.
  if (reserve > 0 && !spendCredits(USER, reserve)) {
    return res.status(402).json({
      error: `Not enough credits for this campaign. Needs ${reserve}, balance ${getCredits(USER)}.`,
      needed: reserve,
    });
  }

  // ORDER MATTERS for crash-safety: mark opted-out rows BEFORE flipping
  // the parent row to 'sending'. If we crash between status='sending' and
  // the pre-pass, recovery sees pending rows and refunds credits that were
  // never spent (over-refund bug from the first cut).
  for (const { r } of work.filter((w) => w.optedOut)) {
    db.prepare(`UPDATE campaign_recipients SET status = 'failed', error = 'opted out (STOP)' WHERE id = ?`).run(r.id);
  }
  db.prepare(`UPDATE campaigns SET status = 'sending' WHERE id = ?`).run(id);

  // Round-robin the campaign across every active sender number the account
  // owns. Fallback chain matches /sms/send: account_numbers → user's app_settings
  // active_number → env default. Without this fallback, legacy accounts whose
  // number only lives in app_settings would blast from the env default.
  const senderNumbers = listSenderNumbers(
    USER,
    getActiveNumber(USER) || twilioConfig.defaultFrom || undefined,
  );

  // Throttle floors per Twilio's documented limits:
  //   - Unverified toll-free: 1 msg/s, but bursts of 3 tolerated
  //   - 10DLC long codes: 10–30+ msg/s depending on T-Mobile cap
  // Detect TF in the lane set and dial-down throttle; assume the user has
  // 10DLC otherwise. This errs safe — TF mis-classified as 10DLC would 429.
  const tfOnly = senderNumbers.length > 0 && senderNumbers.every(isTollFree);
  const concurrencyPerLane = tfOnly ? 1 : 4;
  const perLaneMinIntervalMs = tfOnly ? 350 : 100;

  res.json({
    ok: true,
    started: work.filter((w) => !w.optedOut).length,
    reserved: reserve,
    lanes: senderNumbers.length,
    tollfree: tfOnly,
  });

  const billable = work.filter((w) => !w.optedOut);

  (async () => {
    let sent = 0;
    await processBatch(
      billable,
      async ({ r, body, cost }, from) => {
        try {
          const params: any = { to: r.phone, body, from };
          if (campaign.media_url) params.mediaUrl = [campaign.media_url];
          const msg = await twilioClient.messages.create(params);
          db.prepare(
            `UPDATE campaign_recipients SET status = 'sent', twilio_sid = ? WHERE id = ?`
          ).run(msg.sid, r.id);
          sent++;
          // Checkpoint every 25 — a 10k campaign goes from 10k writes to ~400.
          if (sent % 25 === 0) {
            db.prepare(`UPDATE campaigns SET sent_count = ? WHERE id = ?`).run(sent, id);
          }
        } catch (err: any) {
          addCredits(USER, cost); // refund — this row never went out
          db.prepare(
            `UPDATE campaign_recipients SET status = 'failed', error = ? WHERE id = ?`
          ).run((err.message || 'error').slice(0, 500), r.id);
          // Don't rethrow — processor's result-tracking is unused and the
          // route fully handles failure here. Throwing just doubles the log.
        }
      },
      { fromNumbers: senderNumbers, concurrencyPerLane, perLaneMinIntervalMs },
    );
    db.prepare(`UPDATE campaigns SET sent_count = ?, status = 'done' WHERE id = ?`).run(sent, id);
  })().catch((e) => {
    log.error('campaigns', `send loop crashed for campaign ${id}`, e);
    db.prepare(`UPDATE campaigns SET status = 'failed' WHERE id = ?`).run(id);
  });
});

campaignsRouter.get('/campaigns/:id', (req, res) => {
  const id = Number(req.params.id);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(id, USER);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  const recipients = db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ?').all(id);
  res.json({ campaign, recipients });
});
