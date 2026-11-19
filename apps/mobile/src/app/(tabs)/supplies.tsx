import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { ListRow } from '../../home/parts';
import { useSession } from '../../session/SessionProvider';
import { supplyList } from '@inventory/shared';
import { ui } from '../../ui/styles';

/** Every Supply with what's on hand; opens its page. */
export default function Supplies() {
  const { inventory } = useSession();
  const [search, setSearch] = useState('');
  const items = useMemo(() => supplyList(inventory, search), [inventory, search]);
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search Supplies" />
      <Pressable style={[ui.primary, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]} onPress={() => router.push('/supply/edit')}>
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={ui.primaryText}>New Supply</Text>
      </Pressable>
      {items.length === 0 && <Text style={ui.mute}>{search ? 'No Supply matches.' : 'No Supplies yet. Scan what you buy, or add one.'}</Text>}
      {items.map(({ supply, onHand }) => (
        <ListRow
          icon="basket-outline"
          tone="ok"
          key={supply.id}
          title={supply.name}
          badge={`${onHand} ${supply.unit}`}
          href={{ pathname: '/supply/[id]', params: { id: supply.id } }}
        />
      ))}
    </ScrollView>
  );
}
