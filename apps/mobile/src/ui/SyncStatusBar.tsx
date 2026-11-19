import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { statusLine, type Tone } from '../sync/describe';
import type { IconName } from './kit';
import { colors } from './styles';

const tones: Record<Tone, { backgroundColor: string; color: string; icon: IconName }> = {
  ok: { backgroundColor: colors.accentSoft, color: colors.accent, icon: 'cloud-done-outline' },
  away: { backgroundColor: colors.amberSoft, color: colors.amber, icon: 'cloud-offline-outline' },
  problem: { backgroundColor: colors.badSoft, color: colors.bad, icon: 'warning-outline' },
};

/** Home and synced, or away with the unsent count. Tapping it opens the Unsent changes. */
export function SyncStatusBar() {
  const { syncState, unsent } = useSession();
  const { text, tone } = statusLine(syncState, unsent.length);
  const { backgroundColor, color, icon } = tones[tone];
  return (
    <Pressable
      style={[styles.bar, { backgroundColor }]}
      onPress={() => router.push('/unsent')}
      accessibilityRole="button"
      accessibilityHint="Shows changes not yet sent to the home server"
    >
      <Ionicons name={syncState.syncing ? 'sync' : icon} size={16} color={color} />
      <Text style={[styles.text, { color }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  text: { fontSize: 14, fontWeight: '700' },
});
