import { Router } from 'express';
import {
  db,
  spendCredits, addCredits, getCredits,
  voiceCallCost, isVoiceOptedOut, isInQuietHours,
  getActiveNumber,
} from '../lib/db.js';
import { listSenderNumbers } from '../lib/numbers-store.js';
import { processBatch } from '../lib/messagingProcessor.js';
import { twilioClient } from '../lib/twilio.js';
import { log } from '../lib/log.js';

export const agentCallsRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

// ---------- live ----------
// Currently-active calls across ALL of this user's campaigns, with the
// last ~50 transcript chunks per call. Polled every ~2s by the Live
// Calls panel so the user can watch the conversation in real time.
agentCallsRouter.get('/agent-calls/live', (_req, res) => {
  const calls = db.prepare(
    `SELECT acr.id AS recipient_id, acr.phone, acr.name,
            acr.status, acr.twilio_sid, acr.answered_by, acr.duration_sec,
            ac.id AS campaign_id, ac.name AS campaign_name, ac.script,
            a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color
       FROM agent_call_recipients acr
       JOIN agent_calls ac ON ac.id = acr.agent_call_id
       LEFT JOIN agents a ON a.id = ac.agent_id
      WHERE ac.user_id = ?
        AND acr.status IN ('initiated','ringing','in-progress')
      ORDER BY acr.id DESC`
  ).all(USER) as any[];
  const out = calls.map((c) => {
    const transcript = c.twilio_sid
      ? db.prepare(
          `SELECT sequence, source, text, is_final, created_at
             FROM live_call_events
            WHERE call_sid = ? ORDER BY sequence DESC LIMIT 50`
        ).all(c.twilio_sid).reverse()
      : [];
    return { ...c, transcript };
  });
  res.json({ calls: out });
});

// Single-call transcript fetch for the expanded "open" view. Returns
// every chunk in order — used when the user clicks a row to see the
// full conversation so far.
agentCallsRouter.get('/agent-calls/live/:sid', (req, res) => {
  const sid = String(req.params.sid);
  const events = db.prepare(
    `SELECT sequence, source, text, is_final, created_at
       FROM live_call_events
      WHERE call_sid = ? AND user_id = ?
      ORDER BY sequence ASC`
  ).all(sid, USER);
  res.json({ events });
});

// ---------- list ----------
agentCallsRouter.get('/agent-calls', (_req, res) => {
  const rows = db.prepare(
    `SELECT ac.*, a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color
       FROM agent_calls ac
       LEFT JOIN agents a ON a.id = ac.agent_id
      WHERE ac.user_id = ? ORDER BY ac.created_at DESC`
  ).all(USER);
  res.json(rows);
});

// ---------- detail (campaign + per-recipient rows) ----------
agentCallsRouter.get('/agent-calls/:id', (req, res) => {
  const id = Number(req.params.id);
  const campaign = db.prepare(
    `SELECT ac.*, a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color, a.tts_voice AS agent_voice
       FROM agent_calls ac
       LEFT JOIN agents a ON a.id = ac.agent_id
      WHERE ac.id = ? AND ac.user_id = ?`
  ).get(id, USER);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  const recipients = db.prepare(
    `SELECT * FROM agent_call_recipients WHERE agent_call_id = ? ORDER BY id`
  ).all(id);
  res.json({ campaign, recipients });
});

