import { Router } from 'express';
import OpenAI from 'openai';
import { log } from '../lib/log.js';

export const aiRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Fast local heuristics so the feature still adds value if OpenAI is down
// or slow. Carrier filtering (T-Mobile/AT&T/Verizon + The Campaign Registry)
// commonly flags SHAFT content, public-URL shorteners, ALL CAPS, "free",
// money/loan/credit terms, and gambling/CBD/cannabis.
const HEURISTICS: { re: RegExp; why: string; severity: 'low' | 'medium' | 'high' }[] = [
  { re: /\b(free|win|winner|prize|cash|\$\$+|100% free)\b/i, why: 'Classic spam/promo trigger word', severity: 'high' },
  { re: /\bbit\.ly|tinyurl|t\.co|goo\.gl|is\.gd|ow\.ly\b/i, why: 'Public URL shorteners are widely blocked — use a branded/full link', severity: 'high' },
  { re: /\b(loan|credit repair|debt|refinance|payday)\b/i, why: 'Lending/credit terms are high-risk for carrier filtering', severity: 'high' },
  { re: /\b(cannabis|cbd|thc|weed|kratom|vape)\b/i, why: 'Cannabis/CBD/vape content is commonly blocked', severity: 'high' },
  { re: /\b(viagra|cialis|sex|xxx|porn)\b/i, why: 'SHAFT (sexual) content is blocked', severity: 'high' },
  { re: /\b(gun|firearm|ammo|rifle|pistol)\b/i, why: 'SHAFT (firearms) content is blocked', severity: 'high' },
  { re: /\b(beer|wine|liquor|vodka|whiskey|alcohol)\b/i, why: 'SHAFT (alcohol) — age-gating may be required', severity: 'medium' },
  { re: /\b(bet|casino|lottery|sweepstakes|jackpot)\b/i, why: 'Gambling/sweepstakes is high-risk', severity: 'high' },
  { re: /[A-Z]{6,}/, why: 'Long ALL-CAPS runs read as spam', severity: 'low' },
  { re: /!{2,}|\${2,}|\b(act now|urgent|limited time|click here)\b/i, why: 'Urgency/spam phrasing increases filtering', severity: 'medium' },
];

function heuristicLint(text: string) {
  const flags = HEURISTICS
    .map((h) => { const m = text.match(h.re); return m ? { term: m[0], why: h.why, severity: h.severity } : null; })
    .filter(Boolean) as { term: string; why: string; severity: string }[];
  const hasStop = /\b(reply\s+stop|text\s+stop|stop\s+to\s+(opt\s*out|unsubscribe))\b/i.test(text);
  if (!hasStop) flags.push({ term: '(missing opt-out)', why: 'Marketing/promotional texts should include “Reply STOP to opt out”', severity: 'medium' });
  const sev = flags.some((f) => f.severity === 'high') ? 'high'
    : flags.some((f) => f.severity === 'medium') ? 'medium' : flags.length ? 'low' : 'low';
  return { risk: sev, flags, summary: flags.length ? `${flags.length} potential carrier-filter issue(s) found.` : 'No obvious carrier-filter risks detected.' };
}

// POST /api/ai/sms-lint  { text }  → carrier-deliverability risk report
aiRouter.post('/ai/sms-lint', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const local = heuristicLint(text);
  try {
    const c = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a US A2P/10DLC SMS deliverability checker. Identify words or ' +
            'phrases in a message that are likely to be blocked or filtered by US ' +
            'carriers and The Campaign Registry: SHAFT (sex, hate, alcohol, ' +
            'firearms, tobacco), cannabis/CBD/vape, gambling, lending/credit/debt, ' +
            'public URL shorteners, phishing-like wording, excessive caps/' +
            'punctuation, and missing opt-out language. Be precise, not paranoid.',
        },
        {
          role: 'user',
          content:
            `Message:\n"""${text}"""\n\nReturn JSON: {\n` +
            ` "risk": "low|medium|high",\n` +
            ` "flags": [{ "term": "the exact flagged text", "why": "short reason", "severity": "low|medium|high" }],\n` +
            ` "summary": "one sentence"\n}`,
        },
      ],
      max_tokens: 600,
    });
    const j = JSON.parse(c.choices[0]?.message?.content || '{}');
    // Merge AI + heuristic flags, dedupe by lowercased term.
    const seen = new Set<string>();
    const flags = [...(Array.isArray(j.flags) ? j.flags : []), ...local.flags]
      .filter((f) => f && f.term && !seen.has(String(f.term).toLowerCase()) && seen.add(String(f.term).toLowerCase()));
    res.json({
      risk: j.risk || local.risk,
      flags,
      summary: j.summary || local.summary,
    });
  } catch (e: any) {
    log.warn('ai.sms-lint', 'OpenAI failed, using heuristics', e);
    res.json({ ...local, degraded: true });
  }
});

// POST /api/ai/sms-optimize  { text, goal? }  → carrier-safe rewrite
aiRouter.post('/ai/sms-optimize', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const goal = String(req.body?.goal || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const c = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            'You rewrite US business SMS/MMS to maximize carrier deliverability ' +
            'and conversion while preserving the original intent and voice. Keep ' +
            'it concise, avoid SHAFT/spam triggers and URL shorteners, keep any ' +
            '{{name}} or merge tags intact, and include a brief opt-out only if ' +
            'the message is promotional. Do not invent offers or facts.',
        },
        {
          role: 'user',
          content:
            `Original message:\n"""${text}"""\n` +
            (goal ? `Goal/context: ${goal}\n` : '') +
            `\nReturn JSON: {\n` +
            ` "optimized": "the rewritten message",\n` +
            ` "changes": ["short bullet of each notable change"],\n` +
            ` "notes": "one-line deliverability rationale"\n}`,
        },
      ],
      max_tokens: 700,
    });
    const j = JSON.parse(c.choices[0]?.message?.content || '{}');
    if (!j.optimized) return res.status(502).json({ error: 'optimizer returned nothing' });
    res.json({
      optimized: String(j.optimized).trim(),
      changes: Array.isArray(j.changes) ? j.changes : [],
      notes: String(j.notes || ''),
    });
  } catch (e: any) {
    log.error('ai.sms-optimize', 'OpenAI failed', e);
    res.status(500).json({ error: e.message });
  }
});
