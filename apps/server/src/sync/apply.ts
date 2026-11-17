import { and, eq, gt, max, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { type Action, type Taken, takeOldestFirst } from '@inventory/shared';
import type { Tx } from '../db/client.ts';
import {
  actions,
  assets,
  barcodes,
  batches,
  categories,
  labels,
  locations,
  maintenanceEntries,
  mismatches,
  supplies,
} from '../db/schema.ts';

/**
 * Applies one Action to the server's copy of the inventory (spec §4.3, §4.4).
 * The server is the source of truth: it never refuses an Action here. When an Action can't be
 * applied as recorded, it is applied as far as possible (or skipped) and a Mismatch is raised.
 */

export type MismatchKind = 'shortfall' | 'skipped_action' | 'double_assignment';

export interface Outcome {
  outcome: 'applied' | 'skipped';
  /** What applying did, e.g. which Batches a "used" took from; kept on the Action log for Undo. */
  result: Record<string, unknown> | null;
  mismatch?: { kind: MismatchKind; details: Record<string, unknown> };
}

export interface ApplyContext {
  /** This Action's server sequence number; stamped on every row it changes. */
  seq: number;
  /** The Device's time for the Action, corrected by the Device's clock offset. */
  correctedTime: Date;
}

type Thing = 'category' | 'location' | 'supply' | 'asset' | 'batch' | 'label' | 'barcode';

const applied = (result: Record<string, unknown> | null = null): Outcome => ({ outcome: 'applied', result });
const skippedQuietly = (reason: string): Outcome => ({ outcome: 'skipped', result: { reason } });

/** An Action on something deleted, Disposed, retired or unknown: skipped, with a Mismatch. */
function skipped(reason: 'gone' | 'disposed' | 'retired' | 'not_empty', thing: Thing, id: string): Outcome {
  const details = { reason, thing, id };
  return { outcome: 'skipped', result: details, mismatch: { kind: 'skipped_action', details } };
}

async function getCategory(tx: Tx, id: string) {
  const [row] = await tx.select().from(categories).where(eq(categories.id, id));
  return row;
}
async function getLocation(tx: Tx, id: string) {
  const [row] = await tx.select().from(locations).where(eq(locations.id, id));
  return row;
}
async function getSupply(tx: Tx, id: string) {
  const [row] = await tx.select().from(supplies).where(eq(supplies.id, id));
  return row;
}
async function getAsset(tx: Tx, id: string) {
  const [row] = await tx.select().from(assets).where(eq(assets.id, id));
  return row;
}
async function getBatch(tx: Tx, id: string) {
  const [row] = await tx.select().from(batches).where(eq(batches.id, id));
  return row;
}
async function getLabel(tx: Tx, code: string) {
  const [row] = await tx.select().from(labels).where(eq(labels.code, code));
  return row;
}

/** Checks that every referenced thing exists and isn't deleted; returns the skip Outcome for the first that isn't. */
async function checkRefs(
  tx: Tx,
  refs: { category?: string | null; location?: string | null; supply?: string | null; asset?: string | null },
): Promise<Outcome | null> {
  if (refs.category) {
    const row = await getCategory(tx, refs.category);
    if (!row || row.deletedAt) return skipped('gone', 'category', refs.category);
  }
  if (refs.location) {
    const row = await getLocation(tx, refs.location);
    if (!row || row.deletedAt) return skipped('gone', 'location', refs.location);
  }
  if (refs.supply) {
    const row = await getSupply(tx, refs.supply);
    if (!row || row.deletedAt) return skipped('gone', 'supply', refs.supply);
  }
  if (refs.asset) {
    const row = await getAsset(tx, refs.asset);
    if (!row || row.deletedAt) return skipped('gone', 'asset', refs.asset);
    if (row.disposedAt) return skipped('disposed', 'asset', refs.asset);
  }
  return null;
}

async function liveBatchesOf(tx: Tx, supplyId: string) {
  const rows = await tx
    .select()
    .from(batches)
    .where(and(eq(batches.supplyId, supplyId), gt(batches.quantity, 0)));
  return rows.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }));
}

