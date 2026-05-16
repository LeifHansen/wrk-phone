import { Device, Call } from '@twilio/voice-sdk';
import { api } from './api';

let device: Device | null = null;
let activeCall: Call | null = null;

function logErr(scope: string, msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[voice] ${scope}: ${msg}`, extra ?? '');
}
function logInfo(scope: string, msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[voice] ${scope}: ${msg}`, extra ?? '');
}

export async function ensureDevice(identity = 'demo'): Promise<Device> {
  if (device) return device;
  try {
    const { token } = await api.getVoiceToken(identity);
    device = new Device(token, { codecPreferences: ['opus' as any, 'pcmu' as any], logLevel: 1 });
    device.on('error', (e: any) =>
      logErr('device', `Twilio device error ${e?.code ?? ''} — ${e?.message ?? e}`, e));
    device.on('registered', () => logInfo('device', 'registered'));
    device.on('unregistered', () => logInfo('device', 'unregistered'));
    device.on('tokenWillExpire', async () => {
      try {
        const fresh = await api.getVoiceToken(identity);
        device!.updateToken(fresh.token);
        logInfo('device', 'token refreshed');
      } catch (e) { logErr('device', 'token refresh failed', e); }
    });
    await device.register();
    return device;
  } catch (e) {
    logErr('ensureDevice', 'could not init/register device', e);
    device = null;
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
  logInfo('placeCall', `connecting to ${to}`);
  try {
    activeCall = await dev.connect({ params: { To: to } });
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
  ensureDevice()
    .then((dev) => dev.on('incoming', (call: Call) => { wireCall(call, 'incoming'); cb(call); }))
    .catch((e) => logErr('onIncoming', 'device unavailable', e));
}
