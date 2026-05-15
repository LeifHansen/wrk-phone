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

  const load = () => api.listCampaigns().then((r) => setList(r as Campaign[])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

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
    const recipients = parseRecipients();
    if (!name.trim() || !template.trim() || recipients.length === 0) {
      Alert.alert('Missing', 'Name, template, and at least one recipient required.');
      return;
    }
    setBusy(true);
    try {
      const { id } = await api.createCampaign({ name: name.trim(), template: template.trim(), recipients });
      setShowNew(false); setName(''); setTemplate('Hi {{name}}, '); setRecipientsRaw('');
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
          <Text style={styles.label}>Recipients</Text>
          <Text style={styles.hint}>One per line. Format: +15551234567, Sam (name optional)</Text>
          <TextInput
            value={recipientsRaw}
            onChangeText={setRecipientsRaw}
            multiline
            placeholder={'+15551234567, Sam\n+15559876543, Alex'}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { minHeight: 120, fontFamily: 'Menlo' as any }]}
          />
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
});
