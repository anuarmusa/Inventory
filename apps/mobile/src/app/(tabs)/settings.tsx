import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '../../session/SessionProvider';
import { canDeleteCategory, canDeleteLocation, liveCategories, liveLocations } from '@inventory/shared';
import { colors, ui } from '../../ui/styles';

type Kind = 'location' | 'category';

/** Settings: the household's Locations and Categories. Either can be deleted only when empty. */
export default function Settings() {
  const { inventory, record, session } = useSession();
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <List kind="location" title="Locations" items={liveLocations(inventory)} canDelete={(id) => canDeleteLocation(inventory, id)} record={record} />
      <List kind="category" title="Categories" items={liveCategories(inventory)} canDelete={(id) => canDeleteCategory(inventory, id)} record={record} />
      <Text style={styles.heading}>This phone</Text>
      <Text style={ui.body}>
        {session?.deviceName} · {session?.server}
      </Text>
      <Pressable onPress={() => router.push('/unsent')}>
        <Text style={{ color: colors.accent }}>Unsent changes ›</Text>
      </Pressable>
    </ScrollView>
  );
}

function List({
  kind,
  title,
  items,
  canDelete,
  record,
}: {
  kind: Kind;
  title: string;
  items: { id: string; name: string }[];
  canDelete(id: string): boolean;
  record: ReturnType<typeof useSession>['record'];
}) {
  const [adding, setAdding] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    void record(
      kind === 'location'
        ? { type: 'location.created', payload: { locationId: randomUUID(), name } }
        : { type: 'category.created', payload: { categoryId: randomUUID(), name } },
    );
    setAdding('');
  };
  const rename = () => {
    if (!renaming?.name.trim()) return;
    const name = renaming.name.trim();
    void record(
      kind === 'location'
        ? { type: 'location.renamed', payload: { locationId: renaming.id, name } }
        : { type: 'category.renamed', payload: { categoryId: renaming.id, name } },
    );
    setRenaming(null);
  };
  const remove = (item: { id: string; name: string }) => {
    if (!canDelete(item.id)) {
      Alert.alert(
        `${item.name} isn’t empty`,
        kind === 'location' ? 'Move or use up what’s kept there first.' : 'Give its Supplies and Assets another Category first.',
      );
      return;
    }
    Alert.alert(`Delete ${item.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void record(
            kind === 'location'
              ? { type: 'location.deleted', payload: { locationId: item.id } }
              : { type: 'category.deleted', payload: { categoryId: item.id } },
          ),
      },
    ]);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.heading}>{title}</Text>
      {items.map((item) =>
        renaming?.id === item.id ? (
          <View key={item.id} style={styles.row}>
            <TextInput style={[ui.input, { flex: 1, paddingVertical: 6 }]} value={renaming.name} onChangeText={(name) => setRenaming({ ...renaming, name })} autoFocus />
            <Pressable onPress={rename}>
              <Text style={{ color: colors.accent }}>Save</Text>
            </Pressable>
          </View>
        ) : (
          <View key={item.id} style={styles.row}>
            <Pressable
              style={{ flex: 1 }}
              disabled={kind !== 'location'}
              onPress={() => router.push({ pathname: '/location/[id]', params: { id: item.id } })}
            >
              <Text style={ui.body}>{item.name}</Text>
            </Pressable>
            <Pressable onPress={() => setRenaming(item)}>
              <Text style={{ color: colors.accent }}>Rename</Text>
            </Pressable>
            <Pressable onPress={() => remove(item)}>
              <Text style={{ color: colors.bad }}>Delete</Text>
            </Pressable>
          </View>
        ),
      )}
      <View style={styles.row}>
        <TextInput style={[ui.input, { flex: 1, paddingVertical: 8 }]} value={adding} onChangeText={setAdding} placeholder={`New ${kind === 'location' ? 'Location' : 'Category'}`} onSubmitEditing={add} />
        <Pressable onPress={add} disabled={!adding.trim()}>
          <Text style={{ color: adding.trim() ? colors.accent : colors.mute }}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, color: colors.mute, textTransform: 'uppercase', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
});
