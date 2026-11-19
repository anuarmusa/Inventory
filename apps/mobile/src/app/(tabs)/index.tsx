import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { history, localToday, lowStock, nearExpiry, openMismatches, shoppingList } from '@inventory/shared';
import { statusLine } from '../../sync/describe';
import { CountTile, NeedsCheckingBar } from '../../home/parts';
import { useSession } from '../../session/SessionProvider';
import { Card, IconCircle, type IconName, ListItem, SectionTitle } from '../../ui/kit';
import { brandGradient, colors, shadow, ui } from '../../ui/styles';
import { UpdateBanner } from '../../updates/UpdateBanner';

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Home (spec §6.1): "Our home" with the sync status, the update banner and Needs checking when there
 * is something to say, the three count tiles, then a look at the household and what happened lately.
 * Scanning is the camera button in the header. Until the phone is paired and fully synced, it holds
 * at "Connect at home".
 */
export default function Home() {
  const { session, error, inventory, unsent, syncState, sync } = useSession();
  const counts = useMemo(
    () => ({
      low: lowStock(inventory).length,
      near: nearExpiry(inventory, localToday()).length,
      buy: shoppingList(inventory).length,
      checking: openMismatches(inventory).length,
      supplies: Object.values(inventory.supplies).filter((s) => !s.deletedAt).length,
      assets: Object.values(inventory.assets).filter((a) => !a.deletedAt && !a.disposedAt).length,
      locations: Object.values(inventory.locations).filter((l) => !l.deletedAt).length,
    }),
    [inventory],
  );
  const recent = useMemo(() => history(inventory, unsent, null, 3), [inventory, unsent]);

  if (error) {
    return (
      <View style={ui.centered}>
        <Text style={ui.errorText}>{error}</Text>
      </View>
    );
  }
  if (!session) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (session.status !== 'ready') return <Redirect href="/connect" />;

  const status = statusLine(syncState, unsent.length);
  const statusIcon: IconName = syncState.syncing ? 'sync' : status.tone === 'ok' ? 'cloud-done-outline' : status.tone === 'away' ? 'cloud-offline-outline' : 'warning-outline';

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{greeting()}</Text>
            <Text style={styles.title}>Our home</Text>
          </View>
          <Pressable style={styles.scan} onPress={() => router.push('/scan')} accessibilityRole="button" accessibilityLabel="Scan a product or a Label">
            <Ionicons name="scan" size={24} color={colors.accent} />
          </Pressable>
        </View>
        <Pressable style={styles.status} onPress={() => void sync()} onLongPress={() => router.push('/unsent')} accessibilityHint="Syncs now. Long-press for unsent changes.">
          <Ionicons name={statusIcon} size={16} color="#fff" />
          <Text style={styles.statusText}>{status.text}</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.body}>
        <UpdateBanner />
        <NeedsCheckingBar count={counts.checking} />

        <View style={styles.tiles}>
          <CountTile label="Low stock" count={counts.low} href="/low-stock" icon="trending-down" color={colors.amber} background={colors.amberSoft} />
          <CountTile label="Near expiry" count={counts.near} href="/near-expiry" icon="hourglass-outline" color={colors.rose} background={colors.roseSoft} />
          <CountTile label="To buy" count={counts.buy} href="/shopping-list" icon="cart-outline" color={colors.blue} background={colors.blueSoft} />
        </View>

        <SectionTitle title="Your household" />
        <Card style={styles.household}>
          {(
            [
              ['/supplies', 'basket', counts.supplies, 'Supplies', colors.accent, colors.accentSoft],
              ['/assets', 'tv', counts.assets, 'Assets', colors.purple, colors.purpleSoft],
              ['/settings', 'location', counts.locations, 'Locations', colors.blue, colors.blueSoft],
            ] as const
          ).map(([href, icon, n, label, color, background]) => (
            <Pressable key={href} style={styles.stat} onPress={() => router.push(href)}>
              <IconCircle name={icon} color={color} background={background} size={44} />
              <Text style={styles.statCount}>{n}</Text>
              <Text style={ui.mute}>{label}</Text>
            </Pressable>
          ))}
        </Card>

        <SectionTitle title="Recent activity" action="See all" href="/activity" />
        {recent.length === 0 ? (
          <Card>
            <Text style={ui.mute}>Nothing yet. Tap the scan button to add what you bought.</Text>
          </Card>
        ) : (
          recent.map((e) => (
            <ListItem
              key={e.id}
              icon={e.unsent ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
              iconColor={e.unsent ? colors.amber : colors.accent}
              iconBackground={e.unsent ? colors.amberSoft : colors.accentSoft}
              title={e.text}
              detail={`${e.deviceName} · ${new Date(e.when).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  hello: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  scan: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  body: { padding: 16, gap: 14, marginTop: -14 },
  tiles: { flexDirection: 'row', gap: 10 },
  household: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18 },
  stat: { alignItems: 'center', gap: 4 },
  statCount: { fontSize: 22, fontWeight: '800', color: colors.ink },
});
