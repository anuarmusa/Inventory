import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { history } from '../../history/history';
import { HistoryList } from '../../history/HistoryList';
import { localToday } from '../../home/lists';
import { formatDate } from '../../scan/dates';
import { useSession } from '../../session/SessionProvider';
import { DISPOSE_REASONS, liveLocations, parseRinggit, ringgit } from '../../things/things';
import { SyncStatusBar } from '../../ui/SyncStatusBar';
import { colors, ui } from '../../ui/styles';

type Panel = 'move' | 'maintenance' | 'dispose' | null;

/**
 * The Asset page (spec §6.3): all details, photos, the maintenance log and History. It offers Move,
 * Log maintenance and Dispose (with a reason). A Disposed Asset still opens, shown as Disposed.
 */
export default function AssetPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { inventory, unsent, record } = useSession();
  const asset = id ? inventory.assets[id] : undefined;
  const entries = useMemo(() => (id ? history(inventory, unsent, { assetId: id }) : []), [inventory, unsent, id]);
  const maintenance = useMemo(
    () => Object.values(inventory.maintenanceEntries).filter((m) => m.assetId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [inventory, id],
  );
  const label = useMemo(() => Object.values(inventory.labels).find((l) => l.assetId === id && !l.retiredAt), [inventory, id]);
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');

  if (!asset) {
    return (
      <View style={ui.centered}>
        <Stack.Screen options={{ headerShown: true, title: 'Asset' }} />
        <Text style={ui.mute}>This Asset isn’t in the inventory.</Text>
      </View>
    );
  }
  const location = asset.locationId ? inventory.locations[asset.locationId] : undefined;
  const category = asset.categoryId ? inventory.categories[asset.categoryId] : undefined;
  const costSen = parseRinggit(cost);
  const owned = !asset.disposedAt && !asset.deletedAt;
  const warrantyOver = asset.warrantyEnd !== null && asset.warrantyEnd < localToday();

  const Row = ({ k, v }: { k: string; v: string | null | undefined }) => (
    <View style={styles.kv}>
      <Text style={[ui.mute, { width: 110 }]}>{k}</Text>
      <Text style={[ui.body, { flex: 1 }]}>{v || '—'}</Text>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: asset.name }} />
      <SyncStatusBar />
      {asset.disposedAt && (
        <View style={ui.note}>
          <Text style={ui.noteText}>
            Disposed {formatDate(asset.disposedAt)}: {asset.disposedReason}
          </Text>
        </View>
      )}
      {asset.deletedAt && (
        <View style={ui.note}>
          <Text style={ui.noteText}>This Asset was deleted.</Text>
        </View>
      )}
      <Pressable disabled={!location} onPress={() => location && router.push({ pathname: '/location/[id]', params: { id: location.id } })}>
        <Row k="Location" v={location ? `${location.name} ›` : null} />
      </Pressable>
      <Row k="Category" v={category?.name} />
      <Row k="Bought" v={[asset.purchaseDate && formatDate(asset.purchaseDate), asset.priceSen !== null && ringgit(asset.priceSen)].filter(Boolean).join(' · ')} />
      <Row k="Shop" v={asset.shop} />
      <Row k="Serial" v={asset.serialNumber} />
      <Row k="Warranty" v={asset.warrantyEnd ? `until ${formatDate(asset.warrantyEnd)}${warrantyOver ? ' (ended)' : ''}` : null} />
      <Row k="Label" v={label ? label.code : 'No Label yet'} />
      <Row k="Photos" v={asset.photoIds.length ? `${asset.photoIds.length} photo${asset.photoIds.length > 1 ? 's' : ''}` : 'None yet'} />
      {asset.notes && <Text style={ui.body}>{asset.notes}</Text>}

      {owned && (
        <View style={styles.buttons}>
          {(['move', 'maintenance', 'dispose'] as const).map((p) => (
            <Pressable key={p} style={[styles.button, panel === p && styles.buttonOn]} onPress={() => setPanel(panel === p ? null : p)}>
              <Text style={{ color: panel === p ? '#fff' : colors.ink }}>{{ move: 'Move', maintenance: 'Log maintenance', dispose: 'Dispose' }[p]}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.button} onPress={() => router.push({ pathname: '/asset/edit', params: { id: asset.id } })}>
            <Text>Edit</Text>
          </Pressable>
        </View>
      )}

      {panel === 'move' && (
        <View style={styles.chips}>
          {liveLocations(inventory)
            .filter((l) => l.id !== asset.locationId)
            .map((l) => (
              <Pressable
                key={l.id}
                style={styles.button}
                onPress={() => void record({ type: 'asset.moved', payload: { assetId: asset.id, toLocationId: l.id } }).then(() => setPanel(null))}
              >
                <Text>{l.name}</Text>
              </Pressable>
            ))}
        </View>
      )}
      {panel === 'maintenance' && (
        <View style={{ gap: 8 }}>
          <TextInput style={ui.input} value={note} onChangeText={setNote} placeholder="What was done, e.g. New belt" />
          <TextInput style={ui.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="Cost RM (optional)" />
          <Pressable
            style={[ui.primary, (!note.trim() || costSen === undefined) && { opacity: 0.4 }]}
            disabled={!note.trim() || costSen === undefined}
            onPress={() =>
              void record({
                type: 'maintenance.added',
                payload: { entryId: randomUUID(), assetId: asset.id, date: localToday(), note: note.trim(), costSen: costSen ?? null },
              }).then(() => {
                setNote('');
                setCost('');
                setPanel(null);
              })
            }
          >
            <Text style={ui.primaryText}>Save maintenance</Text>
          </Pressable>
        </View>
      )}
      {panel === 'dispose' && (
        <View style={{ gap: 8 }}>
          <View style={styles.chips}>
            {DISPOSE_REASONS.map((r) => (
              <Pressable key={r} style={[styles.button, reason === r && styles.buttonOn]} onPress={() => setReason(r)}>
                <Text style={{ color: reason === r ? '#fff' : colors.ink }}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={ui.input} value={reason} onChangeText={setReason} placeholder="Or type the reason" />
          <Pressable
            style={[ui.primary, !reason.trim() && { opacity: 0.4 }]}
            disabled={!reason.trim()}
            onPress={() =>
              void record({ type: 'asset.disposed', payload: { assetId: asset.id, date: localToday(), reason: reason.trim() } }).then(() => setPanel(null))
            }
          >
            <Text style={ui.primaryText}>Dispose</Text>
          </Pressable>
          <Text style={ui.mute}>It stays in history and can be restored with Undo.</Text>
        </View>
      )}

      <Text style={styles.heading}>Maintenance</Text>
      {maintenance.length === 0 && <Text style={ui.mute}>None yet.</Text>}
      {maintenance.map((m) => (
        <Text key={m.id} style={ui.body}>
          {formatDate(m.date)}: {m.note}
          {m.costSen !== null ? ` · ${ringgit(m.costSen)}` : ''}
        </Text>
      ))}

      <Text style={styles.heading}>History</Text>
      <HistoryList entries={entries} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kv: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  buttonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  heading: { fontSize: 13, color: colors.mute, textTransform: 'uppercase', marginTop: 12 },
});
