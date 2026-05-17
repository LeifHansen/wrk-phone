import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureDevice } from '../lib/voice';
import { api, auth } from '../lib/api';
import { toast } from '../components/Toast';

// Dev diagnostics (webhook plumbing, raw connection state) are hidden from
// normal users. Toggle by running `localStorage.wrk_dev = '1'` in the console.
const DEV = typeof localStorage !== 'undefined' && localStorage.getItem('wrk_dev') === '1';

export function Settings() {
  const [serverOk, setServerOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [voiceOk, setVoiceOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [hook, setHook] = useState<any>(null);
  const [repairing, setRepairing] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [line, setLine] = useState<{ activeNumber: string | null } | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [genning, setGenning] = useState(false);
  const [subs, setSubs] = useState<any[]>([]);
  const [me, setMe] = useState<{ email: string | null; authenticated: boolean } | null>(null);
  const nav = useNavigate();

  const loadHook = () => api.webhookStatus().then(setHook).catch(() => setHook(null));

  useEffect(() => {
    fetch('/health').then((r) => setServerOk(r.ok ? 'ok' : 'fail')).catch(() => setServerOk('fail'));
    api.credits().then((c) => setCredits(c.balance)).catch(() => {});
    api.activeNumber().then(setLine).catch(() => {});
    api.account().then((a) => setAvatar(a.avatarUrl)).catch(() => {});
    api.billingSubs().then((b) => setSubs(b.subscriptions || [])).catch(() => {});
    api.me().then(setMe).catch(() => {});
    if (DEV) loadHook();
  }, []);

  const genAvatar = async () => {
    setGenning(true);
    try { const r = await api.genAvatar('account'); setAvatar(r.url); }
    catch (e: any) { toast(e.message, 'err'); } finally { setGenning(false); }
  };

  const reRegister = async () => {
    setVoiceOk('?');
    try { await ensureDevice('demo'); setVoiceOk('ok'); }
    catch { setVoiceOk('fail'); }
  };

  const repair = async () => {
    setRepairing(true);
    try {
      const r = await api.repairWebhooks();
      toast(r.warnings?.length ? `⚠️ ${r.warnings.join('\n\n⚠️ ')}` : 'Line repaired — calls & texts should work now.', 'err');
      loadHook();
    } catch (e: any) { toast(`Repair failed: ${e.message}`, 'err'); }
    finally { setRepairing(false); }
  };

  const dot = (s: string) => s === 'ok' ? '●' : s === 'fail' ? '✕' : '○';

  return (
    <>
      <div className="page-h"><div><h2>Admin</h2><div className="sub">Your account & business line</div></div></div>
      <div className="page-body">
        <div className="set-section">
          <h3>ACCOUNT</h3>
          <div className="set-card">
            <Row label="Signed in as">
              {me?.authenticated
                ? <span>{me.email}</span>
                : <Link to="/login" style={{ color: 'var(--neon)' }}>Log in / Sign up</Link>}
            </Row>
            {me?.authenticated && (
              <button className="btn ghost" style={{ margin: '8px 0' }}
                onClick={() => { auth.token = null; nav('/login'); }}>Log out</button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' }}>
              {avatar
                ? <img src={avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: 'var(--border)', objectFit: 'cover' }} />
                : <div style={{ width: 64, height: 64, borderRadius: '50%', border: 'var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>}
              <button className="btn pink" onClick={genAvatar} disabled={genning}>
                {genning ? 'Generating…' : '✨ Generate AI avatar'}
              </button>
            </div>
          </div>
        </div>

        <div className="set-section">
          <h3>BUSINESS LINE</h3>
          <div className="set-card">
            <Row label="Your number"><span>{line?.activeNumber || '—'}</span></Row>
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>
              Register your business to send marketing & high-volume texts without
              carrier filtering (A2P 10DLC). We automate the whole filing.
            </p>
            <Link to="/a2p" className="btn lg" style={{ display: 'inline-block', textDecoration: 'none', margin: '8px 0' }}>
              Register business line
            </Link>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>$10/mo carrier fee (added later — free during beta)</div>
          </div>
        </div>

        <div className="set-section">
          <h3>NUMBERS</h3>
          <div className="set-card">
            <Row label="Active"><span>{line?.activeNumber || '—'}</span></Row>
            <Link to="/numbers" className="btn" style={{ display: 'inline-block', textDecoration: 'none', margin: '8px 0' }}>
              Manage / add numbers
            </Link>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>Extra numbers $2/mo each</div>
          </div>
        </div>

        <div className="set-section">
          <h3>SUBSCRIPTIONS</h3>
          <div className="set-card">
            {subs.length === 0 && <Row label="Active plans"><span>None</span></Row>}
            {subs.map((s, i) => (
              <Row key={i} label={s.plan === 'a2p' ? 'Business line · $10/mo' : `Number ${s.ref || ''} · $2/mo`}>
                <span>{String(s.status).toUpperCase()}</span>
              </Row>
            ))}
          </div>
        </div>

        <div className="set-section">
          <h3>CREDITS</h3>
          <div className="set-card">
            <Row label="Balance"><span>{credits == null ? '…' : `${credits} credits`}</span></Row>
            <Row label="Rates"><span style={{ fontSize: 12 }}>SMS 1/segment · MMS 3</span></Row>
            <Link className="btn" to="/credits" style={{ display: 'inline-block', margin: '8px 0', textDecoration: 'none' }}>Buy credits</Link>
          </div>
        </div>

        <div className="set-section">
          <h3>ABOUT</h3>
          <div className="set-card">
            <Row label="Version"><span>0.2.0</span></Row>
            <Row label="Stack"><span>Twilio · OpenAI</span></Row>
          </div>
        </div>

        <div className="set-section">
          <h3>SUPERADMIN</h3>
          <div className="set-card">
            <Row label="Blog agent"><span style={{ fontSize: 12 }}>SEO posts, content & stats</span></Row>
            <Link className="btn" to="/superadmin" style={{ display: 'inline-block', margin: '8px 0', textDecoration: 'none' }}>
              Open superadmin
            </Link>
          </div>
        </div>

        {DEV && (
          <>
            <div className="set-section">
              <h3>⚙ DEV · INBOUND ROUTING</h3>
              <div className="set-card">
                <Row label="Public URL"><code>{hook?.publicBaseUrl || '—'}</code></Row>
                <Row label="Reachable">
                  <span style={{ color: hook?.reachable ? 'var(--ink)' : 'var(--red)' }}>
                    {hook ? (hook.reachable ? 'YES' : 'NO') : '…'}
                  </span>
                </Row>
                <Row label="Inbound / Outbound">
                  <span>{hook ? `${hook.inboundOk ? 'OK' : 'X'} / ${hook.outboundOk ? 'OK' : 'X'}` : '…'}</span>
                </Row>
                {hook?.hint && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '10px 0' }}>{hook.hint}</div>}
                <button className="btn" onClick={repair} disabled={repairing} style={{ margin: '12px 0' }}>
                  {repairing ? 'Repairing…' : 'Repair webhooks'}
                </button>
              </div>
            </div>
            <div className="set-section">
              <h3>⚙ DEV · CONNECTION</h3>
              <div className="set-card">
                <Row label="API server"><span>{dot(serverOk)} /api</span></Row>
                <Row label="Browser softphone"><span>{dot(voiceOk)} Twilio Voice JS</span></Row>
                <button className="btn ghost" onClick={reRegister} style={{ margin: '12px 0' }}>Register browser softphone</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--muted)', textAlign: 'right', wordBreak: 'break-all' }}>{children}</div>
    </div>
  );
}
