import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { onHand } from '../sync/inventory';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { ui } from '../ui/styles';

/** Home. Until the phone is paired and fully synced, it holds at "Connect at home". */
export default function Home() {
  const { session, error, sync, syncState, inventory } = useSession();

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

  // Placeholder counts until "App Home: count tiles and lists" builds the real Home.
  const supplies = Object.values(inventory.supplies).filter((s) => !s.deletedAt);
  const assets = Object.values(inventory.assets).filter((a) => !a.deletedAt && !a.disposedAt);
  const units = supplies.reduce((n, s) => n + onHand(inventory, s.id), 0);

  return (
    <View style={[ui.screen, { paddingTop: 56 }]}>
      <SyncStatusBar />
      <Text style={ui.title}>Our home</Text>
      <Text style={ui.body}>
        {supplies.length} Supplies ({units} on hand) · {assets.length} Assets
      </Text>
      <Text style={ui.mute}>
        {session.deviceName} · {session.server}
      </Text>
      <Pressable style={ui.secondary} onPress={() => void sync()} disabled={syncState.syncing}>
        <Text style={ui.secondaryText}>{syncState.syncing ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
      <Link href="/unsent" style={[ui.mute, { textAlign: 'center' }]}>
        Unsent changes
      </Link>
    </View>
  );
}
