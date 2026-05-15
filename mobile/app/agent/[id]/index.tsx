import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api, Agent } from '@/lib/api';
import { theme, spacing, radius, AGENT_COLORS, colorByName } from '@/constants/theme';

const MODES = [
  { key: 'off',     label: 'Off',     bg: theme.bgSubtle, fg: theme.textMuted, blurb: 'No AI replies.' },
  { key: 'suggest', label: 'Suggest', bg: theme.neon,     fg: '#fff',          blurb: 'AI drafts. You tap Send.' },
  { key: 'auto',    label: 'Auto',    bg: theme.lime,     fg: theme.black,     blurb: 'AI sends safe replies on its own.' },
] as const;

export default function AgentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const aid = Number(id);
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [dirty, setDirty] = useState<Partial<Agent>>({});

  const load = useCallback(async () => {
    try { setAgent(await api.getAgent(aid)); setDirty({}); } catch (e: any) { Alert.alert('Failed', e.message); }
  }, [aid]);
  useEffect(() => { load(); }, [load]);

  if (!agent) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  const merged = { ...agent, ...dirty } as Agent;
  const c = colorByName(merged.color);

  const setField = <K extends keyof Agent>(k: K, v: Agent[K]) => setDirty((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    try { setAgent(await api.patchAgent(aid, dirty)); setDirty({}); }
    catch (e: any) { Alert.alert('Save failed', e.message); }
  };

  const setMode = async (mode: 'off' | 'suggest' | 'auto') => {
    setField('mode', mode);
    try { await api.patchAgent(aid, { mode }); setAgent((a) => a ? { ...a, mode } : a); }
    catch (e: any) { Alert.alert('Failed', e.message); }
  };
  const setVoiceMode = async (mode: 'off' | 'suggest' | 'auto') => {
    setField('voice_mode', mode);
    try { await api.patchAgent(aid, { voice_mode: mode }); setAgent((a) => a ? { ...a, voice_mode: mode } : a); }
    catch (e: any) { Alert.alert('Failed', e.message); }
  };

  const removeRule = (i: number) => setField('rules', merged.rules.filter((_, idx) => idx !== i));
  const addRule = (text: string) => setField('rules', [...merged.rules, text]);

  const removeExample = (i: number) => setField('examples', merged.examples.filter((_, idx) => idx !== i));
  const updateExample = (i: number, k: 'in' | 'out', v: string) =>
    setField('examples', merged.examples.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const addExample = () => setField('examples', [...merged.examples, { in: '', out: '' }]);

  const onDelete = () => {
    if (merged.is_default) { Alert.alert('Cannot delete', 'This is the default agent. Set another default first.'); return; }
    Alert.alert('Delete agent?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteAgent(aid); router.back(); } catch (e: any) { Alert.alert('Failed', e.message); }
      }},
    ]);
  };

  const onMakeDefault = async () => {
    try { await api.makeDefault(aid); load(); } catch (e: any) { Alert.alert('Failed', e.message); }
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }}>
      <Stack.Screen
        options={{
          headerTitle: '',
          headerRight: dirtyCount > 0 ? () => (
            <Pressable onPress={save} hitSlop={10} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: theme.neon, fontWeight: '800' }}>Save</Text>
            </Pressable>
          ) : undefined,
        }}
      />
      {/* Banner */}
      <View style={[styles.banner, { backgroundColor: c.bg }]}>
        <Text style={[styles.bannerEmoji, { color: c.fg }]}>{merged.emoji}</Text>
        <View style={{ flex: 1 }}>
          <TextInput
            value={merged.name}
            onChangeText={(t) => setField('name', t)}
            style={[styles.nameInput, { color: c.fg }]}
            placeholderTextColor={c.fg + '99'}
          />
          {merged.is_default ? (
            <Text style={[styles.defaultLabel, { color: c.fg }]}>Default agent</Text>
          ) : (
            <Pressable onPress={onMakeDefault}>
              <Text style={[styles.defaultLabel, { color: c.fg, textDecorationLine: 'underline' }]}>Make default</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* Color picker */}
        <View>
          <Text style={styles.section}>Color</Text>
          <View style={styles.colorRow}>
            {AGENT_COLORS.map((cc) => (
              <Pressable
                key={cc.name}
                onPress={() => setField('color', cc.name)}
                style={[
                  styles.colorChip,
                  { backgroundColor: cc.bg },
                  merged.color === cc.name && { borderColor: theme.text, borderWidth: 3 },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Mode */}
        <View>
          <Text style={styles.section}>Messaging</Text>
          <ModeRow value={merged.mode} onChange={setMode} />
        </View>
        <View>
          <Text style={styles.section}>Voicemail Greeting</Text>
          <ModeRow value={merged.voice_mode} onChange={setVoiceMode} />
        </View>

        <View>
          <Text style={styles.section}>Voice</Text>
          <VoicePicker
            current={(merged as any).voice_name || null}
            onPick={async (v) => {
              await api.patchAgent(aid, { voice_id: v.id ?? null, voice_name: v.name, tts_voice: v.tts_voice } as any);
              setAgent((a) => a ? ({ ...a, voice_name: v.name, tts_voice: v.tts_voice } as any) : a);
            }}
          />
        </View>

        {/* Optimize + Train CTAs */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => router.push(`/agent/${aid}/optimize`)} style={[styles.primaryCta, { backgroundColor: theme.lime }]}>
            <Text style={[styles.primaryCtaText, { color: theme.black }]}>✨ Optimize</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/agent/${aid}/train`)} style={[styles.primaryCta, { backgroundColor: theme.neon }]}>
            <Text style={[styles.primaryCtaText, { color: '#fff' }]}>🎓 Quick Train</Text>
          </Pressable>
        </View>

        {/* Rules — easy mode */}
        <View>
          <Text style={styles.section}>Don't do these things</Text>
          <Text style={styles.hint}>Tap a rule to remove it. Add custom rules below.</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {merged.rules.map((r, i) => (
              <Pressable key={i} onPress={() => removeRule(i)} style={styles.rulePill}>
                <Text style={styles.ruleText}>🚫 {r}</Text>
                <Text style={styles.ruleX}>×</Text>
              </Pressable>
            ))}
            <RuleAdder onAdd={addRule} />
          </View>
        </View>

        {/* Examples */}
        <View>
          <Text style={styles.section}>Training examples</Text>
          <Text style={styles.hint}>Show your style: real inbound + how you'd reply.</Text>
          {merged.examples.map((ex, i) => (
            <View key={i} style={styles.exampleCard}>
              <Text style={styles.miniLabel}>Inbound</Text>
              <TextInput
                value={ex.in}
                onChangeText={(t) => updateExample(i, 'in', t)}
                placeholder="hey are you free thursday?"
                placeholderTextColor={theme.textMuted}
                multiline
                style={styles.input}
              />
              <Text style={styles.miniLabel}>Reply</Text>
              <TextInput
                value={ex.out}
                onChangeText={(t) => updateExample(i, 'out', t)}
                placeholder="let me check & get back to you tn"
                placeholderTextColor={theme.textMuted}
                multiline
                style={styles.input}
              />
              <Pressable onPress={() => removeExample(i)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addExample} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add example</Text>
          </Pressable>
        </View>

        {/* Advanced (collapsed by default) */}
        <Pressable onPress={() => setAdvanced((a) => !a)} style={styles.advHeader}>
          <Text style={styles.advHeaderText}>{advanced ? '▾' : '▸'} Advanced</Text>
        </Pressable>
        {advanced && (
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={styles.section}>Persona / Voice</Text>
              <TextInput
                value={merged.persona}
                onChangeText={(t) => setField('persona', t)}
                placeholder="e.g. friendly, concise, lowercase, dry humor"
                placeholderTextColor={theme.textMuted}
                multiline
                style={[styles.input, { minHeight: 80 }]}
              />
            </View>
            <View>
              <Text style={styles.section}>Instructions</Text>
              <TextInput
                value={merged.instructions}
                onChangeText={(t) => setField('instructions', t)}
                placeholder="e.g. don't make appointments. Tell people I'll get back."
                placeholderTextColor={theme.textMuted}
                multiline
                style={[styles.input, { minHeight: 110 }]}
              />
            </View>
          </View>
        )}

        <Pressable onPress={onDelete} style={styles.dangerBtn}>
          <Text style={styles.dangerBtnText}>Delete agent</Text>
        </Pressable>
      </View>

      {dirtyCount > 0 && (
        <View style={styles.saveBar}>
          <Text style={styles.saveBarText}>{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</Text>
          <Pressable onPress={save} style={styles.saveBarBtn}>
            <Text style={styles.saveBarBtnText}>Save</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function ModeRow({ value, onChange }: { value: 'off' | 'suggest' | 'auto'; onChange: (m: 'off' | 'suggest' | 'auto') => void }) {
  return (
    <>
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = m.key === value;
          return (
            <Pressable
              key={m.key}
              onPress={() => onChange(m.key as any)}
              style={[
                styles.modeBtn,
                { backgroundColor: active ? m.bg : theme.bgSubtle },
              ]}
            >
              <Text style={[styles.modeBtnText, { color: active ? m.fg : theme.textMuted }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{MODES.find((m) => m.key === value)?.blurb}</Text>
    </>
  );
}

function VoicePicker({ current, onPick }: {
  current: string | null;
  onPick: (v: { id?: number; name: string; tts_voice: string }) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => api.listVoices().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const v = await api.createVoice(name.trim(), style.trim());
      onPick({ id: v.id, name: v.name, tts_voice: v.tts_voice });
      setName(''); setStyle(''); load();
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setCreating(false); }
  };

  if (!data) return <Text style={{ color: theme.textMuted, fontSize: 13 }}>Loading voices…</Text>;
  return (
    <View>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
        {current ? `Using ${current}. ` : 'Pick or create a voice. '}{data.note}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {data.presets.map((p: any) => (
          <Pressable key={p.name} onPress={() => onPick({ name: p.name, tts_voice: p.tts_voice })}
            style={[vp.chip, current === p.name && vp.chipOn]}>
            <Text style={[vp.chipT, current === p.name && { color: theme.black }]}>{p.name}</Text>
          </Pressable>
        ))}
        {data.custom.map((c: any) => (
          <Pressable key={c.id} onPress={() => onPick({ id: c.id, name: c.name, tts_voice: c.tts_voice })}
            style={[vp.chip, current === c.name && vp.chipOn]}>
            <Text style={[vp.chipT, current === c.name && { color: theme.black }]}>★ {c.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        <TextInput value={name} onChangeText={setName} placeholder="Voice name" placeholderTextColor={theme.textMuted}
          style={[vp.input, { flex: 1 }]} />
        <TextInput value={style} onChangeText={setStyle} placeholder="deep, confident" placeholderTextColor={theme.textMuted}
          style={[vp.input, { flex: 1.4 }]} />
        <Pressable onPress={create} disabled={creating || !name.trim()} style={[vp.mk, (creating || !name.trim()) && { opacity: 0.4 }]}>
          <Text style={vp.mkT}>{creating ? '…' : 'Make'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const vp = StyleSheet.create({
  chip: { borderWidth: 2, borderColor: theme.black, backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  chipOn: { backgroundColor: theme.lime },
  chipT: { fontSize: 11, fontWeight: '800', color: theme.textMuted },
  input: { backgroundColor: theme.bgSubtle, borderWidth: 2, borderColor: theme.black, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: theme.text },
  mk: { backgroundColor: theme.pink, borderWidth: 2, borderColor: theme.black, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.sm },
  mkT: { color: '#fff', fontWeight: '800' },
});

function RuleAdder({ onAdd }: { onAdd: (s: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add a rule…"
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { flex: 1 }]}
      />
      <Pressable
        onPress={() => { if (text.trim()) { onAdd(text.trim()); setText(''); } }}
        style={styles.addInline}
      >
        <Text style={styles.addInlineText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
  },
  bannerEmoji: { fontSize: 56 },
  nameInput: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  defaultLabel: { fontSize: 12, fontWeight: '700', marginTop: 2, opacity: 0.85 },
  section: { fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: '700' },
  hint: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.divider },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  modeBtnText: { fontWeight: '800', fontSize: 14 },
  primaryCta: { flex: 1, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' },
  primaryCtaText: { fontSize: 16, fontWeight: '800' },
  rulePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.divider,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999,
  },
  ruleText: { flex: 1, fontSize: 14, color: theme.text },
  ruleX: { fontSize: 18, color: theme.textMuted },
  exampleCard: {
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.divider,
    borderRadius: radius.md, padding: spacing.md, marginTop: 8, gap: 4,
  },
  miniLabel: { fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, fontWeight: '700' },
  input: {
    backgroundColor: theme.bgSubtle, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.text,
  },
  removeText: { color: theme.red, fontWeight: '700', alignSelf: 'flex-end', marginTop: 4 },
  addBtn: {
    marginTop: 10, padding: 14, alignItems: 'center',
    borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.divider,
  },
  addBtnText: { color: theme.text, fontWeight: '700' },
  addInline: {
    width: 48, backgroundColor: theme.black, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md,
  },
  addInlineText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  advHeader: { paddingVertical: 8 },
  advHeaderText: { color: theme.textMuted, fontWeight: '700', fontSize: 14 },
  dangerBtn: { padding: 14, alignItems: 'center', marginTop: 16 },
  dangerBtnText: { color: theme.red, fontWeight: '700' },
  saveBar: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    backgroundColor: theme.black, borderRadius: radius.lg, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  saveBarText: { color: '#fff', fontWeight: '600' },
  saveBarBtn: { backgroundColor: theme.lime, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  saveBarBtnText: { color: theme.black, fontWeight: '800' },
});
