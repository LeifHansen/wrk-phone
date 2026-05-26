import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Live agent-call monitoring panel. Polls /api/agent-calls/live on a tight
// 2.5s loop (only while at least one call is active — see backoff below)
// and renders each in-flight call with status, recipient, duration, and a
// live transcript that streams from Twilio's real-time transcription
// webhook. Audio "listen" links out to the Twilio Console call page for
// now — true in-browser live audio requires Media Streams (next iteration).

type Event = { sequence: number; source: string; text: string; is_final: number; created_at: number };
type LiveCall = {
  recipient_id: number;
  phone: string;
  name: string | null;
  status: string;
  twilio_sid: string | null;
  campaign_id: number;
  campaign_name: string;
  script: string;
  agent_name: string | null;
  agent_emoji: string | null;
  agent_color: string | null;
  transcript: Event[];
};

function fmtDuration(startMs: number) {
  const s = Math.max(0, Math.round((Date.now() - startMs) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'in-progress' ? 'var(--lime)'
    : status === 'ringing' ? 'var(--yellow)'
    : status === 'initiated' ? 'var(--blue)'
    : 'var(--muted)';
  return (
    <span
      style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: color, boxShadow: `0 0 0 3px rgba(0,0,0,0.06)`,
        animation: status === 'in-progress' ? 'pulse 1.4s ease-in-out infinite' : 'none',
        marginRight: 8, verticalAlign: 'middle',
      }}
    />
  );
}

function TranscriptStream({ events }: { events: Event[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Auto-scroll to the bottom as new chunks arrive — matches every chat
  // transcript users have seen before, so the affordance is obvious.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length, events[events.length - 1]?.text]);
  if (events.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic', padding: '6px 0' }}>
        Waiting for first words…
      </div>
    );
  }
  return (
    <div
      ref={ref}
      style={{
        maxHeight: 140, overflowY: 'auto',
        background: 'var(--surface-2)', border: 'var(--border)',
        borderRadius: 8, padding: '8px 10px',
        fontSize: 13, lineHeight: 1.45,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      {events.map((e) => (
        <div key={e.sequence}
          style={{
            opacity: e.is_final ? 1 : 0.7,
            fontStyle: e.is_final ? 'normal' : 'italic',
          }}
        >
          <b style={{ color: e.source === 'outbound' ? 'var(--blue)' : 'var(--ink)' }}>
            {e.source === 'outbound' ? 'Agent' : e.source === 'inbound' ? 'Caller' : 'System'}:
          </b>{' '}
          {e.text}
        </div>
      ))}
    </div>
  );
}

export function LiveCalls() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Track when each call first showed up so we can render a duration
  // counter — the API doesn't currently store call-start timestamps for
  // active calls (status row has duration_sec only on completion).
  const startTs = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.liveAgentCalls();
        if (!alive) return;
        const now = Date.now();
        for (const c of r.calls) {
          if (c.twilio_sid && !startTs.current[c.twilio_sid]) {
            startTs.current[c.twilio_sid] = now;
          }
        }
        setCalls(r.calls);
        setLoaded(true);
      } catch { /* stay silent — poll keeps trying */ }
    };
    tick();
    // 2.5s while active, 8s when idle — keeps idle accounts cheap.
    let intervalMs = 8000;
    let timer = setInterval(tick, intervalMs);
    const rotate = setInterval(() => {
      const newMs = calls.length > 0 ? 2500 : 8000;
      if (newMs !== intervalMs) {
        clearInterval(timer);
        intervalMs = newMs;
        timer = setInterval(tick, intervalMs);
      }
    }, 5000);
    return () => { alive = false; clearInterval(timer); clearInterval(rotate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls.length]);

  if (!loaded) return null;
  if (calls.length === 0) {
    return (
      <div className="cond-card" style={{ marginBottom: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
          No active calls. When an agent campaign is dialing, live transcripts will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="cond-card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ color: 'var(--red)', fontWeight: 800, fontSize: 13, letterSpacing: 0.6 }}>● LIVE</span>
        <h3 style={{ margin: 0, fontSize: 16 }}>{calls.length} active call{calls.length === 1 ? '' : 's'}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {calls.map((c) => (
          <div key={c.recipient_id}
            style={{
              border: 'var(--border)', borderRadius: 10, padding: '12px 14px',
              background: 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <StatusDot status={c.status} />
                <b>{c.name || c.phone}</b>{' '}
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  · {c.agent_emoji || '🤖'} {c.agent_name || 'Agent'} · {c.campaign_name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>
                  {c.twilio_sid ? fmtDuration(startTs.current[c.twilio_sid] || Date.now()) : '—'}
                </span>
                <span className="pill" style={{ fontSize: 10 }}>{c.status.toUpperCase()}</span>
                {c.twilio_sid && (
                  // Twilio Console exposes per-call live audio + carrier-side
                  // detail. In-app live listening requires Media Streams
                  // (websocket audio relay) which is a follow-up build.
                  <a
                    className="btn ghost"
                    href={`https://console.twilio.com/us1/monitor/logs/calls/${c.twilio_sid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '6px 12px', fontSize: 10 }}
                    title="Open this call in the Twilio Console (live audio + carrier-side detail)"
                  >
                    🎧 Listen
                  </a>
                )}
              </div>
            </div>
            <TranscriptStream events={c.transcript} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.18); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
