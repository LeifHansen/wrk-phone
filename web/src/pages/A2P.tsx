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

  // Subscribe to the matching tier FIRST — sole_prop=$5/mo, a2p=$10/mo.
  // /a2p/submit is gated on an active subscription, so calling it BEFORE
  // checkout gives the user a 402 the first time they try. Subscribe
  // first; if Stripe returns a real Checkout URL we redirect there and
  // the user lands on /admin?sub=1 post-payment to re-submit. If Stripe
  // is in dev/stub mode (no real key configured) we get an immediate
  // {url:null, status:'dev'} response and can submit the package inline.
  const submit = async () => {
    setBusy(true);
    try {
      const planId = profile.brandType === 'standard' ? 'a2p' : 'sole_prop';
      const sub = await api.subscribe(planId);
      if (sub.url) { window.location.href = sub.url; return; }
      // dev / stub Stripe path — subscription is already recorded, finish
      // the registration synchronously.
      const r = await api.a2pSubmit(profile, pkg);
      setStatus(r); setStep('status');
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
          <div className="sub">
            Pick a tier · the shared pool number stays free for low-volume / pay-as-you-go use
          </div>
        </div>
      </div>

      {/* Don't set maxWidth on .page-body — the desktop styles in styles.css
          already cap content at 1080px via padding-inline. An additional
          inline maxWidth collapses the visible area on wide screens because
          the parent's padding subtracts inside the capped box. The wizard
          itself uses .cond-card which keeps a readable line length naturally. */}
      <div className="page-body">
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
              Two paid tiers — both unlock buying your own number + better
              deliverability. <strong>You don't have to register at all</strong> if
              you're fine on the free shared-pool number paying per text.
            </p>

            {/* TIER 1 — cheaper Sole Proprietor */}
            <button
              className={'brand-opt' + (profile.brandType === 'sole_prop' ? ' on' : '')}
              onClick={() => set('brandType', 'sole_prop')}>
              <div className="brand-opt-h">
                <strong>Sole Proprietor</strong> <span style={{ opacity: 0.7 }}>· $5/mo · $5 setup</span>
                {profile.brandType === 'sole_prop' && <span className="badge">Selected</span>}
              </div>
              <div className="brand-opt-d">
                Cheaper tier for solo operators and freelancers. After paying, a
                one-time identity verification step happens in the Twilio Console
                (~5 min — Twilio texts a code to your mobile to confirm you're real).
                Throughput up to ~3,000 messages/day.
              </div>
            </button>

            {/* TIER 2 — premium Business Line A2P */}
            <button
              className={'brand-opt' + (profile.brandType === 'standard' ? ' on' : '')}
              onClick={() => set('brandType', 'standard')}>
              <div className="brand-opt-h">
                <strong>Business Line (A2P 10DLC)</strong> <span style={{ opacity: 0.7 }}>· $10/mo · $15 setup</span>
                {profile.brandType === 'standard' && <span className="badge">Selected</span>}
              </div>
              <div className="brand-opt-d">
                For registered businesses (LLC, corp, nonprofit) with an EIN. Fully
                automated brand + campaign registration via Twilio. Highest
                throughput (~200,000 msgs/day) and best carrier deliverability.
              </div>
            </button>

            {/* Free / pay-as-you-go reminder so the user knows they can skip */}
            <div style={{ background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 8, padding: 12, fontSize: 13 }}>
              <strong>Free / pay-as-you-go:</strong> stay on the shared toll-free
              number. No registration needed. Texts are billed in credits ($5 = 500).
              Best for low volume + ad-hoc use.
            </div>

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
          <StatusCard status={status} pkg={pkg || status.package} onRefresh={() => api.a2pStatus().then(setStatus)} />
        )}
      </div>
    </>
  );
}

