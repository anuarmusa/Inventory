import type { Action, ActionBody } from '@inventory/shared';
import type { SyncState } from './engine';

export type Tone = 'ok' | 'away' | 'problem';

/** The status bar: home and synced, or away with the unsent count, or why sync is stuck. */
export function statusLine(state: SyncState, unsent: number): { text: string; tone: Tone } {
  const waiting = unsent === 1 ? '1 unsent' : `${unsent} unsent`;
  if (state.problem === 'app_too_old') return { text: `Update needed to sync · ${waiting}`, tone: 'problem' };
  if (state.problem === 'server_too_old') return { text: `The home server is older than this app · ${waiting}`, tone: 'problem' };
  if (state.syncing) return { text: unsent ? `Syncing ${waiting}…` : 'Syncing…', tone: 'ok' };
  if (state.problem === 'failed') return { text: `Sync failed · ${waiting}`, tone: 'problem' };
  if (state.home === null) return { text: unsent ? `Checking… · ${waiting}` : 'Checking…', tone: 'ok' };
  if (!state.home) return { text: unsent ? `Away · ${waiting}` : 'Away · all synced', tone: 'away' };
  return { text: unsent ? `Home · ${waiting}` : 'Home · synced', tone: 'ok' };
}

type QuantityType = 'supply.used' | 'supply.counted' | 'batch.added' | 'batch.discarded';
const QUANTITY_TYPES: readonly string[] = ['supply.used', 'supply.counted', 'batch.added', 'batch.discarded'];

/** The amount an Unsent Action records, when it is one that can be changed by amount. */
export function editableQuantity(action: Action): number | null {
  return QUANTITY_TYPES.includes(action.type) ? (action.payload as { quantity: number }).quantity : null;
}

/** The same Action with a different amount. A Stocktake may be 0; the others at least 1. */
export function withQuantity(action: Action, quantity: number): ActionBody {
  const type = action.type as QuantityType;
  const min = type === 'supply.counted' ? 0 : 1;
  if (!Number.isInteger(quantity) || quantity < min) throw new Error(`The amount must be a whole number, at least ${min}.`);
  return { type, payload: { ...action.payload, quantity } } as ActionBody;
}
