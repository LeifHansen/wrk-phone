import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { theme, spacing, radius, AGENT_COLORS, colorByName } from '@/constants/theme';

type Step = 'role' | 'vibe' | 'name' | 'busy';

interface Preset {
  slug: string; label: string; emoji: string; color: string; blurb: string;
  vibes: { slug: string; label: string; persona: string }[];
}

export default function NewAgent() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [step, setStep] = useState<Step>('role');
  const [picked, setPicked] = useState<Preset | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.agentPresets().then(setPresets as any).catch(() => {}); }, []);

  const choosePreset = (p: Preset) => {
    setPicked(p);
    setName(p.label);
    if (p.slug === 'custom') return; // custom uses brief flow
    setStep('vibe');
  };

  const finishPreset = async () => {
    if (!picked || picked.slug === 'custom') return;
    setBusy(true); setStep('busy');
    try {
      const a = await api.createFromPreset(picked.slug, vibe || picked.vibes[0]?.slug, name.trim() || picked.label);
      router.replace(`/agent/${a.id}`);
    } catch (e: any) {
      Alert.alert('Failed', e.message);
      setBusy(false); setStep('name');
    }
  };

  const finishBrief = async () => {
    if (!brief.trim()) return;
    setBusy(true); setStep('busy');
    try {
      const a = await api.createFromBrief(brief.trim(), name.trim() || undefined);
      router.replace(`/agent/${a.id}`);
    } catch (e: any) {
      Alert.alert('Failed', e.message);
      setBusy(false); setStep('role');
    }
  };

  if (step === 'busy') {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.black} />
        <Text style={styles.busyText}>Building your agent…</Text>
      </View>
    );
  }

  // Step 1: pick a role
  if (step === 'role') {
    return (
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={styles.h1}>What's it for?</Text>
        <Text style={styles.sub}>Pick the closest match. You can tweak later.</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {presets.map((p) => {
            const c = colorByName(p.color);
            return (
              <Pressable key={p.slug} onPress={() => choosePreset(p)} style={({ pressed }) => [styles.presetRow, pressed && { opacity: 0.85 }]}>
                <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                  <Text style={[styles.swatchEmoji, { color: c.fg }]}>{p.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.presetLabel}>{p.label}</Text>
                  <Text style={styles.presetBlurb}>{p.blurb}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>

        {picked?.slug === 'custom' && (
          <View style={styles.customCard}>
            <Text style={styles.section}>Describe it in one line</Text>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              placeholder="e.g. responds to buyers on my Etsy shop, books custom orders"
              placeholderTextColor={theme.textMuted}
              multiline
              style={styles.input}
              autoFocus
            />
            <Text style={styles.section}>Name (optional)</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Etsy bot" placeholderTextColor={theme.textMuted} style={styles.input} />
            <Pressable onPress={finishBrief} disabled={!brief.trim()} style={[styles.cta, !brief.trim() && { opacity: 0.4 }]}>
              <Text style={styles.ctaText}>✨ Draft with AI</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  // Step 2: pick a vibe
  if (step === 'vibe' && picked && picked.slug !== 'custom') {
    const c = colorByName(picked.color);
    return (
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={[styles.bigSwatch, { backgroundColor: c.bg }]}>
          <Text style={[styles.bigSwatchEmoji, { color: c.fg }]}>{picked.emoji}</Text>
        </View>
        <Text style={styles.h1}>Pick a vibe</Text>
        <Text style={styles.sub}>How should it sound?</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {picked.vibes.map((v) => {
            const active = v.slug === vibe;
            return (
              <Pressable
                key={v.slug}
                onPress={() => setVibe(v.slug)}
                style={({ pressed }) => [
                  styles.vibeRow,
                  active && { borderColor: theme.black, borderWidth: 2 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.vibeLabel}>{v.label}</Text>
                  <Text style={styles.vibeSample} numberOfLines={2}>{v.persona}</Text>
                </View>
                {active && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => { if (!vibe) setVibe(picked.vibes[0]?.slug); setStep('name'); }}
          style={[styles.cta, { marginTop: spacing.lg }]}
        >
          <Text style={styles.ctaText}>Next</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Step 3: name + finish
  if (step === 'name' && picked) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: spacing.lg, gap: spacing.md }}>
        <Text style={styles.h1}>Name it</Text>
        <Text style={styles.sub}>You can change this later.</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={picked.label}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { fontSize: 22, fontWeight: '700' }]}
          autoFocus
        />
        <Pressable onPress={finishPreset} disabled={!name.trim()} style={[styles.cta, !name.trim() && { opacity: 0.4 }]}>
          <Text style={styles.ctaText}>Create agent</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  busyText: { color: theme.textMuted, fontSize: 16, marginTop: 8 },
  h1: { fontSize: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: theme.textMuted },
  section: { fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  presetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: theme.divider,
  },
  presetLabel: { fontSize: 17, fontWeight: '700', color: theme.text },
  presetBlurb: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  swatch: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  swatchEmoji: { fontSize: 28 },
  bigSwatch: { width: 90, height: 90, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  bigSwatchEmoji: { fontSize: 44 },
  chevron: { fontSize: 22, color: theme.textMuted },
  vibeRow: {
    backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: theme.divider, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  vibeLabel: { fontSize: 17, fontWeight: '700', color: theme.text },
  vibeSample: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  check: { fontSize: 22, color: theme.text, fontWeight: '800' },
  customCard: {
    backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: theme.divider, marginTop: spacing.md, gap: 6,
  },
  input: {
    backgroundColor: theme.bgSubtle, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.text,
    minHeight: 48,
  },
  cta: {
    backgroundColor: theme.black, paddingVertical: 16, borderRadius: radius.lg,
    alignItems: 'center', marginTop: spacing.md,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
