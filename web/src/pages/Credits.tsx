import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

export function Credits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [rates, setRates] = useState<{ sms: string; mms: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  const load = () => api.credits().then((c) => { setBalance(c.balance); setPackages(c.packages); setRates(c.rates); setTestMode(!!c.testMode); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const buy = async (id: string, price: number) => {
    setBusy(id);
    try {
      if (price === 0) {
        const r = await api.buyCredits(id);
        setBalance(r.balance);
        toast(`Added ${r.added} credits. Balance: ${r.balance}.`, 'ok');
      } else {
        const r = await api.checkout(id);
        if (r.url) { window.location.href = r.url; return; }       // → Stripe Checkout
        // dev fallback (no Stripe keys): credited instantly
        if (typeof r.balance === 'number') setBalance(r.balance);
        toast(r.note || `Credited (dev mode). Balance: ${r.balance}.`, 'ok');
      }
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(null); }
  };

  // Returning from Stripe — webhook credits async; refresh shortly after.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('paid')) {
      setTimeout(load, 1500);
      window.history.replaceState({}, '', '/credits');
    }
  }, []);

  return (
    <>
      <div className="page-h"><div><h2>Credits</h2><div className="sub">Free during beta</div></div></div>
      <div className="page-body">
        {testMode && (
          <div className="test-banner">
            🧪 <b>TEST MODE</b> — no real money moves. Pay with card <code>4242 4242 4242 4242</code>, any future date / CVC / ZIP.
          </div>
        )}
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
              <button className="btn" disabled={busy === p.id} onClick={() => buy(p.id, p.price)}>
                {busy === p.id ? '…' : p.price === 0 ? 'Claim free' : `$${p.price}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
