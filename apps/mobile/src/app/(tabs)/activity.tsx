import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { history } from '@inventory/shared';
import { HistoryList } from '../../history/HistoryList';
import { useSession } from '../../session/SessionProvider';
import { SyncStatusBar } from '../../ui/SyncStatusBar';
import { ui } from '../../ui/styles';

/** Recent activity: the household's latest Actions from every phone, with Undo and Fix. */
export default function RecentActivity() {
  const { inventory, unsent } = useSession();
  const entries = useMemo(() => history(inventory, unsent), [inventory, unsent]);
  return (
    <ScrollView style={{ backgroundColor: '#f3f6fa' }} contentContainerStyle={[ui.screen, { paddingTop: 16 }]}>
      <SyncStatusBar />
      <HistoryList entries={entries} empty="Nothing has happened yet." />
    </ScrollView>
  );
}
