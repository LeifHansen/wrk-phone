import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function A2P() {
  const [step, setStep] = useState<'desc' | 'review' | 'status'>('desc');
  const [desc, setDesc] = useState('');
  const [pkg, setPkg] = useState<any>(null);
  const [profile, setProfile] = useState<any>({ legalName: '', ein: '', website: '', address: '', email: '', contactName: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    api.a2pStatus().then((s) => { if (s && s.status && s.status !== 'none') { setStatus(s); setStep('status'); } }).catch(() => {});
  }, []);

  const draft = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    try { setPkg(await api.a2pDraft(desc.trim())); setStep('review'); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!profile.legalName || !profile.ein) return alert('Legal business name and EIN are required.');
    setBusy(true);
    try {
      const r = await api.a2pSubmit(profile, pkg);
      setStatus(r); setStep('status');
      // Start the $10/mo business-line subscription.
      const sub = await api.subscribe('a2p');
      if (sub.url) { window.location.href = sub.url; return; }
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-h"><div><h2>Register business line</h2><div className="sub">A2P 10DLC · $10/mo carrier fee (beta: free)</div></div></div>
      <div className="page-body" style={{ maxWidth: 640 }}>
        {step === 'desc' && (
          <div className="cond-card">
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Describe your business and what you'll text people. AI fills out the entire
              carrier registration (the tedious part) — you just review.
            </p>
            <textarea className="textarea" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. We're a 2-person real estate team in Austin. We text leads who fill out our website form about listings and showing times." />
            <button className="btn lg" style={{ marginTop: 12 }} onClick={draft} disabled={busy || !desc.trim()}>
              {busy ? 'Drafting with AI…' : 'Draft registration with AI'}
            </button>
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

            <h3 className="sa-label" style={{ marginTop: 8 }}>YOUR BUSINESS</h3>
            {[['legalName', 'Legal business name *'], ['ein', 'EIN / Tax ID *'], ['website', 'Website'], ['address', 'Business address'], ['email', 'Contact email'], ['contactName', 'Contact name']].map(([k, lbl]) => (
              <label key={k}>{lbl}<input className="input" value={profile[k] || ''} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} /></label>
            ))}
            <button className="btn lg" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit registration'}</button>
          </div>
        )}

        {step === 'status' && status && (
          <div className="cond-card">
            <div className="opt-hero" style={{ background: status.status === 'approved' ? 'var(--lime)' : 'var(--yellow)' }}>
              <h2 style={{ margin: 0 }}>{String(status.status || '').toUpperCase()}</h2>
              <p style={{ margin: '8px 0 0' }}>{status.note}</p>
            </div>
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
