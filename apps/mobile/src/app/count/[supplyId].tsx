import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { countActions } from '../../checking/mismatches';
import { Stepper } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { onHand } from '../../sync/inventory';
import { colors, ui } from '../../ui/styles';

/**
 * Count it: a Stocktake of one Supply. The count becomes its total on hand; when it comes from a
 * shortfall, the Mismatch is resolved as counted.
 */
export default function Count() {
  const { supplyId, mismatch } = useLocalSearchParams<{ supplyId: string; mismatch?: string }>();
  const { inventory, record } = useSession();
  const supply = supplyId ? inventory.supplies[supplyId] : undefined;
  const recorded = supplyId ? onHand(inventory, supplyId) : 0;
  const [count, setCount] = useState(recorded);
  const [saving, setSaving] = useState(false);

  if (!supply) {
    return (
      <View style={ui.centered}>
        <Text style={ui.mute}>This Supply isn’t in the inventory.</Text>
      </View>
    );
  }
  const save = async () => {
    setSaving(true);
    try {
      for (const body of countActions(supply.id, count, mismatch)) await record(body);
      router.back();
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Count it' }} />
      <Text style={ui.title}>{supply.name}</Text>
      <Text style={ui.body}>
        How many {supply.unit} are at home? Recorded now: {recorded}.
      </Text>
      <Stepper value={count} min={0} unit={supply.unit} onChange={setCount} />
      <Pressable style={[ui.primary, saving && { opacity: 0.4 }]} disabled={saving} onPress={() => void save()}>
        <Text style={ui.primaryText}>
          Save count: {count} {supply.unit}
        </Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: colors.mute }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
