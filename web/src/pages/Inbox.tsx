import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, COLOR_BG, COLOR_FG } from '../lib/api';
import { IconTrash } from '../components/Icons';
import { toast } from '../components/Toast';

interface Row {
  id: number; peer_phone: string; name: string | null;
  last_body: string | null; last_direction: string | null;
  last_message_at: number; unread_count: number;
  agent_id: number | null; agent_name: string | null;
  agent_emoji: string | null; agent_color: string | null;
  agent_mode: 'off' | 'suggest' | 'auto' | null;
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
const initial = (r: Row) => (r.name || r.peer_phone || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#';

export function Inbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const navigate = useNavigate();

  const load = () => api.listConversations().then((r) => setRows(r as Row[])).catch(() => {});

  const del = async (e: React.MouseEvent, id: number, label: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Delete the conversation with ${label}? This removes all its messages.`)) return;
    try { await api.deleteConversation(id); setRows((s) => s.filter((x) => x.id !== id)); toast('Conversation deleted'); }
    catch (err: any) { toast(`Delete failed: ${err.message}`, 'err'); }
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const compose = async () => {
    if (!phone.trim() || !body.trim()) return;
    const { id } = await api.startConversation(phone.trim());
    await api.sendSms(phone.trim(), body.trim());
    setShowNew(false); setPhone(''); setBody('');
    navigate(`/conversation/${id}`);
  };

  return (
    <>
      <div className="page-h">
        <h2>Messages</h2>
        <button className="btn" onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '✎ New'}</button>
      </div>
      {showNew && (
        <div style={{ padding: '0 24px 12px', display: 'grid', gap: 8 }}>
          <input className="input" placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <textarea className="textarea" placeholder="Message…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div><button className="btn" onClick={compose} disabled={!phone.trim() || !body.trim()}>Send</button></div>
        </div>
      )}
      <div className="page-body">
        {rows.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No conversations yet. Tap <strong>✎ New</strong> to start one.
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
                      style={{ background: COLOR_BG[r.agent_color], color: COLOR_FG[r.agent_color] }}
                    >
                      {r.agent_emoji} {r.agent_name} · {r.agent_mode.toUpperCase()}
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
      </div>
    </>
  );
}
