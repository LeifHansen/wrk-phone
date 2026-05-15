import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api, Agent } from '@/lib/api';
import { theme, spacing, radius, colorByName } from '@/constants/theme';
import { placeCall } from '@/lib/voice';

interface Msg {
  id: number;
  direction: 'in' | 'out';
  body: string;
  status: string;
  created_at: number;
  is_ai: number;
  is_suggestion: number;
  agent_id: number | null;
}

const ts = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const router = useRouter();
  const [conv, setConv] = useState<any>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showAgentSheet, setShowAgentSheet] = useState(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getMessages(convId);
      setConv(res.conversation);
      setMessages(res.messages);
      setAgent(res.agent);
    } catch (e) { console.warn('load convo failed', e); }
  }, [convId]);

  useEffect(() => { load(); api.markRead(convId).catch(() => {}); }, [load, convId]);
  useEffect(() => { const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const openAgentSwitcher = async () => {
    try {
      const list = await api.listAgents();
      setAllAgents(list);
      setShowAgentSheet(true);
    } catch (e: any) { Alert.alert('Failed', e.message); }
  };
  const pickAgent = async (a: Agent | null) => {
    setShowAgentSheet(false);
    try { await api.assignAgent(convId, a?.id ?? null); load(); }
    catch (e: any) { Alert.alert('Failed', e.message); }
  };

  const send = async () => {
    if (!draft.trim() || sending || !conv) return;
    setSending(true);
    const text = draft.trim();
    setDraft('');
    try { await api.sendSms(conv.peer_phone, text); await load(); }
    catch (e: any) { Alert.alert('Send failed', e.message); setDraft(text); }
    finally { setSending(false); }
  };

  const callPeer = async () => {
    if (!conv) return;
    try { await placeCall('demo', conv.peer_phone); router.push('/dialer-call'); }
    catch (e: any) { Alert.alert('Cannot place call', e.message); }
  };

  const approve = async (mid: number) => { try { await api.approveSuggestion(mid); await load(); } catch (e: any) { Alert.alert('Failed', e.message); } };
  const dismiss = async (mid: number) => { try { await api.dismissSuggestion(mid); await load(); } catch (e: any) { Alert.alert('Failed', e.message); } };

  const ac = agent ? colorByName(agent.color) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack.Screen
        options={{
          headerTitle: conv?.peer_phone || '',
          headerRight: () => (
            <Pressable onPress={callPeer} hitSlop={12} style={{ paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 20 }}>📞</Text>
            </Pressable>
          ),
        }}
      />

      {/* Agent on duty header strip */}
      {agent && ac && (
        <Pressable onPress={openAgentSwitcher} style={[styles.agentBar, { backgroundColor: ac.bg }]}>
          <Text style={[styles.agentBarText, { color: ac.fg }]}>
            {agent.emoji} {agent.name} on duty · {agent.mode.toUpperCase()}
          </Text>
          <Text style={[styles.agentBarSwap, { color: ac.fg }]}>Switch ›</Text>
        </Pressable>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            if (item.is_suggestion) {
              return (
                <View style={styles.suggestionWrap}>
                  <Text style={styles.suggestionLabel}>🤖 Suggested reply</Text>
                  <Text style={styles.suggestionText}>{item.body}</Text>
                  <View style={styles.suggestionActions}>
                    <Pressable onPress={() => dismiss(item.id)} style={[styles.suggestionBtn, styles.suggestionBtnGhost]}>
                      <Text style={styles.suggestionBtnGhostText}>Dismiss</Text>
                    </Pressable>
                    <Pressable onPress={() => approve(item.id)} style={[styles.suggestionBtn, styles.suggestionBtnPrimary]}>
                      <Text style={styles.suggestionBtnPrimaryText}>Send</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }
            const out = item.direction === 'out';
            return (
              <View style={[styles.bubbleRow, out ? styles.bubbleRowOut : styles.bubbleRowIn]}>
                <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
                  <Text style={out ? styles.bubbleOutText : styles.bubbleInText}>{item.body}</Text>
                </View>
                <Text style={styles.metaTime}>
                  {ts(item.created_at)}
                  {out && item.is_ai ? ' · 🤖' : ''}
                  {out && item.status ? ` · ${item.status}` : ''}
                </Text>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={theme.textMuted}
            style={styles.composerInput}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Agent quick-switch sheet */}
      <Modal visible={showAgentSheet} animationType="slide" transparent onRequestClose={() => setShowAgentSheet(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAgentSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>On-duty agent</Text>
          {allAgents.map((a) => {
            const c = colorByName(a.color);
            const active = a.id === agent?.id;
            return (
              <Pressable key={a.id} onPress={() => pickAgent(a)} style={[styles.sheetRow, active && { backgroundColor: theme.bgSubtle }]}>
                <View style={[styles.sheetSwatch, { backgroundColor: c.bg }]}>
                  <Text style={{ color: c.fg, fontSize: 22 }}>{a.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetName}>{a.name}</Text>
                  <Text style={styles.sheetMeta}>{a.mode.toUpperCase()}{a.is_default ? ' · default' : ''}</Text>
                </View>
                {active && <Text style={{ fontSize: 22 }}>✓</Text>}
              </Pressable>
            );
          })}
          <Pressable onPress={() => pickAgent(null)} style={styles.sheetRow}>
            <View style={[styles.sheetSwatch, { backgroundColor: theme.bgSubtle }]}><Text>—</Text></View>
            <Text style={styles.sheetName}>Use default agent</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  agentBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  agentBarText: { fontWeight: '800', fontSize: 13 },
  agentBarSwap: { fontWeight: '700', fontSize: 13 },
  bubbleRow: { marginVertical: 2, maxWidth: '80%' },
  bubbleRowIn: { alignSelf: 'flex-start' },
  bubbleRowOut: { alignSelf: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.bubble },
  bubbleIn: { backgroundColor: theme.bubbleIn, borderBottomLeftRadius: 4 },
  bubbleOut: { backgroundColor: theme.bubbleOut, borderBottomRightRadius: 4 },
  bubbleInText: { color: theme.bubbleInText, fontSize: 16 },
  bubbleOutText: { color: theme.bubbleOutText, fontSize: 16 },
  metaTime: { fontSize: 11, color: theme.textMuted, marginTop: 2, marginHorizontal: 6 },
  suggestionWrap: {
    alignSelf: 'flex-end', maxWidth: '85%',
    backgroundColor: theme.bubbleSuggestion,
    borderColor: theme.bubbleSuggestionBorder, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.sm,
  },
  suggestionLabel: { fontSize: 12, color: theme.text, fontWeight: '800', marginBottom: 6 },
  suggestionText: { fontSize: 15, color: theme.text, marginBottom: 10 },
  suggestionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  suggestionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  suggestionBtnGhost: { backgroundColor: 'transparent' },
  suggestionBtnGhostText: { color: theme.textMuted, fontWeight: '700' },
  suggestionBtnPrimary: { backgroundColor: theme.black },
  suggestionBtnPrimaryText: { color: '#fff', fontWeight: '800' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider,
    backgroundColor: theme.bg,
  },
  composerInput: {
    flex: 1, maxHeight: 120, minHeight: 36,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.bgSubtle, borderRadius: 18,
    fontSize: 16, color: theme.text,
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 16, marginLeft: 8, marginBottom: 2,
    backgroundColor: theme.send, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: theme.black, fontSize: 20, fontWeight: '900', marginTop: -2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.bg, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 6,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: theme.divider, borderRadius: 2,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 6 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 },
  sheetSwatch: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetName: { fontSize: 16, fontWeight: '700', color: theme.text },
  sheetMeta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
