import { Device, Call } from '@twilio/voice-sdk';
import { api } from './api';

let device: Device | null = null;
let activeCall: Call | null = null;

export async function ensureDevice(identity = 'demo'): Promise<Device> {
  if (device) return device;
  const { token } = await api.getVoiceToken(identity);
  device = new Device(token, { codecPreferences: ['opus' as any, 'pcmu' as any], logLevel: 1 });
  await device.register();
  device.on('tokenWillExpire', async () => {
    const fresh = await api.getVoiceToken(identity);
    device!.updateToken(fresh.token);
  });
  return device;
}

export async function placeCall(to: string): Promise<Call> {
  const dev = await ensureDevice();
  activeCall = await dev.connect({ params: { To: to } });
  return activeCall;
}

export function hangup() {
  activeCall?.disconnect();
  activeCall = null;
}

export function mute(m: boolean) {
  activeCall?.mute(m);
}

export function getActive(): Call | null {
  return activeCall;
}

export function onIncoming(cb: (call: Call) => void) {
  ensureDevice().then((dev) => dev.on('incoming', cb));
}
