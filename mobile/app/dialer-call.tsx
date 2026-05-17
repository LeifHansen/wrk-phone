import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { hangup, mute } from '@/lib/voice';
import { theme, spacing } from '@/constants/theme';

export default function CallScreen() {
  const router = useRouter();
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const end = () => {
    hangup();
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={styles.avatar}><Text style={styles.avatarText}>·</Text></View>
        <Text style={styles.peer}>Werkphone Call</Text>
        <Text style={styles.timer}>{fmt(seconds)}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => { setMuted(m => { mute(!m); return !m; }); }}
          style={[styles.action, muted && { backgroundColor: theme.text }]}
        >
          <Text style={[styles.actionLabel, muted && { color: '#fff' }]}>{muted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable onPress={end} style={[styles.action, styles.endBtn]}>
          <Text style={[styles.actionLabel, { color: '#fff' }]}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#111', padding: spacing.lg },
  avatar: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 60, color: '#666' },
  peer: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: spacing.lg },
  timer: { color: '#aaa', fontSize: 18, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: spacing.xl },
  action: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  endBtn: { backgroundColor: theme.destructive },
  actionLabel: { color: '#ddd', fontSize: 16, fontWeight: '600' },
});
