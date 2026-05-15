import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

export function AgentTrain() {
  const { id } = useParams();
  const aid = Number(id);
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [replies, setReplies] = useState<string[]>(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const fresh = async () => {
    setBusy(true); setPrompts(null); setReplies(['', '', '']); setSaved(new Set());
    try {
      const r = await api.trainingPrompts(aid);
      setPrompts(r.prompts);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { fresh(); }, [aid]);

  const save = async (i: number) => {
    if (!prompts || !replies[i].trim()) return;
    try {
      const a = await api.getAgent(aid);
      const ex = [...(a.examples || []), { in: prompts[i], out: replies[i].trim() }];
      await api.patchAgent(aid, { examples: ex } as any);
      setSaved((s) => new Set([...s, i]));
    } catch (e: any) { alert(e.message); }
  };

  return (
    <>
      <div className="page-h"><h2>Quick Train</h2></div>
      <div className="page-body">
        {busy || !prompts ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" />
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>Coming up with realistic messages…</p>
          </div>
        ) : (
          <>
            <div className="train-hero">
              <div style={{ fontSize: 32 }}>🎓</div>
              <h2 style={{ margin: '8px 0 4px', fontWeight: 800, fontSize: 24 }}>How would you reply?</h2>
              <p style={{ margin: 0, opacity: 0.85 }}>Type a reply in your own voice. We'll teach the agent to match it.</p>
            </div>
            {prompts.map((p, i) => (
              <div key={i} className="train-card">
                <div className="prompt-bubble">{p}</div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Your reply</label>
                <textarea
                  className="textarea"
                  style={{ marginTop: 4, minHeight: 60 }}
                  value={replies[i]}
                  onChange={(e) => setReplies((rs) => rs.map((r, idx) => idx === i ? e.target.value : r))}
                  placeholder="type how you'd actually respond…"
                />
                <button
                  className="btn lg"
                  style={{ marginTop: 12, width: '100%' }}
                  onClick={() => save(i)}
                  disabled={!replies[i].trim() || saved.has(i)}
                >{saved.has(i) ? '✓ Saved' : 'Teach this'}</button>
              </div>
            ))}
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={fresh}>↻ Give me 3 more</button>
          </>
        )}
      </div>
    </>
  );
}
