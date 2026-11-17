import { describe, expect, it } from 'vitest';
import type { Action, ActionBody } from '../actions.ts';
import { type BatchRow, inventoryFrom, type LoggedActionRow, onHand, replay, type SupplyRow } from './inventory.ts';

const RICE = '11111111-1111-4111-8111-111111111111';
const PANTRY = '22222222-2222-4222-8222-222222222222';
const DEVICE = '33333333-3333-4333-8333-333333333333';
const OLD = '44444444-4444-4444-8444-444444444444';
const NEW = '55555555-5555-4555-8555-555555555555';

let n = 0;
function act(body: ActionBody, deviceTime = '2026-11-17T09:00:00.000Z'): Action {
  n += 1;
  return { id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`, deviceId: DEVICE, deviceTime, v: 1, ...body } as Action;
}

const rice: SupplyRow = {
  id: RICE,
  name: 'Jasmine rice',
  unit: 'packs',
  categoryId: null,
  usualLocationId: PANTRY,
  minimum: 1,
  restockTo: 4,
  expires: true,
  nearExpiryDays: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};
const batch = (id: string, quantity: number, expiry: string | null): BatchRow => ({
  id,
  supplyId: RICE,
  quantity,
  expiry,
  locationId: PANTRY,
  createdAt: '2026-11-01T00:00:00.000Z',
});

function server() {
  return inventoryFrom({
    supplies: [rice],
    locations: [{ id: PANTRY, name: 'Pantry', createdAt: '2026-11-01T00:00:00.000Z', deletedAt: null }],
    batches: [batch(OLD, 2, '2026-12-01'), batch(NEW, 5, '2027-06-01')],
  });
}

describe('the local view', () => {
  it('is the server state when nothing is unsent', () => {
    const base = server();
    expect(replay(base, [])).toBe(base);
    expect(onHand(base, RICE)).toBe(7);
  });

  it('replays Unsent Actions on top, oldest Batch first, without changing the server state', () => {
    const base = server();
    const view = replay(base, [act({ type: 'supply.used', payload: { supplyId: RICE, quantity: 3 } })]);
    expect(view.batches[OLD]?.quantity).toBe(0);
    expect(view.batches[NEW]?.quantity).toBe(4);
    expect(onHand(base, RICE)).toBe(7);
  });

  it('shows new things and their Batches', () => {
    const supplyId = '66666666-6666-4666-8666-666666666666';
    const batchId = '77777777-7777-4777-8777-777777777777';
    const view = replay(server(), [
      act({
        type: 'supply.created',
        payload: { supplyId, name: 'Milo', unit: 'tins', categoryId: null, usualLocationId: PANTRY, minimum: null, restockTo: null, expires: true, nearExpiryDays: null },
      }),
      act({ type: 'batch.added', payload: { batchId, supplyId, quantity: 2, expiry: null, locationId: PANTRY } }),
    ]);
    expect(view.supplies[supplyId]?.name).toBe('Milo');
    expect(onHand(view, supplyId)).toBe(2);
  });

  it('sets the total on a Stocktake, and skips a "used" from before it', () => {
    const view = replay(server(), [
      act({ type: 'supply.counted', payload: { supplyId: RICE, quantity: 10 } }, '2026-11-17T10:00:00.000Z'),
      act({ type: 'supply.used', payload: { supplyId: RICE, quantity: 1 } }, '2026-11-17T09:00:00.000Z'),
    ]);
    expect(onHand(view, RICE)).toBe(10);
  });

  it('skips a "used" from before a Stocktake already on the server', () => {
    const counted: LoggedActionRow = {
      seq: 9,
      id: 'counted',
      deviceId: DEVICE,
      type: 'supply.counted',
      payload: { supplyId: RICE, quantity: 7 },
      correctedTime: '2026-11-17T12:00:00.000Z',
      outcome: 'applied',
    };
    const base = { ...server(), actions: { counted } };
    const view = replay(base, [act({ type: 'supply.used', payload: { supplyId: RICE, quantity: 1 } }, '2026-11-17T08:00:00+08:00')]);
    expect(onHand(view, RICE)).toBe(7);
  });

  it('never goes below zero', () => {
    const view = replay(server(), [act({ type: 'supply.used', payload: { supplyId: RICE, quantity: 50 } })]);
    expect(onHand(view, RICE)).toBe(0);
  });

  it('leaves out Actions on something deleted, as the server would skip them', () => {
    const view = replay(server(), [
      act({ type: 'supply.deleted', payload: { supplyId: RICE } }),
      act({ type: 'supply.used', payload: { supplyId: RICE, quantity: 1 } }),
    ]);
    expect(view.supplies[RICE]?.deletedAt).not.toBeNull();
    expect(onHand(view, RICE)).toBe(7);
  });

  it('applies detail edits', () => {
    const view = replay(server(), [act({ type: 'supply.edited', payload: { supplyId: RICE, changes: { name: 'Basmati rice', minimum: 2 } } })]);
    expect(view.supplies[RICE]).toMatchObject({ name: 'Basmati rice', minimum: 2, unit: 'packs' });
  });
});
