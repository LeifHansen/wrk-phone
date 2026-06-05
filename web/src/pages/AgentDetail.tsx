import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Agent, COLOR_BG, COLOR_FG, api } from '../lib/api';
import { toast } from '../components/Toast';
import { IconPencil } from '../components/Icons';
import { NameAvatar } from '../components/NameAvatar';

const MODES = [
  { key: 'off',     label: 'Off',     blurb: 'No AI replies.' },
  { key: 'suggest', label: 'Suggest', blurb: 'AI drafts. You tap Send.' },
  { key: 'auto',    label: 'Auto',    blurb: 'AI sends safe replies on its own.' },
] as const;

export function AgentDetail() {
  const { id } = useParams();
  const aid = Number(id);
  const nav = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [dirty, setDirty] = useState<Partial<Agent>>({});
  const [advanced, setAdvanced] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = () => api.getAgent(aid).then((a) => { setAgent(a); setDirty({}); }).catch(() => {});
  useEffect(() => { load(); }, [aid]);
  // Warn before closing the tab / reloading with unsaved edits — matches
  // what users expect from any editing UI and rescues a "I clicked away
  // and lost my changes" failure mode.
  useEffect(() => {
    if (Object.keys(dirty).length === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!agent) return <div className="page-body">Loading…</div>;
  const merged = { ...agent, ...dirty } as Agent;
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setDirty((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (Object.keys(dirty).length === 0) { toast('Nothing to save', 'info'); return; }
    try { setAgent(await api.patchAgent(aid, dirty)); setDirty({}); toast('Agent saved ✓'); }
    catch (e: any) { toast(`Save failed: ${e.message}`, 'err'); }
  };
  const discard = () => { setDirty({}); toast('Changes discarded'); };

  const setMode = async (mode: 'off' | 'suggest' | 'auto') => {
    set('mode', mode);
    try { await api.patchAgent(aid, { mode }); setAgent((a) => a ? { ...a, mode } : a); toast(`Messaging: ${mode.toUpperCase()} ✓`); }
    catch (e: any) { toast(`Failed: ${e.message}`, 'err'); }
  };
  const setVoiceMode = async (voice_mode: 'off' | 'suggest' | 'auto') => {
    set('voice_mode', voice_mode);
    try { await api.patchAgent(aid, { voice_mode }); setAgent((a) => a ? { ...a, voice_mode } : a); toast(`Voicemail: ${voice_mode.toUpperCase()} ✓`); }
    catch (e: any) { toast(`Failed: ${e.message}`, 'err'); }
  };

  const onDelete = async () => {
    if (merged.is_default) { toast('Cannot delete the default agent — set another default first.', 'err'); return; }
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try { await api.deleteAgent(aid); toast('Agent deleted'); nav('/agents', { replace: true }); }
    catch (e: any) { toast(`Delete failed: ${e.message}`, 'err'); }
  };

  const updateExample = (i: number, k: 'in' | 'out', v: string) =>
    set('examples', merged.examples.map((e, idx) => idx === i ? { ...e, [k]: v } : e));

  return (
    <>
      <div className="agent-banner" style={{ background: COLOR_BG[merged.color], color: COLOR_FG[merged.color] }}>
        <div className="em">{merged.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="agentName"
              className="name name-editable"
              value={merged.name}
              onChange={(e) => set('name', e.target.value)}
              style={{ color: COLOR_FG[merged.color], borderColor: COLOR_FG[merged.color] }}
            />
            <button
              title="Edit name"
              onClick={() => { const el = document.getElementById('agentName') as HTMLInputElement; el?.focus(); el?.select(); }}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', color: COLOR_FG[merged.color], display: 'flex' }}
            >
              <IconPencil size={18} />
            </button>
          </div>
          {merged.is_default ? (
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginTop: 4 }}>DEFAULT AGENT</div>
          ) : (
            <button className="default-btn" style={{ color: COLOR_FG[merged.color] }}
              onClick={async () => { try { await api.makeDefault(aid); await load(); toast('Set as default agent ✓'); } catch (e: any) { toast(e.message, 'err'); } }}>
              Make default
            </button>
          )}
        </div>
      </div>

      {/* Bottom padding leaves room for the fixed Save bar so it doesn't
          overlay the Delete-agent button at the very bottom of the form. */}
      <div className="page-body" style={{ paddingTop: 16, paddingBottom: 100 }}>
        <div className="agent-section">
          <h3>Avatar</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {(merged as any).avatar_url
              ? <img src={(merged as any).avatar_url} alt="" style={{ width: 64, height: 64, border: 'var(--border)', borderRadius: 8, objectFit: 'cover' }} />
              : <NameAvatar name={merged.name} size={64} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="btn" style={{ cursor: 'pointer', opacity: avatarBusy ? 0.6 : 1 }}>
                {avatarBusy ? '…' : '📤 Upload your own'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  disabled={avatarBusy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]; e.target.value = '';
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB.', 'err'); return; }
                    setAvatarBusy(true);
                    try {
                      const dataUrl: string = await new Promise((resolve, reject) => {
                        const fr = new FileReader();
                        fr.onload = () => resolve(String(fr.result || ''));
                        fr.onerror = () => reject(fr.error);
                        fr.readAsDataURL(file);
                      });
                      const r = await api.uploadAvatar('agent', dataUrl, aid);
                      setAgent((p) => p ? ({ ...p, avatar_url: `${r.url}?t=${Date.now()}` } as any) : p);
                      toast('Avatar updated ✓');
                    } catch (err: any) {
                      toast(`Upload failed: ${err.message || err}`, 'err');
                    } finally { setAvatarBusy(false); }
                  }}
                />
              </label>
              {/* AI generate is a small icon-only button now — most users
                  start with the auto initials avatar and never touch this. */}
              <button
                className="icon-btn"
                title="Generate AI avatar"
                aria-label="Generate AI avatar"
                disabled={avatarBusy}
                onClick={async () => {
                  setAvatarBusy(true);
                  toast('Generating avatar… (~10s)', 'info');
                  try {
                    const r = await api.genAvatar('agent', aid);
                    if (!r?.url) throw new Error('no image returned');
                    setAgent((p) => p ? ({ ...p, avatar_url: `${r.url}?t=${Date.now()}` } as any) : p);
                    toast('Avatar generated ✓');
                  } catch (e: any) {
                    toast(`Avatar failed: ${String(e.message || e).replace(/^\d+\s*/, '')}`, 'err');
                  } finally { setAvatarBusy(false); }
                }}
              >
                {avatarBusy ? '…' : '✨'}
              </button>
            </div>
          </div>
        </div>
        <div className="agent-section">
          <h3>Messaging</h3>
          <div className="mode-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={'mode-btn' + (merged.mode === m.key ? ' active ' + m.key : '')}
              >{m.label}</button>
            ))}
          </div>
          <p className="hint">{MODES.find((m) => m.key === merged.mode)?.blurb}</p>
        </div>

        <div className="agent-section cta-row">
          <Link to={`/agents/${aid}/optimize`} className="btn lime lg" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>✨ Optimize</Link>
          <Link to={`/agents/${aid}/train`} className="btn neon lg" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>🎓 Quick Train</Link>
        </div>

        <div className="agent-section">
          <h3>Training examples</h3>
          <p className="hint">Real inbound + how you'd reply. The agent learns your voice from these.</p>
          {merged.examples.map((ex, i) => (
            <div key={i} className="example-card">
              <label>Inbound</label>
              <input className="input" value={ex.in} onChange={(e) => updateExample(i, 'in', e.target.value)} />
              <label>Reply</label>
              <input className="input" value={ex.out} onChange={(e) => updateExample(i, 'out', e.target.value)} />
              <button className="btn ghost" style={{ color: 'var(--red)', marginTop: 8 }}
                onClick={() => set('examples', merged.examples.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button className="btn ghost" style={{ marginTop: 8 }}
            onClick={() => set('examples', [...merged.examples, { in: '', out: '' }])}>
            + Add example
          </button>
        </div>

        {/* Everything most users never touch lives below — collapsed by default
            so the create/edit flow stays focused on the few things that matter
            (mode, examples, training). Open when you want to tune voice,
            voicemail, persona, sending number, or add hard limits. */}
        <div className="agent-section">
          <button className="btn ghost" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? '▾' : '▸'} Advanced settings
          </button>
          {advanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 16 }}>
              <div>
                <h3>Persona / voice</h3>
                <textarea className="textarea" value={merged.persona} onChange={(e) => set('persona', e.target.value)} />
              </div>

              <div>
                <h3>Instructions</h3>
                <textarea className="textarea" value={merged.instructions} onChange={(e) => set('instructions', e.target.value)} />
              </div>

              <div>
                <h3>Hard limits (the agent will never do these)</h3>
                <p className="hint">Negative guardrails only — phrase things as "don't…" or "never…". Tap a limit to remove it.</p>
                <div style={{ marginTop: 8 }}>
                  {merged.rules.map((r, i) => (
                    <div key={i} className="rule-pill" onClick={() => set('rules', merged.rules.filter((_, idx) => idx !== i))}>
                      <span style={{ flex: 1 }}>🚫 {r}</span>
                      <span className="x">×</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      className="input"
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      placeholder="e.g. don't promise refunds"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newRule.trim()) { set('rules', [...merged.rules, newRule.trim()]); setNewRule(''); }
                      }}
                    />
                    <button
                      className="btn"
                      onClick={() => { if (newRule.trim()) { set('rules', [...merged.rules, newRule.trim()]); setNewRule(''); } }}
                    >+</button>
                  </div>
                </div>
              </div>

              <div>
                <h3>Voicemail greeting</h3>
                <div className="mode-row">
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setVoiceMode(m.key)}
                      className={'mode-btn' + (merged.voice_mode === m.key ? ' active ' + m.key : '')}
                    >{m.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <h3>Voice</h3>
                <VoicePicker
                  currentId={(merged as any).voice_id ?? null}
                  currentName={merged.voice_name || null}
                  onPick={async (v) => {
                    await api.patchAgent(aid, { voice_id: v.id ?? null, voice_name: v.name, tts_voice: v.tts_voice } as any);
                    setAgent((a) => a ? { ...a, voice_id: v.id ?? null, voice_name: v.name, tts_voice: v.tts_voice } as any : a);
                  }}
                />
              </div>

              <div>
                <h3>Sends from</h3>
                <p className="hint">Which number this agent texts from when it auto-replies. Default uses the active line.</p>
                <SendNumberPicker
                  value={(merged as any).send_number || ''}
                  onChange={async (v) => {
                    try { await api.patchAgent(aid, { send_number: v || null } as any); setAgent((p) => p ? ({ ...p, send_number: v || null } as any) : p); toast('Send number updated ✓'); }
                    catch (e: any) { toast(e.message, 'err'); }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="agent-section">
          <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={onDelete}>Delete agent</button>
        </div>
      </div>

      {/* Save bar — `position: fixed` so it's guaranteed visible regardless
          of the parent's flex/overflow layout. The previous sticky approach
          got clipped inside `.main { overflow: hidden }`, which made users
          think edits weren't supported. */}
      {Object.keys(dirty).length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'var(--lime)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          borderRadius: 14,
          padding: '12px 16px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontWeight: 700,
        }}>
          <span>
            {Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? '' : 's'}
          </span>
          <button className="btn ghost" onClick={discard}
            style={{ background: 'transparent', borderColor: 'var(--ink)' }}>
            Discard
          </button>
          <button className="btn" onClick={save}
            style={{ background: 'var(--ink)', color: 'var(--lime)' }}>
            💾 Save changes
          </button>
        </div>
      )}
    </>
  );
}

// mm:ss for the live recording timer.
function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function VoicePicker({ currentId, currentName, onPick }: {
  // Selection state — currentId is the source of truth for custom voices
  // (unique per row), currentName is used to highlight a preset (presets
  // don't have ids). This fixes the duplicate-name bug where two voices
  // with the same name both highlighted when one was selected.
  currentId: number | null;
  currentName: string | null;
  onPick: (v: { id?: number; name: string; tts_voice: string }) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-app mic recording. Preferred over file upload — the user records a
  // 15–30s sample right here and we POST the captured audio to the same
  // /api/voices/upload endpoint a file upload uses (a recorded Blob is wrapped
  // in a File). recordedBlobRef holds the finished take pending Save/Discard.
  const MAX_RECORD_SECS = 60;
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  const load = () => api.listVoices().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  // Release the mic + any object URL if the user navigates away mid-take.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const v = await api.createVoice(name.trim(), style.trim());
      onPick({ id: v.id, name: v.name, tts_voice: v.tts_voice });
      setName(''); setStyle(''); load();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setCreating(false); }
  };

  // Shared upload path for BOTH a picked file and an in-app recording. If the
  // server has a cloning provider wired (ELEVENLABS_API_KEY) we get back a
  // real cloned voice; otherwise it saves the sample and falls back to a Polly
  // preset — the voice still works on calls and auto-upgrades when a key lands.
  const uploadSample = async (file: File, fallbackName: string) => {
    // Match the server cap (server/src/routes/voices.ts MAX_SAMPLE_BYTES).
    if (file.size > 25 * 1024 * 1024) {
      toast('Sample is too big — keep it under 25 MB.', 'err');
      return;
    }
    const voiceName = (name.trim() || fallbackName || 'My voice').slice(0, 40);
    setUploading(true);
    try {
      const v = await api.uploadVoiceSample(file, voiceName, style.trim());
      onPick({ id: v.id, name: v.name, tts_voice: v.tts_voice });
      toast(v.note, v.cloned ? 'ok' : 'info');
      setName(''); setStyle(''); load();
    } catch (err: any) {
      // Surface the actual server response (status + body) — a bare "500" with
      // no clue why cloning failed is useless.
      toast(`Voice upload failed — ${String(err?.message || err)}`, 'err');
    } finally {
      setUploading(false);
    }
  };

  // File-upload path. Name auto-fills from the filename if the user didn't type
  // one. Some browsers leave file.type blank for m4a/mov — we still accept it;
  // the server infers the extension.
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type && !/^(audio|video)\//.test(file.type)) {
      toast('Pick an audio or video file.', 'err');
      e.target.value = '';
      return;
    }
    const fallback = (file.name.replace(/\.[^.]+$/, '') || 'My voice').slice(0, 40);
    await uploadSample(file, fallback);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Pick a recording container the browser actually supports. Safari only does
  // audio/mp4; Chrome/Firefox prefer audio/webm. The server maps each mime to
  // a file extension and ElevenLabs auto-detects the format.
  const pickRecordMime = (): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  };

  const stopMicStream = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Recording isn’t supported in this browser — upload a file instead.', 'err');
      return;
    }
    // Clear any prior take before starting a new one (also handles Re-record).
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    recordedBlobRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecordMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        recordedBlobRef.current = blob;
        setRecordedUrl(URL.createObjectURL(blob));
        stopMicStream();
        setRecording(false);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSecs(0);
      timerRef.current = setInterval(() => {
        setRecordSecs((s) => {
          const next = s + 1;
          if (next >= MAX_RECORD_SECS) stopRecording(); // auto-stop at the cap
          return next;
        });
      }, 1000);
    } catch (err: any) {
      stopMicStream();
      setRecording(false);
      toast(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access, then try again.'
          : `Couldn’t start recording — ${err?.message || err}`,
        'err',
      );
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const saveRecording = async () => {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `recording.${ext}`, { type: blob.type || 'audio/webm' });
    await uploadSample(file, 'My voice');
    discardRecording();
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    recordedBlobRef.current = null;
    setRecordSecs(0);
  };

  if (!data) return <p className="hint">Loading voices…</p>;
  return (
    <div>
      <p className="hint" style={{ marginBottom: 10 }}>
        {currentName ? <>Using <b>{currentName}</b>. </> : 'No voice set — pick or create one. '}{data.note}
      </p>
      <div className="seg-chips">
        {data.presets.map((p: any) => (
          // Presets have no id — highlight only when currentId is null AND
          // the name matches. Prevents a custom voice that happens to share
          // a preset's name from co-highlighting the preset.
          <button key={p.name}
            className={'seg-chip' + (currentId == null && currentName === p.name ? ' on' : '')}
            onClick={() => onPick({ name: p.name, tts_voice: p.tts_voice })}>
            {p.name} · {p.style}
          </button>
        ))}
        {data.custom.map((c: any) => (
          // Custom voices — match by id only. If two voices share a name
          // (legacy data), only the actually-selected one highlights now.
          <button key={c.id} className={'seg-chip' + (currentId === c.id ? ' on' : '')}
            onClick={() => onPick({ id: c.id, name: c.name, tts_voice: c.tts_voice })}>
            {c.cloned ? '🎙️' : '★'} {c.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Voice name (e.g. Closer)" />
        <input className="input" style={{ flex: 2, minWidth: 160 }} value={style}
          onChange={(e) => setStyle(e.target.value)} placeholder="Style (e.g. deep, confident, persuasive)" />
        <button className="btn pink" onClick={create} disabled={creating || !name.trim()}>
          {creating ? '…' : 'Create voice'}
        </button>
      </div>

      {/* Voice sample — record right here (preferred), or upload a file. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!recording ? (
          <button className="btn" style={{ background: 'var(--red)', color: '#fff' }}
            onClick={startRecording} disabled={uploading || !!recordedUrl}
            title="Record a 15–30s voice sample with your mic to clone.">
            🔴 Record sample
          </button>
        ) : (
          <button className="btn" style={{ background: 'var(--ink)', color: '#fff' }} onClick={stopRecording}>
            ⏹ Stop · {fmtSecs(recordSecs)}
          </button>
        )}
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>or</span>
        <button className="btn lime" onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recording}
          title="Upload a 15–30s clean voice sample (mp3 / wav / m4a / mp4) to clone.">
          {uploading ? 'Uploading…' : '🎙️ Upload file'}
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*,video/*"
          onChange={onFile} style={{ display: 'none' }} />
      </div>

      {/* Preview the take before committing it. */}
      {recordedUrl && !recording && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <audio controls src={recordedUrl} style={{ height: 36, maxWidth: '100%' }} />
          <button className="btn pink" onClick={saveRecording} disabled={uploading}>
            {uploading ? 'Saving…' : '✓ Save & clone'}
          </button>
          <button className="btn ghost" onClick={startRecording} disabled={uploading}>Re-record</button>
          <button className="btn ghost" onClick={discardRecording} disabled={uploading}>Discard</button>
        </div>
      )}

      <p className="hint" style={{ marginTop: 8 }}>
        Tip: 15–30 seconds of clean speech, single speaker, low background noise.
        Record straight from your mic or upload a file. Don't use a voice you don't have rights to.
      </p>
    </div>
  );
}

function SendNumberPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [nums, setNums] = useState<{ phoneNumber: string }[]>([]);
  useEffect(() => { api.listNumbers().then((d: any) => setNums(d.numbers || [])).catch(() => {}); }, []);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 320 }}>
      <option value="">Default (active line)</option>
      {nums.map((n) => <option key={n.phoneNumber} value={n.phoneNumber}>{n.phoneNumber}</option>)}
    </select>
  );
}
