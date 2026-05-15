import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: true, headerTitle: '' }} />
        <Stack.Screen name="new-message" options={{ presentation: 'modal', headerShown: true, headerTitle: 'New Message' }} />
        <Stack.Screen name="dialer-call" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="agent/[id]" options={{ headerShown: true, headerTitle: '' }} />
        <Stack.Screen name="agent/new" options={{ presentation: 'modal', headerShown: true, headerTitle: 'New Agent' }} />
        <Stack.Screen name="agent/[id]/optimize" options={{ headerShown: true, headerTitle: 'Optimize' }} />
        <Stack.Screen name="agent/[id]/train" options={{ headerShown: true, headerTitle: 'Train' }} />
        <Stack.Screen name="routing/index" options={{ headerShown: true, headerTitle: 'Auto-routing' }} />
        <Stack.Screen name="routing/edit" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Routing rule' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
