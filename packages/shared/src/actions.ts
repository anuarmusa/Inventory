import { z } from 'zod';

/**
 * Actions: every change a Device makes, recorded as what was done (spec §4.1).
 * Ids for new things are generated on the Device, so Actions can refer to them while offline.
 * Quantities are deltas, except a Stocktake, which records the count.
 */

/** The shape version every v1 Action carries. Raise it per type when a payload changes shape. */
export const ACTION_SHAPE_VERSION = 1 as const;

const id = z.uuid();
const calendarDate = z.iso.date();
const name = z.string().trim().min(1).max(200);
const units = z.int().positive();
const sen = z.int().nonnegative();
const optionalText = z.string().trim().max(2000).nullable();

/** A Label's own code (spec §10.3): 5 characters from an unambiguous alphabet. */
export const LabelCode = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{5}$/, 'A Label code is 5 characters');

const supplyFields = z.object({
  name,
  /** The unit the Supply is counted in, e.g. packs, bottles, rolls. */
  unit: z.string().trim().min(1).max(40),
  categoryId: id.nullable(),
  usualLocationId: id.nullable(),
  minimum: z.int().nonnegative().nullable(),
  restockTo: units.nullable(),
  expires: z.boolean(),
  nearExpiryDays: z.int().nonnegative().nullable(),
});

const assetFields = z.object({
  name,
  categoryId: id.nullable(),
  locationId: id.nullable(),
  purchaseDate: calendarDate.nullable(),
  priceSen: sen.nullable(),
  shop: optionalText,
  serialNumber: optionalText,
  warrantyEnd: calendarDate.nullable(),
  photoIds: z.array(id),
  receiptPhotoId: id.nullable(),
  notes: optionalText,
});

const labelTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset'), assetId: id }),
  z.object({ kind: z.literal('location'), locationId: id }),
]);

/** Every v1 Action type and its payload. */
export const ActionPayloads = {
  'category.created': z.object({ categoryId: id, name }),
  'category.renamed': z.object({ categoryId: id, name }),
  'category.deleted': z.object({ categoryId: id }),

  'location.created': z.object({ locationId: id, name }),
  'location.renamed': z.object({ locationId: id, name }),
  'location.deleted': z.object({ locationId: id }),

  'supply.created': supplyFields.extend({ supplyId: id }),
  'supply.edited': z.object({ supplyId: id, changes: supplyFields.partial() }),
  'supply.deleted': z.object({ supplyId: id }),
  /** Used some: names the Supply and amount only; the server takes from the oldest Batches. */
  'supply.used': z.object({ supplyId: id, quantity: units }),
  /** Stocktake: the Supply's real total on hand. */
  'supply.counted': z.object({ supplyId: id, quantity: z.int().nonnegative() }),
  'supply.merged': z.object({ fromSupplyId: id, intoSupplyId: id }),

  'barcode.attached': z.object({
    code: z.string().regex(/^\d{8,14}$/),
    supplyId: id,
    brand: optionalText,
    productName: optionalText,
    packSize: optionalText,
    photoId: id.nullable(),
    unitsPerScan: units,
    source: z.enum(['household', 'open_food_facts']),
  }),
  'barcode.moved': z.object({ code: z.string().regex(/^\d{8,14}$/), toSupplyId: id }),

  'batch.added': z.object({
    batchId: id,
    supplyId: id,
    quantity: units,
    expiry: calendarDate.nullable(),
    locationId: id,
  }),
  'batch.moved': z.object({ batchId: id, toLocationId: id }),
  'batch.discarded': z.object({ batchId: id, quantity: units }),

  'asset.created': assetFields.extend({ assetId: id }),
  'asset.edited': z.object({ assetId: id, changes: assetFields.partial() }),
  'asset.deleted': z.object({ assetId: id }),
  'asset.moved': z.object({ assetId: id, toLocationId: id }),
  'asset.disposed': z.object({ assetId: id, date: calendarDate, reason: name }),
  'maintenance.added': z.object({ entryId: id, assetId: id, date: calendarDate, note: name, costSen: sen.nullable() }),

  'label.attached': z.object({ code: LabelCode, target: labelTarget }),
  /** Replace Label: links a new code to the old code's Asset or Location and retires the old code. */
  'label.replaced': z.object({ oldCode: LabelCode, newCode: LabelCode }),
  'label.retired': z.object({ code: LabelCode }),

  'mismatch.resolved': z.object({
    mismatchId: id,
    resolution: z.enum(['accepted', 'counted', 'redone', 'kept', 'merged']),
  }),
} as const;

export type ActionType = keyof typeof ActionPayloads | 'action.undone' | 'action.corrected';

type Payloads = typeof ActionPayloads;
/** One `{ type, payload }` schema per Action type, kept as a union so each type keeps its own payload. */
type BodySchema = {
  [K in keyof Payloads]: z.ZodObject<{ type: z.ZodLiteral<K>; payload: Payloads[K] }>;
}[keyof Payloads];

const bodies = (Object.keys(ActionPayloads) as (keyof Payloads)[]).map((type) =>
  z.object({ type: z.literal(type), payload: ActionPayloads[type] }),
) as unknown as [BodySchema, ...BodySchema[]];

/** Any v1 Action's type and payload, except Undo and Correction. */
export const PlainActionBody = z.discriminatedUnion('type', bodies);
export type PlainActionBody = z.infer<typeof PlainActionBody>;

/** Undo: cancels an earlier Action that reached the server. An Undo can itself be undone. */
const UndoBody = z.object({ type: z.literal('action.undone'), payload: z.object({ targetActionId: id }) });

/**
 * Correction: replaces an earlier Action with the right values. The server checks the replacement
 * has the same type as the Action it corrects.
 */
const CorrectionBody = z.object({
  type: z.literal('action.corrected'),
  payload: z.object({ targetActionId: id, corrected: PlainActionBody }),
});

export const ActionBody = z.discriminatedUnion('type', [...PlainActionBody.options, UndoBody, CorrectionBody]);
export type ActionBody = z.infer<typeof ActionBody>;

/** An Action as a Device sends it in a sync push. */
export const Action = z.intersection(
  z.object({
    /** Generated on the Device; makes pushes safe to retry. */
    id,
    deviceId: id,
    /** The Device's clock when the Action was taken; the server corrects it by the Device's offset. */
    deviceTime: z.iso.datetime({ offset: true }),
    v: z.literal(ACTION_SHAPE_VERSION),
  }),
  ActionBody,
);
export type Action = z.infer<typeof Action>;
