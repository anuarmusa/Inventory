import type { ActionBody } from '@inventory/shared';
import { describeAction } from '../sync/describe';
import { type Inventory, type MismatchRow, onHand } from '../sync/inventory';

/**
 * Needs checking (spec §4.4): what each open Mismatch says, and the fixes it offers. Resolving is
 * itself an Action; resolved Mismatches stay in history.
 */

export type Fix =
  /** Shortfall: count it (a Stocktake), then resolve as "counted". */
  | { kind: 'count'; label: string; supplyId: string }
  /** Leave things as the server applied them. */
  | { kind: 'accept'; label: string }
  /** Skipped Action: record it again against another Supply, then resolve as "redone". */
  | { kind: 'redo'; label: string; body: ActionBody }
  /** Barcode on two Supplies: keep it where it is. */
  | { kind: 'keep'; label: string }
  /** Barcode on two Supplies: move it to the other one. */
  | { kind: 'move_barcode'; label: string; code: string; toSupplyId: string }
  /** Barcode on two Supplies: they're the same thing, Merge them. */
  | { kind: 'merge'; label: string; fromSupplyId: string; intoSupplyId: string };

export interface CheckItem {
  mismatch: MismatchRow;
  text: string;
  fixes: Fix[];
}

const THING_NAMES: Record<string, string> = {
  supply: 'Supply',
  asset: 'Asset',
  location: 'Location',
  category: 'Category',
  batch: 'Batch',
  label: 'Label',
  barcode: 'Barcode',
};

function thingName(inv: Inventory, thing: string, id: string): string {
  switch (thing) {
    case 'supply':
      return inv.supplies[id]?.name ?? 'a Supply';
    case 'asset':
      return inv.assets[id]?.name ?? 'an Asset';
    case 'location':
      return inv.locations[id]?.name ?? 'a Location';
    case 'category':
      return inv.categories[id]?.name ?? 'a Category';
    default:
      return `${THING_NAMES[thing] ?? thing} ${id}`;
  }
}

const REASONS: Record<string, string> = {
  gone: 'was deleted',
  disposed: 'was Disposed',
  retired: 'was replaced',
  not_empty: 'still has things in it',
};

export function checkItem(inv: Inventory, mismatch: MismatchRow): CheckItem {
  const action = inv.actions[mismatch.actionId];
  const who = action ? (inv.devices[action.deviceId]?.name ?? 'A phone') : 'A phone';
  const d = mismatch.details as Record<string, unknown>;
  const what = action ? describeAction({ ...action, deviceTime: action.correctedTime, v: 1 } as never, inv) : 'An Action';

  if (mismatch.kind === 'shortfall') {
    const supplyId = d.supplyId as string;
    const name = inv.supplies[supplyId]?.name ?? 'a Supply';
    const shortfall = Number(d.shortfall);
    const requested = Number(d.requested);
    const text =
      d.reason === 'undo_added'
        ? `An added Batch of ${name} was undone, but ${shortfall} of it had already been used.`
        : `${who}: ${what.charAt(0).toLowerCase()}${what.slice(1)}, but only ${requested - shortfall} ${requested - shortfall === 1 ? 'was' : 'were'} on hand.`;
    return {
      mismatch,
      text,
      fixes: [
        { kind: 'count', label: 'Count it', supplyId },
        { kind: 'accept', label: 'Accept' },
      ],
    };
  }

  if (mismatch.kind === 'skipped_action') {
    const thing = String(d.thing);
    const reason = REASONS[String(d.reason)] ?? 'couldn’t be used';
    const text = `${who}: “${what}” was skipped: ${thingName(inv, thing, String(d.id))} ${reason}.`;
    const fixes: Fix[] = [{ kind: 'accept', label: 'Accept' }];
    // Redo against another Supply, for Actions that name one.
    const payload = action?.payload as { supplyId?: string } | undefined;
    if (action && thing === 'supply' && payload?.supplyId && ['supply.used', 'supply.counted'].includes(action.type)) {
      fixes.push({ kind: 'redo', label: 'Redo it on another Supply', body: { type: action.type, payload: action.payload } as ActionBody });
    }
    return { mismatch, text, fixes };
  }

  // Double assignment.
  if (d.thing === 'barcode') {
    const kept = String(d.keptSupplyId);
    const other = String(d.otherSupplyId);
    const keptName = inv.supplies[kept]?.name ?? 'one Supply';
    const otherName = inv.supplies[other]?.name ?? 'another Supply';
    return {
      mismatch,
      text: `Barcode ${String(d.code)} was given to both ${keptName} and ${otherName}. It stays on ${keptName} for now.`,
      fixes: [
        { kind: 'keep', label: `Keep on ${keptName}` },
        { kind: 'move_barcode', label: `Move to ${otherName}`, code: String(d.code), toSupplyId: other },
        { kind: 'merge', label: 'Merge the two', fromSupplyId: other, intoSupplyId: kept },
      ],
    };
  }
  // A Blank label attached to two things: the first link is kept. Labels can be replaced from the dashboard.
  return {
    mismatch,
    text: `Label ${String(d.code)} was attached to two things. It stays on the first one.`,
    fixes: [{ kind: 'keep', label: 'Keep it there' }],
  };
}

