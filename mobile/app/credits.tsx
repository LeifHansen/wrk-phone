import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

export default function Credits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [rates, setRates] = useState<{ sms: string; mms: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.credits().then((c) => { setBalance(c.balance); setPackages(c.packages); setRates(c.rates); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const buy = async (id: string, price: number) => {
    setBusy(id);
    try {
      if (price === 0) {
        const r = await api.buyCredits(id);
        setBalance(r.balance);
        Alert.alert('Done', `Added credits. Balance: ${r.balance}.`);
      } else {
        const r = await api.checkout(id);
        if (r.url) { Linking.openURL(r.url); return; }
        if (typeof r.balance === 'number') setBalance(r.balance);
        Alert.alert('Credited', r.note || `Balance: ${r.balance}.`);
      }
    } catch (e: any) { Alert.alert('Failed', e.message); }
    finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.h1}>Credits</Text>
        <View style={styles.balCard}>
          <Text style={styles.balNum}>{balance == null ? '…' : balance}</Text>
          <Text style={styles.balLbl}>CREDITS</Text>
        </View>
        <View style={styles.rateCard}>
          <Text style={styles.rate}>📩 SMS — {rates?.sms || '1 / 160 chars'}</Text>
          <Text style={styles.rate}>🖼 MMS — {rates?.mms || '3 credits, 560 chars + media'}</Text>
          <Text style={styles.note}>Free in beta. $0.99/mo line fee comes later.</Text>
        </View>
        {packages.map((p) => (
          <View key={p.id} style={styles.pkg}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pkgC}>{p.credits.toLocaleString()} credits</Text>
              <Text style={styles.pkgL}>{p.label}{p.note ? ` · ${p.note}` : ''}</Text>
            </View>
            <Pressable onPress={() => buy(p.id, p.price)} disabled={busy === p.id} style={styles.pkgBtn}>
              <Text style={styles.pkgBtnT}>{busy === p.id ? '…' : p.price === 0 ? 'Free' : `$${p.price}`}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  h1: { fontSize: 32, fontWeight: '800', color: theme.text, marginBottom: spacing.lg },
  balCard: { backgroundColor: theme.lime, borderWidth: 3, borderColor: theme.black, borderRadius: radius.md, padding: 28, alignItems: 'center', marginBottom: spacing.md },
  balNum: { fontSize: 44, fontWeight: '900', color: theme.black },
  balLbl: { fontWeight: '800', color: theme.black, marginTop: 6, letterSpacing: 2 },
  rateCard: { backgroundColor: theme.surface, borderWidth: 3, borderColor: theme.black, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: 6 },
  rate: { fontSize: 13, color: theme.text, fontWeight: '700' },
  note: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
  pkg: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderWidth: 3, borderColor: theme.black, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  pkgC: { fontSize: 16, fontWeight: '800', color: theme.text },
  pkgL: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pkgBtn: { backgroundColor: theme.lime, borderWidth: 3, borderColor: theme.black, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm },
  pkgBtnT: { fontWeight: '800', color: theme.black },
});
