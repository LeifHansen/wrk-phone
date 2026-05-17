import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COLOR_BG, COLOR_FG, RoutingRule, api } from '../lib/api';
import { describeCondition } from '../lib/conditions';
import { toast } from '../components/Toast';

export function Routing() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const nav = useNavigate();

  const load = () => api.listRules().then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const move = async (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= rules.length) return;
    const next = rules.slice();
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setRules(next);
    try { await api.reorderRules(next.map((r) => r.id)); } catch (e: any) { toast(e.message, 'err'); load(); }
  };

  const toggle = async (r: RoutingRule, val: boolean) => {
    try { await api.patchRule(r.id, { enabled: val }); load(); } catch (e: any) { toast(e.message, 'err'); }
  };

  const onDelete = async (r: RoutingRule) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    try { await api.deleteRule(r.id); load(); } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h2>⚡ Auto-routing</h2>
          <div className="sub">Send the right inbound to the right agent.</div>
        </div>
        <Link to="/routing/new" className="btn lime">+ New rule</Link>
      </div>
      <div className="page-body">
        <div className="routing-hero">
          Rules run on every cold inbound. <b>First match wins.</b> Once a conversation has an agent, it sticks (manual switch still overrides).
        </div>

        {rules.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No rules yet. Tap <strong>+ New rule</strong> to send specific inbounds to specific agents.
          </p>
        )}

        {rules.map((r, idx) => (
          <div key={r.id} className={'rule-card' + (r.enabled ? '' : ' disabled')}>
            <div className="rule-top">
              <div className="rule-pri">
                <button onClick={() => move(idx, -1)} className="pri-btn">▲</button>
                <span className="pri-num">{idx + 1}</span>
                <button onClick={() => move(idx, 1)} className="pri-btn">▼</button>
              </div>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => nav(`/routing/${r.id}`)}>
                <div className="rule-name">{r.name}</div>
                <div className="rule-meta">Matched {r.match_count}× {r.last_matched_at ? `· last ${new Date(r.last_matched_at).toLocaleDateString()}` : ''}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={!!r.enabled} onChange={(e) => toggle(r, e.target.checked)} />
                <span className="slider" />
              </label>
            </div>
            <div className="rule-conds">
              {r.conditions.map((c, i) => (<span key={i} className="cond-chip">{describeCondition(c)}</span>))}
            </div>
            <div className="rule-routes">
              <span className="routes-label">routes to</span>
              {r.agent_color ? (
                <span className="agent-chip" style={{ background: COLOR_BG[r.agent_color], color: COLOR_FG[r.agent_color] }}>
                  {r.agent_emoji} {r.agent_name}
                </span>
              ) : <span className="routes-label">(deleted agent)</span>}
            </div>
            <div className="rule-actions">
              <Link to={`/routing/${r.id}`} className="btn ghost" style={{ color: 'var(--neon)' }}>Edit</Link>
              <button onClick={() => onDelete(r)} className="btn ghost" style={{ color: 'var(--red)' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
