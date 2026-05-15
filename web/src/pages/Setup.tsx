import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Avail { phoneNumber: string; friendlyName: string; locality: string; region: string }

function pretty(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function Setup() {
  const nav = useNavigate();
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<Avail[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ activeNumber: string | null; isProvisioned: boolean } | null>(null);

  useEffect(() => { api.activeNumber().then(setCurrent).catch(() => {}); }, []);

  const search = async () => {
    setSearching(true); setResults([]);
    try {
      const r = await api.searchNumbers({ country: 'US', areaCode: areaCode.trim() || undefined });
      setResults(r);
      if (r.length === 0) alert('No numbers for that area code — try another.');
    } catch (e: any) { alert(`Search failed: ${e.message}`); }
    finally { setSearching(false); }
  };

  const buy = async (n: Avail) => {
    if (!confirm(`Get ${pretty(n.phoneNumber)} (${n.locality || n.region})?\n\nThis purchases the number on your Twilio account and connects it to your Wrk Phone + messaging service.`)) return;
    setBuying(n.phoneNumber);
    try {
      const res = await api.buyNumber(n.phoneNumber);
      const warn = res.warnings?.length ? `\n\nNote:\n• ${res.warnings.join('\n• ')}` : '';
      alert(`You're set 🎉\n${pretty(res.number)} is now your Wrk Phone line${res.attachedToService ? ' and is connected to your messaging service' : ''}.${warn}`);
      nav('/', { replace: true });
    } catch (e: any) { alert(`Purchase failed: ${e.message}`); }
    finally { setBuying(null); }
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Pick your number</h2>
          <div className="sub">
            {current?.isProvisioned
              ? `Current: ${pretty(current.activeNumber!)} — buying a new one replaces it.`
              : 'This becomes your Wrk Phone line for calls, texts, and AI agents.'}
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="setup-search">
          <input
            className="input"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            placeholder="Area code (e.g. 415)"
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button className="btn" onClick={search} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searching && <div className="spinner" style={{ margin: '32px auto', display: 'block' }} />}

        {!searching && results.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            Search an area code to see available numbers.
          </p>
        )}

        <div className="setup-list">
          {results.map((n) => (
            <div key={n.phoneNumber} className="setup-num">
              <div>
                <div className="setup-num-text">{pretty(n.phoneNumber)}</div>
                <div className="setup-num-meta">{n.locality ? `${n.locality}, ` : ''}{n.region}</div>
              </div>
              <button className="btn lime" disabled={!!buying} onClick={() => buy(n)}>
                {buying === n.phoneNumber ? 'Getting…' : 'Get'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
