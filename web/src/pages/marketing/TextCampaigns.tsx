import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/text-campaigns';
const TITLE = 'Text Campaigns — Bulk Text + AI Replies | WrkPhn';
const DESC =
  'Send personalized text campaigns to your contact list and let AI handle the replies. WrkPhn is the text campaign tool that does both halves of the conversation.';
const FAQ = [
  { q: 'What\'s a text campaign?', a: 'A text campaign is a personalized text message sent to a list of contacts at once — typically for promotions, announcements, reminders, or booking nudges. WrkPhn adds an AI text agent that answers replies automatically.' },
  { q: 'How many people can I text in one campaign?', a: 'There\'s no hard cap. WrkPhn paces sends to stay under Twilio\'s throughput limits (~10 messages/sec by default, higher with 10DLC). Thousands per campaign works fine.' },
  { q: 'Can I send text campaigns to my whole contact list?', a: 'Yes. Send to your full contact book, a saved segment, or a one-off pasted list of phone numbers — same flow.' },
  { q: 'Will my text campaigns be compliant?', a: 'Yes — STOP/HELP keywords are handled automatically, opt-outs are enforced across all future campaigns, and 10DLC + toll-free verification flows are walkthroughed in-app.' },
  { q: 'How are text campaigns priced?', a: '1 credit per 160-character text segment, 3 credits per MMS recipient. $5 = 500 segments, no subscription.' },
];

export function TextCampaigns() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn Text Campaigns', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="Text campaigns"
      h1="Text campaigns that answer back."
      intro="Send personalized text campaigns to your customers, and let WrkPhn's AI text agent handle every reply in your brand voice. The text campaign tool built to actually finish the conversation."
      benefits={[
        { icon: '📝', title: 'Personalized templates', body: '{{name}} merge tags + custom fields — each recipient gets a text addressed to them.' },
        { icon: '🧩', title: 'Segments + tags', body: 'Filter contacts into named segments and target text campaigns by audience.' },
        { icon: '🤖', title: 'AI text replies', body: 'Every inbound to your campaign is answered in real time by your trained AI text agent.' },
        { icon: '🎨', title: 'MMS + AI image gen', body: 'Add a campaign visual — your upload or an AI-generated image from a prompt.' },
        { icon: '📈', title: 'Real-time delivery', body: 'Per-recipient delivery status pulled from Twilio status callbacks — no guessing what landed.' },
        { icon: '🔒', title: 'Opt-out compliant', body: 'STOP / START / HELP intercepted, opt-outs respected on every future send.' },
      ]}
      how={[
        { n: '1', t: 'Compose', d: 'Name, template (with merge fields), optional MMS image — all in one screen.' },
        { n: '2', t: 'Pick audience', d: 'Full list, a segment, or a one-off paste.' },
        { n: '3', t: 'Send + watch', d: 'Live status per recipient, replies handled by your AI text agent.' },
      ]}
      deep={[
        { h2: 'A text campaign is a conversation, not a broadcast', body: [
          'Email marketers got away with treating campaigns as one-way for two decades because nobody expects an email back. Text is different. When someone gets a text from a business, the reply rate is 7–10x email — they expect to talk back. WrkPhn is the text campaign tool that takes that seriously.',
          'Every text campaign you send is paired with an AI text agent trained on your business. The agent reads each inbound, knows the rules you set (don\'t book past 6pm, escalate billing questions, never promise discounts), and answers in your tone. The conversation continues without you watching the inbox.',
        ]},
        { h2: 'Per-recipient accountability', body: [
          'WrkPhn shows live status for every recipient in a campaign — sent, delivered, undelivered, failed (with the real Twilio error code). When a carrier silently drops messages from an unverified toll-free, you find out within seconds, not after a week of "nothing\'s working." When 30 numbers in a list are invalid, you see them flagged and refunded automatically. The credit ledger always reconciles to exactly what was actually sent.',
        ]},
      ]}
      related={[
        { to: '/sms-campaigns', label: 'SMS campaigns', blurb: 'Same engine, SMS-first wording.' },
        { to: '/mass-texting-app', label: 'Mass texting app', blurb: 'Volume sender positioning.' },
        { to: '/text-marketing-app', label: 'Text marketing app', blurb: 'Marketing-suite positioning.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'Replies engine behind every campaign.' },
      ]}
      faq={FAQ}
      ctaHeadline="Run your first text campaign tonight."
      ctaSub="Free to start, AI replies included."
    />
  );
}
