import { type Action, takeOldestFirst } from '@inventory/shared';

/**
 * What the phone shows (spec §4.2): the last server state it pulled, with its own Unsent Actions
 * replayed on top. The replay mirrors how the server applies Actions closely enough to show the
 * person what they did; after the next sync the server's result replaces it, even if it differs.
 *
 * Rows have the shape `GET /sync/pull` sends: the server's columns, camelCased, times as ISO strings.
 */

export interface SettingsRow {
  id: number;
  nearExpiryDays: number;
}
export interface CategoryRow {
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
}
export type LocationRow = CategoryRow;
export interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  categoryId: string | null;
  usualLocationId: string | null;
  minimum: number | null;
  restockTo: number | null;
  expires: boolean;
  nearExpiryDays: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface BarcodeRow {
  code: string;
  supplyId: string;
  brand: string | null;
  productName: string | null;
  packSize: string | null;
  photoId: string | null;
  unitsPerScan: number;
  source: 'household' | 'open_food_facts';
  createdAt: string;
}
export interface BatchRow {
  id: string;
  supplyId: string;
  quantity: number;
  expiry: string | null;
  locationId: string | null;
  createdAt: string;
}
export interface AssetRow {
  id: string;
  name: string;
  categoryId: string | null;
  locationId: string | null;
  purchaseDate: string | null;
  priceSen: number | null;
  shop: string | null;
  serialNumber: string | null;
  warrantyEnd: string | null;
  photoIds: string[];
  receiptPhotoId: string | null;
  notes: string | null;
  disposedAt: string | null;
  disposedReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface MaintenanceEntryRow {
  id: string;
  assetId: string;
  date: string;
  note: string;
  costSen: number | null;
  createdAt: string;
}
export interface LabelRow {
  code: string;
  assetId: string | null;
  locationId: string | null;
  retiredAt: string | null;
  createdAt: string;
}
export interface MismatchRow {
  id: string;
  kind: 'shortfall' | 'skipped_action' | 'double_assignment';
  actionId: string;
  details: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByActionId: string | null;
  resolution: string | null;
}
/** An Action from the server's log: the household's history. */
export interface LoggedActionRow {
  seq: number;
  id: string;
  deviceId: string;
  type: string;
  payload: Record<string, unknown>;
  correctedTime: string;
  outcome: 'applied' | 'skipped';
  /** What applying it recorded, e.g. which Batches a "used" took from. */
  result?: Record<string, unknown> | null;
  /** The Undo or Correction that reversed it, while that stands. */
  reversedByActionId?: string | null;
}
/** A paired phone, for "Undone by Kitchen phone". */
export interface DeviceRow {
  id: string;
  name: string;
}

export interface Tables {
  settings: SettingsRow;
  categories: CategoryRow;
  locations: LocationRow;
  supplies: SupplyRow;
  barcodes: BarcodeRow;
  batches: BatchRow;
  assets: AssetRow;
  maintenanceEntries: MaintenanceEntryRow;
  labels: LabelRow;
  mismatches: MismatchRow;
  actions: LoggedActionRow;
  devices: DeviceRow;
}
export type TableName = keyof Tables;

/** Each table's key field. */
export const TABLE_KEYS: { [T in TableName]: keyof Tables[T] } = {
  settings: 'id',
  categories: 'id',
  locations: 'id',
  supplies: 'id',
  barcodes: 'code',
  batches: 'id',
  assets: 'id',
  maintenanceEntries: 'id',
  labels: 'code',
  mismatches: 'id',
  actions: 'id',
  devices: 'id',
};
export const TABLE_NAMES = Object.keys(TABLE_KEYS) as TableName[];

/** The changed rows of one pull, per table. */
export type PulledChanges = { [T in TableName]?: Tables[T][] };

/** Rows of each table by key. */
export type Inventory = { [T in TableName]: Record<string, Tables[T]> };

export function emptyInventory(): Inventory {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, {}])) as unknown as Inventory;
}

