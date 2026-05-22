import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Agent, AGENT_COLORS, COLOR_BG, COLOR_FG, api } from '../lib/api';
import { toast } from '../components/Toast';
import { IconPencil } from '../components/Icons';

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
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = () => api.getAgent(aid).then((a) => { setAgent(a); setDirty({}); }).catch(() => {});
  useEffect(() => { load(); }, [aid]);

  if (!agent) return <div className="page-body">Loading…</div>;
  const merged = { ...agent, ...dirty } as Agent;
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setDirty((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (Object.keys(dirty).length === 0) { toast('Nothing to save', 'info'); return; }
    try { setAgent(await api.patchAgent(aid, dirty)); setDirty({}); toast('Agent saved ✓'); }
    catch (e: any) { toast(`Save failed: ${e.message}`, 'err'); }
  };

  const setMode = async (mode: 'off' | 'suggest' | 'auto') => {
    set('mode', mode);
    try { await api.patchAgent(aid, { mode }); setAgent((a) => a ? { ...a, mode } : a); toast(`Messaging: ${mode.toUpperCase()} ✓`); }
    catch (e: any) { toast(`Failed: ${e.message}`, 'err'); }
  };
  const setVoiceMode = async (voice_mode: 'off' | 'suggest' | 'auto') => {
    set('voice_mode', voice_mode);
    try { await api.patchAgent(aid, { voice_mode }); setAgent((a) => a ? { ...a, voice_mode } : a); toast(`Voicemail: ${voice_mode.toUpperCase()} ✓`); }
    catch (e: any) { toast(`Failed: ${e.message}`, 'err'); }
  };

  const onDelete = async () => {
    if (merged.is_default) { toast('Cannot delete the default agent — set another default first.', 'err'); return; }
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try { await api.deleteAgent(aid); toast('Agent deleted'); nav('/agents', { replace: true }); }
    catch (e: any) { toast(`Delete failed: ${e.message}`, 'err'); }
  };

  const updateExample = (i: number, k: 'in' | 'out', v: string) =>
    set('examples', merged.examples.map((e, idx) => idx === i ? { ...e, [k]: v } : e));

  return (
    <>
      <div className="agent-banner" style={{ background: COLOR_BG[merged.color], color: COLOR_FG[merged.color] }}>
        <div className="em">{merged.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="agentName"
              className="name name-editable"
              value={merged.name}
              onChange={(e) => set('name', e.target.value)}
              style={{ color: COLOR_FG[merged.color], borderColor: COLOR_FG[merged.color] }}
            />
            <button
              title="Edit name"
              onClick={() => { const el = document.getElementById('agentName') as HTMLInputElement; el?.focus(); el?.select(); }}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', color: COLOR_FG[merged.color], display: 'flex' }}
            >
              <IconPencil size={18} />
            </button>
          </div>
          {merged.is_default ? (
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginTop: 4 }}>DEFAULT AGENT</div>
          ) : (
            <button className="default-btn" style={{ color: COLOR_FG[merged.color] }}
              onClick={async () => { try { await api.makeDefault(aid); await load(); toast('Set as default agent ✓'); } catch (e: any) { toast(e.message, 'err'); } }}>
              Make default
            </button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 16 }}>
        <div className="agent-section">
          <h3>Avatar</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {(merged as any).avatar_url
              ? <img src={(merged as any).avatar_url} alt="" style={{ width: 64, height: 64, border: 'var(--border)', borderRadius: 8, objectFit: 'cover' }} />
              : <div className="swatch" style={{ width: 64, height: 64, background: COLOR_BG[merged.color], border: 'var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>{merged.emoji}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn pink" disabled={avatarBusy} onClick={async () => {
                setAvatarBusy(true);
                toast('Generating avatar… (~10s)', 'info');
                try {
                  const r = await api.genAvatar('agent', aid);
                  if (!r?.url) throw new Error('no image returned');
                  setAgent((p) => p ? ({ ...p, avatar_url: `${r.url}?t=${Date.now()}` } as any) : p);
                  toast('Avatar generated ✓');
                } catch (e: any) {
                  toast(`Avatar failed: ${String(e.message || e).replace(/^\d+\s*/, '')}`, 'err');
                } finally { setAvatarBusy(false); }
              }}>{avatarBusy ? 'Generating…' : '✨ Generate AI avatar'}</button>
              <label className="btn" style={{ cursor: 'pointer', opacity: avatarBusy ? 0.6 : 1 }}>
                {avatarBusy ? '…' : '📤 Upload your own'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  disabled={avatarBusy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]; e.target.value = '';
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB.', 'err'); return; }
                    setAvatarBusy(true);
                    try {
                      const dataUrl: string = await new Promise((resolve, reject) => {
                        const fr = new FileReader();
                        fr.onload = () => resolve(String(fr.result || ''));
                        fr.onerror = () => reject(fr.error);
                        fr.readAsDataURL(file);
                      });
                      const r = await api.uploadAvatar('agent', dataUrl, aid);
                      setAgent((p) => p ? ({ ...p, avatar_url: `${r.url}?t=${Date.now()}` } as any) : p);
                      toast('Avatar updated ✓');
                    } catch (err: any) {
                      toast(`Upload failed: ${err.message || err}`, 'err');
                    } finally { setAvatarBusy(false); }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="agent-section">
          <h3>Sends from</h3>
          <p className="hint">Which number this agent texts from when it auto-replies. Default uses the active line.</p>
          <SendNumberPicker
            value={(merged as any).send_number || ''}
            onChange={async (v) => {
              try { await api.patchAgent(aid, { send_number: v || null } as any); setAgent((p) => p ? ({ ...p, send_number: v || null } as any) : p); toast('Send number updated ✓'); }
              catch (e: any) { toast(e.message, 'err'); }
            }}
          />
        </div>

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
    } catch (e: any) { toast(e.message, 'err'); }
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

function SendNumberPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [nums, setNums] = useState<{ phoneNumber: string }[]>([]);
  useEffect(() => { api.listNumbers().then((d: any) => setNums(d.numbers || [])).catch(() => {}); }, []);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 320 }}>
      <option value="">Default (active line)</option>
      {nums.map((n) => <option key={n.phoneNumber} value={n.phoneNumber}>{n.phoneNumber}</option>)}
    </select>
  );
}
