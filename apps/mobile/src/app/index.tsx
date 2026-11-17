import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { localToday, lowStock, nearExpiry, openMismatches, shoppingList } from '../home/lists';
import { CountTile, NeedsCheckingBar, UpdateBanner } from '../home/parts';
import { useSession } from '../session/SessionProvider';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { colors, ui } from '../ui/styles';

/**
 * Home (spec §6.1, prototype variant B): "Our home", the update banner and Needs checking bar when
 * there is something to say, three count tiles, and a big Scan button.
 * Until the phone is paired and fully synced, it holds at "Connect at home".
 */
export default function Home() {
  const { session, error, inventory } = useSession();
  const counts = useMemo(
    () => ({
      low: lowStock(inventory).length,
      near: nearExpiry(inventory, localToday()).length,
      buy: shoppingList(inventory).length,
      checking: openMismatches(inventory).length,
    }),
    [inventory],
  );

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
        <ActivityIndicator />
      </View>
    );
  }
  if (session.status !== 'ready') return <Redirect href="/connect" />;

  return (
    <View style={[ui.screen, { paddingTop: 56 }]}>
      <SyncStatusBar />
      <Text style={ui.title}>Our home</Text>
      <UpdateBanner />
      <NeedsCheckingBar count={counts.checking} />
      <View style={styles.tiles}>
        <CountTile label="Low stock" count={counts.low} href="/low-stock" />
        <CountTile label="Near expiry" count={counts.near} href="/near-expiry" />
        <CountTile label="To buy" count={counts.buy} href="/shopping-list" />
      </View>
      <Pressable
        style={styles.scan}
        // The scan flows come with "Scan: I bought some" and "Scan: I used some".
        onPress={() => Alert.alert('Scan', 'Scanning comes in the next update.')}
        accessibilityRole="button"
        accessibilityLabel="Scan a product or a Label"
      >
        <Text style={styles.scanText}>📷 Scan</Text>
      </Pressable>
      <Text style={[ui.mute, { textAlign: 'center' }]}>Scan a product or a Label</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8, marginTop: 4 },
  scan: {
    marginTop: 16,
    height: 170,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: { color: '#fff', fontSize: 24, fontWeight: '700' },
});
