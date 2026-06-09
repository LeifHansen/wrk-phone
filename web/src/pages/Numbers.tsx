import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

function pretty(e164: string) {
  const m = e164?.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

type Found = { phoneNumber: string; friendlyName: string; locality: string; region: string };

export function Numbers() {
  const [data, setData] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);

  // search/buy state
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const load = () => {
    api.listNumbers().then(setData).catch(() => {});
    api.billingSubs().then((b) => setPlans(b.plans)).catch(() => {});
  };
  useEffect(load, []);

  // Returning from Stripe checkout. Success means payment cleared — the
  // webhook provisions the number moments later, so refresh again shortly
  // instead of making the user reload by hand.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const purchase = q.get('purchase');
    if (!purchase) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (purchase === 'success') {
      toast('Payment received — setting up your number…', 'info');
      const t = setTimeout(load, 4000);
      return () => clearTimeout(t);
    }
    if (purchase === 'canceled') toast('Checkout canceled — no charge.', 'info');
  }, []);

  const mine = data?.numbers?.[0];
  const numberPlan = plans?.number;
  const priceLine = numberPlan
    ? `$${numberPlan.monthly}/mo${numberPlan.setupFee ? ` + $${numberPlan.setupFee} one-time setup` : ''}`
    : '$2/mo + $2 one-time setup';

  const search = async () => {
    const ac = areaCode.trim();
    if (!/^\d{3}$/.test(ac)) { toast('Enter a 3-digit area code.', 'err'); return; }
    setSearching(true); setResults(null);
    try {
      const r = await api.searchNumbers({ areaCode: ac });
      setResults(r);
      if (!r.length) toast('No numbers available in that area code — try another.', 'info');
    } catch (e: any) {
      toast(e.message || 'Search failed', 'err');
    } finally { setSearching(false); }
  };

  const buy = async (phoneNumber: string) => {
    setBuying(phoneNumber);
    try {
      const r = await api.buyNumber(phoneNumber);
      // Paid flow: hand off to Stripe checkout; the webhook finishes the
      // purchase + campaign assignment after payment.
      if (r.url) { window.location.href = r.url; return; }
      toast(`${pretty(r.number || phoneNumber)} is now your line.`, 'info');
      setResults(null); setAreaCode('');
      load();
    } catch (e: any) {
      toast(e.message || 'Purchase failed', 'err');
    } finally { setBuying(null); }
  };

  return (
    <>
      <div className="page-h"><div><h2>Your number</h2><div className="sub">Your assigned work line</div></div></div>
      {/* Desktop content cap is handled by styles.css via padding-inline.
          An inline maxWidth here collapses to a sliver on wide screens
          (same bug A2P.tsx had). */}
      <div className="page-body">
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

        {/* ─── Search + buy a dedicated local number ─── */}
        <div className="cond-card">
          <h3 style={{ margin: '0 0 6px' }}>Get your own number — {priceLine}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
            Search by area code and pick a local number. It joins our registered
            marketing campaign automatically — full carrier deliverability, no
            registration steps — and becomes your sending line.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Area code (e.g. 206)"
              inputMode="numeric"
              maxLength={3}
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={search} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {results && results.length > 0 && (
            <div className="setup-list">
              {results.map((n) => (
                <div key={n.phoneNumber} className="setup-num">
                  <div>
                    <div className="setup-num-text">{pretty(n.phoneNumber)}</div>
                    <div className="setup-num-meta">{n.locality || n.region || 'US'}</div>
                  </div>
                  <button
                    className="btn"
                    onClick={() => buy(n.phoneNumber)}
                    disabled={buying !== null}
                  >
                    {buying === n.phoneNumber ? 'Starting checkout…' : 'Buy'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
