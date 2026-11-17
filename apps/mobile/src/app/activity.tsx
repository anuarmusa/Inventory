import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { history } from '@inventory/shared';
import { HistoryList } from '../history/HistoryList';
import { useSession } from '../session/SessionProvider';
import { SyncStatusBar } from '../ui/SyncStatusBar';
import { ui } from '../ui/styles';

/** Recent activity: the household's latest Actions from every phone, with Undo and Fix. */
export default function RecentActivity() {
  const { inventory, unsent } = useSession();
  const entries = useMemo(() => history(inventory, unsent), [inventory, unsent]);
  return (
    <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Recent activity' }} />
      <SyncStatusBar />
      <HistoryList entries={entries} empty="Nothing has happened yet." />
    </ScrollView>
  );
}
