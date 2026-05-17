import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { api, auth } from '@/lib/api';
import { theme, spacing, radius } from '@/constants/theme';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = mode === 'login' ? await api.login(email.trim(), pw) : await api.signup(email.trim(), pw);
      await auth.set(r.token);
      router.replace('/(tabs)/inbox');
    } catch (e: any) {
      setErr(String(e.message || e).replace(/^\d+\s*/, ''));
    } finally { setBusy(false); }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>WrkPhn</Text>
      <Text style={s.sub}>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</Text>

      <TextInput style={s.input} placeholder="email" placeholderTextColor={theme.textMuted}
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="password (8+ chars)" placeholderTextColor={theme.textMuted}
        secureTextEntry value={pw} onChangeText={setPw} />

      {!!err && <Text style={s.err}>{err}</Text>}

      <Pressable style={[s.btn, (busy || !email || !pw) && { opacity: 0.5 }]}
        disabled={busy || !email || !pw} onPress={submit}>
        {busy ? <ActivityIndicator color={theme.text} /> : <Text style={s.btnTxt}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>}
      </Pressable>

      <Pressable onPress={() => { setErr(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
        <Text style={s.link}>{mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/(tabs)/inbox')}>
        <Text style={[s.link, { color: theme.textMuted }]}>Continue without an account</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm },
  title: { fontSize: 34, fontWeight: '800', color: theme.text, marginBottom: 2 },
  sub: { color: theme.textMuted, marginBottom: spacing.md },
  input: {
    borderWidth: 3, borderColor: theme.text, borderRadius: radius.md,
    backgroundColor: theme.surface, color: theme.text, padding: spacing.md, fontSize: 16,
  },
  err: { color: theme.red, fontWeight: '700' },
  btn: {
    backgroundColor: theme.lime, borderWidth: 3, borderColor: theme.text,
    borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  btnTxt: { color: theme.text, fontWeight: '800', fontSize: 16 },
  link: { color: theme.accent, textAlign: 'center', marginTop: spacing.md, fontWeight: '700' },
});
