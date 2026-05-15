import OpenAI from 'openai';
import { db } from './db.js';

// ─────────────────── Condition types ───────────────────
//
// A rule has one or more conditions, AND-joined. Each condition is one
// discriminated-union variant below. We keep the schema simple so the UI
// can render predictable forms.

export type Condition =
  | { type: 'keyword';     terms: string[]; mode?: 'any' | 'all' }
  | { type: 'sender';      match: 'unknown' | 'known' }
  | { type: 'sender_phone'; value: string }            // exact normalized E.164
  | { type: 'area_code';   value: string }             // 3-digit US area code
  | { type: 'time';        days: string[]; start: string; end: string; tz?: string } // start/end "HH:MM"
  | { type: 'intent';      description: string };      // AI classifier

export interface RuleRow {
  id: number;
  user_id: string;
  name: string;
  enabled: number;
  priority: number;
  conditions_json: string;
  agent_id: number;
  match_count: number;
  last_matched_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface HydratedRule extends Omit<RuleRow, 'conditions_json'> {
  conditions: Condition[];
}

export function hydrateRule(r: RuleRow): HydratedRule {
  let conditions: Condition[] = [];
  try { conditions = JSON.parse(r.conditions_json); } catch {}
  return { ...r, conditions } as any;
}

// ─────────────────── Cheap matchers (no AI) ───────────────────

function normalizePhone(p: string) {
  return (p || '').replace(/[^\d+]/g, '');
}

function checkKeyword(c: Extract<Condition, { type: 'keyword' }>, body: string): boolean {
  const haystack = body.toLowerCase();
  const terms = c.terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (terms.length === 0) return false;
  if (c.mode === 'all') return terms.every((t) => haystack.includes(t));
  return terms.some((t) => haystack.includes(t));
}

function checkSender(c: Extract<Condition, { type: 'sender' }>, userId: string, fromPhone: string): boolean {
  const known = db.prepare(
    `SELECT 1 FROM contacts WHERE user_id = ? AND phone = ?`
  ).get(userId, fromPhone) as any;
  return c.match === 'known' ? !!known : !known;
}

function checkSenderPhone(c: Extract<Condition, { type: 'sender_phone' }>, fromPhone: string): boolean {
  return normalizePhone(fromPhone) === normalizePhone(c.value);
}

function checkAreaCode(c: Extract<Condition, { type: 'area_code' }>, fromPhone: string): boolean {
  const np = normalizePhone(fromPhone);
  // strip leading + and country code (assume US: +1XXXXXXXXXX => XXXXXXXXXX)
  const local = np.startsWith('+1') ? np.slice(2) : np.startsWith('1') && np.length === 11 ? np.slice(1) : np.replace(/^\+/, '');
  return local.startsWith(c.value);
}

function checkTime(c: Extract<Condition, { type: 'time' }>): boolean {
  const tz = c.tz || 'America/Los_Angeles';
  const now = new Date();
  // dayName via Intl
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz })
    .format(now).toLowerCase().slice(0, 3); // mon, tue, ...
  if (Array.isArray(c.days) && c.days.length > 0 && !c.days.map((d) => d.toLowerCase().slice(0, 3)).includes(dayName)) {
    return false;
  }
  const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
    .format(now); // "14:23"
  return hhmm >= c.start && hhmm <= c.end;
}

// ─────────────────── AI intent batch classifier ───────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function classifyIntents(
  body: string,
  intents: { ruleId: number; description: string }[]
): Promise<Set<number>> {
  if (intents.length === 0) return new Set();
  const list = intents.map((it, i) => `${i}: ${it.description}`).join('\n');
  const sys = 'You classify SMS intent. Given an inbound message and a numbered list of intent descriptions, return JSON {"matches":[indexes...]} of every intent that clearly fits. Be strict — if unsure, do not include.';
  const user = `Inbound: "${body.slice(0, 500)}"\n\nIntents:\n${list}\n\nReturn JSON only.`;
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 80,
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{"matches":[]}');
    const idxs: number[] = Array.isArray(parsed.matches) ? parsed.matches.map((n: any) => Number(n)).filter(Number.isFinite) : [];
    const matched = new Set<number>();
    for (const idx of idxs) {
      const it = intents[idx];
      if (it) matched.add(it.ruleId);
    }
    return matched;
  } catch (e) {
    console.warn('intent classify failed', e);
    return new Set();
  }
}

// ─────────────────── Rule evaluation ───────────────────

interface RouteContext {
  userId: string;
  fromPhone: string;
  body: string;
}

