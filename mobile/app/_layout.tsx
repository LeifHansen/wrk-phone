import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { api } from '@/lib/api';

function OnboardingGate() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    let cancelled = false;
    api.activeNumber()
      .then((s) => {
        if (cancelled) return;
        const inOnboarding = segments[0] === 'onboarding';
        if (!s.isProvisioned && !inOnboarding) {
          router.replace('/onboarding/number');
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setChecked(true));
    return () => { cancelled = true; };
  }, [checked, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OnboardingGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding/number" options={{ headerShown: false }} />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: true, headerTitle: '' }} />
        <Stack.Screen name="new-message" options={{ presentation: 'modal', headerShown: true, headerTitle: 'New Message' }} />
        <Stack.Screen name="dialer-call" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="agent/[id]" options={{ headerShown: true, headerTitle: '' }} />
        <Stack.Screen name="agent/new" options={{ presentation: 'modal', headerShown: true, headerTitle: 'New Agent' }} />
        <Stack.Screen name="agent/[id]/optimize" options={{ headerShown: true, headerTitle: 'Optimize' }} />
        <Stack.Screen name="agent/[id]/train" options={{ headerShown: true, headerTitle: 'Train' }} />
        <Stack.Screen name="credits" options={{ headerShown: true, headerTitle: 'Credits' }} />
        <Stack.Screen name="routing/index" options={{ headerShown: true, headerTitle: 'Auto-routing' }} />
        <Stack.Screen name="routing/edit" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Routing rule' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
