import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { placeCall } from '../lib/voice';

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

  const press = (k: string) => setNum((n) => n + k);
  const back = () => setNum((n) => n.slice(0, -1));

  const go = async () => {
    const target = e164(num);
    if (!target) return;
    if (mode === 'call') {
      onCall(target);
      try { await placeCall(target); } catch (e: any) { alert(`Call failed: ${e.message}`); }
    } else {
      const { id } = await api.startConversation(target);
      nav(`/conversation/${id}`);
    }
  };

  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="phone-num">{fmt(num) || <span className="ph">enter a number</span>}</div>
        <div className="phone-toggle">
          <button className={'pt-btn' + (mode === 'call' ? ' on' : '')} onClick={() => setMode('call')}>CALL</button>
          <button className={'pt-btn' + (mode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>TEXT</button>
        </div>
      </div>

      <div className="phone-pad">
        {KEYS.map(([d, l]) => (
          <button key={d} className="phone-key" onClick={() => press(d)}>
            <span className="kd">{d}</span>
            {l && <span className="kl">{l}</span>}
          </button>
        ))}
      </div>

      <div className="phone-actions">
        <button className="pa-side" onClick={() => nav('/contacts')} title="Contacts" aria-label="Contacts">
          <span className="pa-glyph">≡</span>
          <span className="pa-cap">CONTACTS</span>
        </button>
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
    </div>
  );
}
