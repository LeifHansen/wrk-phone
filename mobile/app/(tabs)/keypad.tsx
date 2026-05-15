import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme, spacing } from '@/constants/theme';
import { placeCall } from '@/lib/voice';

const KEYS = [
  ['1', '', '2', 'ABC', '3', 'DEF'],
  ['4', 'GHI', '5', 'JKL', '6', 'MNO'],
  ['7', 'PQRS', '8', 'TUV', '9', 'WXYZ'],
  ['*', '', '0', '+', '#', ''],
];

function formatPhone(raw: string) {
  const d = raw.replace(/[^\d+*#]/g, '');
  if (d.startsWith('+')) return d;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `+${d.slice(0, d.length - 10)} (${d.slice(-10, -7)}) ${d.slice(-7, -4)}-${d.slice(-4)}`;
}

export default function Keypad() {
  const [num, setNum] = useState('');
  const router = useRouter();

  const press = (k: string) => {
    Haptics.selectionAsync();
    setNum((n) => n + k);
  };
  const back = () => setNum((n) => n.slice(0, -1));
  const longBack = () => setNum('');

  const call = async () => {
    if (!num) return;
    try {
      await placeCall('demo', num.startsWith('+') ? num : `+1${num.replace(/[^\d]/g, '')}`);
      router.push('/dialer-call');
    } catch (e: any) {
      Alert.alert('Cannot place call', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.numWrap}>
        <Text style={styles.num} numberOfLines={1} adjustsFontSizeToFit>
          {formatPhone(num) || ' '}
        </Text>
      </View>

      <View style={styles.grid}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {[0, 2, 4].map((i) => (
              <Pressable
                key={i}
                onPress={() => press(row[i])}
                style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.divider }]}
              >
                <Text style={styles.keyDigit}>{row[i]}</Text>
                <Text style={styles.keyLetters}>{row[i + 1]}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.callRow}>
        <View style={styles.sideBtn} />
        <Pressable onPress={call} disabled={!num} style={[styles.callBtn, !num && { opacity: 0.4 }]}>
          <Text style={styles.callIcon}>📞</Text>
        </Pressable>
        <Pressable onPress={back} onLongPress={longBack} style={styles.sideBtn}>
          {num ? <Text style={styles.delete}>⌫</Text> : null}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg, justifyContent: 'space-between' },
  numWrap: { paddingTop: spacing.xl * 2, alignItems: 'center', paddingHorizontal: spacing.lg },
  num: { fontSize: 36, color: theme.text, fontWeight: '300', letterSpacing: 1 },
  grid: { paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  key: {
    width: 78, height: 78, borderRadius: 39,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.bgSubtle,
  },
  keyDigit: { fontSize: 32, fontWeight: '300', color: theme.text },
  keyLetters: { fontSize: 10, color: theme.textMuted, letterSpacing: 2, marginTop: -2 },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sideBtn: { width: 78, alignItems: 'center', justifyContent: 'center', height: 78 },
  callBtn: { width: 78, height: 78, borderRadius: 39, backgroundColor: theme.lime, alignItems: 'center', justifyContent: 'center' },
  callIcon: { fontSize: 32 },
  delete: { fontSize: 26, color: theme.textMuted },
});
