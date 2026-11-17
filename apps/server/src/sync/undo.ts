import { randomUUID } from 'node:crypto';
import { and, eq, isNull, max, ne, sql } from 'drizzle-orm';
import type { Action, PlainActionBody, Taken } from '@inventory/shared';
import type { Tx } from '../db/client.ts';
import { actions, assets, barcodes, batches, categories, locations, mismatches, supplies } from '../db/schema.ts';
import type { ApplyContext, Outcome } from './apply.ts';

/**
 * Undo and Correction (spec §5). History is never edited: an Undo is a new Action naming the
 * original, a Correction names it and carries the right values.
 *
 * Reversing an Action uses what applying it recorded (e.g. which Batches a "used" took from), so it
 * puts back exactly what was taken. Every Undo and Correction stores the `inverse` of what it changed,
 * so undoing an Undo restores the original exactly, and Corrections can chain.
 */

/** One reversible change. A list of them is an Effect, applied in order. */
type Step =
  /** Changes a Batch's quantity. */
  | { kind: 'batch'; batchId: string; delta: number }
  /** Sets columns on one row; the inverse sets their previous values. */
  | { kind: 'row'; table: RowTable; key: string; set: Record<string, unknown> }
  /** Raises a shortfall Mismatch; the inverse closes it. */
  | { kind: 'shortfall'; mismatchId: string; actionId: string; details: Record<string, unknown> };
export type Effect = Step[];

const TABLES = { supplies, assets, locations, categories, batches, barcodes, mismatches } as const;
type RowTable = keyof typeof TABLES;

/** JSON-safe column values: timestamps travel as ISO strings and come back as Dates. */
const TIMESTAMP_COLUMNS = new Set(['deletedAt', 'resolvedAt']);
const toJson = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
const fromJson = (col: string, v: unknown) => (TIMESTAMP_COLUMNS.has(col) && typeof v === 'string' ? new Date(v) : v);

function keyColumn(table: RowTable) {
  return table === 'barcodes' ? barcodes.code : (TABLES[table] as typeof supplies).id;
}

/** Applies an Effect and returns its inverse. */
async function applyEffect(tx: Tx, effect: Effect, seq: number): Promise<Effect> {
  const inverse: Step[] = [];
  for (const step of effect) {
    if (step.kind === 'batch') {
      await tx
        .update(batches)
        .set({ quantity: sql`greatest(${batches.quantity} + ${step.delta}, 0)`, changedSeq: seq })
        .where(eq(batches.id, step.batchId));
      inverse.unshift({ kind: 'batch', batchId: step.batchId, delta: -step.delta });
    } else if (step.kind === 'row') {
      const table = TABLES[step.table];
      const [before] = (await tx.select().from(table).where(eq(keyColumn(step.table), step.key))) as Record<string, unknown>[];
      if (!before) continue;
      const previous = Object.fromEntries(Object.keys(step.set).map((col) => [col, toJson(before[col])]));
      const set = Object.fromEntries(Object.entries(step.set).map(([col, v]) => [col, fromJson(col, v)]));
      await tx
        .update(table)
        .set({ ...set, changedSeq: seq } as never)
        .where(eq(keyColumn(step.table), step.key));
      inverse.unshift({ kind: 'row', table: step.table, key: step.key, set: previous });
    } else {
      await tx
        .insert(mismatches)
        .values({ id: step.mismatchId, kind: 'shortfall', actionId: step.actionId, details: step.details, changedSeq: seq })
        .onConflictDoUpdate({ target: mismatches.id, set: { resolvedAt: null, resolution: null, resolvedByActionId: null, changedSeq: seq } });
      inverse.unshift({
        kind: 'row',
        table: 'mismatches',
        key: step.mismatchId,
        set: { resolvedAt: new Date().toISOString(), resolution: 'undone', resolvedByActionId: null },
      });
    }
  }
  return inverse;
}

type Logged = typeof actions.$inferSelect;

const QUANTITY_TYPES = new Set(['supply.used', 'supply.counted', 'batch.added', 'batch.discarded']);

/** The Supply a quantity Action is about. */
async function supplyOfAction(tx: Tx, a: { type: string; payload: unknown }): Promise<string | null> {
  const p = a.payload as { supplyId?: string; batchId?: string };
  if (p.supplyId) return p.supplyId;
  if (p.batchId) {
    const [b] = await tx.select({ supplyId: batches.supplyId }).from(batches).where(eq(batches.id, p.batchId));
    return b?.supplyId ?? null;
  }
  return null;
}

/** True when the Supply was counted (a Stocktake that still stands) after this Action. */
async function countedSince(tx: Tx, target: Logged, body: { type: string; payload: unknown }): Promise<boolean> {
  if (!QUANTITY_TYPES.has(body.type)) return false;
  const supplyId = await supplyOfAction(tx, body);
  if (!supplyId) return false;
  const [row] = await tx
    .select({ at: max(actions.correctedTime) })
    .from(actions)
    .where(
      and(
        eq(actions.type, 'supply.counted'),
        eq(actions.outcome, 'applied'),
        isNull(actions.reversedByActionId),
        ne(actions.id, target.id),
        sql`${actions.payload}->>'supplyId' = ${supplyId}`,
      ),
    );
  return Boolean(row?.at && row.at > target.correctedTime);
}