export function rowKey<T extends TableName>(table: T, row: Tables[T]): string {
  return String(row[TABLE_KEYS[table]]);
}

/** Builds the server state from stored rows. */
export function inventoryFrom(changes: PulledChanges): Inventory {
  const inv = emptyInventory();
  for (const table of TABLE_NAMES) {
    const into = inv[table] as Record<string, unknown>;
    for (const row of changes[table] ?? []) into[rowKey(table, row as never)] = row;
  }
  return inv;
}

/** The server state with these Unsent Actions replayed on top, in order. Never changes `base`. */
export function replay(base: Inventory, unsent: readonly Action[]): Inventory {
  if (unsent.length === 0) return base;
  // Each table is copied once; rows are replaced, never changed in place.
  const inv = Object.fromEntries(TABLE_NAMES.map((t) => [t, { ...base[t] }])) as unknown as Inventory;
  for (const action of unsent) applyLocally(inv, action);
  return inv;
}

const live = <R extends { deletedAt: string | null }>(row: R | undefined): row is R => Boolean(row && !row.deletedAt);

function onHandBatches(inv: Inventory, supplyId: string): BatchRow[] {
  return Object.values(inv.batches).filter((b) => b.supplyId === supplyId && b.quantity > 0);
}

function take(inv: Inventory, supplyId: string, quantity: number) {
  const { taken } = takeOldestFirst(onHandBatches(inv, supplyId), quantity);
  for (const t of taken) {
    const b = inv.batches[t.batchId]!;
    inv.batches[t.batchId] = { ...b, quantity: b.quantity - t.quantity };
  }
}

/** When the Supply was last counted, among the server's history and Actions replayed so far. */
function lastCountedAt(inv: Inventory, supplyId: string): string | null {
  let latest: string | null = null;
  for (const a of Object.values(inv.actions)) {
    if (a.type === 'supply.counted' && a.outcome === 'applied' && !a.reversedByActionId && a.payload.supplyId === supplyId) {
      if (latest === null || a.correctedTime > latest) latest = a.correctedTime;
    }
  }
  return latest;
}

/**
 * Applies one Action to the local view. Actions the server would skip (on something deleted,
 * Disposed or missing) change nothing here; the server raises the Mismatch when it syncs.
 */
