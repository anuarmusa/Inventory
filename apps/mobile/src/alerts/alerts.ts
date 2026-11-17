import type { CalendarDate } from '@inventory/shared';
import { expiresWhen, lowStock, nearExpiry } from '../home/lists';
import type { Inventory } from '../sync/inventory';

/**
 * Alerts (spec §6.5, §13): each phone works out Low stock and Near expiry from its own data with
 * the shared rules, without the server, and summarises what's new in one notification a day at 09:00.
 * No notification when there's nothing new.
 *
 * A background task can't be relied on to run at 09:00, so the phone plans ahead: whenever its data
 * changes it schedules the next 09:00 summary of what's new (or cancels it). What a summary
 * mentioned counts as told once that 09:00 has passed. Something that stops being Low stock or Near
 * expiry is forgotten, so it's new again if it comes back.
 */

export interface AttentionItem {
  /** `low:<supplyId>` or `near:<batchId>`. */
  key: string;
  text: string;
  kind: 'low' | 'near';
}

export function attention(inv: Inventory, today: CalendarDate): AttentionItem[] {
  return [
    ...lowStock(inv).map(({ supply, onHand }) => ({ key: `low:${supply.id}`, kind: 'low' as const, text: `${supply.name} (${onHand} left)` })),
    ...nearExpiry(inv, today).map(({ batch, supply, daysLeft }) => ({
      key: `near:${batch.id}`,
      kind: 'near' as const,
      text: `${supply.name} (${expiresWhen(daysLeft)})`,
    })),
  ];
}

export interface AlertState {
  /** Keys a summary has already told about (while they stay Low stock / Near expiry). */
  told: string[];
  /** The summary scheduled for `fireAt` (ISO), and the keys it mentions. */
  scheduled: { fireAt: string; keys: string[] } | null;
}

export const emptyAlertState = (): AlertState => ({ told: [], scheduled: null });

export interface Summary {
  fireAt: Date;
  title: string;
  body: string;
}

/** The next 09:00 on the phone's clock, strictly after `now`. */
export function nextNineAm(now: Date): Date {
  const at = new Date(now);
  at.setHours(9, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at;
}

const list = (items: AttentionItem[]) => {
  const shown = items.slice(0, 4).map((i) => i.text);
  return items.length > 4 ? `${shown.join(', ')} and ${items.length - 4} more` : shown.join(', ');
};

/** Works out the next summary from what needs attention now. */
export function planAlert(state: AlertState, items: AttentionItem[], now: Date): { state: AlertState; summary: Summary | null } {
  const current = new Set(items.map((i) => i.key));
  // A summary whose 09:00 has passed has told its keys.
  const fired = state.scheduled && new Date(state.scheduled.fireAt) <= now ? state.scheduled.keys : [];
  const told = [...new Set([...state.told, ...fired])].filter((k) => current.has(k));

  const fresh = items.filter((i) => !told.includes(i.key));
  if (fresh.length === 0) return { state: { told, scheduled: null }, summary: null };

  const low = fresh.filter((i) => i.kind === 'low');
  const near = fresh.filter((i) => i.kind === 'near');
  const fireAt = nextNineAm(now);
  const title = [low.length && `${low.length} Low stock`, near.length && `${near.length} Near expiry`].filter(Boolean).join(', ');
  const body = [low.length && `Low stock: ${list(low)}.`, near.length && `Near expiry: ${list(near)}.`].filter(Boolean).join(' ');
  return {
    state: { told, scheduled: { fireAt: fireAt.toISOString(), keys: fresh.map((i) => i.key) } },
    summary: { fireAt, title, body },
  };
}
