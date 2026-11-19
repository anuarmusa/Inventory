import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@inventory/shared';
import { labelOf } from '../../scan/labels';
import { useSession } from '../../session/SessionProvider';
import { locationContents } from '@inventory/shared';
import { SyncStatusBar } from '../../ui/SyncStatusBar';
import { colors, ui } from '../../ui/styles';

/**
 * The Location page (spec §6.3): the Batches and Assets kept there, and "Count what's here": a
 * Stocktake of each Supply kept here.
 */
export default function LocationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { inventory } = useSession();
  const location = id ? inventory.locations[id] : undefined;
  const contents = useMemo(() => (id ? locationContents(inventory, id) : null), [inventory, id]);
  const label = useMemo(() => (id ? labelOf(inventory, { locationId: id }) : null), [inventory, id]);
  const [counting, setCounting] = useState(false);

  if (!location || !contents) {
    return (
      <View style={ui.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Location' }} />
        <Text style={ui.mute}>This Location isn’t in the inventory.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: `📍 ${location.name}` }} />
      <SyncStatusBar />
      <Text style={ui.mute}>{label ? `Label ${label}` : 'No Label yet: scan a Blank label to attach one'}</Text>

      <Text style={styles.heading}>Supplies here</Text>
      {contents.batches.length === 0 && <Text style={ui.mute}>Nothing.</Text>}
      {contents.batches.map(({ batch, supply }) => (
        <Pressable key={batch.id} style={styles.row} onPress={() => router.push({ pathname: '/supply/[id]', params: { id: supply.id } })}>
          <Text style={[ui.body, { flex: 1 }]}>{supply.name}</Text>
          <Text style={ui.body}>
            {batch.quantity} {supply.unit}
          </Text>
          <Text style={[ui.mute, { width: 110, textAlign: 'right' }]}>{supply.expires ? formatDate(batch.expiry) : '—'}</Text>
        </Pressable>
      ))}

      <Text style={styles.heading}>Assets here</Text>
      {contents.assets.length === 0 && <Text style={ui.mute}>None.</Text>}
      {contents.assets.map((a) => (
        <Pressable key={a.id} style={styles.row} onPress={() => router.push({ pathname: '/asset/[id]', params: { id: a.id } })}>
          <Text style={ui.body}>{a.name}</Text>
        </Pressable>
      ))}

      {contents.supplies.length > 0 && (
        <Pressable style={[ui.secondary, { marginTop: 12 }]} onPress={() => setCounting(!counting)}>
          <Text style={ui.secondaryText}>Count what’s here</Text>
        </Pressable>
      )}
      {counting && (
        <View style={{ gap: 6 }}>
          <Text style={ui.mute}>A count sets the Supply’s whole amount at home, wherever it’s kept.</Text>
          {contents.supplies.map((s) => (
            <Pressable key={s.id} style={styles.row} onPress={() => router.push({ pathname: '/count/[supplyId]', params: { supplyId: s.id } })}>
              <Text style={[ui.body, { flex: 1 }]}>{s.name}</Text>
              <Text style={{ color: colors.accent }}>Count ›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, color: colors.mute, textTransform: 'uppercase', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
});
