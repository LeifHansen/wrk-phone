import { Router } from 'express';
import { db } from '../lib/db.js';
import { hydrateRule, RuleRow, dryRun, describeCondition, Condition } from '../lib/routing.js';

export const routingRouter = Router();
import { getUserId } from '../lib/auth.js';

const VALID_TYPES = new Set(['keyword', 'sender', 'sender_phone', 'area_code', 'time', 'intent']);

function validateConditions(input: any): Condition[] {
  if (!Array.isArray(input)) throw new Error('conditions must be an array');
  const out: Condition[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || !VALID_TYPES.has(raw.type)) {
      throw new Error(`bad condition: ${JSON.stringify(raw)}`);
    }
    if (raw.type === 'keyword') {
      const terms = Array.isArray(raw.terms) ? raw.terms.map((t: any) => String(t).trim()).filter(Boolean) : [];
      if (terms.length === 0) throw new Error('keyword needs terms');
      out.push({ type: 'keyword', terms, mode: raw.mode === 'all' ? 'all' : 'any' });
    } else if (raw.type === 'sender') {
      if (!['known', 'unknown'].includes(raw.match)) throw new Error('sender.match must be known|unknown');
      out.push({ type: 'sender', match: raw.match });
    } else if (raw.type === 'sender_phone') {
      if (!raw.value) throw new Error('sender_phone needs value');
      out.push({ type: 'sender_phone', value: String(raw.value) });
    } else if (raw.type === 'area_code') {
      if (!/^\d{3}$/.test(String(raw.value || ''))) throw new Error('area_code must be 3 digits');
      out.push({ type: 'area_code', value: String(raw.value) });
    } else if (raw.type === 'time') {
      const days = Array.isArray(raw.days) ? raw.days.map((d: any) => String(d).toLowerCase().slice(0, 3)) : [];
      if (!/^\d{2}:\d{2}$/.test(raw.start || '') || !/^\d{2}:\d{2}$/.test(raw.end || '')) {
        throw new Error('time start/end must be HH:MM');
      }
      out.push({ type: 'time', days, start: raw.start, end: raw.end, tz: raw.tz || 'America/Los_Angeles' });
    } else if (raw.type === 'intent') {
      if (!raw.description) throw new Error('intent needs description');
      out.push({ type: 'intent', description: String(raw.description).slice(0, 240) });
    }
  }
  return out;
}

function fetch(id: number, userId: string) {
  return db.prepare(`SELECT * FROM routing_rules WHERE id = ? AND user_id = ?`).get(id, userId) as RuleRow | undefined;
}

routingRouter.get('/routing-rules', (req, res) => {
  const USER = getUserId(req);
  const rows = db.prepare(
    `SELECT r.*, a.name AS agent_name, a.emoji AS agent_emoji, a.color AS agent_color
     FROM routing_rules r
     LEFT JOIN agents a ON a.id = r.agent_id
     WHERE r.user_id = ? ORDER BY r.priority ASC, r.id ASC`
  ).all(USER) as any[];
  res.json(rows.map((r) => ({ ...hydrateRule(r), agent_name: r.agent_name, agent_emoji: r.agent_emoji, agent_color: r.agent_color })));
});

routingRouter.post('/routing-rules', (req, res) => {
  const USER = getUserId(req);
  try {
    const name = String(req.body.name || '').trim();
    const agent_id = Number(req.body.agent_id);
    const conditions = validateConditions(req.body.conditions);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
    const a = db.prepare(`SELECT id FROM agents WHERE id = ? AND user_id = ?`).get(agent_id, USER);
    if (!a) return res.status(400).json({ error: 'agent not found' });
    const max = (db.prepare(`SELECT COALESCE(MAX(priority), -1) AS m FROM routing_rules WHERE user_id = ?`).get(USER) as any).m;
    const now = Date.now();
    const r = db.prepare(
      `INSERT INTO routing_rules (user_id, name, enabled, priority, conditions_json, agent_id, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`
    ).run(USER, name, max + 1, JSON.stringify(conditions), agent_id, now, now);
    res.json({ id: Number(r.lastInsertRowid) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

routingRouter.patch('/routing-rules/:id', (req, res) => {
  const USER = getUserId(req);
  try {
    const id = Number(req.params.id);
    const r = fetch(id, USER);
    if (!r) return res.status(404).json({ error: 'not found' });
    const next = {
      name: req.body.name !== undefined ? String(req.body.name).trim() : r.name,
      enabled: req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : r.enabled,
      conditions_json: req.body.conditions !== undefined ? JSON.stringify(validateConditions(req.body.conditions)) : r.conditions_json,
      agent_id: req.body.agent_id !== undefined ? Number(req.body.agent_id) : r.agent_id,
    };
    if (req.body.agent_id !== undefined) {
      const a = db.prepare(`SELECT id FROM agents WHERE id = ? AND user_id = ?`).get(next.agent_id, USER);
      if (!a) return res.status(400).json({ error: 'agent not found' });
    }
    db.prepare(
      `UPDATE routing_rules SET name = ?, enabled = ?, conditions_json = ?, agent_id = ?, updated_at = ? WHERE id = ?`
    ).run(next.name, next.enabled, next.conditions_json, next.agent_id, Date.now(), id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

routingRouter.delete('/routing-rules/:id', (req, res) => {
  const USER = getUserId(req);
  const id = Number(req.params.id);
  const r = fetch(id, USER);
  if (!r) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM routing_rules WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Reorder: body { ids: [orderedIds] }
routingRouter.post('/routing-rules/reorder', (req, res) => {
  const USER = getUserId(req);
  const ids: number[] = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
  const tx = db.transaction(() => {
    ids.forEach((id, idx) => {
      db.prepare(`UPDATE routing_rules SET priority = ? WHERE id = ? AND user_id = ?`).run(idx, id, USER);
    });
  });
  tx();
  res.json({ ok: true });
});

// Dry-run: test arbitrary conditions against an inbound (without saving).
// body: { from, body, conditions }
routingRouter.post('/routing-rules/test', async (req, res) => {
  const USER = getUserId(req);
  try {
    const conditions = validateConditions(req.body.conditions);
    const from = String(req.body.from || '');
    const body = String(req.body.body || '');
    const result = await dryRun({ userId: USER, fromPhone: from, body }, conditions);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

routingRouter.get('/routing-rules/_describe', (_req, res) => {
  // Tiny helper for the UI; mirrors describeCondition for client-side previews.
  res.json({ ok: true });
});
export { describeCondition };
