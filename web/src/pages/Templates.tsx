import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { SmsAiTools } from '../components/SmsAiTools';
import { SubNav } from '../components/SubNav';

// Templates live as a subtab under Media — they're authored on top of the
// Media Library (an MMS template can reference any image you've uploaded).
const MEDIA_SUBTABS = [
  { to: '/media',           label: 'Library',   end: true },
  { to: '/media/templates', label: 'Templates' },
];

interface Tpl {
  id: number; name: string; body: string; media_url: string | null; updated_at: number;
}

export function Templates() {
  const [list, setList] = useState<Tpl[]>([]);
  const [editing, setEditing] = useState<Tpl | 'new' | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [media, setMedia] = useState<{ id: number; url: string; kind: string }[]>([]);

  const load = () => api.listTemplates().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  // Lazy-load the library only when the picker opens, so the Templates page
  // doesn't pay for a media fetch on every visit.
  const openMediaPicker = async () => {
    try { const r = await api.listMedia(); setMedia(r.items as any); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  const startNew = () => { setEditing('new'); setName(''); setBody('Hi {{first_name}}, '); setMediaUrl(null); };
  const startEdit = (t: Tpl) => { setEditing(t); setName(t.name); setBody(t.body); setMediaUrl(t.media_url); };
  const cancel = () => { setEditing(null); setName(''); setBody(''); setMediaUrl(null); };

  const save = async () => {
    if (!name.trim()) return toast('Name required.', 'err');
    if (!body.trim() && !mediaUrl) return toast('Add a body or an image.', 'err');
    try {
      if (editing === 'new') {
        await api.createTemplate({ name: name.trim(), body, media_url: mediaUrl });
        toast('Template created ✓');
      } else if (editing) {
        await api.patchTemplate(editing.id, { name: name.trim(), body, media_url: mediaUrl });
        toast('Template saved ✓');
      }
      cancel(); load();
    } catch (e: any) { toast(e.message, 'err'); }
  };
  const remove = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try { await api.deleteTemplate(id); load(); toast('Deleted'); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  // Insert a token into the body at the end (kept simple — the user can move
  // it manually once it's there). Avoids fighting with React-controlled
  // textareas + selection state for a feature most users barely need.
  const insertToken = (tok: string) => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}{{${tok}}}`);

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Templates</h2>
          <div className="sub">Reusable SMS / MMS bodies with first-name tokens</div>
        </div>
        {!editing && <button className="btn" onClick={startNew}>+ New template</button>}
      </div>
      <SubNav tabs={MEDIA_SUBTABS} />

      <div className="page-body">
        {editing && (
          <div className="cond-card" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Template name (e.g. Booking confirmation)" />
            <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, your appointment is tomorrow at 10am."
              rows={5} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>INSERT TOKEN:</span>
              <button className="btn ghost" onClick={() => insertToken('first_name')}>{'{{first_name}}'}</button>
              <button className="btn ghost" onClick={() => insertToken('name')}>{'{{name}}'}</button>
              <button className="btn ghost" onClick={() => insertToken('phone')}>{'{{phone}}'}</button>
            </div>
            <SmsAiTools text={body} goal="reusable SMS template, customer-friendly" onApply={setBody} />

            <div>
              <div className="sa-label">MMS IMAGE (OPTIONAL)</div>
              {mediaUrl ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={mediaUrl} alt="" style={{ width: 90, height: 90, objectFit: 'cover', border: 'var(--border)' }} />
                  <button className="btn ghost" onClick={() => setMediaUrl(null)}>Remove</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn ghost" onClick={openMediaPicker}>📷 Pick from library</button>
                </div>
              )}
              {!mediaUrl && media.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginTop: 8 }}>
                  {media.filter((m) => m.kind !== 'video').slice(0, 12).map((m) => (
                    <img key={m.id} src={m.url} alt="" onClick={() => setMediaUrl(m.url)}
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', border: 'var(--border)', cursor: 'pointer' }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn lime" onClick={save}>Save template</button>
              <button className="btn ghost" onClick={cancel}>Cancel</button>
            </div>
          </div>
        )}

        {list.length === 0 && !editing && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No templates yet. Create one to reuse the same message across one-off sends and campaigns.
          </p>
        )}

        {list.map((t) => (
          <div key={t.id} className="camp-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {t.media_url && <img src={t.media_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', border: 'var(--border)' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t.body || '(image only)'}</div>
              </div>
              <button className="btn ghost" onClick={() => startEdit(t)}>Edit</button>
              <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={() => remove(t.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
