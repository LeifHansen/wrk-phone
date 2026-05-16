import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { toast } from '../components/Toast';

function pretty(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [pool, setPool] = useState<any>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => { api.listNumbers().then(setPool).catch(() => {}); }, []);

  const choose = async (sid: string, phone: string) => {
    try { await api.setActiveNumber(sid); setChosen(phone); toast('Number selected ✓'); setStep(2); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  const Dots = () => (
    <div className="ob-dots">{[0,1,2,3].map(i => <span key={i} className={'ob-dot' + (i === step ? ' on' : '')} />)}</div>
  );

  return (
    <div className="ob-wrap">
      <div className="ob-card">
        <Logo size="lg" />
        <Dots />

        {step === 0 && (
          <>
            <h2 className="ob-h">Welcome aboard.</h2>
            <p className="ob-p">WorkPhone is your team's shared work line — calls, texts, and AI agents. Quick 60-second setup.</p>
            <button className="btn lg" style={{ width: '100%' }} onClick={() => setStep(1)}>Get started</button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="ob-h">Pick your line</h2>
            <p className="ob-p">Choose a number from the shared pool. Outbound calls & texts show this number. You can swap anytime.</p>
            <div className="setup-list" style={{ maxHeight: 280, overflow: 'auto' }}>
              {!pool && <div className="spinner" style={{ margin: '20px auto', display: 'block' }} />}
              {pool?.numbers?.map((n: any) => (
                <div key={n.sid} className="setup-num">
                  <div><div className="setup-num-text">{pretty(n.phoneNumber)}</div>
                    <div className="setup-num-meta">{n.isActive ? '★ current' : 'shared pool'}</div></div>
                  <button className="btn lime" onClick={() => choose(n.sid, n.phoneNumber)}>Use this</button>
                </div>
              ))}
              {pool && (!pool.numbers || pool.numbers.length === 0) && (
                <p className="ob-p">No numbers in the pool yet — an admin can add one. You can do this later.</p>
              )}
            </div>
            <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setStep(2)}>Skip for now</button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="ob-h">Business registration</h2>
            <p className="ob-p">
              {chosen ? <>You're set to send from <b>{pretty(chosen)}</b>. </> : ''}
              To send marketing & high-volume texts without carrier filtering you'll register
              for <b>10DLC</b>. That flow is coming soon — for now the shared pool works for normal use.
            </p>
            <div className="cond-card" style={{ color: 'var(--muted)', fontSize: 13 }}>
              🔒 10DLC registration & buying your own number unlock in a future update.
            </div>
            <button className="btn lg" style={{ width: '100%', marginTop: 12 }} onClick={() => setStep(3)}>Continue</button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="ob-h">You're ready 🎉</h2>
            <p className="ob-p">Set up an AI agent to text on your behalf, or jump straight in.</p>
            <button className="btn lg" style={{ width: '100%' }} onClick={() => nav('/agents/new', { replace: true })}>Create an AI agent</button>
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => nav('/', { replace: true })}>Go to the app</button>
          </>
        )}
      </div>
    </div>
  );
}
