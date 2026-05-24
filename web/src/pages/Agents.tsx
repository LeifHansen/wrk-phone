import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Agent, api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { IconAgent } from '../components/Icons';
import { AgentsTour, shouldShowAgentsTour } from '../components/AgentsTour';
import { SubNav } from '../components/SubNav';

// Subtabs shared by every page inside the "Agents" section: text agents
// (the grid) live at /agents, outbound voice campaigns at /agents/calls.
const AGENTS_SUBTABS = [
  { to: '/agents',       label: 'Agents', end: true },
  { to: '/agents/calls', label: 'Calls' },
];

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tour, setTour] = useState(false);
  // Hidden agents (e.g. the PrankMode easter egg) never show in the grid.
  const load = () => api.listAgents().then((a) => setAgents(a.filter((x) => !x.hidden))).catch(() => {});
  useEffect(() => { load(); }, []);
  // First-ever visit to Agents → run the interactive tutorial.
  useEffect(() => { if (shouldShowAgentsTour()) setTour(true); }, []);

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Agents</h2>
          <div className="sub">Train AIs that text on your behalf.</div>
        </div>
        <Link to="/agents/new" className="btn">+ New agent</Link>
      </div>
      <SubNav tabs={AGENTS_SUBTABS} />
      <div className="page-body">
        <Link to="/routing" className="routing-link" style={{ textDecoration: 'none' }}>
          <div className="body">
            <b>⚡ Auto-routing</b>
            <p>Send the right inbound to the right agent.</p>
          </div>
          <div className="arr">›</div>
        </Link>
        {agents.length === 0 ? (
          <Link to="/agents/new" className="empty-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="em">🤖</div>
            <h3>Make your first agent</h3>
            <p>Pick a role, pick a vibe, done.</p>
          </Link>
        ) : (
          <div className="agents-grid">
            {agents.map((a) => (
              <Link key={a.id} to={`/agents/${a.id}`} className="agent-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar
                  url={(a as any).avatar_url}
                  emoji={a.is_default ? undefined : a.emoji}
                  icon={a.is_default ? <IconAgent /> : undefined}
                  color={a.color}
                  size={56}
                />
                <div>
                  <div className="name">{a.name} {a.is_default ? <span className="pill black" style={{ marginLeft: 6, verticalAlign: 'middle' }}>DEFAULT</span> : null}</div>
                  <div className="meta">{a.conversations ?? 0} convos · {a.ai_sent_7d ?? 0} sent (7d)</div>
                </div>
                <div className="pills">
                  <span className={`pill ${a.mode === 'auto' ? 'lime' : a.mode === 'suggest' ? 'neon' : ''}`}>MSG · {a.mode.toUpperCase()}</span>
                  <span className={`pill ${a.voice_mode === 'auto' ? 'lime' : a.voice_mode === 'suggest' ? 'neon' : ''}`}>VM · {a.voice_mode.toUpperCase()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {tour && <AgentsTour onClose={() => setTour(false)} />}
    </>
  );
}
