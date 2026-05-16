import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Numbers() {
  const [data, setData] = useState<any>(null);
  const [area, setArea] = useState('');
  const [avail, setAvail] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.listNumbers().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const search = async () => {
    setBusy(true);
    try { setAvail(await api.searchNumbers({ country: 'US', areaCode: area || undefined })); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const buy = async (n: any) => {
    if (!confirm(`Add ${n.phoneNumber}? $2/mo recurring.`)) return;
    try {
      await api.buyAdditional(n.phoneNumber);
      const sub = await api.subscribe('number', n.phoneNumber);
      setAvail([]); load();
      if (sub.url) { window.location.href = sub.url; return; }
    } catch (e: any) { alert(e.message); }
  };
  const setActive = async (sid: string) => { await api.setActiveNumber(sid); load(); };

  return (
    <>
      <div className="page-h"><div><h2>Numbers</h2><div className="sub">Pick your line from the shared pool</div></div></div>
      <div className="page-body">
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          Choose any number below as your outbound line (calls & texts will show that number).
          Numbers are shared across the team; replies all land in the shared inbox.
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
        </div>
        <h3 className="sa-label">ADD A LOCAL NUMBER ($2/mo)</h3>
        <div className="setup-search">
          <input className="input" placeholder="Area code (415)" value={area}
            onChange={(e) => setArea(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <button className="btn" onClick={search} disabled={busy}>{busy ? '…' : 'Search'}</button>
        </div>
        <div className="setup-list">
          {avail.map((n) => (
            <div key={n.phoneNumber} className="setup-num">
              <div>
                <div className="setup-num-text">{n.phoneNumber}</div>
                <div className="setup-num-meta">{n.locality ? `${n.locality}, ` : ''}{n.region} · $2/mo</div>
              </div>
              <button className="btn lime" onClick={() => buy(n)}>Add</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
