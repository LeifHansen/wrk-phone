import { MarketingPage, serviceLd, faqLd } from '../../components/MarketingPage';

const URL = 'https://wrkphn.com/ai-text-agents';
const TITLE = 'AI Text Agents for Business SMS | WrkPhn';
const DESC =
  'AI text agents that reply to customer SMS in your voice — 24/7. Custom personas, rules, and examples. Suggest or autopilot per conversation. Live in minutes.';
const FAQ = [
  { q: 'What is an AI text agent?', a: 'An AI text agent is an autonomous assistant that reads inbound SMS and replies in your business\'s voice. WrkPhn agents support suggest mode (queue a reply for you to approve) or autopilot (send automatically). You can have multiple agents — one for sales, one for support, one for after-hours.' },
  { q: 'How do I train an AI text agent?', a: 'Pick a preset (Sales, Personal, Recruiter, Support, Side Hustle, Custom) and a vibe (Chill, Direct, Hype, ...). Add a few example messages and replies. Add rules ("don\'t book past 6pm", "escalate billing"). That\'s it — typically under 5 minutes.' },
  { q: 'Can different conversations use different AI agents?', a: 'Yes. Routing rules send inbound to the right agent automatically based on keyword, AI intent classification, sender, area code, or time of day. You can also manually assign an agent to any thread.' },
  { q: 'Is my AI text agent safe?', a: 'Safety: certain message patterns (legal threats, sensitive content) automatically force the AI to suggest-only, not autosend. You can also force suggest-only globally per agent.' },
  { q: 'Will it sound like me?', a: 'AI text agents are configured with your persona, a tone vibe, your example replies, and your hard rules. The more examples you give, the closer it tracks. Optimize mode analyzes recent traffic and suggests tone/rule tweaks.' },
];

export function AiTextAgents() {
  return (
    <MarketingPage
      seo={{ title: TITLE, description: DESC, canonical: URL, jsonLd: [
        serviceLd('WrkPhn AI Text Agents', DESC, URL),
        faqLd(FAQ),
      ]}}
      eyebrow="AI text agents"
      h1="AI text agents that reply to customer SMS in your voice."
      intro="Custom AI text agents read every inbound SMS and reply in your business's voice — suggest mode for approval or full autopilot per conversation. Like an AI receptionist that never sleeps."
      benefits={[
        { icon: '🤖', title: 'Multiple agents per line', body: 'Run a Sales agent, a Support agent, and an after-hours agent on the same number — routed automatically.' },
        { icon: '🎚️', title: 'Suggest or autopilot', body: 'Per-agent mode (off / suggest / auto) and per-thread autopilot override. Trust grows gradually.' },
        { icon: '🧠', title: 'AI intent routing', body: 'Routing rules can match on keyword, sender, area code, time-of-day, or AI-classified intent. First match wins, sticks to the conversation.' },
        { icon: '✨', title: 'One-tap Optimize', body: 'Optimize analyzes recent traffic and suggests structured patches — new rules, tone tweaks, fresh few-shot examples. One-click to apply.' },
        { icon: '🛡️', title: 'Safety-first', body: 'Sensitive patterns automatically force suggest-only, not autosend. Force-suggest globally on any agent.' },
        { icon: '🎓', title: 'Quick-train mode', body: 'AI generates 3 realistic inbounds your agent might receive — you type how you\'d actually reply. Saved as a few-shot example.' },
      ]}
      how={[
        { n: '1', t: 'Pick a preset', d: 'Sales, Personal, Recruiter, Support, Side Hustle, or Custom. Each comes with starter rules and examples.' },
        { n: '2', t: 'Pick a vibe', d: 'Chill / Direct / Hype / and more — anchors the agent\'s tone.' },
        { n: '3', t: 'Add examples + rules', d: 'A few real replies you\'d send + 3–5 rules ("don\'t share address", "never quote prices"). Done.' },
        { n: '4', t: 'Watch it work', d: 'Start in suggest mode, flip threads to autopilot when you trust it.' },
      ]}
      deep={[
        { h2: 'What an AI text agent actually does', body: [
          'When a text lands on your WrkPhn number, the AI text agent assigned to that conversation reads the inbound, considers the conversation history (last several messages), checks the rules you set, and drafts a reply. In suggest mode the reply appears in the WrkPhn inbox for you to approve, edit, or dismiss. In autopilot mode it sends immediately and threads it back to the customer like any other text.',
          'Each agent has a persona ("friendly, no-bullshit, gets to the point"), instructions ("you handle service questions for a salon"), a list of rules you don\'t want broken, and few-shot examples (an inbound + how you\'d reply). The more you give it, the closer it tracks. There\'s also a tiered safety regex — certain message patterns force the agent into suggest-only mode regardless of the global setting, so legal threats, sensitive content, or strong negative sentiment always go through you.',
        ]},
        { h2: 'Routing: the right agent for the right conversation', body: [
          'Most "AI texting" tools have ONE agent per account. That\'s fine until your sales tone and your support tone need to be different, or until you want an after-hours agent that only books appointments. WrkPhn supports unlimited agents per line, and routing rules pick the right one automatically. Rule conditions: keyword match, AI intent classification, sender (known/unknown), specific number, area code, day-of-week + HH:MM range. AND-joined within a rule, prioritized across rules. First match wins; that agent sticks to the conversation.',
          'Cheap conditions (keyword, sender, area code, time) are evaluated first per rule. If all cheap conditions pass and there\'s an AI intent condition, the intent goes into a batched OpenAI call — 5 intent rules on a single inbound is ONE OpenAI call, not 5. So routing stays fast and cheap even with a complex ruleset.',
        ]},
      ]}
      related={[
        { to: '/ai-voice-agents', label: 'AI voice agents', blurb: 'Same idea, for inbound phone calls.' },
        { to: '/sms-marketing-app', label: 'SMS marketing app', blurb: 'Pair with AI agents to handle every campaign reply.' },
        { to: '/business-sms-app', label: 'Business SMS app', blurb: 'The shared inbox your agents live inside.' },
        { to: '/text-marketing-app', label: 'Text marketing app', blurb: 'AI follow-up on every text campaign.' },
      ]}
      faq={FAQ}
      ctaHeadline="Put an AI text agent on your business line tonight."
      ctaSub="Free to start. Live in minutes."
    />
  );
}
