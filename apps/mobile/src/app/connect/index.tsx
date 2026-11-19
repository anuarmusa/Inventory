import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSession } from '../../session/SessionProvider';
import { connectErrorMessage } from '../../session/messages';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, colors, ui } from '../../ui/styles';

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
    <View style={[ui.screen, { justifyContent: 'center', padding: 24 }]}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
        <Ionicons name="home" size={44} color="#fff" />
      </LinearGradient>
      <Text style={[ui.title, { textAlign: 'center' }]}>Connect at home</Text>
      <Text style={[ui.mute, { textAlign: 'center', marginTop: -6 }]}>Everything your household owns, in your pocket.</Text>

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
            <Pressable style={[ui.primary, { flexDirection: 'row', justifyContent: 'center', gap: 10 }]}>
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
              <Text style={ui.primaryText}>Scan the code</Text>
            </Pressable>
          </Link>
          <Link href="/connect/type" asChild>
            <Pressable style={[ui.secondary, { flexDirection: 'row', justifyContent: 'center', gap: 10 }]}>
              <Ionicons name="keypad-outline" size={20} color={colors.ink} />
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
