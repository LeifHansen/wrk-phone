import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, COLOR_BG, COLOR_FG } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { subscribeEvents } from '../lib/events';
import { IconTrash } from '../components/Icons';
import { Avatar } from '../components/Avatar';
import { toast } from '../components/Toast';
import { SubNav } from '../components/SubNav';

const MSGS_SUBTABS = [
  { to: '/messages',           label: 'Inbox',     end: true },
  { to: '/messages/drafts',    label: 'Drafts' },
  { to: '/messages/templates', label: 'Templates' },
];

interface Row {
  id: number; peer_phone: string; name: string | null;
  last_body: string | null; last_direction: string | null;
  last_message_at: number; unread_count: number;
  agent_id: number | null; agent_name: string | null;
  agent_emoji: string | null; agent_color: string | null;
  agent_avatar?: string | null;
  agent_mode: 'off' | 'suggest' | 'auto' | null;
}
interface DraftRow {
  draft_id: number; draft_body: string; draft_at: number;
  conversation_id: number; peer_phone: string; our_number: string | null; name: string | null;
}

function formatTime(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (Date.now() - ts < 7 * 86400000)
    return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}
const initial = (r: { name: string | null; peer_phone: string }) =>
  (r.name || r.peer_phone || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#';

export function Inbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const loc = useLocation();
  // URL is source of truth so the back button + deep links work. Use an
  // exact match so a future route like /messages/foo/drafts can't activate
  // the drafts tab here.
  const tab: 'inbox' | 'drafts' = loc.pathname === '/messages/drafts' ? 'drafts' : 'inbox';

  const load = () => {
    api.listConversations().then((r) => setRows(r as Row[])).catch(() => {});
    api.listDrafts().then(setDrafts).catch(() => {});
  };

  const del = async (e: React.MouseEvent, id: number, label: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Delete the conversation with ${label}? This removes all its messages.`)) return;
    try { await api.deleteConversation(id); setRows((s) => s.filter((x) => x.id !== id)); toast('Conversation deleted'); }
    catch (err: any) { toast(`Delete failed: ${err.message}`, 'err'); }
  };
  const removeDraft = async (e: React.MouseEvent, id: number) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm('Discard this draft?')) return;
    try { await api.deleteDraft(id); setDrafts((s) => s.filter((d) => d.draft_id !== id)); toast('Draft discarded'); }
    catch (err: any) { toast(`Failed: ${err.message}`, 'err'); }
  };

  // SSE pushes a refresh on every new inbound, outbound, or status change;
  // polling is now just a safety net for when the event stream is closed
  // (sleeping tab, proxy timeout, deploy bounce).
  usePolling(load, 30000);
  useEffect(() => subscribeEvents((e) => {
    if (e.kind === 'message:new' || e.kind === 'message:status' || e.kind === 'voicemail:new') load();
  }), []);

  return (
    <>
      <div className="page-h">
        <h2>Messages</h2>
        <Link to="/" className="btn" style={{ textDecoration: 'none' }}>✎ New</Link>
      </div>

      <SubNav tabs={MSGS_SUBTABS} />

      <div className="page-body">
        {tab === 'inbox' && (
          <>
            {rows.length === 0 && (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
                No conversations yet. Go to the <strong>Phone</strong> tab → TEXT to start one.
              </p>
            )}
            <ul className="inbox-list">
              {rows.map((r) => (
                <li key={r.id} className="inbox-li">
                  <Link to={`/conversation/${r.id}`} className="inbox-row">
                    {r.unread_count > 0 ? <div className="unread-dot" /> : <div style={{ width: 8 }} />}
                    <div className="avatar">{initial(r)}</div>
                    <div className="body">
                      <div className="top">
                        <span className="name">{r.name || r.peer_phone}</span>
                        <span className="time">{formatTime(r.last_message_at)}</span>
                      </div>
                      <div className="preview">
                        {r.last_direction === 'out' ? 'You: ' : ''}{r.last_body || ' '}
                      </div>
                      {r.agent_color && r.agent_mode && r.agent_mode !== 'off' && (
                        <span
                          className="agent-chip"
                          style={{ background: COLOR_BG[r.agent_color], color: COLOR_FG[r.agent_color], display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <Avatar url={r.agent_avatar} emoji={r.agent_emoji} color={r.agent_color} size={16} round />
                          {r.agent_name} · {r.agent_mode.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </Link>
                  <button className="inbox-del" title="Delete conversation"
                    onClick={(e) => del(e, r.id, r.name || r.peer_phone)}>
                    <IconTrash size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === 'drafts' && (
          <>
            {drafts.length === 0 && (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
                No drafts. Save a draft from the <strong>Phone</strong> tab → TEXT.
              </p>
            )}
            <ul className="inbox-list">
              {drafts.map((d) => (
                <li key={d.draft_id} className="inbox-li">
                  <Link to={`/conversation/${d.conversation_id}`} className="inbox-row">
                    <div style={{ width: 8 }} />
                    <div className="avatar">{initial(d)}</div>
                    <div className="body">
                      <div className="top">
                        <span className="name">{d.name || d.peer_phone}</span>
                        <span className="time">{formatTime(d.draft_at)}</span>
                      </div>
                      <div className="preview" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                        Draft: {d.draft_body || '(empty)'}
                      </div>
                    </div>
                  </Link>
                  <button className="inbox-del" title="Discard draft"
                    onClick={(e) => removeDraft(e, d.draft_id)}>
                    <IconTrash size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
