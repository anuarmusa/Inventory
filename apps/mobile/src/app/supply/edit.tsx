import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { Toggle } from '../../scan/pickers';
import { useSession } from '../../session/SessionProvider';
import { liveCategories, liveLocations, saveSupply, supplyForm, supplyProblems } from '@inventory/shared';
import { Choice, NumberField, TextField } from '../../ui/form';
import { colors, ui } from '../../ui/styles';

/** New Supply, or edit one. Deleting hides it and can be undone from its History. */
export default function EditSupply() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { inventory, record } = useSession();
  const existing = id ? inventory.supplies[id] : undefined;
  const [form, setForm] = useState(() => supplyForm(existing));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const problems = supplyProblems(form);

  const save = async () => {
    const body = saveSupply(existing, form, randomUUID);
    if (body) await record(body);
    if (!existing && body?.type === 'supply.created') router.replace({ pathname: '/supply/[id]', params: { id: body.payload.supplyId } });
    else router.back();
  };

  const remove = () =>
    Alert.alert('Delete this Supply?', 'It is hidden, with its history kept. Delete is for mistakes, and can be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void record({ type: 'supply.deleted', payload: { supplyId: existing!.id } }).then(() => router.dismissTo('/')),
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: existing ? `Edit ${existing.name}` : 'New Supply' }} />
      <TextField label="Name: the general thing, any brand" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Jasmine rice" />
      <TextField label="Counted in" value={form.unit} onChange={(v) => set('unit', v)} placeholder="packs, bottles, rolls…" />
      <Choice label="Category" options={liveCategories(inventory)} value={form.categoryId} onChange={(v) => set('categoryId', v)} noneLabel="None" />
      <Choice label="Usually kept in" options={liveLocations(inventory)} value={form.usualLocationId} onChange={(v) => set('usualLocationId', v)} noneLabel="Not set" />
      <NumberField label="Minimum" value={form.minimum} onChange={(v) => set('minimum', v)} hint="At or below this it is Low stock. Leave empty: never Low stock." />
      <NumberField label="Restock to" value={form.restockTo} onChange={(v) => set('restockTo', v)} hint="The Shopping list buys back up to this." />
      <Text style={ui.label}>Does it expire?</Text>
      <Toggle
        value={form.expires ? 'yes' : 'no'}
        options={[
          ['yes', 'Yes'],
          ['no', 'Doesn’t expire'],
        ]}
        onChange={(v) => set('expires', v === 'yes')}
      />
      {form.expires && (
        <NumberField
          label="Near expiry warning (days)"
          value={form.nearExpiryDays}
          onChange={(v) => set('nearExpiryDays', v)}
          hint="Leave empty to use the household’s 7 days."
        />
      )}
      {problems.map((p) => (
        <Text key={p} style={{ color: colors.bad }}>
          {p}
        </Text>
      ))}
      <Pressable style={[ui.primary, problems.length > 0 && { opacity: 0.4 }]} disabled={problems.length > 0} onPress={() => void save()}>
        <Text style={ui.primaryText}>Save</Text>
      </Pressable>
      {existing && !existing.deletedAt && (
        <Pressable onPress={remove} style={{ alignItems: 'center', padding: 10 }}>
          <Text style={{ color: colors.bad }}>Delete this Supply</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
