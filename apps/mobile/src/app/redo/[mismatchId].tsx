import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { checkItem, redoActions } from '@inventory/shared';
import { emptyBasket, type SupplyChoice } from '../../scan/basket';
import { SupplyPicker } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { colors, ui } from '../../ui/styles';

/** Redo a skipped Action on another Supply, then resolve the Mismatch as redone. */
export default function Redo() {
  const { mismatchId } = useLocalSearchParams<{ mismatchId: string }>();
  const { inventory, record } = useSession();
  const mismatch = mismatchId ? inventory.mismatches[mismatchId] : undefined;
  const item = useMemo(() => (mismatch ? checkItem(inventory, mismatch) : null), [inventory, mismatch]);
  const redo = item?.fixes.find((f) => f.kind === 'redo');
  const [choice, setChoice] = useState<SupplyChoice | null>(null);
  const basket = useMemo(emptyBasket, []);

  if (!item || !redo || redo.kind !== 'redo') {
    return (
      <ScrollView contentContainerStyle={ui.centered}>
        <Text style={ui.mute}>This can’t be redone.</Text>
      </ScrollView>
    );
  }
  const supplyId = choice && 'supplyId' in choice ? choice.supplyId : null;
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: 'Redo' }} />
      <Text style={ui.body}>{item.text}</Text>
      <Text style={ui.label}>Which Supply was it really?</Text>
      <SupplyPicker inventory={inventory} basket={basket} suggestion="" value={choice} onChange={setChoice} allowNew={false} />
      <Pressable
        style={[ui.primary, !supplyId && { opacity: 0.4 }]}
        disabled={!supplyId}
        onPress={() => {
          void (async () => {
            for (const body of redoActions(item, redo.body, supplyId!)) await record(body);
            router.back();
          })();
        }}
      >
        <Text style={ui.primaryText}>Redo it</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: colors.mute }}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
