export const auth = {
  get token() { return localStorage.getItem('wrk_token'); },
  set token(v: string | null) { v ? localStorage.setItem('wrk_token', v) : localStorage.removeItem('wrk_token'); },
};

async function req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[api] network error: ${init.method || 'GET'} ${path}`, e);
    throw e;
  }
  if (!res.ok) {
    const body = await res.text();
    // eslint-disable-next-line no-console
    console.error(`[api] ${res.status} on ${init.method || 'GET'} ${path}: ${body}`);
    throw new Error(`${res.status} ${body}`);
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
  voice_id?: number | null;
  voice_name?: string | null;
  tts_voice?: string | null;
  avatar_url?: string | null;
  send_number?: string | null;
  hidden?: number;
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
  // auth
  signup: (email: string, password: string) =>
    req<{ token: string; email: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    req<{ token: string; email: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req<{ userId: string; email: string | null; authenticated: boolean }>('/api/auth/me'),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  // conversations
  listConversations: () => req<any[]>('/api/conversations'),
  getMessages: (id: number) => req<{ conversation: any; messages: any[]; agent: Agent | null }>(`/api/conversations/${id}/messages`),
  startConversation: (peer_phone: string, name?: string) =>
    req<{ id: number }>('/api/conversations', { method: 'POST', body: JSON.stringify({ peer_phone, name }) }),
  markRead: (id: number) => req(`/api/conversations/${id}/read`, { method: 'POST' }),
  deleteConversation: (id: number) => req(`/api/conversations/${id}`, { method: 'DELETE' }),
  setAutopilot: (convId: number, on: boolean, agentId?: number) =>
    req<{ ok: boolean; autopilot: boolean }>(`/api/conversations/${convId}/autopilot`, { method: 'PATCH', body: JSON.stringify({ on, agentId }) }),
  assignAgent: (convId: number, agentId: number | null) =>
    req(`/api/conversations/${convId}/agent`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) }),
  // sms
  sendSms: (to: string, body: string, mediaUrl?: string) =>
    req('/api/sms/send', { method: 'POST', body: JSON.stringify({ to, body, mediaUrl }) }),
  approveSuggestion: (id: number) => req(`/api/sms/suggestion/${id}/approve`, { method: 'POST' }),
  dismissSuggestion: (id: number) => req(`/api/sms/suggestion/${id}/dismiss`, { method: 'POST' }),
  // prank-mode easter egg
  prankReveal: () => req<{ ok: boolean; agent: Agent }>('/api/prank/reveal', { method: 'POST' }),
  prankRedirect: (callSid: string) =>
    req<{ ok: boolean }>('/api/prank/redirect', { method: 'POST', body: JSON.stringify({ callSid }) }),
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

  // ---- Agent calls (outbound AI voice campaigns) ----
  listAgentCalls: () => req<any[]>('/api/agent-calls'),
  getAgentCall: (id: number) => req<{ campaign: any; recipients: any[] }>(`/api/agent-calls/${id}`),
  createAgentCall: (payload: any) => req<{ id: number }>('/api/agent-calls', { method: 'POST', body: JSON.stringify(payload) }),
  // consent must be true — server enforces TCPA acknowledgement before dialing.
  sendAgentCall: (id: number, consent: boolean) =>
    req(`/api/agent-calls/${id}/send`, { method: 'POST', body: JSON.stringify({ consent }) }),
  // contacts
  listContacts: (q?: string, segmentId?: number) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (segmentId) p.set('segmentId', String(segmentId));
    return req<{ id: number; phone: string; name: string; segments: { id: number; name: string }[] }[]>(
      `/api/contacts${p.toString() ? '?' + p : ''}`
    );
  },
  addContact: (phone: string, name?: string) =>
    req<{ id: number; phone: string; name: string }>('/api/contacts', { method: 'POST', body: JSON.stringify({ phone, name }) }),
  deleteContact: (id: number) => req(`/api/contacts/${id}`, { method: 'DELETE' }),
  // segments
  listSegments: () => req<{ id: number; name: string; count: number }[]>('/api/segments'),
  addSegment: (name: string) => req<{ id: number; name: string }>('/api/segments', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteSegment: (id: number) => req(`/api/segments/${id}`, { method: 'DELETE' }),
  addToSegment: (segmentId: number, contactId: number) =>
    req(`/api/segments/${segmentId}/members`, { method: 'POST', body: JSON.stringify({ contactId }) }),
  removeFromSegment: (segmentId: number, contactId: number) =>
    req(`/api/segments/${segmentId}/members/${contactId}`, { method: 'DELETE' }),
  // media
  listMedia: () => req<{ id: number; url: string; prompt: string | null; kind: string }[]>('/api/media'),
  generateImage: (prompt: string) =>
    req<{ id: number; url: string; prompt: string }>('/api/media/generate', { method: 'POST', body: JSON.stringify({ prompt }) }),
  deleteMedia: (id: number) => req(`/api/media/${id}`, { method: 'DELETE' }),
  // AI deliverability tools
  smsLint: (text: string) =>
    req<{ risk: 'low' | 'medium' | 'high'; flags: { term: string; why: string; severity: string }[]; summary: string; degraded?: boolean }>(
      '/api/ai/sms-lint', { method: 'POST', body: JSON.stringify({ text }) }),
  smsOptimize: (text: string, goal?: string) =>
    req<{ optimized: string; changes: string[]; notes: string }>(
      '/api/ai/sms-optimize', { method: 'POST', body: JSON.stringify({ text, goal }) }),
  draftReply: (conversationId: number) =>
    req<{ draft: string; agent: string }>(
      '/api/ai/draft-reply', { method: 'POST', body: JSON.stringify({ conversationId }) }),
  // number provisioning
  searchNumbers: (params: { country?: string; areaCode?: string; contains?: string }) => {
    const q = new URLSearchParams();
    if (params.country) q.set('country', params.country);
    if (params.areaCode) q.set('areaCode', params.areaCode);
    if (params.contains) q.set('contains', params.contains);
    return req<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>(
      `/api/numbers/search?${q.toString()}`
    );
  },
  buyNumber: (phoneNumber: string) =>
    req<{ ok: boolean; number: string; attachedToService: boolean; warnings: string[] }>(
      '/api/numbers/buy', { method: 'POST', body: JSON.stringify({ phoneNumber }) }
    ),
  activeNumber: () =>
    req<{ activeNumber: string | null; onboarded: boolean; isProvisioned: boolean; messagingServiceSid: string | null }>(
      '/api/numbers/active'
    ),
  repairWebhooks: () =>
    req<{ ok: boolean; number: string; webhooks: any; warnings: string[] }>(
      '/api/numbers/repair-webhooks', { method: 'POST' }
    ),
  credits: () =>
    req<{ balance: number; packages: { id: string; credits: number; price: number; label: string; note?: string }[]; rates: { sms: string; mms: string }; testMode?: boolean }>(
      '/api/credits'
    ),
  listVoices: () =>
    req<{ grokAvailable: boolean; elevenlabsAvailable?: boolean; cloningProvider?: string | null; note: string;
      presets: { name: string; style: string; tts_voice: string }[];
      custom: { id: number; name: string; provider: string; tts_voice: string; style: string; sample_url?: string | null; cloned?: number }[] }>(
      '/api/voices'
    ),
  createVoice: (name: string, style: string) =>
    req<{ id: number; name: string; provider: string; tts_voice: string }>(
      '/api/voices', { method: 'POST', body: JSON.stringify({ name, style }) }
    ),
  // Upload a voice sample (audio/short video) and create a cloned voice. If
  // no cloning provider is wired (no ELEVENLABS_API_KEY), the server saves
  // the sample and falls back to a Polly preset — the voice still works on
  // calls and auto-upgrades the moment a provider key is added.
  uploadVoiceSample: async (file: File, name: string, style: string) => {
    const buf = await file.arrayBuffer();
    const res = await fetch('/api/voices/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'audio/mpeg',
        'X-Voice-Name': name,
        'X-Voice-Style': style,
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: buf,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<{ id: number; name: string; provider: string; tts_voice: string; sample_url: string; cloned: number; note: string }>;
  },
  buyCredits: (packageId: string) =>
    req<{ ok: boolean; added: number; balance: number; stub: boolean }>(
      '/api/credits/purchase', { method: 'POST', body: JSON.stringify({ packageId }) }
    ),
  checkout: (packageId: string) =>
    req<{ url: string | null; stub?: boolean; balance?: number; note?: string }>(
      '/api/credits/checkout',
      { method: 'POST', body: JSON.stringify({ packageId, returnUrl: window.location.origin }) }
    ),
  // numbers (multi-line, $2/mo each)
  listNumbers: () => req<{ active: string | null; pricePerMonth: number;
    numbers: { sid: string; phoneNumber: string; friendlyName: string; isActive: boolean }[] }>('/api/numbers/list'),
  setActiveNumber: (sid: string) => req('/api/numbers/set-active', { method: 'POST', body: JSON.stringify({ sid }) }),
  claimNumber: () => req<{ ok: boolean; number: string; sid: string; alreadyHad: boolean }>(
    '/api/numbers/claim', { method: 'POST' }),
  buyAdditional: (phoneNumber: string) =>
    req<{ ok: boolean; number: string; monthly: number; warnings: string[] }>(
      '/api/numbers/buy-additional', { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  // A2P 10DLC
  a2pDraft: (businessDescription: string) =>
    req<any>('/api/a2p/draft', { method: 'POST', body: JSON.stringify({ businessDescription }) }),
  a2pSubmit: (profile: any, pkg: any) =>
    req<{ id: number; status: string; note: string }>('/api/a2p/submit', { method: 'POST', body: JSON.stringify({ profile, package: pkg }) }),
  a2pStatus: () => req<any>('/api/a2p/status'),
  // avatars
  genAvatar: (kind: 'account' | 'agent', agentId?: number, prompt?: string) =>
    req<{ url: string }>('/api/media/avatar', { method: 'POST', body: JSON.stringify({ kind, agentId, prompt }) }),
  // Upload a custom image and assign it as the avatar in one call. `dataUrl`
  // is the result of FileReader.readAsDataURL(file).
  uploadAvatar: async (kind: 'account' | 'agent', dataUrl: string, agentId?: number) => {
    const uploaded = await req<{ url: string }>('/api/media/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, name: `${kind}-avatar` }),
    });
    return req<{ url: string }>('/api/media/avatar', {
      method: 'POST',
      body: JSON.stringify({ kind, agentId, url: uploaded.url }),
    });
  },
  account: () => req<{ avatarUrl: string | null }>('/api/account'),
  // contacts sync (Sheets/Excel)
  importContactsCsv: (csv: string, segmentId?: number) =>
    req<{ synced: number; skipped: number; total: number }>('/api/contacts/import-csv', { method: 'POST', body: JSON.stringify({ csv, segmentId }) }),
  importContactsUrl: (url: string, segmentId?: number) =>
    req<{ synced: number; skipped: number; total: number }>('/api/contacts/import-url', { method: 'POST', body: JSON.stringify({ url, segmentId }) }),
  // recurring billing
  subscribe: (plan: 'a2p' | 'number', ref?: string) =>
    req<{ url: string | null; stub?: boolean; note?: string }>(
      '/api/billing/subscribe',
      { method: 'POST', body: JSON.stringify({ plan, ref, returnUrl: location.origin }) }),
  billingSubs: () => req<{ stripeEnabled: boolean; plans: any; subscriptions: any[] }>('/api/billing/subscriptions'),
  // analytics
  analytics: () => req<any>('/api/analytics'),
  webhookStatus: () =>
    req<{ number: string; publicBaseUrl: string; reachable: boolean; ok: boolean; hint: string; numberCfg: any; serviceCfg: any }>(
      '/api/numbers/webhook-status'
    ),
  // blog (public)
  blogList: () => req<{ posts: BlogCard[] }>('/api/blog'),
  blogGet: (slug: string) => req<BlogPost>(`/api/blog/${slug}`),
  // superadmin
  adminWhoami: () => req<{ superadmin: boolean }>('/api/admin/whoami'),
  adminOverview: () => req<Record<string, number>>('/api/admin/overview'),
  adminBlogList: () => req<{ posts: BlogPost[] }>('/api/admin/blog'),
  adminBlogCreate: (p: Partial<BlogPost>) => req<BlogPost>('/api/admin/blog', { method: 'POST', body: JSON.stringify(p) }),
  adminBlogUpdate: (id: number, p: Partial<BlogPost>) => req<BlogPost>(`/api/admin/blog/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  adminBlogDelete: (id: number) => req(`/api/admin/blog/${id}`, { method: 'DELETE' }),
  adminBlogSettings: () => req<{ settings: BlogSettings; defaultTopics: string[] }>('/api/admin/blog-settings'),
  adminBlogSettingsSave: (s: Partial<BlogSettings>) => req<{ settings: BlogSettings }>('/api/admin/blog-settings', { method: 'PUT', body: JSON.stringify(s) }),
  adminBlogGenerate: () => req<{ ok: boolean; post: BlogPost }>('/api/admin/blog/generate', { method: 'POST' }),
};

export interface BlogCard {
  slug: string; title: string; excerpt: string; tags: string;
  author: string; ai: number; published_at: number | null;
}
export interface BlogPost extends BlogCard {
  id: number; body_html: string; keywords: string;
  status: 'draft' | 'published'; created_at: number; updated_at: number;
}
export interface BlogSettings {
  id: number; enabled: number; cadence_days: number; autopublish: number;
  tone: string; topics: string; last_run_at: number | null;
  next_run_at: number | null; updated_at: number;
}

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
