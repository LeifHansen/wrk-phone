import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
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
        <h1>Wrk Phone</h1>
        <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="glyph">💬</span> Messages
        </NavLink>
        <NavLink to="/keypad" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="glyph">🔢</span> Keypad
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="glyph">🤖</span> Agents
        </NavLink>
        <NavLink to="/campaigns" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="glyph">📣</span> Campaigns
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <span className="glyph">⚙️</span> Settings
        </NavLink>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Inbox />} />
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
