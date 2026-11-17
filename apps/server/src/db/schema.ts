import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The server's copy of the inventory (spec §3). Ids are UUIDs generated on the Device that created
 * the thing, so Actions can refer to new things while offline. Calendar dates (expiry, purchase,
 * warranty) are `date` columns read as `YYYY-MM-DD` strings. Money is whole sen (RM 1 = 100 sen).
 * Soft-deleted rows keep `deletedAt` so an Action on a deleted thing can be recognised.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });
const calendarDate = (name: string) => date(name, { mode: 'string' });
/** The `seq` of the last Action that changed this row; Devices pull rows changed since a `seq`. */
const changedSeq = () => bigint('changed_seq', { mode: 'number' }).notNull().default(0);

/** Household-wide settings: a single row. */
export const householdSettings = pgTable(
  'household_settings',
  {
    changedSeq: changedSeq(),
    id: integer('id').primaryKey().default(1),
    nearExpiryDays: integer('near_expiry_days').notNull().default(7),
    /**
     * Changes whenever the database is restored from a backup (scripts/restore.sh). Phones that see
     * a new epoch drop what they pulled and sync everything again, since sequence numbers rewound.
     */
    epoch: uuid('epoch').notNull().defaultRandom(),
  },
  (t) => [check('household_settings_single_row', sql`${t.id} = 1`)],
);

export const categories = pgTable('categories', {
    changedSeq: changedSeq(),
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  deletedAt: deletedAt(),
});

export const locations = pgTable('locations', {
    changedSeq: changedSeq(),
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  deletedAt: deletedAt(),
});

