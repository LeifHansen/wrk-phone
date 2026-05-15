import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

export default function NewMessage() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const send = async () => {
    if (!phone.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const { id } = await api.startConversation(phone.trim(), name.trim() || undefined);
      await api.sendSms(phone.trim(), body.trim());
      router.replace(`/conversation/${id}`);
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>To</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+15551234567"
          placeholderTextColor={theme.textMuted}
          keyboardType="phone-pad"
          autoFocus
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Name (optional)</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Sam"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
        />
      </View>
      <View style={[styles.field, { flex: 1 }]}>
        <Text style={styles.label}>Message</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Hey…"
          placeholderTextColor={theme.textMuted}
          multiline
          style={[styles.input, styles.textarea]}
        />
      </View>
      <Pressable
        onPress={send}
        disabled={!phone.trim() || !body.trim() || busy}
        style={[styles.sendBtn, (!phone.trim() || !body.trim() || busy) && { opacity: 0.4 }]}
      >
        <Text style={styles.sendBtnText}>{busy ? 'Sending…' : 'Send'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: spacing.lg, gap: spacing.md },
  field: {},
  label: { fontSize: 13, color: theme.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: theme.bgSubtle, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: theme.text,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: theme.black, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