// ---------- create draft ----------
// body: { name, agentId, script, fromNumber?, voicemailOnly?, recipients? | segmentId | allContacts }
agentCallsRouter.post('/agent-calls', (req, res) => {
  const name = String(req.body.name || '').trim();
  const script = String(req.body.script || '').trim();
  const agentId = Number(req.body.agentId);
  const fromNumber = req.body.fromNumber ? String(req.body.fromNumber) : null;
  // Drop-voicemail mode: hang up on live human pickup, leave the script as
  // the voicemail message. Implemented via Twilio AMD (DetectMessageEnd) +
  // a TwiML branch on AnsweredBy.
  const voicemailOnly = req.body.voicemailOnly ? 1 : 0;
  if (!name || !script || !agentId) {
    return res.status(400).json({ error: 'name, script, and agentId required' });
  }
  const agent = db.prepare(
    `SELECT id FROM agents WHERE id = ? AND user_id = ?`
  ).get(agentId, USER);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  let recipients: { phone: string; name?: string }[] =
    Array.isArray(req.body.recipients) ? req.body.recipients : [];
  if (req.body.segmentId) {
    recipients = db.prepare(
      `SELECT c.phone, c.name FROM contacts c
       JOIN contact_segments cs ON cs.contact_id = c.id
       WHERE c.user_id = ? AND cs.segment_id = ?`
    ).all(USER, Number(req.body.segmentId)) as any[];
  } else if (req.body.allContacts) {
    recipients = db.prepare(
      `SELECT phone, name FROM contacts WHERE user_id = ?`
    ).all(USER) as any[];
  }
  if (recipients.length === 0) {
    return res.status(400).json({ error: 'at least one recipient required' });
  }

  const cId = Number(
    db.prepare(
      `INSERT INTO agent_calls
         (user_id, agent_id, name, script, from_number, voicemail_only, total_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(USER, agentId, name, script, fromNumber, voicemailOnly, recipients.length, Date.now()).lastInsertRowid
  );
  const ins = db.prepare(
    `INSERT INTO agent_call_recipients (agent_call_id, phone, name) VALUES (?, ?, ?)`
  );
  db.transaction((rows: typeof recipients) => {
    for (const r of rows) ins.run(cId, r.phone, r.name || null);
  })(recipients);
  res.json({ id: cId });
});

// ---------- send ----------
agentCallsRouter.post('/agent-calls/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const campaign = db.prepare(
    `SELECT * FROM agent_calls WHERE id = ? AND user_id = ?`
  ).get(id, USER) as any;
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'sending' || campaign.status === 'done') {
    return res.status(409).json({ error: `already ${campaign.status}` });
  }
  const agent = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(campaign.agent_id) as any;
  if (!agent) return res.status(400).json({ error: 'agent missing' });

  const recipients = db.prepare(
    `SELECT * FROM agent_call_recipients WHERE agent_call_id = ? AND status = 'pending'`
  ).all(id) as any[];

  const perCallCost = voiceCallCost();
  // Pre-classify each recipient to learn which we'll actually charge.
  // Opt-outs and quiet-hours skips don't reserve credit.
  const work = recipients.map((r) => {
    const optedOut = isVoiceOptedOut(USER, r.phone);
    return { r, optedOut };
  });
  const quietHours = isInQuietHours(USER);
  const billable = work.filter((w) => !w.optedOut && !quietHours);
  const reserve = billable.length * perCallCost;
  if (reserve > 0 && !spendCredits(USER, reserve, 'voice_out', { campaignId: id, recipients: billable.length, reserve: true })) {
    return res.status(402).json({
      error: `Not enough tokens. Needs ${reserve}, balance ${getCredits(USER)}.`,
      needed: reserve,
    });
  }

  // ORDER MATTERS for crash-safety: mark opted-out + quiet-hours rows
  // BEFORE flipping the parent row to 'sending'. Otherwise a crash in
  // between would leave 'pending' rows the recovery sweep would refund
  // credits for, even though we never reserved those credits.
  for (const { r, optedOut } of work) {
    if (optedOut) {
      db.prepare(`UPDATE agent_call_recipients SET status = 'skipped-opted-out' WHERE id = ?`).run(r.id);
    } else if (quietHours) {
      db.prepare(`UPDATE agent_call_recipients SET status = 'skipped-quiet-hours' WHERE id = ?`).run(r.id);
    }
  }

  db.prepare(`UPDATE agent_calls SET status = 'sending' WHERE id = ?`).run(id);
  // Round-robin across every active sender number the account owns. Many
  // users have just one; multi-number accounts (10DLC + locals) get the
  // multiplier for free.
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  const senderNumbers = campaign.from_number
    ? [campaign.from_number]
    : listSenderNumbers(USER, getActiveNumber(USER) || undefined);
  if (!base || senderNumbers.length === 0) {
    log.error('agent-calls.send',
      `cannot dial: missing ${!base ? 'PUBLIC_BASE_URL' : 'from-number'} (id=${id})`);
    addCredits(USER, reserve, 'refund', { campaignId: id, reason: 'config_missing' });
    db.prepare(`UPDATE agent_calls SET status = 'failed' WHERE id = ?`).run(id);
    return res.status(500).json({ error: 'no public base URL or sender number configured' });
  }

  res.json({
    ok: true,
    queued: billable.length,
    reserved: reserve,
    lanes: senderNumbers.length,
    quietHoursSkipped: quietHours ? work.length - work.filter(w => w.optedOut).length : 0,
  });

  // (Pre-pass for opt-outs and quiet hours ran above before status flip.)
  const dialable = work.filter((w) => !w.optedOut && !quietHours).map((w) => w.r);

  // Voice rate-limit is much tighter than SMS — Twilio caps outbound at
  // ~1 call/sec per from-number on standard accounts. Each lane gets 2
  // concurrent workers with a 1000ms minimum interval (effective: 2/sec
  // peak, ~1/sec sustained), which is the safe ceiling without an
  // enterprise rate-limit increase. Multi-number accounts scale linearly.
  (async () => {
    let placed = 0;
    await processBatch(
      dialable,
      async (r: any, from) => {
        try {
          const call = await twilioClient.calls.create({
            to: r.phone,
            from,
            url: `${base}/api/voice/agent-call-twiml/${r.id}`,
            method: 'POST',
            machineDetection: 'DetectMessageEnd',
            statusCallback: `${base}/api/voice/agent-call-status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
            timeout: 30,
          });
          db.prepare(
            `UPDATE agent_call_recipients SET status = 'initiated', twilio_sid = ? WHERE id = ?`
          ).run(call.sid, r.id);
          placed++;
          if (placed % 10 === 0) {
            db.prepare(`UPDATE agent_calls SET placed_count = ? WHERE id = ?`).run(placed, id);
          }
        } catch (err: any) {
          addCredits(USER, perCallCost, 'refund', { campaignId: id, recipientId: r.id, reason: 'dial_failed' }); // refund — never dialed
          db.prepare(
            `UPDATE agent_call_recipients SET status = 'failed', error = ? WHERE id = ?`
          ).run((err.message || 'error').slice(0, 500), r.id);
          // Don't rethrow — fully handled here, the processor's result-tracking
          // surface is unused so the rethrow just doubles the log noise.
        }
      },
      {
        fromNumbers: senderNumbers,
        concurrencyPerLane: 2,
        perLaneMinIntervalMs: 1000,
      },
    );
    db.prepare(`UPDATE agent_calls SET placed_count = ?, status = 'done' WHERE id = ?`).run(placed, id);
  })().catch((e) => {
    log.error('agent-calls', `send loop crashed for ${id}`, e);
    db.prepare(`UPDATE agent_calls SET status = 'failed' WHERE id = ?`).run(id);
  });
});

