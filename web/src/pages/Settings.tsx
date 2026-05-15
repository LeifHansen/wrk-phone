import { useEffect, useState } from 'react';
import { ensureDevice } from '../lib/voice';

export function Settings() {
  const [serverOk, setServerOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [voiceOk, setVoiceOk] = useState<'?' | 'ok' | 'fail'>('?');

  useEffect(() => {
    fetch('/health').then((r) => setServerOk(r.ok ? 'ok' : 'fail')).catch(() => setServerOk('fail'));
  }, []);

  const reRegister = async () => {
    setVoiceOk('?');
    try { await ensureDevice('demo'); setVoiceOk('ok'); }
    catch { setVoiceOk('fail'); }
  };

  const dot = (s: string) => s === 'ok' ? '🟢' : s === 'fail' ? '🔴' : '⚪';

  return (
    <>
      <div className="page-h"><h2>Settings</h2></div>
      <div className="page-body">
        <Section title="Connection">
          <Row label="API server"><span>{dot(serverOk)} /api</span></Row>
          <Row label="Browser softphone"><span>{dot(voiceOk)} Twilio Voice JS SDK</span></Row>
          <button className="btn" onClick={reRegister}>Register browser softphone</button>
        </Section>
        <Section title="Phone Line">
          <Row label="Number"><span>Set TWILIO_DEFAULT_FROM_NUMBER on server</span></Row>
          <Row label="Inbound webhook"><code>/api/voice/inbound</code></Row>
          <Row label="SMS webhook"><code>/api/sms/inbound</code></Row>
        </Section>
        <Section title="About">
          <Row label="Version"><span>0.1.0</span></Row>
          <Row label="Stack"><span>Vite · Twilio · OpenAI</span></Row>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      <div style={{ background: 'var(--bg-subtle)', borderRadius: 12, padding: '4px 16px' }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
      <div>{label}</div>
      <div style={{ color: 'var(--muted)' }}>{children}</div>
    </div>
  );
}
