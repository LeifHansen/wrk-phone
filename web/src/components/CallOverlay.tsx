import { useEffect, useState } from 'react';
import { hangup, mute } from '../lib/voice';

export function CallOverlay({ peer, onEnd }: { peer: string; onEnd: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="call-overlay">
      <div style={{ marginTop: 80, textAlign: 'center' }}>
        <div className="peer">{peer || 'Call'}</div>
        <div className="timer">{fmt(seconds)}</div>
      </div>
      <div className="actions">
        <button
          className="action-btn"
          onClick={() => { setMuted((m) => { mute(!m); return !m; }); }}
          style={muted ? { background: '#fff', color: '#111' } : undefined}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button className="action-btn end" onClick={() => { hangup(); onEnd(); }}>End</button>
      </div>
    </div>
  );
}
