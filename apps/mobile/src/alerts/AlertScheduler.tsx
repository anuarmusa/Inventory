import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { localToday } from '../home/lists';
import { KEYS } from '../session/session';
import { useSession } from '../session/SessionProvider';
import { phoneStore } from '../session/store';
import { type AlertState, attention, emptyAlertState, planAlert } from './alerts';

const SUMMARY_ID = 'daily-summary';
/** Wait for a burst of changes (a sync, a basket) to settle before planning. */
const SETTLE_MS = 3_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function readState(): Promise<AlertState> {
  try {
    const raw = await phoneStore.get(KEYS.alertState);
    return raw ? (JSON.parse(raw) as AlertState) : emptyAlertState();
  } catch {
    return emptyAlertState();
  }
}

/**
 * Keeps the next 09:00 summary up to date with what this phone knows. Renders nothing. Asks for the
 * notification permission once, when there is first something to tell.
 */
export function AlertScheduler() {
  const { session, inventory } = useSession();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (session?.status !== 'ready') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        const { state, summary } = planAlert(await readState(), attention(inventory, localToday()), new Date());
        await Notifications.cancelScheduledNotificationAsync(SUMMARY_ID).catch(() => undefined);
        if (summary) {
          const permission = await Notifications.getPermissionsAsync();
          const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
          if (granted) {
            await Notifications.scheduleNotificationAsync({
              identifier: SUMMARY_ID,
              content: { title: summary.title, body: summary.body },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: summary.fireAt },
            });
          }
        }
        await phoneStore.set(KEYS.alertState, JSON.stringify(state));
      })().catch(() => undefined);
    }, SETTLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [session?.status, inventory]);

  return null;
}
