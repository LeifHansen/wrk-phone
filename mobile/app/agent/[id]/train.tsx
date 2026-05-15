import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

// Quick Train: AI generates 3 plausible inbound messages.
// User just types replies in their own voice. Tap "Save" to add as examples.

export default function Train() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const aid = Number(id);
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [replies, setReplies] = useState<string[]>(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());

  const fresh = async () => {
    setBusy(true); setPrompts(null); setReplies(['', '', '']); setSavedIdx(new Set());
    try {
      const res = await api.trainingPrompts(aid);
      setPrompts(res.prompts);
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { fresh(); }, []);

  const save = async (i: number) => {
    if (!prompts || !replies[i].trim()) return;
    try {
      const a = await api.getAgent(aid);
      const ex = [...(a.examples || []), { in: prompts[i], out: replies[i].trim() }];
      await api.patchAgent(aid, { examples: ex } as any);
      setSavedIdx((s) => new Set([...s, i]));
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    }
  };

  if (busy || !prompts) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.black} />
        <Text style={styles.busy}>Coming up with realistic messages…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>🎓</Text>
        <Text style={styles.heroTitle}>How would you reply?</Text>
        <Text style={styles.heroSub}>
          Type a reply in your own voice. We'll teach the agent to match it.
        </Text>
      </View>

      {prompts.map((p, i) => {
        const saved = savedIdx.has(i);
        return (
          <View key={i} style={styles.card}>
            <View style={styles.bubbleIn}>
              <Text style={styles.bubbleInText}>{p}</Text>
            </View>
            <Text style={styles.miniLabel}>Your reply</Text>
            <TextInput
              value={replies[i]}
              onChangeText={(t) => setReplies((rs) => rs.map((r, idx) => idx === i ? t : r))}
              placeholder="type how you'd actually respond…"
              placeholderTextColor={theme.textMuted}
              multiline
              style={styles.input}
            />
            <Pressable
              onPress={() => save(i)}
              disabled={!replies[i].trim() || saved}
              style={[styles.saveBtn, (!replies[i].trim() || saved) && { opacity: 0.4 }]}
            >
              <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Teach this'}</Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable onPress={fresh} style={styles.againBtn}>
        <Text style={styles.againBtnText}>↻ Give me 3 more</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, gap: 8 },
  busy: { color: theme.textMuted, marginTop: 8 },
  heroCard: { backgroundColor: theme.neon, padding: spacing.lg, borderRadius: radius.xl, gap: 4 },
  heroEmoji: { fontSize: 32 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 14, color: '#fff', opacity: 0.85 },
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: theme.divider },
  bubbleIn: {
    alignSelf: 'flex-start', maxWidth: '90%',
    backgroundColor: theme.bubbleIn, borderRadius: radius.bubble, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleInText: { color: theme.bubbleInText, fontSize: 16 },
  miniLabel: { fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, fontWeight: '700' },
  input: {
    backgroundColor: theme.bgSubtle, borderRadius: radius.md, padding: 12,
    fontSize: 16, color: theme.text, minHeight: 60, marginTop: 6,
  },
  saveBtn: { backgroundColor: theme.black, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  againBtn: { padding: 16, alignItems: 'center' },
  againBtnText: { color: theme.textMuted, fontWeight: '700' },
});
