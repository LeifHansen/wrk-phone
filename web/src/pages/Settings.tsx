import { useEffect, useState } from 'react';
import { ensureDevice } from '../lib/voice';
import { api } from '../lib/api';

export function Settings() {
  const [serverOk, setServerOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [voiceOk, setVoiceOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [hook, setHook] = useState<any>(null);
  const [repairing, setRepairing] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  const loadHook = () => api.webhookStatus().then(setHook).catch(() => setHook(null));

  useEffect(() => {
    fetch('/health').then((r) => setServerOk(r.ok ? 'ok' : 'fail')).catch(() => setServerOk('fail'));
    loadHook();
    api.credits().then((c) => setCredits(c.balance)).catch(() => {});
  }, []);

  const reRegister = async () => {
    setVoiceOk('?');
    try { await ensureDevice('demo'); setVoiceOk('ok'); }
    catch { setVoiceOk('fail'); }
  };

  const repair = async () => {
    setRepairing(true);
    try {
      const r = await api.repairWebhooks();
      alert(
        `Webhooks repaired for ${r.number}.\n\nVoice → ${r.webhooks.voiceUrl}\nSMS → ${r.webhooks.smsUrl}` +
        (r.warnings?.length ? `\n\n⚠️ ${r.warnings.join('\n\n⚠️ ')}` : '\n\nInbound should now arrive in your inbox.')
      );
      loadHook();
    } catch (e: any) { alert(`Repair failed: ${e.message}`); }
    finally { setRepairing(false); }
  };

  const dot = (s: string) => s === 'ok' ? '●' : s === 'fail' ? '✕' : '○';

  return (
    <>
      <div className="page-h"><h2>Config</h2></div>
      <div className="page-body">
        <div className="set-section">
          <h3>INBOUND ROUTING</h3>
          <div className="set-card">
            <Row label="Public URL">
              <code>{hook?.publicBaseUrl || '—'}</code>
            </Row>
            <Row label="Reachable by Twilio">
              <span style={{ color: hook?.reachable ? 'var(--ink)' : 'var(--red)' }}>
                {hook ? (hook.reachable ? 'YES' : 'NO — inbound blocked') : '…'}
              </span>
            </Row>
            <Row label="SMS inbound wired">
              <span>{hook ? (hook.ok ? 'OK' : 'NEEDS REPAIR') : '…'}</span>
            </Row>
            {hook?.hint && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '10px 0' }}>{hook.hint}</div>}
            <button className="btn" onClick={repair} disabled={repairing} style={{ margin: '12px 0' }}>
              {repairing ? 'Repairing…' : 'Repair inbound webhooks'}
            </button>
          </div>
        </div>

        <div className="set-section">
          <h3>CONNECTION</h3>
          <div className="set-card">
            <Row label="API server"><span>{dot(serverOk)} /api</span></Row>
            <Row label="Browser softphone"><span>{dot(voiceOk)} Twilio Voice JS</span></Row>
            <button className="btn ghost" onClick={reRegister} style={{ margin: '12px 0' }}>Register browser softphone</button>
          </div>
        </div>

        <div className="set-section">
          <h3>CREDITS</h3>
          <div className="set-card">
            <Row label="Balance"><span>{credits == null ? '…' : `${credits} credits`}</span></Row>
            <Row label="Rates"><span style={{ fontSize: 12 }}>SMS 1/segment · MMS 3</span></Row>
            <a className="btn" href="/credits" style={{ display: 'inline-block', margin: '12px 0', textDecoration: 'none' }}>Buy credits</a>
          </div>
        </div>

        <div className="set-section">
          <h3>ABOUT</h3>
          <div className="set-card">
            <Row label="Version"><span>0.1.0</span></Row>
            <Row label="Stack"><span>Vite · Twilio · OpenAI</span></Row>
          </div>
        </div>
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
