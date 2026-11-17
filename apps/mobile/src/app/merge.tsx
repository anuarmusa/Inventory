import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { mergeBody } from '../checking/mismatches';
import { Toggle } from '../scan/pickers';
import { useSession } from '../session/SessionProvider';
import { onHand } from '../sync/inventory';
import { colors, ui } from '../ui/styles';

/**
 * Merge two Supplies that are the same thing: one keeps everything (its Batches and Barcodes move
 * over) and the other is hidden. It can't be undone, so it confirms first.
 */
export default function Merge() {
  const params = useLocalSearchParams<{ from: string; into: string; mismatch?: string }>();
  const { inventory, record } = useSession();
  const [keep, setKeep] = useState<'into' | 'from'>('into');
  const a = inventory.supplies[params.into];
  const b = inventory.supplies[params.from];
  if (!a || !b || a.deletedAt || b.deletedAt) {
    return (
      <View style={ui.centered}>
        <Text style={ui.mute}>These two can’t be merged any more.</Text>
      </View>
    );
  }
  const [kept, gone] = keep === 'into' ? [a, b] : [b, a];

  const confirm = () =>
    Alert.alert(
      'Merge these Supplies?',
      `${gone.name} will be merged into ${kept.name}: its Batches and Barcodes move over and ${gone.name} is hidden. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await record(mergeBody(gone.id, kept.id));
              if (params.mismatch) await record({ type: 'mismatch.resolved', payload: { mismatchId: params.mismatch, resolution: 'merged' } });
              router.back();
            })(),
        },
      ],
    );

  const describe = (s: typeof a) => `${s.name} · ${onHand(inventory, s.id)} ${s.unit}`;
  return (
    <View style={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Merge' }} />
      <Text style={ui.body}>Which one keeps everything?</Text>
      <Toggle<'into' | 'from'>
        value={keep}
        options={[
          ['into', describe(a)],
          ['from', describe(b)],
        ]}
        onChange={setKeep}
      />
      <Text style={ui.body}>
        {gone.name}’s Batches and Barcodes move to {kept.name}.
      </Text>
      <View style={ui.note}>
        <Text style={ui.noteText}>Merge can’t be undone.</Text>
      </View>
      <Pressable style={ui.primary} onPress={confirm}>
        <Text style={ui.primaryText}>Merge</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: colors.mute }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
