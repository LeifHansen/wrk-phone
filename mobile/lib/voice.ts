// Thin wrapper around @twilio/voice-react-native-sdk.
// Loaded lazily so the bundler doesn't choke on Expo Go (the SDK requires a dev build).
import { Platform } from 'react-native';
import { api } from './api';

let voiceSingleton: any = null;
let activeCall: any = null;

async function loadSdk() {
  if (voiceSingleton) return voiceSingleton;
  try {
    const mod = await import('@twilio/voice-react-native-sdk');
    voiceSingleton = new mod.Voice();
    return voiceSingleton;
  } catch (e) {
    console.warn('Twilio Voice SDK unavailable (use a custom dev build, not Expo Go):', e);
    return null;
  }
}

export async function registerVoice(identity: string) {
  const voice = await loadSdk();
  if (!voice) return null;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { token } = await api.getVoiceToken(identity, platform);
  await voice.register(token);
  return voice;
}

export async function placeCall(identity: string, to: string) {
  const voice = await loadSdk();
  if (!voice) throw new Error('Voice SDK not available — use a dev build');
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { token } = await api.getVoiceToken(identity, platform);
  activeCall = await voice.connect(token, { params: { To: to } });
  return activeCall;
}

export function hangup() {
  if (activeCall?.disconnect) activeCall.disconnect();
  activeCall = null;
}

export function mute(muted: boolean) {
  if (activeCall?.mute) activeCall.mute(muted);
}

export function getActiveCall() {
  return activeCall;
}
