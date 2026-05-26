import { Router } from 'express';
import { db, hasActiveSubscription } from '../lib/db.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { log } from '../lib/log.js';
import { openai, OPENAI_MODEL as MODEL } from '../lib/openai.js';
import { OWNER_ID as USER, getUserId } from '../lib/auth.js';
import { submitSoleProprietor, verifySoleProprietorOtp, submitCustomerProfileForReview, TrustHubError } from '../lib/trusthub.js';

export const a2pRouter = Router();

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
  // Submitting a 10DLC brand/campaign registration is part of the paid
  // tiers (sole_prop OR a2p) — both carry real Twilio vetting costs.
  // Drafting (/a2p/draft) stays free as a preview.
  // The "upgrade" hint in the 402 body branches on which tier the form
  // selected so the client pushes the user to the matching Stripe flow.
  const uid = getUserId(req);
  const brandType = req.body?.profile?.brandType === 'standard' ? 'standard' : 'sole_prop';
  const requiredPlan = brandType === 'standard' ? 'a2p' : 'sole_prop';
  if (!hasActiveSubscription(uid, 'a2p') && !hasActiveSubscription(uid, 'sole_prop')) {
    return res.status(402).json({
      error: brandType === 'standard'
        ? 'A2P 10DLC registration requires the Business Line add-on ($10/mo + $15 setup).'
        : 'Sole Proprietor registration requires the Sole Prop tier ($5/mo + $5 setup).',
      upgrade: requiredPlan,
    });
  }
  const profile = req.body?.profile || {};
  const pkg = req.body?.package || {};
  // (brandType resolved above for the gating check — reuse it for the
  //  per-tier required-fields validation below.)
  if (brandType === 'standard') {
    if (!profile.legalName || !profile.ein) {
      return res.status(400).json({ error: 'legalName and ein are required for a standard brand' });
    }
  } else {
    const missing = ['firstName', 'lastName', 'mobilePhone', 'email']
      .filter((k) => !String(profile[k] || '').trim());
    if (missing.length) {
      return res.status(400).json({ error: `Sole proprietor requires: ${missing.join(', ')}` });
    }
  }
  profile.brandType = brandType;
  const now = Date.now();
  const row = db.prepare(
    `INSERT INTO a2p_registrations (user_id, profile_json, package_json, status, created_at, updated_at)
     VALUES (?, ?, ?, 'submitted', ?, ?)`
  ).run(USER, JSON.stringify(profile), JSON.stringify(pkg), now, now);
  const id = Number(row.lastInsertRowid);

  let status = 'submitted';
  let note = '';
  let brandSid: string | null = null;
  let customerProfileSid: string | null = null;
  let endUserSid: string | null = null;
  let evaluationSid: string | null = null;

  try {
    if (brandType === 'sole_prop') {
      // Real Twilio TrustHub sole-prop submission. Creates Customer
      // Profile + EndUser + Evaluation — the Evaluation step is what
      // actually triggers Twilio to TEXT THE OTP to the user's mobile.
      // Previously this route just stored the package and lied about
      // sending an OTP; now the text actually arrives.
      const result = await submitSoleProprietor({
        firstName: String(profile.firstName),
        lastName: String(profile.lastName),
        email: String(profile.email),
        mobilePhone: String(profile.mobilePhone),
        businessName: profile.businessName ? String(profile.businessName) : undefined,
      });
      customerProfileSid = result.customerProfileSid;
      endUserSid = result.endUserSid;
      evaluationSid = result.evaluation.sid;
      status = 'otp_pending';
      note = `Verification code texted to ${profile.mobilePhone}. POST the code to /api/a2p/verify-otp to complete identity verification, then Twilio submits for carrier review.`;
    } else {
      // Standard (EIN-backed) brand path — still requires manual filing
      // in the console for now (different policy SID + supporting docs).
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
        note = 'Standard-brand auto-submit not available on this account. Package saved — file in Twilio Console → Messaging → Regulatory Compliance (pre-filled).';
      }
    }
  } catch (e: any) {
    // TrustHub failures fall back to the manual-console flow with the
    // FULL error surfaced — previously the message was generic and the
    // user had no idea why no OTP arrived. Common failure modes we've
    // seen: "Invalid regulation" (the policySid doesn't match this
    // account's available regulations — Twilio rotates these per account
    // type / region); 401/403 (TrustHub API not enabled on the account);
    // 422 (missing required attribute like business_industry).
    //
    // CRITICAL: when the failure happens mid-flow (e.g. evaluation step
    // failed but customer-profile + end-user already created on Twilio's
    // side), we capture the partial SIDs here so the row still records
    // them. Otherwise every retry leaks more orphan Twilio resources.
    if (e instanceof TrustHubError) {
      customerProfileSid = e.partial.customerProfileSid ?? null;
      endUserSid = e.partial.endUserSid ?? null;
      evaluationSid = e.partial.evaluationSid ?? null;
    }
    status = 'manual';
    const code = e.code || e.status || 'err';
    const detail = e.message || String(e);
    const stepNote = e instanceof TrustHubError ? ` (failed at: ${e.step})` : '';
    note =
      `Twilio rejected the automated submission (${code}: ${detail})${stepNote}. ` +
      `Most common cause: this Twilio account isn't enabled for ISV / TrustHub APIs, ` +
      `OR the sole-prop policy SID differs for this account type. ` +
      `Workaround: file the registration manually in Twilio Console → Messaging → ` +
      `Regulatory Compliance — your saved package has everything pre-filled.`;
    log.warn('a2p/submit', 'trusthub submission failed', { code, detail, step: (e as any).step, partial: (e as any).partial });
  }

  db.prepare(
    `UPDATE a2p_registrations
        SET status = ?, twilio_brand_sid = ?,
            twilio_customer_profile_sid = ?, twilio_end_user_sid = ?, twilio_evaluation_sid = ?,
            note = ?, updated_at = ?
      WHERE id = ?`
  ).run(status, brandSid, customerProfileSid, endUserSid, evaluationSid, note, Date.now(), id);
  res.json({ id, status, note, brandSid, customerProfileSid, endUserSid });
});