export const supplies = pgTable(
  'supplies',
  {
    changedSeq: changedSeq(),
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** The unit it is counted in: pieces, packs, bottles… Partly used units aren't tracked. */
    unit: text('unit').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    usualLocationId: uuid('usual_location_id').references(() => locations.id),
    minimum: integer('minimum'),
    restockTo: integer('restock_to'),
    expires: boolean('expires').notNull().default(true),
    /** Overrides the household Near-expiry window when set. */
    nearExpiryDays: integer('near_expiry_days'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('supplies_minimum_nonnegative', sql`${t.minimum} IS NULL OR ${t.minimum} >= 0`),
    check('supplies_restock_to_positive', sql`${t.restockTo} IS NULL OR ${t.restockTo} > 0`),
  ],
);

export const barcodeSource = pgEnum('barcode_source', ['household', 'open_food_facts']);

/** A manufacturer's barcode. The code is the key, so one Barcode belongs to exactly one Supply. */
export const barcodes = pgTable(
  'barcodes',
  {
    changedSeq: changedSeq(),
    code: text('code').primaryKey(),
    supplyId: uuid('supply_id').notNull().references(() => supplies.id),
    brand: text('brand'),
    productName: text('product_name'),
    packSize: text('pack_size'),
    photoId: uuid('photo_id'),
    unitsPerScan: integer('units_per_scan').notNull().default(1),
    source: barcodeSource('source').notNull().default('household'),
    createdAt: createdAt(),
  },
  (t) => [
    index('barcodes_supply_idx').on(t.supplyId),
    check('barcodes_units_per_scan_positive', sql`${t.unitsPerScan} > 0`),
  ],
);

export const batches = pgTable(
  'batches',
  {
    changedSeq: changedSeq(),
    id: uuid('id').primaryKey(),
    supplyId: uuid('supply_id').notNull().references(() => supplies.id),
    quantity: integer('quantity').notNull(),
    expiry: calendarDate('expiry'),
    /** Null only when the Supply has no usual Location to default to. */
    locationId: uuid('location_id').references(() => locations.id),
    /** Breaks ties between Batches with the same expiry when using oldest first. */
    createdAt: createdAt(),
  },
  (t) => [
    index('batches_supply_idx').on(t.supplyId),
    check('batches_quantity_nonnegative', sql`${t.quantity} >= 0`),
  ],
);

export const assets = pgTable(
  'assets',
  {
    changedSeq: changedSeq(),
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    locationId: uuid('location_id').references(() => locations.id),
    purchaseDate: calendarDate('purchase_date'),
    priceSen: integer('price_sen'),
    shop: text('shop'),
    serialNumber: text('serial_number'),
    warrantyEnd: calendarDate('warranty_end'),
    photoIds: jsonb('photo_ids').$type<string[]>().notNull().default([]),
    receiptPhotoId: uuid('receipt_photo_id'),
    notes: text('notes'),
    disposedAt: calendarDate('disposed_at'),
    disposedReason: text('disposed_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [check('assets_price_nonnegative', sql`${t.priceSen} IS NULL OR ${t.priceSen} >= 0`)],
);

export const maintenanceEntries = pgTable(
  'maintenance_entries',
  {
    changedSeq: changedSeq(),
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id').notNull().references(() => assets.id),
    date: calendarDate('date').notNull(),
    note: text('note').notNull(),
    costSen: integer('cost_sen'),
    createdAt: createdAt(),
  },
  (t) => [index('maintenance_entries_asset_idx').on(t.assetId)],
);

/**
 * A printed QR Label's own code. Linked to one Asset or one Location, or to nothing yet
 * (a Blank label). Replacing a Label retires its code.
 */
export const labels = pgTable(
  'labels',
  {
    changedSeq: changedSeq(),
    code: text('code').primaryKey(),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('labels_one_target', sql`${t.assetId} IS NULL OR ${t.locationId} IS NULL`)],
);

/** A paired phone. People aren't tracked; the name labels the phone. */
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  model: text('model'),
  /** Hash of the long-lived Device key; the key itself is only ever on the phone. */
  keyHash: text('key_hash').notNull().unique(),
  appVersion: text('app_version'),
  /** Server time minus the Device's clock, measured at the last push. */
  clockOffsetMs: integer('clock_offset_ms').notNull().default(0),
  pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});

export const actionOutcome = pgEnum('action_outcome', ['applied', 'skipped']);

/**
 * The Action log: every change, kept forever. `seq` is the server's sequence number, which only goes
 * up; Devices pull changes since the last `seq` they saw. `result` records what applying the Action
 * did, such as which Batches a "used" took from, so it can be undone exactly.
 */
export const actions = pgTable(
  'actions',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    id: uuid('id').notNull().unique(),
    deviceId: uuid('device_id').notNull().references(() => devices.id),
    type: text('type').notNull(),
    shapeVersion: integer('shape_version').notNull(),
    payload: jsonb('payload').notNull(),
    deviceTime: timestamp('device_time', { withTimezone: true }).notNull(),
    /** The Device time corrected by its clock offset; used for the Stocktake rule. */
    correctedTime: timestamp('corrected_time', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: actionOutcome('outcome').notNull(),
    result: jsonb('result'),
    /**
     * The Undo or Correction that reversed this Action, while it stands. Cleared when that Undo is
     * itself undone, so the original counts again.
     */
    reversedByActionId: uuid('reversed_by_action_id'),
    /** The `seq` of the last Action that changed this row (itself, or an Undo/Correction of it). */
    changedSeq: changedSeq(),
  },
  (t) => [
    index('actions_device_idx').on(t.deviceId),
    index('actions_type_idx').on(t.type),
    index('actions_changed_seq_idx').on(t.changedSeq),
  ],
);

export const mismatchKind = pgEnum('mismatch_kind', ['shortfall', 'skipped_action', 'double_assignment']);
export const mismatchResolution = pgEnum('mismatch_resolution', [
  'accepted',
  'counted',
  'redone',
  'kept',
  'merged',
  'undone',
]);

/** A problem found when combining Actions from several Devices, kept until someone checks it. */
export const mismatches = pgTable(
  'mismatches',
  {
    changedSeq: changedSeq(),
    id: uuid('id').primaryKey().defaultRandom(),
    kind: mismatchKind('kind').notNull(),
    /** The Action that caused it. */
    actionId: uuid('action_id').notNull().references(() => actions.id),
    /** E.g. the shortfall amount, or the two things a Barcode was given to. */
    details: jsonb('details').notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByActionId: uuid('resolved_by_action_id').references(() => actions.id),
    resolution: mismatchResolution('resolution'),
  },
  (t) => [index('mismatches_open_idx').on(t.resolvedAt)],
);

/**
 * One-time pairing codes (spec §7). A code is offered on the download page, expires after
 * 10 minutes, and is used once to pair a phone.
 */
export const pairingCodes = pgTable(
  'pairing_codes',
  {
    code: text('code').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByDeviceId: uuid('used_by_device_id').references(() => devices.id),
    createdAt: createdAt(),
  },
  (t) => [check('pairing_codes_six_digits', sql`${t.code} ~ '^[0-9]{6}$'`)],
);
