// Wrk Phone — RETRO ARCADE / 90s palette (matches web)
// Warm paper surfaces, hard ink borders, lime/arcade accents.
export const theme = {
  // surfaces
  bg: '#ECE6D2',           // warm paper
  surface: '#FBF8EC',      // card
  bgSubtle: '#F3EFDD',
  divider: '#1A1A1A',      // hard ink borders

  // text
  text: '#1A1A1A',
  textMuted: '#6B6757',
  textInverse: '#FBF8EC',

  // bubbles
  bubbleIn: '#FBF8EC',
  bubbleInText: '#1A1A1A',
  bubbleOut: '#BFFF3C',     // outgoing = lime, ink text
  bubbleOutText: '#1A1A1A',
  bubbleSuggestion: '#FFD23F',
  bubbleSuggestionBorder: '#1A1A1A',

  // arcade accents
  lime: '#BFFF3C',
  pink: '#FF4FA3',
  orange: '#FF6A1F',
  neon: '#2E6BFF',
  red: '#FF3B30',
  black: '#1A1A1A',
  yellow: '#FFD23F',

  // semantic
  accent: '#2E6BFF',
  send: '#BFFF3C',
  destructive: '#FF3B30',
  success: '#BFFF3C',
  unreadDot: '#FF4FA3',
};

// Agents pick from this palette. Order matters — used round-robin for new agents.
export const AGENT_COLORS = [
  { name: 'lime',   bg: '#BFFF3C', fg: '#1A1A1A' },
  { name: 'pink',   bg: '#FF4FA3', fg: '#FFFFFF' },
  { name: 'orange', bg: '#FF6A1F', fg: '#FFFFFF' },
  { name: 'neon',   bg: '#2E6BFF', fg: '#FFFFFF' },
  { name: 'red',    bg: '#FF3B30', fg: '#FFFFFF' },
  { name: 'black',  bg: '#1A1A1A', fg: '#FFFFFF' },
] as const;

export type AgentColorName = typeof AGENT_COLORS[number]['name'];
export const colorByName = (n: string) =>
  AGENT_COLORS.find((c) => c.name === n) || AGENT_COLORS[0];

export const radius = { sm: 8, md: 14, lg: 20, xl: 28, bubble: 18 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 };