/** Takes from the oldest Batches first and writes the new quantities. */
async function takeFromBatches(tx: Tx, supplyId: string, quantity: number, seq: number) {
  const live = await liveBatchesOf(tx, supplyId);
  const { taken, shortfall } = takeOldestFirst(live, quantity);
  for (const t of taken) {
    await tx
      .update(batches)
      .set({ quantity: sql`${batches.quantity} - ${t.quantity}`, changedSeq: seq })
      .where(eq(batches.id, t.batchId));
  }
  return { taken, shortfall, onHandBefore: live.reduce((n, b) => n + b.quantity, 0) };
}

/** When the Supply was last counted (a Stocktake that was applied), in corrected Device time. */
async function latestStocktake(tx: Tx, supplyId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ at: max(actions.correctedTime) })
    .from(actions)
    .where(
      and(
        eq(actions.type, 'supply.counted'),
        eq(actions.outcome, 'applied'),
        sql`${actions.payload}->>'supplyId' = ${supplyId}`,
      ),
    );
  return row?.at ?? null;
}

export async function applyAction(tx: Tx, action: Action, { seq, correctedTime }: ApplyContext): Promise<Outcome> {
  switch (action.type) {
    // ---- Categories and Locations ----
    case 'category.created': {
      const { categoryId, name } = action.payload;
      await tx.insert(categories).values({ id: categoryId, name, changedSeq: seq }).onConflictDoNothing();
      return applied();
    }
    case 'category.renamed': {
      const { categoryId, name } = action.payload;
      const gone = await checkRefs(tx, { category: categoryId });
      if (gone) return gone;
      await tx.update(categories).set({ name, changedSeq: seq }).where(eq(categories.id, categoryId));
      return applied();
    }
    case 'category.deleted': {
      const { categoryId } = action.payload;
      const gone = await checkRefs(tx, { category: categoryId });
      if (gone) return gone;
      const [inUse] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(supplies)
        .where(and(eq(supplies.categoryId, categoryId), sql`${supplies.deletedAt} IS NULL`));
      const [assetUse] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(eq(assets.categoryId, categoryId), sql`${assets.deletedAt} IS NULL`));
      if ((inUse?.n ?? 0) + (assetUse?.n ?? 0) > 0) return skipped('not_empty', 'category', categoryId);
      await tx.update(categories).set({ deletedAt: new Date(), changedSeq: seq }).where(eq(categories.id, categoryId));
      return applied();
    }
    case 'location.created': {
      const { locationId, name } = action.payload;
      await tx.insert(locations).values({ id: locationId, name, changedSeq: seq }).onConflictDoNothing();
      return applied();
    }
    case 'location.renamed': {
      const { locationId, name } = action.payload;
      const gone = await checkRefs(tx, { location: locationId });
      if (gone) return gone;
      await tx.update(locations).set({ name, changedSeq: seq }).where(eq(locations.id, locationId));
      return applied();
    }
    case 'location.deleted': {
      const { locationId } = action.payload;
      const gone = await checkRefs(tx, { location: locationId });
      if (gone) return gone;
      const [stock] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(batches)
        .where(and(eq(batches.locationId, locationId), gt(batches.quantity, 0)));
      const [kept] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(eq(assets.locationId, locationId), sql`${assets.deletedAt} IS NULL`, sql`${assets.disposedAt} IS NULL`));
      if ((stock?.n ?? 0) + (kept?.n ?? 0) > 0) return skipped('not_empty', 'location', locationId);
      await tx.update(locations).set({ deletedAt: new Date(), changedSeq: seq }).where(eq(locations.id, locationId));
      return applied();
    }

    // ---- Supplies ----
    case 'supply.created': {
      const { supplyId, ...fields } = action.payload;
      const gone = await checkRefs(tx, { category: fields.categoryId, location: fields.usualLocationId });
      if (gone) return gone;
      await tx.insert(supplies).values({ id: supplyId, ...fields, changedSeq: seq }).onConflictDoNothing();
      return applied();
    }
    case 'supply.edited': {
      // Detail edits are last-writer-wins by arrival.
      const { supplyId, changes } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId, category: changes.categoryId, location: changes.usualLocationId });
      if (gone) return gone;
      await tx.update(supplies).set({ ...changes, updatedAt: new Date(), changedSeq: seq }).where(eq(supplies.id, supplyId));
      return applied();
    }
    case 'supply.deleted': {
      const { supplyId } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId });
      if (gone) return gone;
      await tx.update(supplies).set({ deletedAt: new Date(), changedSeq: seq }).where(eq(supplies.id, supplyId));
      return applied();
    }
    case 'supply.used': {
      const { supplyId, quantity } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId });
      if (gone) return gone;
      // A "used" taken before the latest Stocktake is already reflected in that count.
      const countedAt = await latestStocktake(tx, supplyId);
      if (countedAt && correctedTime < countedAt) {
        return skippedQuietly('before_stocktake');
      }
      const { taken, shortfall } = await takeFromBatches(tx, supplyId, quantity, seq);
      const result = { taken, shortfall };
      if (shortfall > 0) {
        return { outcome: 'applied', result, mismatch: { kind: 'shortfall', details: { supplyId, requested: quantity, shortfall } } };
      }
      return applied(result);
    }
    case 'supply.counted': {
      const { supplyId, quantity } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId });
      if (gone) return gone;
      const live = await liveBatchesOf(tx, supplyId);
      const onHand = live.reduce((n, b) => n + b.quantity, 0);
      if (quantity < onHand) {
        const { taken } = await takeFromBatches(tx, supplyId, onHand - quantity, seq);
        return applied({ previous: onHand, taken });
      }
      if (quantity > onHand) {
        const supply = (await getSupply(tx, supplyId))!;
        const addedBatchId = randomUUID();
        await tx.insert(batches).values({
          id: addedBatchId,
          supplyId,
          quantity: quantity - onHand,
          expiry: null,
          locationId: supply.usualLocationId,
          changedSeq: seq,
        });
        return applied({ previous: onHand, addedBatchId });
      }
      return applied({ previous: onHand });
    }
    case 'supply.merged': {
      const { fromSupplyId, intoSupplyId } = action.payload;
      if (fromSupplyId === intoSupplyId) return skippedQuietly('same_supply');
      const gone = (await checkRefs(tx, { supply: fromSupplyId })) ?? (await checkRefs(tx, { supply: intoSupplyId }));
      if (gone) return gone;
      const movedBatches = await tx
        .update(batches)
        .set({ supplyId: intoSupplyId, changedSeq: seq })
        .where(eq(batches.supplyId, fromSupplyId))
        .returning({ id: batches.id });
      const movedBarcodes = await tx
        .update(barcodes)
        .set({ supplyId: intoSupplyId, changedSeq: seq })
        .where(eq(barcodes.supplyId, fromSupplyId))
        .returning({ code: barcodes.code });
      await tx.update(supplies).set({ deletedAt: new Date(), changedSeq: seq }).where(eq(supplies.id, fromSupplyId));
      return applied({ batchIds: movedBatches.map((b) => b.id), barcodes: movedBarcodes.map((b) => b.code) });
    }

    // ---- Barcodes ----
    case 'barcode.attached': {
      const { code, supplyId, ...details } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId });
      if (gone) return gone;
      const [existing] = await tx.select().from(barcodes).where(eq(barcodes.code, code));
      if (existing && existing.supplyId !== supplyId) {
        // One Barcode, two Supplies: the first link is kept.
        return {
          outcome: 'skipped',
          result: { reason: 'barcode_taken', keptSupplyId: existing.supplyId },
          mismatch: { kind: 'double_assignment', details: { thing: 'barcode', code, keptSupplyId: existing.supplyId, otherSupplyId: supplyId } },
        };
      }
      await tx
        .insert(barcodes)
        .values({ code, supplyId, ...details, changedSeq: seq })
        .onConflictDoUpdate({ target: barcodes.code, set: { ...details, changedSeq: seq } });
      return applied();
    }
    case 'barcode.moved': {
      const { code, toSupplyId } = action.payload;
      const [existing] = await tx.select().from(barcodes).where(eq(barcodes.code, code));
      if (!existing) return skipped('gone', 'barcode', code);
      const gone = await checkRefs(tx, { supply: toSupplyId });
      if (gone) return gone;
      await tx.update(barcodes).set({ supplyId: toSupplyId, changedSeq: seq }).where(eq(barcodes.code, code));
      return applied({ fromSupplyId: existing.supplyId });
    }

    // ---- Batches ----
    case 'batch.added': {
      const { batchId, supplyId, quantity, expiry, locationId } = action.payload;
      const gone = await checkRefs(tx, { supply: supplyId, location: locationId });
      if (gone) return gone;
      await tx
        .insert(batches)
        .values({ id: batchId, supplyId, quantity, expiry, locationId, changedSeq: seq })
        .onConflictDoNothing();
      return applied();
    }
    case 'batch.moved': {
      const { batchId, toLocationId } = action.payload;
      const batch = await getBatch(tx, batchId);
      if (!batch) return skipped('gone', 'batch', batchId);
      const gone = await checkRefs(tx, { supply: batch.supplyId, location: toLocationId });
      if (gone) return gone;
      await tx.update(batches).set({ locationId: toLocationId, changedSeq: seq }).where(eq(batches.id, batchId));
      return applied({ fromLocationId: batch.locationId });
    }
    case 'batch.discarded': {
      const { batchId, quantity } = action.payload;
      const batch = await getBatch(tx, batchId);
      if (!batch) return skipped('gone', 'batch', batchId);
      const gone = await checkRefs(tx, { supply: batch.supplyId });
      if (gone) return gone;
      const n = Math.min(batch.quantity, quantity);
      await tx
        .update(batches)
        .set({ quantity: batch.quantity - n, changedSeq: seq })
        .where(eq(batches.id, batchId));
      const taken: Taken[] = n > 0 ? [{ batchId, quantity: n }] : [];
      const shortfall = quantity - n;
      if (shortfall > 0) {
        return {
          outcome: 'applied',
          result: { taken, shortfall },
          mismatch: { kind: 'shortfall', details: { supplyId: batch.supplyId, batchId, requested: quantity, shortfall } },
        };
      }
      return applied({ taken, shortfall: 0 });
    }

    // ---- Assets ----
    case 'asset.created': {
      const { assetId, ...fields } = action.payload;
      const gone = await checkRefs(tx, { category: fields.categoryId, location: fields.locationId });
      if (gone) return gone;
      await tx.insert(assets).values({ id: assetId, ...fields, changedSeq: seq }).onConflictDoNothing();
      return applied();
    }
    case 'asset.edited': {
      const { assetId, changes } = action.payload;
      const gone = await checkRefs(tx, { asset: assetId, category: changes.categoryId, location: changes.locationId });
      if (gone) return gone;
      await tx.update(assets).set({ ...changes, updatedAt: new Date(), changedSeq: seq }).where(eq(assets.id, assetId));
      return applied();
    }
    case 'asset.deleted': {
      const { assetId } = action.payload;
      const row = await getAsset(tx, assetId);
      if (!row || row.deletedAt) return skipped('gone', 'asset', assetId);
      await tx.update(assets).set({ deletedAt: new Date(), changedSeq: seq }).where(eq(assets.id, assetId));
      return applied();
    }
    case 'asset.moved': {
      const { assetId, toLocationId } = action.payload;
      const gone = await checkRefs(tx, { asset: assetId, location: toLocationId });
      if (gone) return gone;
      const before = (await getAsset(tx, assetId))!;
      await tx.update(assets).set({ locationId: toLocationId, changedSeq: seq }).where(eq(assets.id, assetId));
      return applied({ fromLocationId: before.locationId });
    }
    case 'asset.disposed': {
      const { assetId, date, reason } = action.payload;
      const gone = await checkRefs(tx, { asset: assetId });
      if (gone) return gone;
      await tx.update(assets).set({ disposedAt: date, disposedReason: reason, changedSeq: seq }).where(eq(assets.id, assetId));
      return applied();
    }
    case 'maintenance.added': {
      const { entryId, assetId, date, note, costSen } = action.payload;
      const gone = await checkRefs(tx, { asset: assetId });
      if (gone) return gone;
      await tx
        .insert(maintenanceEntries)
        .values({ id: entryId, assetId, date, note, costSen, changedSeq: seq })
        .onConflictDoNothing();
      return applied();
    }

    // ---- Labels ----
    case 'label.attached': {
      const { code, target } = action.payload;
      const refs = target.kind === 'asset' ? { asset: target.assetId } : { location: target.locationId };
      const gone = await checkRefs(tx, refs);
      if (gone) return gone;
      const assetId = target.kind === 'asset' ? target.assetId : null;
      const locationId = target.kind === 'location' ? target.locationId : null;
      const label = await getLabel(tx, code);
      if (label?.retiredAt) return skipped('retired', 'label', code);
      const linked = label && (label.assetId ?? label.locationId);
      if (linked && (label.assetId !== assetId || label.locationId !== locationId)) {
        // One Blank label attached to two things: the first link is kept.
        return {
          outcome: 'skipped',
          result: { reason: 'label_taken' },
          mismatch: {
            kind: 'double_assignment',
            details: { thing: 'label', code, kept: { assetId: label.assetId, locationId: label.locationId }, other: target },
          },
        };
      }
      await tx
        .insert(labels)
        .values({ code, assetId, locationId, changedSeq: seq })
        .onConflictDoUpdate({ target: labels.code, set: { assetId, locationId, changedSeq: seq } });
      return applied();
    }
    case 'label.replaced': {
      const { oldCode, newCode } = action.payload;
      const old = await getLabel(tx, oldCode);
      if (!old) return skipped('gone', 'label', oldCode);
      if (old.retiredAt) return skipped('retired', 'label', oldCode);
      const replacement = await getLabel(tx, newCode);
      if (replacement?.retiredAt) return skipped('retired', 'label', newCode);
      if (replacement && (replacement.assetId ?? replacement.locationId)) {
        return {
          outcome: 'skipped',
          result: { reason: 'label_taken' },
          mismatch: { kind: 'double_assignment', details: { thing: 'label', code: newCode } },
        };
      }
      await tx
        .insert(labels)
        .values({ code: newCode, assetId: old.assetId, locationId: old.locationId, changedSeq: seq })
        .onConflictDoUpdate({ target: labels.code, set: { assetId: old.assetId, locationId: old.locationId, changedSeq: seq } });
      await tx.update(labels).set({ retiredAt: new Date(), changedSeq: seq }).where(eq(labels.code, oldCode));
      return applied();
    }
    case 'label.retired': {
      const { code } = action.payload;
      const label = await getLabel(tx, code);
      if (!label) return skipped('gone', 'label', code);
      if (label.retiredAt) return skippedQuietly('already_retired');
      await tx.update(labels).set({ retiredAt: new Date(), changedSeq: seq }).where(eq(labels.code, code));
      return applied();
    }

    // ---- Mismatches ----
    case 'mismatch.resolved': {
      const { mismatchId, resolution } = action.payload;
      const [row] = await tx.select().from(mismatches).where(eq(mismatches.id, mismatchId));
      if (!row || row.resolvedAt) return skippedQuietly('already_resolved');
      await tx
        .update(mismatches)
        .set({ resolvedAt: new Date(), resolution, resolvedByActionId: action.id, changedSeq: seq })
        .where(eq(mismatches.id, mismatchId));
      return applied();
    }

    // ---- Undo and Correction ----
    case 'action.undone':
    case 'action.corrected':
      // Applied by "Undo and Correction"; recorded but not yet acted on.
      return skippedQuietly('not_supported_yet');
  }
}
