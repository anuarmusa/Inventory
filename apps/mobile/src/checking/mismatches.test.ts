import { ActionBody } from '@inventory/shared';
import { type BatchRow, inventoryFrom, type LoggedActionRow, type MismatchRow, type SupplyRow } from '../sync/inventory';
import { checked, countActions, fixActions, needsChecking, possibleDuplicates, redoActions } from './mismatches';

const RICE = '11111111-1111-4111-8111-111111111111';
const MILO = '22222222-2222-4222-8222-222222222222';
const DRINK = '55555555-5555-4555-8555-555555555555';
const KITCHEN = '33333333-3333-4333-8333-333333333333';
const supply = (id: string, name: string, extra: Partial<SupplyRow> = {}) => ({ id, name, unit: 'packs', deletedAt: null, ...extra }) as SupplyRow;
const logged = (id: string, type: string, payload: Record<string, unknown>): LoggedActionRow => ({
  seq: 1,
  id,
  deviceId: KITCHEN,
  type,
  payload,
  correctedTime: '2026-11-17T09:00:00.000Z',
  outcome: 'applied',
});
const mismatch = (id: string, kind: MismatchRow['kind'], actionId: string, details: Record<string, unknown>, resolution: string | null = null) =>
  ({
    id,
    kind,
    actionId,
    details,
    createdAt: '2026-11-17T09:00:00.000Z',
    resolvedAt: resolution ? '2026-11-17T10:00:00.000Z' : null,
    resolvedByActionId: null,
    resolution,
  }) as MismatchRow;

const inv = inventoryFrom({
  devices: [{ id: KITCHEN, name: 'Kitchen phone' }],
  supplies: [supply(RICE, 'Jasmine rice'), supply(MILO, 'Milo', { deletedAt: '2026-11-16T00:00:00.000Z' }), supply(DRINK, 'Chocolate drink')],
  batches: [{ id: 'b', supplyId: RICE, quantity: 0, expiry: null, locationId: null, createdAt: '' } as BatchRow],
  actions: [
    logged('a1', 'supply.used', { supplyId: RICE, quantity: 3 }),
    logged('a2', 'supply.used', { supplyId: MILO, quantity: 1 }),
    logged('a3', 'barcode.attached', { code: '9556002345678', supplyId: DRINK }),
  ],
  mismatches: [
    mismatch('m1', 'shortfall', 'a1', { supplyId: RICE, requested: 3, shortfall: 2 }),
    mismatch('m2', 'skipped_action', 'a2', { reason: 'gone', thing: 'supply', id: MILO }),
    mismatch('m3', 'double_assignment', 'a3', { thing: 'barcode', code: '9556002345678', keptSupplyId: RICE, otherSupplyId: DRINK }),
    mismatch('m4', 'shortfall', 'a1', { supplyId: RICE, requested: 1, shortfall: 1 }, 'accepted'),
  ],
});

describe('Needs checking', () => {
  const items = Object.fromEntries(needsChecking(inv).map((i) => [i.mismatch.id, i]));

  it('lists open Mismatches in plain words, each with its fixes', () => {
    expect(Object.keys(items).sort()).toEqual(['m1', 'm2', 'm3']);
    expect(items.m1!.text).toBe('Kitchen phone: used 3 packs of Jasmine rice, but only 1 was on hand.');
    expect(items.m1!.fixes.map((f) => f.label)).toEqual(['Count it', 'Accept']);
    expect(items.m2!.text).toBe('Kitchen phone: “Used 1 packs of Milo” was skipped: Milo was deleted.');
    expect(items.m2!.fixes.map((f) => f.label)).toEqual(['Accept', 'Redo it on another Supply']);
    expect(items.m3!.fixes.map((f) => f.label)).toEqual(['Keep on Jasmine rice', 'Move to Chocolate drink', 'Merge the two']);
  });

  it('records resolving as an Action, with any fix it needs first', () => {
    const [m1, m3] = [items.m1!, items.m3!];
    expect(fixActions(m1, m1.fixes[1]!)).toEqual([{ type: 'mismatch.resolved', payload: { mismatchId: 'm1', resolution: 'accepted' } }]);
    expect(fixActions(m3, m3.fixes[1]!)).toEqual([
      { type: 'barcode.moved', payload: { code: '9556002345678', toSupplyId: DRINK } },
      { type: 'mismatch.resolved', payload: { mismatchId: 'm3', resolution: 'kept' } },
    ]);
    expect(fixActions(m3, m3.fixes[2]!)).toEqual([
      { type: 'supply.merged', payload: { fromSupplyId: DRINK, intoSupplyId: RICE } },
      { type: 'mismatch.resolved', payload: { mismatchId: 'm3', resolution: 'merged' } },
    ]);
    expect(countActions(RICE, 4, 'm1').map((a) => a.type)).toEqual(['supply.counted', 'mismatch.resolved']);
    const redo = items.m2!.fixes[1]!;
    if (redo.kind !== 'redo') throw new Error('expected redo');
    const actions = redoActions(items.m2!, redo.body, DRINK);
    expect(actions[0]).toEqual({ type: 'supply.used', payload: { supplyId: DRINK, quantity: 1 } });
    expect(ActionBody.safeParse(actions[0]).success).toBe(true);
    expect(actions[1]).toEqual({ type: 'mismatch.resolved', payload: { mismatchId: 'm2', resolution: 'redone' } });
  });

  it('keeps resolved Mismatches in history', () => {
    expect(checked(inv).map((i) => [i.mismatch.id, i.how])).toEqual([['m4', 'Accepted']]);
  });
});

describe('possible duplicates', () => {
  it('finds other live Supplies with the same name', () => {
    const dupes = inventoryFrom({
      supplies: [supply('a', 'Milo'), supply('b', ' milo '), supply('c', 'Milo', { deletedAt: 'x' }), supply('d', 'Rice')],
    });
    expect(possibleDuplicates(dupes, 'a').map((d) => d.id)).toEqual(['b']);
    expect(possibleDuplicates(dupes, 'd')).toEqual([]);
  });
});
