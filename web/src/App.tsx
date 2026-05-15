import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { api } from './lib/api';
import { Setup } from './pages/Setup';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { Conversation } from './pages/Conversation';
import { Keypad } from './pages/Keypad';
import { Agents } from './pages/Agents';
import { AgentNew } from './pages/AgentNew';
import { AgentDetail } from './pages/AgentDetail';
import { AgentOptimize } from './pages/AgentOptimize';
import { AgentTrain } from './pages/AgentTrain';
import { Routing } from './pages/Routing';
import { RoutingEdit } from './pages/RoutingEdit';
import { Campaigns } from './pages/Campaigns';
import { Settings } from './pages/Settings';
import { CallOverlay } from './components/CallOverlay';
import { onIncoming } from './lib/voice';

export function App() {
  const [inCall, setInCall] = useState(false);
  const [peer, setPeer] = useState('');
  const nav = useNavigate();
  const loc = useLocation();

  // First-run gate: no provisioned number → force the setup screen.
  useEffect(() => {
    api.activeNumber()
      .then((s) => {
        if (!s.isProvisioned && loc.pathname !== '/setup') nav('/setup', { replace: true });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onIncoming((call) => {
      setPeer(call.parameters.From || 'Unknown');
      setInCall(true);
      call.on('disconnect', () => setInCall(false));
      call.on('cancel', () => setInCall(false));
      call.accept();
    });
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Wrk<br /><span className="alt">Phone</span><span className="squig" /></h1>
        <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Home">
          <span className="glyph">🏠</span><span className="nav-label">HOME</span>
        </NavLink>
        <NavLink to="/messages" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Messages">
          <span className="glyph">💬</span><span className="nav-label">MSGS</span>
        </NavLink>
        <NavLink to="/campaigns" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Campaigns">
          <span className="glyph">📣</span><span className="nav-label">BLAST</span>
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Agents">
          <span className="glyph">🤖</span><span className="nav-label">AGENTS</span>
        </NavLink>
        <NavLink to="/keypad" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Keypad">
          <span className="glyph">🔢</span><span className="nav-label">DIAL</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} title="Settings">
          <span className="glyph">⚙️</span><span className="nav-label">CONFIG</span>
        </NavLink>
        <div className="spacer" />
        <NavLink to="/setup" className="wrkline-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="dot">📞</div>
          <div className="lbl">WRK LINE</div>
          <div className="bars">▁▃▅▇</div>
        </NavLink>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<Home />} />
          <Route path="/messages" element={<Inbox />} />
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
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {inCall && <CallOverlay peer={peer} onEnd={() => setInCall(false)} />}
    </div>
  );
}
