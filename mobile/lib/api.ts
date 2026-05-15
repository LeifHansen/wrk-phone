import Constants from 'expo-constants';

const baseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||                    // EAS Build / dev shell
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ||        // app.json fallback
  'http://localhost:4000';

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
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
  base: baseUrl,
  // conversations
  listConversations: () => request<any[]>('/api/conversations'),
  getMessages: (id: number) => request<{ conversation: any; messages: any[]; agent: Agent | null }>(`/api/conversations/${id}/messages`),
  startConversation: (peer_phone: string, name?: string) =>
    request<{ id: number }>('/api/conversations', { method: 'POST', body: JSON.stringify({ peer_phone, name }) }),
  markRead: (id: number) => request(`/api/conversations/${id}/read`, { method: 'POST' }),
  assignAgent: (convId: number, agentId: number | null) =>
    request(`/api/conversations/${convId}/agent`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) }),
  // sms
  sendSms: (to: string, body: string) =>
    request('/api/sms/send', { method: 'POST', body: JSON.stringify({ to, body }) }),
  approveSuggestion: (id: number) => request(`/api/sms/suggestion/${id}/approve`, { method: 'POST' }),
  dismissSuggestion: (id: number) => request(`/api/sms/suggestion/${id}/dismiss`, { method: 'POST' }),
  // agents
  listAgents: () => request<Agent[]>('/api/agents'),
  getAgent: (id: number) => request<Agent>(`/api/agents/${id}`),
  patchAgent: (id: number, patch: Partial<Agent>) =>
    request<Agent>(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAgent: (id: number) => request(`/api/agents/${id}`, { method: 'DELETE' }),
  makeDefault: (id: number) => request(`/api/agents/${id}/make-default`, { method: 'POST' }),
  agentPresets: () => request<any[]>('/api/agent-presets'),
  createFromPreset: (presetSlug: string, vibeSlug?: string, name?: string) =>
    request<Agent>('/api/agents/from-preset', { method: 'POST', body: JSON.stringify({ presetSlug, vibeSlug, name }) }),
  createFromBrief: (brief: string, name?: string) =>
    request<Agent>('/api/agents/from-brief', { method: 'POST', body: JSON.stringify({ brief, name }) }),
  trainingPrompts: (id: number) => request<{ prompts: string[] }>(`/api/agents/${id}/training-prompts`, { method: 'POST' }),
  optimize: (id: number) => request<{ optimizations: Optimization[] }>(`/api/agents/${id}/optimize`, { method: 'POST' }),
  applyPatch: (id: number, patch: any) =>
    request<Agent>(`/api/agents/${id}/apply-patch`, { method: 'POST', body: JSON.stringify({ patch }) }),
  // routing
  listRules: () => request<RoutingRule[]>('/api/routing-rules'),
  createRule: (payload: { name: string; agent_id: number; conditions: Condition[] }) =>
    request<{ id: number }>('/api/routing-rules', { method: 'POST', body: JSON.stringify(payload) }),
  patchRule: (id: number, patch: Partial<{ name: string; agent_id: number; conditions: Condition[]; enabled: boolean }>) =>
    request(`/api/routing-rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRule: (id: number) => request(`/api/routing-rules/${id}`, { method: 'DELETE' }),
  reorderRules: (ids: number[]) => request('/api/routing-rules/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  testRule: (from: string, body: string, conditions: Condition[]) =>
    request<{ matched: boolean; reason: string }>('/api/routing-rules/test', { method: 'POST', body: JSON.stringify({ from, body, conditions }) }),
  // voice token
  getVoiceToken: (identity: string, platform: 'ios' | 'android' | 'web') =>
    request<{ token: string; identity: string }>('/api/token', {
      method: 'POST',
      body: JSON.stringify({ identity, platform }),
    }),
  // campaigns
  listCampaigns: () => request<any[]>('/api/campaigns'),
  createCampaign: (payload: { name: string; template: string; channel?: string; recipients: { phone: string; name?: string }[] }) =>
    request<{ id: number }>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  sendCampaign: (id: number) => request(`/api/campaigns/${id}/send`, { method: 'POST' }),
  // push
  registerPush: (platform: 'ios' | 'android', token: string) =>
    request('/api/push/register', { method: 'POST', body: JSON.stringify({ platform, token }) }),
};
