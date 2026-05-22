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
  const [hasBusinessLine, setHasBusinessLine] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // search/buy state
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const load = () => {
    api.listNumbers().then(setData).catch(() => {});
    api.billingSubs().then((b) => {
      setPlans(b.plans);
      const sub = (b.subscriptions || []).find(
        (s: any) => s.plan === 'a2p' && (s.status === 'active' || s.status === 'dev'),
      );
      setHasBusinessLine(!!sub);
    }).catch(() => {});
  };
  useEffect(load, []);

  const mine = data?.numbers?.[0];
  const a2p = plans?.a2p;

  const startSubscribe = async () => {
    setSubscribing(true);
    try {
      const r = await api.subscribe('a2p');
      if (r.url) { window.location.href = r.url; return; }
      // No-Stripe dev fallback — the plan is recorded immediately.
      toast(r.note || 'Business Line activated.', 'info');
      load();
    } catch (e: any) {
      toast(e.message || 'Could not start checkout', 'err');
    } finally { setSubscribing(false); }
  };

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
      await api.buyNumber(phoneNumber);
      toast(`${pretty(phoneNumber)} is now your line.`, 'info');
      setResults(null); setAreaCode('');
      load();
    } catch (e: any) {
      toast(e.message || 'Purchase failed', 'err');
    } finally { setBuying(null); }
  };

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

        {!hasBusinessLine ? (
          // ─── Upsell: locked behind the Business Line add-on ───
          <div className="cond-card">
            <h3 style={{ margin: '0 0 6px' }}>Want your own local number?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
              Upgrade to a <strong>Business Line</strong> to pick your own local
              number by area code, registered for A2P 10DLC so your texts land
              reliably.
            </p>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
              {a2p
                ? <>${a2p.setupFee ?? 0} one-time setup + ${a2p.monthly}/mo</>
                : '$15 one-time setup + $10/mo'}
            </div>
            <button className="btn lg" onClick={startSubscribe} disabled={subscribing}>
              {subscribing ? 'Starting checkout…' : 'Upgrade to Business Line'}
            </button>
          </div>
        ) : (
          // ─── Unlocked: search + buy a local number ───
          <div className="cond-card">
            <h3 style={{ margin: '0 0 6px' }}>Get your own number</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
              Search by area code and pick a local 10DLC number. It joins your
              registered campaign automatically.
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
                      {buying === n.phoneNumber ? 'Buying…' : 'Buy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
