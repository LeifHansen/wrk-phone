import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { api } from './lib/api';
import { Logo } from './components/Logo';
import { Toaster } from './components/Toast';
import { Avatar } from './components/Avatar';
import { IconPhone, IconMessage, IconContacts, IconBlast, IconAgent, IconStats, IconGear } from './components/Icons';
import { CallOverlay } from './components/CallOverlay';
import { onIncoming } from './lib/voice';

// Pages are route-split: each becomes its own chunk so the initial load
// isn't one ~470KB bundle. `lazy` needs a default export, so map the named one.
const page = <T extends Record<string, any>>(
  loader: () => Promise<T>,
  name: keyof T,
) => lazy(() => loader().then((m) => ({ default: m[name] })));

const Setup = page(() => import('./pages/Setup'), 'Setup');
const Landing = page(() => import('./pages/Landing'), 'Landing');
const Home = page(() => import('./pages/Home'), 'Home');
const Contacts = page(() => import('./pages/Contacts'), 'Contacts');
const Login = page(() => import('./pages/Login'), 'Login');
const Onboarding = page(() => import('./pages/Onboarding'), 'Onboarding');
const Credits = page(() => import('./pages/Credits'), 'Credits');
const Numbers = page(() => import('./pages/Numbers'), 'Numbers');
const A2P = page(() => import('./pages/A2P'), 'A2P');
const Analytics = page(() => import('./pages/Analytics'), 'Analytics');
const Inbox = page(() => import('./pages/Inbox'), 'Inbox');
const Conversation = page(() => import('./pages/Conversation'), 'Conversation');
const Keypad = page(() => import('./pages/Keypad'), 'Keypad');
const Agents = page(() => import('./pages/Agents'), 'Agents');
const AgentNew = page(() => import('./pages/AgentNew'), 'AgentNew');
const AgentDetail = page(() => import('./pages/AgentDetail'), 'AgentDetail');
const AgentOptimize = page(() => import('./pages/AgentOptimize'), 'AgentOptimize');
const AgentTrain = page(() => import('./pages/AgentTrain'), 'AgentTrain');
const Routing = page(() => import('./pages/Routing'), 'Routing');
const RoutingEdit = page(() => import('./pages/RoutingEdit'), 'RoutingEdit');
const Campaigns = page(() => import('./pages/Campaigns'), 'Campaigns');
const Settings = page(() => import('./pages/Settings'), 'Settings');
const Blog = page(() => import('./pages/Blog'), 'Blog');
const BlogPost = page(() => import('./pages/BlogPost'), 'BlogPost');
const Superadmin = page(() => import('./pages/Superadmin'), 'Superadmin');

// Routes rendered without the app sidebar (public marketing + auth + setup).
const CHROMELESS = ['/lp', '/login', '/register', '/welcome', '/setup'];
const isChromeless = (p: string) => CHROMELESS.includes(p) || p === '/blog' || p.startsWith('/blog/');

export function App() {
  const [inCall, setInCall] = useState(false);
  const [peer, setPeer] = useState('');
  const [callSid, setCallSid] = useState<string | null>(null);
  const [acctAvatar, setAcctAvatar] = useState<string | null>(null);
  const nav = useNavigate();
  const loc = useLocation();

  // Account avatar shown app-wide in the sidebar; refresh on navigation so a
  // newly generated one appears everywhere without a full reload.
  useEffect(() => { api.account().then((a) => setAcctAvatar(a.avatarUrl)).catch(() => {}); }, [loc.pathname]);

  // First-run gate: a visitor with no provisioned line lands on the public
  // marketing page (not the app). Public/auth/setup paths are left alone so
  // "Get started" → register → setup still flows.
  useEffect(() => {
    api.activeNumber()
      .then((s) => {
        if (!s.isProvisioned && !isChromeless(loc.pathname)) {
          nav('/lp', { replace: true });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onIncoming((call) => {
      setPeer(call.parameters.From || 'Unknown');
      setCallSid(call.parameters.CallSid || (call as any).parameters?.CallSid || null);
      setInCall(true);
      call.on('disconnect', () => { setInCall(false); setCallSid(null); });
      call.on('cancel', () => { setInCall(false); setCallSid(null); });
      call.accept();
    });
  }, []);

  const chromeless = isChromeless(loc.pathname);

  return (
    <div className={'app-shell' + (chromeless ? ' chromeless' : '')}>
      {!chromeless && (
      <aside className="sidebar">
        <Logo size="sm" />
        <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Phone">
          <span className="glyph"><IconPhone /></span><span className="nav-label">PHONE</span>
        </NavLink>
        <NavLink to="/messages" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Messages">
          <span className="glyph"><IconMessage /></span><span className="nav-label">MSGS</span>
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Contacts">
          <span className="glyph"><IconContacts /></span><span className="nav-label">CONTACTS</span>
        </NavLink>
        <NavLink to="/campaigns" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Campaigns">
          <span className="glyph"><IconBlast /></span><span className="nav-label">BLAST</span>
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Agents">
          <span className="glyph"><IconAgent /></span><span className="nav-label">AGENTS</span>
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Analytics">
          <span className="glyph"><IconStats /></span><span className="nav-label">STATS</span>
        </NavLink>
        <div className="spacer" />
        <NavLink to="/setup" className="wrkline-card" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Work line">
          <div className="bars"><i /><i /><i /><i /></div>
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Account / Admin">
          <span className="glyph">
            {acctAvatar
              ? <Avatar url={acctAvatar} size={28} round />
              : <IconGear />}
          </span>
          <span className="nav-label">ADMIN</span>
        </NavLink>
      </aside>
      )}
      <main className="main">
        <Suspense fallback={<div className="page-loading" />}>
        <Routes>
          <Route path="/lp" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login initialMode="signup" />} />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/superadmin" element={<Superadmin />} />
          <Route path="/" element={<Home onCall={(p) => { setPeer(p); setInCall(true); }} />} />
          <Route path="/messages" element={<Inbox />} />
          <Route path="/contacts" element={<Contacts onCall={(p) => { setPeer(p); setInCall(true); }} />} />
          <Route path="/conversation/:id" element={<Conversation onCall={(p) => { setPeer(p); setInCall(true); }} />} />
          <Route path="/keypad" element={<Keypad onCall={(p) => { setPeer(p); setInCall(true); }} />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/new" element={<AgentNew />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/agents/:id/optimize" element={<AgentOptimize />} />
          <Route path="/agents/:id/train" element={<AgentTrain />} />
          <Route path="/routing" element={<Routing />} />
          <Route path="/routing/new" element={<RoutingEdit />} />
          <Route path="/routing/:id" element={<RoutingEdit />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/numbers" element={<Numbers />} />
          <Route path="/a2p" element={<A2P />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/admin" element={<Settings />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        </Suspense>
      </main>
      {inCall && <CallOverlay peer={peer} callSid={callSid} onEnd={() => { setInCall(false); setCallSid(null); }} />}
      <Toaster />
    </div>
  );
}
