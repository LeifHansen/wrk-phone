import { Router } from 'express';
import {
  listBlogPosts, getBlogPostBySlug, getBlogPost, createBlogPost,
  updateBlogPost, deleteBlogPost, getBlogSettings, saveBlogSettings,
  db,
} from '../lib/db.js';
import { requireSuperadmin, isSuperadmin } from '../lib/auth.js';
import { runBlogAgent, DEFAULT_TOPICS } from '../lib/blog.js';
import { log } from '../lib/log.js';

export const blogRouter = Router();

// ───────── Public ─────────
blogRouter.get('/blog', (_req, res) => {
  const posts = listBlogPosts({ includeDrafts: false }).map((p) => ({
    slug: p.slug, title: p.title, excerpt: p.excerpt, tags: p.tags,
    author: p.author, ai: p.ai, published_at: p.published_at,
  }));
  res.json({ posts });
});

blogRouter.get('/blog/:slug', (req, res) => {
  const p = getBlogPostBySlug(String(req.params.slug));
  if (!p || p.status !== 'published') return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// ───────── Superadmin ─────────
blogRouter.get('/admin/whoami', (req, res) => {
  res.json({ superadmin: isSuperadmin(req) });
});

blogRouter.get('/admin/overview', requireSuperadmin, (_req, res) => {
  const n = (q: string) => (db.prepare(q).get() as any)?.n ?? 0;
  res.json({
    users: n(`SELECT COUNT(*) n FROM users`),
    conversations: n(`SELECT COUNT(*) n FROM conversations`),
    messages: n(`SELECT COUNT(*) n FROM messages`),
    agents: n(`SELECT COUNT(*) n FROM agents`),
    campaigns: n(`SELECT COUNT(*) n FROM campaigns`),
    blogPublished: n(`SELECT COUNT(*) n FROM blog_posts WHERE status='published'`),
    blogDrafts: n(`SELECT COUNT(*) n FROM blog_posts WHERE status='draft'`),
  });
});

blogRouter.get('/admin/blog', requireSuperadmin, (_req, res) => {
  res.json({ posts: listBlogPosts({ includeDrafts: true }) });
});

blogRouter.post('/admin/blog', requireSuperadmin, (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'title required' });
  const post = createBlogPost({
    title: String(b.title), excerpt: b.excerpt, body_html: b.body_html,
    tags: b.tags, keywords: b.keywords,
    status: b.status === 'published' ? 'published' : 'draft',
    author: b.author || 'WrkPhn', ai: false,
  });
  res.json(post);
});

blogRouter.patch('/admin/blog/:id', requireSuperadmin, (req, res) => {
  const updated = updateBlogPost(Number(req.params.id), req.body || {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

blogRouter.delete('/admin/blog/:id', requireSuperadmin, (req, res) => {
  if (!getBlogPost(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
  deleteBlogPost(Number(req.params.id));
  res.json({ ok: true });
});

blogRouter.get('/admin/blog-settings', requireSuperadmin, (_req, res) => {
  res.json({ settings: getBlogSettings(), defaultTopics: DEFAULT_TOPICS });
});

blogRouter.put('/admin/blog-settings', requireSuperadmin, (req, res) => {
  const b = req.body || {};
  const s = saveBlogSettings({
    enabled: b.enabled, cadence_days: b.cadence_days, autopublish: b.autopublish,
    tone: b.tone, topics: b.topics,
    // Reschedule next run from now when (re)enabled and not already scheduled.
    next_run_at: b.enabled ? (getBlogSettings().next_run_at || Date.now() + 60_000) : null,
  });
  res.json({ settings: s });
});

blogRouter.post('/admin/blog/generate', requireSuperadmin, async (_req, res) => {
  try {
    const post = await runBlogAgent({ force: true });
    res.json({ ok: true, post });
  } catch (e: any) {
    log.error('blog.generate', 'manual generation failed', e);
    res.status(500).json({ error: e.message });
  }
});
