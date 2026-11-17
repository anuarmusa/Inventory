import type { Action, ActionBody } from '../actions.ts';
import { describeAction } from './describe.ts';
import { countedSinceLocally, type Inventory, type LoggedActionRow } from './inventory.ts';

/**
 * History (spec §5): what happened, newest first. History is never edited: an undone Action stays,
 * struck through with "Undone by Kitchen phone, 18 Nov", and a corrected one with "Fixed: 3, not 2".
 * Undo and Correction Actions don't get their own entries; they show on the original.
 */
export interface HistoryEntry {
  id: string;
  type: string;
  /** The Action the Undo / Fix buttons act on: the original, or the Correction that now stands for it. */
  headId: string;
  text: string;
  when: string;
  deviceName: string;
  /** Not sent yet: it can be dropped instead (Unsent changes). */
  unsent: boolean;
  /** "Undone by Kitchen phone, 18 Nov", or null. */
  undone: string | null;
  /** "Fixed: 3, not 2", or null. */
  fixed: string | null;
  skipped: boolean;
  canUndo: boolean;
  /** An amount that can be fixed, or null. */
  amount: number | null;
  /** A Stocktake since: undoing or fixing won't change the amount. */
  countedSince: boolean;
}

/** Action types an Undo can reverse (mirrors the server). */
const UNDOABLE = new Set([
  'supply.used',
  'supply.counted',
  'batch.added',
  'batch.discarded',
  'batch.moved',
  'asset.moved',
  'asset.disposed',
  'supply.deleted',
  'asset.deleted',
  'location.deleted',
  'category.deleted',
  'supply.created',
  'asset.created',
  'barcode.moved',
  'mismatch.resolved',
]);
const AMOUNT_TYPES = new Set(['supply.used', 'supply.counted', 'batch.added', 'batch.discarded']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

type Body = { type: string; payload: Record<string, unknown> };
const amountOf = (b: Body) => (AMOUNT_TYPES.has(b.type) ? (b.payload.quantity as number) : null);
const bodyOf = (a: LoggedActionRow): Body =>
  a.type === 'action.corrected' ? (a.payload.corrected as Body) : { type: a.type, payload: a.payload };

/** Whether an Action is about this thing. */
export type Subject = { supplyId: string } | { assetId: string } | null;

function touches(inv: Inventory, body: Body, subject: Subject): boolean {
  if (!subject) return true;
  const p = body.payload;
  if ('supplyId' in subject) {
    const id = subject.supplyId;
    if (p.supplyId === id || p.fromSupplyId === id || p.intoSupplyId === id || p.toSupplyId === id) return true;
    return typeof p.batchId === 'string' && inv.batches[p.batchId]?.supplyId === id;
  }
  const target = p.target as { assetId?: string } | undefined;
  return p.assetId === subject.assetId || target?.assetId === subject.assetId;
}

export function history(inv: Inventory, unsent: readonly Action[], subject: Subject = null, limit = 50): HistoryEntry[] {
  const deviceName = (id: string) => inv.devices[id]?.name ?? 'Another phone';
  const logged = inv.actions;
  const entries: (HistoryEntry & { order: string })[] = [];

  for (const a of Object.values(logged)) {
    if (a.type === 'action.undone' || a.type === 'action.corrected') continue;
    if (!touches(inv, a, subject)) continue;
    // Follow the chain of Corrections to the one that stands now.
    let head = a;
    let undoneBy: LoggedActionRow | null = null;
    for (let guard = 0; head.reversedByActionId && guard < 50; guard++) {
      const by = logged[head.reversedByActionId];
      if (!by) break;
      if (by.type === 'action.corrected') head = by;
      else {
        undoneBy = by;
        break;
      }
    }
    const current = bodyOf(head);
    const original = amountOf(a);
    const now = amountOf(current);
    entries.push({
      order: a.correctedTime,
      id: a.id,
      type: a.type,
      headId: undoneBy ? undoneBy.id : head.id,
      text: describeAction({ ...a, deviceId: a.deviceId, deviceTime: a.correctedTime, v: 1 } as unknown as Action, inv),
      when: a.correctedTime,
      deviceName: deviceName(a.deviceId),
      unsent: false,
      undone: undoneBy ? `Undone by ${deviceName(undoneBy.deviceId)}, ${shortDate(undoneBy.correctedTime)}` : null,
      fixed:
        !undoneBy && head !== a
          ? now !== null && original !== null
            ? `Fixed: ${now}, not ${original}`
            : `Fixed: ${describeAction({ ...head, ...current } as unknown as Action, inv)}`
          : null,
      skipped: a.outcome === 'skipped',
      // An undone entry can be brought back by undoing its Undo.
      canUndo: a.outcome === 'applied' && (Boolean(undoneBy) || UNDOABLE.has(a.type)),
      amount: undoneBy || a.outcome !== 'applied' ? null : now,
      countedSince: countedSinceLocally(inv, head, current),
    });
  }

  for (const a of unsent) {
    if (a.type === 'action.undone' || a.type === 'action.corrected') continue;
    if (!touches(inv, a as Body, subject)) continue;
    entries.push({
      order: new Date(a.deviceTime).toISOString(),
      id: a.id,
      type: a.type,
      headId: a.id,
      text: describeAction(a, inv),
      when: a.deviceTime,
      deviceName: 'This phone',
      unsent: true,
      undone: null,
      fixed: null,
      skipped: false,
      canUndo: false,
      amount: null,
      countedSince: false,
    });
  }

  return entries
    .sort((x, y) => (x.order < y.order ? 1 : x.order > y.order ? -1 : 0))
    .slice(0, limit)
    .map(({ order: _order, ...e }) => e);
}

/** The Undo Action for an entry: undoes the Action that stands now (or the Undo, to bring it back). */
export function undoBody(entry: HistoryEntry): ActionBody {
  return { type: 'action.undone', payload: { targetActionId: entry.headId } };
}

/** The Correction for an entry: the same Action with the right amount. */
export function fixBody(inv: Inventory, entry: HistoryEntry, amount: number): ActionBody {
  const head = inv.actions[entry.headId]!;
  const current = bodyOf(head);
  return {
    type: 'action.corrected',
    payload: { targetActionId: head.id, corrected: { ...current, payload: { ...current.payload, quantity: amount } } },
  } as ActionBody;
}
