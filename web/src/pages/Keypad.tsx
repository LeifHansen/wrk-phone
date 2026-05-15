import { useState } from 'react';
import { placeCall } from '../lib/voice';

const ROWS = [
  [{ d: '1', l: '' }, { d: '2', l: 'ABC' }, { d: '3', l: 'DEF' }],
  [{ d: '4', l: 'GHI' }, { d: '5', l: 'JKL' }, { d: '6', l: 'MNO' }],
  [{ d: '7', l: 'PQRS' }, { d: '8', l: 'TUV' }, { d: '9', l: 'WXYZ' }],
  [{ d: '*', l: '' }, { d: '0', l: '+' }, { d: '#', l: '' }],
];

function fmt(raw: string) {
  const d = raw.replace(/[^\d+*#]/g, '');
  if (d.startsWith('+')) return d;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

export function Keypad({ onCall }: { onCall: (peer: string) => void }) {
  const [num, setNum] = useState('');
  const press = (k: string) => setNum((n) => n + k);
  const back = () => setNum((n) => n.slice(0, -1));

  const call = async () => {
    if (!num) return;
    const target = num.startsWith('+') ? num : `+1${num.replace(/[^\d]/g, '')}`;
    onCall(target);
    try { await placeCall(target); }
    catch (e: any) { alert(`Call failed: ${e.message}`); }
  };

  return (
    <>
      <div className="page-h"><h2>Keypad</h2></div>
      <div className="keypad-wrap">
        <div className="keypad-num">{fmt(num) || ' '}</div>
        <div className="keypad-grid">
          {ROWS.flat().map((k, i) => (
            <button key={i} className="keypad-key" onClick={() => press(k.d)}>
              <div className="digit">{k.d}</div>
              {k.l && <div className="letters">{k.l}</div>}
            </button>
          ))}
        </div>
        <div className="keypad-actions">
          <span style={{ width: 70 }} />
          <button className="call-btn" onClick={call} disabled={!num}>📞</button>
          <button className="del-btn" onClick={back}>{num ? '⌫' : ''}</button>
        </div>
      </div>
    </>
  );
}
