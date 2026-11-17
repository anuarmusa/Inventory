import { describe, expect, it } from 'vitest';
import type { Action } from '../actions.ts';
import { type BatchRow, inventoryFrom, type LoggedActionRow, onHand, replay, type SupplyRow } from './inventory.ts';
import { fixBody, history, undoBody } from './history.ts';

const RICE = '11111111-1111-4111-8111-111111111111';
const KITCHEN = '33333333-3333-4333-8333-333333333333';
const DAD = '44444444-4444-4444-8444-444444444444';
const supply = { id: RICE, name: 'Jasmine rice', unit: 'packs', expires: true, deletedAt: null } as SupplyRow;
const batch = (id: string, quantity: number): BatchRow => ({ id, supplyId: RICE, quantity, expiry: null, locationId: null, createdAt: '' });

const logged = (id: string, type: string, payload: Record<string, unknown>, extra: Partial<LoggedActionRow> = {}): LoggedActionRow => ({
  seq: 1,
  id,
  deviceId: KITCHEN,
  type,
  payload,
  correctedTime: '2026-11-17T09:00:00.000Z',
  outcome: 'applied',
  result: null,
  reversedByActionId: null,
  ...extra,
});
const devices = [
  { id: KITCHEN, name: 'Kitchen phone' },
  { id: DAD, name: 'Dad’s Samsung A54' },
];

describe('History', () => {
  it('lists Actions newest first, with Undo and Fix for amounts', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      devices,
      actions: [
        logged('a1', 'supply.used', { supplyId: RICE, quantity: 2 }, { correctedTime: '2026-11-17T09:00:00.000Z' }),
        logged('a2', 'supply.edited', { supplyId: RICE, changes: { minimum: 2 } }, { correctedTime: '2026-11-17T10:00:00.000Z', deviceId: DAD }),
      ],
    });
    const [edit, used] = history(inv, []);
    expect(edit).toMatchObject({ id: 'a2', text: 'Edited Jasmine rice', deviceName: 'Dad’s Samsung A54', canUndo: false, amount: null });
    expect(used).toMatchObject({ id: 'a1', text: 'Used 2 packs of Jasmine rice', canUndo: true, amount: 2, undone: null, fixed: null });
  });

  it('strikes an undone Action through with who undid it, and offers to bring it back', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      devices,
      actions: [
        logged('a1', 'supply.used', { supplyId: RICE, quantity: 2 }, { reversedByActionId: 'u1' }),
        logged('u1', 'action.undone', { targetActionId: 'a1' }, { deviceId: DAD, correctedTime: '2026-11-18T08:00:00.000Z' }),
      ],
    });
    const [entry] = history(inv, []);
    expect(history(inv, [])).toHaveLength(1);
    expect(entry).toMatchObject({ undone: 'Undone by Dad’s Samsung A54, 18 Nov', canUndo: true, headId: 'u1', amount: null });
    expect(undoBody(entry!)).toEqual({ type: 'action.undone', payload: { targetActionId: 'u1' } });
  });

  it('shows the latest Correction: "Fixed: 1, not 2", and fixes the Correction that stands', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      devices,
      actions: [
        logged('a1', 'supply.used', { supplyId: RICE, quantity: 2 }, { reversedByActionId: 'c1' }),
        logged('c1', 'action.corrected', { targetActionId: 'a1', corrected: { type: 'supply.used', payload: { supplyId: RICE, quantity: 3 } } }, { reversedByActionId: 'c2' }),
        logged('c2', 'action.corrected', { targetActionId: 'c1', corrected: { type: 'supply.used', payload: { supplyId: RICE, quantity: 1 } } }),
      ],
    });
    const [entry] = history(inv, []);
    expect(entry).toMatchObject({ fixed: 'Fixed: 1, not 2', amount: 1, headId: 'c2' });
    expect(fixBody(inv, entry!, 4)).toEqual({
      type: 'action.corrected',
      payload: { targetActionId: 'c2', corrected: { type: 'supply.used', payload: { supplyId: RICE, quantity: 4 } } },
    });
  });

  it('only shows what touched this Supply on its page, and includes what this phone hasn’t sent', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      batches: [batch('b1', 3)],
      actions: [
        logged('a1', 'batch.discarded', { batchId: 'b1', quantity: 1 }),
        logged('a2', 'location.created', { locationId: 'l', name: 'Garage' }),
      ],
    });
    const mine = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', deviceId: KITCHEN, deviceTime: '2026-11-19T00:00:00.000Z', v: 1, type: 'supply.used', payload: { supplyId: RICE, quantity: 1 } } as Action;
    const entries = history(inv, [mine], { supplyId: RICE });
    expect(entries.map((e) => [e.id, e.unsent])).toEqual([
      [mine.id, true],
      ['a1', false],
    ]);
  });

  it('warns when a Stocktake came after the Action', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      actions: [
        logged('a1', 'supply.used', { supplyId: RICE, quantity: 1 }),
        logged('a2', 'supply.counted', { supplyId: RICE, quantity: 5 }, { correctedTime: '2026-11-17T12:00:00.000Z' }),
      ],
    });
    expect(history(inv, []).find((e) => e.id === 'a1')!.countedSince).toBe(true);
  });
});

describe('an Undo not sent yet', () => {
  const action = (body: object): Action =>
    ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009', deviceId: KITCHEN, deviceTime: '2026-11-18T09:00:00.000Z', v: 1, ...body }) as Action;

  it('puts back exactly what the original took, and marks it undone', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      batches: [batch('b1', 0), batch('b2', 4)],
      actions: [logged('a1', 'supply.used', { supplyId: RICE, quantity: 3 }, { result: { taken: [{ batchId: 'b1', quantity: 2 }, { batchId: 'b2', quantity: 1 }], shortfall: 0 } })],
    });
    const view = replay(inv, [action({ type: 'action.undone', payload: { targetActionId: 'a1' } })]);
    expect(onHand(view, RICE)).toBe(7);
    expect(view.actions.a1!.reversedByActionId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-000000000009');
  });

  it('applies a Correction: reverses the original, then the right amount', () => {
    const inv = inventoryFrom({
      supplies: [supply],
      batches: [batch('b1', 5)],
      actions: [logged('a1', 'supply.used', { supplyId: RICE, quantity: 2 }, { result: { taken: [{ batchId: 'b1', quantity: 2 }] } })],
    });
    const view = replay(inv, [
      action({ type: 'action.corrected', payload: { targetActionId: 'a1', corrected: { type: 'supply.used', payload: { supplyId: RICE, quantity: 3 } } } }),
    ]);
    expect(onHand(view, RICE)).toBe(4);
  });
});
