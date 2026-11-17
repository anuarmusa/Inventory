import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { colors, ui } from '../ui/styles';
import { type HistoryEntry, undoBody } from '@inventory/shared';

const COUNTED_SINCE = 'Counted since: this won’t change the amount.';

/** History entries with Undo / Fix; originals struck through when undone or fixed. */
export function HistoryList({ entries, empty = 'Nothing yet.' }: { entries: HistoryEntry[]; empty?: string }) {
  const { record } = useSession();
  if (entries.length === 0) return <Text style={ui.mute}>{empty}</Text>;

  const undo = (e: HistoryEntry) => {
    const restoring = Boolean(e.undone);
    Alert.alert(restoring ? 'Bring this back?' : 'Undo this?', [e.text, !restoring && e.countedSince ? COUNTED_SINCE : ''].filter(Boolean).join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: restoring ? 'Bring back' : 'Undo', onPress: () => void record(undoBody(e)) },
    ]);
  };

  return (
    <View>
      {entries.map((e) => {
        const struck = Boolean(e.undone || e.fixed);
        return (
          <View key={e.id} style={styles.row}>
            <Text style={[ui.body, struck && styles.struck, e.skipped && { color: colors.mute }]}>{e.text}</Text>
            {e.fixed && <Text style={[ui.body, { color: colors.accent }]}>{e.fixed}</Text>}
            <Text style={ui.mute}>
              {e.deviceName} · {new Date(e.when).toLocaleString()}
              {e.unsent ? ' · not sent yet' : ''}
              {e.skipped ? ' · skipped' : ''}
              {e.undone ? ` · ${e.undone}` : ''}
            </Text>
            <View style={styles.buttons}>
              {e.canUndo && (
                <Pressable style={styles.button} onPress={() => undo(e)}>
                  <Text style={{ color: colors.accent }}>{e.undone ? 'Bring back' : 'Undo'}</Text>
                </Pressable>
              )}
              {e.amount !== null && !e.undone && (
                <Pressable
                  style={styles.button}
                  onPress={() => router.push({ pathname: '/fix/[id]', params: { id: e.id } })}
                >
                  <Text style={{ color: colors.accent }}>Fix</Text>
                </Pressable>
              )}
              {e.unsent && (
                <Pressable style={styles.button} onPress={() => router.push('/unsent')}>
                  <Text style={{ color: colors.accent }}>Change or drop</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10, gap: 3 },
  struck: { textDecorationLine: 'line-through', color: colors.mute },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
});
