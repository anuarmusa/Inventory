import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { ListRow } from '../home/parts';
import { useSession } from '../session/SessionProvider';
import { supplyList } from '../things/things';
import { ui } from '../ui/styles';

/** Every Supply with what's on hand; opens its page. */
export default function Supplies() {
  const { inventory } = useSession();
  const [search, setSearch] = useState('');
  const items = useMemo(() => supplyList(inventory, search), [inventory, search]);
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: 'Supplies' }} />
      <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search Supplies" />
      <Pressable style={ui.secondary} onPress={() => router.push('/supply/edit')}>
        <Text style={ui.secondaryText}>+ New Supply</Text>
      </Pressable>
      {items.length === 0 && <Text style={ui.mute}>{search ? 'No Supply matches.' : 'No Supplies yet. Scan what you buy, or add one.'}</Text>}
      {items.map(({ supply, onHand }) => (
        <ListRow
          key={supply.id}
          title={supply.name}
          badge={`${onHand} ${supply.unit}`}
          href={{ pathname: '/supply/[id]', params: { id: supply.id } }}
        />
      ))}
    </ScrollView>
  );
}
