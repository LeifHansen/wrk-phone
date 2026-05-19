import { Device, Call } from '@twilio/voice-sdk';
import { api } from './api';

let device: Device | null = null;
let activeCall: Call | null = null;
let incomingCb: ((call: Call) => void) | null = null;
let currentIdentity: string | null = null;

function logErr(scope: string, msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[voice] ${scope}: ${msg}`, extra ?? '');
}
function logInfo(scope: string, msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[voice] ${scope}: ${msg}`, extra ?? '');
}

// Destroy the device and drop all registration/listeners. Call on logout so
// a re-login doesn't keep a Device holding a stale JWT/identity.
export function teardownDevice() {
  try { activeCall?.disconnect(); } catch { /* noop */ }
  activeCall = null;
  if (device) {
    try { device.destroy(); } catch (e) { logErr('teardownDevice', 'destroy threw', e); }
    logInfo('teardownDevice', 'device destroyed');
  }
  device = null;
  currentIdentity = null;
}

export async function ensureDevice(identity = 'demo'): Promise<Device> {
  // Reuse only if it's the SAME identity. A different identity (re-login as
  // another account) must get a fresh device — the old one is bound to the
  // previous JWT/registration.
  if (device && currentIdentity === identity) return device;
  if (device && currentIdentity !== identity) teardownDevice();
  try {
    const { token } = await api.getVoiceToken(identity);
    device = new Device(token, { codecPreferences: ['opus' as any, 'pcmu' as any], logLevel: 1 });
    device.on('error', (e: any) =>
      logErr('device', `Twilio device error ${e?.code ?? ''} — ${e?.message ?? e}`, e));
    device.on('registered', () => logInfo('device', 'registered'));
    device.on('unregistered', () => logInfo('device', 'unregistered'));
    // Registered exactly once for the device's lifetime. onIncoming() only
    // swaps the stored callback, so repeat effect runs (React StrictMode)
    // can't stack listeners and double-accept the same call.
    device.on('incoming', (call: Call) => {
      wireCall(call, 'incoming');
      incomingCb?.(call);
    });
    device.on('tokenWillExpire', async () => {
      try {
        const fresh = await api.getVoiceToken(identity);
        device!.updateToken(fresh.token);
        logInfo('device', 'token refreshed');
      } catch (e) { logErr('device', 'token refresh failed', e); }
    });
    await device.register();
    currentIdentity = identity;
    return device;
  } catch (e) {
    logErr('ensureDevice', 'could not init/register device', e);
    device = null;
    currentIdentity = null;
    throw e;
  }
}

function wireCall(call: Call, label: string) {
  call.on('accept', () => logInfo(label, 'accepted'));
  call.on('ringing', () => logInfo(label, 'ringing'));
  call.on('reconnecting', (e: any) => logErr(label, 'reconnecting', e));
  call.on('cancel', () => logInfo(label, 'canceled (ended before connect)'));
  call.on('reject', () => logInfo(label, 'rejected'));
  call.on('disconnect', () => logInfo(label, 'disconnected'));
  call.on('error', (e: any) =>
    logErr(label, `call error ${e?.code ?? ''} — ${e?.message ?? e}`, e));
}

export async function placeCall(to: string): Promise<Call> {
  const dev = await ensureDevice();
  // Pass the user's selected shared-pool number as caller ID.
  let from = '';
  try { from = (await api.activeNumber()).activeNumber || ''; } catch { /* fall back server-side */ }
  logInfo('placeCall', `connecting to ${to}${from ? ` from ${from}` : ''}`);
  try {
    activeCall = await dev.connect({ params: { To: to, From: from } });
    wireCall(activeCall, 'outgoing');
    return activeCall;
  } catch (e) {
    logErr('placeCall', `connect failed for ${to}`, e);
    throw e;
  }
}

export function hangup() {
  try { activeCall?.disconnect(); } catch (e) { logErr('hangup', 'disconnect threw', e); }
  activeCall = null;
}

export function mute(m: boolean) {
  try { activeCall?.mute(m); } catch (e) { logErr('mute', 'mute threw', e); }
}

export function getActive(): Call | null {
  return activeCall;
}

export function onIncoming(cb: (call: Call) => void) {
  incomingCb = cb;
  ensureDevice().catch((e) => logErr('onIncoming', 'device unavailable', e));
}
