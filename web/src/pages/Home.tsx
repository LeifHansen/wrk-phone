import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { placeCall } from '../lib/voice';
import { IconContacts } from '../components/Icons';
import { toast } from '../components/Toast';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

function fmt(raw: string) {
  const d = raw.replace(/[^\d+*#]/g, '');
  if (d.startsWith('+')) return d;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}
function e164(raw: string) {
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : d.length ? `+${d}` : '';
}

export function Home({ onCall }: { onCall: (peer: string) => void }) {
  const nav = useNavigate();
  const [num, setNum] = useState('');
  const [mode, setMode] = useState<'call' | 'text'>('call');
  const [pick, setPick] = useState(false);
  const [recents, setRecents] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const textRef = useRef<HTMLInputElement>(null);

  const press = (k: string) => setNum((n) => n + k);
  const back = () => setNum((n) => n.slice(0, -1));

  // Switching to TEXT shows a real input (soft keyboard) instead of the
  // numeric dial pad; switching back to CALL restores the keypad.
  const switchMode = (m: 'call' | 'text') => {
    setMode(m);
    if (m === 'text') setTimeout(() => textRef.current?.focus(), 50);
  };

  const openPicker = async () => {
    setPick(true); setQ('');
    try {
      const [c, r] = await Promise.all([api.listContacts(), api.listConversations()]);
      setContacts(c);
      setRecents(r.slice(0, 8));
    } catch { /* logged in api layer */ }
  };

  const choose = (phone: string) => {
    setNum(phone.replace(/^\+1/, '').replace(/[^\d+*#]/g, ''));
    setPick(false);
  };

  const go = async () => {
    const target = e164(num);
    if (!target) return;
    if (mode === 'call') {
      onCall(target);
      try { await placeCall(target); } catch (e: any) { toast(`Call failed: ${e.message}`, 'err'); }
    } else {
      const { id } = await api.startConversation(target);
      nav(`/conversation/${id}`);
    }
  };

  const filtered = contacts.filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || (c.name || '').toLowerCase().includes(s) || c.phone.includes(s);
  });

  return (
    <div className="phone">
      {/* Mode toggle + contacts live ABOVE / OUTSIDE the number pane */}
      <div className="dialer-bar">
        <div className="phone-toggle">
          <button className={'pt-btn' + (mode === 'call' ? ' on' : '')} onClick={() => switchMode('call')}>CALL</button>
          <button className={'pt-btn' + (mode === 'text' ? ' on' : '')} onClick={() => switchMode('text')}>TEXT</button>
        </div>
        <button className="contacts-ico" onClick={openPicker} title="Select from contacts" aria-label="Select from contacts">
          <IconContacts size={20} />
        </button>
      </div>

      <div className="phone-screen">
        <div className="phone-num-row">
          <div className="phone-num">{fmt(num) || <span className="ph">enter a number</span>}</div>
        </div>
      </div>

      {mode === 'call' ? (
        <div className="phone-pad">
          {KEYS.map(([d, l]) => (
            <button key={d} className="phone-key" onClick={() => press(d)}>
              <span className="kd">{d}</span>
              {l && <span className="kl">{l}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-entry">
          <input
            ref={textRef}
            className="input"
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="Type a number, or pick a contact"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          />
          <p className="text-entry-hint">Enter who to text, then tap ✉</p>
        </div>
      )}

      <div className="phone-actions">
        <span className="pa-side" aria-hidden="true" />
        <button
          className={'pa-go ' + (mode === 'call' ? 'go-call' : 'go-text')}
          onClick={go}
          disabled={!num}
        >
          {mode === 'call' ? '✆' : '✉'}
        </button>
        <button className="pa-side" onClick={back} title="Delete" aria-label="Delete">
          <span className="pa-glyph">⌫</span>
          <span className="pa-cap">{num ? 'DEL' : ''}</span>
        </button>
      </div>

      {pick && (
        <>
          <div className="modal-backdrop" onClick={() => setPick(false)} />
          <div className="sheet" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <div className="handle" />
            <h3>Quick add</h3>
            <input className="input" placeholder="Search contacts" value={q}
              onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
            {recents.length > 0 && !q && (
              <>
                <div className="sa-label">RECENTS</div>
                {recents.map((r) => (
                  <div key={'r' + r.id} className="sheet-row" onClick={() => choose(r.peer_phone)}>
                    <div className="swatch" style={{ background: 'var(--surface-2)' }}>✆</div>
                    <div style={{ flex: 1 }}>
                      <div className="name">{r.name || r.peer_phone}</div>
                      <div className="meta">{r.peer_phone}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="sa-label" style={{ marginTop: 10 }}>CONTACTS</div>
            {filtered.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No contacts.</div>}
            {filtered.slice(0, 50).map((c) => (
              <div key={'c' + c.id} className="sheet-row" onClick={() => choose(c.phone)}>
                <div className="swatch" style={{ background: 'var(--lime)' }}>
                  {(c.name || c.phone).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="name">{c.name || c.phone}</div>
                  <div className="meta">{c.phone}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
