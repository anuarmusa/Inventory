import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COMMON_UNITS, type Inventory, unitProblem } from '@inventory/shared';
import { colors, ui } from '../ui/styles';
import type { Basket, SupplyChoice } from './basket';

/** A whole-number stepper. */
export function Stepper({ value, min = 1, unit, onChange }: { value: number; min?: number; unit?: string; onChange(n: number): void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.max(min, value - 1))} accessibilityLabel="Fewer">
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={[ui.body, { minWidth: 70, textAlign: 'center', fontWeight: '700' }]}>
        {value} {unit ?? ''}
      </Text>
      <Pressable style={styles.stepButton} onPress={() => onChange(value + 1)} accessibilityLabel="More">
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

/** Two choices side by side; the chosen one is filled. */
export function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map(([v, label]) => (
        <Pressable key={v} style={[styles.chip, value === v && styles.chipOn]} onPress={() => onChange(v)}>
          <Text style={{ color: value === v ? '#fff' : colors.ink }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * "Which Supply is it?": search the household's Supplies (and ones new in this basket), or make a
 * new one. A Supply is the general thing, whatever the brand.
 */
export function SupplyPicker({
  inventory,
  basket,
  suggestion,
  value,
  onChange,
  allowNew = true,
}: {
  inventory: Inventory;
  basket: Basket;
  suggestion: string;
  value: SupplyChoice | null;
  onChange(choice: SupplyChoice | null): void;
  /** False to choose only an existing Supply. */
  allowNew?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [making, setMaking] = useState(false);
  const [name, setName] = useState(suggestion);
  const [unit, setUnit] = useState('pieces');
  const [expires, setExpires] = useState<'yes' | 'no'>('yes');
  const [newId] = useState(randomUUID);

  const options = useMemo(() => {
    const all = [
      ...Object.values(inventory.supplies)
        .filter((s) => !s.deletedAt)
        .map((s) => ({ id: s.id, name: s.name, unit: s.unit })),
      ...Object.values(basket.newSupplies).map((s) => ({
        id: s.supplyId,
        name: s.name,
        unit: s.unit,
      })),
    ];
    const q = search.trim().toLowerCase();
    return all.filter((s) => !q || s.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory, basket, search]);

  const chosenId = value && 'supplyId' in value ? value.supplyId : null;
  const makeNew = (n = name, u = unit, e = expires) =>
    onChange(
      n.trim() && !unitProblem(u)
        ? {
            newSupply: {
              supplyId: newId,
              name: n.trim(),
              unit: u.trim(),
              expires: e === 'yes',
            },
          }
        : null,
    );

  if (making) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Item name</Text>
        <TextInput
          style={ui.input}
          value={name}
          placeholder="e.g. Mushroom soup"
          onChangeText={(t) => {
            setName(t);
            makeNew(t);
          }}
        />
        <Text style={ui.mute}>
          What you call it at home, any brand: every brand of it shares this name. The name on the pack stays with the barcode.
        </Text>
        <Text style={ui.label}>Counted in</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {COMMON_UNITS.map((u) => (
            <Pressable
              key={u}
              style={[styles.chip, unit === u && styles.chipOn]}
              onPress={() => {
                setUnit(u);
                makeNew(name, u);
              }}
            >
              <Text style={{ color: unit === u ? '#fff' : colors.ink }}>{u}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={ui.input}
          value={COMMON_UNITS.includes(unit) ? '' : unit}
          placeholder="or type another, e.g. tubs"
          onChangeText={(t) => {
            setUnit(t);
            makeNew(name, t);
          }}
        />
        {unitProblem(unit) && <Text style={{ color: colors.bad }}>{unitProblem(unit)}</Text>}
        <Text style={ui.label}>Does it expire?</Text>
        <Toggle
          value={expires}
          options={[
            ['yes', 'Yes'],
            ['no', 'Doesn’t expire'],
          ]}
          onChange={(v) => {
            setExpires(v);
            makeNew(name, unit, v);
          }}
        />
        <Pressable
          onPress={() => {
            setMaking(false);
            onChange(null);
          }}
        >
          <Text style={{ color: colors.accent }}>Pick an existing Supply instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search Supplies" />
      <View style={{ maxHeight: 220 }}>
        {options.slice(0, 8).map((s) => (
          <Pressable key={s.id} style={[styles.option, chosenId === s.id && styles.optionOn]} onPress={() => onChange({ supplyId: s.id })}>
            <Text style={ui.body}>{s.name}</Text>
            <Text style={ui.mute}>{s.unit}</Text>
          </Pressable>
        ))}
        {options.length === 0 && <Text style={ui.mute}>No Supply matches.</Text>}
      </View>
      {allowNew && (
        <Pressable
          style={ui.secondary}
          onPress={() => {
            setMaking(true);
            // Start from the product's name: search text is often something else (a shop, a brand).
            const n = suggestion.trim() || search.trim();
            setName(n);
            makeNew(n);
          }}
        >
          <Text style={ui.secondaryText}>+ New Supply</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Picks a Location, or makes a new one. */
export function LocationPicker({
  inventory,
  basket,
  value,
  usualId,
  onPick,
  onNew,
}: {
  inventory: Inventory;
  basket: Basket;
  value: string | null;
  usualId: string | null;
  onPick(locationId: string): void;
  onNew(locationId: string, name: string): void;
}) {
  const [name, setName] = useState('');
  const options = [
    ...Object.values(inventory.locations)
      .filter((l) => !l.deletedAt)
      .map((l) => ({ id: l.id, name: l.name })),
    ...Object.entries(basket.newLocations).map(([id, n]) => ({ id, name: n })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((l) => (
          <Pressable key={l.id} style={[styles.chip, value === l.id && styles.chipOn]} onPress={() => onPick(l.id)}>
            <Text style={{ color: value === l.id ? '#fff' : colors.ink }}>
              {l.name}
              {l.id === usualId ? ' (usual)' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput style={[ui.input, { flex: 1, paddingVertical: 8 }]} value={name} onChangeText={setName} placeholder="New Location" />
        <Pressable
          style={[styles.chip, { justifyContent: 'center' }]}
          disabled={!name.trim()}
          onPress={() => {
            onNew(randomUUID(), name.trim());
            setName('');
          }}
        >
          <Text style={{ color: name.trim() ? colors.accent : colors.mute }}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, color: colors.ink },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
  },
  optionOn: { backgroundColor: colors.accentSoft },
});
