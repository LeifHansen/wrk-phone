import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Agent, COLOR_BG, COLOR_FG, api } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { Avatar } from '../components/Avatar';
import { toast } from '../components/Toast';
import { SmsAiTools } from '../components/SmsAiTools';
import { placeCall } from '../lib/voice';

interface Msg {
  id: number; direction: 'in' | 'out'; body: string; status: string;
  created_at: number; is_ai: number; is_suggestion: number; agent_id: number | null;
}

const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function Conversation({ onCall }: { onCall: (peer: string) => void }) {
  const { id } = useParams();
  const convId = Number(id);
  const [conv, setConv] = useState<any>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [apPick, setApPick] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await api.getMessages(convId);
    setConv(res.conversation); setMessages(res.messages); setAgent(res.agent);
  };
  useEffect(() => { api.markRead(convId).catch(() => {}); }, [convId]);
  usePolling(() => { load().catch(() => {}); }, 3500, [convId]);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    if (!draft.trim() || sending || !conv) return;
    setSending(true);
    const text = draft.trim();
    setDraft('');
    try { await api.sendSms(conv.peer_phone, text); await load(); }
    catch (e: any) { toast(e.message, 'err'); setDraft(text); }
    finally { setSending(false); }
  };

  const callPeer = async () => {
    if (!conv) return;
    onCall(conv.peer_phone);
    try { await placeCall(conv.peer_phone); }
    catch (e: any) { toast(`Call failed: ${e.message}`, 'err'); }
  };

  const openSwitcher = async (forAutopilot = false) => {
    setApPick(forAutopilot);
    try { setAllAgents(await api.listAgents()); setSheetOpen(true); }
    catch (e: any) { toast(e.message, 'err'); }
  };
  const pickAgent = async (a: Agent | null) => {
    setSheetOpen(false);
    try {
      if (apPick && a) { await api.setAutopilot(convId, true, a.id); toast(`Autopilot ON — ${a.name} is handling this thread`); }
      else { await api.assignAgent(convId, a?.id ?? null); }
      load();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setApPick(false); }
  };
  const toggleAutopilot = async () => {
    if (conv?.autopilot) {
      try { await api.setAutopilot(convId, false); toast('Autopilot OFF'); load(); }
      catch (e: any) { toast(e.message, 'err'); }
    } else {
      openSwitcher(true); // pick which agent takes over
    }
  };

  return (
    <div className="convo">
      <div className="convo-header">
        <Link to="/messages" className="btn ghost" style={{ padding: 0 }}>‹ Inbox</Link>
        <span className="peer">{conv?.peer_phone || ''}</span>
        <button className={'btn ' + (conv?.autopilot ? 'lime' : 'ghost')} onClick={toggleAutopilot}
          title="Let an agent take over this thread">
          🤖 Autopilot {conv?.autopilot ? 'ON' : 'OFF'}
        </button>
        <button className="btn ghost" onClick={callPeer}>📞</button>
      </div>

      {agent && agent.mode !== 'off' && (
        <div className="agent-bar" style={{ background: COLOR_BG[agent.color], color: COLOR_FG[agent.color] }} onClick={() => openSwitcher()}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar url={(agent as any).avatar_url} emoji={agent.emoji} color={agent.color} size={22} round />
            {agent.name} on duty · {agent.mode.toUpperCase()}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Switch ›</span>
        </div>
      )}

      <div className="convo-thread" ref={threadRef}>
        {messages.map((m) => {
          if (m.is_suggestion) {
            return (
              <div key={m.id} className="suggestion">
                <div className="label">🤖 Suggested reply</div>
                <div>{m.body}</div>
                <div className="actions">
                  <button className="btn ghost" onClick={async () => { await api.dismissSuggestion(m.id); load(); }}>Dismiss</button>
                  <button className="btn" onClick={async () => { await api.approveSuggestion(m.id); load(); }}>Send</button>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`bubble-row ${m.direction}`}>
              <div className={`bubble ${m.direction}`}>{m.body}</div>
              <div className="bubble-meta">
                {fmt(m.created_at)}
                {m.direction === 'out' && m.is_ai ? ' · 🤖' : ''}
                {m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      {draft.trim() && (
        <div style={{ padding: '8px 12px 0' }}>
          <SmsAiTools text={draft} goal="1:1 customer text reply" onApply={setDraft} compact />
        </div>
      )}
      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message"
          rows={1}
        />
        <button className="send-btn" onClick={send} disabled={!draft.trim() || sending}>↑</button>
      </div>

      {sheetOpen && (
        <>
          <div className="modal-backdrop" onClick={() => setSheetOpen(false)} />
          <div className="sheet">
            <div className="handle" />
            <h3>On-duty agent</h3>
            {allAgents.map((a) => (
              <div key={a.id} className="sheet-row" onClick={() => pickAgent(a)}>
                <Avatar url={(a as any).avatar_url} emoji={a.emoji} color={a.color} size={40} />
                <div style={{ flex: 1 }}>
                  <div className="name">{a.name}</div>
                  <div className="meta">{a.mode.toUpperCase()}{a.is_default ? ' · default' : ''}</div>
                </div>
                {a.id === agent?.id && <div style={{ fontSize: 22 }}>✓</div>}
              </div>
            ))}
            <div className="sheet-row" onClick={() => pickAgent(null)}>
              <div className="swatch" style={{ background: 'var(--bg-subtle)' }}>—</div>
              <div className="name">Use default agent</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
