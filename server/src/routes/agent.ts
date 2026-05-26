import { Router } from 'express';
import { db, hydrateAgent, AgentRow,
         getOrCreateConversation, getActiveNumber, spendCredits, addCredits, getCredits, messageCost, isOptedOut } from '../lib/db.js';
import { PRESETS, getPreset } from '../lib/presets.js';
import { draftAgentFromBrief, generateTrainingPrompts, optimizeAgent } from '../lib/agent.js';
import { normalizePhone } from '../lib/phone.js';
import { twilioClient, twilioConfig } from '../lib/twilio.js';
import { openai, OPENAI_MODEL } from '../lib/openai.js';
import { emit } from '../lib/events.js';

export const agentRouter = Router();
import { OWNER_ID as USER } from '../lib/auth.js';
const AGENT_COLORS = ['lime', 'pink', 'orange', 'neon', 'red', 'black'] as const;

// Random color, biased toward unused ones so a fresh account gets variety
// instead of three lime agents in a row. The user has no UI to pick a color
// (intentional — keeps the create flow simple); rotation happens here.
function nextColor(): typeof AGENT_COLORS[number] {
  const used = new Set((db.prepare(`SELECT color FROM agents WHERE user_id = ?`).all(USER) as any[]).map((r) => r.color));
  const unused = AGENT_COLORS.filter((c) => !used.has(c));
  const pool = unused.length > 0 ? unused : (AGENT_COLORS as readonly string[]);
  return pool[Math.floor(Math.random() * pool.length)] as typeof AGENT_COLORS[number];
}

function fetchAgent(id: number): AgentRow | null {
  return (db.prepare(`SELECT * FROM agents WHERE id = ? AND user_id = ?`).get(id, USER) as AgentRow | undefined) || null;
}

// ---- Presets (for the wizard) ----
agentRouter.get('/agent-presets', (_req, res) => {
  res.json(PRESETS);
});

