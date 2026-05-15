import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  const reRegister = async () => {
    setVoiceOk('?');
    try {
      const v = await registerVoice('demo');
      setVoiceOk(v ? 'ok' : 'fail');
    } catch {
      setVoiceOk('fail');
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
