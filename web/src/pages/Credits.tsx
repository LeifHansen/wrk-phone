import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Credits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [rates, setRates] = useState<{ sms: string; mms: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.credits().then((c) => { setBalance(c.balance); setPackages(c.packages); setRates(c.rates); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const buy = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.buyCredits(id);
      setBalance(r.balance);
      alert(`Added ${r.added} credits. New balance: ${r.balance}.\n\n(Beta: no charge — billing isn't wired yet.)`);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="page-h"><div><h2>Credits</h2><div className="sub">Free during beta</div></div></div>
      <div className="page-body">
        <div className="credit-balance">
          <div className="cb-num">{balance == null ? '…' : balance}</div>
          <div className="cb-lbl">CREDITS</div>
        </div>

        <div className="cond-card" style={{ marginBottom: 18 }}>
          <div className="sa-label">HOW IT COSTS</div>
          <p style={{ margin: '6px 0', fontSize: 13 }}>📩 <b>SMS</b> — {rates?.sms}</p>
          <p style={{ margin: '6px 0', fontSize: 13 }}>🖼 <b>MMS</b> — {rates?.mms}</p>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            App is free now; a $0.99/mo line fee comes later. Credits cover messaging.
          </p>
        </div>

        <div className="pkg-grid">
          {packages.map((p) => (
            <div key={p.id} className="pkg">
              <div className="pkg-credits">{p.credits.toLocaleString()}</div>
              <div className="pkg-lbl">{p.label}</div>
              {p.note && <div className="pkg-note">{p.note}</div>}
              <button className="btn" disabled={busy === p.id} onClick={() => buy(p.id)}>
                {busy === p.id ? '…' : p.price === 0 ? 'Claim free' : `$${p.price}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
