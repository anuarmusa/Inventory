import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { PairingCode, ServerAddress } from '@inventory/shared';
import { ui } from '../../ui/styles';

/** Types the server address and the 6-digit code shown on the download page. */
export default function TypePairingCode() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    const server = ServerAddress.safeParse(address);
    const digits = PairingCode.safeParse(code.replace(/\s/g, ''));
    if (!server.success) return setError('Type the server address shown on the download page, like 192.168.1.10.');
    if (!digits.success) return setError('The code is the 6 digits shown on the download page.');
    router.push({ pathname: '/connect/name', params: { server: server.data, code: digits.data } });
  };

  return (
    <View style={ui.screen}>
      <Text style={ui.title}>Type it in</Text>
      <View>
        <Text style={ui.label}>Server address</Text>
        <TextInput
          style={ui.input}
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.10"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>
      <View>
        <Text style={ui.label}>Code</Text>
        <TextInput
          style={[ui.input, { letterSpacing: 6 }]}
          value={code}
          onChangeText={setCode}
          placeholder="482 913"
          keyboardType="number-pad"
          maxLength={7}
        />
      </View>
      {error && (
        <View style={ui.error}>
          <Text style={ui.errorText}>{error}</Text>
        </View>
      )}
      <Pressable style={ui.primary} onPress={next}>
        <Text style={ui.primaryText}>Next</Text>
      </Pressable>
      <Pressable style={ui.secondary} onPress={() => router.back()}>
        <Text style={ui.secondaryText}>Back</Text>
      </Pressable>
    </View>
  );
}
