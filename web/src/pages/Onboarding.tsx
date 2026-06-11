import { useState } from 'react';
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
  const [areaCode, setAreaCode] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [number, setNumber] = useState<string | null>(null);

  const provision = async () => {
    const ac = areaCode.trim();
    if (!/^[2-9]\d{2}$/.test(ac)) { toast('Enter a 3-digit area code (e.g. 415).', 'err'); return; }
    setProvisioning(true);
    try {
      const r = await api.provisionNumber(ac);
      setNumber(r.number);
      toast(r.alreadyHad ? 'You already have a number ✓' : `${pretty(r.number)} is yours ✓`);
      setStep(2);
    } catch (e: any) {
      // Most common: no inventory in that area code — let them try another.
      toast(e.message || 'Could not get a number — try another area code.', 'err');
    } finally { setProvisioning(false); }
  };

  const Dots = () => (
    <div className="ob-dots">{[0,1,2].map(i => <span key={i} className={'ob-dot' + (i === step ? ' on' : '')} />)}</div>
  );

  return (
    <div className="ob-wrap">
      <div className="ob-card">
        <Logo size="lg" />
        <Dots />

        {step === 0 && (
          <>
            <h2 className="ob-h">Welcome aboard.</h2>
            <p className="ob-p">WrkPhn is your work line — calls, texts, and AI agents. Quick 60-second setup.</p>
            <button className="btn lg" style={{ width: '100%' }} onClick={() => setStep(1)}>Get started</button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="ob-h">Pick your area code</h2>
            <p className="ob-p">
              We'll get you a local number in the area code you want. It's
              pre-registered on our approved carrier campaign (A2P 10DLC), so
              you can call and text from it right away — no paperwork.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="Area code (e.g. 415)"
                inputMode="numeric"
                maxLength={3}
                value={areaCode}
                autoFocus
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !provisioning) provision(); }}
                style={{ flex: 1 }}
              />
              <button className="btn lime" onClick={provision} disabled={provisioning}>
                {provisioning ? 'Getting your number…' : 'Get my number'}
              </button>
            </div>
            <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setStep(2)} disabled={provisioning}>
              Skip for now — use the shared line
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="ob-h">You're ready 🎉</h2>
            <p className="ob-p">
              {number
                ? <><b>{pretty(number)}</b> is your work line — calls and texts you send show this number, and replies land in your inbox. </>
                : <>You're on the shared line for now — you can grab your own local number anytime from the <b>Work line</b> page. </>}
              Set up an AI agent to text on your behalf, or jump straight in.
            </p>
            <button className="btn lg" style={{ width: '100%' }} onClick={() => nav('/agents/new', { replace: true })}>Create an AI agent</button>
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => nav('/', { replace: true })}>Go to the app</button>
          </>
        )}
      </div>
    </div>
  );
}
