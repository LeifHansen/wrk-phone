import { Router } from 'express';
import { db, hydrateAgent, AgentRow } from '../lib/db.js';
import { PRESETS, getPreset } from '../lib/presets.js';
import { draftAgentFromBrief, generateTrainingPrompts, optimizeAgent } from '../lib/agent.js';

export const agentRouter = Router();
const USER = process.env.DEMO_USER_ID || 'demo';
const AGENT_COLORS = ['lime', 'pink', 'orange', 'neon', 'red', 'black'] as const;

function nextColor(): typeof AGENT_COLORS[number] {
  const used = (db.prepare(`SELECT color FROM agents WHERE user_id = ?`).all(USER) as any[]).map((r) => r.color);
  for (const c of AGENT_COLORS) if (!used.includes(c)) return c;
  return AGENT_COLORS[used.length % AGENT_COLORS.length];
}

function fetchAgent(id: number): AgentRow | null {
  return (db.prepare(`SELECT * FROM agents WHERE id = ? AND user_id = ?`).get(id, USER) as AgentRow | undefined) || null;
}

// ---- Presets (for the wizard) ----
agentRouter.get('/agent-presets', (_req, res) => {
  res.json(PRESETS);
});

// ---- List ----
agentRouter.get('/agents', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM agents WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`
  ).all(USER) as AgentRow[];
  // Annotate with usage counts (conversations + recent AI messages)
  const annotated = rows.map((a) => {
    const convs = (db.prepare(
      `SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND ((agent_id = ?) OR (agent_id IS NULL AND ? = 1))`
    ).get(USER, a.id, a.is_default) as any).n;
    const sent7d = (db.prepare(
      `SELECT COUNT(*) AS n FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.is_ai = 1 AND m.is_suggestion = 0
         AND ((c.agent_id = ?) OR (c.agent_id IS NULL AND ? = 1))
         AND m.created_at > ?`
    ).get(USER, a.id, a.is_default, Date.now() - 7 * 86400000) as any).n;
    return { ...hydrateAgent(a), conversations: convs, ai_sent_7d: sent7d };
  });
  res.json(annotated);
});

// ---- Get one ----
agentRouter.get('/agents/:id', (req, res) => {
  const a = fetchAgent(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(hydrateAgent(a));
});

// ---- Create from preset (the easy path) ----
// body: { presetSlug, vibeSlug?, name? }
agentRouter.post('/agents/from-preset', (req, res) => {
  const preset = getPreset(String(req.body.presetSlug || ''));
  if (!preset) return res.status(400).json({ error: 'unknown preset' });
  if (preset.slug === 'custom') return res.status(400).json({ error: 'use /agents/from-brief for custom' });

  const vibe = preset.vibes.find((v) => v.slug === req.body.vibeSlug) || preset.vibes[0];
  const persona = vibe?.persona || '';
  const name = String(req.body.name || preset.label).slice(0, 32);
  const now = Date.now();
  const result = db.prepare(
    `INSERT INTO agents (user_id, name, emoji, color, role, persona, instructions, examples_json, rules_json, mode, voice_mode, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggest', 'off', 0, ?, ?)`
  ).run(
    USER,
    name,
    preset.emoji,
    preset.color,
    preset.slug,
    persona,
    `You handle ${preset.label.toLowerCase()} messages on my work line.`,
    JSON.stringify(preset.starterExamples),
    JSON.stringify(preset.starterRules),
    now,
    now,
  );
  const created = fetchAgent(Number(result.lastInsertRowid));
  res.json(hydrateAgent(created!));
});

