import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, COLOR_BG, COLOR_FG } from '../lib/api';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function pretty(e164: string | null) {
  if (!e164) return 'No line yet';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function Home() {
  const [convos, setConvos] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [camps, setCamps] = useState<any[]>([]);
  const [line, setLine] = useState<{ activeNumber: string | null } | null>(null);

  useEffect(() => {
    api.listConversations().then(setConvos).catch(() => {});
    api.listAgents().then(setAgents).catch(() => {});
    api.listCampaigns().then(setCamps).catch(() => {});
    api.activeNumber().then(setLine).catch(() => {});
  }, []);

  const totalMsgs = convos.reduce((n) => n + 1, 0);
  const liveAgents = agents.filter((a) => a.mode !== 'off').length;
  const recent = convos.slice(0, 3);

  return (
    <div className="home">
      <h1 className="home-greet">{greeting()}, Alex.</h1>
      <div className="greet-squig" />

      {/* Wrk Line status */}
      <div className="line-banner">
        <div className="ic">📞</div>
        <div className="meta">
          <div className="k">WRK LINE</div>
          <div className="v">{pretty(line?.activeNumber ?? null)}</div>
        </div>
        <div className="bars">▁▃▅▇</div>
      </div>

      {/* Two big action cards */}
      <div className="home-cards">
        <Link to="/campaigns" className="big-card">
          <div className="tile purple">📣</div>
          <h3>BLAST A CAMPAIGN</h3>
          <p>Mass-text your list with a personalized template. {camps.length} campaign{camps.length === 1 ? '' : 's'} so far.</p>
          <div className="go">→</div>
        </Link>
        <Link to="/agents" className="big-card">
          <div className="tile orange">🤖</div>
          <h3>YOUR AGENTS</h3>
          <p>{liveAgents} of {agents.length} agent{agents.length === 1 ? '' : 's'} on duty, texting on your behalf.</p>
          <div className="go">→</div>
        </Link>
      </div>

      {/* Stat strip */}
      <div className="stat-strip">
        <div className="stat-cell"><div className="si">💬</div><div className="sv">{totalMsgs}</div><div className="sk">Threads</div></div>
        <div className="stat-cell"><div className="si">👥</div><div className="sv">{convos.reduce((n, c) => n + (c.unread_count || 0), 0)}</div><div className="sk">Unread</div></div>
        <div className="stat-cell"><div className="si">📣</div><div className="sv">{camps.length}</div><div className="sk">Campaigns</div></div>
        <div className="stat-cell"><div className="si">🤖</div><div className="sv">{agents.length}</div><div className="sk">Agents</div></div>
      </div>

      {/* Recent activity */}
      <div className="home-rows">
        {recent.length === 0 && (
          <div className="home-row" style={{ cursor: 'default' }}>
            <div className="rtile" style={{ background: 'var(--surface-2)' }}>✨</div>
            <div className="rbody"><div className="rt">No conversations yet</div><div className="rs">Send a text or set up an agent to get rolling.</div></div>
          </div>
        )}
        {recent.map((c) => {
          const col = c.agent_color || 'lime';
          return (
            <Link key={c.id} to={`/conversation/${c.id}`} className="home-row">
              <div className="rtile" style={{ background: COLOR_BG[col], color: COLOR_FG[col] }}>
                {c.agent_emoji || '💬'}
              </div>
              <div className="rbody">
                <div className="rt">{c.name || c.peer_phone}</div>
                <div className="rs">{c.last_direction === 'out' ? 'You: ' : ''}{c.last_body || '—'}</div>
              </div>
              <div className="chev">›</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
