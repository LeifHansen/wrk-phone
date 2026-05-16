import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { placeCall } from '../lib/voice';

interface Contact { id: number; phone: string; name: string; segments: { id: number; name: string }[] }
interface Segment { id: number; name: string; count: number }

function pretty(p: string) {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
}

export function Contacts({ onCall }: { onCall: (peer: string) => void }) {
  const nav = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [q, setQ] = useState('');
  const [activeSeg, setActiveSeg] = useState<number | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState<Contact | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = () => {
    api.listContacts(q || undefined, activeSeg || undefined).then(setContacts).catch(() => {});
    api.listSegments().then(setSegments).catch(() => {});
  };
  useEffect(load, [q, activeSeg]);

  const add = async () => {
    if (!newPhone.trim()) return;
    try {
      await api.addContact(newPhone.trim(), newName.trim() || undefined);
      setNewPhone(''); setNewName(''); load();
    } catch (e: any) { alert(e.message); }
  };

  const newSegment = async () => {
    const name = prompt('Segment name (e.g. "VIP", "Leads")');
    if (!name?.trim()) return;
    try { await api.addSegment(name.trim()); load(); } catch (e: any) { alert(e.message); }
  };

  const toggleSeg = async (c: Contact, segId: number, has: boolean) => {
    try {
      if (has) await api.removeFromSegment(segId, c.id);
      else await api.addToSegment(segId, c.id);
      const fresh = await api.listContacts(q || undefined, activeSeg || undefined);
      setContacts(fresh);
      setPicked(fresh.find((x) => x.id === c.id) || null);
      api.listSegments().then(setSegments);
    } catch (e: any) { alert(e.message); }
  };

  const call = async (c: Contact) => {
    setPicked(null);
    onCall(c.phone);
    try { await placeCall(c.phone); } catch (e: any) { alert(`Call failed: ${e.message}`); }
  };
  const text = async (c: Contact) => {
    setPicked(null);
    const { id } = await api.startConversation(c.phone, c.name || undefined);
    nav(`/conversation/${id}`);
  };

  return (
    <>
      <div className="page-h">
        <div><h2>Contacts</h2><div className="sub">{contacts.length} shown</div></div>
        <button className="btn ghost" onClick={newSegment}>+ Segment</button>
      </div>
      <div className="page-body">
        {/* add — phone is the only required field */}
        <div className="contact-add">
          <input className="input" placeholder="Phone (required) e.g. 4155550142"
            value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input className="input" placeholder="Name (optional)"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn" onClick={add} disabled={!newPhone.trim()}>Add</button>
        </div>

        {/* Advanced: Google Sheets / Excel sync (collapsed by default) */}
        <button className="btn ghost" style={{ marginBottom: showAdvanced ? 10 : 14 }}
          onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>
        {showAdvanced && (
        <div className="cond-card" style={{ marginBottom: 14 }}>
          <div className="sa-label">SYNC FROM GOOGLE SHEETS / EXCEL</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="input" id="sheetUrl" placeholder="Paste a shared Google Sheet (or published Excel) link" />
            <button className="btn" onClick={async () => {
              const url = (document.getElementById('sheetUrl') as HTMLInputElement)?.value?.trim();
              if (!url) return;
              try { const r = await api.importContactsUrl(url); alert(`Imported ${r.synced} (${r.skipped} skipped). Total ${r.total}.`); load(); }
              catch (e: any) { alert(e.message); }
            }}>Import</button>
            <a className="btn ghost" href="/api/contacts/export.csv">Export CSV</a>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>
            Sheets: Share → “Anyone with the link”. Excel: File → Save As → CSV, then paste rows below.
          </div>
          <textarea className="textarea" id="csvPaste" placeholder={'Or paste CSV rows: name,phone'} style={{ marginTop: 8, minHeight: 70 }} />
          <button className="btn ghost" style={{ marginTop: 6 }} onClick={async () => {
            const csv = (document.getElementById('csvPaste') as HTMLTextAreaElement)?.value?.trim();
            if (!csv) return;
            try { const r = await api.importContactsCsv(csv); alert(`Imported ${r.synced} (${r.skipped} skipped). Total ${r.total}.`); load(); }
            catch (e: any) { alert(e.message); }
          }}>Import pasted CSV</button>
        </div>
        )}

        {/* segment filter chips */}
        <div className="seg-chips">
          <button className={'seg-chip' + (activeSeg === null ? ' on' : '')} onClick={() => setActiveSeg(null)}>
            ALL
          </button>
          {segments.map((s) => (
            <button key={s.id} className={'seg-chip' + (activeSeg === s.id ? ' on' : '')}
              onClick={() => setActiveSeg(activeSeg === s.id ? null : s.id)}>
              {s.name} · {s.count}
            </button>
          ))}
        </div>

        <input className="input" placeholder="Search" style={{ marginBottom: 14 }}
          value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="contact-list">
          {contacts.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No contacts. Add one above ↑</p>}
          {contacts.map((c) => (
            <div key={c.id} className="contact-row" onClick={() => setPicked(c)}>
              <div className="c-av">{(c.name || c.phone).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}</div>
              <div className="c-body">
                <div className="c-name">{c.name || pretty(c.phone)}</div>
                <div className="c-sub">{c.name ? pretty(c.phone) : ''}{c.segments.map((s) => ` · ${s.name}`).join('')}</div>
              </div>
              <span className="c-chev">›</span>
            </div>
          ))}
        </div>
      </div>

      {picked && (
        <>
          <div className="modal-backdrop" onClick={() => setPicked(null)} />
          <div className="sheet">
            <div className="handle" />
            <h3>{picked.name || pretty(picked.phone)}</h3>
            <div className="contact-actions">
              <button className="ca-btn ca-call" onClick={() => call(picked)}>✆<span>CALL</span></button>
              <button className="ca-btn ca-text" onClick={() => text(picked)}>✉<span>TEXT</span></button>
            </div>
            <div className="seg-assign">
              <div className="sa-label">SEGMENTS</div>
              <div className="seg-chips">
                {segments.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No segments yet — use “+ Segment”.</span>}
                {segments.map((s) => {
                  const has = picked.segments.some((x) => x.id === s.id);
                  return (
                    <button key={s.id} className={'seg-chip' + (has ? ' on' : '')}
                      onClick={() => toggleSeg(picked, s.id, has)}>
                      {has ? '✓ ' : '+ '}{s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className="btn ghost" style={{ width: '100%', marginTop: 14, color: 'var(--red)' }}
              onClick={async () => { await api.deleteContact(picked.id); setPicked(null); load(); }}>
              Delete contact
            </button>
          </div>
        </>
      )}
    </>
  );
}
