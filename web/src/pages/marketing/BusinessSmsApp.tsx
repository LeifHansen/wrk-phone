import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/business-sms-app';
const TITLE = 'Business SMS App with AI Replies | WrkPhn';
const DESC =
  'WrkPhn is the business SMS app for small teams: a real business number, an iPhone-style shared inbox, AI text agents, and SMS marketing — all on one line.';
const FAQ = [
  { q: 'What is a business SMS app?', a: 'A business SMS app gives your business a dedicated number for texting customers, keeps conversations in a shared team inbox (instead of someone\'s personal phone), and adds compliance and marketing tooling on top. WrkPhn also includes AI text and voice agents for automatic reply.' },
  { q: 'Do I keep my personal number separate?', a: 'Yes — WrkPhn gives you a separate business number that\'s callable, textable, and lives on your computer + phone via apps. Your personal number stays yours.' },
  { q: 'Can the team share the inbox?', a: 'Yes. Conversations live in a single threaded inbox that any teammate can pick up, with optional per-thread autopilot so an AI agent handles it when nobody\'s online.' },
  { q: 'Does it work on iPhone and Android?', a: 'Yes — web app, iPhone, and Android. Same number, same threads, same agents everywhere.' },
  { q: 'How is it different from Google Voice?', a: 'Google Voice is a free number forwarder. WrkPhn is a full business SMS platform: real Twilio-grade delivery, AI text + voice agents, SMS marketing campaigns, 10DLC compliance, MMS image generation, segmented contacts. Different tool, different price point.' },
];

export function BusinessSmsApp() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn Business SMS App', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="Business SMS app"
      h1="The business SMS app with AI built in."
      intro="A dedicated business number, an iPhone-style shared inbox, AI text and voice agents, and SMS marketing campaigns — all on one work line. Cheap, easy, no contract."
      benefits={[
        { icon: '📱', title: 'Real business number', body: 'A separate, textable number for your business — local or toll-free, ready in seconds.' },
        { icon: '💬', title: 'Shared team inbox', body: 'iPhone Messages look-and-feel. Every text and voicemail threaded by contact, shared across the team.' },
        { icon: '🤖', title: 'AI text agents', body: 'Multiple agents per line — Sales, Support, after-hours. Routed automatically, your tone, your rules.' },
        { icon: '📞', title: 'AI voice answering', body: 'Calls ring your softphone first, fall through to an AI voice agent that greets and takes a message.' },
        { icon: '📣', title: 'SMS marketing', body: 'Send personalized SMS / MMS campaigns to segments. AI handles every reply.' },
        { icon: '🌐', title: 'Web + iOS + Android', body: 'Same line on every device. Browser softphone for calls without your phone.' },
      ]}
      how={[
        { n: '1', t: 'Get your line', d: 'A real business number assigned instantly — no porting, no hardware.' },
        { n: '2', t: 'Set up agents', d: 'Pick a preset, vibe, and a few rules. Your AI text and voice agents are ready in minutes.' },
        { n: '3', t: 'Start talking', d: 'Web, iPhone, Android — text and call from anywhere, with AI handling overflow.' },
      ]}
      deep={[
        { h2: 'A business SMS app, not a hacked personal one', body: [
          'Most small businesses run their texting through someone\'s personal phone — owner, manager, whoever picked up. That doesn\'t scale: nobody else can see the threads, the conversations leave when the person leaves, there\'s zero compliance, and you can\'t do marketing without flooding your friends. WrkPhn is built for that exact problem: a dedicated business SMS app with a real business number, a shared inbox, AI agents that answer when nobody can, and marketing campaigns that don\'t step on your personal threads.',
        ]},
        { h2: 'Built for teams that don\'t want a phone system', body: [
          'You don\'t want a PBX. You don\'t want to call a sales rep to find out the price. You don\'t want a 90-day rollout. WrkPhn is a self-serve business SMS app: sign up, get a number, start texting in five minutes. The whole thing runs in a browser tab (or an app on your phone). When you outgrow the basics — 10DLC for higher throughput, multiple agents, voice answering — those are toggles in the same app, not a different product.',
        ]},
      ]}
      related={[
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Outbound text campaigns on the same line.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'The replies engine for inbound SMS.' },
        { to: '/ai-voice-agents', label: 'AI voice agents', blurb: 'The answering engine for inbound calls.' },
        { to: '/mass-texting-app', label: 'Mass texting app', blurb: 'High-volume outbound, same shared line.' },
      ]}
      faq={FAQ}
      ctaHeadline="Get your business SMS line tonight."
      ctaSub="Free to start. No contract. AI included."
    />
  );
}
