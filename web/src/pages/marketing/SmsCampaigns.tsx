import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/sms-campaigns';
const TITLE = 'SMS Campaigns with AI Follow-Up | WrkPhn';
const DESC =
  'Run SMS campaigns that get replies — and answer them. WrkPhn pairs every SMS campaign with an AI text agent so every inbound is handled in seconds.';
const FAQ = [
  { q: 'How do SMS campaigns work in WrkPhn?', a: 'Create a draft (name, message template with {{name}} merge fields, optional MMS image), pick recipients (whole list, segment, or pasted CSV), and send. WrkPhn paces delivery, tracks status per recipient, and routes inbound replies to your AI text agent.' },
  { q: 'Can I segment recipients?', a: 'Yes — tag contacts, build named segments, and target campaigns by segment. You can also send to your whole contact book or paste a one-off list.' },
  { q: 'Are SMS campaigns compliant?', a: 'STOP, START and HELP are intercepted on every inbound automatically. Opted-out contacts are skipped on future campaigns without manual list cleanup. WrkPhn supports 10DLC registration and toll-free verification for high-volume senders.' },
  { q: 'What about MMS (image) campaigns?', a: 'Yes — attach an image (or have AI generate one from a prompt) for any campaign. Charged at the standard 3 credits per MMS recipient.' },
  { q: 'How much does an SMS campaign cost?', a: '1 credit per 160-character SMS segment. $5 buys 500 segments. Credits roll over forever, no subscription.' },
];

export function SmsCampaigns() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn SMS Campaigns', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="SMS campaigns"
      h1="SMS campaigns that send and reply — automatically."
      intro="Compose, segment, and send SMS campaigns to your contacts in minutes. When recipients reply, your AI text agent picks up the conversation in your brand voice. Everything tracked, everything compliant."
      benefits={[
        { icon: '✉️', title: 'Personalized templates', body: 'Compose with {{name}} (or any custom field) merge tags — every recipient sees a message addressed to them.' },
        { icon: '🎯', title: 'Segment targeting', body: 'Build saved segments from tags and inbox activity. Target campaigns at the right list, every time.' },
        { icon: '🖼️', title: 'MMS + AI image gen', body: 'Add a campaign image — upload your own or describe it and let AI draw one on-brand.' },
        { icon: '📊', title: 'Live per-recipient status', body: 'Every row updates as Twilio delivers: queued → sent → delivered → failed. No more "did anything go out?"' },
        { icon: '🤖', title: 'AI handles every reply', body: 'Inbound replies are answered in real time by your AI text agent — campaign becomes conversation.' },
        { icon: '🛡️', title: 'Compliance baked in', body: 'STOP/START/HELP intercepted, opt-outs forever, atomic credit reservation per campaign.' },
      ]}
      how={[
        { n: '1', t: 'New campaign', d: 'Pick a name, write a template, optionally generate an MMS image.' },
        { n: '2', t: 'Choose recipients', d: 'Whole contact list, a saved segment, or a one-off pasted list.' },
        { n: '3', t: 'Send and track', d: 'Watch live per-recipient delivery status, reply via your AI agent.' },
      ]}
      deep={[
        { h2: 'A campaign is just the start', body: [
          'Every SMS campaign is a promise. You\'re telling each recipient "I want to hear back from you" — the discount, the announcement, the booking nudge. The problem is most SMS campaign tools treat replies as someone else\'s job. WrkPhn treats them as the whole point.',
          'When you send an SMS campaign through WrkPhn, every reply is handled by an AI text agent trained on YOUR business — the questions you get asked all the time, the tone you use, the rules you don\'t want broken. A 1,000-recipient campaign with a 5% reply rate = 50 conversations that get a same-minute answer instead of waiting until you wake up tomorrow.',
        ]},
        { h2: 'Built to not lose your credits', body: [
          'Most SMS campaign tools have a single failure mode that kills budgets: the send loop crashes mid-blast, half the list is sent, the rest are stuck in "pending" forever, and the credit ledger doesn\'t match reality. WrkPhn reserves the entire campaign cost atomically before sending begins, refunds each recipient that fails (or is opted out), and runs a recovery sweep on every server boot to reset any campaign left in "sending" — refunding unsent credits and flipping it back to draft.',
        ]},
      ]}
      related={[
        { to: '/text-campaigns', label: 'Text campaigns', blurb: 'Same engine, framed for "text" rather than "SMS".' },
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Long-tail SMS-marketing positioning.' },
        { to: '/mass-texting-app', label: 'Mass texting app', blurb: 'Volume-first positioning, same tool.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'The replies engine behind every campaign.' },
      ]}
      faq={FAQ}
      ctaHeadline="Send your first SMS campaign in 5 minutes."
      ctaSub="No contract. AI follow-up included."
    />
  );
}
