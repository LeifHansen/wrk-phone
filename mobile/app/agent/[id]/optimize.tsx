import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, Optimization } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

const TYPE_META: Record<string, { color: string; label: string; emoji: string }> = {
  persona:      { color: theme.pink,    label: 'Tone',         emoji: '🎨' },
  instructions: { color: theme.neon,    label: 'Behavior',     emoji: '📝' },
  rules:        { color: theme.red,     label: 'Guardrails',   emoji: '🚫' },
  example:      { color: theme.lime,    label: 'New example',  emoji: '🎓' },
  mode:         { color: theme.orange,  label: 'Mode',         emoji: '⚡' },
};

export default function Optimize() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const aid = Number(id);
  const [opts, setOpts] = useState<Optimization[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const run = async () => {
    setBusy(true); setOpts(null); setApplied(new Set());
    try {
      const res = await api.optimize(aid);
      setOpts(res.optimizations);
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { run(); }, []);

  const apply = async (o: Optimization) => {
    try {
      await api.applyPatch(aid, o.patch);
      setApplied((s) => new Set([...s, o.id]));
    } catch (e: any) {
      Alert.alert('Apply failed', e.message);
    }
  };

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.black} />
        <Text style={styles.busy}>Analyzing your agent…</Text>
      </View>
    );
  }

  if (!opts) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>✨</Text>
        <Text style={styles.heroTitle}>{opts.length === 0 ? 'No suggestions yet' : `${opts.length} suggestion${opts.length === 1 ? '' : 's'}`}</Text>
        <Text style={styles.heroSub}>
          {opts.length === 0
            ? "Send a few messages first — I learn from your traffic."
            : 'Tap Apply to one-click update your agent.'}
        </Text>
      </View>

      {opts.map((o) => {
        const meta = TYPE_META[o.type] || TYPE_META.instructions;
        const isApplied = applied.has(o.id);
        return (
          <View key={o.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
                <Text style={styles.typeBadgeText}>{meta.emoji} {meta.label}</Text>
              </View>
            </View>
            <Text style={styles.title}>{o.title}</Text>
            <Text style={styles.rationale}>{o.rationale}</Text>
            <PatchPreview patch={o.patch} />
            <Pressable
              onPress={() => apply(o)}
              disabled={isApplied}
              style={[styles.applyBtn, isApplied ? styles.appliedBtn : null]}
            >
              <Text style={[styles.applyBtnText, isApplied && { color: theme.textMuted }]}>
                {isApplied ? '✓ Applied' : 'Apply'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable onPress={run} style={styles.againBtn}>
        <Text style={styles.againBtnText}>↻ Re-analyze</Text>
      </Pressable>
    </ScrollView>
  );
}

function PatchPreview({ patch }: { patch: any }) {
  if (!patch) return null;
  let body: string | null = null;
  if (patch.persona) body = patch.persona;
  else if (patch.instructions) body = patch.instructions;
  else if (Array.isArray(patch.rules)) body = patch.rules.map((r: string) => `• ${r}`).join('\n');
  else if (patch.addExample) body = `IN: ${patch.addExample.in}\nOUT: ${patch.addExample.out}`;
  else if (patch.mode) body = `Mode → ${String(patch.mode).toUpperCase()}`;
  if (!body) return null;
  return (
    <View style={styles.previewBox}>
      <Text style={styles.previewText}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, gap: 12 },
  busy: { color: theme.textMuted, marginTop: 12 },
  heroCard: {
    backgroundColor: theme.lime, borderRadius: radius.xl, padding: spacing.lg,
    alignItems: 'flex-start', gap: 4,
  },
  heroEmoji: { fontSize: 32 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.black, marginTop: 4 },
  heroSub: { fontSize: 14, color: theme.black, opacity: 0.75 },
  card: {
    backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: theme.divider, gap: 8,
  },
  cardHeader: { flexDirection: 'row' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  typeBadgeText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.4 },
  title: { fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 4 },
  rationale: { fontSize: 14, color: theme.textMuted, lineHeight: 19 },
  previewBox: { backgroundColor: theme.bgSubtle, borderRadius: radius.md, padding: 10, marginTop: 4 },
  previewText: { fontSize: 13, color: theme.text, fontFamily: 'Menlo' as any },
  applyBtn: {
    backgroundColor: theme.black, paddingVertical: 12, borderRadius: radius.md,
    alignItems: 'center', marginTop: 6,
  },
  appliedBtn: { backgroundColor: theme.bgSubtle },
  applyBtnText: { color: '#fff', fontWeight: '800' },
  againBtn: { padding: 16, alignItems: 'center' },
  againBtnText: { color: theme.textMuted, fontWeight: '700' },
});
