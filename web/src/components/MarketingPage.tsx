import { Link } from 'react-router-dom';
import { MarketingLayout } from './MarketingLayout';
import { useSeo, SeoConfig } from '../lib/seo';

// Data shape every dedicated marketing landing fills in. Encourages keyword-
// rich copy at known structural slots so each page has the same SEO skeleton
// (H1, intro paragraph, three benefit cards, "how it works", deep section,
// FAQ, final CTA) — but unique content so Google doesn't see them as dupes.
export interface MarketingPageProps {
  seo: SeoConfig;
  eyebrow: string;
  h1: string;
  intro: string;        // 2-3 sentence summary right under the h1
  primaryCta?: string;  // defaults to 'Start free'
  benefits: { icon: string; title: string; body: string }[];      // 3-6
  how: { n: string; t: string; d: string }[];                     // 3-4
  deep: { h2: string; body: string[] }[];                          // long-form text sections, 1-3
  related?: { to: string; label: string; blurb: string }[];        // cross-links
  faq: { q: string; a: string }[];                                 // 3-6
  ctaHeadline: string;
  ctaSub: string;
}

export function MarketingPage(p: MarketingPageProps) {
  useSeo(p.seo);
  return (
    <MarketingLayout>
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">{p.eyebrow}</div>
          <h1>{p.h1}</h1>
          <p className="lp-sub">{p.intro}</p>
          <div className="lp-hero-actions">
            <Link to="/register" className="btn lime lg">{p.primaryCta || 'Start free'}</Link>
            <Link to="/login" className="btn ghost lg">I have an account</Link>
          </div>
          <div className="lp-trust">No hardware · No contract · Cancel anytime · Live in minutes</div>
        </div>
        <div className="lp-hero-art" aria-hidden="true">
          <div className="lp-phone">
            <div className="lp-bubble in">Hey, are you open Saturday?</div>
            <div className="lp-bubble out">We sure are — 9am to 4pm. Want me to book you in? 🤖</div>
            <div className="lp-bubble in">Yes please, 10am</div>
            <div className="lp-bubble out">Done! See you Saturday at 10. 🎉</div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>Why teams pick WrkPhn</h2>
        <div className="lp-grid">
          {p.benefits.map((b) => (
            <article key={b.title} className="lp-card">
              <div className="lp-card-icon" aria-hidden="true">{b.icon}</div>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-how">
        <h2>How it works</h2>
        <div className="lp-steps">
          {p.how.map((s) => (
            <div key={s.n} className="lp-step">
              <div className="lp-step-n">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
        <div className="lp-cta-row">
          <Link to="/register" className="btn lime lg">{p.primaryCta || 'Start free'}</Link>
        </div>
      </section>

      {p.deep.map((d) => (
        <section key={d.h2} className="lp-section">
          <h2>{d.h2}</h2>
          {d.body.map((para, i) => (
            <p key={i} className="lp-section-sub" style={{ maxWidth: 820, margin: '0 auto 12px' }}>{para}</p>
          ))}
        </section>
      ))}

      {p.related && p.related.length > 0 && (
        <section className="lp-section">
          <h2>Related WrkPhn tools</h2>
          <p className="lp-section-sub">One platform, every channel — explore the rest of WrkPhn.</p>
          <div className="lp-grid">
            {p.related.map((r) => (
              <Link key={r.to} to={r.to} className="lp-card" style={{ textDecoration: 'none' }}>
                <h3>{r.label}</h3>
                <p>{r.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="lp-section">
        <h2>Frequently asked questions</h2>
        <div className="lp-faq">
          {p.faq.map((f) => (
            <details key={f.q} className="lp-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <h2>{p.ctaHeadline}</h2>
        <p>{p.ctaSub}</p>
        <Link to="/register" className="btn lime lg">{p.primaryCta || 'Get started free'}</Link>
      </section>
    </MarketingLayout>
  );
}

// JSON-LD helpers — every dedicated landing emits a Service + FAQPage block.
export function serviceLd(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    url,
    provider: { '@type': 'Organization', name: 'WrkPhn', url: 'https://wrkphn.com/' },
    areaServed: { '@type': 'Country', name: 'United States' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
export function faqLd(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
