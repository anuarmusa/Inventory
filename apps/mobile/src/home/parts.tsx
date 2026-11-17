import { type Href, router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { colors, ui } from '../ui/styles';

/** A count tile on Home. The count turns amber when there is something to see. */
export function CountTile({ label, count, href }: { label: string; count: number; href: Href }) {
  return (
    <Pressable
      style={styles.tile}
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
    >
      <Text style={[styles.count, { color: count ? colors.warn : colors.ink }]}>{count}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Slot for the update banner, shown when a new app version is out. "App updates" fills it; until
 * then it shows nothing.
 */
export function UpdateBanner() {
  return null;
}

/** The red "N need checking" bar, when Mismatches are open. It opens the list. */
export function NeedsCheckingBar({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Pressable style={[ui.error, { flexDirection: 'row', justifyContent: 'space-between' }]} onPress={() => router.push('/checking')} accessibilityRole="button">
      <Text style={[ui.errorText, { fontWeight: '600' }]}>⚠️ {count} need checking</Text>
      <Text style={ui.errorText}>›</Text>
    </Pressable>
  );
}

/** A list opened from a Home tile. */
export function ListScreen({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <View style={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title }} />
      <SyncStatusBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {children.length ? children : <Text style={ui.mute}>{empty}</Text>}
      </ScrollView>
    </View>
  );
}

/** One row of a list: the thing on the left, a badge on the right. */
export function ListRow({ title, detail, badge, href }: { title: string; detail?: string | null; badge: string; href?: Href }) {
  return (
    <Pressable style={styles.row} disabled={!href} onPress={() => href && router.push(href)} accessibilityRole={href ? 'link' : undefined}>
      <View style={{ flex: 1 }}>
        <Text style={ui.body}>{title}</Text>
        {detail ? <Text style={ui.mute}>{detail}</Text> : null}
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  count: { fontSize: 30, fontWeight: '700' },
  tileLabel: { fontSize: 13, color: colors.mute, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  badge: { backgroundColor: colors.warnSoft, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { color: colors.warn, fontSize: 13, fontWeight: '600' },
});
