import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { theme } from '@/constants/theme';

function Icon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.divider },
        tabBarLabelStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <Icon glyph="💬" color={color} />,
        }}
      />
      <Tabs.Screen
        name="keypad"
        options={{
          title: 'Keypad',
          tabBarIcon: ({ color }) => <Icon glyph="🔢" color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color }) => <Icon glyph="≡" color={color} />,
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: 'Campaigns',
          tabBarIcon: ({ color }) => <Icon glyph="📣" color={color} />,
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color }) => <Icon glyph="🤖" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Icon glyph="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
