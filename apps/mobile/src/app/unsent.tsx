import type { Action } from '@inventory/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { describeAction, editableQuantity, withQuantity } from '../sync/describe';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { colors, ui } from '../ui/styles';

/**
 * Unsent changes (spec §5): Actions this phone took that the home server hasn't got yet. They can be
 * changed or dropped; nothing of them reaches history until they sync.
 */
export default function Unsent() {
  const { unsent, inventory, dropUnsent, editUnsent } = useSession();
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const confirmDrop = (action: Action) =>
    Alert.alert('Drop this change?', describeAction(action, inventory), [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Drop',
        style: 'destructive',
        onPress: async () => {
          if (!(await dropUnsent(action.id))) Alert.alert('Already synced', 'Undo it from history instead.');
        },
      },
    ]);

  const save = async (action: Action) => {
    try {
      const ok = await editUnsent(action.id, withQuantity(action, Number(amount)));
      if (!ok) Alert.alert('Already synced', 'Correct it from history instead.');
      setEditing(null);
    } catch (e) {
      Alert.alert('Check the amount', (e as Error).message);
    }
  };

  return (
    <View style={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Unsent changes' }} />
      <SyncStatusBar />
      <FlatList
        data={unsent}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Text style={ui.mute}>Everything has reached the home server.</Text>}
        renderItem={({ item }) => {
          const quantity = editableQuantity(item);
          return (
            <View style={styles.row}>
              <Text style={ui.body}>{describeAction(item, inventory)}</Text>
              <Text style={ui.mute}>{new Date(item.deviceTime).toLocaleString()}</Text>
              {editing === item.id ? (
                <View style={styles.actions}>
                  <TextInput
                    style={[ui.input, { flex: 1 }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    autoFocus
                    accessibilityLabel="Amount"
                  />
                  <Pressable style={styles.button} onPress={() => void save(item)}>
                    <Text style={{ color: colors.accent }}>Save</Text>
                  </Pressable>
                  <Pressable style={styles.button} onPress={() => setEditing(null)}>
                    <Text style={{ color: colors.mute }}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actions}>
                  {quantity !== null && (
                    <Pressable
                      style={styles.button}
                      onPress={() => {
                        setAmount(String(quantity));
                        setEditing(item.id);
                      }}
                    >
                      <Text style={{ color: colors.accent }}>Change amount</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.button} onPress={() => confirmDrop(item)}>
                    <Text style={{ color: colors.bad }}>Drop</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12, gap: 4 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
});
