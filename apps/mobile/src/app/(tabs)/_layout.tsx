import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../../ui/kit';
import { colors } from '../../ui/styles';

const tab = (title: string, icon: IconName, iconOn: IconName, headerShown = true) => ({
  title,
  headerShown,
  tabBarIcon: ({ color, focused, size }: { color: unknown; focused: boolean; size: number }) => (
    <Ionicons name={focused ? iconOn : icon} size={size} color={color as string} />
  ),
});

/** The main screens, one tap apart: Home, Supplies, Assets, Activity and Settings. */
export default function TabsLayout() {
  // Leave room for Android's navigation buttons or gesture bar below the tabs.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mute,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 22, color: colors.ink },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home-outline', 'home', false)} />
      <Tabs.Screen name="supplies" options={tab('Supplies', 'basket-outline', 'basket')} />
      <Tabs.Screen name="assets" options={tab('Assets', 'tv-outline', 'tv')} />
      <Tabs.Screen name="activity" options={tab('Activity', 'time-outline', 'time')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings-outline', 'settings')} />
    </Tabs>
  );
}
