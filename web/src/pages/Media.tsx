import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { SubNav } from '../components/SubNav';

const MEDIA_SUBTABS = [
  { to: '/media',           label: 'Library',   end: true },
  { to: '/media/templates', label: 'Templates' },
];

interface Item { id: number; url: string; prompt: string | null; kind: string; created_at: number }

export function Media() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'generated' | 'upload' | 'video'>('all');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [backend, setBackend] = useState<'local' | 'r2'>('local');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.listMedia(filter === 'all' ? undefined : filter)
      .then((r) => { setItems(r.items); setBackend(r.backend); })
      .catch(() => {});
  useEffect(() => { load(); }, [filter]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      // Library uploads explicitly opt in to saveToLibrary — they're the
      // whole reason the user came to this page.
      await api.uploadMediaRaw(file, true);
      load(); toast('Uploaded ✓');
    } catch (err: any) { toast(err.message, 'err'); }
    finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const gen = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      await api.generateImage(prompt.trim(), true);
      setPrompt(''); load(); toast('Image generated ✓');
    } catch (err: any) { toast(err.message, 'err'); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this file from the library?')) return;
    try { await api.deleteMedia(id); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Media Library</h2>
          <div className="sub">
            Reusable images + short videos for MMS sends.
            <span style={{ marginLeft: 8, fontFamily: 'var(--pixel)', fontSize: 8, color: 'var(--muted)' }}>
              STORAGE: {backend.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <SubNav tabs={MEDIA_SUBTABS} />

      <div className="page-body">
        {/* Upload + AI generate */}
        <div className="cond-card" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn lime" onClick={() => fileRef.current?.click()} disabled={busy}>
              📤 Upload image / video
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onPick} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Up to 10MB images, 50MB videos.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Or describe an image — AI generates it (e.g. retro neon sale banner)" />
            <button className="btn pink" onClick={gen} disabled={busy || !prompt.trim()}>
              {busy ? 'Working…' : '✨ Generate with AI'}
            </button>
          </div>
        </div>

        {/* Type filter */}
        <div className="seg-chips" style={{ marginBottom: 14 }}>
          {(['all', 'generated', 'upload', 'video'] as const).map((k) => (
            <button key={k}
              className={'seg-chip' + (filter === k ? ' on' : '')}
              onClick={() => setFilter(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>

        {items.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No media yet. Upload or generate something above.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {items.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {m.kind === 'video' ? (
                <video src={m.url} controls preload="metadata"
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', border: 'var(--border)' }} />
              ) : (
                <a href={m.url} target="_blank" rel="noreferrer">
                  <img src={m.url} alt={m.prompt || ''} loading="lazy"
                    style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', border: 'var(--border)' }} />
                </a>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--muted)' }}>{m.kind.toUpperCase()}</span>
                <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 9, color: 'var(--red)' }}
                  onClick={() => remove(m.id)}>Delete</button>
              </div>
              {m.prompt && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.prompt.slice(0, 60)}{m.prompt.length > 60 ? '…' : ''}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
