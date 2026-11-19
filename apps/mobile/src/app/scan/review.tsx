import { type Action, ActionBody } from '@inventory/shared';
import { randomUUID } from 'expo-crypto';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  addLocation,
  lineLocation,
  lineQuantity,
  problems,
  putAway,
  removeLine,
  setLocation,
  setScans,
  supplyOf,
} from '../../scan/basket';
import { useBasket } from '../../scan/BasketProvider';
import { formatDate } from '@inventory/shared';
import { LocationPicker, Stepper } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { colors, ui } from '../../ui/styles';
import { useToast } from '../../ui/Toast';

/** How long the Undo toast shows; the sync waits for it, so Undo leaves nothing in history. */
const UNDO_MS = 6_000;

/** The basket before "Put away": change how many, the Location (the usual one by default), or remove a line. */
export default function Review() {
  const { inventory, record, dropUnsent } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { basket, update, clear } = useBasket();
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!basket.lines.length) return <Redirect href="/scan" />;
  const missing = problems(basket, inventory);

  const save = async () => {
    setSaving(true);
    try {
      // Check every Action first, so a basket is never half put away.
      const actions = putAway(basket, inventory, randomUUID).map((a) => ActionBody.parse(a));
      const recorded: Action[] = [];
      for (const action of actions) recorded.push(await record(action, { syncDelayMs: UNDO_MS }));
      const n = basket.lines.length;
      clear();
      router.dismissTo('/');
      toast({
        text: n === 1 ? '1 line put away.' : `${n} lines put away.`,
        actionLabel: 'Undo',
        ms: UNDO_MS,
        onAction: () => {
          // Still unsent: dropping them leaves nothing in history.
          void Promise.all([...recorded].reverse().map((a) => dropUnsent(a.id))).then((dropped) =>
            toast({ text: dropped.every(Boolean) ? 'Undone.' : 'Already synced: undo it from Recent activity.' }),
          );
        },
      });
    } catch (e) {
      Alert.alert('Couldn’t put it away', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={[ui.screen, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.title}>Put away</Text>
        {basket.lines.map((line) => {
          const supply = supplyOf(basket, inventory, line.supplyId);
          const where = lineLocation(basket, inventory, line);
          const whereName = where ? (inventory.locations[where]?.name ?? basket.newLocations[where]) : null;
          const needsWhere = missing.some((p) => p.code === line.code && p.problem === 'location');
          const total = lineQuantity(line);
          return (
            <View key={line.code} style={styles.line}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[ui.body, { fontWeight: '700', flex: 1 }]}>{supply?.name}</Text>
                <Stepper
                  value={line.scans}
                  unit={line.unitsPerScan > 1 ? `× ${line.unitsPerScan}` : supply?.unit}
                  onChange={(n) => update((b) => setScans(b, line.code, n))}
                />
              </View>
              <Text style={ui.mute}>
                {line.unitsPerScan > 1 ? `${total} ${supply?.unit} · ` : ''}
                {supply?.expires
                  ? line.split
                    ? `${total - line.split.quantity} exp ${formatDate(line.expiry)} · ${line.split.quantity} exp ${formatDate(line.split.expiry)}`
                    : line.expiry
                      ? `Expires ${formatDate(line.expiry)}`
                      : 'No date on the pack'
                  : 'Doesn’t expire'}
              </Text>
              <Pressable onPress={() => setOpen(open === line.code ? null : line.code)}>
                <Text style={{ color: needsWhere ? colors.bad : colors.accent }}>
                  {needsWhere ? 'Where does it go? Choose a Location' : `→ ${whereName}${line.locationId ? '' : ' (usual)'} · change`}
                </Text>
              </Pressable>
              {open === line.code && (
                <LocationPicker
                  inventory={inventory}
                  basket={basket}
                  value={where}
                  usualId={supply?.usualLocationId ?? null}
                  onPick={(id) => {
                    update((b) => setLocation(b, line.code, id));
                    setOpen(null);
                  }}
                  onNew={(id, name) => {
                    update((b) => setLocation(addLocation(b, id, name), line.code, id));
                    setOpen(null);
                  }}
                />
              )}
              <Pressable onPress={() => update((b) => removeLine(b, line.code))}>
                <Text style={{ color: colors.bad }}>Remove</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
        {missing.length > 0 && <Text style={{ color: colors.bad }}>Choose a Location for every line first.</Text>}
        <Pressable
          style={[ui.primary, (missing.length > 0 || saving) && { opacity: 0.4 }]}
          disabled={missing.length > 0 || saving}
          onPress={() => void save()}
        >
          <Text style={ui.primaryText}>{saving ? 'Putting away…' : `Put away ${basket.lines.length} line${basket.lines.length > 1 ? 's' : ''}`}</Text>
        </Pressable>
        <Pressable onPress={() => router.navigate('/scan')} style={{ alignItems: 'center', padding: 6 }}>
          <Text style={ui.mute}>Scan more</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12, gap: 6 },
});
