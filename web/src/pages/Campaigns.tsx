import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

interface Campaign {
  id: number; name: string; template: string; channel: string; status: string;
  sent_count: number; total_count: number; created_at: number; media_url: string | null;
}
interface Segment { id: number; name: string; count: number }

function parseRecipients(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [phone, ...rest] = line.split(',').map((s) => s.trim());
    return { phone, name: rest.join(', ') || undefined };
  }).filter((r) => r.phone);
}

type Target = 'all' | 'segment' | 'paste';

export function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('Hi {{name}}, ');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [segId, setSegId] = useState<number | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [imgPrompt, setImgPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.listCampaigns().then((r) => setList(r as Campaign[])).catch(() => {});
    api.listSegments().then(setSegments).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const genImage = async () => {
    if (!imgPrompt.trim()) return;
    setGenBusy(true);
    try {
      const m = await api.generateImage(imgPrompt.trim());
      setMediaUrl(m.url);
    } catch (e: any) { toast(`Image gen failed: ${e.message}`, 'err'); }
    finally { setGenBusy(false); }
  };

  const create = async () => {
    const payload: any = { name: name.trim(), template: template.trim(), channel: mediaUrl ? 'mms' : 'sms' };
    if (mediaUrl) payload.mediaUrl = mediaUrl;
    if (target === 'all') payload.allContacts = true;
    else if (target === 'segment') {
      if (!segId) return toast('Pick a segment.', 'err');
      payload.segmentId = segId;
    } else {
      const r = parseRecipients(recipientsRaw);
      if (r.length === 0) return toast('Add at least one recipient.', 'err');
      payload.recipients = r;
    }
    if (!payload.name || (!payload.template && !payload.mediaUrl)) return toast('Name + message (or image) required.', 'err');
    setBusy(true);
    try {
      await api.createCampaign(payload);
      setShowNew(false); setName(''); setTemplate('Hi {{name}}, '); setRecipientsRaw('');
      setMediaUrl(null); setImgPrompt(''); setTarget('all'); setSegId(null);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const send = async (id: number) => {
    if (!confirm('Send to every recipient now?')) return;
    try { await api.sendCampaign(id); load(); } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-h">
        <div><h2>Blast</h2><div className="sub">SMS / MMS campaigns</div></div>
        <button className="btn" onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ New'}</button>
      </div>
      <div className="page-body">
        {showNew && (
          <div className="cond-card" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name (e.g. Spring promo)" />
            <textarea className="textarea" value={template} onChange={(e) => setTemplate(e.target.value)}
              placeholder="Message — use {{name}} to personalize" />

            {/* WHO */}
            <div>
              <div className="sa-label">SEND TO</div>
              <div className="seg-chips">
                <button className={'seg-chip' + (target === 'all' ? ' on' : '')} onClick={() => setTarget('all')}>WHOLE LIST</button>
                <button className={'seg-chip' + (target === 'segment' ? ' on' : '')} onClick={() => setTarget('segment')}>A SEGMENT</button>
                <button className={'seg-chip' + (target === 'paste' ? ' on' : '')} onClick={() => setTarget('paste')}>PASTE</button>
              </div>
              {target === 'segment' && (
                <div className="seg-chips" style={{ marginTop: 8 }}>
                  {segments.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No segments — make one in Contacts.</span>}
                  {segments.map((s) => (
                    <button key={s.id} className={'seg-chip' + (segId === s.id ? ' on' : '')}
                      onClick={() => setSegId(s.id)}>{s.name} · {s.count}</button>
                  ))}
                </div>
              )}
              {target === 'paste' && (
                <textarea className="textarea" style={{ marginTop: 8, fontFamily: 'var(--mono)' }}
                  value={recipientsRaw} onChange={(e) => setRecipientsRaw(e.target.value)}
                  placeholder={'+15551234567, Sam\n+15559876543, Alex'} />
              )}
            </div>

            {/* MMS IMAGE */}
            <div>
              <div className="sa-label">MMS IMAGE (OPTIONAL — NOVELTY)</div>
              {mediaUrl ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={mediaUrl} alt="" style={{ width: 90, height: 90, objectFit: 'cover', border: 'var(--border)' }} />
                  <button className="btn ghost" onClick={() => setMediaUrl(null)}>Remove</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)}
                    placeholder="Describe an image — AI makes it (e.g. retro neon sale banner)" />
                  <button className="btn pink" onClick={genImage} disabled={genBusy || !imgPrompt.trim()}>
                    {genBusy ? 'Drawing…' : 'Generate'}
                  </button>
                </div>
              )}
            </div>

            <button className="btn" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button>
          </div>
        )}

        {list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No campaigns yet.</p>}
        {list.map((c) => (
          <div key={c.id} className="camp-row">
            {c.media_url && <img src={c.media_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', border: 'var(--border)' }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="meta">
                <span className={`camp-status ${c.status}`}>{c.status}</span> · {c.sent_count}/{c.total_count} · {c.channel.toUpperCase()}
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>{c.template}</div>
            </div>
            {c.status === 'draft' && <button className="btn" onClick={() => send(c.id)}>Send</button>}
          </div>
        ))}
      </div>
    </>
  );
}
