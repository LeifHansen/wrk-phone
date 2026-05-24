import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';
import { MARKETING_LINKS } from '../components/MarketingLayout';

// Public marketing site. SEO-first: real headings, keyword-rich descriptive
// copy, and document <title>/<meta> set on mount so crawlers that execute JS
// get the right signals (static fallbacks live in index.html for no-JS bots).
const FEATURES = [
  {
    icon: '🤖',
    title: 'AI text agents',
    body:
      'Custom AI text agents reply to customer SMS in your voice in seconds — suggest mode for approval, or full autopilot per conversation. Like an AI receptionist that never sleeps.',
  },
  {
    icon: '📞',
    title: 'AI voice agents',
    body:
      'AI voice agents answer and screen inbound calls, take messages, and book appointments so you never miss a lead — even after hours or on weekends.',
  },
  {
    icon: '📣',
    title: 'AI SMS marketing',
    body:
      'Run AI SMS marketing campaigns: segment contacts, personalize blasts, and let AI follow up automatically. Built-in STOP/HELP and opt-out tracking keep you compliant.',
  },
  {
    icon: '💬',
    title: 'Shared team inbox',
    body:
      'Every call and text in one threaded inbox. Assign conversations, leave AI on suggest, or let an agent take over when you step away.',
  },
  {
    icon: '⚡',
    title: 'Easy to use',
    body:
      'No hardware, no PBX, no training. Describe your business in a sentence and your AI agent is live in minutes — from any browser or phone.',
  },
  {
    icon: '💸',
    title: 'Cheap, no contract',
    body:
      'A fraction of the cost of a receptionist or answering service. Pay as you go, cancel anytime — no contracts, no setup fees, no surprises.',
  },
];

const STEPS = [
  { n: '1', t: 'Get your number', d: 'A business number is assigned instantly — no hardware, no contracts, no porting headaches.' },
  { n: '2', t: 'Train your AI agents', d: 'Describe your business in a sentence. We draft the persona, rules, and example replies for your AI text and voice agents.' },
  { n: '3', t: 'Go live', d: 'Start in suggest mode, flip threads to autopilot when you trust it, and launch AI SMS marketing campaigns.' },
];

const FAQ = [
  {
    q: 'What is an AI text agent?',
    a: 'An AI text agent is an assistant that reads and replies to your business SMS automatically in your brand voice. WrkPhn agents can suggest replies for approval or run fully on autopilot per conversation.',
  },
  {
    q: 'Do you offer AI voice agents for calls?',
    a: 'Yes. AI voice agents answer inbound calls, screen and route them, take messages, and capture leads so missed calls stop costing you business.',
  },
  {
    q: 'Is AI SMS marketing compliant?',
    a: 'WrkPhn handles STOP, START, and HELP keywords automatically, enforces opt-outs before every send, and supports 10DLC registration — compliant SMS marketing without the busywork.',
  },
  {
    q: 'Is it really cheap and contract-free?',
    a: 'Yes — WrkPhn is pay-as-you-go with no contracts, no setup fees, and cancel-anytime billing. It costs far less than a receptionist or traditional answering service.',
  },
  {
    q: 'Is WrkPhn easy to use?',
    a: 'Extremely. No hardware or phone system to install. Sign up, describe your business, and your AI work phone is live in minutes from any browser.',
  },
  {
    q: 'Is this a real phone number?',
    a: 'Yes. You get a real, callable and textable business number on a carrier-grade network, with calls and texts in the browser and on mobile.',
  },
];

export function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'WrkPhn — AI work phone: AI text agents, AI voice agents & AI SMS marketing';
    const md = document.querySelector('meta[name="description"]');
    const prevDesc = md?.getAttribute('content') || '';
    md?.setAttribute('content',
      'WrkPhn is the AI work phone for small business: AI text agents, AI voice agents, ' +
      'and AI SMS marketing on one shared number. Easy to use, cheap, no contract.');
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
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <Link to="/blog">Blog</Link>
        </nav>
        <div className="lp-nav-cta">
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/register" className="btn lime">Get started</Link>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">The AI work phone</div>
            <h1>AI text agents, AI voice agents &amp; AI SMS marketing — on one work number.</h1>
            <p className="lp-sub">
              WrkPhn answers your business texts and calls with AI that sounds like
              you, and runs compliant AI SMS marketing — so you never miss a
              customer. Easy to use, cheap, and no contract.
            </p>
            <div className="lp-hero-actions">
              <Link to="/register" className="btn lime lg">Start free</Link>
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

        <section id="features" className="lp-section">
          <h2>An AI work phone that does it all</h2>
          <p className="lp-section-sub">
            AI text agents, AI voice agents, and AI SMS marketing in one place —
            not five tools duct-taped together.
          </p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="lp-card">
                <div className="lp-card-icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="lp-section lp-how">
          <h2>Live in three easy steps</h2>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="lp-step">
                <div className="lp-step-n">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
          <div className="lp-cta-row">
            <Link to="/register" className="btn lime lg">Create your line</Link>
          </div>
        </section>

        <section className="lp-section">
          <h2>Who uses WrkPhn</h2>
          <p className="lp-section-sub">
            Solopreneurs, contractors, clinics, salons, real-estate teams, and
            small agencies who want AI texting and calling without a phone system.
          </p>
          <div className="lp-grid">
            <article className="lp-card">
              <h3>Replace your answering service</h3>
              <p>An AI voice agent answers every call and an AI text agent follows up by SMS — cheaper than a receptionist and available 24/7.</p>
            </article>
            <article className="lp-card">
              <h3>Scale customer texting</h3>
              <p>AI text agents handle FAQs, quotes, and booking so one person covers the volume of a whole front desk.</p>
            </article>
            <article className="lp-card">
              <h3>Grow with AI SMS marketing</h3>
              <p>Send compliant, personalized SMS campaigns and let AI nurture every reply automatically — no contract required.</p>
            </article>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <h2>AI work phone FAQ</h2>
          <div className="lp-faq">
            {FAQ.map((f) => (
              <details key={f.q} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <p className="lp-section-sub" style={{ marginTop: 28 }}>
            Want to go deeper? Read the{' '}
            <Link to="/blog" style={{ fontWeight: 800 }}>WrkPhn blog</Link> for
            guides on AI SMS marketing, AI text agents, and AI voice agents.
          </p>
        </section>

        <section className="lp-final">
          <h2>Stop missing customers.</h2>
          <p>AI text &amp; voice agents and AI SMS marketing — easy, cheap, no contract.</p>
          <Link to="/register" className="btn lime lg">Get started free</Link>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-foot-brand">
          <LogoMark size={28} />
          <span>WrkPhn</span>
        </div>
        {/* Cross-link to every dedicated SEO landing — gives Google a clear
            site map of the keyword cluster and spreads link equity. */}
        <nav className="lp-foot-links" aria-label="Marketing pages">
          {MARKETING_LINKS.map((l) => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
          <Link to="/blog">Blog</Link>
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
        </nav>
        <div className="lp-foot-fine">© {new Date().getFullYear()} WrkPhn — Work. Call. Connect. AI work phone with AI text agents, AI voice agents, and SMS marketing.</div>
      </footer>
    </div>
  );
}
