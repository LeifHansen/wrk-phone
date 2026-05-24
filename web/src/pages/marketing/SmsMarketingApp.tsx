import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/sms-marketing-app';
const TITLE = 'SMS Marketing App for Small Business | WrkPhn';
const DESC =
  'The AI-powered SMS marketing app for small business. Send compliant SMS campaigns, segment contacts, and let AI follow up automatically — no contract, live in minutes.';
const FAQ = [
  { q: 'What is an SMS marketing app?', a: 'An SMS marketing app lets you send promotional and transactional text messages to a list of contacts. WrkPhn adds AI follow-up so two-way replies are handled automatically, plus built-in opt-out and 10DLC compliance.' },
  { q: 'Is WrkPhn good for small business SMS marketing?', a: 'Yes — WrkPhn is purpose-built for solopreneurs and small teams who want enterprise-grade SMS marketing without the price tag or learning curve. Pay-as-you-go, no contract, no minimum spend.' },
  { q: 'Do you handle STOP / HELP keywords automatically?', a: 'WrkPhn intercepts STOP, START and HELP on every inbound, records the opt-out, and refuses to send to opted-out contacts on future campaigns — no manual list scrubbing.' },
  { q: 'How is this different from Mailchimp or Klaviyo SMS?', a: 'WrkPhn is SMS-first, not an email tool that bolted on texting. You get an AI text agent that can REPLY to inbound texts — the campaign is just the start of the conversation.' },
  { q: 'How much does the SMS marketing app cost?', a: 'WrkPhn is free to start. Campaigns are billed per message segment in credits, with packs starting at $5 for 500 credits. No subscription, no setup fee.' },
];

export function SmsMarketingApp() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn SMS Marketing App', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="SMS marketing app"
      h1="The SMS marketing app for small business — with AI built in."
      intro="WrkPhn is the SMS marketing app that sends compliant text campaigns AND replies for you. Segment contacts, personalize blasts, and let an AI text agent nurture every response. No contract, live in minutes."
      benefits={[
        { icon: '📣', title: 'Bulk SMS campaigns', body: 'Send personalized text-marketing blasts to any list — your full contact book, a saved segment, or a pasted CSV. {{name}} merge fields baked in.' },
        { icon: '🤖', title: 'AI follow-up agent', body: 'When a recipient replies, your AI text agent picks up the conversation in your brand voice — suggest mode for approval or full autopilot.' },
        { icon: '✅', title: 'Compliant by default', body: 'STOP / START / HELP handled automatically. 10DLC and toll-free verification supported. Opt-outs enforced before every send.' },
        { icon: '🖼️', title: 'MMS with AI image gen', body: 'Add an image to any campaign — upload your own or describe it and let AI generate an on-brand visual for you.' },
        { icon: '💸', title: 'Pay as you go', body: 'No minimum spend, no contract, no “contact sales.” $5 buys 500 message segments and they roll over forever.' },
        { icon: '📈', title: 'Real send + delivery tracking', body: 'Per-recipient status (queued / sent / delivered / failed) from Twilio status callbacks — see exactly what landed.' },
      ]}
      how={[
        { n: '1', t: 'Get your number', d: 'A real, two-way business number is provisioned in seconds — no porting, no hardware.' },
        { n: '2', t: 'Import contacts', d: 'Upload a CSV, sync from your phone, or paste a list. Tag into segments for targeting.' },
        { n: '3', t: 'Send your campaign', d: 'Compose with merge fields, optionally add an MMS image, pick a segment, send. AI handles the replies.' },
      ]}
      deep={[
        { h2: 'Why AI changes SMS marketing', body: [
          'Traditional SMS marketing apps are one-way: blast goes out, replies pile up in an inbox no one reads. WrkPhn flips it. Every campaign you send through our SMS marketing app is paired with an AI text agent trained on your business, so when a customer replies "what time do you open?" or "is the sale still on?" — they get a real answer in seconds, not next Tuesday.',
          'That changes the economics. A 1,000-recipient SMS campaign with a 6% reply rate is 60 conversations no one had time to have. With an AI text agent on duty, all 60 get a same-minute reply, and the ones that need a human escalate cleanly. Higher conversion, fewer missed leads, no overtime.',
        ]},
        { h2: 'Compliance, built in', body: [
          'SMS marketing in the US is regulated — 10DLC registration for local numbers, toll-free verification for shared lines, mandatory STOP/HELP handling, opt-in records. WrkPhn does the boring stuff so you don\'t accidentally end up on a carrier blocklist. STOP keywords are intercepted before they reach your inbox, the contact is flagged opted-out, and the next campaign automatically skips them. HELP returns a configurable response. START resubscribes.',
          'For higher throughput, we walk you through the 10DLC sole-proprietor onboarding wizard in-app — it\'s the difference between 1 message per second and 30+.',
        ]},
      ]}
      related={[
        { to: '/text-marketing-app', label: 'Text marketing app', blurb: 'Same product, framed for teams who prefer “text” over “SMS”.' },
        { to: '/sms-campaigns', label: 'SMS campaigns', blurb: 'Single-send campaign tooling with segments and AI image gen.' },
        { to: '/mass-texting-app', label: 'Mass texting app', blurb: 'Send to thousands with throttle-aware delivery and per-recipient tracking.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'The AI that replies on your behalf, in your brand voice.' },
      ]}
      faq={FAQ}
      ctaHeadline="Ship your first SMS campaign today."
      ctaSub="Free to start. No contract. AI follow-up included."
    />
  );
}