function applyLocally(inv: Inventory, action: Action): void {
  const at = new Date(action.deviceTime).toISOString();
  switch (action.type) {
    case 'category.created':
    case 'location.created': {
      const table = action.type === 'category.created' ? inv.categories : inv.locations;
      const id = 'categoryId' in action.payload ? action.payload.categoryId : action.payload.locationId;
      table[id] ??= { id, name: action.payload.name, createdAt: at, deletedAt: null };
      return;
    }
    case 'category.renamed': {
      const row = inv.categories[action.payload.categoryId];
      if (live(row)) inv.categories[row.id] = { ...row, name: action.payload.name };
      return;
    }
    case 'location.renamed': {
      const row = inv.locations[action.payload.locationId];
      if (live(row)) inv.locations[row.id] = { ...row, name: action.payload.name };
      return;
    }
    case 'category.deleted': {
      const row = inv.categories[action.payload.categoryId];
      const used =
        Object.values(inv.supplies).some((s) => live(s) && s.categoryId === row?.id) ||
        Object.values(inv.assets).some((a) => live(a) && a.categoryId === row?.id);
      if (live(row) && !used) inv.categories[row.id] = { ...row, deletedAt: at };
      return;
    }
    case 'location.deleted': {
      const row = inv.locations[action.payload.locationId];
      const used =
        Object.values(inv.batches).some((b) => b.quantity > 0 && b.locationId === row?.id) ||
        Object.values(inv.assets).some((a) => live(a) && !a.disposedAt && a.locationId === row?.id);
      if (live(row) && !used) inv.locations[row.id] = { ...row, deletedAt: at };
      return;
    }

    case 'supply.created': {
      const { supplyId, ...fields } = action.payload;
      inv.supplies[supplyId] ??= { id: supplyId, ...fields, createdAt: at, updatedAt: at, deletedAt: null };
      return;
    }
    case 'supply.edited': {
      const row = inv.supplies[action.payload.supplyId];
      if (live(row)) inv.supplies[row.id] = { ...row, ...action.payload.changes, updatedAt: at };
      return;
    }
    case 'supply.deleted': {
      const row = inv.supplies[action.payload.supplyId];
      if (live(row)) inv.supplies[row.id] = { ...row, deletedAt: at };
      return;
    }
    case 'supply.used': {
      const { supplyId, quantity } = action.payload;
      if (!live(inv.supplies[supplyId])) return;
      const countedAt = lastCountedAt(inv, supplyId);
      if (countedAt && at < countedAt) return;
      take(inv, supplyId, quantity);
      return;
    }
    case 'supply.counted': {
      const { supplyId, quantity } = action.payload;
      const supply = inv.supplies[supplyId];
      if (!live(supply)) return;
      const onHand = onHandBatches(inv, supplyId).reduce((n, b) => n + b.quantity, 0);
      if (quantity < onHand) take(inv, supplyId, onHand - quantity);
      if (quantity > onHand) {
        const id = `counted:${action.id}`;
        inv.batches[id] = { id, supplyId, quantity: quantity - onHand, expiry: null, locationId: supply.usualLocationId, createdAt: at };
      }
      // Remembered so a later "used" from before this count is skipped, as the server does.
      inv.actions[action.id] = { seq: Number.MAX_SAFE_INTEGER, id: action.id, deviceId: action.deviceId, type: action.type, payload: action.payload, correctedTime: at, outcome: 'applied' };
      return;
    }
    case 'supply.merged': {
      const { fromSupplyId, intoSupplyId } = action.payload;
      const from = inv.supplies[fromSupplyId];
      if (fromSupplyId === intoSupplyId || !live(from) || !live(inv.supplies[intoSupplyId])) return;
      for (const b of Object.values(inv.batches)) if (b.supplyId === fromSupplyId) inv.batches[b.id] = { ...b, supplyId: intoSupplyId };
      for (const c of Object.values(inv.barcodes)) if (c.supplyId === fromSupplyId) inv.barcodes[c.code] = { ...c, supplyId: intoSupplyId };
      inv.supplies[fromSupplyId] = { ...from, deletedAt: at };
      return;
    }

    case 'barcode.attached': {
      const { code, supplyId, ...details } = action.payload;
      const existing = inv.barcodes[code];
      if (!live(inv.supplies[supplyId]) || (existing && existing.supplyId !== supplyId)) return;
      inv.barcodes[code] = { code, supplyId, ...details, createdAt: existing?.createdAt ?? at };
      return;
    }
    case 'barcode.moved': {
      const existing = inv.barcodes[action.payload.code];
      if (existing && live(inv.supplies[action.payload.toSupplyId])) {
        inv.barcodes[existing.code] = { ...existing, supplyId: action.payload.toSupplyId };
      }
      return;
    }

    case 'batch.added': {
      const { batchId, supplyId, quantity, expiry, locationId } = action.payload;
      if (!live(inv.supplies[supplyId]) || !live(inv.locations[locationId])) return;
      inv.batches[batchId] ??= { id: batchId, supplyId, quantity, expiry, locationId, createdAt: at };
      return;
    }
    case 'batch.moved': {
      const batch = inv.batches[action.payload.batchId];
      if (batch && live(inv.supplies[batch.supplyId]) && live(inv.locations[action.payload.toLocationId])) {
        inv.batches[batch.id] = { ...batch, locationId: action.payload.toLocationId };
      }
      return;
    }
    case 'batch.discarded': {
      const batch = inv.batches[action.payload.batchId];
      if (batch && live(inv.supplies[batch.supplyId])) {
        inv.batches[batch.id] = { ...batch, quantity: Math.max(0, batch.quantity - action.payload.quantity) };
      }
      return;
    }

    case 'asset.created': {
      const { assetId, ...fields } = action.payload;
      inv.assets[assetId] ??= { id: assetId, ...fields, disposedAt: null, disposedReason: null, createdAt: at, updatedAt: at, deletedAt: null };
      return;
    }
    case 'asset.edited': {
      const row = inv.assets[action.payload.assetId];
      if (live(row) && !row.disposedAt) inv.assets[row.id] = { ...row, ...action.payload.changes, updatedAt: at };
      return;
    }
    case 'asset.deleted': {
      const row = inv.assets[action.payload.assetId];
      if (live(row)) inv.assets[row.id] = { ...row, deletedAt: at };
      return;
    }
    case 'asset.moved': {
      const row = inv.assets[action.payload.assetId];
      if (live(row) && !row.disposedAt && live(inv.locations[action.payload.toLocationId])) {
        inv.assets[row.id] = { ...row, locationId: action.payload.toLocationId };
      }
      return;
    }
    case 'asset.disposed': {
      const row = inv.assets[action.payload.assetId];
      if (live(row) && !row.disposedAt) {
        inv.assets[row.id] = { ...row, disposedAt: action.payload.date, disposedReason: action.payload.reason };
      }
      return;
    }
    case 'maintenance.added': {
      const { entryId, assetId, date, note, costSen } = action.payload;
      const asset = inv.assets[assetId];
      if (live(asset) && !asset.disposedAt) inv.maintenanceEntries[entryId] ??= { id: entryId, assetId, date, note, costSen, createdAt: at };
      return;
    }

    case 'label.attached': {
      const { code, target } = action.payload;
      const assetId = target.kind === 'asset' ? target.assetId : null;
      const locationId = target.kind === 'location' ? target.locationId : null;
      const asset = assetId ? inv.assets[assetId] : undefined;
      const targetLive = assetId ? live(asset) && !asset.disposedAt : live(inv.locations[locationId!]);
      const label = inv.labels[code];
      if (!targetLive || label?.retiredAt || (label && (label.assetId ?? label.locationId))) return;
      inv.labels[code] = { code, assetId, locationId, retiredAt: null, createdAt: label?.createdAt ?? at };
      return;
    }
    case 'label.replaced': {
      const old = inv.labels[action.payload.oldCode];
      const replacement = inv.labels[action.payload.newCode];
      if (!old || old.retiredAt || replacement?.retiredAt || (replacement && (replacement.assetId ?? replacement.locationId))) return;
      inv.labels[action.payload.newCode] = {
        code: action.payload.newCode,
        assetId: old.assetId,
        locationId: old.locationId,
        retiredAt: null,
        createdAt: replacement?.createdAt ?? at,
      };
      inv.labels[old.code] = { ...old, retiredAt: at };
      return;
    }
    case 'label.retired': {
      const label = inv.labels[action.payload.code];
      if (label && !label.retiredAt) inv.labels[label.code] = { ...label, retiredAt: at };
      return;
    }

    case 'mismatch.resolved': {
      const row = inv.mismatches[action.payload.mismatchId];
      if (row && !row.resolvedAt) {
        inv.mismatches[row.id] = { ...row, resolvedAt: at, resolution: action.payload.resolution, resolvedByActionId: action.id };
      }
      return;
    }

    case 'action.undone':
    case 'action.corrected': {
      // Reverse what the original did, from what the server recorded when it applied it.
      const target = inv.actions[action.payload.targetActionId];
      if (!target || target.reversedByActionId || target.outcome !== 'applied') return;
      const corrected = action.type === 'action.corrected' ? action.payload.corrected : null;
      const current =
        target.type === 'action.corrected'
          ? { ...(target.payload.corrected as { type: string; payload: Record<string, unknown> }), result: (target.result?.applied ?? null) as Result }
          : { type: target.type, payload: target.payload, result: (target.result ?? null) as Result };
      if (target.type === 'action.undone') return; // Undoing an Undo: shown once the server has applied it.
      if (corrected && corrected.type !== current.type) return;
      if (!countedSinceLocally(inv, target, current)) reverseLocally(inv, current, at);
      inv.actions[target.id] = { ...target, reversedByActionId: action.id };
      if (corrected) applyLocally(inv, { ...action, ...corrected } as Action);
      return;
    }
  }
}

