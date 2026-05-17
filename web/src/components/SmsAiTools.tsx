import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from './Toast';

type Lint = Awaited<ReturnType<typeof api.smsLint>>;

// Carrier-deliverability helper: "Check filtering" runs an AI + heuristic
// lint that flags words likely to be blocked by US carriers, and
// "Optimize with AI" rewrites the message carrier-safe. Used by the SMS
// composer and the campaign builder.
export function SmsAiTools({
  text, goal, onApply, compact = false,
}: {
  text: string;
  goal?: string;
  onApply: (optimized: string) => void;
  compact?: boolean;
}) {
  const [lint, setLint] = useState<Lint | null>(null);
  const [busy, setBusy] = useState<'lint' | 'opt' | null>(null);
  const disabled = !text.trim() || !!busy;

  const check = async () => {
    setBusy('lint');
    try { setLint(await api.smsLint(text.trim())); }
    catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(null); }
  };

  const optimize = async () => {
    setBusy('opt');
    try {
      const r = await api.smsOptimize(text.trim(), goal);
      onApply(r.optimized);
      toast(r.notes ? `Optimized — ${r.notes}` : 'Message optimized for deliverability');
      setLint(null);
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(null); }
  };

  const sevColor = (s: string) =>
    s === 'high' ? 'var(--red)' : s === 'medium' ? 'var(--orange)' : 'var(--muted)';

  return (
    <div className="sms-ai">
      <div className="sms-ai-row">
        <button type="button" className="btn ghost sms-ai-btn" onClick={check} disabled={disabled}
          title="Check for words carriers may block">
          {busy === 'lint' ? 'Checking…' : '🛡 Check filtering'}
        </button>
        <button type="button" className="btn lime sms-ai-btn" onClick={optimize} disabled={disabled}
          title="Rewrite carrier-safe with AI">
          {busy === 'opt' ? 'Optimizing…' : '✨ Optimize with AI'}
        </button>
      </div>

      {lint && (
        <div className="sms-ai-report" style={{ borderColor: sevColor(lint.risk) }}>
          <div className="sms-ai-head">
            <span className="sms-ai-risk" style={{ background: sevColor(lint.risk) }}>
              {lint.risk.toUpperCase()} RISK
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lint.summary}</span>
            <button type="button" className="sms-ai-x" onClick={() => setLint(null)} aria-label="Dismiss">×</button>
          </div>
          {lint.flags.length > 0 && (
            <ul className="sms-ai-flags">
              {lint.flags.map((f, i) => (
                <li key={i}>
                  <code style={{ color: sevColor(f.severity) }}>{f.term}</code> — {f.why}
                </li>
              ))}
            </ul>
          )}
          {lint.degraded && !compact && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              (AI unavailable — heuristic check only)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
