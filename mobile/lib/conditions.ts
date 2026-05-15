import { Condition } from './api';

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'keyword':      return `contains ${c.mode === 'all' ? 'ALL' : 'ANY'} of: ${c.terms.join(', ')}`;
    case 'sender':       return `from a ${c.match} contact`;
    case 'sender_phone': return `from ${c.value}`;
    case 'area_code':    return `from area code ${c.value}`;
    case 'time':         return `${(c.days || []).join('/') || 'any day'} ${c.start}–${c.end}`;
    case 'intent':       return `AI intent: "${c.description}"`;
  }
}

export const CONDITION_PRESETS: { type: Condition['type']; label: string; emoji: string; blurb: string; defaults: Condition }[] = [
  {
    type: 'keyword', label: 'Contains words', emoji: '🔤',
    blurb: 'Match if the message contains certain words.',
    defaults: { type: 'keyword', terms: [], mode: 'any' } as Condition,
  },
  {
    type: 'intent', label: 'AI understands intent', emoji: '🧠',
    blurb: 'Let AI decide based on a description (slower; uses OpenAI).',
    defaults: { type: 'intent', description: '' } as Condition,
  },
  {
    type: 'sender', label: 'New / known contact', emoji: '👤',
    blurb: 'Cold inbound vs. someone in your contacts.',
    defaults: { type: 'sender', match: 'unknown' } as Condition,
  },
  {
    type: 'area_code', label: 'Area code', emoji: '📍',
    blurb: 'Match by US area code (e.g. 415).',
    defaults: { type: 'area_code', value: '' } as Condition,
  },
  {
    type: 'sender_phone', label: 'Specific number', emoji: '☎️',
    blurb: 'Match a single phone number.',
    defaults: { type: 'sender_phone', value: '' } as Condition,
  },
  {
    type: 'time', label: 'Time of day', emoji: '🕒',
    blurb: 'Match by day of week + hours.',
    defaults: { type: 'time', days: ['mon','tue','wed','thu','fri'], start: '09:00', end: '17:00', tz: 'America/Los_Angeles' } as Condition,
  },
];