type Result = { taken?: { batchId: string; quantity: number }[]; addedBatchId?: string; fromLocationId?: string | null; fromSupplyId?: string } | null;

/** True when the Supply was counted after this Action: undoing it then doesn't change the amount. */
export function countedSinceLocally(inv: Inventory, target: LoggedActionRow, body: { type: string; payload: Record<string, unknown> }): boolean {
  if (!['supply.used', 'supply.counted', 'batch.added', 'batch.discarded'].includes(body.type)) return false;
  const supplyId = (body.payload.supplyId as string | undefined) ?? inv.batches[body.payload.batchId as string]?.supplyId;
  if (!supplyId) return false;
  return Object.values(inv.actions).some(
    (a) =>
      a.id !== target.id &&
      a.type === 'supply.counted' &&
      a.outcome === 'applied' &&
      !a.reversedByActionId &&
      a.payload.supplyId === supplyId &&
      a.correctedTime > target.correctedTime,
  );
}

/** The local mirror of the server's reversal (sync/undo.ts), close enough to show the result. */
function reverseLocally(inv: Inventory, body: { type: string; payload: Record<string, unknown>; result: Result }, at: string) {
  const p = body.payload as Record<string, string>;
  const r = body.result ?? {};
  const putBack = () => {
    for (const t of r.taken ?? []) {
      const b = inv.batches[t.batchId];
      if (b) inv.batches[b.id] = { ...b, quantity: b.quantity + t.quantity };
    }
  };
  const empty = (batchId: string | undefined) => {
    const b = batchId ? inv.batches[batchId] : undefined;
    if (b) inv.batches[b.id] = { ...b, quantity: 0 };
  };
  const restore = <T extends 'supplies' | 'assets' | 'locations' | 'categories'>(table: T, key: string, change: Partial<Tables[T]>) => {
    const row = inv[table][key];
    if (row) (inv[table] as Record<string, unknown>)[key] = { ...row, ...change };
  };
  switch (body.type) {
    case 'supply.used':
    case 'batch.discarded':
      return putBack();
    case 'supply.counted':
      putBack();
      return empty(r.addedBatchId);
    case 'batch.added':
      return empty(p.batchId);
    case 'batch.moved': {
      const b = inv.batches[p.batchId!];
      if (b) inv.batches[b.id] = { ...b, locationId: r.fromLocationId ?? null };
      return;
    }
    case 'asset.moved':
      return restore('assets', p.assetId!, { locationId: r.fromLocationId ?? null });
    case 'asset.disposed':
      return restore('assets', p.assetId!, { disposedAt: null, disposedReason: null });
    case 'supply.deleted':
      return restore('supplies', p.supplyId!, { deletedAt: null });
    case 'asset.deleted':
      return restore('assets', p.assetId!, { deletedAt: null });
    case 'location.deleted':
      return restore('locations', p.locationId!, { deletedAt: null });
    case 'category.deleted':
      return restore('categories', p.categoryId!, { deletedAt: null });
    case 'supply.created':
      return restore('supplies', p.supplyId!, { deletedAt: at });
    case 'asset.created':
      return restore('assets', p.assetId!, { deletedAt: at });
    case 'barcode.moved': {
      const c = inv.barcodes[p.code!];
      if (c && r.fromSupplyId) inv.barcodes[c.code] = { ...c, supplyId: r.fromSupplyId };
      return;
    }
  }
}

/** A Supply's amount on hand. */
export function onHand(inv: Inventory, supplyId: string): number {
  return onHandBatches(inv, supplyId).reduce((n, b) => n + b.quantity, 0);
}
