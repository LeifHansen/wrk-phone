import twilio from 'twilio';

const env = process.env;

// Treat unset / blank / leftover "xxxx" placeholder values as absent so they
// never get sent to Twilio (an invalid push credential SID breaks token minting).
function clean(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (!t || /x{4,}/i.test(t) || /placeholder/i.test(t)) return undefined;
  return t;
}

export const twilioClient = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

export const twilioConfig = {
  accountSid: env.TWILIO_ACCOUNT_SID!,
  apiKeySid: env.TWILIO_API_KEY_SID!,
  apiKeySecret: env.TWILIO_API_KEY_SECRET!,
  twimlAppSid: env.TWILIO_TWIML_APP_SID!,
  pushCredentialSidIos: clean(env.TWILIO_PUSH_CREDENTIAL_SID_IOS),
  pushCredentialSidAndroid: clean(env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID),
  messagingServiceSid: clean(env.TWILIO_MESSAGING_SERVICE_SID),
  defaultFrom: env.TWILIO_DEFAULT_FROM_NUMBER!,
};

export function buildVoiceAccessToken(identity: string, platform: 'ios' | 'android' | 'web') {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const pushCredentialSid =
    platform === 'ios'
      ? twilioConfig.pushCredentialSidIos
      : platform === 'android'
        ? twilioConfig.pushCredentialSidAndroid
        : undefined;

  const token = new AccessToken(
    twilioConfig.accountSid,
    twilioConfig.apiKeySid,
    twilioConfig.apiKeySecret,
    { identity, ttl: 3600 }
  );

  const grant = new VoiceGrant({
    outgoingApplicationSid: twilioConfig.twimlAppSid,
    incomingAllow: true,
    pushCredentialSid,
  });
  token.addGrant(grant);
  return token.toJwt();
}
