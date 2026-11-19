import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { attachLabel } from '../../scan/labels';
import { useSession } from '../../session/SessionProvider';
import { assetForm, assetProblems, liveCategories, liveLocations, parseRinggit, saveAsset } from '@inventory/shared';
import { Choice, DateField, TextField } from '../../ui/form';
import { colors, ui } from '../../ui/styles';

/** New Asset, or edit one. Deleting hides it and can be undone from its History. */
export default function EditAsset() {
  /** `label`: a Blank label to attach to the new Asset. */
  const { id, label } = useLocalSearchParams<{ id?: string; label?: string }>();
  const { inventory, record } = useSession();
  const existing = id ? inventory.assets[id] : undefined;
  const [form, setForm] = useState(() => assetForm(existing));
  const [price, setPrice] = useState(existing?.priceSen != null ? (existing.priceSen / 100).toFixed(2) : '');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const priceSen = parseRinggit(price);
  const problems = [...assetProblems(form), ...(priceSen === undefined ? ['The price should look like 349 or 349.90.'] : [])];

  const save = async () => {
    const body = saveAsset(existing, { ...form, priceSen: priceSen ?? null }, randomUUID);
    if (body) await record(body);
    if (label && body?.type === 'asset.created') await record(attachLabel(label, { assetId: body.payload.assetId }));
    if (!existing && body?.type === 'asset.created') router.replace({ pathname: '/asset/[id]', params: { id: body.payload.assetId } });
    else router.back();
  };

  const remove = () =>
    Alert.alert('Delete this Asset?', 'Delete is for mistakes: it is hidden, with its history kept, and can be undone. To record that it’s gone, Dispose of it instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void record({ type: 'asset.deleted', payload: { assetId: existing!.id } }).then(() => router.dismissTo('/')),
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: existing ? `Edit ${existing.name}` : 'New Asset' }} />
      {label && <Text style={ui.mute}>Label {label} will be attached to it.</Text>}
      <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} placeholder='e.g. Samsung 55" TV' />
      <Choice label="Category" options={liveCategories(inventory)} value={form.categoryId} onChange={(v) => set('categoryId', v)} noneLabel="None" />
      <Choice label="Location" options={liveLocations(inventory)} value={form.locationId} onChange={(v) => set('locationId', v)} noneLabel="Not set" />
      <DateField label="Bought on" value={form.purchaseDate} onChange={(v) => set('purchaseDate', v)} />
      <View>
        <Text style={ui.label}>Price (RM)</Text>
        <TextInput style={ui.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="e.g. 2899" />
      </View>
      <TextField label="Shop" value={form.shop} onChange={(v) => set('shop', v)} />
      <TextField label="Serial number" value={form.serialNumber} onChange={(v) => set('serialNumber', v)} />
      <DateField label="Warranty ends" value={form.warrantyEnd} onChange={(v) => set('warrantyEnd', v)} />
      <TextField label="Notes" value={form.notes} onChange={(v) => set('notes', v)} multiline />
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
          <Text style={{ color: colors.bad }}>Delete this Asset</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