// ---- Create from one-line brief (AI drafts everything) ----
// body: { brief, name? }
agentRouter.post('/agents/from-brief', async (req, res) => {
  const brief = String(req.body.brief || '').trim();
  if (!brief) return res.status(400).json({ error: 'brief required' });
  try {
    const drafted = await draftAgentFromBrief(brief);
    const now = Date.now();
    const color = drafted.color || nextColor();
    const r = db.prepare(
      `INSERT INTO agents (user_id, name, emoji, color, role, persona, instructions, examples_json, rules_json, mode, voice_mode, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'custom', ?, ?, ?, ?, 'suggest', 'off', 0, ?, ?)`
    ).run(
      USER,
      String(req.body.name || drafted.name).slice(0, 32),
      drafted.emoji,
      color,
      drafted.persona,
      drafted.instructions,
      JSON.stringify(drafted.examples),
      JSON.stringify(drafted.rules),
      now, now,
    );
    res.json(hydrateAgent(fetchAgent(Number(r.lastInsertRowid))!));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Patch (any field) ----
agentRouter.patch('/agents/:id', (req, res) => {
  const id = Number(req.params.id);
  const a = fetchAgent(id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const next = {
    name: req.body.name !== undefined ? String(req.body.name).slice(0, 32) : a.name,
    emoji: req.body.emoji !== undefined ? String(req.body.emoji).slice(0, 4) : a.emoji,
    color: AGENT_COLORS.includes(req.body.color) ? req.body.color : a.color,
    persona: req.body.persona !== undefined ? String(req.body.persona) : a.persona,
    instructions: req.body.instructions !== undefined ? String(req.body.instructions) : a.instructions,
    examples_json: req.body.examples !== undefined ? JSON.stringify(req.body.examples) : a.examples_json,
    rules_json: req.body.rules !== undefined ? JSON.stringify(req.body.rules) : a.rules_json,
    mode: ['off','suggest','auto'].includes(req.body.mode) ? req.body.mode : a.mode,
    voice_mode: ['off','suggest','auto'].includes(req.body.voice_mode) ? req.body.voice_mode : a.voice_mode,
    voice_id: req.body.voice_id !== undefined ? (req.body.voice_id === null ? null : Number(req.body.voice_id)) : (a as any).voice_id,
    voice_name: req.body.voice_name !== undefined ? String(req.body.voice_name).slice(0, 40) : (a as any).voice_name,
    tts_voice: req.body.tts_voice !== undefined ? String(req.body.tts_voice).slice(0, 60) : (a as any).tts_voice,
    send_number: req.body.send_number !== undefined ? (req.body.send_number ? String(req.body.send_number) : null) : (a as any).send_number,
  };
  db.prepare(
    `UPDATE agents SET name=?, emoji=?, color=?, persona=?, instructions=?, examples_json=?, rules_json=?, mode=?, voice_mode=?, voice_id=?, voice_name=?, tts_voice=?, send_number=?, updated_at=? WHERE id=?`
  ).run(next.name, next.emoji, next.color, next.persona, next.instructions, next.examples_json, next.rules_json, next.mode, next.voice_mode, next.voice_id, next.voice_name, next.tts_voice, next.send_number, Date.now(), id);
  res.json(hydrateAgent(fetchAgent(id)!));
});

// ---- Set default ----
agentRouter.post('/agents/:id/make-default', (req, res) => {
  const id = Number(req.params.id);
  const a = fetchAgent(id);
  if (!a) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE agents SET is_default = 0 WHERE user_id = ?`).run(USER);
  db.prepare(`UPDATE agents SET is_default = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ---- Delete ----
agentRouter.delete('/agents/:id', (req, res) => {
  const id = Number(req.params.id);
  const a = fetchAgent(id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (a.is_default) return res.status(400).json({ error: 'cannot delete default — set another default first' });
  // Unassign from any conversation first.
  db.prepare(`UPDATE conversations SET agent_id = NULL WHERE agent_id = ?`).run(id);
  db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ---- Generate training prompts ----
agentRouter.post('/agents/:id/training-prompts', async (req, res) => {
  const a = fetchAgent(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'not found' });
  try {
    const prompts = await generateTrainingPrompts(a);
    res.json({ prompts });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Optimize: returns AI-suggested patches ----
agentRouter.post('/agents/:id/optimize', async (req, res) => {
  const a = fetchAgent(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'not found' });
  try {
    const optimizations = await optimizeAgent(a);
    res.json({ optimizations });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Apply an optimization patch ----
// body: { patch: { persona?, instructions?, rules?, addExample?, mode? } }
agentRouter.post('/agents/:id/apply-patch', (req, res) => {
  const id = Number(req.params.id);
  const a = fetchAgent(id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const patch = req.body?.patch || {};
  const ah = hydrateAgent(a);
  // RULES ARE ADDITIVE — never wipe the user's existing rules. Optimize used
  // to replace the whole list, which silently turned intended behaviors into
  // "don't" rules. Now we only append new, de-duplicated rules.
  let rules = ah.rules;
  if (Array.isArray(patch.rules)) {
    const have = new Set(ah.rules.map((r: string) => r.trim().toLowerCase()));
    const added = patch.rules
      .map((r: any) => String(r).trim())
      .filter((r: string) => r && !have.has(r.toLowerCase()));
    rules = [...ah.rules, ...added];
  }
  const next: any = {
    persona: typeof patch.persona === 'string' ? patch.persona : ah.persona,
    instructions: typeof patch.instructions === 'string' ? patch.instructions : ah.instructions,
    rules,
    examples: ah.examples,
    mode: ['off','suggest','auto'].includes(patch.mode) ? patch.mode : ah.mode,
  };
  if (patch.addExample && typeof patch.addExample === 'object') {
    next.examples = [...ah.examples, { in: String(patch.addExample.in || ''), out: String(patch.addExample.out || '') }];
  }
  db.prepare(
    `UPDATE agents SET persona=?, instructions=?, rules_json=?, examples_json=?, mode=?, updated_at=? WHERE id=?`
  ).run(next.persona, next.instructions, JSON.stringify(next.rules), JSON.stringify(next.examples), next.mode, Date.now(), id);
  res.json(hydrateAgent(fetchAgent(id)!));
});

// ---- Conversation assignment ----
// PATCH /api/conversations/:id/agent  body: { agent_id | null }
agentRouter.patch('/conversations/:id/agent', (req, res) => {
  const id = Number(req.params.id);
  const aid = req.body.agent_id === null ? null : Number(req.body.agent_id);
  if (aid !== null) {
    const a = fetchAgent(aid);
    if (!a) return res.status(404).json({ error: 'agent not found' });
  }
  db.prepare(`UPDATE conversations SET agent_id = ? WHERE id = ? AND user_id = ?`).run(aid, id, USER);
  res.json({ ok: true });
});
