import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, BlogPost as Post } from '../lib/api';
import { LogoMark } from '../components/Logo';

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

export function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null | 'missing'>(null);

  useEffect(() => {
    let cancelled = false;
    const prevTitle = document.title;
    const md = document.querySelector('meta[name="description"]');
    const prevDesc = md?.getAttribute('content') || '';
    api.blogGet(String(slug))
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        document.title = `${p.title} — WrkPhn`;
        if (p.excerpt) md?.setAttribute('content', p.excerpt);
        // Article structured data for rich results.
        const ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'blog-ld';
        ld.text = JSON.stringify({
          '@context': 'https://schema.org', '@type': 'BlogPosting',
          headline: p.title, description: p.excerpt,
          datePublished: p.published_at ? new Date(p.published_at).toISOString() : undefined,
          dateModified: new Date(p.updated_at).toISOString(),
          author: { '@type': 'Organization', name: p.author },
          publisher: { '@type': 'Organization', name: 'WrkPhn' },
          keywords: p.keywords,
        });
        document.head.appendChild(ld);
      })
      .catch(() => !cancelled && setPost('missing'));
    return () => {
      cancelled = true;
      document.title = prevTitle;
      if (md) md.setAttribute('content', prevDesc);
      document.getElementById('blog-ld')?.remove();
    };
  }, [slug]);

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
        </nav>
        <div className="lp-nav-cta">
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/register" className="btn lime">Get started</Link>
        </div>
      </header>

      <main>
        <article className="lp-section" style={{ maxWidth: 760 }}>
          {post === null && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {post === 'missing' && (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontFamily: 'var(--display)' }}>Post not found</h1>
              <Link to="/blog" className="btn lime" style={{ marginTop: 14 }}>Back to blog</Link>
            </div>
          )}
          {post && post !== 'missing' && (
            <>
              <Link to="/blog" style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                ‹ All posts
              </Link>
              <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1.15, margin: '14px 0 8px' }}>
                {post.title}
              </h1>
              <div style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13, marginBottom: 24 }}>
                {fmt(post.published_at)} · {post.author}{post.ai ? ' · 🤖 written by WrkPhn AI' : ''}
              </div>
              <div className="blog-body" dangerouslySetInnerHTML={{ __html: post.body_html }} />
              <div className="lp-cta-row" style={{ marginTop: 36 }}>
                <Link to="/register" className="btn lime lg">Start free — no contract</Link>
              </div>
            </>
          )}
        </article>
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
