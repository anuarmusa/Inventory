import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { possibleDuplicates } from '../../checking/mismatches';
import { history } from '../../history/history';
import { HistoryList } from '../../history/HistoryList';
import { localToday } from '../../home/lists';
import { formatDate } from '../../scan/dates';
import { useSession } from '../../session/SessionProvider';
import { supplyDetails } from '../../supply/details';
import { SyncStatusBar } from '../../ui/SyncStatusBar';
import { colors, ui } from '../../ui/styles';

/**
 * The Supply page (spec §6.3): amount on hand, its Batches (expiry and Location), Barcodes, minimum
 * and restock-to, and its History with Undo and Fix.
 */
export default function SupplyPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { inventory, unsent } = useSession();
  const d = useMemo(() => (id ? supplyDetails(inventory, id, localToday()) : null), [inventory, id]);
  const entries = useMemo(() => (id ? history(inventory, unsent, { supplyId: id }) : []), [inventory, unsent, id]);
  const duplicates = useMemo(() => (id ? possibleDuplicates(inventory, id) : []), [inventory, id]);

  if (!d) {
    return (
      <View style={ui.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Supply' }} />
        <Text style={ui.mute}>This Supply isn’t in the inventory.</Text>
      </View>
    );
  }
  const { supply } = d;
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: supply.name }} />
      <SyncStatusBar />
      {supply.deletedAt && (
        <View style={ui.note}>
          <Text style={ui.noteText}>This Supply was deleted.</Text>
        </View>
      )}
      {duplicates.map((dup) => (
        <Pressable
          key={dup.id}
          style={ui.note}
          onPress={() => router.push({ pathname: '/merge', params: { from: dup.id, into: supply.id } })}
        >
          <Text style={ui.noteText}>
            Possible duplicate: another “{dup.name}” has {dup.onHand} {supply.unit}. Merge them ›
          </Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={styles.big}>{d.onHand}</Text>
        <Text style={ui.body}>{supply.unit} on hand</Text>
        {d.lowStock && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Low stock</Text>
          </View>
        )}
      </View>
      <Text style={ui.mute}>
        Usually in {d.usualLocationName ?? 'no set Location'} · {supply.expires ? 'expires' : 'doesn’t expire'}
      </Text>
      {!supply.deletedAt && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => router.push({ pathname: '/supply/edit', params: { id: supply.id } })}>
            <Text style={{ color: colors.accent }}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/count/[supplyId]', params: { supplyId: supply.id } })}>
            <Text style={{ color: colors.accent }}>Count it</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.heading}>Batches</Text>
      {d.batches.length === 0 && <Text style={ui.mute}>None at home.</Text>}
      {d.batches.map(({ batch, locationName, nearExpiry }) => (
        <View key={batch.id} style={styles.row}>
          <Text style={[ui.body, { width: 80 }]}>
            {batch.quantity} {supply.unit}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={ui.body}>{supply.expires ? (batch.expiry ? `Expires ${formatDate(batch.expiry)}` : 'No date') : '—'}</Text>
            <Text style={ui.mute}>{locationName ?? 'No Location'}</Text>
          </View>
          {nearExpiry && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Near expiry</Text>
            </View>
          )}
        </View>
      ))}

      <Text style={styles.heading}>Barcodes</Text>
      {d.barcodes.length === 0 && <Text style={ui.mute}>No Barcodes yet.</Text>}
      {d.barcodes.map((b) => (
        <View key={b.code} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={ui.body}>{[b.brand, b.productName, b.packSize].filter(Boolean).join(' · ') || b.code}</Text>
            <Text style={ui.mute}>
              {b.code} · one scan adds {b.unitsPerScan} {supply.unit}
            </Text>
          </View>
        </View>
      ))}

      <Text style={styles.heading}>Stock levels</Text>
      <Text style={ui.body}>Minimum: {supply.minimum ?? 'none (never Low stock)'}</Text>
      <Text style={ui.body}>Restock to: {supply.restockTo ?? 'none'}</Text>

      <Text style={styles.heading}>History</Text>
      <HistoryList entries={entries} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 40, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 13, color: colors.mute, textTransform: 'uppercase', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  badge: { backgroundColor: colors.warnSoft, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { color: colors.warn, fontSize: 12, fontWeight: '600' },
});
