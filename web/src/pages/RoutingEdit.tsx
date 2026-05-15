import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Agent, COLOR_BG, COLOR_FG, Condition, api } from '../lib/api';
import { CONDITION_PRESETS, describeCondition } from '../lib/conditions';

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];

export function RoutingEdit() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCondPicker, setShowCondPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const [testFrom, setTestFrom] = useState('+15551234567');
  const [testBody, setTestBody] = useState('hey what is your pricing?');
  const [testResult, setTestResult] = useState<{ matched: boolean; reason: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {});
    if (editId) {
      api.listRules().then((rs) => {
        const r = rs.find((x) => x.id === editId);
        if (r) { setName(r.name); setConditions(r.conditions); setAgentId(r.agent_id); }
      }).catch(() => {});
    }
  }, [editId]);

  const agent = agents.find((a) => a.id === agentId) || null;
  const canSave = name.trim() && agentId && conditions.length > 0;

  const update = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, idx) => idx === i ? ({ ...c, ...patch } as Condition) : c));

  const save = async () => {
    if (!canSave) return;
    try {
      if (editId) await api.patchRule(editId, { name: name.trim(), agent_id: agentId!, conditions });
      else await api.createRule({ name: name.trim(), agent_id: agentId!, conditions });
      nav('/routing');
    } catch (e: any) { alert(e.message); }
  };

  const runTest = async () => {
    setTesting(true); setTestResult(null);
    try { setTestResult(await api.testRule(testFrom, testBody, conditions)); }
    catch (e: any) { alert(e.message); }
    finally { setTesting(false); }
  };

  return (
    <>
      <div className="page-h"><h2>{editId ? 'Edit rule' : 'New rule'}</h2></div>
      <div className="page-body">
        <div className="agent-section">
          <h3>Rule name</h3>
          <input className="input" style={{ fontSize: 18, fontWeight: 700 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pricing → Sales" />
        </div>

        <div className="agent-section">
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>When ALL of these are true:</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conditions.map((c, i) => (
              <div key={i} className="cond-card">
                <div className="cond-card-head">
                  <span className="cond-card-title">{describeCondition(c)}</span>
                  <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}>×</button>
                </div>
                <ConditionForm cond={c} onChange={(p) => update(i, p)} />
              </div>
            ))}
          </div>
          <button className="add-cond" onClick={() => setShowCondPicker((v) => !v)}>+ Add condition</button>
          {showCondPicker && (
            <div className="cond-picker">
              {CONDITION_PRESETS.map((p) => (
                <div key={p.type} className="cond-pick" onClick={() => {
                  setConditions((cs) => [...cs, JSON.parse(JSON.stringify(p.defaults))]);
                  setShowCondPicker(false);
                }}>
                  <span style={{ fontSize: 22 }}>{p.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{p.label}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.blurb}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="agent-section">
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>Then route to:</h3>
          <div className="agent-picker" onClick={() => setShowAgentPicker((v) => !v)}>
            {agent ? (
              <>
                <div className="swatch" style={{ background: COLOR_BG[agent.color], color: COLOR_FG[agent.color] }}>{agent.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{agent.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{agent.mode.toUpperCase()}</div>
                </div>
                <span style={{ color: 'var(--neon)', fontWeight: 700 }}>Change</span>
              </>
            ) : <span style={{ color: 'var(--muted)' }}>Pick an agent →</span>}
          </div>
          {showAgentPicker && (
            <div className="cond-picker">
              {agents.map((a) => (
                <div key={a.id} className="cond-pick" onClick={() => { setAgentId(a.id); setShowAgentPicker(false); }}>
                  <div className="swatch" style={{ background: COLOR_BG[a.color], color: COLOR_FG[a.color], width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{a.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{a.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{a.mode.toUpperCase()}{a.is_default ? ' · default' : ''}</div>
                  </div>
                  {a.id === agentId && <span>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="agent-section">
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>Test it</h3>
          <div className="cond-card" style={{ gap: 8, display: 'flex', flexDirection: 'column' }}>
            <input className="input" value={testFrom} onChange={(e) => setTestFrom(e.target.value)} placeholder="+15551234567" />
            <textarea className="textarea" style={{ minHeight: 60 }} value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="Message body" />
            <button className="btn neon" onClick={runTest} disabled={conditions.length === 0 || testing}>
              {testing ? 'Testing…' : 'Run test'}
            </button>
          </div>
          {testResult && (
            <div className="test-result" style={{ background: testResult.matched ? 'var(--lime)' : 'var(--bg-subtle)' }}>
              <b>{testResult.matched ? '✓ Would match' : '✗ Would not match'}</b>
              <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>{testResult.reason}</pre>
            </div>
          )}
        </div>

        <button className="btn lg" style={{ width: '100%', marginTop: 12 }} onClick={save} disabled={!canSave}>
          {editId ? 'Save changes' : 'Create rule'}
        </button>
      </div>
    </>
  );
}

function ConditionForm({ cond, onChange }: { cond: Condition; onChange: (p: Partial<Condition>) => void }) {
  if (cond.type === 'keyword') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input"
          value={cond.terms.join(', ')}
          onChange={(e) => onChange({ terms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } as any)}
          placeholder="price, quote, cost" />
        <div className="mode-row">
          {(['any', 'all'] as const).map((m) => (
            <button key={m} className={'mode-btn' + (cond.mode === m ? ' active' : '')} onClick={() => onChange({ mode: m } as any)}>match {m.toUpperCase()}</button>
          ))}
        </div>
      </div>
    );
  }
  if (cond.type === 'intent') {
    return (
      <textarea className="textarea" style={{ minHeight: 60 }}
        value={cond.description}
        onChange={(e) => onChange({ description: e.target.value } as any)}
        placeholder="messages about pricing or quotes" />
    );
  }
  if (cond.type === 'sender') {
    return (
      <div className="mode-row">
        {(['unknown', 'known'] as const).map((m) => (
          <button key={m} className={'mode-btn' + (cond.match === m ? ' active' : '')} onClick={() => onChange({ match: m } as any)}>
            {m === 'unknown' ? 'New contact' : 'Known contact'}
          </button>
        ))}
      </div>
    );
  }
  if (cond.type === 'sender_phone') {
    return <input className="input" value={cond.value} onChange={(e) => onChange({ value: e.target.value } as any)} placeholder="+15551234567" />;
  }
  if (cond.type === 'area_code') {
    return <input className="input" style={{ width: 120 }} value={cond.value} onChange={(e) => onChange({ value: e.target.value.replace(/[^\d]/g, '').slice(0, 3) } as any)} placeholder="415" />;
  }
  if (cond.type === 'time') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map((d) => {
            const on = (cond.days || []).includes(d);
            return (
              <button key={d}
                className={'pill ' + (on ? 'lime' : '')}
                style={{ cursor: 'pointer', border: 0 }}
                onClick={() => {
                  const next = on ? cond.days.filter((x) => x !== d) : [...(cond.days || []), d];
                  onChange({ days: next } as any);
                }}>{d.toUpperCase()}</button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1 }} value={cond.start} onChange={(e) => onChange({ start: e.target.value } as any)} placeholder="09:00" />
          <input className="input" style={{ flex: 1 }} value={cond.end} onChange={(e) => onChange({ end: e.target.value } as any)} placeholder="17:00" />
        </div>
      </div>
    );
  }
  return null;
}
