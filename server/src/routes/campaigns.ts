import { Router } from 'express';
import { db } from '../lib/db.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { spendCredits, addCredits, getCredits, messageCost, isOptedOut } from '../lib/db.js';
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
      const pending = db.prepare(
        `SELECT phone FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'`
      ).all(c.id) as { phone: string }[];
      let refunded = 0;
      for (const p of pending) {
        const cost = messageCost(String(c.template), !!c.media_url);
        addCredits(c.user_id, cost);
        refunded += cost;
      }
      db.prepare(`UPDATE campaigns SET status = 'draft' WHERE id = ?`).run(c.id);
      log.warn('campaigns.recover',
        `campaign ${c.id} ("${c.name}") was 'sending' at boot — refunded ${refunded} credits for ${pending.length} unsent recipients and reset to draft`);
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

  db.prepare(`UPDATE campaigns SET status = 'sending' WHERE id = ?`).run(id);
  res.json({ ok: true, started: work.filter((w) => !w.optedOut).length, reserved: reserve });

  // Fire-and-forget send loop with light throttling. Cost is already reserved;
  // every recipient we DON'T send (opt-out or hard Twilio failure) refunds its
  // own portion so the ledger reconciles to exactly what was sent.
  (async () => {
    let sent = 0;
    for (const { r, body, cost, optedOut } of work) {
      if (optedOut) {
        db.prepare(`UPDATE campaign_recipients SET status = 'failed', error = 'opted out (STOP)' WHERE id = ?`).run(r.id);
        continue;
      }
      try {
        const params: any = { to: r.phone, body };
        if (campaign.media_url) params.mediaUrl = [campaign.media_url];   // MMS
        if (twilioConfig.messagingServiceSid) params.messagingServiceSid = twilioConfig.messagingServiceSid;
        else params.from = twilioConfig.defaultFrom;
        // Note: For RCS, requires a Messaging Service configured with an RCS sender
        // (Twilio routes RCS via the same Messaging Service automatically when supported).
        const msg = await twilioClient.messages.create(params);
        db.prepare(
          `UPDATE campaign_recipients SET status = 'sent', twilio_sid = ? WHERE id = ?`
        ).run(msg.sid, r.id);
        sent++;
      } catch (err: any) {
        addCredits(USER, cost); // refund — this one never went out
        db.prepare(
          `UPDATE campaign_recipients SET status = 'failed', error = ? WHERE id = ?`
        ).run(err.message?.slice(0, 500) || 'error', r.id);
      }
      db.prepare(`UPDATE campaigns SET sent_count = ? WHERE id = ?`).run(sent, id);
      // throttle ~1 per 100ms = 10/s, well under default Twilio limits
      await new Promise((res) => setTimeout(res, 100));
    }
    db.prepare(`UPDATE campaigns SET status = 'done' WHERE id = ?`).run(id);
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
