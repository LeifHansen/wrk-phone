import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/ai-voice-agents';
const TITLE = 'AI Voice Agents — AI Answering Service | WrkPhn';
const DESC =
  'AI voice agents answer your business calls, screen, take messages, and book appointments — 24/7. The AI answering service that costs less than a single receptionist hour.';
const FAQ = [
  { q: 'What is an AI voice agent?', a: 'An AI voice agent is a phone bot that answers inbound calls in a natural-sounding voice, greets the caller in your business\'s voice, takes a message (or books an appointment, captures a lead, routes the call), and transcribes everything to your inbox.' },
  { q: 'How is this different from a phone tree (IVR)?', a: 'A phone tree forces callers to press buttons through a rigid menu. An AI voice agent has a conversation — it understands what the caller wants and responds. No menus, no waiting, no "press 1 for billing".' },
  { q: 'Can an AI voice agent book appointments?', a: 'Yes. Per-agent voicemail/answering mode: Off (default carrier greeting), Suggest (AI generates the greeting), or Auto (full conversational answering). Recordings transcribed straight to your inbox as a message.' },
  { q: 'Is it a real phone number or a virtual number?', a: 'A real, callable, textable business number on Twilio\'s carrier-grade network. Calls ring your AI voice agent (or your softphone, on web/mobile) — same number for everything.' },
  { q: 'What about cost?', a: 'Free to start. Calls and voice usage are pay-as-you-go in credits — typically a fraction of a single hour of a human receptionist per month.' },
];

export function AiVoiceAgents() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn AI Voice Agents', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="AI voice agents"
      h1="AI voice agents that answer every call — 24/7."
      intro="AI voice agents answer your business calls in a natural voice, screen and route, take messages, and book appointments. The AI answering service that costs less than a single receptionist hour."
      benefits={[
        { icon: '☎️', title: 'Answer every call', body: 'Never miss a lead — AI voice agent picks up when you can\'t, in your business\'s voice, 24/7.' },
        { icon: '🗒️', title: 'Voicemail with AI greeting', body: 'Per-agent greeting modes: off / AI-suggest / full auto. Recordings transcribed to your inbox as messages.' },
        { icon: '🤝', title: 'Live ring + fallback', body: 'Calls ring your softphone first (web or mobile); fall back to AI voicemail if you can\'t answer.' },
        { icon: '🎙️', title: 'Pick the voice', body: 'Choose a TTS voice that matches your brand. Polly / OpenAI voices, configurable per agent.' },
        { icon: '📝', title: 'Transcription + history', body: 'Every call logged with duration, status, and (for voicemails) full transcription — searchable in the inbox.' },
        { icon: '💰', title: 'Cheaper than a receptionist', body: 'A part-time receptionist runs $1,500+/month. Most small businesses pay under $30/month for unlimited AI answering on WrkPhn.' },
      ]}
      how={[
        { n: '1', t: 'Pick your number', d: 'Provision a real business number — local or toll-free.' },
        { n: '2', t: 'Set up your voice agent', d: 'Pick voicemail mode, choose a voice, give the agent a persona and a few rules.' },
        { n: '3', t: 'Forward or use as primary', d: 'Use WrkPhn as your main business line, or forward an existing number to it.' },
      ]}
      deep={[
        { h2: 'Why an AI voice agent beats voicemail', body: [
          'Voicemail is a leak. Industry data says 80% of callers hang up on voicemail; for a service business that\'s a missed booking, a lost quote, a customer who already called your competitor. An AI voice agent answers the call live — greets the caller, listens to what they need, captures the details that actually matter (name, callback number, service requested, time window), and either books on the spot or hands you a clean handoff in your inbox.',
          'For after-hours and weekends, the difference is even starker. A 9-to-5 business with WrkPhn AI voice agents effectively becomes 24/7 — every after-hours call gets answered, every customer gets the feeling that a real human is on the other end, and you get the cleanest possible message when you check your inbox the next morning.',
        ]},
        { h2: 'How AI voice agents fit alongside AI text agents', body: [
          'WrkPhn isn\'t two products glued together — it\'s one shared line. The same agent persona (your business voice, your rules, your examples) drives both the AI text agent that handles SMS and the AI voice agent that greets callers. So when a customer who texted you yesterday calls you today, the greeting, the tone, and the rules they hit are consistent. One business voice across every channel.',
        ]},
      ]}
      related={[
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'Same idea, for inbound SMS.' },
        { to: '/business-sms-app', label: 'Business SMS app', blurb: 'The shared inbox where call transcripts and texts live together.' },
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Outbound text marketing on the same line.' },
      ]}
      faq={FAQ}
      ctaHeadline="Stop missing calls. Tonight."
      ctaSub="AI voice agent live in 5 minutes. No hardware."
    />
  );
}
