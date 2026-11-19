import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type CheckItem, checked, type Fix, fixActions, needsChecking } from '@inventory/shared';
import { useSession } from '../session/SessionProvider';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { colors, ui } from '../ui/styles';

/** Needs checking: open Mismatches with their fixes, then the ones already checked. */
export default function Checking() {
  const { inventory, record } = useSession();
  const open = useMemo(() => needsChecking(inventory), [inventory]);
  const done = useMemo(() => checked(inventory).slice(0, 20), [inventory]);
  const [busy, setBusy] = useState(false);

  const apply = async (item: CheckItem, fix: Fix) => {
    switch (fix.kind) {
      case 'count':
        return router.push({ pathname: '/count/[supplyId]', params: { supplyId: fix.supplyId, mismatch: item.mismatch.id } });
      case 'redo':
        return router.push({ pathname: '/redo/[mismatchId]', params: { mismatchId: item.mismatch.id } });
      case 'merge':
        return router.push({ pathname: '/merge', params: { from: fix.fromSupplyId, into: fix.intoSupplyId, mismatch: item.mismatch.id } });
      default:
        setBusy(true);
        try {
          for (const body of fixActions(item, fix)) await record(body);
        } finally {
          setBusy(false);
        }
    }
  };

  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Needs checking' }} />
      <SyncStatusBar />
      {open.length === 0 && <Text style={ui.mute}>Nothing needs checking.</Text>}
      {open.map((item) => (
        <View key={item.mismatch.id} style={[ui.error, { gap: 8 }]}>
          <Text style={ui.errorText}>{item.text}</Text>
          <View style={styles.fixes}>
            {item.fixes.map((fix) => (
              <Pressable key={fix.label} style={styles.fix} disabled={busy} onPress={() => void apply(item, fix)}>
                <Text style={{ color: colors.ink }}>{fix.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {done.length > 0 && (
        <>
          <Text style={styles.heading}>Checked</Text>
          {done.map((item) => (
            <View key={item.mismatch.id} style={styles.done}>
              <Text style={[ui.body, { color: colors.mute }]}>{item.text}</Text>
              <Text style={ui.mute}>{item.how}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fixes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fix: { backgroundColor: '#fff', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line },
  heading: { fontSize: 13, color: colors.mute, textTransform: 'uppercase', marginTop: 12 },
  done: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8 },
});
