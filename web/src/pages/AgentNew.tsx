import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, COLOR_BG, COLOR_FG } from '../lib/api';

interface Preset {
  slug: string; label: string; emoji: string; color: string; blurb: string;
  vibes: { slug: string; label: string; persona: string }[];
}

export function AgentNew() {
  const nav = useNavigate();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [step, setStep] = useState<'role' | 'vibe' | 'name' | 'busy'>('role');
  const [picked, setPicked] = useState<Preset | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');

  useEffect(() => { api.agentPresets().then(setPresets as any).catch(() => {}); }, []);

  const choose = (p: Preset) => {
    setPicked(p);
    setName(p.label);
    if (p.slug === 'custom') return;
    setStep('vibe');
  };

  const finishPreset = async () => {
    if (!picked) return;
    setStep('busy');
    try {
      const a = await api.createFromPreset(picked.slug, vibe || picked.vibes[0]?.slug, name.trim() || picked.label);
      nav(`/agents/${a.id}`, { replace: true });
    } catch (e: any) { alert(e.message); setStep('name'); }
  };

  const finishBrief = async () => {
    if (!brief.trim()) return;
    setStep('busy');
    try {
      const a = await api.createFromBrief(brief.trim(), name.trim() || undefined);
      nav(`/agents/${a.id}`, { replace: true });
    } catch (e: any) { alert(e.message); setStep('role'); }
  };

  return (
    <>
      <div className="page-h"><h2>New agent</h2></div>
      <div className="page-body wizard-step">
        {step === 'busy' && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" />
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>Building your agent…</p>
          </div>
        )}

        {step === 'role' && (
          <>
            <h1>What's it for?</h1>
            <p className="sub">Pick the closest match. You can tweak later.</p>
            {presets.map((p) => (
              <div key={p.slug} className="preset-row" onClick={() => choose(p)}>
                <div className="swatch" style={{ background: COLOR_BG[p.color], color: COLOR_FG[p.color] }}>{p.emoji}</div>
                <div className="info">
                  <b>{p.label}</b>
                  <p>{p.blurb}</p>
                </div>
                <div className="arrow">›</div>
              </div>
            ))}
            {picked?.slug === 'custom' && (
              <div className="agent-section">
                <h3>Describe it in one line</h3>
                <textarea
                  className="textarea"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. responds to buyers on my Etsy shop, books custom orders"
                  autoFocus
                />
                <div style={{ marginTop: 8 }}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
                </div>
                <button className="btn lg" style={{ marginTop: 12 }} onClick={finishBrief} disabled={!brief.trim()}>
                  ✨ Draft with AI
                </button>
              </div>
            )}
          </>
        )}

        {step === 'vibe' && picked && picked.slug !== 'custom' && (
          <>
            <div className="swatch" style={{ background: COLOR_BG[picked.color], color: COLOR_FG[picked.color], width: 90, height: 90, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>
              {picked.emoji}
            </div>
            <h1 style={{ marginTop: 16 }}>Pick a vibe</h1>
            <p className="sub">How should it sound?</p>
            {picked.vibes.map((v) => (
              <div
                key={v.slug}
                className={'vibe-row' + (vibe === v.slug ? ' active' : '')}
                onClick={() => setVibe(v.slug)}
              >
                <div style={{ flex: 1 }}>
                  <div className="l">{v.label}</div>
                  <div className="s">{v.persona}</div>
                </div>
                {vibe === v.slug && <div style={{ fontSize: 22 }}>✓</div>}
              </div>
            ))}
            <button
              className="btn lg"
              style={{ marginTop: 16 }}
              onClick={() => { if (!vibe) setVibe(picked.vibes[0]?.slug || null); setStep('name'); }}
            >Next</button>
          </>
        )}

        {step === 'name' && picked && (
          <>
            <h1>Name it</h1>
            <p className="sub">You can change this later.</p>
            <input
              className="input"
              style={{ fontSize: 22, fontWeight: 700, padding: 16 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button className="btn lg" style={{ marginTop: 16 }} onClick={finishPreset} disabled={!name.trim()}>
              Create agent
            </button>
          </>
        )}
      </div>
    </>
  );
}