/** Removes what's left of a Batch; any part already used becomes a shortfall Mismatch. */
async function removeBatch(tx: Tx, batchId: string, added: number, actionId: string): Promise<Effect> {
  const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId));
  if (!batch) return [];
  const steps: Effect = [{ kind: 'batch', batchId, delta: -batch.quantity }];
  const used = added - batch.quantity;
  if (used > 0) {
    steps.push({
      kind: 'shortfall',
      mismatchId: randomUUID(),
      actionId,
      details: { supplyId: batch.supplyId, batchId, requested: used, shortfall: used, reason: 'undo_added' },
    });
  }
  return steps;
}

const putBack = (taken: Taken[] | undefined): Effect => (taken ?? []).map((t) => ({ kind: 'batch', batchId: t.batchId, delta: t.quantity }));

/**
 * What reverses an applied plain Action, from what applying it recorded. Null when it can't be
 * undone (Merge, or kinds that are fixed by editing again).
 */
async function reversalOf(
  tx: Tx,
  body: { type: string; payload: unknown },
  result: Record<string, unknown> | null,
  undoActionId: string,
): Promise<Effect | null> {
  const p = body.payload as Record<string, string>;
  const r = (result ?? {}) as { taken?: Taken[]; addedBatchId?: string; previous?: number; fromLocationId?: string | null; fromSupplyId?: string };
  switch (body.type) {
    case 'supply.used':
    case 'batch.discarded':
      return putBack(r.taken);
    case 'supply.counted': {
      const steps = putBack(r.taken);
      if (r.addedBatchId) steps.push(...(await removeBatch(tx, r.addedBatchId, Number(p.quantity) - (r.previous ?? 0), undoActionId)));
      return steps;
    }
    case 'batch.added':
      return removeBatch(tx, p.batchId!, Number(p.quantity), undoActionId);
    case 'batch.moved':
      return [{ kind: 'row', table: 'batches', key: p.batchId!, set: { locationId: r.fromLocationId ?? null } }];
    case 'asset.moved':
      return [{ kind: 'row', table: 'assets', key: p.assetId!, set: { locationId: r.fromLocationId ?? null } }];
    case 'barcode.moved':
      return r.fromSupplyId ? [{ kind: 'row', table: 'barcodes', key: p.code!, set: { supplyId: r.fromSupplyId } }] : null;
    case 'asset.disposed':
      return [{ kind: 'row', table: 'assets', key: p.assetId!, set: { disposedAt: null, disposedReason: null } }];
    case 'supply.deleted':
      return [{ kind: 'row', table: 'supplies', key: p.supplyId!, set: { deletedAt: null } }];
    case 'asset.deleted':
      return [{ kind: 'row', table: 'assets', key: p.assetId!, set: { deletedAt: null } }];
    case 'location.deleted':
      return [{ kind: 'row', table: 'locations', key: p.locationId!, set: { deletedAt: null } }];
    case 'category.deleted':
      return [{ kind: 'row', table: 'categories', key: p.categoryId!, set: { deletedAt: null } }];
    case 'supply.created':
      return [{ kind: 'row', table: 'supplies', key: p.supplyId!, set: { deletedAt: new Date().toISOString() } }];
    case 'asset.created':
      return [{ kind: 'row', table: 'assets', key: p.assetId!, set: { deletedAt: new Date().toISOString() } }];
    case 'mismatch.resolved':
      return [{ kind: 'row', table: 'mismatches', key: p.mismatchId!, set: { resolvedAt: null, resolution: null, resolvedByActionId: null } }];
    default:
      // Merge can't be undone; detail edits, Barcodes, Labels and maintenance are fixed by editing again.
      return null;
  }
}

const skippedQuietly = (reason: string): Outcome => ({ outcome: 'skipped', result: { reason } });

async function getLogged(tx: Tx, id: string): Promise<Logged | undefined> {
  const [row] = await tx.select().from(actions).where(eq(actions.id, id));
  return row;
}

/** Marks an Action as reversed by another, and brings back what it had reversed, if anything. */
async function deactivate(tx: Tx, target: Logged, by: string, seq: number) {
  await tx.update(actions).set({ reversedByActionId: by, changedSeq: seq }).where(eq(actions.id, target.id));
  const inner = (target.payload as { targetActionId?: string }).targetActionId;
  if (inner && (target.type === 'action.undone' || target.type === 'action.corrected')) {
    // The Action the reversed Undo/Correction had replaced counts again…
    await tx.update(actions).set({ reversedByActionId: null, changedSeq: seq }).where(eq(actions.id, inner));
    // …and if that one was itself an Undo/Correction, what it reversed is reversed again.
    const innerRow = await getLogged(tx, inner);
    const deeper = (innerRow?.payload as { targetActionId?: string } | undefined)?.targetActionId;
    if (innerRow && deeper && (innerRow.type === 'action.undone' || innerRow.type === 'action.corrected')) {
      await tx.update(actions).set({ reversedByActionId: innerRow.id, changedSeq: seq }).where(eq(actions.id, deeper));
    }
  }
}

