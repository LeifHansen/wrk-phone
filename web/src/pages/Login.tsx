import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Logo } from '../components/Logo';

export function Login({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = mode === 'login' ? await api.login(email, pw) : await api.signup(email, pw);
      auth.token = r.token;
      nav(mode === 'signup' ? '/welcome' : '/', { replace: true });
    } catch (e: any) {
      setErr(String(e.message || e).replace(/^\d+\s*/, ''));
    } finally { setBusy(false); }
  };

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
        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button className="btn lg" style={{ width: '100%', marginTop: 16 }} onClick={submit} disabled={busy || !email || !pw}>
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
