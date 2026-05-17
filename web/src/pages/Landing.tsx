import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

// Public marketing site. SEO-first: real headings, descriptive copy, and
// document <title>/<meta> set on mount so crawlers that execute JS get the
// right signals (static fallbacks live in index.html for no-JS crawlers).
const FEATURES = [
  {
    icon: '🤖',
    title: 'AI agents that text back',
    body:
      'Build a custom AI agent in minutes. It answers texts in your voice, suggests replies for approval, or runs fully on autopilot per conversation.',
  },
  {
    icon: '📞',
    title: 'A real business line',
    body:
      'Pick a local number, make and take calls in the browser, and keep your personal cell private. Your team shares one professional line.',
  },
  {
    icon: '💬',
    title: 'Shared team inbox',
    body:
      'Every call and text in one threaded inbox. Assign conversations, leave AI on suggest, or let an agent take over when you step away.',
  },
  {
    icon: '📣',
    title: 'Compliant blasts',
    body:
      'Send segmented SMS campaigns with built-in STOP/HELP handling and opt-out tracking — carrier compliance done for you.',
  },
  {
    icon: '🎯',
    title: 'Smart routing',
    body:
      'Route inbound texts to the right agent by keyword or contact, so the dental questions and the sales leads never get crossed.',
  },
  {
    icon: '📊',
    title: 'Analytics built in',
    body:
      'See response times, AI send volume, and conversation load per agent so you know exactly where the line is earning its keep.',
  },
];

const STEPS = [
  { n: '1', t: 'Claim your number', d: 'Pick a local area code from the shared pool — no hardware, no contracts.' },
  { n: '2', t: 'Train an agent', d: 'Describe your business in a sentence. We draft the persona, rules, and example replies.' },
  { n: '3', t: 'Go live', d: 'Start in suggest mode, flip individual threads to autopilot when you trust it.' },
];

const FAQ = [
  {
    q: 'Is Werkphone a real phone number?',
    a: 'Yes. You get a real, callable and textable number on a carrier-grade network. Calls and texts work in the browser and on mobile.',
  },
  {
    q: 'Will the AI send messages without me?',
    a: 'Only if you let it. The default is suggest mode — the agent drafts, you approve. Autopilot is opt-in per conversation.',
  },
  {
    q: 'Is bulk texting compliant?',
    a: 'STOP, START, and HELP keywords are handled automatically and opt-outs are enforced before any message is sent.',
  },
  {
    q: 'Can my whole team use one line?',
    a: 'That is the point. One shared number, one inbox, with per-conversation assignment and AI coverage when nobody is around.',
  },
];

export function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Werkphone — AI work phone with agents that text back';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/lp" className="lp-brand" aria-label="Werkphone home">
          <LogoMark size={36} />
          <span className="lp-brand-word">Werk Phone</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
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
            <h1>Your business line, answered by an AI that sounds like you.</h1>
            <p className="lp-sub">
              Werkphone gives your team one shared number with AI agents that
              reply to texts, take calls, and run compliant campaigns — so you
              never miss a customer, even after hours.
            </p>
            <div className="lp-hero-actions">
              <Link to="/register" className="btn lime lg">Start free</Link>
              <Link to="/login" className="btn ghost lg">I have an account</Link>
            </div>
            <div className="lp-trust">No hardware · Local numbers · Cancel anytime</div>
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
          <h2>Everything a work line should do</h2>
          <p className="lp-section-sub">
            Calls, texts, AI, and compliance in one place — not five tools duct-taped together.
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
          <h2>Live in three steps</h2>
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

        <section id="faq" className="lp-section">
          <h2>Questions, answered</h2>
          <div className="lp-faq">
            {FAQ.map((f) => (
              <details key={f.q} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>Stop missing customers.</h2>
          <p>Spin up an AI-answered work line in minutes.</p>
          <Link to="/register" className="btn lime lg">Get started free</Link>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-foot-brand">
          <LogoMark size={28} />
          <span>Werk Phone</span>
        </div>
        <div className="lp-foot-links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
          <a href="#features">Features</a>
        </div>
        <div className="lp-foot-fine">© {new Date().getFullYear()} Werkphone. All rights reserved.</div>
      </footer>
    </div>
  );
}
