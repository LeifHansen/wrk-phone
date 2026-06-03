import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Agent, api } from '../lib/api';
import { toast } from './Toast';

// "Agent text" + "Agent call" entry points that appear next to the normal
// call/text buttons WHEN the user has at least one auto-mode agent. Goal
// is one tap: pick the contact, pick the agent (only if there's more than
// one auto agent), enter the brief / script, send. The agent drafts the
// opener and autopilots the resulting thread (for text), or places a
// 1-recipient agent_calls campaign (for voice).

export type InitiateRecipient = { phone: string; name?: string | null };

export function AgentInitiate({ to, compact = false }: { to: InitiateRecipient; compact?: boolean }) {
  const [autoAgents, setAutoAgents] = useState<Agent[]>([]);
  const [mode, setMode] = useState<null | 'text' | 'call'>(null);
  const [chosenAgent, setChosenAgent] = useState<Agent | null>(null);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.listAgents()
      .then((all) => setAutoAgents(all.filter((a) => a.mode === 'auto' && !a.hidden)))
      .catch(() => {});
  }, []);

  if (autoAgents.length === 0) return null;

  const open = (m: 'text' | 'call') => {
    setMode(m); setBrief('');
    setChosenAgent(autoAgents.length === 1 ? autoAgents[0] : null);
  };
  const close = () => { setMode(null); setChosenAgent(null); setBrief(''); setBusy(false); };

  const submitText = async () => {
    if (!chosenAgent || !brief.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.initiateAgentText(chosenAgent.id, to.phone, brief.trim(), to.name || undefined);
      toast(`🤖 ${chosenAgent.name} sent: "${r.opening.slice(0, 60)}${r.opening.length > 60 ? '…' : ''}"`, 'ok');
      close();
      nav(`/conversation/${r.conversationId}`);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally { setBusy(false); }
  };

  const submitCall = async () => {
    if (!chosenAgent || !brief.trim() || busy) return;
    setBusy(true);
    try {
      // Reuse the existing agent-calls flow as a 1-recipient campaign so the
      // call inherits the safety rails (atomic credit reservation, quiet
      // hours, recovery sweep). The call itself is a live two-way AI
      // conversation — see /voice/agent-call-twiml.
      const c = await api.createAgentCall({
        name: `Quick call: ${to.name || to.phone}`,
        agentId: chosenAgent.id,
        script: brief.trim(),
        recipients: [{ phone: to.phone, name: to.name || undefined }],
      });
      await api.sendAgentCall(c.id);
      toast(`🤖 ${chosenAgent.name} is dialing ${to.name || to.phone}…`, 'ok');
      close();
      nav('/agents/calls');
    } catch (e: any) {
      toast(e.message, 'err');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button className={'btn ' + (compact ? 'btn-icon' : 'lg')} style={{ background: 'var(--purple)', color: '#fff' }}
        onClick={(e) => { e.stopPropagation(); open('text'); }}
        title={`Have ${autoAgents.length === 1 ? autoAgents[0].name : 'an agent'} text ${to.name || to.phone}`}>
        🤖✉
      </button>
      <button className={'btn ' + (compact ? 'btn-icon' : 'lg')} style={{ background: 'var(--purple)', color: '#fff' }}
        onClick={(e) => { e.stopPropagation(); open('call'); }}
        title={`Have ${autoAgents.length === 1 ? autoAgents[0].name : 'an agent'} call ${to.name || to.phone}`}>
        🤖✆
      </button>

      {mode && (
        <>
          <div className="modal-backdrop" onClick={close} />
          <div className="sheet" style={{ maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3>{mode === 'text' ? '🤖✉ Agent text' : '🤖✆ Agent call'} — {to.name || to.phone}</h3>

            {/* Agent picker — only when there's more than one auto agent.
                Skipped when there's exactly one (chosenAgent is preset). */}
            {autoAgents.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <div className="sa-label">PICK AN AGENT</div>
                <div className="seg-chips">
                  {autoAgents.map((a) => (
                    <button key={a.id} type="button"
                      className={'seg-chip' + (chosenAgent?.id === a.id ? ' on' : '')}
                      onClick={() => setChosenAgent(a)}>
                      {a.emoji} {a.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="sa-label">
              {mode === 'text' ? 'WHAT SHOULD THE AGENT TEXT ABOUT?' : 'WHAT SHOULD THE AGENT SAY ON THE CALL?'}
            </div>
            <textarea className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder={mode === 'text'
                ? 'e.g. "Check if they\'re still interested in the consultation we discussed last week."'
                : 'e.g. "Hi! Just a reminder your appointment is tomorrow at 10am. See you then!"'} />
            <p className="hint" style={{ marginTop: 4 }}>
              {mode === 'text'
                ? `${chosenAgent?.name || 'The agent'} will draft the opening text in their voice and autopilot any replies.`
                : `${chosenAgent?.name || 'The agent'} will dial and hold a live two-way conversation. The opener above is what it leads with.`}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn ghost lg" onClick={close} style={{ flex: 1 }}>Cancel</button>
              <button className="btn lg" style={{ flex: 1, background: 'var(--purple)', color: '#fff' }}
                onClick={mode === 'text' ? submitText : submitCall}
                disabled={busy || !chosenAgent || !brief.trim()}>
                {busy
                  ? 'Working…'
                  : mode === 'text' ? `Send via ${chosenAgent?.name || 'agent'}` : `Place call via ${chosenAgent?.name || 'agent'}`}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
