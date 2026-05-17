import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, BlogCard } from '../lib/api';
import { LogoMark } from '../components/Logo';

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export function Blog() {
  const [posts, setPosts] = useState<BlogCard[] | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = 'WrkPhn Blog — AI SMS marketing, AI text & voice agents';
    const md = document.querySelector('meta[name="description"]');
    const prevDesc = md?.getAttribute('content') || '';
    md?.setAttribute('content',
      'Guides on AI SMS marketing, AI text agents, AI voice agents, and running a cheap, ' +
      'no-contract business phone line that is easy to use.');
    api.blogList().then((d) => setPosts(d.posts)).catch(() => setPosts([]));
    return () => { document.title = prev; if (md) md.setAttribute('content', prevDesc); };
  }, []);

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/lp" className="lp-brand" aria-label="WrkPhn home">
          <LogoMark size={36} />
          <span className="lp-brand-word">WrkPhn</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Primary">
          <Link to="/lp">Home</Link>
          <Link to="/blog">Blog</Link>
          <a href="/lp#faq">FAQ</a>
        </nav>
        <div className="lp-nav-cta">
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/register" className="btn lime">Get started</Link>
        </div>
      </header>

      <main>
        <section className="lp-section">
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 40, textAlign: 'center', margin: '0 0 8px' }}>
            The WrkPhn Blog
          </h1>
          <p className="lp-section-sub">
            Practical playbooks on AI SMS marketing, AI text agents, AI voice agents,
            and running an easy, cheap, no-contract business line.
          </p>

          {posts === null && <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>}
          {posts && posts.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
              First posts publishing soon — check back shortly.
            </p>
          )}

          <div className="lp-grid">
            {posts?.map((p) => (
              <article key={p.slug} className="lp-card">
                <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>
                  <Link to={`/blog/${p.slug}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                    {p.title}
                  </Link>
                </h2>
                <p>{p.excerpt}</p>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
                  {fmt(p.published_at)} · {p.author}
                  {p.ai ? ' · 🤖 AI' : ''}
                </div>
                <Link to={`/blog/${p.slug}`} className="btn ghost" style={{ marginTop: 12 }}>
                  Read →
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>Try the AI work phone.</h2>
          <p>AI text & voice agents, SMS marketing — easy, cheap, no contract.</p>
          <Link to="/register" className="btn lime lg">Start free</Link>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-foot-brand"><LogoMark size={28} /><span>WrkPhn</span></div>
        <div className="lp-foot-links">
          <Link to="/lp">Home</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/register">Register</Link>
        </div>
        <div className="lp-foot-fine">© {new Date().getFullYear()} WrkPhn. All rights reserved.</div>
      </footer>
    </div>
  );
}
