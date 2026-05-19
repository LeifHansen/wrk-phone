import OpenAI from 'openai';
import sanitizeHtml from 'sanitize-html';
import { createBlogPost, getBlogSettings, saveBlogSettings, BlogPost } from './db.js';
import { log } from './log.js';

// Model output is untrusted (prompt instructions are not a security control).
// Strict allowlist — exactly the tags the prompt is told to produce. Anything
// else (script, iframe, event handlers, styles, javascript: URLs) is dropped.
function sanitizeBodyHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br', 'blockquote'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Default SEO topic rotation if the admin hasn't set their own. These map to
// the exact terms we want WrkPhn to rank for.
export const DEFAULT_TOPICS = [
  'AI SMS marketing for small businesses',
  'AI text agents that reply to customers automatically',
  'AI voice agents for answering business calls',
  'How to set up a cheap business phone number with no contract',
  'AI texting vs. hiring a receptionist: cost comparison',
  'Compliant SMS marketing (STOP/HELP, 10DLC) made easy',
  'After-hours customer texting with an AI agent',
  'Best easy-to-use work phone apps for solopreneurs',
  'Shared team inbox for calls and texts',
  'Automating appointment reminders over SMS',
];

const KEYWORDS =
  'AI SMS marketing, AI text agents, AI voice agents, AI work phone, business texting app, ' +
  'cheap business phone number, no contract phone service, automated SMS replies, ' +
  'AI receptionist, shared team inbox, 10DLC compliant texting';

function pickTopic(settings: { topics: string }): string {
  const list = settings.topics
    .split('\n').map((t) => t.trim()).filter(Boolean);
  const pool = list.length ? list : DEFAULT_TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function generateBlogDraft(topic: string, tone: string): Promise<{
  title: string; excerpt: string; body_html: string; tags: string; keywords: string;
}> {
  const c = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content:
          'You are the content marketer for WrkPhn, an AI work-phone app: one shared ' +
          'business number with AI text agents, AI voice agents, AI SMS marketing, a ' +
          'shared team inbox, easy to use, cheap, and no contract. Write original, ' +
          'genuinely useful SEO blog posts that naturally use those terms. Never ' +
          'fabricate statistics or quotes. Output clean, safe HTML only (h2, h3, p, ' +
          'ul, li, strong, a). No <script>, no inline styles, no <h1>.',
      },
      {
        role: 'user',
        content:
          `Write a blog post on: "${topic}".\n` +
          `Tone: ${tone}.\n` +
          `Length: 700-1000 words. Include a short intro, 3-5 H2 sections, a bulleted ` +
          `takeaways list, and a closing CTA to try WrkPhn (link text "Start free", ` +
          `href "/register"). Work in these terms where natural: AI SMS marketing, ` +
          `AI text agents, AI voice agents, easy to use, cheap, no contract.\n\n` +
          `Return JSON: {\n` +
          ` "title": "compelling, <= 65 chars, keyword-rich",\n` +
          ` "excerpt": "<= 160 char meta description",\n` +
          ` "tags": "comma,separated,3-6 tags",\n` +
          ` "keywords": "comma,separated focus keywords",\n` +
          ` "body_html": "the article as safe HTML"\n}`,
      },
    ],
    max_tokens: 2200,
  });
  const j = JSON.parse(c.choices[0]?.message?.content || '{}');
  return {
    title: String(j.title || topic).slice(0, 90),
    excerpt: String(j.excerpt || '').slice(0, 200),
    body_html: sanitizeBodyHtml(String(j.body_html || '')),
    tags: String(j.tags || ''),
    keywords: String(j.keywords || KEYWORDS),
  };
}

// Generate + persist one post. Returns it. Used by the scheduler and the
// superadmin "Generate now" button.
export async function runBlogAgent(opts: { force?: boolean } = {}): Promise<BlogPost> {
  const s = getBlogSettings();
  const topic = pickTopic(s);
  const draft = await generateBlogDraft(topic, s.tone);
  const post = createBlogPost({
    ...draft,
    status: s.autopublish ? 'published' : 'draft',
    author: 'WrkPhn AI',
    ai: true,
  });
  const now = Date.now();
  saveBlogSettings({
    last_run_at: now,
    next_run_at: now + Math.max(1, s.cadence_days) * 86400000,
  });
  log.info('blog.agent', `generated post "${post.title}" (${post.status})`, { topic, force: !!opts.force });
  return post;
}

// Hourly tick. Generates when enabled and due. Cheap no-op otherwise.
export function startBlogScheduler() {
  const tick = async () => {
    try {
      const s = getBlogSettings();
      if (!s.enabled) return;
      const due = !s.next_run_at || Date.now() >= s.next_run_at;
      if (!due) return;
      await runBlogAgent();
    } catch (e) {
      log.error('blog.scheduler', 'weekly generation failed', e);
    }
  };
  // First check shortly after boot, then hourly.
  setTimeout(tick, 30_000);
  setInterval(tick, 3_600_000);
  log.info('blog.scheduler', 'started (hourly tick)');
}
