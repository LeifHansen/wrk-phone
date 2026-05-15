import twilio from 'twilio';

const env = process.env;

export const twilioClient = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

export const twilioConfig = {
  accountSid: env.TWILIO_ACCOUNT_SID!,
  apiKeySid: env.TWILIO_API_KEY_SID!,
  apiKeySecret: env.TWILIO_API_KEY_SECRET!,
  twimlAppSid: env.TWILIO_TWIML_APP_SID!,
  pushCredentialSidIos: env.TWILIO_PUSH_CREDENTIAL_SID_IOS,
  pushCredentialSidAndroid: env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID,
  messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
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
