import { db, AgentRow, hydrateAgent, getAgentForConversation } from './db.js';
import { openai, OPENAI_MODEL as MODEL } from './openai.js';
import { log } from './log.js';

export type AgentMode = 'off' | 'suggest' | 'auto';

interface MsgRow {
  direction: 'in' | 'out';
  body: string;
  created_at: number;
}

const SAFETY_REGEX = /urgent|emergency|asap|lawyer|legal|medical|doctor|hospital|invoice|wire|payment|password|ssn|refund|chargeback/i;

function buildSystemPrompt(a: ReturnType<typeof hydrateAgent>) {
  const exampleBlock = a.examples.length
    ? `\n\nExample exchanges (style reference, do not copy verbatim):\n${a.examples
        .map((e, i) => `Example ${i + 1}:\nInbound: ${e.in}\nReply: ${e.out}`)
        .join('\n\n')}`
    : '';

  const ruleBlock = a.rules.length
    ? `\n\nDO NOT do any of the following:\n${a.rules.map((r) => `- ${r}`).join('\n')}`
    : '';

  return `You are "${a.name}", an SMS auto-responder on the user's WrkPhn work line.

PERSONA / VOICE:
${a.persona || '(default — concise, friendly, professional)'}

INSTRUCTIONS:
${a.instructions || '(default — answer when you can, ask a clarifying question when you cannot, never invent facts about the user)'}${ruleBlock}

HARD RULES:
- Reply in 1–3 short SMS-length sentences. No emoji unless the inbound used one first.
- Never claim to be an AI unless directly asked.
- If the message looks urgent, sensitive, legal, medical, financial, or asks for a binding commitment — respond with a short holding reply ("let me check and get back to you shortly") and surface as a suggestion only.
- If you don't know, say so briefly.${exampleBlock}`;
}

export async function generateReply(
  userId: string,
  conversationId: number,
  inboundBody: string
): Promise<{ reply: string; safeToAutoSend: boolean; agent: AgentRow }> {
  const agent = getAgentForConversation(userId, conversationId)!;
  const a = hydrateAgent(agent);

  const history = db.prepare(
    `SELECT direction, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`
  ).all(conversationId) as MsgRow[];

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(a) },
    ...history.reverse().map((m) => ({
      role: (m.direction === 'in' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.body,
    })),
    { role: 'user' as const, content: inboundBody },
  ];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.6,
    max_tokens: 200,
  });

  const reply = completion.choices[0]?.message?.content?.trim() || '';
  const safeToAutoSend = !SAFETY_REGEX.test(inboundBody);
  return { reply, safeToAutoSend, agent };
}

export async function generateVoiceGreeting(agent: AgentRow): Promise<string> {
  const a = hydrateAgent(agent);
  if (a.voice_mode === 'off') {
    return "Hi, you've reached this WrkPhn line. Please leave a message after the tone.";
  }
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Generate a short voicemail greeting (1–2 sentences) for a personal work phone line. No emoji.' },
      { role: 'user', content: `Voice/persona: ${a.persona || 'concise and professional'}. Use first person. Do not state a name. Mention they can leave a message.` },
    ],
    temperature: 0.5,
    max_tokens: 80,
  });
  return completion.choices[0]?.message?.content?.trim()
    || "Hi, you've reached my Wrk line. Leave a message and I'll get back to you.";
}

// ---------- Intelligence: draft an agent from a one-liner ----------

export interface DraftedAgent {
  name: string;
  emoji: string;
  color: 'lime' | 'pink' | 'orange' | 'neon' | 'red' | 'black';
  persona: string;
  instructions: string;
  rules: string[];
  examples: { in: string; out: string }[];
}

