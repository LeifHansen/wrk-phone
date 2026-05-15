async function req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Agent {
  id: number;
  name: string;
  emoji: string;
  color: string;
  role: string | null;
  persona: string;
  instructions: string;
  examples: { in: string; out: string }[];
  rules: string[];
  mode: 'off' | 'suggest' | 'auto';
  voice_mode: 'off' | 'suggest' | 'auto';
  is_default: number;
  conversations?: number;
  ai_sent_7d?: number;
}
export type Condition =
  | { type: 'keyword'; terms: string[]; mode?: 'any' | 'all' }
  | { type: 'sender'; match: 'unknown' | 'known' }
  | { type: 'sender_phone'; value: string }
  | { type: 'area_code'; value: string }
  | { type: 'time'; days: string[]; start: string; end: string; tz?: string }
  | { type: 'intent'; description: string };

export interface RoutingRule {
  id: number;
  name: string;
  enabled: number;
  priority: number;
  conditions: Condition[];
  agent_id: number;
  agent_name?: string;
  agent_emoji?: string;
  agent_color?: string;
  match_count: number;
  last_matched_at: number | null;
}

export interface Optimization {
  id: string;
  type: 'persona' | 'instructions' | 'rules' | 'example' | 'mode';
  title: string;
  rationale: string;
  patch: any;
}

export const api = {
  // conversations
  listConversations: () => req<any[]>('/api/conversations'),
  getMessages: (id: number) => req<{ conversation: any; messages: any[]; agent: Agent | null }>(`/api/conversations/${id}/messages`),
  startConversation: (peer_phone: string, name?: string) =>
    req<{ id: number }>('/api/conversations', { method: 'POST', body: JSON.stringify({ peer_phone, name }) }),
  markRead: (id: number) => req(`/api/conversations/${id}/read`, { method: 'POST' }),
  assignAgent: (convId: number, agentId: number | null) =>
    req(`/api/conversations/${convId}/agent`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) }),
  // sms
  sendSms: (to: string, body: string) =>
    req('/api/sms/send', { method: 'POST', body: JSON.stringify({ to, body }) }),
  approveSuggestion: (id: number) => req(`/api/sms/suggestion/${id}/approve`, { method: 'POST' }),
  dismissSuggestion: (id: number) => req(`/api/sms/suggestion/${id}/dismiss`, { method: 'POST' }),
  // agents
  listAgents: () => req<Agent[]>('/api/agents'),
  getAgent: (id: number) => req<Agent>(`/api/agents/${id}`),
  patchAgent: (id: number, patch: Partial<Agent>) => req<Agent>(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAgent: (id: number) => req(`/api/agents/${id}`, { method: 'DELETE' }),
  makeDefault: (id: number) => req(`/api/agents/${id}/make-default`, { method: 'POST' }),
  agentPresets: () => req<any[]>('/api/agent-presets'),
  createFromPreset: (presetSlug: string, vibeSlug?: string, name?: string) =>
    req<Agent>('/api/agents/from-preset', { method: 'POST', body: JSON.stringify({ presetSlug, vibeSlug, name }) }),
  createFromBrief: (brief: string, name?: string) =>
    req<Agent>('/api/agents/from-brief', { method: 'POST', body: JSON.stringify({ brief, name }) }),
  trainingPrompts: (id: number) => req<{ prompts: string[] }>(`/api/agents/${id}/training-prompts`, { method: 'POST' }),
  optimize: (id: number) => req<{ optimizations: Optimization[] }>(`/api/agents/${id}/optimize`, { method: 'POST' }),
  applyPatch: (id: number, patch: any) =>
    req<Agent>(`/api/agents/${id}/apply-patch`, { method: 'POST', body: JSON.stringify({ patch }) }),
  // routing
  listRules: () => req<RoutingRule[]>('/api/routing-rules'),
  createRule: (payload: { name: string; agent_id: number; conditions: Condition[] }) =>
    req<{ id: number }>('/api/routing-rules', { method: 'POST', body: JSON.stringify(payload) }),
  patchRule: (id: number, patch: any) =>
    req(`/api/routing-rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRule: (id: number) => req(`/api/routing-rules/${id}`, { method: 'DELETE' }),
  reorderRules: (ids: number[]) => req('/api/routing-rules/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  testRule: (from: string, body: string, conditions: Condition[]) =>
    req<{ matched: boolean; reason: string }>('/api/routing-rules/test', { method: 'POST', body: JSON.stringify({ from, body, conditions }) }),
  // voice
  getVoiceToken: (identity: string) =>
    req<{ token: string; identity: string }>('/api/token', { method: 'POST', body: JSON.stringify({ identity, platform: 'web' }) }),
  // campaigns
  listCampaigns: () => req<any[]>('/api/campaigns'),
  createCampaign: (payload: any) => req<{ id: number }>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  sendCampaign: (id: number) => req(`/api/campaigns/${id}/send`, { method: 'POST' }),
};

export const AGENT_COLORS = ['lime', 'pink', 'orange', 'neon', 'red', 'black'] as const;
export const COLOR_BG: Record<string, string> = {
  lime:   '#C6F432',
  pink:   '#FF3D9A',
  orange: '#FF6A00',
  neon:   '#2D7CFF',
  red:    '#FF3B30',
  black:  '#0A0A0A',
};
export const COLOR_FG: Record<string, string> = {
  lime: '#0A0A0A', pink: '#FFFFFF', orange: '#FFFFFF', neon: '#FFFFFF', red: '#FFFFFF', black: '#FFFFFF',
};
