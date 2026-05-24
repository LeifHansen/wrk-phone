import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from './Logo';

// Shared header/footer for every public marketing landing. Keeps brand UX
// identical across /lp and the dedicated SEO landings (/sms-marketing-app,
// /ai-text-agents, etc.) so a visitor jumping between them via internal links
// never feels like they hit a different site.
//
// Internal links matter for SEO: each landing footer cross-links to the
// others so crawl + link-equity flows across the cluster.
export const MARKETING_LINKS: { to: string; label: string }[] = [
  { to: '/sms-marketing-app', label: 'SMS Marketing App' },
  { to: '/text-marketing-app', label: 'Text Marketing App' },
  { to: '/mass-texting-app', label: 'Mass Texting App' },
  { to: '/sms-campaigns', label: 'SMS Campaigns' },
  { to: '/text-campaigns', label: 'Text Campaigns' },
  { to: '/ai-text-agents', label: 'AI Text Agents' },
  { to: '/ai-voice-agents', label: 'AI Voice Agents' },
  { to: '/business-sms-app', label: 'Business SMS App' },
];

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/lp" className="lp-brand" aria-label="WrkPhn home">
          <LogoMark size={36} />
          <span className="lp-brand-word">WrkPhn</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Primary">
          <Link to="/lp">Home</Link>
          <Link to="/sms-marketing-app">SMS marketing</Link>
          <Link to="/ai-text-agents">AI agents</Link>
          <Link to="/blog">Blog</Link>
        </nav>
        <div className="lp-nav-cta">
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/register" className="btn lime">Get started</Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="lp-footer">
        <div className="lp-foot-brand">
          <LogoMark size={28} />
          <span>WrkPhn</span>
        </div>
        <nav className="lp-foot-links" aria-label="Marketing pages">
          {MARKETING_LINKS.map((l) => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
          <Link to="/blog">Blog</Link>
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
        </nav>
        <div className="lp-foot-fine">
          © {new Date().getFullYear()} WrkPhn — Work. Call. Connect. The AI work phone for
          business: AI text agents, AI voice agents, and SMS marketing.
        </div>
      </footer>
    </div>
  );
}
