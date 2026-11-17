import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../session/SessionProvider';
import { addScan, lineQuantity, supplyOf } from '../../scan/basket';
import { useBasket } from '../../scan/BasketProvider';
import { identify, NOT_OURS, type Scanned } from '../../scan/identify';
import { RETIRED_MESSAGE, whatLabelOpens } from '../../scan/labels';
import { colors, ui } from '../../ui/styles';

/** The same code seen again within this time is the camera still looking at it, not a new scan. */
const SAME_CODE_MS = 2_000;

/**
 * Scan (spec §6.2). A product asks "I bought some / I used some / Just show me". "I bought some"
 * keeps the camera open: each scan adds a line to the basket until "Done scanning".
 */
export default function Scan() {
  const { inventory } = useSession();
  const { basket, update, lookUp, clear } = useBasket();
  const [permission, requestPermission] = useCameraPermissions();
  const [choosing, setChoosing] = useState<Scanned | null>(null);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  // While a page opened from a scan is on top, the camera underneath must not act on what it sees.
  const focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const shopping = basket.lines.length > 0;

  const addToBasket = (scanned: Scanned) => {
    setMessage({ text: addScan(basket, scanned, inventory).message, warn: scanned.kind !== 'product' });
    update((b) => addScan(b, scanned, inventory).basket);
    if (scanned.kind === 'new_product' && !basket.lines.some((l) => l.code === scanned.code)) lookUp(scanned.code);
  };

  const onScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    const seen = last.current;
    last.current = { text: data, at: now };
    if (!focused.current || choosing || (seen && seen.text === data && now - seen.at < SAME_CODE_MS)) return;

    const scanned = identify(data, inventory);
    switch (scanned.kind) {
      case 'not_ours':
        setMessage({ text: NOT_OURS, warn: true });
        return;
      case 'label': {
        // A Label opens its Asset or Location from anywhere; a basket waits behind it.
        const opens = whatLabelOpens(inventory, scanned.code);
        if (opens.kind === 'retired') setMessage({ text: RETIRED_MESSAGE, warn: true });
        else if (opens.kind === 'asset') router.push({ pathname: '/asset/[id]', params: { id: opens.assetId } });
        else if (opens.kind === 'location') router.push({ pathname: '/location/[id]', params: { id: opens.locationId } });
        else router.push({ pathname: '/label/[code]', params: { code: scanned.code } });
        return;
      }
      default:
        if (shopping) addToBasket(scanned);
        else setChoosing(scanned);
    }
  };

  const cancel = () => {
    if (!shopping) return router.back();
    Alert.alert('Leave the basket?', 'Nothing in it has been put away.', [
      { text: 'Keep scanning', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          clear();
          router.back();
        },
      },
    ]);
  };

  if (!permission) return <View style={ui.screen} />;
  if (!permission.granted) {
    return (
      <View style={ui.centered}>
        <Text style={ui.body}>The camera is needed to scan barcodes and Labels.</Text>
        <Pressable style={[ui.primary, { alignSelf: 'stretch' }]} onPress={requestPermission}>
          <Text style={ui.primaryText}>Allow the camera</Text>
        </Pressable>
        <Pressable style={[ui.secondary, { alignSelf: 'stretch' }]} onPress={() => router.back()}>
          <Text style={ui.secondaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={styles.panel}>
        {choosing ? (
          <Choose
            scanned={choosing}
            onBought={() => {
              addToBasket(choosing);
              setChoosing(null);
            }}
            onCancel={() => setChoosing(null)}
          />
        ) : (
          <>
            <Text style={ui.body}>
              {shopping ? 'Scan everything you bought, one after another.' : 'Point the camera at a barcode or a Label.'}
            </Text>
            {message && <Text style={{ color: message.warn ? colors.warn : colors.accent, fontWeight: '600' }}>{message.text}</Text>}
            {shopping && (
              <ScrollView style={{ maxHeight: 160 }}>
                {basket.lines.map((line) => {
                  const supply = supplyOf(basket, inventory, line.supplyId);
                  return (
                    <View key={line.code} style={styles.line}>
                      <Text style={ui.body}>
                        {supply?.name ?? (line.kind === 'weighed' ? 'Shop-weighed item' : 'New product')}
                      </Text>
                      <Text style={ui.mute}>{supply ? `+${lineQuantity(line)} ${supply.unit}` : `${line.scans}× · set up next`}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={[ui.secondary, { flex: 1 }]} onPress={cancel}>
                <Text style={ui.secondaryText}>{shopping ? 'Cancel' : 'Back'}</Text>
              </Pressable>
              {shopping && (
                <Pressable style={[ui.primary, { flex: 2 }]} onPress={() => router.push('/scan/questions')}>
                  <Text style={ui.primaryText}>Done scanning</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** "I bought some / I used some / Just show me" after the first product scan. */
function Choose({ scanned, onBought, onCancel }: { scanned: Scanned; onBought: () => void; onCancel: () => void }) {
  const known = scanned.kind === 'product';
  const title = known ? scanned.supply.name : scanned.kind === 'weighed' ? 'Shop-weighed item' : 'New product';
  return (
    <>
      <Text style={ui.title}>{title}</Text>
      {!known && <Text style={ui.mute}>Not in the inventory yet, so it can’t be used. It can be added.</Text>}
      <Pressable style={ui.primary} onPress={onBought}>
        <Text style={ui.primaryText}>I bought some</Text>
      </Pressable>
      {known && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            style={[ui.secondary, { flex: 1 }]}
            onPress={() => {
              onCancel();
              router.push({ pathname: '/scan/use', params: { supplyId: scanned.supply.id } });
            }}
          >
            <Text style={ui.secondaryText}>I used some</Text>
          </Pressable>
          <Pressable
            style={[ui.secondary, { flex: 1 }]}
            onPress={() => {
              onCancel();
              router.push({ pathname: '/supply/[id]', params: { id: scanned.supply.id } });
            }}
          >
            <Text style={ui.secondaryText}>Just show me</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={onCancel} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={ui.mute}>Scan something else</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 10, backgroundColor: '#fff' },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
});
