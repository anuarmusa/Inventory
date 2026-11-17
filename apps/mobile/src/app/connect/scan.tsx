import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { parsePairingLink } from '@inventory/shared';
import { colors, ui } from '../../ui/styles';

/** Scans the pairing QR code shown on the download page. */
export default function ScanPairingCode() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) return <View style={ui.screen} />;

  if (!permission.granted) {
    return (
      <View style={ui.centered}>
        <Text style={ui.body}>The camera is needed to scan the code on the download page.</Text>
        <Pressable style={[ui.primary, { alignSelf: 'stretch' }]} onPress={requestPermission}>
          <Text style={ui.primaryText}>Allow the camera</Text>
        </Pressable>
        <Pressable style={[ui.secondary, { alignSelf: 'stretch' }]} onPress={() => router.replace('/connect/type')}>
          <Text style={ui.secondaryText}>Type it in instead</Text>
        </Pressable>
      </View>
    );
  }

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const target = parsePairingLink(data);
    if (!target) {
      setMessage('That’s not a pairing code. Scan the code on the download page.');
      return;
    }
    handled.current = true;
    router.replace({ pathname: '/connect/name', params: { server: target.server, code: target.code } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={{ padding: 16, gap: 10, backgroundColor: '#fff' }}>
        <Text style={ui.body}>Point the camera at the code on the download page.</Text>
        {message && <Text style={{ color: colors.bad }}>{message}</Text>}
        <Pressable style={ui.secondary} onPress={() => router.back()}>
          <Text style={ui.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}
