import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { ui } from '../ui/styles';

/** Home. Until the phone is paired and fully synced, it holds at "Connect at home". */
export default function Home() {
  const { session, error, checkIn } = useSession();
  const [syncing, setSyncing] = useState(false);

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

  const syncNow = async () => {
    setSyncing(true);
    await checkIn().finally(() => setSyncing(false));
  };

  return (
    <View style={ui.centered}>
      <Text style={ui.title}>Our home</Text>
      <Text style={ui.mute}>
        Connected as {session.deviceName} to {session.server}
      </Text>
      <Text style={ui.mute}>Synced up to change #{session.lastSeq}</Text>
      <Pressable style={[ui.secondary, { alignSelf: 'stretch' }]} onPress={syncNow} disabled={syncing}>
        <Text style={ui.secondaryText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
    </View>
  );
}
