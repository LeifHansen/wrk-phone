import { Router } from 'express';
import OpenAI from 'openai';
import { db } from '../lib/db.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { log } from '../lib/log.js';

export const a2pRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// 1) AI drafts the tedious A2P campaign package from one paragraph.
a2pRouter.post('/a2p/draft', async (req, res) => {
  const desc = String(req.body?.businessDescription || '').trim();
  if (!desc) return res.status(400).json({ error: 'businessDescription required' });
  try {
    const c = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You prepare US A2P 10DLC campaign registrations. From a business description, output strict JSON the carrier reviewers expect. Be specific and compliant (clear opt-in, STOP/HELP).' },
        { role: 'user', content: `Business: ${desc}\n\nReturn JSON:\n{\n "vertical": "one of: RETAIL, EDUCATION, REAL_ESTATE, HEALTHCARE, TECHNOLOGY, PROFESSIONAL, FINANCIAL, NONPROFIT, OTHER",\n "useCaseCategory": "one of: MIXED, MARKETING, CUSTOMER_CARE, 2FA, LOW_VOLUME",\n "campaignDescription": "2-3 sentences, what messages you send and to whom",\n "messageSamples": ["sample 1 (with brand + STOP)", "sample 2"],\n "messageFlow": "how users opt in (website form / keyword / point of sale)",\n "optInKeywords": ["START"],\n "helpMessage": "Reply HELP for help...",\n "stopMessage": "You are unsubscribed. Reply START to resubscribe."\n}` },
      ],
      max_tokens: 700,
    });
    res.json(JSON.parse(c.choices[0]?.message?.content || '{}'));
  } catch (e: any) {
    log.error('a2p/draft', 'openai failed', e);
    res.status(500).json({ error: e.message });
  }
});

// 2) Submit. Attempts the real Twilio A2P brand registration; always stores
//    the package so nothing is lost if the account isn't ISV-enabled.
a2pRouter.post('/a2p/submit', async (req, res) => {
  const profile = req.body?.profile || {};
  const pkg = req.body?.package || {};
  if (!profile.legalName || !profile.ein) {
    return res.status(400).json({ error: 'legalName and ein are required' });
  }
  const now = Date.now();
  const row = db.prepare(
    `INSERT INTO a2p_registrations (user_id, profile_json, package_json, status, created_at, updated_at)
     VALUES (?, ?, ?, 'submitted', ?, ?)`
  ).run(USER, JSON.stringify(profile), JSON.stringify(pkg), now, now);
  const id = Number(row.lastInsertRowid);

  let status = 'submitted';
  let note = '';
  let brandSid: string | null = null;
  try {
    // Secondary customer profile + brand registration is an ISV/TrustHub flow.
    // We attempt the brand registration; if the account/SDK path isn't
    // available, we fall back to "manual" with the full package retained.
    const a2p: any = (twilioClient.messaging.v1 as any).a2p;
    if (a2p?.brandRegistrations?.create) {
      const brand = await a2p.brandRegistrations.create({
        customerProfileBundleSid: profile.customerProfileBundleSid,
        a2pProfileBundleSid: profile.a2pProfileBundleSid,
      });
      brandSid = brand.sid;
      status = 'in_review';
      note = 'Brand submitted to Twilio. Carrier vetting is async (hours–days).';
    } else {
      status = 'manual';
      note = 'Account not ISV-enabled for fully-automated brand creation. The complete, carrier-ready package has been generated and saved — submit it in Twilio Console → Messaging → Regulatory Compliance (one paste).';
    }
  } catch (e: any) {
    status = 'manual';
    note = `Auto-submit unavailable (${e.message}). Package saved — file via Twilio Console; everything is pre-filled.`;
    log.warn('a2p/submit', 'brand registration fell back to manual', e);
  }

  db.prepare(`UPDATE a2p_registrations SET status=?, twilio_brand_sid=?, note=?, updated_at=? WHERE id=?`)
    .run(status, brandSid, note, Date.now(), id);
  res.json({ id, status, note, brandSid });
});

// 3) Status — live-polls Twilio when we have a brand sid.
a2pRouter.get('/a2p/status', async (_req, res) => {
  const r = db.prepare(`SELECT * FROM a2p_registrations WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(USER) as any;
  if (!r) return res.json({ status: 'none' });
  let liveStatus = r.status;
  try {
    if (r.twilio_brand_sid) {
      const a2p: any = (twilioClient.messaging.v1 as any).a2p;
      const b = await a2p.brandRegistrations(r.twilio_brand_sid).fetch();
      liveStatus = (b.status || r.status).toLowerCase();
      if (liveStatus !== r.status) {
        db.prepare(`UPDATE a2p_registrations SET status=?, updated_at=? WHERE id=?`).run(liveStatus, Date.now(), r.id);
      }
    }
  } catch (e: any) {
    log.warn('a2p/status', 'poll failed', e);
  }
  res.json({
    id: r.id, status: liveStatus, note: r.note,
    profile: JSON.parse(r.profile_json), package: JSON.parse(r.package_json),
    brandSid: r.twilio_brand_sid, campaignSid: r.twilio_campaign_sid,
  });
});
