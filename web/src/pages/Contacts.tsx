import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { placeCall } from '../lib/voice';
import { toast } from '../components/Toast';

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
  const [editSeg, setEditSeg] = useState<{ id: number; name: string } | null>(null);

  const load = () => {
    api.listContacts(q || undefined, activeSeg || undefined).then(setContacts).catch(() => {});
    api.listSegments().then(setSegments).catch(() => {});
  };
  useEffect(load, [q, activeSeg]);

  // 🎭 Easter egg: searching contacts for the magic phrase summons the
  // hidden anti-spam PrankMode agent.
  useEffect(() => {
    if (q.trim().toLowerCase().replace(/\s+/g, '') !== 'prankmode') return;
    let cancelled = false;
    api.prankReveal()
      .then((r) => {
        if (cancelled) return;
        setQ('');
        toast('🎭 PrankMode unlocked — your anti-spam agent is ready');
        nav(`/agents/${r.agent.id}`);
      })
      .catch((e: any) => toast(e.message, 'err'));
    return () => { cancelled = true; };
  }, [q]);

  const add = async () => {
    if (!newPhone.trim()) return;
    try {
      await api.addContact(newPhone.trim(), newName.trim() || undefined);
      setNewPhone(''); setNewName(''); load();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const newSegment = async () => {
    const name = prompt('Segment name (e.g. "VIP", "Leads")');
    if (!name?.trim()) return;
    try {
      const s = await api.addSegment(name.trim());
      await load();
      setEditSeg({ id: s.id, name: s.name }); // jump straight into selecting members
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const inEditSeg = (c: Contact) => !!editSeg && c.segments.some((s) => s.id === editSeg.id);

  const toggleMember = async (c: Contact) => {
    if (!editSeg) return;
    try {
      if (inEditSeg(c)) await api.removeFromSegment(editSeg.id, c.id);
      else await api.addToSegment(editSeg.id, c.id);
      await load();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const importCsvFile = async (file: File) => {
    if (!editSeg) return;
    try {
      const text = await file.text();
      const r = await api.importContactsCsv(text, editSeg.id);
      toast(`Imported ${r.synced} into "${editSeg.name}" (${r.skipped} skipped).`, 'ok');
      await load();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const toggleSeg = async (c: Contact, segId: number, has: boolean) => {
    try {
      if (has) await api.removeFromSegment(segId, c.id);
      else await api.addToSegment(segId, c.id);
      const fresh = await api.listContacts(q || undefined, activeSeg || undefined);
      setContacts(fresh);
      setPicked(fresh.find((x) => x.id === c.id) || null);
      api.listSegments().then(setSegments);
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const call = async (c: Contact) => {
    setPicked(null);
    onCall(c.phone);
    try { await placeCall(c.phone); } catch (e: any) { toast(`Call failed: ${e.message}`, 'err'); }
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
        <button className="btn" onClick={newSegment}>+ Segment</button>
      </div>
      <div className="page-body">
        {editSeg && (
          <div className="cond-card" style={{ marginBottom: 14, background: 'var(--lime)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ flex: 1 }}>Add to “{editSeg.name}” — tick contacts below</b>
              <label className="btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                Import .csv
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsvFile(f); e.currentTarget.value = ''; }} />
              </label>
              <button className="btn" onClick={() => setEditSeg(null)}>Done</button>
            </div>
          </div>
        )}
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
        <div className="cond-card import-pane" style={{ marginBottom: 14 }}>
          <div className="import-head">
            <div className="sa-label">SYNC FROM GOOGLE SHEETS / EXCEL</div>
            <a className="btn ghost" href="/api/contacts/export.csv">Export CSV</a>
          </div>

          <label className="import-field">
            <span>From a link</span>
            <input className="input" id="sheetUrl"
              placeholder="Paste a shared Google Sheet or published Excel link" />
          </label>
          <button className="btn" style={{ width: '100%' }} onClick={async () => {
            const url = (document.getElementById('sheetUrl') as HTMLInputElement)?.value?.trim();
            if (!url) return;
            try { const r = await api.importContactsUrl(url); toast(`Imported ${r.synced} (${r.skipped} skipped). Total ${r.total}.`, 'ok'); load(); }
            catch (e: any) { toast(e.message, 'err'); }
          }}>Import from link</button>

          <div className="import-divider"><span>or paste rows</span></div>

          <label className="import-field">
            <span>CSV rows — <code>name,phone</code></span>
            <textarea className="textarea" id="csvPaste"
              placeholder={'Jane Doe,+14155550142\nSam Lee,+12065550199'}
              style={{ minHeight: 84 }} />
          </label>
          <button className="btn" style={{ width: '100%' }} onClick={async () => {
            const csv = (document.getElementById('csvPaste') as HTMLTextAreaElement)?.value?.trim();
            if (!csv) return;
            try { const r = await api.importContactsCsv(csv); toast(`Imported ${r.synced} (${r.skipped} skipped). Total ${r.total}.`, 'ok'); load(); }
            catch (e: any) { toast(e.message, 'err'); }
          }}>Import pasted CSV</button>

          <p className="import-hint">
            Google Sheets: Share → “Anyone with the link”. Excel: File → Save As → CSV.
          </p>
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
            <div key={c.id} className="contact-row"
              onClick={() => (editSeg ? toggleMember(c) : setPicked(c))}>
              {editSeg && (
                <input type="checkbox" readOnly checked={inEditSeg(c)}
                  style={{ width: 20, height: 20, accentColor: 'var(--ink)' }} />
              )}
              <div className="c-av">{(c.name || c.phone).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}</div>
              <div className="c-body">
                <div className="c-name">{c.name || pretty(c.phone)}</div>
                <div className="c-sub">{c.name ? pretty(c.phone) : ''}{c.segments.map((s) => ` · ${s.name}`).join('')}</div>
              </div>
              {!editSeg && <span className="c-chev">›</span>}
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
