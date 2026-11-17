import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSession } from '../../session/SessionProvider';
import { connectErrorMessage } from '../../session/messages';
import { ui } from '../../ui/styles';

/** "Connect at home": the first screen until this phone is paired and fully synced. */
export default function ConnectAtHome() {
  const { session, finishFirstSync } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (session.status === 'ready') return <Redirect href="/" />;

  const retryFirstSync = async () => {
    setBusy(true);
    setError(null);
    try {
      await finishFirstSync();
    } catch (e) {
      setError(connectErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[ui.screen, { justifyContent: 'center' }]}>
      <Text style={ui.title}>Connect at home</Text>

      {session.status === 'removed' && (
        <View style={ui.note}>
          <Text style={ui.noteText}>This phone was removed. Connect again.</Text>
        </View>
      )}

      {session.status === 'needs_first_sync' ? (
        <>
          <Text style={ui.body}>This phone is connected. It needs to finish its first sync with the home server.</Text>
          <Pressable style={ui.primary} onPress={retryFirstSync} disabled={busy}>
            <Text style={ui.primaryText}>{busy ? 'Syncing…' : 'Try again'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={ui.body}>
            On the home Wi-Fi, open the download page. On this phone, tap “Connect this phone” there. From a computer, scan its
            code with this phone.
          </Text>
          <Link href="/connect/scan" asChild>
            <Pressable style={ui.primary}>
              <Text style={ui.primaryText}>Scan the code</Text>
            </Pressable>
          </Link>
          <Link href="/connect/type" asChild>
            <Pressable style={ui.secondary}>
              <Text style={ui.secondaryText}>Type it in</Text>
            </Pressable>
          </Link>
        </>
      )}

      {error && (
        <View style={ui.error}>
          <Text style={ui.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}
