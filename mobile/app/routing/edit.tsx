import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, Agent, Condition, RoutingRule } from '@/lib/api';
import { CONDITION_PRESETS, describeCondition } from '@/lib/conditions';
import { theme, spacing, radius, colorByName } from '@/constants/theme';

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];

export default function RuleEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const router = useRouter();

  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentSheet, setAgentSheet] = useState(false);
  const [condSheet, setCondSheet] = useState(false);

  const [testFrom, setTestFrom] = useState('+15551234567');
  const [testBody, setTestBody] = useState('hey what is your pricing?');
  const [testResult, setTestResult] = useState<{ matched: boolean; reason: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {});
    if (editId) {
      api.listRules().then((rs) => {
        const r = rs.find((x) => x.id === editId);
        if (r) {
          setName(r.name);
          setConditions(r.conditions);
          setAgentId(r.agent_id);
        }
      }).catch(() => {});
    }
  }, [editId]);

  const agent = agents.find((a) => a.id === agentId) || null;
  const c = agent ? colorByName(agent.color) : null;

  const addCondition = (preset: typeof CONDITION_PRESETS[number]) => {
    setConditions((cs) => [...cs, JSON.parse(JSON.stringify(preset.defaults))]);
    setCondSheet(false);
  };

  const updateCondition = <K extends keyof Condition>(idx: number, patch: Partial<Condition>) => {
    setConditions((cs) => cs.map((c, i) => i === idx ? ({ ...c, ...patch } as Condition) : c));
  };
  const removeCondition = (idx: number) => setConditions((cs) => cs.filter((_, i) => i !== idx));

  const canSave = name.trim() && agentId && conditions.length > 0;

  const save = async () => {
    if (!canSave) return;
    try {
      if (editId) {
        await api.patchRule(editId, { name: name.trim(), agent_id: agentId!, conditions });
      } else {
        await api.createRule({ name: name.trim(), agent_id: agentId!, conditions });
      }
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
  };

  const runTest = async () => {
    if (conditions.length === 0) return;
    setTesting(true); setTestResult(null);
    try {
      const r = await api.testRule(testFrom, testBody, conditions);
      setTestResult(r);
    } catch (e: any) {
      Alert.alert('Test failed', e.message);
    } finally { setTesting(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}>
      {/* Name */}
      <View>
        <Text style={styles.section}>Rule name</Text>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="Pricing → Sales"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { fontSize: 18, fontWeight: '700' }]}
        />
      </View>

      {/* WHEN */}
      <View>
        <Text style={styles.sectionLg}>When ALL of these are true:</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {conditions.map((cond, idx) => (
            <View key={idx} style={styles.condCard}>
              <View style={styles.condHeader}>
                <Text style={styles.condTitle}>{describeCondition(cond)}</Text>
                <Pressable onPress={() => removeCondition(idx)}>
                  <Text style={styles.removeX}>×</Text>
                </Pressable>
              </View>
              <ConditionEditor cond={cond} onChange={(p) => updateCondition(idx, p)} />
            </View>
          ))}
        </View>

        <Pressable onPress={() => setCondSheet(true)} style={styles.addCondBtn}>
          <Text style={styles.addCondBtnText}>+ Add condition</Text>
        </Pressable>
      </View>

      {/* THEN */}
      <View>
        <Text style={styles.sectionLg}>Then route to:</Text>
        <Pressable onPress={() => setAgentSheet(true)} style={styles.agentPicker}>
          {agent && c ? (
            <>
              <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                <Text style={[styles.swatchEmoji, { color: c.fg }]}>{agent.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentMode}>{agent.mode.toUpperCase()}</Text>
              </View>
              <Text style={styles.changeText}>Change</Text>
            </>
          ) : (
            <Text style={styles.pickAgentText}>Pick an agent →</Text>
          )}
        </Pressable>
      </View>

      {/* TEST */}
      <View>
        <Text style={styles.sectionLg}>Test it</Text>
        <View style={[styles.input, { padding: 0 }]}>
          <TextInput
            value={testFrom} onChangeText={setTestFrom}
            placeholder="From phone (+15551234567)"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { borderRadius: 0, backgroundColor: 'transparent' }]}
          />
          <TextInput
            value={testBody} onChangeText={setTestBody}
            placeholder="Message body"
            placeholderTextColor={theme.textMuted}
            multiline
            style={[styles.input, { borderRadius: 0, backgroundColor: 'transparent', minHeight: 60 }]}
          />
        </View>
        <Pressable onPress={runTest} disabled={conditions.length === 0 || testing} style={[styles.testBtn, (conditions.length === 0 || testing) && { opacity: 0.4 }]}>
          <Text style={styles.testBtnText}>{testing ? 'Testing…' : 'Run test'}</Text>
        </Pressable>
        {testResult && (
          <View style={[styles.testResult, { backgroundColor: testResult.matched ? theme.lime : theme.bgSubtle }]}>
            <Text style={styles.testResultTitle}>{testResult.matched ? '✓ Would match' : '✗ Would not match'}</Text>
            <Text style={styles.testResultBody}>{testResult.reason}</Text>
          </View>
        )}
      </View>

      <Pressable onPress={save} disabled={!canSave} style={[styles.saveBtn, !canSave && { opacity: 0.4 }]}>
        <Text style={styles.saveBtnText}>{editId ? 'Save changes' : 'Create rule'}</Text>
      </Pressable>

      {/* Add-condition sheet */}
      <Modal visible={condSheet} transparent animationType="slide" onRequestClose={() => setCondSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCondSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add a condition</Text>
          {CONDITION_PRESETS.map((p) => (
            <Pressable key={p.type} onPress={() => addCondition(p)} style={styles.condPick}>
              <Text style={{ fontSize: 24 }}>{p.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.condPickTitle}>{p.label}</Text>
                <Text style={styles.condPickSub}>{p.blurb}</Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Agent picker sheet */}
      <Modal visible={agentSheet} transparent animationType="slide" onRequestClose={() => setAgentSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAgentSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Route to agent</Text>
          {agents.map((a) => {
            const c = colorByName(a.color);
            return (
              <Pressable key={a.id} onPress={() => { setAgentId(a.id); setAgentSheet(false); }} style={styles.condPick}>
                <View style={[styles.swatchSm, { backgroundColor: c.bg }]}>
                  <Text style={{ color: c.fg, fontSize: 18 }}>{a.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.condPickTitle}>{a.name}</Text>
                  <Text style={styles.condPickSub}>{a.mode.toUpperCase()}{a.is_default ? ' · default' : ''}</Text>
                </View>
                {a.id === agentId && <Text style={styles.chev}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </ScrollView>
  );
}

function ConditionEditor({ cond, onChange }: { cond: Condition; onChange: (patch: Partial<Condition>) => void }) {
  if (cond.type === 'keyword') {
    return (
      <View style={{ gap: 8 }}>
        <TextInput
          value={cond.terms.join(', ')}
          onChangeText={(t) => onChange({ terms: t.split(',').map((s) => s.trim()).filter(Boolean) } as any)}
          placeholder="price, quote, cost"
          placeholderTextColor={theme.textMuted}
          style={ed.input}
        />
        <View style={ed.toggleRow}>
          {(['any', 'all'] as const).map((m) => (
            <Pressable key={m} onPress={() => onChange({ mode: m } as any)}
              style={[ed.toggle, cond.mode === m && ed.toggleActive]}>
              <Text style={[ed.toggleText, cond.mode === m && { color: theme.black }]}>match {m.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  if (cond.type === 'intent') {
    return (
      <TextInput
        value={cond.description}
        onChangeText={(t) => onChange({ description: t } as any)}
        placeholder="messages about pricing or quotes"
        placeholderTextColor={theme.textMuted}
        multiline
        style={[ed.input, { minHeight: 60 }]}
      />
    );
  }
  if (cond.type === 'sender') {
    return (
      <View style={ed.toggleRow}>
        {(['unknown', 'known'] as const).map((m) => (
          <Pressable key={m} onPress={() => onChange({ match: m } as any)}
            style={[ed.toggle, cond.match === m && ed.toggleActive]}>
            <Text style={[ed.toggleText, cond.match === m && { color: theme.black }]}>{m === 'unknown' ? 'New contact' : 'Known contact'}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  if (cond.type === 'sender_phone') {
    return (
      <TextInput
        value={cond.value}
        onChangeText={(t) => onChange({ value: t } as any)}
        placeholder="+15551234567"
        placeholderTextColor={theme.textMuted}
        keyboardType="phone-pad"
        style={ed.input}
      />
    );
  }
  if (cond.type === 'area_code') {
    return (
      <TextInput
        value={cond.value}
        onChangeText={(t) => onChange({ value: t.replace(/[^\d]/g, '').slice(0, 3) } as any)}
        placeholder="415"
        placeholderTextColor={theme.textMuted}
        keyboardType="number-pad"
        style={[ed.input, { width: 100 }]}
      />
    );
  }
  if (cond.type === 'time') {
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map((d) => {
            const on = (cond.days || []).includes(d);
            return (
              <Pressable key={d} onPress={() => {
                const next = on ? cond.days.filter((x) => x !== d) : [...(cond.days || []), d];
                onChange({ days: next } as any);
              }} style={[ed.dayChip, on && ed.dayChipOn]}>
                <Text style={[ed.dayChipText, on && { color: theme.black }]}>{d.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={cond.start} onChangeText={(t) => onChange({ start: t } as any)} placeholder="09:00" placeholderTextColor={theme.textMuted} style={[ed.input, { flex: 1 }]} />
          <TextInput value={cond.end} onChangeText={(t) => onChange({ end: t } as any)} placeholder="17:00" placeholderTextColor={theme.textMuted} style={[ed.input, { flex: 1 }]} />
        </View>
      </View>
    );
  }
  return null;
}

const ed = StyleSheet.create({
  input: { backgroundColor: theme.bgSubtle, borderRadius: radius.md, padding: 10, fontSize: 14, color: theme.text },
  toggleRow: { flexDirection: 'row', backgroundColor: theme.bgSubtle, padding: 4, borderRadius: 10 },
  toggle: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: theme.lime },
  toggleText: { fontWeight: '700', color: theme.textMuted, fontSize: 12 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.bgSubtle },
  dayChipOn: { backgroundColor: theme.lime },
  dayChipText: { fontWeight: '800', fontSize: 11, color: theme.textMuted, letterSpacing: 0.4 },
});

const styles = StyleSheet.create({
  section: { fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: '700' },
  sectionLg: { fontSize: 18, fontWeight: '800', color: theme.text, letterSpacing: -0.3, marginBottom: 4 },
  input: { backgroundColor: theme.bgSubtle, borderRadius: radius.md, padding: 12, fontSize: 16, color: theme.text },
  condCard: { backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: theme.divider, gap: 8 },
  condHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  condTitle: { color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 },
  removeX: { color: theme.red, fontSize: 22, fontWeight: '800', paddingHorizontal: 6 },
  addCondBtn: { marginTop: 8, padding: 14, alignItems: 'center', borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.divider },
  addCondBtnText: { color: theme.text, fontWeight: '700' },
  agentPicker: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, backgroundColor: theme.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.divider },
  swatch: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatchSm: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatchEmoji: { fontSize: 24 },
  agentName: { fontSize: 16, fontWeight: '700', color: theme.text },
  agentMode: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  changeText: { color: theme.neon, fontWeight: '700' },
  pickAgentText: { color: theme.textMuted, fontWeight: '700' },
  testBtn: { backgroundColor: theme.neon, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginTop: 8 },
  testBtnText: { color: '#fff', fontWeight: '800' },
  testResult: { padding: 14, borderRadius: radius.md, marginTop: 10 },
  testResultTitle: { fontWeight: '800', color: theme.text },
  testResultBody: { fontFamily: 'Menlo' as any, fontSize: 12, marginTop: 6, color: theme.text },
  saveBtn: { backgroundColor: theme.black, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: theme.bg, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 6 },
  handle: { width: 40, height: 4, backgroundColor: theme.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { fontWeight: '800', fontSize: 18, color: theme.text, marginBottom: 8 },
  condPick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  condPickTitle: { fontWeight: '700', fontSize: 15, color: theme.text },
  condPickSub: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  chev: { color: theme.textMuted, fontSize: 22 },
});
