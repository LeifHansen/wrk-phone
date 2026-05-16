import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Numbers() {
  const [data, setData] = useState<any>(null);
  const load = () => api.listNumbers().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const setActive = async (sid: string) => { await api.setActiveNumber(sid); load(); };

  return (
    <>
      <div className="page-h"><div><h2>Numbers</h2><div className="sub">Pick your line from the shared pool</div></div></div>
      <div className="page-body">
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          Choose any number below as your outbound line (calls & texts will show that number).
          Numbers are shared across the team; replies all land in the shared inbox. You can swap anytime.
        </p>
        <div className="setup-list" style={{ marginBottom: 20 }}>
          {data?.numbers?.map((n: any) => (
            <div key={n.sid} className="setup-num">
              <div>
                <div className="setup-num-text">{n.phoneNumber}</div>
                <div className="setup-num-meta">{n.isActive ? '★ your line' : 'shared · tap to use'}</div>
              </div>
              {!n.isActive && <button className="btn ghost" onClick={() => setActive(n.sid)}>Use this</button>}
            </div>
          ))}
          {!data && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {data && data.numbers?.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>No numbers in the pool yet.</p>
          )}
        </div>
        <div className="cond-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          🔒 Buying your own number unlocks after 10DLC registration is set up.
          For now everyone shares the team pool above.
        </div>
      </div>
    </>
  );
}
