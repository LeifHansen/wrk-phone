import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { theme, spacing, radius, colorByName } from '@/constants/theme';

interface Row {
  id: number;
  peer_phone: string;
  name: string | null;
  last_body: string | null;
  last_direction: 'in' | 'out' | null;
  last_message_at: number;
  unread_count: number;
  agent_id: number | null;
  agent_name: string | null;
  agent_emoji: string | null;
  agent_color: string | null;
  agent_mode: 'off' | 'suggest' | 'auto' | null;
}

function formatTime(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (Date.now() - ts < 7 * 86400000)
    return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

const initial = (r: Row) => (r.name || r.peer_phone || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#';

export default function Inbox() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await api.listConversations() as Row[]); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (r.name || '').toLowerCase().includes(q) || r.peer_phone.includes(q) || (r.last_body || '').toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Messages</Text>
        <Pressable onPress={() => router.push('/new-message')} hitSlop={12} style={styles.composeBtn}>
          <Text style={styles.composeIcon}>✎</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          placeholder="Search"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyHint}>Tap the pencil to start a new message.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const ac = item.agent_color ? colorByName(item.agent_color) : null;
          return (
            <Pressable
              onPress={() => router.push(`/conversation/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.bgSubtle }]}
            >
              <View style={styles.unreadDotWrap}>
                {item.unread_count > 0 && <View style={styles.unreadDot} />}
              </View>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial(item)}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.bodyTopRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name || item.peer_phone}
                  </Text>
                  <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
                </View>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.last_direction === 'out' ? 'You: ' : ''}{item.last_body || ' '}
                </Text>
                {ac && item.agent_mode !== 'off' && (
                  <View style={[styles.agentChip, { backgroundColor: ac.bg }]}>
                    <Text style={[styles.agentChipText, { color: ac.fg }]}>
                      {item.agent_emoji} {item.agent_name} · {item.agent_mode?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  h1: { fontSize: 34, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  composeBtn: { padding: spacing.sm },
  composeIcon: { fontSize: 26, color: theme.text, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.bgSubtle,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchIcon: { color: theme.textMuted, fontSize: 18, marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 17, color: theme.text },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: theme.bg,
  },
  unreadDotWrap: { width: 14, alignItems: 'center' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.unreadDot },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: theme.bgSubtle,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: theme.text },
  body: { flex: 1 },
  bodyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: theme.text },
  time: { fontSize: 14, color: theme.textMuted, marginLeft: spacing.sm },
  preview: { fontSize: 15, color: theme.textMuted, marginTop: 2 },
  agentChip: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  agentChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  chevron: { fontSize: 22, color: theme.textMuted, marginLeft: spacing.xs },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.divider, marginLeft: 80 },
  emptyWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: spacing.xs },
  emptyHint: { fontSize: 15, color: theme.textMuted },
});
