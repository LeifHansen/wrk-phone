import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Agent } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { toast } from '../components/Toast';
import { SubNav } from '../components/SubNav';
import { SmsAiTools } from '../components/SmsAiTools';
import { LiveCalls } from '../components/LiveCalls';

// Subtabs are identical to the ones on the Agents page so switching between
// "Agents" and "Calls" feels like one section, not two unrelated routes.
const AGENTS_SUBTABS = [
  { to: '/agents',       label: 'Agents', end: true },
  { to: '/agents/calls', label: 'Calls' },
];

interface AgentCallRow {
  id: number;
  name: string;
  script: string;
  status: 'draft' | 'sending' | 'done' | 'failed';
  placed_count: number;
  total_count: number;
  created_at: number;
  agent_name: string | null;
  agent_emoji: string | null;
  agent_color: string | null;
}
interface Segment { id: number; name: string; count: number }

function parseRecipients(raw: string) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [phone, ...rest] = line.split(',').map((s) => s.trim());
    return { phone, name: rest.join(', ') || undefined };
  }).filter((r) => r.phone);
}

type Target = 'all' | 'segment' | 'paste';

export function AgentCalls() {
  const [list, setList] = useState<AgentCallRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showNew, setShowNew] = useState(false);
  // form state
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState<number | null>(null);
  const [script, setScript] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [segId, setSegId] = useState<number | null>(null);
  const [recipientsRaw, setRecipientsRaw] = useState('');
  // Drop-voicemail mode: the agent ONLY leaves a voicemail. If a live human
  // picks up, the call apologizes briefly and hangs up — the user can then
  // try again later (or the recipient calls back to voicemail naturally).
  const [voicemailOnly, setVoicemailOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ campaign: any; recipients: any[] } | null>(null);

  const load = () => {
    api.listAgentCalls().then((r) => setList(r as AgentCallRow[])).catch(() => {});
    api.listSegments().then(setSegments).catch(() => {});
  };
  useEffect(() => {
    api.listAgents().then((a) => setAgents(a.filter((x: any) => !x.hidden))).catch(() => {});
  }, []);
  // Tight 4s poll only while a call campaign is actively sending — drop to
  // 15s when idle (matches the Campaigns page pattern).
  const anySending = list.some((c) => c.status === 'sending');
  usePolling(load, anySending ? 4000 : 15000);

  // Detail refresher
  useEffect(() => {
    if (openDetailId == null) { setDetail(null); return; }
    let alive = true;
    const fetchDetail = () => api.getAgentCall(openDetailId)
      .then((d) => { if (alive) setDetail(d); }).catch(() => {});
    fetchDetail();
    const tick = setInterval(fetchDetail, 3000);
    return () => { alive = false; clearInterval(tick); };
  }, [openDetailId]);

  const create = async () => {
    if (!name.trim()) return toast('Name required.', 'err');
    if (!agentId) return toast('Pick an agent.', 'err');
    if (!script.trim()) return toast('Write a script.', 'err');
    const payload: any = { name: name.trim(), agentId, script: script.trim(), voicemailOnly };
    if (target === 'all') payload.allContacts = true;
    else if (target === 'segment') {
      if (!segId) return toast('Pick a segment.', 'err');
      payload.segmentId = segId;
    } else {
      const r = parseRecipients(recipientsRaw);
      if (r.length === 0) return toast('Add at least one recipient.', 'err');
      payload.recipients = r;
    }
    setBusy(true);
    try {
      const out = await api.createAgentCall(payload);
      setShowNew(false);
      setName(''); setAgentId(null); setScript('');
      setRecipientsRaw(''); setTarget('all'); setSegId(null);
      setVoicemailOnly(false);
      load();
      toast(`Draft created (#${out.id}). Click it to review and send.`, 'ok');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const send = async (id: number) => {
    if (!confirm('Place automated calls to every recipient now? This cannot be undone.')) return;
    try {
      await api.sendAgentCall(id);
      toast('Calls queued. Watch live status below.', 'ok');
      load();
      // Re-fetch the open detail
      if (openDetailId === id) api.getAgentCall(id).then(setDetail).catch(() => {});
    } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h2>Agent calls</h2>
          <div className="sub">Outbound calls placed by an AI agent</div>
        </div>
        <button className="btn" onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ New'}</button>
      </div>
      <SubNav tabs={AGENTS_SUBTABS} />
      <div className="page-body">
        {/* Live calls — the primary monitoring surface. Renders nothing
            unless there's at least one initiated/ringing/in-progress call,
            so it's invisible on idle accounts. */}
        <LiveCalls />

        {showNew && (
          <div className="cond-card" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Campaign name (e.g. Appointment reminders Tuesday)" />

            <div>
              <div className="sa-label">AGENT</div>
              <div className="seg-chips">
                {agents.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No agents yet — create one first.</span>}
                {agents.map((a) => (
                  <button key={a.id} type="button"
                    className={'seg-chip' + (agentId === a.id ? ' on' : '')}
                    onClick={() => setAgentId(a.id)}>
                    {a.emoji} {a.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="sa-label">SCRIPT (THE AGENT WILL READ THIS)</div>
              <textarea className="textarea" value={script} onChange={(e) => setScript(e.target.value)}
                placeholder="Hi! Just a reminder that your appointment is tomorrow at 10am. See you then!"
                rows={4} />
              <div className="import-hint">
                The agent will greet the recipient by first name automatically, then read this script.
                Keep it under 30 seconds when spoken (~75 words).
              </div>
              {script.trim() && (
                <div style={{ marginTop: 8 }}>
                  <SmsAiTools text={script} goal="short, natural script read aloud over the phone (≤30s, ≤75 words)" onApply={setScript} compact />
                </div>
              )}
            </div>

            <div>
              <div className="sa-label">RECIPIENTS</div>
              <div className="seg-chips">
                <button type="button" className={'seg-chip' + (target === 'all' ? ' on' : '')} onClick={() => setTarget('all')}>WHOLE LIST</button>
                <button type="button" className={'seg-chip' + (target === 'segment' ? ' on' : '')} onClick={() => setTarget('segment')}>A SEGMENT</button>
                <button type="button" className={'seg-chip' + (target === 'paste' ? ' on' : '')} onClick={() => setTarget('paste')}>PASTE</button>
              </div>
              {target === 'segment' && (
                <div className="seg-chips" style={{ marginTop: 8 }}>
                  {segments.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No segments — make one in Contacts.</span>}
                  {segments.map((s) => (
                    <button key={s.id} type="button" className={'seg-chip' + (segId === s.id ? ' on' : '')}
                      onClick={() => setSegId(s.id)}>{s.name} · {s.count}</button>
                  ))}
                </div>
              )}
              {target === 'paste' && (
                <textarea className="textarea" style={{ marginTop: 8, fontFamily: 'var(--mono)' }}
                  value={recipientsRaw} onChange={(e) => setRecipientsRaw(e.target.value)}
                  placeholder={'+15551234567, Sam\n+15559876543, Alex'} />
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
                            background: 'var(--surface-2)', border: '2px solid var(--ink)', borderRadius: 8 }}>
              <input type="checkbox" checked={voicemailOnly} onChange={(e) => setVoicemailOnly(e.target.checked)}
                style={{ marginTop: 4, width: 18, height: 18 }} />
              <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                <b>Drop voicemail only</b> — leave the script as a voicemail. If a live
                human picks up, the call apologizes briefly and hangs up (Twilio doesn't
                support carrier-side ringless voicemail; this is the closest legal proxy).
              </span>
            </label>

            <button className="btn" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button>
          </div>
        )}

        {list.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
            No agent calls yet. Create a draft to get started.
          </p>
        )}

        {list.map((c) => (
          <div key={c.id} className="camp-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22 }} aria-hidden>{c.agent_emoji || '🤖'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div className="meta">
                  <span className={`camp-status ${c.status}`}>{c.status}</span>
                  {' · '}{c.placed_count}/{c.total_count}
                  {c.agent_name ? ` · agent: ${c.agent_name}` : ''}
                </div>
              </div>
              <button className="btn ghost" onClick={() => setOpenDetailId(openDetailId === c.id ? null : c.id)}>
                {openDetailId === c.id ? 'Hide' : 'Details'}
              </button>
              {c.status === 'draft' && (
                <button className="btn" onClick={() => send(c.id)}>Send</button>
              )}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, color: 'var(--muted)' }}>"{c.script.slice(0, 120)}{c.script.length > 120 ? '…' : ''}"</div>

            {openDetailId === c.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '2px solid var(--surface-2)' }}>
                {detail && detail.campaign.id === c.id ? (
                  <div>
                    <div className="sa-label" style={{ marginBottom: 8 }}>RECIPIENTS ({detail.recipients.length})</div>
                    <div style={{ maxHeight: 340, overflowY: 'auto', border: '2px solid var(--ink)', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--pixel)', fontSize: 8 }}>NAME / PHONE</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--pixel)', fontSize: 8 }}>STATUS</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--pixel)', fontSize: 8 }}>ANSWERED BY</th>
                            <th style={{ textAlign: 'right', padding: '8px 12px', fontFamily: 'var(--pixel)', fontSize: 8 }}>DURATION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.recipients.map((r) => (
                            <tr key={r.id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '8px 12px' }}>
                                {r.name ? <><b>{r.name}</b><br /></> : null}
                                <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.phone}</span>
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span className={`camp-status ${
                                  r.status === 'completed' ? 'done' :
                                  ['failed','busy','no-answer','canceled','skipped-opted-out','skipped-quiet-hours'].includes(r.status) ? 'failed' :
                                  ['initiated','ringing','in-progress'].includes(r.status) ? 'sending' : ''
                                }`} style={{ fontSize: 7 }}>{r.status}</span>
                                {r.error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{r.error}</div>}
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.answered_by || '—'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.duration_sec ? `${r.duration_sec}s` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading recipients…</div>
                )}
              </div>
            )}
          </div>
        ))}

        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
          Need an agent? <Link to="/agents/new" style={{ fontWeight: 800 }}>Create one</Link> first, then come back here.
        </p>
      </div>
    </>
  );
}