/** Closes the open Mismatches an undone Action had raised ("resolved by undo"). */
async function closeMismatchesOf(tx: Tx, actionId: string): Promise<Effect> {
  const open = await tx
    .select({ id: mismatches.id })
    .from(mismatches)
    .where(and(eq(mismatches.actionId, actionId), isNull(mismatches.resolvedAt)));
  return open.map((m) => ({
    kind: 'row' as const,
    table: 'mismatches' as const,
    key: m.id,
    set: { resolvedAt: new Date().toISOString(), resolution: 'undone', resolvedByActionId: null },
  }));
}

/** The reversal of an Action that reached the server: its stored inverse if it is an Undo/Correction. */
async function reversalOfLogged(tx: Tx, target: Logged, undoId: string): Promise<Effect | null> {
  if (target.type === 'action.undone') return ((target.result as { inverse?: Effect } | null)?.inverse ?? []) as Effect;
  if (target.type === 'action.corrected') {
    // Reverse the corrected values (from what applying them recorded), then bring back what was corrected.
    const r = (target.result ?? {}) as { applied?: Record<string, unknown> | null; undoInverse?: Effect };
    const corrected = (target.payload as { corrected: PlainActionBody }).corrected;
    const appliedReversal = r.applied === null ? [] : await reversalOf(tx, corrected, r.applied ?? null, undoId);
    return [...(appliedReversal ?? []), ...(r.undoInverse ?? [])];
  }
  return reversalOf(tx, target, target.result as Record<string, unknown> | null, undoId);
}

export async function applyUndo(tx: Tx, action: Extract<Action, { type: 'action.undone' }>, { seq }: ApplyContext): Promise<Outcome> {
  const target = await getLogged(tx, action.payload.targetActionId);
  if (!target) return skippedQuietly('unknown_action');
  // Two phones undoing the same Action: the first applies, the second is skipped quietly.
  if (target.reversedByActionId) return skippedQuietly('already_undone');
  if (target.outcome === 'skipped') return skippedQuietly('was_skipped');

  const plain = target.type !== 'action.undone' && target.type !== 'action.corrected';
  // A later Stocktake wins: the Undo is recorded, but the amount stays as counted.
  const counted = plain && (await countedSince(tx, target, target));
  const reversal = counted ? [] : await reversalOfLogged(tx, target, action.id);
  if (reversal === null) return skippedQuietly('cannot_undo');

  const effect = [...reversal, ...(await closeMismatchesOf(tx, target.id))];
  const inverse = await applyEffect(tx, effect, seq);
  await deactivate(tx, target, action.id, seq);
  return {
    outcome: 'applied',
    result: { inverse, ...(counted ? { countedSince: true } : {}) },
    raisedMismatch: effect.some((s) => s.kind === 'shortfall'),
  };
}

export async function applyCorrection(
  tx: Tx,
  action: Extract<Action, { type: 'action.corrected' }>,
  ctx: ApplyContext,
  applyBody: (body: PlainActionBody) => Promise<Outcome>,
): Promise<Outcome> {
  const { corrected, targetActionId } = action.payload;
  const target = await getLogged(tx, targetActionId);
  if (!target) return skippedQuietly('unknown_action');
  if (target.reversedByActionId) return skippedQuietly('already_undone');

  // What is being corrected: the original's own values, or the values of the Correction it replaced.
  const current =
    target.type === 'action.corrected'
      ? { body: (target.payload as { corrected: PlainActionBody }).corrected, result: (target.result as { applied?: Record<string, unknown> }).applied ?? null }
      : { body: { type: target.type, payload: target.payload } as PlainActionBody, result: target.result as Record<string, unknown> | null };
  if (current.body.type !== corrected.type) return skippedQuietly('different_type');
  if (target.outcome === 'skipped') return skippedQuietly('was_skipped');

  const counted = await countedSince(tx, target, current.body);
  const reversal = counted ? [] : await reversalOf(tx, current.body, current.result, action.id);
  if (reversal === null) return skippedQuietly('cannot_correct');
  const undoEffect = [...reversal, ...(await closeMismatchesOf(tx, target.id))];
  const undoInverse = await applyEffect(tx, undoEffect, ctx.seq);
  const raisedMismatch = undoEffect.some((s) => s.kind === 'shortfall');
  await tx.update(actions).set({ reversedByActionId: action.id, changedSeq: ctx.seq }).where(eq(actions.id, target.id));

  if (counted) {
    // Counted since: the Correction is recorded, but the amount stays as counted.
    return { outcome: 'applied', result: { undoInverse, applied: null, countedSince: true }, raisedMismatch };
  }
  const applied = await applyBody(corrected);
  return {
    outcome: 'applied',
    result: { undoInverse, applied: applied.result },
    raisedMismatch,
    ...(applied.mismatch ? { mismatch: applied.mismatch } : {}),
  };
}
