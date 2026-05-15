import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Agent, COLOR_BG, COLOR_FG, api } from '../lib/api';

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const load = () => api.listAgents().then(setAgents).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Agents</h2>
          <div className="sub">Train AIs that text on your behalf.</div>
        </div>
        <Link to="/agents/new" className="btn">+ New agent</Link>
      </div>
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
                <div className="swatch" style={{ background: COLOR_BG[a.color], color: COLOR_FG[a.color] }}>
                  {a.emoji}
                </div>
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
    </>
  );
}