// ---------- recovery on boot ----------
// Same idea as recoverInterruptedCampaigns: any 'sending' row left from a
// previous process is reset to draft and unsent recipients refunded.
export function recoverInterruptedAgentCalls(): void {
  try {
    const stuck = db.prepare(
      `SELECT * FROM agent_calls WHERE status = 'sending'`
    ).all() as any[];
    for (const c of stuck) {
      // Only refund rows we hadn't yet handed to Twilio. A row WITH a
      // twilio_sid was already dialed (Twilio doesn't know we crashed —
      // the call will still ring, AMD-classify, run TwiML, and post status
      // callbacks that update the row). Refunding it would credit a call
      // that actually happened, AND a re-send would double-dial.
      const refundable = db.prepare(
        `SELECT COUNT(*) AS n FROM agent_call_recipients
          WHERE agent_call_id = ? AND status = 'pending' AND twilio_sid IS NULL`
      ).get(c.id) as { n: number };
      const refund = (refundable?.n || 0) * voiceCallCost();
      if (refund > 0) addCredits(c.user_id, refund, 'refund', { campaignId: c.id, reason: 'boot_recovery', undialedRecipients: refundable?.n || 0 });
      db.prepare(`UPDATE agent_calls SET status = 'draft' WHERE id = ?`).run(c.id);
      log.warn('agent-calls.recover',
        `campaign ${c.id} ("${c.name}") was 'sending' at boot — refunded ${refund} credits for ${refundable?.n || 0} undialed recipients and reset to draft`);
    }
  } catch (e) {
    log.error('agent-calls.recover', 'recovery sweep failed', e);
  }
}
