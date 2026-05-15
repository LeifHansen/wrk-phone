import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Agent, AGENT_COLORS, COLOR_BG, COLOR_FG, api } from '../lib/api';

const MODES = [
  { key: 'off',     label: 'Off',     blurb: 'No AI replies.' },
  { key: 'suggest', label: 'Suggest', blurb: 'AI drafts. You tap Send.' },
  { key: 'auto',    label: 'Auto',    blurb: 'AI sends safe replies on its own.' },
] as const;

export function AgentDetail() {
  const { id } = useParams();
  const aid = Number(id);
  const nav = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [dirty, setDirty] = useState<Partial<Agent>>({});
  const [advanced, setAdvanced] = useState(false);
  const [newRule, setNewRule] = useState('');

  const load = () => api.getAgent(aid).then((a) => { setAgent(a); setDirty({}); }).catch(() => {});
  useEffect(() => { load(); }, [aid]);

  if (!agent) return <div className="page-body">Loading…</div>;
  const merged = { ...agent, ...dirty } as Agent;
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setDirty((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    try { setAgent(await api.patchAgent(aid, dirty)); setDirty({}); }
    catch (e: any) { alert(e.message); }
  };

  const setMode = async (mode: 'off' | 'suggest' | 'auto') => {
    set('mode', mode);
    try { await api.patchAgent(aid, { mode }); setAgent((a) => a ? { ...a, mode } : a); }
    catch (e: any) { alert(e.message); }
  };
  const setVoiceMode = async (voice_mode: 'off' | 'suggest' | 'auto') => {
    set('voice_mode', voice_mode);
    try { await api.patchAgent(aid, { voice_mode }); setAgent((a) => a ? { ...a, voice_mode } : a); }
    catch (e: any) { alert(e.message); }
  };

  const onDelete = async () => {
    if (merged.is_default) { alert('Cannot delete default agent. Set another default first.'); return; }
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try { await api.deleteAgent(aid); nav('/agents', { replace: true }); }
    catch (e: any) { alert(e.message); }
  };

  const updateExample = (i: number, k: 'in' | 'out', v: string) =>
    set('examples', merged.examples.map((e, idx) => idx === i ? { ...e, [k]: v } : e));

  return (
    <>
      <div className="agent-banner" style={{ background: COLOR_BG[merged.color], color: COLOR_FG[merged.color] }}>
        <div className="em">{merged.emoji}</div>
        <div style={{ flex: 1 }}>
          <input
            className="name"
            value={merged.name}
            onChange={(e) => set('name', e.target.value)}
            style={{ color: COLOR_FG[merged.color] }}
          />
          {merged.is_default ? (
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginTop: 4 }}>DEFAULT AGENT</div>
          ) : (
            <button className="default-btn" style={{ color: COLOR_FG[merged.color] }} onClick={async () => { await api.makeDefault(aid); load(); }}>
              Make default
            </button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 16 }}>
        <div className="agent-section">
          <h3>Color</h3>
          <div className="color-row">
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set('color', c)}
                className={'color-chip' + (merged.color === c ? ' active' : '')}
                style={{ background: COLOR_BG[c] }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="agent-section">
          <h3>Messaging</h3>
          <div className="mode-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={'mode-btn' + (merged.mode === m.key ? ' active ' + m.key : '')}
              >{m.label}</button>
            ))}
          </div>
          <p className="hint">{MODES.find((m) => m.key === merged.mode)?.blurb}</p>
        </div>

        <div className="agent-section">
          <h3>Voicemail Greeting</h3>
          <div className="mode-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setVoiceMode(m.key)}
                className={'mode-btn' + (merged.voice_mode === m.key ? ' active ' + m.key : '')}
              >{m.label}</button>
            ))}
          </div>
        </div>

        <div className="agent-section">
          <h3>Voice</h3>
          <VoicePicker
            current={merged.voice_name || null}
            onPick={async (v) => {
              await api.patchAgent(aid, { voice_id: v.id ?? null, voice_name: v.name, tts_voice: v.tts_voice } as any);
              setAgent((a) => a ? { ...a, voice_name: v.name, tts_voice: v.tts_voice } as any : a);
            }}
          />
        </div>

        <div className="agent-section cta-row">
          <Link to={`/agents/${aid}/optimize`} className="btn lime lg" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>✨ Optimize</Link>
          <Link to={`/agents/${aid}/train`} className="btn neon lg" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>🎓 Quick Train</Link>
        </div>

        <div className="agent-section">
          <h3>Don't do these things</h3>
          <p className="hint">Tap a rule to remove it.</p>
          <div style={{ marginTop: 8 }}>
            {merged.rules.map((r, i) => (
              <div key={i} className="rule-pill" onClick={() => set('rules', merged.rules.filter((_, idx) => idx !== i))}>
                <span style={{ flex: 1 }}>🚫 {r}</span>
                <span className="x">×</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="input"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="Add a rule…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newRule.trim()) { set('rules', [...merged.rules, newRule.trim()]); setNewRule(''); }
                }}
              />
              <button
                className="btn"
                onClick={() => { if (newRule.trim()) { set('rules', [...merged.rules, newRule.trim()]); setNewRule(''); } }}
              >+</button>
            </div>
          </div>
        </div>

        <div className="agent-section">
          <h3>Training examples</h3>
          {merged.examples.map((ex, i) => (
            <div key={i} className="example-card">
              <label>Inbound</label>
              <input className="input" value={ex.in} onChange={(e) => updateExample(i, 'in', e.target.value)} />
              <label>Reply</label>
              <input className="input" value={ex.out} onChange={(e) => updateExample(i, 'out', e.target.value)} />
              <button className="btn ghost" style={{ color: 'var(--red)', marginTop: 8 }}
                onClick={() => set('examples', merged.examples.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button className="btn ghost" style={{ marginTop: 8 }}
            onClick={() => set('examples', [...merged.examples, { in: '', out: '' }])}>
            + Add example
          </button>
        </div>

        <div className="agent-section">
          <button className="btn ghost" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? '▾' : '▸'} Advanced
          </button>
          {advanced && (
            <>
              <div style={{ marginTop: 12 }}>
                <h3>Persona / Voice</h3>
                <textarea className="textarea" value={merged.persona} onChange={(e) => set('persona', e.target.value)} />
              </div>
              <div style={{ marginTop: 12 }}>
                <h3>Instructions</h3>
                <textarea className="textarea" value={merged.instructions} onChange={(e) => set('instructions', e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="agent-section">
          <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={onDelete}>Delete agent</button>
        </div>
      </div>

      {Object.keys(dirty).length > 0 && (
        <div style={{ position: 'sticky', bottom: 16, margin: '0 16px 16px', background: 'var(--black)', color: '#fff', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? '' : 's'}</span>
          <button className="btn lime" onClick={save}>Save</button>
        </div>
      )}
    </>
  );
}

function VoicePicker({ current, onPick }: {
  current: string | null;
  onPick: (v: { id?: number; name: string; tts_voice: string }) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');

  const load = () => api.listVoices().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const v = await api.createVoice(name.trim(), style.trim());
      onPick({ id: v.id, name: v.name, tts_voice: v.tts_voice });
      setName(''); setStyle(''); load();
    } catch (e: any) { alert(e.message); }
    finally { setCreating(false); }
  };

  if (!data) return <p className="hint">Loading voices…</p>;
  return (
    <div>
      <p className="hint" style={{ marginBottom: 10 }}>
        {current ? <>Using <b>{current}</b>. </> : 'No voice set — pick or create one. '}{data.note}
      </p>
      <div className="seg-chips">
        {data.presets.map((p: any) => (
          <button key={p.name} className={'seg-chip' + (current === p.name ? ' on' : '')}
            onClick={() => onPick({ name: p.name, tts_voice: p.tts_voice })}>
            {p.name} · {p.style}
          </button>
        ))}
        {data.custom.map((c: any) => (
          <button key={c.id} className={'seg-chip' + (current === c.name ? ' on' : '')}
            onClick={() => onPick({ id: c.id, name: c.name, tts_voice: c.tts_voice })}>
            ★ {c.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Voice name (e.g. Closer)" />
        <input className="input" style={{ flex: 2, minWidth: 160 }} value={style}
          onChange={(e) => setStyle(e.target.value)} placeholder="Style (e.g. deep, confident, persuasive)" />
        <button className="btn pink" onClick={create} disabled={creating || !name.trim()}>
          {creating ? '…' : 'Create voice'}
        </button>
      </div>
    </div>
  );
}
