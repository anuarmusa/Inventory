import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fixBody, history } from '@inventory/shared';
import { Stepper } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { colors, ui } from '../../ui/styles';

/** Fix: a Correction with the right amount ("used 3, not 2"). History is never edited. */
export default function Fix() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { inventory, unsent, record } = useSession();
  const entry = useMemo(() => history(inventory, unsent, null, Number.MAX_SAFE_INTEGER).find((e) => e.id === id), [inventory, unsent, id]);
  const [amount, setAmount] = useState(entry?.amount ?? 1);

  if (!entry || entry.amount === null) {
    return (
      <View style={ui.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Fix' }} />
        <Text style={ui.mute}>This can’t be fixed by amount.</Text>
      </View>
    );
  }
  const counted = entry.type === 'supply.counted';
  return (
    <View style={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Fix' }} />
      <Text style={ui.body}>{entry.text}</Text>
      <Text style={ui.label}>The right amount</Text>
      <Stepper value={amount} min={counted ? 0 : 1} onChange={setAmount} />
      {entry.countedSince && (
        <View style={ui.note}>
          <Text style={ui.noteText}>Counted since: this won’t change the amount.</Text>
        </View>
      )}
      <Pressable
        style={[ui.primary, amount === entry.amount && { opacity: 0.4 }]}
        disabled={amount === entry.amount}
        onPress={() => {
          void record(fixBody(inventory, entry, amount));
          router.back();
        }}
      >
        <Text style={ui.primaryText}>
          Fix: {amount}, not {entry.amount}
        </Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: colors.mute }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
