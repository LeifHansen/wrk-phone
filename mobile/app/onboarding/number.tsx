import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

interface Avail { phoneNumber: string; friendlyName: string; locality: string; region: string }

function pretty(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default function NumberOnboarding() {
  const router = useRouter();
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<Avail[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setResults([]);
    try {
      const r = await api.searchNumbers({ country: 'US', areaCode: areaCode.trim() || undefined });
      setResults(r);
      if (r.length === 0) Alert.alert('No numbers', 'Try a different area code.');
    } catch (e: any) {
      Alert.alert('Search failed', e.message);
    } finally {
      setSearching(false);
    }
  };

  const buy = async (n: Avail) => {
    Alert.alert(
      'Get this number?',
      `${pretty(n.phoneNumber)} — ${n.locality || n.region}\n\nThis purchases the number on your Twilio account and connects it to your Wrk Phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Get it',
          onPress: async () => {
            setBuying(n.phoneNumber);
            try {
              const res = await api.buyNumber(n.phoneNumber);
              const warn = res.warnings?.length ? `\n\nNote:\n• ${res.warnings.join('\n• ')}` : '';
              Alert.alert(
                'You\'re set 🎉',
                `${pretty(res.number)} is now your Wrk Phone line${res.attachedToService ? ' and is connected to your messaging service' : ''}.${warn}`,
                [{ text: 'Start', onPress: () => router.replace('/(tabs)/inbox') }]
              );
            } catch (e: any) {
              Alert.alert('Purchase failed', e.message);
            } finally {
              setBuying(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>STEP 2 OF 2</Text>
        <Text style={styles.h1}>Pick your number</Text>
        <Text style={styles.sub}>
          This becomes your Wrk Phone line — for calls, texts, and your AI agents. You can search by area code.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={areaCode}
          onChangeText={(t) => setAreaCode(t.replace(/[^\d]/g, '').slice(0, 3))}
          placeholder="Area code (e.g. 415)"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Pressable onPress={search} disabled={searching} style={[styles.searchBtn, searching && { opacity: 0.5 }]}>
          <Text style={styles.searchBtnText}>{searching ? '…' : 'Search'}</Text>
        </Pressable>
      </View>

      {searching && <ActivityIndicator color={theme.black} style={{ marginTop: spacing.xl }} />}

      <FlatList
        data={results}
        keyExtractor={(n) => n.phoneNumber}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          !searching ? (
            <Text style={styles.empty}>Search an area code to see available numbers.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => buy(item)}
            disabled={!!buying}
            style={({ pressed }) => [styles.numCard, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.numText}>{pretty(item.phoneNumber)}</Text>
              <Text style={styles.numMeta}>{item.locality ? `${item.locality}, ` : ''}{item.region}</Text>
            </View>
            {buying === item.phoneNumber
              ? <ActivityIndicator color={theme.black} />
              : <View style={styles.getBtn}><Text style={styles.getBtnText}>Get</Text></View>}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 6 },
  kicker: { color: theme.neon, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  h1: { fontSize: 32, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: theme.textMuted, lineHeight: 21 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  input: {
    flex: 1, backgroundColor: theme.bgSubtle, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.text,
  },
  searchBtn: { backgroundColor: theme.black, borderRadius: radius.md, paddingHorizontal: 22, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: theme.textMuted, textAlign: 'center', padding: spacing.xl },
  numCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: theme.divider, padding: spacing.md,
  },
  numText: { fontSize: 20, fontWeight: '700', color: theme.text, letterSpacing: 0.3 },
  numMeta: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  getBtn: { backgroundColor: theme.lime, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  getBtnText: { color: theme.black, fontWeight: '800' },
});
