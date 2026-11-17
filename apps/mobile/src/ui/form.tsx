import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDate, parseTypedDate } from '@inventory/shared';
import { colors, ui } from './styles';

/** A labelled text box. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string | null;
  onChange(v: string): void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={[ui.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        multiline={multiline}
      />
    </View>
  );
}

/** A whole number, or empty for "none". */
export function NumberField({ label, value, onChange, hint }: { label: string; value: number | null; onChange(v: number | null): void; hint?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <View>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={ui.input}
        value={text}
        keyboardType="number-pad"
        placeholder="none"
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '');
          setText(digits);
          onChange(digits ? Number(digits) : null);
        }}
      />
      {hint && <Text style={ui.mute}>{hint}</Text>}
    </View>
  );
}

/** A calendar date typed as day/month/year, or empty for none. */
export function DateField({ label, value, onChange }: { label: string; value: string | null; onChange(v: string | null): void }) {
  const [text, setText] = useState(value ? formatTyped(value) : '');
  const parsed = parseTypedDate(text);
  return (
    <View>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={ui.input}
        value={text}
        keyboardType="numbers-and-punctuation"
        placeholder="31/12/2026"
        onChangeText={(t) => {
          setText(t);
          onChange(t.trim() ? parseTypedDate(t) : null);
        }}
      />
      {text.trim() !== '' && <Text style={ui.mute}>{parsed ? formatDate(parsed) : 'Not a date yet: day/month/year'}</Text>}
    </View>
  );
}

function formatTyped(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** Pick one of a few options, or none. */
export function Choice({
  label,
  options,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string | null;
  onChange(id: string | null): void;
  /** Offer "none" with this label; leave out to require a choice. */
  noneLabel?: string;
}) {
  const all = noneLabel ? [{ id: '', name: noneLabel }, ...options] : options;
  return (
    <View>
      <Text style={ui.label}>{label}</Text>
      <View style={styles.chips}>
        {all.map((o) => {
          const on = (value ?? '') === o.id;
          return (
            <Pressable key={o.id || 'none'} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange(o.id || null)}>
              <Text style={{ color: on ? '#fff' : colors.ink }}>{o.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {options.length === 0 && <Text style={ui.mute}>None yet: add them in Settings.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
