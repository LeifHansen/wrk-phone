import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Campaign {
  id: number; name: string; template: string; channel: string; status: string;
  sent_count: number; total_count: number; created_at: number;
}

function parseRecipients(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [phone, ...rest] = line.split(',').map((s) => s.trim());
    return { phone, name: rest.join(', ') || undefined };
  }).filter((r) => r.phone);
}

export function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('Hi {{name}}, ');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.listCampaigns().then((r) => setList(r as Campaign[])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const create = async () => {
    const recipients = parseRecipients(recipientsRaw);
    if (!name.trim() || !template.trim() || recipients.length === 0) {
      alert('Name, template, and at least one recipient required.');
      return;
    }
    setBusy(true);
    try {
      await api.createCampaign({ name: name.trim(), template: template.trim(), recipients });
      setShowNew(false); setName(''); setTemplate('Hi {{name}}, '); setRecipientsRaw('');
      load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const send = async (id: number) => {
    if (!confirm('Send to every recipient now?')) return;
    try { await api.sendCampaign(id); load(); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <>
      <div className="page-h">
        <h2>Campaigns</h2>
        <button className="btn" onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ New'}</button>
      </div>
      <div className="page-body">
        {showNew && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 16, padding: 16, background: 'var(--bg-subtle)', borderRadius: 12 }}>
            <label>Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring promo" /></label>
            <label>Template (use {'{{name}}'} for personalization)
              <textarea className="textarea" value={template} onChange={(e) => setTemplate(e.target.value)} />
            </label>
            <label>Recipients (one per line: <code>+15551234567, Sam</code>)
              <textarea
                className="textarea"
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                placeholder={'+15551234567, Sam\n+15559876543, Alex'}
                style={{ fontFamily: 'Menlo, monospace' }}
              />
            </label>
            <div><button className="btn" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button></div>
          </div>
        )}

        {list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No campaigns yet.</p>}
        {list.map((c) => (
          <div key={c.id} className="camp-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
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
