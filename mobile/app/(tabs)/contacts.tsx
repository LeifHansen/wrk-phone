import { useCallback, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';
import { placeCall } from '@/lib/voice';

interface Contact { id: number; phone: string; name: string; segments: { id: number; name: string }[] }

function pretty(p: string) {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
}

export default function ContactsTab() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Contact | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try { setContacts(await api.listContacts(q || undefined)); } catch {}
  }, [q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { syncDeviceContacts } = await import('@/lib/contacts');
      const r = await syncDeviceContacts();
      if (!r.granted) {
        Alert.alert('Permission needed', 'Enable Contacts access for WrkPhn in Settings to sync your address book.');
      } else {
        Alert.alert('Contacts synced', `Synced ${r.synced} number${r.synced === 1 ? '' : 's'} (${r.skipped} skipped). You now have ${r.total} contacts.`);
        load();
      }
    } catch (e: any) {
      Alert.alert('Sync failed', e.message || 'Could not read device contacts.');
    } finally { setSyncing(false); }
  };

  const add = async () => {
    if (!phone.trim()) return;
    try {
      await api.addContact(phone.trim(), name.trim() || undefined);
      setPhone(''); setName(''); load();
    } catch (e: any) { Alert.alert('Could not add', e.message); }
  };

  const call = async (c: Contact) => {
    setPicked(null);
    try { await placeCall('demo', c.phone); router.push('/dialer-call'); }
    catch (e: any) { Alert.alert('Call failed', e.message); }
  };
  const text = async (c: Contact) => {
    setPicked(null);
    const { id } = await api.startConversation(c.phone, c.name || undefined);
    router.push(`/conversation/${id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headRow}>
        <Text style={styles.h1}>Contacts</Text>
        <Pressable onPress={syncNow} disabled={syncing} style={[styles.syncBtn, syncing && { opacity: 0.5 }]}>
          <Text style={styles.syncBtnText}>{syncing ? 'Syncing…' : '⟳ Sync device'}</Text>
        </Pressable>
      </View>

      {/* add — phone is the only required field */}
      <View style={styles.addRow}>
        <TextInput value={phone} onChangeText={setPhone} placeholder="Phone (required)"
          placeholderTextColor={theme.textMuted} keyboardType="phone-pad" style={[styles.input, { flex: 1 }]} />
        <TextInput value={name} onChangeText={setName} placeholder="Name (optional)"
          placeholderTextColor={theme.textMuted} style={[styles.input, { flex: 1 }]} />
        <Pressable onPress={add} disabled={!phone.trim()} style={[styles.addBtn, !phone.trim() && { opacity: 0.4 }]}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <TextInput value={q} onChangeText={setQ} placeholder="Search"
        placeholderTextColor={theme.textMuted} style={[styles.input, { marginHorizontal: spacing.lg, marginBottom: spacing.sm }]} />

      <FlatList
        data={contacts}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.empty}>No contacts yet. Add one above ↑</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setPicked(item)} style={styles.row}>
            <View style={styles.av}><Text style={styles.avT}>{(item.name || item.phone).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cName}>{item.name || pretty(item.phone)}</Text>
              <Text style={styles.cSub}>{item.name ? pretty(item.phone) : ''}{item.segments.map((s) => ` · ${s.name}`).join('')}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />

      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicked(null)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{picked?.name || (picked && pretty(picked.phone))}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => picked && call(picked)} style={[styles.actBtn, { backgroundColor: theme.lime }]}>
              <Text style={styles.actGlyph}>✆</Text><Text style={styles.actCap}>CALL</Text>
            </Pressable>
            <Pressable onPress={() => picked && text(picked)} style={[styles.actBtn, { backgroundColor: theme.neon }]}>
              <Text style={[styles.actGlyph, { color: '#fff' }]}>✉</Text><Text style={[styles.actCap, { color: '#fff' }]}>TEXT</Text>
            </Pressable>
          </View>
          <Pressable onPress={async () => { if (picked) { await api.deleteContact(picked.id); setPicked(null); load(); } }}>
            <Text style={styles.del}>Delete contact</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  h1: { fontSize: 34, fontWeight: '800', color: theme.text, letterSpacing: -0.5, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  syncBtn: { backgroundColor: theme.lime, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9, marginTop: spacing.sm },
  syncBtnText: { fontWeight: '800', color: theme.black, fontSize: 13 },
  addRow: { flexDirection: 'row', gap: 8, padding: spacing.lg, flexWrap: 'wrap' },
  input: { backgroundColor: theme.bgSubtle, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.text },
  addBtn: { backgroundColor: theme.black, borderRadius: radius.md, paddingHorizontal: 18, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800' },
  empty: { color: theme.textMuted, textAlign: 'center', padding: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.divider, padding: spacing.md },
  av: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.bgSubtle, alignItems: 'center', justifyContent: 'center' },
  avT: { fontWeight: '800', color: theme.text },
  cName: { fontSize: 15, fontWeight: '700', color: theme.text },
  cSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  chev: { fontSize: 22, color: theme.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: theme.bg, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 40, height: 4, backgroundColor: theme.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 16, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 14 },
  actBtn: { flex: 1, borderRadius: radius.lg, paddingVertical: 24, alignItems: 'center', gap: 6 },
  actGlyph: { fontSize: 30, color: theme.black },
  actCap: { fontWeight: '800', color: theme.black, fontSize: 13 },
  del: { color: theme.red, fontWeight: '700', textAlign: 'center', marginTop: 18 },
});
