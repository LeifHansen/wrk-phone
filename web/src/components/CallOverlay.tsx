import { useEffect, useState } from 'react';
import { hangup, mute } from '../lib/voice';
import { api } from '../lib/api';
import { toast } from './Toast';
import { LogoMark } from './Logo';

// In-call screen, restyled to match the rest of the app — cream background,
// thick black borders, lime accent, retro arcade buttons. Replaces the
// previous dark/scanline overlay that felt like a different product.
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

  const prettyPeer = (p: string) => {
    const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || 'Call');
  };

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      padding: '60px 24px 40px',
    }}>
      {/* Brand mark + label up top — keeps the overlay clearly inside the app */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark size={36} />
        <span style={{ fontFamily: 'var(--pixel)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>
          ON CALL
        </span>
      </div>

      {/* Big avatar tile + name + timer (matches the agent-banner aesthetic) */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
      }}>
        <div style={{
          width: 140, height: 140, background: 'var(--lime)',
          border: 'var(--border)', borderRadius: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 64, boxShadow: 'var(--shadow-lg)',
        }} aria-hidden>
          📞
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--pixel)', fontSize: 22, color: 'var(--ink)' }}>
            {prettyPeer(peer)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 26, marginTop: 10, color: 'var(--ink)' }}>
            {fmt(seconds)}
          </div>
        </div>
      </div>

      {/* Actions — same .btn arcade style used everywhere else */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          className={'btn lg ' + (muted ? 'ghost' : '')}
          onClick={() => { setMuted((m) => { mute(!m); return !m; }); }}
          style={muted ? undefined : { background: 'var(--surface)' }}
          aria-pressed={muted}>
          {muted ? '🔇 Muted' : '🎤 Mute'}
        </button>
        {callSid && (
          <button className="btn lg" onClick={toPrank} disabled={pranking}
            title="Spam? Hand it to PrankMode"
            style={{ background: 'var(--purple)', color: '#fff' }}>
            {pranking ? '…' : '🎭 PrankMode'}
          </button>
        )}
        <button className="btn lg danger" onClick={() => { hangup(); onEnd(); }}
          style={{ background: 'var(--red)', color: '#fff' }}>
          ✆ End call
        </button>
      </div>
    </div>
  );
}
