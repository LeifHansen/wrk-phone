import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

// 10DLC onboarding wizard. Sole proprietor is the live path (no EIN, mobile
// OTP identity). Standard/registered business is scaffolded — the option is
// visible but disabled so the flow is ready to light up later.
type BrandType = 'sole_prop' | 'standard';
type Step = 'type' | 'identity' | 'business' | 'review' | 'status';

const STEPS: { id: Step; label: string }[] = [
  { id: 'type', label: 'Brand type' },
  { id: 'identity', label: 'Your identity' },
  { id: 'business', label: 'Your business' },
  { id: 'review', label: 'Review' },
];

const emptyProfile = {
  brandType: 'sole_prop' as BrandType,
  firstName: '', lastName: '', mobilePhone: '', email: '',
  address: '', website: '',
  legalName: '', ein: '', contactName: '',
};

export function A2P() {
  const [step, setStep] = useState<Step>('type');
  const [profile, setProfile] = useState<any>({ ...emptyProfile });
  const [desc, setDesc] = useState('');
  const [pkg, setPkg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    api.a2pStatus()
      .then((s) => { if (s && s.status && s.status !== 'none') { setStatus(s); setStep('status'); } })
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setProfile((p: any) => ({ ...p, [k]: v }));

  const draft = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    try { setPkg(await api.a2pDraft(desc.trim())); setStep('review'); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.a2pSubmit(profile, pkg);
      setStatus(r); setStep('status');
      const sub = await api.subscribe('a2p');
      if (sub.url) { window.location.href = sub.url; return; }
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const identityValid = profile.brandType === 'standard'
    ? profile.legalName && profile.ein
    : profile.firstName && profile.lastName && profile.mobilePhone && profile.email;

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Register your business line</h2>
          <div className="sub">A2P 10DLC · required by US carriers to text from a business number</div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 660 }}>
        {step !== 'status' && (
          <div className="wiz-steps">
            {STEPS.map((s, i) => (
              <div key={s.id} className={'wiz-step' + (i === stepIdx ? ' on' : '') + (i < stepIdx ? ' done' : '')}>
                <span className="wiz-dot">{i < stepIdx ? '✓' : i + 1}</span>
                <span className="wiz-lbl">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {step === 'type' && (
          <div className="cond-card" style={{ display: 'grid', gap: 12 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Pick how your business is set up. Most solo operators and freelancers
              are sole proprietors — it's the fastest path and needs no EIN.
            </p>
            <button
              className={'brand-opt' + (profile.brandType === 'sole_prop' ? ' on' : '')}
              onClick={() => set('brandType', 'sole_prop')}>
              <div className="brand-opt-h">
                <strong>Sole proprietor</strong>
                {profile.brandType === 'sole_prop' && <span className="badge">Selected</span>}
              </div>
              <div className="brand-opt-d">
                Just you / a personal business. No EIN — verified by a one-time
                code texted to your mobile. Lower volume, fastest approval.
              </div>
            </button>
            <button className="brand-opt disabled" disabled title="Coming soon">
              <div className="brand-opt-h">
                <strong>Standard / registered business</strong>
                <span className="badge muted">Coming soon</span>
              </div>
              <div className="brand-opt-d">
                LLC, corporation, or nonprofit with an EIN. Higher throughput and
                multiple campaigns. Ask us to enable this for your account.
              </div>
            </button>
            <button className="btn lg" onClick={() => setStep('identity')}>Continue</button>
          </div>
        )}

        {step === 'identity' && (
          <div className="cond-card" style={{ display: 'grid', gap: 10 }}>
            {profile.brandType === 'sole_prop' ? (
              <>
                <h3 className="sa-label">YOUR IDENTITY (sole proprietor)</h3>
                <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
                  Carriers verify a real person. We text a one-time code to your
                  mobile during submission — use a number you can receive texts on.
                </p>
                <div className="wiz-row">
                  <label>First name *<input className="input" value={profile.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
                  <label>Last name *<input className="input" value={profile.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
                </div>
                <label>Mobile phone (for OTP) *<input className="input" value={profile.mobilePhone} onChange={(e) => set('mobilePhone', e.target.value)} placeholder="+15125550123" /></label>
                <label>Email *<input className="input" value={profile.email} onChange={(e) => set('email', e.target.value)} /></label>
                <label>Mailing address<input className="input" value={profile.address} onChange={(e) => set('address', e.target.value)} /></label>
              </>
            ) : (
              <>
                <h3 className="sa-label">YOUR BUSINESS ENTITY</h3>
                <label>Legal business name *<input className="input" value={profile.legalName} onChange={(e) => set('legalName', e.target.value)} /></label>
                <label>EIN / Tax ID *<input className="input" value={profile.ein} onChange={(e) => set('ein', e.target.value)} /></label>
                <label>Contact name<input className="input" value={profile.contactName} onChange={(e) => set('contactName', e.target.value)} /></label>
                <label>Email<input className="input" value={profile.email} onChange={(e) => set('email', e.target.value)} /></label>
              </>
            )}
            <div className="wiz-nav">
              <button className="btn ghost" onClick={() => setStep('type')}>Back</button>
              <button className="btn lg" onClick={() => setStep('business')} disabled={!identityValid}>Continue</button>
            </div>
          </div>
        )}

        {step === 'business' && (
          <div className="cond-card" style={{ display: 'grid', gap: 10 }}>
            <h3 className="sa-label">WHAT WILL YOU TEXT PEOPLE?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
              One paragraph. AI fills the tedious carrier campaign form — you just review it next.
            </p>
            <textarea className="textarea" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. I'm a solo house cleaner in Austin. I text clients who book through my website to confirm appointments and send reminders." />
            <label>Website (optional)<input className="input" value={profile.website} onChange={(e) => set('website', e.target.value)} /></label>
            <div className="wiz-nav">
              <button className="btn ghost" onClick={() => setStep('identity')}>Back</button>
              <button className="btn lg" onClick={draft} disabled={busy || !desc.trim()}>
                {busy ? 'Drafting with AI…' : 'Draft campaign with AI'}
              </button>
            </div>
          </div>
        )}

        {step === 'review' && pkg && (
          <div className="cond-card" style={{ display: 'grid', gap: 10 }}>
            <h3 className="sa-label">AI-DRAFTED CAMPAIGN (editable)</h3>
            <label>Vertical<input className="input" value={pkg.vertical || ''} onChange={(e) => setPkg({ ...pkg, vertical: e.target.value })} /></label>
            <label>Use case<input className="input" value={pkg.useCaseCategory || ''} onChange={(e) => setPkg({ ...pkg, useCaseCategory: e.target.value })} /></label>
            <label>Campaign description<textarea className="textarea" value={pkg.campaignDescription || ''} onChange={(e) => setPkg({ ...pkg, campaignDescription: e.target.value })} /></label>
            <label>Sample 1<input className="input" value={pkg.messageSamples?.[0] || ''} onChange={(e) => setPkg({ ...pkg, messageSamples: [e.target.value, pkg.messageSamples?.[1] || ''] })} /></label>
            <label>Sample 2<input className="input" value={pkg.messageSamples?.[1] || ''} onChange={(e) => setPkg({ ...pkg, messageSamples: [pkg.messageSamples?.[0] || '', e.target.value] })} /></label>
            <label>Opt-in flow<input className="input" value={pkg.messageFlow || ''} onChange={(e) => setPkg({ ...pkg, messageFlow: e.target.value })} /></label>
            <div className="wiz-nav">
              <button className="btn ghost" onClick={() => setStep('business')}>Back</button>
              <button className="btn lg" onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit registration'}
              </button>
            </div>
          </div>
        )}

        {step === 'status' && status && (
          <div className="cond-card">
            <div className="opt-hero" style={{ background: status.status === 'approved' ? 'var(--lime)' : 'var(--yellow)' }}>
              <h2 style={{ margin: 0 }}>{String(status.status || '').toUpperCase()}</h2>
              <p style={{ margin: '8px 0 0' }}>{status.note}</p>
            </div>

            {/* OTP entry — only renders when Twilio is waiting for the
                verification code we just texted to the user's mobile. */}
            {status.status === 'otp_pending' && <OtpStep onVerified={(s) => setStatus(s)} />}

            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
              Carrier vetting is async (hours–days). This page auto-refreshes the status.
            </p>
            <button className="btn ghost" onClick={() => api.a2pStatus().then(setStatus)}>Refresh status</button>
          </div>
        )}
      </div>
    </>
  );
}

// OTP entry sub-step. Twilio texts a 4–8 digit code to the mobile the user
// submitted on the registration form; this component takes that code,
// verifies it, and updates the parent's status on success.
function OtpStep({ onVerified }: { onVerified: (status: any) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.a2pVerifyOtp(code.trim());
      if (!r.ok) { setErr(r.note || 'OTP rejected'); return; }
      // Re-pull the registration so the banner flips to in_review.
      const fresh = await api.a2pStatus();
      onVerified(fresh);
    } catch (e: any) {
      setErr(e.message || 'verify failed');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 14, padding: 14, background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 8 }}>
      <div className="sa-label">ENTER THE CODE TWILIO TEXTED YOU</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="123456" inputMode="numeric" maxLength={8} style={{ flex: 1 }} />
        <button className="btn lime" onClick={submit} disabled={busy || !/^\d{4,8}$/.test(code.trim())}>
          {busy ? '…' : 'Verify'}
        </button>
      </div>
      {err && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{err}</p>}
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
        Didn't receive it? Resubmit the form to retry — Twilio re-sends.
      </p>
    </div>
  );
}
