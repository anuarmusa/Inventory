import { Ionicons } from '@expo/vector-icons';
import { type Href, router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, type IconName, ListItem, Pill } from '../ui/kit';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { colors, shadow, ui } from '../ui/styles';

/** A colourful count tile on Home: icon, count, label. */
export function CountTile({
  label,
  count,
  href,
  icon,
  color,
  background,
}: {
  label: string;
  count: number;
  href: Href;
  icon: IconName;
  color: string;
  background: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] }]}
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
    >
      <View style={[styles.tileIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.count, { color: count ? color : colors.ink }]}>{count}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

/** The red "N need checking" bar, when Mismatches are open. It opens the list. */
export function NeedsCheckingBar({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Pressable style={styles.checking} onPress={() => router.push('/checking')} accessibilityRole="button">
      <View style={styles.checkingIcon}>
        <Ionicons name="alert-circle" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkingTitle}>{count === 1 ? '1 thing needs checking' : `${count} things need checking`}</Text>
        <Text style={styles.checkingText}>Tap to see and fix</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.bad} />
    </Pressable>
  );
}

/** A list opened from a Home tile. */
export function ListScreen({ title, empty, emptyIcon = 'checkmark-done-outline', children }: { title: string; empty: string; emptyIcon?: IconName; children: ReactNode[] }) {
  return (
    <View style={[ui.screen, { paddingTop: 12 }]}>
      <Stack.Screen options={{ headerShown: true, title }} />
      <SyncStatusBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}>{children.length ? children : <Empty icon={emptyIcon} text={empty} />}</ScrollView>
    </View>
  );
}

/** One row of a list: the thing on the left, a badge on the right. */
export function ListRow({
  title,
  detail,
  badge,
  href,
  icon = 'cube-outline',
  tone = 'warn',
}: {
  title: string;
  detail?: string | null;
  badge: string;
  href?: Href;
  icon?: IconName;
  tone?: 'warn' | 'bad' | 'ok' | 'mute';
}) {
  const t = {
    warn: [colors.amber, colors.amberSoft],
    bad: [colors.rose, colors.roseSoft],
    ok: [colors.accent, colors.accentSoft],
    mute: [colors.mute, colors.bg],
  }[tone];
  return <ListItem icon={icon} iconColor={t[0]} iconBackground={t[1]} title={title} detail={detail} href={href} right={<Pill text={badge} color={t[0]} background={t[1]} />} />;
}

export const styles = StyleSheet.create({
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 6, ...shadow },
  tileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tileLabel: { fontSize: 13, color: colors.mute, fontWeight: '600' },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.badSoft, borderRadius: 16, padding: 12 },
  checkingIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center' },
  checkingTitle: { fontSize: 16, fontWeight: '800', color: colors.bad },
  checkingText: { fontSize: 13, color: colors.bad },
});
