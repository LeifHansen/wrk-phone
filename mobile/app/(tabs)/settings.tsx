import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { theme, spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { registerVoice } from '@/lib/voice';

function prettyNum(e164: string | null) {
  if (!e164) return '—';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default function Settings() {
  const router = useRouter();
  const [serverOk, setServerOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [voiceOk, setVoiceOk] = useState<'?' | 'ok' | 'fail'>('?');
  const [num, setNum] = useState<{ activeNumber: string | null; isProvisioned: boolean } | null>(null);

  useEffect(() => {
    fetch(`${api.base}/health`).then((r) => setServerOk(r.ok ? 'ok' : 'fail')).catch(() => setServerOk('fail'));
    api.activeNumber().then(setNum).catch(() => {});
  }, []);

  const [contactsTotal, setContactsTotal] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [hook, setHook] = useState<{ reachable: boolean; ok: boolean } | null>(null);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    api.contactsMeta().then((m) => setContactsTotal(m.total)).catch(() => {});
    api.credits().then((c) => setCredits(c.balance)).catch(() => {});
    api.webhookStatus().then(setHook).catch(() => {});
  }, []);

  const repair = async () => {
    setRepairing(true);
    try {
      const r = await api.repairWebhooks();
      Alert.alert('Webhooks repaired', `${r.number}\n\n${r.warnings?.length ? r.warnings.join('\n\n') : 'Inbound should now reach your inbox.'}`);
      api.webhookStatus().then(setHook).catch(() => {});
    } catch (e: any) { Alert.alert('Repair failed', e.message); }
    finally { setRepairing(false); }
  };

  const reRegister = async () => {
    setVoiceOk('?');
    try {
      const v = await registerVoice('demo');
      setVoiceOk(v ? 'ok' : 'fail');
    } catch {
      setVoiceOk('fail');
    }
  };

  const syncContacts = async () => {
    setSyncing(true);
    try {
      const { syncDeviceContacts } = await import('@/lib/contacts');
      const r = await syncDeviceContacts();
      if (!r.granted) {
        Alert.alert('Permission needed', 'Enable Contacts access for Werkphone in Settings to sync.');
      } else {
        setContactsTotal(r.total);
        Alert.alert('Contacts synced', `Synced ${r.synced} number${r.synced === 1 ? '' : 's'} (${r.skipped} skipped). You now have ${r.total} contacts.`);
      }
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.h1}>Settings</Text>

        <Section title="Connection">
          <Row label="API server" value={api.base} status={serverOk} />
          <Row label="Voice client" value="Twilio Voice SDK" status={voiceOk} />
          <Pressable onPress={reRegister} style={styles.btn}>
            <Text style={styles.btnText}>Re-register voice client</Text>
          </Pressable>
        </Section>

        <Section title="Phone Line">
          <Row
            label="Your number"
            value={num ? prettyNum(num.activeNumber) : '…'}
            status={num?.isProvisioned ? 'ok' : '?'}
          />
          <Pressable onPress={() => router.push('/onboarding/number')} style={styles.btn}>
            <Text style={styles.btnText}>{num?.isProvisioned ? 'Get a different number' : 'Set up your number'}</Text>
          </Pressable>
          <Row label="Inbound webhook" value={`${api.base}/api/voice/inbound`} />
          <Row label="SMS webhook" value={`${api.base}/api/sms/inbound`} />
        </Section>

        <Section title="Inbound Routing">
          <Row
            label="Reachable by Twilio"
            value={hook ? (hook.reachable ? 'Yes' : 'No — inbound blocked') : '…'}
            status={hook?.reachable ? 'ok' : 'fail'}
          />
          <Row label="SMS inbound wired" value={hook ? (hook.ok ? 'OK' : 'Needs repair') : '…'} />
          <Pressable onPress={repair} disabled={repairing} style={[styles.btn, repairing && { opacity: 0.5 }]}>
            <Text style={styles.btnText}>{repairing ? 'Repairing…' : 'Repair inbound webhooks'}</Text>
          </Pressable>
        </Section>

        <Section title="Credits">
          <Row label="Balance" value={credits == null ? '…' : `${credits} credits`} status={credits ? 'ok' : '?'} />
          <Row label="Rates" value="SMS 1/seg · MMS 3" />
          <Pressable onPress={() => router.push('/credits')} style={styles.btn}>
            <Text style={styles.btnText}>Buy credits</Text>
          </Pressable>
        </Section>

        <Section title="Contacts">
          <Row
            label="Synced contacts"
            value={contactsTotal == null ? '…' : String(contactsTotal)}
            status={contactsTotal && contactsTotal > 0 ? 'ok' : '?'}
          />
          <Pressable onPress={syncContacts} disabled={syncing} style={[styles.btn, syncing && { opacity: 0.5 }]}>
            <Text style={styles.btnText}>{syncing ? 'Syncing…' : 'Sync phone contacts'}</Text>
          </Pressable>
          <Row label="Why" value="Names on calls/texts + known-contact routing" />
        </Section>

        <Section title="About">
          <Row label="Version" value="0.1.0" />
          <Row label="Built with" value="Expo · Twilio · OpenAI" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, status }: { label: string; value: string; status?: '?' | 'ok' | 'fail' }) {
  const dot = status === 'ok' ? '🟢' : status === 'fail' ? '🔴' : status === '?' ? '⚪' : null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {dot && <Text style={{ marginRight: 8 }}>{dot}</Text>}
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  h1: { fontSize: 34, fontWeight: '700', color: theme.text },
  section: { fontSize: 13, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginLeft: 4 },
  card: { backgroundColor: theme.bgSubtle, borderRadius: 14, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
  rowLabel: { color: theme.text, fontSize: 16 },
  rowValue: { color: theme.textMuted, fontSize: 13, maxWidth: '60%' },
  btn: { padding: 14, alignItems: 'center' },
  btnText: { color: theme.accent, fontWeight: '600' },
});
