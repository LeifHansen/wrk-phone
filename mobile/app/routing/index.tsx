import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, RoutingRule } from '@/lib/api';
import { describeCondition } from '@/lib/conditions';
import { theme, spacing, radius, colorByName } from '@/constants/theme';

export default function RoutingList() {
  const router = useRouter();
  const [rules, setRules] = useState<RoutingRule[]>([]);

  const load = useCallback(async () => {
    try { setRules(await api.listRules()); } catch (e: any) { Alert.alert('Failed', e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const move = async (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= rules.length) return;
    const next = rules.slice();
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setRules(next);
    try { await api.reorderRules(next.map((r) => r.id)); } catch (e: any) { Alert.alert('Failed', e.message); load(); }
  };

  const toggle = async (r: RoutingRule, val: boolean) => {
    try { await api.patchRule(r.id, { enabled: val }); load(); } catch (e: any) { Alert.alert('Failed', e.message); }
  };

  const onDelete = (r: RoutingRule) => {
    Alert.alert(`Delete "${r.name}"?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteRule(r.id); load(); } catch (e: any) { Alert.alert('Failed', e.message); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>⚡</Text>
        <Text style={styles.heroTitle}>Auto-routing</Text>
        <Text style={styles.heroSub}>
          Rules run on every cold inbound. First match wins. Once a conversation has an agent, it sticks.
        </Text>
      </View>

      <FlatList
        data={rules}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No rules yet</Text>
            <Text style={styles.emptySub}>Tap + New rule to send specific inbounds to specific agents.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const c = item.agent_color ? colorByName(item.agent_color) : null;
          return (
            <View style={[styles.card, !item.enabled && { opacity: 0.55 }]}>
              <View style={styles.cardHeader}>
                <View style={styles.priCol}>
                  <Pressable onPress={() => move(index, -1)} hitSlop={6}><Text style={styles.priArrow}>▲</Text></Pressable>
                  <Text style={styles.priNum}>{index + 1}</Text>
                  <Pressable onPress={() => move(index, 1)} hitSlop={6}><Text style={styles.priArrow}>▼</Text></Pressable>
                </View>
                <Pressable
                  onPress={() => router.push({ pathname: '/routing/edit', params: { id: String(item.id) } })}
                  style={{ flex: 1 }}
                >
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    Matched {item.match_count}× {item.last_matched_at ? `· last ${new Date(item.last_matched_at).toLocaleDateString()}` : ''}
                  </Text>
                </Pressable>
                <Switch value={!!item.enabled} onValueChange={(v) => toggle(item, v)} trackColor={{ false: theme.divider, true: theme.lime }} thumbColor={'#fff'} />
              </View>

              <View style={styles.conditions}>
                {item.conditions.map((cond, i) => (
                  <View key={i} style={styles.condChip}>
                    <Text style={styles.condText}>{describeCondition(cond)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.routesTo}>
                <Text style={styles.routesLabel}>routes to</Text>
                {c ? (
                  <View style={[styles.agentChip, { backgroundColor: c.bg }]}>
                    <Text style={[styles.agentChipText, { color: c.fg }]}>{item.agent_emoji} {item.agent_name}</Text>
                  </View>
                ) : <Text style={styles.routesLabel}>(deleted agent)</Text>}
              </View>

              <View style={styles.cardActions}>
                <Pressable onPress={() => router.push({ pathname: '/routing/edit', params: { id: String(item.id) } })}>
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(item)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.fabWrap}>
        <Pressable onPress={() => router.push('/routing/edit')} style={styles.fab}>
          <Text style={styles.fabText}>+ New rule</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: { backgroundColor: theme.black, padding: spacing.lg, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.xl },
  heroEmoji: { fontSize: 28 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  heroSub: { color: '#fff', opacity: 0.75, fontSize: 13, marginTop: 4 },
  emptyWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptySub: { fontSize: 14, color: theme.textMuted, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: theme.divider },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  priCol: { alignItems: 'center', width: 28 },
  priArrow: { color: theme.textMuted, fontSize: 12 },
  priNum: { fontWeight: '800', color: theme.text, fontSize: 14, marginVertical: 2 },
  name: { fontSize: 16, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  conditions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  condChip: { backgroundColor: theme.bgSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  condText: { fontSize: 12, color: theme.text, fontFamily: 'Menlo' as any },
  routesTo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  routesLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  agentChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  agentChipText: { fontWeight: '800', fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 12 },
  editText: { color: theme.neon, fontWeight: '700' },
  deleteText: { color: theme.red, fontWeight: '700' },
  fabWrap: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  fab: { backgroundColor: theme.lime, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' },
  fabText: { color: theme.black, fontWeight: '800', fontSize: 16 },
});