// ---- List ----
// Previously ran 2 subqueries PER agent (conv count + 7d sent count). With 30
// agents that was 60 queries per inbox tick. Now collapsed to TWO grouped
// queries total — counts keyed by agent_id, with NULL bucketed onto the
// default agent so the "(agent_id = ?) OR (agent_id IS NULL AND is_default)"
// fallback behavior is preserved.
agentRouter.get('/agents', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM agents WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`
  ).all(USER) as AgentRow[];
  if (rows.length === 0) return res.json([]);
  const defaultId = rows.find((r) => r.is_default)?.id ?? null;
  const convCounts = new Map<number, number>();
  for (const r of db.prepare(
    `SELECT COALESCE(agent_id, ?) AS aid, COUNT(*) AS n
       FROM conversations WHERE user_id = ?
       GROUP BY COALESCE(agent_id, ?)`
  ).all(defaultId, USER, defaultId) as { aid: number | null; n: number }[]) {
    if (r.aid != null) convCounts.set(Number(r.aid), Number(r.n));
  }
  const cutoff = Date.now() - 7 * 86400000;
  const sentCounts = new Map<number, number>();
  for (const r of db.prepare(
    `SELECT COALESCE(c.agent_id, ?) AS aid, COUNT(*) AS n
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.is_ai = 1 AND m.is_suggestion = 0 AND m.created_at > ?
       GROUP BY COALESCE(c.agent_id, ?)`
  ).all(defaultId, USER, cutoff, defaultId) as { aid: number | null; n: number }[]) {
    if (r.aid != null) sentCounts.set(Number(r.aid), Number(r.n));
  }
  res.json(rows.map((a) => ({
    ...hydrateAgent(a),
    conversations: convCounts.get(a.id) ?? 0,
    ai_sent_7d: sentCounts.get(a.id) ?? 0,
  })));
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
  // Compose instructions: the role-overview line + every starterInstruction
  // bullet from the preset. Positive directives MUST live here, not in the
  // rules list — the system prompt renders rules as "DO NOT do any of the
  // following" so a positive line in rules turns into the opposite of intent.
  const baseInstructions = `You handle ${preset.label.toLowerCase()} messages on my work line.`;
  const instructions = preset.starterInstructions.length
    ? `${baseInstructions}\n\n${preset.starterInstructions.map((s) => `- ${s}`).join('\n')}`
    : baseInstructions;
  const result = db.prepare(
    `INSERT INTO agents (user_id, name, emoji, color, role, persona, instructions, examples_json, rules_json, mode, voice_mode, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggest', 'off', 0, ?, ?)`
  ).run(
    USER,
    name,
    preset.emoji,
    nextColor(),       // randomize — no UI color picker by design
    preset.slug,
    persona,
    instructions,
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
    // Always random — no UI picker; drafted.color is ignored intentionally.
    const color = nextColor();
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

// ---- Initiate a text thread WITH this agent ----
// One-tap entry point: pick a recipient + a brief, the agent drafts the
// opening message in its own voice and sends it. The conversation is then
// auto-assigned to this agent with per-thread autopilot ON, so the agent
// handles replies without further user action.
// body: { to (e164), brief, name? }
agentRouter.post('/agents/:id/initiate-text', async (req, res) => {
  const id = Number(req.params.id);
  const agent = fetchAgent(id);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  // (Helpers used here are now imported at the top of the file — first
  // version inlined dynamic imports which paid a cold-start hit every
  // request for no real benefit, since no circular import exists.)
  const to = normalizePhone(String(req.body?.to || ''));
  const brief = String(req.body?.brief || '').trim();
  const name = req.body?.name ? String(req.body.name).trim() : '';
  if (!to) return res.status(400).json({ error: 'valid `to` phone required' });
  if (!brief) return res.status(400).json({ error: 'brief required (what should the agent text about?)' });

  if (isOptedOut(USER, to)) {
    return res.status(409).json({ error: 'This contact has opted out (replied STOP). Messaging them is not allowed.' });
  }

  // Have the agent draft the opening message in its persona. Constrained
  // to SMS length so we don't drop a paragraph on the recipient out of
  // nowhere. Reuses the same constants and rules the agent uses for replies.
  const ah = hydrateAgent(agent);
  let opening = brief; // safety fallback if OpenAI fails
  try {
    const c = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content: `You are "${ah.name}", an SMS auto-responder agent. ` +
            `Draft the FIRST outbound text to a contact based on the user's brief. ` +
            `Stay in this persona: ${ah.persona || '(concise, friendly, professional)'}. ` +
            `Follow these instructions: ${ah.instructions || '(none)'}. ` +
            `HARD RULES: 1-2 short SMS-length sentences. No emoji unless natural. ` +
            `Never claim to be an AI. If the recipient hasn't opted in, lead with a ` +
            `clear identification and an opt-out option ("reply STOP to unsubscribe").`,
        },
        {
          role: 'user',
          content: `Recipient: ${name || to}\nBrief: ${brief}\n\nReturn ONLY the opening SMS text, no quotes, no preamble.`,
        },
      ],
    });
    const drafted = c.choices[0]?.message?.content?.trim();
    if (drafted) opening = drafted.replace(/^["']|["']$/g, '');
  } catch (e: any) {
    // If OpenAI fails, send the brief itself — better than a 500.
    // The caller is told via the .agent_failed flag in the response.
  }

  // Charge + send via Twilio. Mirrors /sms/send but assigns this agent +
  // turns on autopilot before the SMS goes out, so the recipient's reply
  // lands on a thread that auto-responds.
  const cost = messageCost(opening, false);
  if (!spendCredits(USER, cost)) {
    return res.status(402).json({
      error: `Not enough credits. This message costs ${cost} (balance ${getCredits(USER)}).`,
      cost,
    });
  }

  const fromNum = getActiveNumber(USER) || twilioConfig.defaultFrom;
  const convId = getOrCreateConversation(USER, to, fromNum || null);
  let msg: any;
  try {
    msg = await twilioClient.messages.create({ to, body: opening, from: fromNum });
  } catch (err: any) {
    addCredits(USER, cost); // refund — nothing went out
    return res.status(500).json({ error: `Send failed: ${err.message}`, code: err.code });
  }

  // Persist the message + flip the thread to "this agent on autopilot" so
  // replies handle automatically.
  try {
    const r = db.prepare(
      `INSERT INTO messages (conversation_id, direction, body, twilio_sid, status, created_at, is_ai, agent_id)
       VALUES (?, 'out', ?, ?, ?, ?, 1, ?)`
    ).run(convId, opening, msg.sid, msg.status, Date.now(), id);
    db.prepare('UPDATE conversations SET last_message_at = ?, agent_id = ?, autopilot = 1 WHERE id = ?')
      .run(Date.now(), id, convId);
    // If the contact had no name, save the one the caller provided so it
    // shows up properly in the inbox right away.
    if (name) {
      db.prepare(
        `INSERT INTO contacts (user_id, phone, name) VALUES (?, ?, ?)
         ON CONFLICT(user_id, phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), contacts.name)`
      ).run(USER, to, name);
    }
    emit({ kind: 'message:new', conversationId: convId, direction: 'out' });
    res.json({
      conversationId: convId,
      messageId: Number(r.lastInsertRowid),
      twilioSid: msg.sid,
      status: msg.status,
      opening,
      autopilot: true,
    });
  } catch (e: any) {
    res.json({ conversationId: convId, twilioSid: msg.sid, status: msg.status, opening, warning: 'sent but not recorded' });
  }
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
