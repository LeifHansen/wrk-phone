import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/mass-texting-app';
const TITLE = 'Mass Texting App for Business | WrkPhn';
const DESC =
  'Send mass texts to thousands of contacts with throttle-aware delivery, per-recipient tracking, and AI replies. The mass texting app for serious senders.';
const FAQ = [
  { q: 'What is a mass texting app?', a: 'A mass texting app sends the same text message (with optional personalization) to a large list of recipients at once. WrkPhn handles throttling, per-recipient delivery tracking, and AI replies on the back end so the blast doesn\'t become an inbox you can\'t answer.' },
  { q: 'How many texts can I send at once?', a: 'WrkPhn paces sends at ~10 messages per second by default (well under Twilio\'s standard limits) and scales higher with a dedicated 10DLC-registered number. You can send to thousands in one blast — recipients are queued atomically so a transient failure refunds credits, no stuck campaigns.' },
  { q: 'Will my mass texts be marked spam?', a: 'Not if you follow basic hygiene: opted-in lists, identifiable sender, and a STOP option (WrkPhn enforces this automatically). For volume sending, buy a dedicated local number — it comes pre-registered on our approved 10DLC campaign, no paperwork.' },
  { q: 'Can I see who got the message?', a: 'Yes — per-recipient status (queued / sent / delivered / failed) updates live from Twilio\'s delivery callbacks. Failed sends show the exact carrier error.' },
  { q: 'What about replies to a mass text?', a: 'Every reply lands in the WrkPhn inbox and your AI text agent picks them up in your brand voice. No more "60 people responded and I read none of them."' },
];

export function MassTextingApp() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn Mass Texting App', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="Mass texting app"
      h1="The mass texting app built for replies, not just blasts."
      intro="Send mass texts to thousands of contacts with throttle-aware delivery, per-recipient delivery tracking, and an AI text agent that handles every reply. Built for volume senders who actually care what the recipients say back."
      benefits={[
        { icon: '🚀', title: 'Throttle-aware send loop', body: '~10 messages/sec by default, scales with 10DLC. Atomic credit reservation means a crash mid-blast refunds unsent recipients — no stuck campaigns.' },
        { icon: '📊', title: 'Per-recipient delivery status', body: 'Live status from Twilio: queued, sent, delivered, failed (with the real carrier error). No more guessing.' },
        { icon: '🤖', title: 'AI reply at scale', body: 'A 5,000-person blast with a 5% reply rate is 250 conversations. AI text agent handles every one in real time, escalates the tough ones to you.' },
        { icon: '🎯', title: 'Segments + merge fields', body: 'Tag contacts, build segments, and personalize with {{name}} (or any custom field) for opens that don\'t scream "blast."' },
        { icon: '🛡️', title: 'Carrier hygiene', body: 'STOP/HELP intercepted, opt-outs respected forever, and every dedicated number pre-registered on an approved 10DLC campaign.' },
        { icon: '💰', title: 'Pay-as-you-go credits', body: '$5 = 500 segments. No subscription, no minimum, credits never expire.' },
      ]}
      how={[
        { n: '1', t: 'Provision a number', d: 'Pick a local area code or a shared toll-free — your texting line, ready instantly.' },
        { n: '2', t: 'Load your list', d: 'CSV upload, contact sync, or pasted list. Segment by tag for targeting.' },
        { n: '3', t: 'Compose & blast', d: 'Merge fields + optional MMS image + send to your segment. Watch deliveries land in real time.' },
        { n: '4', t: 'AI handles replies', d: 'Inbound responses flow to your shared inbox; AI text agent answers, you supervise.' },
      ]}
      deep={[
        { h2: 'Mass texting is a delivery problem', body: [
          'Anyone can put a list in a CSV. The hard part of mass texting is everything after Send: are messages actually being delivered? Are carriers throttling you? Did a few hundred bounce because the toll-free isn\'t verified yet? WrkPhn surfaces all of it. Every recipient row shows live status from Twilio\'s delivery callbacks, failed sends show the real Twilio error code (not just a vague "failed"), and the campaign reconciles credits per-recipient so a transient blip on one message doesn\'t silently consume the budget of a successful one.',
          'For senders pushing into the 10,000+ range, WrkPhn sells dedicated local numbers that are pre-registered on an approved 10DLC campaign for raised throughput — no onboarding wizard, no filings — or you can stay on the shared toll-free line.',
        ]},
        { h2: 'Survives a crash mid-blast', body: [
          'Most mass texting tools have a dirty secret: if their server restarts mid-blast, your campaign is stuck in "sending" forever, half the list got the message, and the budget is gone. WrkPhn boots and scans for stuck campaigns automatically — any "sending" status from a previous process is reset to draft and the unsent recipients\' credits are refunded. You can re-send cleanly from where it stopped.',
        ]},
      ]}
      related={[
        { to: '/sms-campaigns', label: 'SMS campaigns', blurb: 'Single-send campaign tooling under a different name.' },
        { to: '/text-campaigns', label: 'Text campaigns', blurb: 'For teams who say “text” not “SMS”.' },
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Long-tail marketing positioning of the same tool.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'The replies engine behind every blast.' },
      ]}
      faq={FAQ}
      ctaHeadline="Send 5,000 texts. Answer all 250 replies."
      ctaSub="The mass texting app built for what comes after Send."
    />
  );
}