/**
 * Returns the agent_id of the first matching rule, or null if no rule matches.
 * - Cheap conditions (keyword/sender/time) are evaluated first per rule.
 * - If a rule has an `intent` condition, we batch all intent rules into ONE
 *   AI call (only over rules whose cheap conditions all passed).
 */
export async function routeInbound(ctx: RouteContext): Promise<HydratedRule | null> {
  const rows = db.prepare(
    `SELECT * FROM routing_rules WHERE user_id = ? AND enabled = 1 ORDER BY priority ASC, id ASC`
  ).all(ctx.userId) as RuleRow[];
  if (rows.length === 0) return null;

  const rules = rows.map(hydrateRule);

  // Evaluate cheap conditions; track which intent classifications we still need.
  const cheapPass: HydratedRule[] = [];
  const intentNeeded: { rule: HydratedRule; description: string }[] = [];

  for (const rule of rules) {
    let cheapOk = true;
    let intentDesc: string | null = null;
    for (const cond of rule.conditions) {
      if (cond.type === 'keyword') { if (!checkKeyword(cond, ctx.body)) { cheapOk = false; break; } }
      else if (cond.type === 'sender') { if (!checkSender(cond, ctx.userId, ctx.fromPhone)) { cheapOk = false; break; } }
      else if (cond.type === 'sender_phone') { if (!checkSenderPhone(cond, ctx.fromPhone)) { cheapOk = false; break; } }
      else if (cond.type === 'area_code') { if (!checkAreaCode(cond, ctx.fromPhone)) { cheapOk = false; break; } }
      else if (cond.type === 'time') { if (!checkTime(cond)) { cheapOk = false; break; } }
      else if (cond.type === 'intent') { intentDesc = cond.description; }
    }
    if (!cheapOk) continue;
    if (intentDesc) intentNeeded.push({ rule, description: intentDesc });
    cheapPass.push(rule);
  }

  // Pure cheap-pass rules (no intent) match immediately.
  // But we still need to respect priority ordering: walk in order, return first
  // non-intent rule, and resolve intent rules only if a higher-priority intent
  // rule is needed first.
  // Simpler: do a single AI batch for any intent rules among the cheap-pass
  // set, then walk in priority order applying matches.
  let intentMatches: Set<number> = new Set();
  if (intentNeeded.length > 0) {
    intentMatches = await classifyIntents(
      ctx.body,
      intentNeeded.map((it) => ({ ruleId: it.rule.id, description: it.description }))
    );
  }

  for (const rule of cheapPass) {
    const hasIntent = rule.conditions.some((c) => c.type === 'intent');
    if (hasIntent && !intentMatches.has(rule.id)) continue;
    // Match!
    db.prepare(
      `UPDATE routing_rules SET match_count = match_count + 1, last_matched_at = ? WHERE id = ?`
    ).run(Date.now(), rule.id);
    return rule;
  }
  return null;
}

// Test-mode: same engine, but without persistence (no match_count bump).
// Used by the "Test rule" UI before saving.
export async function dryRun(ctx: RouteContext, conditions: Condition[]): Promise<{ matched: boolean; reason: string }> {
  // Mirror the cheap path
  const reasons: string[] = [];
  for (const cond of conditions) {
    let ok = true;
    if (cond.type === 'keyword') ok = checkKeyword(cond, ctx.body);
    else if (cond.type === 'sender') ok = checkSender(cond, ctx.userId, ctx.fromPhone);
    else if (cond.type === 'sender_phone') ok = checkSenderPhone(cond, ctx.fromPhone);
    else if (cond.type === 'area_code') ok = checkAreaCode(cond, ctx.fromPhone);
    else if (cond.type === 'time') ok = checkTime(cond);
    else if (cond.type === 'intent') {
      const m = await classifyIntents(ctx.body, [{ ruleId: -1, description: cond.description }]);
      ok = m.has(-1);
    }
    if (!ok) {
      reasons.push(`✗ ${describeCondition(cond)}`);
      return { matched: false, reason: reasons.join('\n') };
    }
    reasons.push(`✓ ${describeCondition(cond)}`);
  }
  return { matched: true, reason: reasons.join('\n') };
}

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'keyword':      return `contains ${c.mode === 'all' ? 'ALL' : 'ANY'} of: ${c.terms.join(', ')}`;
    case 'sender':       return `from a ${c.match} contact`;
    case 'sender_phone': return `from ${c.value}`;
    case 'area_code':    return `from area code ${c.value}`;
    case 'time':         return `${(c.days || []).join('/') || 'any day'} ${c.start}–${c.end} (${c.tz || 'America/Los_Angeles'})`;
    case 'intent':       return `AI intent: "${c.description}"`;
  }
}
