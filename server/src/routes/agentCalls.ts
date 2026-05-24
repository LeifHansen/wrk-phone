import { Router } from 'express';
import {
  db,
  spendCredits, addCredits, getCredits,
  voiceCallCost, isVoiceOptedOut, isInQuietHours,
  getActiveNumber,
} from '../lib/db.js';
import { twilioClient } from '../lib/twilio.js';
import { log } from '../lib/log.js';

export const agentCallsRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';

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
// body: { name, agentId, script, fromNumber?, recipients? | segmentId | allContacts }
agentCallsRouter.post('/agent-calls', (req, res) => {
  const name = String(req.body.name || '').trim();
  const script = String(req.body.script || '').trim();
  const agentId = Number(req.body.agentId);
  const fromNumber = req.body.fromNumber ? String(req.body.fromNumber) : null;
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
         (user_id, agent_id, name, script, from_number, total_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(USER, agentId, name, script, fromNumber, recipients.length, Date.now()).lastInsertRowid
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
// body: { consent: true }  — required: user MUST acknowledge TCPA consent
agentCallsRouter.post('/agent-calls/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const campaign = db.prepare(
    `SELECT * FROM agent_calls WHERE id = ? AND user_id = ?`
  ).get(id, USER) as any;
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'sending' || campaign.status === 'done') {
    return res.status(409).json({ error: `already ${campaign.status}` });
  }
  // TCPA gate: refuse to dial without explicit acknowledged consent.
  if (req.body?.consent !== true) {
    return res.status(400).json({
      error: 'You must acknowledge TCPA consent before sending automated voice calls.',
    });
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
  if (reserve > 0 && !spendCredits(USER, reserve)) {
    return res.status(402).json({
      error: `Not enough credits. Needs ${reserve}, balance ${getCredits(USER)}.`,
      needed: reserve,
    });
  }

  // Persist the consent acknowledgement BEFORE flipping to sending — that's
  // the audit trail you'll want if a recipient ever complains.
  db.prepare(
    `UPDATE agent_calls
        SET status = 'sending',
            consent_acknowledged = 1,
            consent_acknowledged_at = ?,
            consent_acknowledged_ip = ?,
            consent_acknowledged_ua = ?
      WHERE id = ?`
  ).run(
    Date.now(),
    String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 64),
    String(req.headers['user-agent'] || '').slice(0, 200),
    id,
  );
  res.json({ ok: true, queued: billable.length, reserved: reserve, quietHoursSkipped: quietHours ? work.length - work.filter(w=>w.optedOut).length : 0 });

  // Fire-and-forget loop. Twilio voice rate-limit is ~1 call/sec per
  // from-number for safety; we throttle to 1000ms.
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    log.error('agent-calls.send', `cannot dial: PUBLIC_BASE_URL not set (id=${id})`);
    addCredits(USER, reserve);
    db.prepare(`UPDATE agent_calls SET status = 'failed' WHERE id = ?`).run(id);
    return;
  }
  const fromNum = campaign.from_number || getActiveNumber(USER);
  if (!fromNum) {
    log.error('agent-calls.send', `cannot dial: no from number (id=${id})`);
    addCredits(USER, reserve);
    db.prepare(`UPDATE agent_calls SET status = 'failed' WHERE id = ?`).run(id);
    return;
  }

  (async () => {
    let placed = 0;
    for (const { r, optedOut } of work) {
      if (optedOut) {
        db.prepare(
          `UPDATE agent_call_recipients SET status = 'skipped-opted-out' WHERE id = ?`
        ).run(r.id);
        continue;
      }
      if (quietHours) {
        db.prepare(
          `UPDATE agent_call_recipients SET status = 'skipped-quiet-hours' WHERE id = ?`
        ).run(r.id);
        continue;
      }
      try {
        const call = await twilioClient.calls.create({
          to: r.phone,
          from: fromNum,
          url: `${base}/api/voice/agent-call-twiml/${r.id}`,
          method: 'POST',
          // Machine detection — Twilio waits ~5s to classify human vs voicemail
          // then includes AnsweredBy in the TwiML POST. We branch on it: humans
          // get the full script, machines get a short voicemail-style version.
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
      } catch (err: any) {
        addCredits(USER, perCallCost); // refund — this one never dialed
        db.prepare(
          `UPDATE agent_call_recipients SET status = 'failed', error = ? WHERE id = ?`
        ).run((err.message || 'error').slice(0, 500), r.id);
      }
      db.prepare(`UPDATE agent_calls SET placed_count = ? WHERE id = ?`).run(placed, id);
      await new Promise((res) => setTimeout(res, 1000));
    }
    db.prepare(`UPDATE agent_calls SET status = 'done' WHERE id = ?`).run(id);
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
      const pending = db.prepare(
        `SELECT COUNT(*) AS n FROM agent_call_recipients
          WHERE agent_call_id = ? AND status = 'pending'`
      ).get(c.id) as { n: number };
      const refund = (pending?.n || 0) * voiceCallCost();
      if (refund > 0) addCredits(c.user_id, refund);
      db.prepare(`UPDATE agent_calls SET status = 'draft' WHERE id = ?`).run(c.id);
      log.warn('agent-calls.recover',
        `campaign ${c.id} ("${c.name}") was 'sending' at boot — refunded ${refund} credits for ${pending?.n || 0} unsent recipients and reset to draft`);
    }
  } catch (e) {
    log.error('agent-calls.recover', 'recovery sweep failed', e);
  }
}
