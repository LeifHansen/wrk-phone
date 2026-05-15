import { Router } from 'express';
import { twilioClient, twilioConfig } from '../lib/twilio.js';

export const diagRouter = Router();

// GET /api/_diag — validates live credentials WITHOUT returning any secret values.
diagRouter.get('/_diag', async (_req, res) => {
  const checks: Record<string, { ok: boolean; note: string }> = {};

  const present = (v?: string) =>
    !!v && !/x{4,}/i.test(v) && !/placeholder/i.test(v);

  checks.env = {
    ok:
      present(twilioConfig.accountSid) &&
      present(twilioConfig.apiKeySid) &&
      present(twilioConfig.apiKeySecret) &&
      present(twilioConfig.twimlAppSid) &&
      present(twilioConfig.defaultFrom),
    note: [
      present(twilioConfig.accountSid) ? 'accountSid✓' : 'accountSid✗',
      present(twilioConfig.apiKeySid) ? 'apiKey✓' : 'apiKey✗',
      present(twilioConfig.apiKeySecret) ? 'apiSecret✓' : 'apiSecret✗',
      present(twilioConfig.twimlAppSid) ? 'twimlApp✓' : 'twimlApp✗',
      present(twilioConfig.defaultFrom) ? 'fromNumber✓' : 'fromNumber✗',
      twilioConfig.messagingServiceSid ? 'msgService✓' : 'msgService(none)',
      process.env.OPENAI_API_KEY && !/placeholder/i.test(process.env.OPENAI_API_KEY) ? 'openai✓' : 'openai✗',
    ].join(' '),
  };

  try {
    const acct = await twilioClient.api.v2010.accounts(twilioConfig.accountSid).fetch();
    checks.account = { ok: acct.status === 'active', note: `status=${acct.status}` };
  } catch (e: any) {
    checks.account = { ok: false, note: `auth failed (${e.status || e.code || 'err'})` };
  }

  try {
    const nums = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: twilioConfig.defaultFrom, limit: 1 });
    checks.fromNumber = nums.length > 0
      ? { ok: true, note: `owned, voice=${(nums[0] as any).capabilities?.voice} sms=${(nums[0] as any).capabilities?.sms}` }
      : { ok: false, note: 'number not found on this account' };
  } catch (e: any) {
    checks.fromNumber = { ok: false, note: `lookup failed (${e.status || 'err'})` };
  }

  try {
    const app = await twilioClient.applications(twilioConfig.twimlAppSid).fetch();
    checks.twimlApp = { ok: !!app.sid, note: app.voiceUrl ? 'voiceUrl set' : 'voiceUrl EMPTY (set it!)' };
  } catch (e: any) {
    checks.twimlApp = { ok: false, note: `not found (${e.status || 'err'})` };
  }

  try {
    const { buildVoiceAccessToken } = await import('../lib/twilio.js');
    const jwt = buildVoiceAccessToken('demo', 'web');
    checks.voiceToken = { ok: jwt.split('.').length === 3, note: 'token minted' };
  } catch (e: any) {
    checks.voiceToken = { ok: false, note: `mint failed: ${String(e.message).slice(0, 60)}` };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({ allOk, checks });
});
