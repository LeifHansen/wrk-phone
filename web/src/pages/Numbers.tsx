import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function pretty(e164: string) {
  const m = e164?.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function Numbers() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.listNumbers().then(setData).catch(() => {}); }, []);

  const mine = data?.numbers?.[0];

  return (
    <>
      <div className="page-h"><div><h2>Your number</h2><div className="sub">Your assigned work line</div></div></div>
      <div className="page-body" style={{ maxWidth: 520 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          You're assigned a number automatically. Calls and texts you send show
          this number, and replies land in your inbox.
        </p>
        <div className="setup-list" style={{ marginBottom: 20 }}>
          {mine && (
            <div className="setup-num">
              <div>
                <div className="setup-num-text">{pretty(mine.phoneNumber)}</div>
                <div className="setup-num-meta">★ your line</div>
              </div>
            </div>
          )}
          {!data && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {data && !mine && (
            <p style={{ color: 'var(--muted)' }}>No number assigned yet — open Setup to get one.</p>
          )}
        </div>
        <div className="cond-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          🔒 Bringing or buying your own dedicated number unlocks after 10DLC
          registration is set up.
        </div>
      </div>
    </>
  );
}