/** Open Mismatches, newest first. */
export function needsChecking(inv: Inventory): CheckItem[] {
  return Object.values(inv.mismatches)
    .filter((m) => !m.resolvedAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => checkItem(inv, m));
}

/** Resolved Mismatches, newest first: they stay in history. */
export function checked(inv: Inventory): (CheckItem & { how: string })[] {
  const HOW: Record<string, string> = {
    accepted: 'Accepted',
    counted: 'Counted',
    redone: 'Redone',
    kept: 'Kept',
    merged: 'Merged',
    undone: 'Resolved by undo',
  };
  return Object.values(inv.mismatches)
    .filter((m) => m.resolvedAt)
    .sort((a, b) => (a.resolvedAt! < b.resolvedAt! ? 1 : -1))
    .map((m) => ({ ...checkItem(inv, m), how: HOW[m.resolution ?? ''] ?? 'Resolved' }));
}

/** The Actions a fix records (except Count it and Redo, which need an answer first). */
export function fixActions(item: CheckItem, fix: Fix): ActionBody[] {
  const resolve = (resolution: 'accepted' | 'counted' | 'redone' | 'kept' | 'merged'): ActionBody => ({
    type: 'mismatch.resolved',
    payload: { mismatchId: item.mismatch.id, resolution },
  });
  switch (fix.kind) {
    case 'accept':
      return [resolve('accepted')];
    case 'keep':
      return [resolve('kept')];
    case 'move_barcode':
      return [{ type: 'barcode.moved', payload: { code: fix.code, toSupplyId: fix.toSupplyId } }, resolve('kept')];
    case 'merge':
      return [mergeBody(fix.fromSupplyId, fix.intoSupplyId), resolve('merged')];
    case 'count':
    case 'redo':
      throw new Error(`${fix.kind} needs an answer first`);
  }
}

export function mergeBody(fromSupplyId: string, intoSupplyId: string): ActionBody {
  return { type: 'supply.merged', payload: { fromSupplyId, intoSupplyId } };
}

/** "Count it": a Stocktake, then the Mismatch resolved as counted. */
export function countActions(supplyId: string, quantity: number, mismatchId?: string): ActionBody[] {
  const count: ActionBody = { type: 'supply.counted', payload: { supplyId, quantity } };
  return mismatchId ? [count, { type: 'mismatch.resolved', payload: { mismatchId, resolution: 'counted' } }] : [count];
}

/** "Redo": the skipped Action again on another Supply, then the Mismatch resolved as redone. */
export function redoActions(item: CheckItem, body: ActionBody, supplyId: string): ActionBody[] {
  return [
    { ...body, payload: { ...body.payload, supplyId } } as ActionBody,
    { type: 'mismatch.resolved', payload: { mismatchId: item.mismatch.id, resolution: 'redone' } },
  ];
}

/** Other live Supplies with the same name: "possible duplicate", fixed with Merge. */
export function possibleDuplicates(inv: Inventory, supplyId: string): { id: string; name: string; onHand: number }[] {
  const supply = inv.supplies[supplyId];
  if (!supply || supply.deletedAt) return [];
  const key = supply.name.trim().toLowerCase();
  return Object.values(inv.supplies)
    .filter((s) => s.id !== supplyId && !s.deletedAt && s.name.trim().toLowerCase() === key)
    .map((s) => ({ id: s.id, name: s.name, onHand: onHand(inv, s.id) }));
}
