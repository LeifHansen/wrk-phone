// Wrk Phone palette
// Primary surfaces: light grey + white. Accents do the heavy lifting.
export const theme = {
  // surfaces
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  bgSubtle: '#F0F0F0',
  divider: '#E5E5E5',

  // text
  text: '#0A0A0A',          // near-black
  textMuted: '#6E6E6E',
  textInverse: '#FFFFFF',

  // bubbles
  bubbleIn: '#EFEFEF',
  bubbleInText: '#0A0A0A',
  bubbleOut: '#0A0A0A',     // outgoing = black bubble, white text — the look
  bubbleOutText: '#FFFFFF',
  bubbleSuggestion: '#F4FFD6',
  bubbleSuggestionBorder: '#C6F432',

  // accents (the 5 + red)
  lime: '#C6F432',
  pink: '#FF3D9A',
  orange: '#FF6A00',
  neon: '#2D7CFF',
  red: '#FF3B30',
  black: '#0A0A0A',

  // semantic mappings
  accent: '#2D7CFF',           // primary CTA = neon blue
  send: '#C6F432',             // send button = lime
  destructive: '#FF3B30',
  success: '#C6F432',
  unreadDot: '#FF3D9A',        // hot pink unread dot — pops on white
};

// Agents pick from this palette. Order matters — used round-robin for new agents.
export const AGENT_COLORS = [
  { name: 'lime',   bg: '#C6F432', fg: '#0A0A0A' },
  { name: 'pink',   bg: '#FF3D9A', fg: '#FFFFFF' },
  { name: 'orange', bg: '#FF6A00', fg: '#FFFFFF' },
  { name: 'neon',   bg: '#2D7CFF', fg: '#FFFFFF' },
  { name: 'red',    bg: '#FF3B30', fg: '#FFFFFF' },
  { name: 'black',  bg: '#0A0A0A', fg: '#FFFFFF' },
] as const;

export type AgentColorName = typeof AGENT_COLORS[number]['name'];
export const colorByName = (n: string) =>
  AGENT_COLORS.find((c) => c.name === n) || AGENT_COLORS[0];

export const radius = { sm: 8, md: 14, lg: 20, xl: 28, bubble: 18 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 };
