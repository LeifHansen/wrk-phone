import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Optimization, api } from '../lib/api';
import { toast } from '../components/Toast';

const TYPE_META: Record<string, { color: string; label: string; emoji: string }> = {
  persona:      { color: '#FF3D9A', label: 'Tone',        emoji: '🎨' },
  instructions: { color: '#2D7CFF', label: 'Behavior',    emoji: '📝' },
  rules:        { color: '#FF3B30', label: 'Guardrails',  emoji: '🚫' },
  example:      { color: '#C6F432', label: 'New example', emoji: '🎓' },
  mode:         { color: '#FF6A00', label: 'Mode',        emoji: '⚡' },
};

export function AgentOptimize() {
  const { id } = useParams();
  const aid = Number(id);
  const [opts, setOpts] = useState<Optimization[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const run = async () => {
    setBusy(true); setOpts(null); setApplied(new Set());
    try {
      const res = await api.optimize(aid);
      setOpts(res.optimizations);
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };
  useEffect(() => { run(); }, [aid]);

  const apply = async (o: Optimization) => {
    try { await api.applyPatch(aid, o.patch); setApplied((s) => new Set([...s, o.id])); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-h"><h2>Optimize</h2></div>
      <div className="page-body">
        {busy && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" />
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>Analyzing your agent…</p>
          </div>
        )}
        {opts && (
          <>
            <div className="opt-hero">
              <div className="em">✨</div>
              <h2>{opts.length === 0 ? 'No suggestions yet' : `${opts.length} suggestion${opts.length === 1 ? '' : 's'}`}</h2>
              <p>{opts.length === 0
                ? "Send a few messages first — I learn from your traffic."
                : 'Tap Apply to one-click update your agent.'}
              </p>
            </div>
            {opts.map((o) => {
              const meta = TYPE_META[o.type] || TYPE_META.instructions;
              const isApplied = applied.has(o.id);
              return (
                <div key={o.id} className="opt-card">
                  <span className="opt-type" style={{ background: meta.color, color: meta.color === '#C6F432' ? '#0A0A0A' : '#fff' }}>
                    {meta.emoji} {meta.label}
                  </span>
                  <h4>{o.title}</h4>
                  <p className="rationale">{o.rationale}</p>
                  <PatchPreview patch={o.patch} />
                  <button className="btn apply" disabled={isApplied} onClick={() => apply(o)}>
                    {isApplied ? '✓ Applied' : 'Apply'}
                  </button>
                </div>
              );
            })}
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={run}>↻ Re-analyze</button>
          </>
        )}
      </div>
    </>
  );
}

function PatchPreview({ patch }: { patch: any }) {
  if (!patch) return null;
  let body: string | null = null;
  if (patch.persona) body = patch.persona;
  else if (patch.instructions) body = patch.instructions;
  else if (Array.isArray(patch.rules)) body = patch.rules.map((r: string) => `• ${r}`).join('\n');
  else if (patch.addExample) body = `IN: ${patch.addExample.in}\nOUT: ${patch.addExample.out}`;
  else if (patch.mode) body = `Mode → ${String(patch.mode).toUpperCase()}`;
  if (!body) return null;
  return <pre className="opt-preview">{body}</pre>;
}