// ----- Status card -----
//
// Renders the registration outcome AND, when relevant, the manual-filing
// fallback that's always going to exist for accounts without TrustHub /
// ISV access. The old version rendered just the raw status string in
// the page's script font ("MANUAL" → "manuac" visually) which
// frustrated users into thinking it was a typo. This version:
//   - Uses a plain sans-serif heading for the status word so it's readable
//   - Maps each status to a friendly title + tone (yellow=needs you,
//     lime=done, blue=in progress)
//   - For 'manual': deep-links to the right Twilio Console section AND
//     shows the saved package as copy-paste ready text so the user has
//     everything they need to file in one click
function StatusCard({
  status,
  pkg,
  onRefresh,
}: {
  status: any;
  pkg: any;
  onRefresh: () => void;
}) {
  const s = String(status.status || 'unknown').toLowerCase();
  const tone =
    s === 'approved' || s === 'in_review' ? 'var(--lime)'
    : s === 'manual' || s === 'otp_pending' ? 'var(--yellow)'
    : s === 'rejected' || s === 'failed' ? 'var(--red)'
    : 'var(--blue)';
  const title =
    s === 'approved' ? 'Approved'
    : s === 'in_review' ? 'In review by carriers'
    : s === 'otp_pending' ? 'Verify your mobile'
    : s === 'manual' ? 'File the registration manually'
    : s === 'rejected' ? 'Rejected'
    : s === 'failed' ? 'Submission failed'
    : status.status;
  const isManual = s === 'manual';
  const consoleUrl = 'https://console.twilio.com/us1/develop/messaging/services';
  const regulatoryUrl = 'https://console.twilio.com/us1/develop/sms/regulatory-compliance/profiles';
  return (
    <div className="cond-card">
      <div style={{
        background: tone,
        color: 'var(--ink)',
        padding: '18px 20px',
        border: '2px solid var(--ink)',
        borderRadius: 10,
      }}>
        {/* Plain sans heading so "MANUAL" doesn't look like a typo in the
            page's display script font. */}
        <div style={{ fontFamily: 'var(--pixel)', fontSize: 11, letterSpacing: 1.5, marginBottom: 6 }}>
          STATUS · {s.toUpperCase().replace(/_/g, ' ')}
        </div>
        <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 22, fontWeight: 800 }}>
          {title}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>{status.note}</p>
      </div>

      {/* OTP entry — only renders when Twilio is waiting for the
          verification code we just texted to the user's mobile. */}
      {s === 'otp_pending' && <OtpStep onVerified={(fresh) => onRefresh()} />}

      {/* Manual-filing helper: actionable links + the saved package so
          the user can complete the filing in Twilio Console without
          re-typing anything. */}
      {isManual && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <a className="btn lime" href={regulatoryUrl} target="_blank" rel="noopener noreferrer">
              Open Twilio Regulatory Compliance ↗
            </a>
            <a className="btn ghost" href={consoleUrl} target="_blank" rel="noopener noreferrer">
              Messaging Services ↗
            </a>
          </div>
          {pkg && <PackagePreview pkg={pkg} profile={status.profile} />}
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
            Why manual? Twilio doesn't expose this brand type via API on your account.
            Once you file in the Console, the carrier vet runs in the background (hours–days).
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button className="btn ghost" onClick={onRefresh}>Refresh status</button>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          Carrier vetting is async — hours to days.
        </span>
      </div>
    </div>
  );
}

// Renders the AI-drafted A2P package alongside the user's profile data
// in a copy-friendly layout. Each field has its own copy button so the
// user can fill in the Twilio Console form one click at a time.
function PackagePreview({ pkg, profile }: { pkg: any; profile?: any }) {
  if (!pkg) return null;
  const rows: { label: string; value: string }[] = [
    profile?.legalName && { label: 'Legal name', value: profile.legalName },
    profile?.ein && { label: 'EIN', value: profile.ein },
    profile?.firstName && { label: 'First name', value: profile.firstName },
    profile?.lastName && { label: 'Last name', value: profile.lastName },
    profile?.email && { label: 'Email', value: profile.email },
    profile?.mobilePhone && { label: 'Mobile phone', value: profile.mobilePhone },
    profile?.address && { label: 'Address', value: profile.address },
    profile?.website && { label: 'Website', value: profile.website },
    pkg.vertical && { label: 'Vertical', value: pkg.vertical },
    pkg.useCaseCategory && { label: 'Use case', value: pkg.useCaseCategory },
    pkg.campaignDescription && { label: 'Campaign description', value: pkg.campaignDescription },
    pkg.messageFlow && { label: 'Opt-in flow', value: pkg.messageFlow },
    pkg.helpMessage && { label: 'HELP response', value: pkg.helpMessage },
    pkg.stopMessage && { label: 'STOP response', value: pkg.stopMessage },
  ].filter(Boolean) as { label: string; value: string }[];
  const samples: string[] = Array.isArray(pkg.messageSamples) ? pkg.messageSamples : [];
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast('Copied', 'ok');
    } catch { toast('Could not copy — select and copy manually', 'err'); }
  };
  return (
    <div style={{ background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontFamily: 'system-ui, sans-serif', fontWeight: 800 }}>
          Your saved registration package
        </h3>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>Click any field to copy</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <button key={r.label}
            onClick={() => copy(r.value)}
            style={{
              textAlign: 'left', background: 'var(--surface)', color: 'var(--ink)',
              border: '1px solid var(--border-color, #ccc)', borderRadius: 6, padding: '8px 10px',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.label}</div>
            <div style={{ marginTop: 2, wordBreak: 'break-word' }}>{r.value}</div>
          </button>
        ))}
        {samples.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 0 4px' }}>
              Sample messages
            </div>
            {samples.map((m, i) => (
              <button key={i} onClick={() => copy(m)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'var(--surface)', color: 'var(--ink)',
                  border: '1px solid var(--border-color, #ccc)', borderRadius: 6,
                  padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, marginBottom: 6, wordBreak: 'break-word',
                }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
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
