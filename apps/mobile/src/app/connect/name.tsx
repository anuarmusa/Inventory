import * as Device from 'expo-device';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { DeviceName } from '@inventory/shared';
import { useSession } from '../../session/SessionProvider';
import { connectErrorMessage } from '../../session/messages';
import { suggestedName } from '../../session/session';
import { ui } from '../../ui/styles';

/** Names this phone, then pairs and does the first full sync. */
export default function NameThisPhone() {
  const router = useRouter();
  const { session, connect } = useSession();
  const { server, code } = useLocalSearchParams<{ server: string; code: string }>();
  const [name, setName] = useState(() => suggestedName(Device.modelName, Device.deviceName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session?.status === 'ready') return <Redirect href="/" />;
  if (!server || !code) return <Redirect href="/connect" />;

  const connectNow = async () => {
    const parsed = DeviceName.safeParse(name);
    if (!parsed.success) return setError('Give this phone a name, like “Kitchen phone”.');
    setBusy(true);
    setError(null);
    try {
      await connect({ server, code, name: parsed.data, model: Device.modelName ?? null });
    } catch (e) {
      setError(connectErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Text style={ui.title}>Name this phone</Text>
      <Text style={ui.mute}>The name shows in the list of phones and next to what this phone records.</Text>
      <TextInput style={ui.input} value={name} onChangeText={setName} maxLength={60} autoFocus selectTextOnFocus />
      <Text style={ui.mute}>Connecting to {server}</Text>
      {error && (
        <View style={ui.error}>
          <Text style={ui.errorText}>{error}</Text>
        </View>
      )}
      <Pressable style={ui.primary} onPress={connectNow} disabled={busy}>
        <Text style={ui.primaryText}>{busy ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      <Pressable style={ui.secondary} onPress={() => router.replace('/connect')} disabled={busy}>
        <Text style={ui.secondaryText}>Back</Text>
      </Pressable>
    </View>
  );
}
