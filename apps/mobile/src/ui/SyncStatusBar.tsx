import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { statusLine, type Tone } from '../sync/describe';
import { colors } from './styles';

const tones: Record<Tone, { backgroundColor: string; color: string }> = {
  ok: { backgroundColor: colors.accentSoft, color: colors.accent },
  away: { backgroundColor: colors.warnSoft, color: colors.warn },
  problem: { backgroundColor: colors.badSoft, color: colors.bad },
};

/** Home and synced, or away with the unsent count. Tapping it opens the Unsent changes. */
export function SyncStatusBar() {
  const { syncState, unsent } = useSession();
  const { text, tone } = statusLine(syncState, unsent.length);
  const { backgroundColor, color } = tones[tone];
  return (
    <Pressable
      style={[styles.bar, { backgroundColor }]}
      onPress={() => router.push('/unsent')}
      accessibilityRole="button"
      accessibilityHint="Shows changes not yet sent to the home server"
    >
      <Text style={[styles.text, { color }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  text: { fontSize: 15, fontWeight: '600' },
});