export async function draftAgentFromBrief(brief: string): Promise<DraftedAgent> {
  const sys = `You design simple SMS auto-responder agents. Given a one-line description of the agent's purpose, return a complete agent config in strict JSON. Be concrete and short. Persona must be 1-2 sentences. Instructions must be 2-4 sentences. Rules: 3-5 short imperatives. Examples: 3 realistic inbound→reply pairs that match the persona. Never use emoji in persona/instructions; emoji field only.`;
  const user = `Brief: ${brief}

Return JSON with this exact shape:
{
  "name": "string (≤ 24 chars, no emoji)",
  "emoji": "single emoji that fits",
  "color": "lime | pink | orange | neon | red | black",
  "persona": "string",
  "instructions": "string",
  "rules": ["string", ...],
  "examples": [{"in":"...","out":"..."}, ...]
}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.5,
    response_format: { type: 'json_object' },
    max_tokens: 700,
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  return {
    name: String(parsed.name || 'Agent').slice(0, 24),
    emoji: String(parsed.emoji || '🤖').slice(0, 4),
    color: ['lime','pink','orange','neon','red','black'].includes(parsed.color) ? parsed.color : 'neon',
    persona: String(parsed.persona || ''),
    instructions: String(parsed.instructions || ''),
    rules: Array.isArray(parsed.rules) ? parsed.rules.map((r: any) => String(r)).slice(0, 8) : [],
    examples: Array.isArray(parsed.examples)
      ? parsed.examples.map((e: any) => ({ in: String(e.in || ''), out: String(e.out || '') })).slice(0, 6)
      : [],
  };
}

// ---------- Intelligence: training-question generator ----------
// Given an agent, propose 3 realistic inbound messages they're likely to receive
// so the user can write replies as training examples.

export async function generateTrainingPrompts(agent: AgentRow): Promise<string[]> {
  const a = hydrateAgent(agent);
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Propose realistic inbound SMS messages this agent would receive. Return strict JSON with key "prompts": array of 3 short, distinct strings.' },
      {
        role: 'user',
        content: `Agent name: ${a.name}\nRole: ${a.role || 'unspecified'}\nPersona: ${a.persona || '(none)'}\nInstructions: ${a.instructions || '(none)'}\n\nProduce 3 inbound SMS messages this agent would realistically receive (varied: 1 easy, 1 awkward, 1 sensitive).`,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
    max_tokens: 300,
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{"prompts":[]}');
  return Array.isArray(parsed.prompts) ? parsed.prompts.map((p: any) => String(p)).slice(0, 3) : [];
}

// ---------- Intelligence: optimize agent ----------
// Looks at the agent's last messages + dismissed suggestions + safety blocks,
// returns a list of structured, one-tap-applicable suggestions.

export interface Optimization {
  id: string;                  // stable for dedupe in UI
  type: 'persona' | 'instructions' | 'rules' | 'example' | 'mode';
  title: string;               // ≤ 60 chars, plain English
  rationale: string;           // 1-2 sentences why
  patch: Partial<{
    persona: string;
    instructions: string;
    rules: string[];
    addExample: { in: string; out: string };
    mode: AgentMode;
  }>;
}

export async function optimizeAgent(agent: AgentRow): Promise<Optimization[]> {
  const a = hydrateAgent(agent);
  // Gather last 50 messages this agent handled (sent or suggested)
  const recent = db.prepare(
    `SELECT m.direction, m.body, m.is_suggestion, m.is_ai, m.safety_blocked, c.peer_phone
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = ? AND (c.agent_id = ? OR (c.agent_id IS NULL AND ? = 1))
     ORDER BY m.created_at DESC LIMIT 50`
  ).all(agent.user_id, agent.id, agent.is_default) as any[];

  // Cheap counts the model can use
  const counts = {
    inbound: recent.filter((r) => r.direction === 'in').length,
    aiSent: recent.filter((r) => r.direction === 'out' && r.is_ai && !r.is_suggestion).length,
    suggestionsPending: recent.filter((r) => r.is_suggestion).length,
    safetyBlocks: recent.filter((r) => r.safety_blocked).length,
  };

  const summary = recent.slice(0, 30).reverse().map((r) => {
    const tag = r.direction === 'in'
      ? '←IN'
      : r.is_suggestion ? '⤳SUGGEST' : r.is_ai ? '→AI-SENT' : '→USER';
    return `${tag}: ${r.body.slice(0, 200)}`;
  }).join('\n');

  const sys = `You are a coach for SMS auto-responder agents. Given the agent's config and recent traffic, propose up to 5 specific, one-click improvements as JSON patches.

CRITICAL RULES:
- A "rules" patch is ONLY for genuine guardrails the user clearly wants the agent to NEVER do (e.g. "never share pricing"). NEVER express the agent's intended/positive behavior as a rule. NEVER negate or restrict what the persona/instructions say the agent SHOULD do. If unsure, do not propose a rules patch.
- Behavioral guidance ("be more concise", "ask a clarifying question") goes in an "instructions" patch, never as a "don't" rule.
- "rules" patches must contain ONLY the NEW rule(s) to add — they are appended to existing rules, not a replacement list. Keep to 1-2 short additions.
- Prefer additive, narrow changes. Be honest with low signal — return fewer items. Output strict JSON.`;

  const user = `Agent name: ${a.name}
Role: ${a.role || 'unspecified'}
Persona: ${a.persona || '(empty)'}
Instructions: ${a.instructions || '(empty)'}
Rules: ${JSON.stringify(a.rules)}
Examples: ${JSON.stringify(a.examples)}
Current mode: ${a.mode} | Voice mode: ${a.voice_mode}

Recent traffic counts: inbound=${counts.inbound}, ai-sent=${counts.aiSent}, suggestions-pending=${counts.suggestionsPending}, safety-blocks=${counts.safetyBlocks}

Recent traffic (oldest→newest, truncated):
${summary || '(no recent traffic — propose only fundamentals)'}

Return JSON of shape:
{
  "optimizations": [
    {
      "id": "kebab-case-stable-id",
      "type": "persona | instructions | rules | example | mode",
      "title": "short plain English (≤60 chars)",
      "rationale": "1-2 sentences",
      "patch": {
        // include EXACTLY ONE of these:
        "persona": "new full persona text"
        | "instructions": "new full instructions text"
        | "rules": ["ONLY the new guardrail(s) to append — never the agent's intended behavior"]
        | "addExample": {"in":"...","out":"..."}
        | "mode": "off | suggest | auto"
      }
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
    response_format: { type: 'json_object' },
    // Bumped from 900 → 1800. For agents with long personas + many rules
    // (PrankMode is the worst offender), 900 truncated mid-object and the
    // JSON.parse below crashed with a 500. 1800 still keeps the request
    // cheap, fits 5 verbose optimization objects.
    max_tokens: 1800,
  });
  // Defensive parse: when OpenAI still produces malformed JSON (truncated
  // by the cap, unexpected control char, etc.), return an empty list with
  // a warning instead of bubbling a 500 to the user. The UI shows "no
  // optimizations" which is the right outcome — better than a crashed
  // page on a tap of the ✨ Optimize button.
  let parsed: any;
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content || '{"optimizations":[]}');
  } catch (e) {
    log.warn('agent.optimize', 'JSON parse failed; returning empty optimization list', e);
    return [];
  }
  if (!Array.isArray(parsed.optimizations)) return [];
  return parsed.optimizations.slice(0, 5).map((o: any, i: number) => ({
    id: String(o.id || `opt-${i}`),
    type: ['persona','instructions','rules','example','mode'].includes(o.type) ? o.type : 'instructions',
    title: String(o.title || '').slice(0, 80),
    rationale: String(o.rationale || ''),
    patch: o.patch && typeof o.patch === 'object' ? o.patch : {},
  }));
}

export { SAFETY_REGEX };
