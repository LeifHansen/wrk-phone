import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function pretty(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function Setup() {
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const load = () => api.listNumbers().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const pick = async (sid: string, number: string) => {
    setPicking(sid);
    try {
      await api.setActiveNumber(sid);
      nav('/', { replace: true });
    } catch (e: any) { alert(`Could not select ${pretty(number)}: ${e.message}`); }
    finally { setPicking(null); }
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Pick your number</h2>
          <div className="sub">Choose a line from the shared team pool — you can swap anytime.</div>
        </div>
      </div>
      <div className="page-body">
        {!data && <div className="spinner" style={{ margin: '32px auto', display: 'block' }} />}
        <div className="setup-list">
          {data?.numbers?.map((n: any) => (
            <div key={n.sid} className="setup-num">
              <div>
                <div className="setup-num-text">{pretty(n.phoneNumber)}</div>
                <div className="setup-num-meta">{n.isActive ? '★ current' : 'shared pool'}</div>
              </div>
              <button className="btn lime" disabled={!!picking} onClick={() => pick(n.sid, n.phoneNumber)}>
                {picking === n.sid ? 'Selecting…' : n.isActive ? 'Keep' : 'Use this'}
              </button>
            </div>
          ))}
          {data && (!data.numbers || data.numbers.length === 0) && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
              No numbers in the shared pool yet. Ask an admin to add one to the Twilio account.
            </p>
          )}
        </div>
        <div className="cond-card" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
          🔒 Buying your own number unlocks after 10DLC registration is set up.
        </div>
      </div>
    </>
  );
}
