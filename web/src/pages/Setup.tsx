import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function pretty(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// Numbers are auto-assigned from a shared pool — users never browse the pool.
// This screen just provisions (idempotent) and confirms their line.
export function Setup() {
  const nav = useNavigate();
  const [number, setNumber] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const claim = () => {
    setErr('');
    api.claimNumber()
      .then((r) => setNumber(r.number))
      .catch((e) => setErr(e.message || 'Could not assign a number.'));
  };
  useEffect(() => { claim(); }, []);

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Your work line</h2>
          <div className="sub">We assign you a number automatically — nothing to pick.</div>
        </div>
      </div>
      <div className="page-body" style={{ maxWidth: 520 }}>
        {!number && !err && (
          <div className="cond-card" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '8px auto' }} />
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>Setting up your number…</p>
          </div>
        )}

        {number && (
          <div className="cond-card" style={{ textAlign: 'center' }}>
            <div className="setup-num-meta" style={{ color: 'var(--muted)' }}>YOUR NUMBER</div>
            <div style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 4px' }}>{pretty(number)}</div>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Calls and texts you send show this number. It's ready to use now.
            </p>
            <button className="btn lime lg" style={{ marginTop: 14 }} onClick={() => nav('/', { replace: true })}>
              Start using it
            </button>
          </div>
        )}

        {err && (
          <div className="cond-card">
            <p style={{ color: 'var(--red)' }}>{err}</p>
            <button className="btn ghost" onClick={claim}>Try again</button>
          </div>
        )}

        <div className="cond-card" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
          🔒 Bringing or buying your own dedicated number unlocks after 10DLC
          registration. For now you share a pooled line — replies land in your inbox.
        </div>
      </div>
    </>
  );
}
