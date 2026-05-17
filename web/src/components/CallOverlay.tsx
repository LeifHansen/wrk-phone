import { useEffect, useState } from 'react';
import { hangup, mute } from '../lib/voice';
import { api } from '../lib/api';
import { toast } from './Toast';

export function CallOverlay({ peer, callSid, onEnd }: {
  peer: string;
  callSid?: string | null;
  onEnd: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [pranking, setPranking] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Hand a spam/scam caller to the hidden PrankMode agent: redirect the
  // live call leg into the looping time-waster, then drop our end.
  const toPrank = async () => {
    if (!callSid || pranking) return;
    setPranking(true);
    try {
      await api.prankRedirect(callSid);
      toast('🎭 Handed to PrankMode — enjoy your day');
      hangup();
      onEnd();
    } catch (e: any) {
      toast(e.message || 'Could not hand off the call', 'err');
      setPranking(false);
    }
  };

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
        {callSid && (
          <button className="action-btn" onClick={toPrank} disabled={pranking}
            title="Spam? Hand it to PrankMode" style={{ background: '#7C5CFF', color: '#fff' }}>
            {pranking ? '…' : '🎭 PrankMode'}
          </button>
        )}
        <button className="action-btn end" onClick={() => { hangup(); onEnd(); }}>End</button>
      </div>
    </div>
  );
}