// POST /api/a2p/verify-otp  { code }
// Submit the code Twilio texted the user. On success: the End User is
// verified, the Customer Profile is submitted for carrier review, and
// the registration row flips to 'in_review'. On failure: status stays
// 'otp_pending' so the user can retry — the OTP isn't re-sent, but the
// user can hit /api/a2p/submit again to start over.
a2pRouter.post('/a2p/verify-otp', async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code || !/^\d{4,8}$/.test(code)) {
    return res.status(400).json({ error: 'a 4–8 digit code is required' });
  }
  const reg = db.prepare(
    `SELECT * FROM a2p_registrations WHERE user_id = ? AND status = 'otp_pending'
     ORDER BY id DESC LIMIT 1`
  ).get(USER) as any;
  if (!reg) return res.status(404).json({ error: 'no pending OTP registration. Submit /api/a2p/submit first.' });
  if (!reg.twilio_end_user_sid) {
    return res.status(409).json({ error: 'this registration has no associated Twilio End User; resubmit /api/a2p/submit' });
  }

  const verify = await verifySoleProprietorOtp(reg.twilio_end_user_sid, code);
  if (!verify.ok) {
    return res.status(400).json({ ok: false, status: 'rejected', note: verify.note });
  }

  // OTP good → mark verified, submit profile for review.
  let reviewStatus = 'pending-review';
  try {
    const r = await submitCustomerProfileForReview(reg.twilio_customer_profile_sid);
    reviewStatus = r.status;
  } catch (e: any) {
    log.warn('a2p/verify-otp', 'profile submit-for-review failed', e);
  }

  db.prepare(
    `UPDATE a2p_registrations SET otp_verified = 1, status = 'in_review', note = ?, updated_at = ? WHERE id = ?`
  ).run(`OTP verified. Twilio profile status: ${reviewStatus}. Brand + campaign creation runs after profile is approved (1–3 business days).`,
        Date.now(), reg.id);

  res.json({ ok: true, status: 'in_review', profileStatus: reviewStatus });
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
