import { useEffect, useState } from 'react';
import { api, BlogPost, BlogSettings } from '../lib/api';
import { toast } from '../components/Toast';

export function Superadmin() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'overview' | 'agent' | 'posts'>('overview');
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [settings, setSettings] = useState<BlogSettings | null>(null);
  const [defaultTopics, setDefaultTopics] = useState<string[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [edit, setEdit] = useState<BlogPost | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminWhoami()
      .then((r) => {
        setAllowed(r.superadmin);
        if (r.superadmin) refreshAll();
      })
      .catch(() => setAllowed(false));
  }, []);

  const refreshAll = async () => {
    try {
      const [o, s, p] = await Promise.all([
        api.adminOverview(), api.adminBlogSettings(), api.adminBlogList(),
      ]);
      setStats(o);
      setSettings(s.settings);
      setDefaultTopics(s.defaultTopics);
      setPosts(p.posts);
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const r = await api.adminBlogSettingsSave(settings);
      setSettings(r.settings);
      toast('Blog agent settings saved');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const generateNow = async () => {
    setBusy(true);
    try {
      const r = await api.adminBlogGenerate();
      toast(`Post generated: "${r.post.title}"`);
      await refreshAll();
      setTab('posts');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const savePost = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await api.adminBlogUpdate(edit.id, edit);
      else await api.adminBlogCreate(edit);
      toast('Post saved');
      setEdit(null);
      await refreshAll();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const delPost = async (p: BlogPost) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    try { await api.adminBlogDelete(p.id); toast('Deleted'); refreshAll(); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  const togglePublish = async (p: BlogPost) => {
    try {
      await api.adminBlogUpdate(p.id, { status: p.status === 'published' ? 'draft' : 'published' });
      refreshAll();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  if (allowed === null) return <div className="page-body"><div className="spinner" style={{ margin: '40px auto', display: 'block' }} /></div>;
  if (!allowed) {
    return (
      <>
        <div className="page-h"><div><h2>Superadmin</h2><div className="sub">Restricted</div></div></div>
        <div className="page-body"><div className="cond-card">
          <p style={{ color: 'var(--muted)' }}>
            You don't have superadmin access. Set <code>SUPERADMIN_EMAILS</code> on the
            server (or sign in as the owner account) to manage the blog agent.
          </p>
        </div></div>
      </>
    );
  }

  return (
    <>
      <div className="page-h">
        <div><h2>Superadmin</h2><div className="sub">Blog agent, content & app stats</div></div>
      </div>
      <div className="page-body">
        <div className="wiz-steps" style={{ marginBottom: 18 }}>
          {(['overview', 'agent', 'posts'] as const).map((t) => (
            <button key={t} className={'btn ' + (tab === t ? 'lime' : 'ghost')} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'agent' ? 'Blog agent' : `Posts (${posts.length})`}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="sa-grid">
            {stats && Object.entries(stats).map(([k, v]) => (
              <div key={k} className="cond-card sa-stat">
                <div className="sa-stat-n">{v}</div>
                <div className="sa-stat-l">{k.replace(/([A-Z])/g, ' $1')}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'agent' && settings && (
          <div className="cond-card" style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
            <label className="sa-row">
              <input type="checkbox" checked={!!settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked ? 1 : 0 })} />
              <span><strong>Auto-post enabled</strong> — the AI writes a new SEO post on a schedule</span>
            </label>
            <label className="sa-row">
              <input type="checkbox" checked={!!settings.autopublish}
                onChange={(e) => setSettings({ ...settings, autopublish: e.target.checked ? 1 : 0 })} />
              <span><strong>Auto-publish</strong> — publish immediately (off = save as draft for review)</span>
            </label>
            <label>
              <div className="sa-label">CADENCE (days between posts)</div>
              <input className="input" type="number" min={1} value={settings.cadence_days}
                onChange={(e) => setSettings({ ...settings, cadence_days: Number(e.target.value) })}
                style={{ maxWidth: 140 }} />
            </label>
            <label>
              <div className="sa-label">TONE</div>
              <input className="input" value={settings.tone}
                onChange={(e) => setSettings({ ...settings, tone: e.target.value })} />
            </label>
            <label>
              <div className="sa-label">TOPICS (one per line — blank uses built-in SEO rotation)</div>
              <textarea className="textarea" rows={6} value={settings.topics}
                placeholder={defaultTopics.join('\n')}
                onChange={(e) => setSettings({ ...settings, topics: e.target.value })} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {settings.last_run_at ? `Last run: ${new Date(settings.last_run_at).toLocaleString()}` : 'Never run yet.'}
              {settings.next_run_at ? ` · Next: ${new Date(settings.next_run_at).toLocaleString()}` : ''}
            </div>
            <div className="wiz-nav">
              <button className="btn lg lime" onClick={saveSettings} disabled={busy}>Save settings</button>
              <button className="btn lg" onClick={generateNow} disabled={busy}>
                {busy ? 'Working…' : '✨ Generate a post now'}
              </button>
            </div>
          </div>
        )}

        {tab === 'posts' && (
          <>
            <button className="btn lime" style={{ marginBottom: 14 }}
              onClick={() => setEdit({ id: 0, slug: '', title: '', excerpt: '', body_html: '', tags: '', keywords: '', author: 'WrkPhn', ai: 0, status: 'draft', published_at: null, created_at: 0, updated_at: 0 })}>
              + New post
            </button>
            <div className="setup-list">
              {posts.map((p) => (
                <div key={p.id} className="setup-num">
                  <div style={{ flex: 1 }}>
                    <div className="setup-num-text" style={{ fontSize: 15 }}>{p.title}</div>
                    <div className="setup-num-meta">
                      {p.status === 'published' ? '● published' : '○ draft'}
                      {p.ai ? ' · 🤖 AI' : ''} · /blog/{p.slug}
                    </div>
                  </div>
                  <button className="btn ghost" onClick={() => togglePublish(p)}>
                    {p.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="btn ghost" onClick={() => setEdit(p)}>Edit</button>
                  <button className="btn ghost" onClick={() => delPost(p)}>🗑</button>
                </div>
              ))}
              {posts.length === 0 && <p style={{ color: 'var(--muted)' }}>No posts yet.</p>}
            </div>
          </>
        )}

        {edit && (
          <>
            <div className="modal-backdrop" onClick={() => setEdit(null)} />
            <div className="sheet" style={{ maxHeight: '85vh', overflow: 'auto' }}>
              <div className="handle" />
              <h3>{edit.id ? 'Edit post' : 'New post'}</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <label><div className="sa-label">TITLE</div>
                  <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
                <label><div className="sa-label">EXCERPT (meta description)</div>
                  <input className="input" value={edit.excerpt} onChange={(e) => setEdit({ ...edit, excerpt: e.target.value })} /></label>
                <label><div className="sa-label">TAGS / KEYWORDS</div>
                  <input className="input" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></label>
                <label><div className="sa-label">BODY (HTML)</div>
                  <textarea className="textarea" rows={12} value={edit.body_html} onChange={(e) => setEdit({ ...edit, body_html: e.target.value })} /></label>
                <label className="sa-row">
                  <input type="checkbox" checked={edit.status === 'published'}
                    onChange={(e) => setEdit({ ...edit, status: e.target.checked ? 'published' : 'draft' })} />
                  <span>Published</span>
                </label>
              </div>
              <div className="wiz-nav" style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn lg lime" onClick={savePost} disabled={busy}>Save</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
