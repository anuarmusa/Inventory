import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { ListRow } from '../home/parts';
import { useSession } from '../session/SessionProvider';
import { assetList } from '../things/things';
import { ui } from '../ui/styles';

/** Every Asset, owned ones first. Asset value isn't shown on the phone (spec §6.1). */
export default function Assets() {
  const { inventory } = useSession();
  const [search, setSearch] = useState('');
  const items = useMemo(() => assetList(inventory, search), [inventory, search]);
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: 'Assets' }} />
      <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search Assets" />
      <Pressable style={ui.secondary} onPress={() => router.push('/asset/edit')}>
        <Text style={ui.secondaryText}>+ New Asset</Text>
      </Pressable>
      {items.length === 0 && <Text style={ui.mute}>{search ? 'No Asset matches.' : 'No Assets yet.'}</Text>}
      {items.map((a) => (
        <ListRow
          key={a.id}
          title={a.name}
          detail={a.locationId ? inventory.locations[a.locationId]?.name : null}
          badge={a.disposedAt ? 'Disposed' : 'Owned'}
          href={{ pathname: '/asset/[id]', params: { id: a.id } }}
        />
      ))}
    </ScrollView>
  );
}
