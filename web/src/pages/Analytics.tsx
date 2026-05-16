import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Analytics() {
  const [a, setA] = useState<any>(null);
  useEffect(() => { api.analytics().then(setA).catch(() => {}); }, []);

  if (!a) return <div className="page-body"><p style={{ color: 'var(--muted)' }}>Loading analytics…</p></div>;

  const cell = (label: string, value: any) => (
    <div className="stat-cell"><div className="sv">{value}</div><div className="sk">{label}</div></div>
  );

  return (
    <>
      <div className="page-h"><div><h2>Analytics</h2><div className="sub">Last 30 days</div></div></div>
      <div className="page-body">
        <h3 className="sa-label">MESSAGES</h3>
        <div className="stat-strip">
          {cell('Sent', a.messages.outbound)}
          {cell('Delivered', a.messages.delivered)}
          {cell('Received', a.messages.inbound)}
          {cell('Failed', a.messages.failed)}
        </div>

        <h3 className="sa-label" style={{ marginTop: 20 }}>CALLS</h3>
        <div className="stat-strip">
          {cell('Total', a.calls.total)}
          {cell('Inbound', a.calls.inbound)}
          {cell('Outbound', a.calls.outbound)}
          {cell('Minutes', a.calls.minutes)}
        </div>

        <h3 className="sa-label" style={{ marginTop: 20 }}>CAMPAIGNS</h3>
        {a.campaigns.length === 0 && <p style={{ color: 'var(--muted)' }}>No campaigns yet.</p>}
        {a.campaigns.map((c: any) => (
          <div key={c.id} className="camp-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="meta">{c.channel.toUpperCase()} · {c.sent_count}/{c.total_count} sent</div>
            </div>
            <span className={`camp-status ${c.status}`}>{c.status}</span>
          </div>
        ))}

        {a.note && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>{a.note}</p>}
      </div>
    </>
  );
}
