import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { keepTicks, shoppingList } from '@inventory/shared';
import { ListScreen } from '../home/parts';
import { KEYS } from '../session/session';
import { useSession } from '../session/SessionProvider';
import { phoneStore } from '../session/store';
import { colors, ui } from '../ui/styles';

/** To buy: the Shopping list, a tick-off checklist with the amount to buy. Ticks stay on this phone. */
export default function ShoppingList() {
  const { inventory } = useSession();
  const items = useMemo(() => shoppingList(inventory), [inventory]);
  const [ticked, setTicked] = useState<string[]>([]);

  useEffect(() => {
    void phoneStore.get(KEYS.shoppingTicks).then((raw) => {
      try {
        setTicked(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setTicked([]);
      }
    });
  }, []);

  const toggle = (supplyId: string) => {
    const next = ticked.includes(supplyId) ? ticked.filter((id) => id !== supplyId) : [...ticked, supplyId];
    const kept = keepTicks(next, items);
    setTicked(kept);
    void phoneStore.set(KEYS.shoppingTicks, JSON.stringify(kept));
  };

  return (
    <ListScreen title="Shopping list" empty="Nothing to buy.">
      {items.map(({ supply, onHand, amount }) => {
        const done = ticked.includes(supply.id);
        return (
          <Pressable
            key={supply.id}
            style={styles.row}
            onPress={() => toggle(supply.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
          >
            <View style={[styles.box, done && styles.boxDone]}>{done ? <Text style={styles.tick}>✓</Text> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={[ui.body, done && styles.doneText]}>
                {supply.name} · <Text style={{ fontWeight: '700' }}>{amount} {supply.unit}</Text>
              </Text>
              <Text style={ui.mute}>{onHand} at home</Text>
            </View>
          </Pressable>
        );
      })}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#fff', fontWeight: '700' },
  doneText: { textDecorationLine: 'line-through', color: colors.mute },
});
