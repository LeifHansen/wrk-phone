import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Logo } from '../components/Logo';

export function Login({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  // Signup requires explicit, opt-in acknowledgement of the Terms of
  // Service and Privacy Policy — the Sign-up button is disabled until
  // this is true, so the click itself is the affirmative legal act.
  const [agreedTos, setAgreedTos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (mode === 'signup' && !agreedTos) {
      setErr('Please agree to the Terms of Service and Privacy Policy to create an account.');
      return;
    }
    setBusy(true); setErr('');
    try {
      const r = mode === 'login' ? await api.login(email, pw) : await api.signup(email, pw);
      auth.token = r.token;
      if (mode === 'signup') {
        // Auto-assign a shared-pool number so new users never pick one.
        await api.claimNumber().catch(() => {});
      }
      nav(mode === 'signup' ? '/welcome' : '/', { replace: true });
    } catch (e: any) {
      setErr(String(e.message || e).replace(/^\d+\s*/, ''));
    } finally { setBusy(false); }
  };

  const disableSubmit = busy || !email || !pw || (mode === 'signup' && !agreedTos);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="cond-card" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ marginBottom: 14 }}><Logo size="lg" /></div>
        <div style={{ color: 'var(--muted)', marginBottom: 18 }}>
          {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
        </div>
        <input className="input" placeholder="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
        <input className="input" placeholder="password (8+ chars)" type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />

        {mode === 'signup' && (
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 12,
            background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 8,
            fontSize: 13, lineHeight: 1.45, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={agreedTos}
              onChange={(e) => setAgreedTos(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
            <span>
              I have read and agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800 }}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800 }}>
                Privacy Policy
              </Link>.
            </span>
          </label>
        )}

        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button className="btn lg" style={{ width: '100%', marginTop: 16 }} onClick={submit} disabled={disableSubmit}>
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }}
          onClick={() => { setErr(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8, color: 'var(--muted)' }}
          onClick={() => nav('/', { replace: true })}>
          Continue without an account
        </button>
      </div>
    </div>
  );
}
