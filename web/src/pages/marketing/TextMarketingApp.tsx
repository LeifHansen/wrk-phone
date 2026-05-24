import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/text-marketing-app';
const TITLE = 'Text Marketing App with AI Replies | WrkPhn';
const DESC =
  'WrkPhn is the text marketing app that sends and REPLIES. Send personalized text-marketing campaigns and let an AI text agent handle every response, 24/7.';
const FAQ = [
  { q: 'What is a text marketing app?', a: 'A text marketing app lets you send promotional or transactional text messages to a list of customers and track results. WrkPhn adds an AI text agent that replies to inbound on your behalf, so a campaign becomes a conversation, not just a blast.' },
  { q: 'Is this text marketing app good for small business?', a: 'Yes. WrkPhn is built for solopreneurs, contractors, salons, clinics, and small agencies who want pro-grade text marketing without enterprise pricing or a 90-day onboarding.' },
  { q: 'Can I personalize each text?', a: 'Yes — use {{name}} (and any custom field) in the campaign template; WrkPhn merges per-recipient at send time.' },
  { q: 'What happens when a customer replies?', a: 'Inbound replies land in the WrkPhn shared inbox and your AI text agent drafts (or sends) a context-aware response in your brand voice. You can flip any thread to full autopilot.' },
  { q: 'Is it really cheap?', a: 'Free to start, $5 buys 500 message segments, no contract, no minimum. Most small businesses spend less in a month on WrkPhn than a single hour of a virtual assistant.' },
];

export function TextMarketingApp() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn Text Marketing App', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="Text marketing app"
      h1="The text marketing app that replies for you."
      intro="Send personalized text marketing campaigns to your contacts and let WrkPhn's AI text agent handle every reply — 24/7, in your voice. Cheap, compliant, no contract."
      benefits={[
        { icon: '✍️', title: 'Drag-and-drop text campaigns', body: 'Compose, personalize with merge fields, and send to your whole list, a segment, or a pasted CSV.' },
        { icon: '🤖', title: 'AI replies to inbound', body: 'Replies don\'t pile up — your AI text agent answers in your voice or queues a one-tap suggestion for you to approve.' },
        { icon: '📇', title: 'Native contact + segment manager', body: 'No external CRM required. Tag contacts, build segments, and target campaigns without leaving the app.' },
        { icon: '🖼️', title: 'MMS + AI image generation', body: 'Attach an image or describe one — AI generates a campaign visual that matches your brand.' },
        { icon: '🛡️', title: 'Carrier compliant', body: 'Automatic STOP / HELP, opt-out enforcement, 10DLC and toll-free verification walkthroughs.' },
        { icon: '📲', title: 'Web + iOS + Android', body: 'Send from your laptop, your iPhone, or your Android — same number, same threads, same agents.' },
      ]}
      how={[
        { n: '1', t: 'Pick your number', d: 'A real text-capable business number, ready in seconds.' },
        { n: '2', t: 'Bring contacts', d: 'Upload, sync from your phone, or build segments from inbox conversations.' },
        { n: '3', t: 'Send & let AI follow up', d: 'Compose, send, and watch replies handled by an AI text agent trained on your business.' },
      ]}
      deep={[
        { h2: 'Text marketing without the busywork', body: [
          'Most text marketing apps stop at "send." That\'s the easy half. The hard half is the replies — the customer who asks "do you take Amex?" twenty minutes after your promo lands, or the one who wants to know if you ship to Canada at 11pm on a Sunday. With WrkPhn, those don\'t become tomorrow\'s problem. Your AI text agent reads the campaign context, knows your business, and answers in your brand voice — same minute, no overtime, no missed lead.',
          'For agencies and small teams, this means one operator can run text marketing for ten clients without drowning in inbound. For a solopreneur, it\'s the difference between sending a campaign and being able to step away from your phone for the rest of the night.',
        ]},
        { h2: 'Cheaper than a part-time assistant', body: [
          'A part-time virtual assistant who could even read your text replies runs $200–$600/month. WrkPhn is free to start and most active small businesses run under $50/month in credits. You get the same coverage (24/7), faster reply times, and an answer that\'s actually consistent with your brand.',
        ]},
      ]}
      related={[
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Same product, framed for SMS-first searchers.' },
        { to: '/text-campaigns', label: 'Text campaigns', blurb: 'Single-send campaign tool with segmentation and tracking.' },
        { to: '/ai-text-agents', label: 'AI text agents', blurb: 'The AI doing the reply work in the background.' },
        { to: '/ai-voice-agents', label: 'AI voice agents', blurb: 'The same idea, but for inbound phone calls.' },
      ]}
      faq={FAQ}
      ctaHeadline="Run text marketing that actually replies."
      ctaSub="Free to start. AI follow-up included."
    />
  );
}
