import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

interface Campaign {
  id: number; name: string; template: string; channel: string; status: string;
  sent_count: number; total_count: number; created_at: number;
}

export default function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('Hi {{name}}, ');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<'all' | 'segment' | 'paste'>('all');
  const [segments, setSegments] = useState<{ id: number; name: string; count: number }[]>([]);
  const [segId, setSegId] = useState<number | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [imgPrompt, setImgPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  const load = () => {
    api.listCampaigns().then((r) => setList(r as Campaign[])).catch(() => {});
    api.listSegments().then(setSegments).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const genImage = async () => {
    if (!imgPrompt.trim()) return;
    setGenBusy(true);
    try { const m = await api.generateImage(imgPrompt.trim()); setMediaUrl(m.url); }
    catch (e: any) { Alert.alert('Image gen failed', e.message); }
    finally { setGenBusy(false); }
  };

  const parseRecipients = () => {
    return recipientsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [phone, ...rest] = line.split(',').map((s) => s.trim());
        return { phone, name: rest.join(', ') || undefined };
      })
      .filter((r) => r.phone.length > 0);
  };

  const create = async () => {
    const payload: any = { name: name.trim(), template: template.trim(), channel: mediaUrl ? 'mms' : 'sms' };
    if (mediaUrl) payload.mediaUrl = mediaUrl;
    if (target === 'all') payload.allContacts = true;
    else if (target === 'segment') {
      if (!segId) return Alert.alert('Pick a segment');
      payload.segmentId = segId;
    } else {
      payload.recipients = parseRecipients();
      if (payload.recipients.length === 0) return Alert.alert('Add recipients');
    }
    if (!payload.name || (!payload.template && !payload.mediaUrl)) {
      return Alert.alert('Missing', 'Name + message (or image) required.');
    }
    setBusy(true);
    try {
      const { id } = await api.createCampaign(payload);
      setShowNew(false); setName(''); setTemplate('Hi {{name}}, '); setRecipientsRaw('');
      setMediaUrl(null); setImgPrompt(''); setTarget('all'); setSegId(null);
      Alert.alert('Created', `Campaign ${id} created. Tap Send to start.`);
      load();
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (id: number) => {
    Alert.alert('Send campaign?', 'This will text every recipient.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', style: 'destructive',
        onPress: async () => { try { await api.sendCampaign(id); load(); } catch (e: any) { Alert.alert('Failed', e.message); } },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Campaigns</Text>
        <Pressable onPress={() => setShowNew((s) => !s)} style={styles.newBtn}>
          <Text style={styles.newBtnText}>{showNew ? 'Close' : '+ New'}</Text>
        </Pressable>
      </View>

      {showNew && (
        <View style={styles.composer}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Spring promo" placeholderTextColor={theme.textMuted} style={styles.input} />
          <Text style={styles.label}>Message Template</Text>
          <Text style={styles.hint}>Use {'{{name}}'} for personalization.</Text>
          <TextInput value={template} onChangeText={setTemplate} multiline style={[styles.input, { minHeight: 90 }]} placeholderTextColor={theme.textMuted} />
          <Text style={styles.label}>Send to</Text>
          <View style={styles.segRow}>
            {(['all', 'segment', 'paste'] as const).map((t) => (
              <Pressable key={t} onPress={() => setTarget(t)} style={[styles.segChip, target === t && styles.segChipOn]}>
                <Text style={[styles.segChipT, target === t && { color: theme.black }]}>
                  {t === 'all' ? 'WHOLE LIST' : t === 'segment' ? 'SEGMENT' : 'PASTE'}
                </Text>
              </Pressable>
            ))}
          </View>
          {target === 'segment' && (
            <View style={styles.segRow}>
              {segments.length === 0 && <Text style={styles.hint}>No segments — make one in Contacts.</Text>}
              {segments.map((s) => (
                <Pressable key={s.id} onPress={() => setSegId(s.id)} style={[styles.segChip, segId === s.id && styles.segChipOn]}>
                  <Text style={[styles.segChipT, segId === s.id && { color: theme.black }]}>{s.name} · {s.count}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {target === 'paste' && (
            <TextInput
              value={recipientsRaw}
              onChangeText={setRecipientsRaw}
              multiline
              placeholder={'+15551234567, Sam\n+15559876543, Alex'}
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { minHeight: 100, fontFamily: 'Menlo' as any }]}
            />
          )}

          <Text style={styles.label}>MMS image (optional)</Text>
          {mediaUrl ? (
            <Pressable onPress={() => setMediaUrl(null)}><Text style={[styles.hint, { color: theme.red }]}>✕ Remove generated image</Text></Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={imgPrompt} onChangeText={setImgPrompt} placeholder="Describe an image — AI makes it"
                placeholderTextColor={theme.textMuted} style={[styles.input, { flex: 1 }]} />
              <Pressable onPress={genImage} disabled={genBusy || !imgPrompt.trim()} style={[styles.genBtn, (genBusy || !imgPrompt.trim()) && { opacity: 0.4 }]}>
                <Text style={styles.genBtnT}>{genBusy ? '…' : 'Gen'}</Text>
              </Pressable>
            </View>
          )}

          <Pressable onPress={create} disabled={busy} style={[styles.createBtn, busy && { opacity: 0.4 }]}>
            <Text style={styles.createBtnText}>{busy ? 'Creating…' : 'Create draft'}</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={styles.empty}>No campaigns yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cName}>{item.name}</Text>
              <Text style={styles.cMeta}>
                {item.status.toUpperCase()} · {item.sent_count}/{item.total_count} · {item.channel.toUpperCase()}
              </Text>
              <Text style={styles.cTemplate} numberOfLines={2}>{item.template}</Text>
            </View>
            {item.status === 'draft' && (
              <Pressable onPress={() => send(item.id)} style={styles.sendCta}>
                <Text style={styles.sendCtaText}>Send</Text>
              </Pressable>
            )}
            {item.status === 'sending' && <Text style={styles.spinning}>…</Text>}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  h1: { fontSize: 34, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  newBtn: { backgroundColor: theme.black, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  newBtnText: { color: '#fff', fontWeight: '800' },
  composer: { padding: spacing.lg, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
  label: { fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', marginTop: 6 },
  hint: { fontSize: 12, color: theme.textMuted, marginBottom: 4 },
  input: { backgroundColor: theme.bgSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 15 },
  createBtn: { backgroundColor: theme.black, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.sm },
  createBtnText: { color: '#fff', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  cName: { fontSize: 17, fontWeight: '600', color: theme.text },
  cMeta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  cTemplate: { fontSize: 14, color: theme.text, marginTop: 4 },
  sendCta: { backgroundColor: theme.lime, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  sendCtaText: { color: theme.black, fontWeight: '800' },
  spinning: { color: theme.textMuted, fontSize: 22 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.divider },
  empty: { padding: spacing.xl, color: theme.textMuted, textAlign: 'center' },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  segChip: { borderWidth: 2, borderColor: theme.black, backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  segChipOn: { backgroundColor: theme.lime },
  segChipT: { fontSize: 11, fontWeight: '800', color: theme.textMuted },
  genBtn: { backgroundColor: theme.pink, borderWidth: 2, borderColor: theme.black, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.sm },
  genBtnT: { color: '#fff', fontWeight: '800' },
});
