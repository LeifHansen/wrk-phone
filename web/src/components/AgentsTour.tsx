import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const KEY = 'wrk_agents_tour_done_v1';

export function shouldShowAgentsTour() {
  try { return !localStorage.getItem(KEY); } catch { return false; }
}
function markDone() {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
}

interface Step { icon: string; title: string; body: string }

const STEPS: Step[] = [
  {
    icon: '🤖',
    title: 'Meet your agents',
    body:
      'Agents are AI teammates that handle your work line for you — replying to ' +
      'texts and answering calls in your brand voice, 24/7. You can run several, ' +
      'each for a different job.',
  },
  {
    icon: '⚡',
    title: 'Start with a prebuilt agent',
    body:
      'Tap “+ New agent” and pick a ready-made role (sales, receptionist, ' +
      'support, recruiter…) and a vibe. It comes pre-trained with a persona, ' +
      'rules, and example replies — live in under a minute.',
  },
  {
    icon: '🎚️',
    title: 'Choose how much it does',
    body:
      'Each agent has two modes shown on its card. MSG controls texts, VM ' +
      'controls calls/voicemail. OFF = does nothing, SUGGEST = drafts a reply ' +
      'for you to approve, AUTO = sends on its own.',
  },
  {
    icon: '✍️',
    title: 'Or build your own',
    body:
      'Choose “Custom”, describe your business in one sentence, and AI drafts ' +
      'the whole agent. Then Train it with example questions and Optimize it ' +
      'from real conversations — for both SMS and voice.',
  },
  {
    icon: '🎯',
    title: 'Route & autopilot',
    body:
      'Use Auto-routing to send the right inbound to the right agent, and flip ' +
      'any single conversation to Autopilot when you want an agent to take over ' +
      'a thread completely.',
  },
];

export function AgentsTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = (go?: boolean) => {
    markDone();
    onClose();
    if (go) nav('/agents/new');
  };

  return (
    <>
      <div className="modal-backdrop" onClick={() => finish()} />
      <div className="tour-card" role="dialog" aria-modal="true" aria-label="Agents tutorial">
        <button className="tour-skip" onClick={() => finish()}>Skip</button>
        <div className="tour-icon" aria-hidden="true">{step.icon}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>

        <div className="tour-dots">
          {STEPS.map((_, k) => (
            <span key={k} className={'tour-dot' + (k === i ? ' on' : '')} />
          ))}
        </div>

        <div className="tour-nav">
          {i > 0
            ? <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>
            : <span />}
          {last
            ? <button className="btn lime" onClick={() => finish(true)}>Create my first agent</button>
            : <button className="btn lime" onClick={() => setI(i + 1)}>Next</button>}
        </div>
      </div>
    </>
  );
}
