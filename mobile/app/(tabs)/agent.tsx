import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, Agent } from '@/lib/api';
import { theme, spacing, radius, colorByName } from '@/constants/theme';

export default function AgentsTab() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);

  const load = useCallback(async () => {
    try { setAgents(await api.listAgents()); } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Agents</Text>
          <Text style={styles.sub}>Train AIs that text on your behalf.</Text>
        </View>
        <Pressable onPress={() => router.push('/agent/new')} style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/routing')} style={styles.routingLink}>
        <View style={{ flex: 1 }}>
          <Text style={styles.routingTitle}>⚡ Auto-routing</Text>
          <Text style={styles.routingSub}>Send the right inbound to the right agent.</Text>
        </View>
        <Text style={styles.routingArrow}>›</Text>
      </Pressable>

      <FlatList
        data={agents}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        ListEmptyComponent={
          <Pressable onPress={() => router.push('/agent/new')} style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🤖</Text>
            <Text style={styles.emptyTitle}>Make your first agent</Text>
            <Text style={styles.emptySub}>Pick a role, pick a vibe, done.</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const c = colorByName(item.color);
          return (
            <Pressable
              onPress={() => router.push(`/agent/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                <Text style={[styles.swatchEmoji, { color: c.fg }]}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {item.is_default ? <Badge label="Default" /> : null}
                </View>
                <Text style={styles.meta}>
                  {item.conversations ?? 0} convos · {item.ai_sent_7d ?? 0} sent (7d)
                </Text>
                <View style={styles.modeRow}>
                  <ModePill mode={item.mode} label="msg" />
                  <ModePill mode={item.voice_mode} label="vm" />
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function ModePill({ mode, label }: { mode: 'off' | 'suggest' | 'auto'; label: string }) {
  const color =
    mode === 'auto' ? theme.lime : mode === 'suggest' ? theme.neon : theme.bgSubtle;
  const fg = mode === 'off' ? theme.textMuted : '#0A0A0A';
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label.toUpperCase()} · {mode.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  h1: { fontSize: 34, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: theme.textMuted, marginTop: 2 },
  newBtn: {
    backgroundColor: theme.black, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: radius.lg,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: theme.surface,
    borderWidth: 1, borderColor: theme.divider,
  },
  swatch: {
    width: 64, height: 64, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  swatchEmoji: { fontSize: 30 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 18, fontWeight: '700', color: theme.text, flexShrink: 1 },
  meta: { fontSize: 13, color: theme.textMuted },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  badge: {
    backgroundColor: theme.black, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  chevron: { fontSize: 24, color: theme.textMuted, marginLeft: 4 },
  emptyCard: {
    backgroundColor: theme.surface, borderRadius: radius.xl,
    borderWidth: 2, borderStyle: 'dashed', borderColor: theme.divider,
    padding: spacing.xxl, alignItems: 'center', gap: 8,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptySub: { fontSize: 14, color: theme.textMuted },
  routingLink: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.black,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  routingTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  routingSub: { color: '#fff', opacity: 0.7, fontSize: 13, marginTop: 2 },
  routingArrow: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
