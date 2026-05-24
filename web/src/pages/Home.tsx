import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { placeCall } from '../lib/voice';
import { IconContacts } from '../components/Icons';
import { SmsAiTools } from '../components/SmsAiTools';
import { toast } from '../components/Toast';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

function fmt(raw: string) {
  const d = raw.replace(/[^\d+*#]/g, '');
  if (d.startsWith('+')) return d;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}
function e164(raw: string) {
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : d.length ? `+${d}` : '';
}

export function Home({ onCall }: { onCall: (peer: string) => void }) {
  const nav = useNavigate();
  const [num, setNum] = useState('');
  const [mode, setMode] = useState<'call' | 'text'>('call');
  const [pick, setPick] = useState(false);
  const [recents, setRecents] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const textRef = useRef<HTMLInputElement>(null);
  // TEXT-mode composer: lets the user write the message right here on the
  // Phone tab instead of being bounced into a conversation thread first.
  const [msg, setMsg] = useState('');
  // Templates picker — lets the user pick a saved template and (when there's
  // a recipient) renders {{first_name}} / {{name}} / {{phone}} against the
  // contact row before dropping the body into the textarea.
  const [templates, setTemplates] = useState<{ id: number; name: string; body: string; media_url: string | null }[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    api.listTemplates().then((t) => setTemplates(t)).catch(() => {});
  }, []);

  const press = (k: string) => setNum((n) => n + k);
  const back = () => setNum((n) => n.slice(0, -1));

  // Switching to TEXT shows a real input (soft keyboard) instead of the
  // numeric dial pad; switching back to CALL restores the keypad.
  const switchMode = (m: 'call' | 'text') => {
    setMode(m);
    if (m === 'text') setTimeout(() => textRef.current?.focus(), 50);
  };

  const openPicker = async () => {
    setPick(true); setQ('');
    try {
      const [c, r] = await Promise.all([api.listContacts(), api.listConversations()]);
      setContacts(c);
      setRecents(r.slice(0, 8));
    } catch { /* logged in api layer */ }
  };

  const choose = (phone: string) => {
    setNum(phone.replace(/^\+1/, '').replace(/[^\d+*#]/g, ''));
    setPick(false);
  };

  // Call path stays the same: tap → place the call.
  const goCall = async () => {
    const target = e164(num);
    if (!target) return;
    onCall(target);
    try { await placeCall(target); } catch (e: any) { toast(`Call failed: ${e.message}`, 'err'); }
  };

  // Send the typed message right away. Creates / reuses the conversation
  // server-side (phone is normalized) and jumps the user into the thread.
  const sendText = async () => {
    const target = e164(num);
    if (!target || !msg.trim() || sending) return;
    setSending(true);
    try {
      const { id } = await api.startConversation(target);
      await api.sendSms(target, msg.trim());
      setNum(''); setMsg('');
      nav(`/conversation/${id}`);
    } catch (e: any) {
      toast(`Send failed: ${e.message}`, 'err');
    } finally { setSending(false); }
  };

  // Save as draft — the conversation row is created so the draft has a home
  // (and shows up in Messages → Drafts), but nothing goes out to Twilio.
  const saveDraftText = async () => {
    const target = e164(num);
    if (!target || (!msg.trim())) {
      toast('Need a number and a message to save a draft.', 'err');
      return;
    }
    try {
      await api.saveDraft({ peer_phone: target, body: msg.trim() });
      setNum(''); setMsg('');
      toast('Draft saved — find it in Messages → Drafts');
    } catch (e: any) {
      toast(`Save failed: ${e.message}`, 'err');
    }
  };

  // Pick a template + render its tokens against the current recipient (if
  // one is set). Falls back to the raw body when there's no contact yet.
  const useTemplate = async (id: number) => {
    setTplOpen(false);
    try {
      const target = e164(num);
      const rendered = target
        ? await api.renderTemplate(id, { phone: target })
        : await api.getTemplate(id);
      setMsg((cur) => (cur ? `${cur}\n${rendered.body}` : rendered.body));
    } catch (e: any) { toast(`Template failed: ${e.message}`, 'err'); }
  };

  const filtered = contacts.filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || (c.name || '').toLowerCase().includes(s) || c.phone.includes(s);
  });

  return (
    <div className="phone">
      {/* Mode toggle lives ABOVE / OUTSIDE the number pane */}
      <div className="dialer-bar">
        <div className="phone-toggle">
          <button className={'pt-btn' + (mode === 'call' ? ' on' : '')} onClick={() => switchMode('call')}>CALL</button>
          <button className={'pt-btn' + (mode === 'text' ? ' on' : '')} onClick={() => switchMode('text')}>TEXT</button>
        </div>
      </div>

      {mode === 'call' ? (
        <>
          <div className="call-field">
            <div className="text-entry-field">
              <div className={'input num-display' + (num ? '' : ' is-empty')}>
                {fmt(num) || 'Enter a number, or pick a contact'}
              </div>
              {!num && (
                <button className="contacts-ico in-field" onClick={openPicker}
                  title="Select from contacts" aria-label="Select from contacts">
                  <IconContacts size={20} />
                </button>
              )}
            </div>
          </div>
          <div className="phone-pad">
            {KEYS.map(([d, l]) => (
              <button key={d} className="phone-key" onClick={() => press(d)}>
                <span className="kd">{d}</span>
                {l && <span className="kl">{l}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-entry" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Recipient row */}
          <div className="text-entry-field">
            <input
              ref={textRef}
              className="input"
              type="tel"
              inputMode="tel"
              autoFocus
              placeholder="Type a number, or pick a contact"
              value={num}
              onChange={(e) => setNum(e.target.value)}
            />
            <button className="contacts-ico in-field" onClick={openPicker}
              title="Select from contacts" aria-label="Select from contacts">
              <IconContacts size={20} />
            </button>
          </div>

          {/* Composer */}
          <textarea
            className="textarea"
            placeholder="Type your message…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={5}
            style={{ minHeight: 110 }}
          />

          {/* Template picker — useful for one-off sends with token substitution */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn ghost" onClick={() => setTplOpen((s) => !s)}
              disabled={templates.length === 0}
              title={templates.length === 0 ? 'No templates yet — create one in Messages → Templates' : 'Insert a saved template'}>
              📝 Template
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Tip: <code>{'{{first_name}}'}</code> pulls from the contact when there's a recipient.
            </span>
          </div>
          {tplOpen && (
            <div className="cond-card" style={{ display: 'grid', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {templates.map((t) => (
                <button key={t.id} className="btn ghost" style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                  onClick={() => useTemplate(t.id)}>
                  <b>{t.name}</b> — <span style={{ color: 'var(--muted)' }}>{t.body.slice(0, 60)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Optimize with AI for the composer */}
          {msg.trim() && (
            <SmsAiTools text={msg} goal="1:1 customer text" onApply={setMsg} compact />
          )}

          {/* Send / Save as Draft */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn lime lg" style={{ flex: 1 }}
              onClick={sendText}
              disabled={!e164(num) || !msg.trim() || sending}
              title="Send the message now">
              {sending ? 'Sending…' : '✉ Send'}
            </button>
            <button className="btn ghost lg" style={{ flex: 1 }}
              onClick={saveDraftText}
              disabled={!e164(num) || !msg.trim() || sending}
              title="Save without sending — find it later in Messages → Drafts">
              💾 Save as Draft
            </button>
          </div>
        </div>
      )}

      {/* CALL-mode dial pad action row — only render when on call mode so
          the action row doesn't fight the new TEXT-mode composer's buttons. */}
      {mode === 'call' && (
        <div className="phone-actions">
          <span className="pa-side" aria-hidden="true" />
          <button
            className="pa-go go-call"
            onClick={goCall}
            disabled={!num}
          >
            ✆
          </button>
          <button className="pa-side" onClick={back} title="Delete" aria-label="Delete">
            <span className="pa-glyph">⌫</span>
            <span className="pa-cap">{num ? 'DEL' : ''}</span>
          </button>
        </div>
      )}

      {pick && (
        <>
          <div className="modal-backdrop" onClick={() => setPick(false)} />
          <div className="sheet" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <div className="handle" />
            <h3>Quick add</h3>
            <input className="input" placeholder="Search contacts" value={q}
              onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
            {recents.length > 0 && !q && (
              <>
                <div className="sa-label">RECENTS</div>
                {recents.map((r) => (
                  <div key={'r' + r.id} className="sheet-row" onClick={() => choose(r.peer_phone)}>
                    <div className="swatch" style={{ background: 'var(--surface-2)' }}>✆</div>
                    <div style={{ flex: 1 }}>
                      <div className="name">{r.name || r.peer_phone}</div>
                      <div className="meta">{r.peer_phone}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="sa-label" style={{ marginTop: 10 }}>CONTACTS</div>
            {filtered.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No contacts.</div>}
            {filtered.slice(0, 50).map((c) => (
              <div key={'c' + c.id} className="sheet-row" onClick={() => choose(c.phone)}>
                <div className="swatch" style={{ background: 'var(--lime)' }}>
                  {(c.name || c.phone).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="name">{c.name || c.phone}</div>
                  <div className="meta">{c.phone}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
