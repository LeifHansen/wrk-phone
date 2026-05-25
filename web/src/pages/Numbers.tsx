import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
          // ─── Upsell: two tiers, both unlock buying your own number ───
          <div className="cond-card">
            <h3 style={{ margin: '0 0 6px' }}>Want your own local number?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
              Pick a registered line. Both tiers unlock buying your own local
              number with carrier-grade deliverability. The shared toll-free
              pool stays free for low-volume / pay-as-you-go use.
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>Sole Proprietor — $5/mo + $5 setup</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Cheaper. Best for solos. ~3,000 msgs/day. One-time mobile-OTP
                  verification step in Twilio Console after checkout.
                </div>
              </div>
              <div style={{ background: 'var(--lime)', border: '2px solid var(--ink)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>Business Line — $10/mo + $15 setup</div>
                <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 4 }}>
                  Recommended. For LLC/corp with an EIN. Fully automated
                  registration. ~200,000 msgs/day. Best US carrier deliverability.
                </div>
              </div>
            </div>
            <Link to="/a2p" className="btn lg" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Pick a tier →
            </Link>
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
