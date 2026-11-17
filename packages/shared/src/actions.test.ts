import { describe, expect, expectTypeOf, it } from 'vitest';
import { Action, ActionBody, ActionPayloads, LabelCode } from './actions.ts';

describe('Action types (checked by pnpm typecheck)', () => {
  it('narrow each payload by its type', () => {
    const body = {} as ActionBody;
    if (body.type === 'supply.used') expectTypeOf(body.payload.quantity).toEqualTypeOf<number>();
    if (body.type === 'batch.added') expectTypeOf(body.payload.expiry).toEqualTypeOf<string | null>();
    if (body.type === 'action.corrected' && body.payload.corrected.type === 'supply.counted') {
      expectTypeOf(body.payload.corrected.payload.quantity).toEqualTypeOf<number>();
    }
  });
});

const ids = {
  action: '0b9f3c1e-2a4d-4e6f-8a1b-1c2d3e4f5a6b',
  device: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  supply: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  batch: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  location: '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c',
  asset: '5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d',
};

const envelope = { id: ids.action, deviceId: ids.device, deviceTime: '2026-11-17T09:41:00+08:00', v: 1 } as const;

describe('Action', () => {
  it('accepts a "used" Action with its envelope', () => {
    const parsed = Action.parse({ ...envelope, type: 'supply.used', payload: { supplyId: ids.supply, quantity: 2 } });
    expect(parsed.type).toBe('supply.used');
  });

  it('requires the v1 shape version', () => {
    const result = Action.safeParse({ ...envelope, v: 2, type: 'supply.used', payload: { supplyId: ids.supply, quantity: 2 } });
    expect(result.success).toBe(false);
  });

  it('rejects unknown Action types', () => {
    expect(Action.safeParse({ ...envelope, type: 'supply.teleported', payload: {} }).success).toBe(false);
  });

  it('rejects a payload that does not match its type', () => {
    expect(ActionBody.safeParse({ type: 'supply.used', payload: { supplyId: ids.supply, quantity: 0 } }).success).toBe(false);
    expect(ActionBody.safeParse({ type: 'supply.used', payload: { supplyId: 'rice', quantity: 1 } }).success).toBe(false);
  });
});

describe('Action payloads', () => {
  it('lets a Batch have no expiry date', () => {
    const body = {
      type: 'batch.added',
      payload: { batchId: ids.batch, supplyId: ids.supply, quantity: 6, expiry: null, locationId: ids.location },
    };
    expect(ActionBody.safeParse(body).success).toBe(true);
    expect(ActionBody.safeParse({ ...body, payload: { ...body.payload, expiry: '17/11/2026' } }).success).toBe(false);
  });

  it('allows a Stocktake of zero but not a "used" of zero', () => {
    expect(ActionBody.safeParse({ type: 'supply.counted', payload: { supplyId: ids.supply, quantity: 0 } }).success).toBe(true);
    expect(ActionBody.safeParse({ type: 'supply.used', payload: { supplyId: ids.supply, quantity: 0 } }).success).toBe(false);
  });

  it('attaches a Label to either an Asset or a Location', () => {
    const toAsset = { type: 'label.attached', payload: { code: '7K2QX', target: { kind: 'asset', assetId: ids.asset } } };
    const toLocation = { type: 'label.attached', payload: { code: '7K2QX', target: { kind: 'location', locationId: ids.location } } };
    expect(ActionBody.safeParse(toAsset).success).toBe(true);
    expect(ActionBody.safeParse(toLocation).success).toBe(true);
  });

  it('lets edits change only some fields', () => {
    expect(ActionBody.safeParse({ type: 'supply.edited', payload: { supplyId: ids.supply, changes: { minimum: 2 } } }).success).toBe(true);
  });

  it('records where Barcode details came from', () => {
    const payload = {
      code: '9556001234561', supplyId: ids.supply, brand: 'Beras Wangi', productName: 'Jasmine rice', packSize: '5 kg',
      photoId: null, unitsPerScan: 1, source: 'open_food_facts',
    };
    expect(ActionBody.safeParse({ type: 'barcode.attached', payload }).success).toBe(true);
    expect(ActionBody.safeParse({ type: 'barcode.attached', payload: { ...payload, source: 'google' } }).success).toBe(false);
  });

  it('covers every v1 Action type in the spec', () => {
    expect(Object.keys(ActionPayloads).sort()).toEqual(
      [
        'asset.created', 'asset.deleted', 'asset.disposed', 'asset.edited', 'asset.moved',
        'barcode.attached', 'barcode.moved',
        'batch.added', 'batch.discarded', 'batch.moved',
        'category.created', 'category.deleted', 'category.renamed',
        'label.attached', 'label.replaced', 'label.retired',
        'location.created', 'location.deleted', 'location.renamed',
        'maintenance.added', 'mismatch.resolved',
        'supply.counted', 'supply.created', 'supply.deleted', 'supply.edited', 'supply.merged', 'supply.used',
      ].sort(),
    );
  });
});

describe('Undo and Correction', () => {
  it('an Undo names the Action it cancels', () => {
    expect(ActionBody.safeParse({ type: 'action.undone', payload: { targetActionId: ids.action } }).success).toBe(true);
  });

  it('a Correction carries the replacement Action', () => {
    const correction = {
      type: 'action.corrected',
      payload: { targetActionId: ids.action, corrected: { type: 'supply.used', payload: { supplyId: ids.supply, quantity: 3 } } },
    };
    expect(ActionBody.safeParse(correction).success).toBe(true);
  });

  it('a Correction cannot replace with an Undo', () => {
    const bad = {
      type: 'action.corrected',
      payload: { targetActionId: ids.action, corrected: { type: 'action.undone', payload: { targetActionId: ids.action } } },
    };
    expect(ActionBody.safeParse(bad).success).toBe(false);
  });
});

describe('Label codes', () => {
  it('are 5 characters without look-alike letters', () => {
    expect(LabelCode.safeParse('7K2QX').success).toBe(true);
    for (const bad of ['7K2Q', '7K2QXX', '7k2qx', 'OIL01', '7K2QU']) {
      expect(LabelCode.safeParse(bad).success).toBe(false);
    }
  });
});
