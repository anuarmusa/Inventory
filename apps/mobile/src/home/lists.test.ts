import { expiresWhen, keepTicks, localToday, lowStock, nearExpiry, openMismatches, shoppingList } from './lists';
import { type BatchRow, inventoryFrom, type MismatchRow, type SupplyRow } from '../sync/inventory';

const supply = (id: string, name: string, extra: Partial<SupplyRow> = {}): SupplyRow => ({
  id,
  name,
  unit: 'packs',
  categoryId: null,
  usualLocationId: 'pantry',
  minimum: null,
  restockTo: null,
  expires: true,
  nearExpiryDays: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...extra,
});
const batch = (id: string, supplyId: string, quantity: number, expiry: string | null): BatchRow => ({
  id,
  supplyId,
  quantity,
  expiry,
  locationId: 'pantry',
  createdAt: '2026-11-01T00:00:00.000Z',
});

const today = '2026-11-17';

function household() {
  return inventoryFrom({
    settings: [{ id: 1, nearExpiryDays: 7 }],
    locations: [{ id: 'pantry', name: 'Pantry', createdAt: '', deletedAt: null }],
    supplies: [
      supply('rice', 'Jasmine rice', { minimum: 2, restockTo: 5 }),
      supply('tp', 'Toilet paper', { minimum: 4, restockTo: null, expires: false }),
      supply('milo', 'Milo', { minimum: 1 }),
      supply('milk', 'Fresh milk', { nearExpiryDays: 2 }),
      supply('gone', 'Old thing', { minimum: 5, deletedAt: '2026-11-02T00:00:00.000Z' }),
    ],
    batches: [
      batch('r1', 'rice', 1, '2026-11-20'),
      batch('t1', 'tp', 4, null),
      batch('m1', 'milo', 3, '2027-03-10'),
      batch('k1', 'milk', 1, '2026-11-19'),
      batch('k2', 'milk', 1, '2026-11-25'),
      batch('k0', 'milk', 0, '2026-11-17'),
      batch('r0', 'rice', 2, '2026-11-15'),
    ],
  });
}

describe('Home lists', () => {
  it('Low stock: at or below the minimum, never deleted or without a minimum', () => {
    const items = lowStock(household());
    // Rice has 3 against a minimum of 2; Milo 3 against 1; the deleted Supply doesn't count.
    expect(items.map((i) => [i.supply.name, i.onHand])).toEqual([['Toilet paper', 4]]);
  });

  it('Near expiry: within the window (the Supply’s own when set), soonest first, expired included', () => {
    const items = nearExpiry(household(), today);
    expect(items.map((i) => [i.batch.id, i.daysLeft, i.locationName])).toEqual([
      ['r0', -2, 'Pantry'],
      ['k1', 2, 'Pantry'],
      ['r1', 3, 'Pantry'],
    ]);
  });

  it('Shopping list: Low stock with the amount to buy', () => {
    const inv = household();
    inv.batches.r0 = { ...inv.batches.r0!, quantity: 0 };
    expect(shoppingList(inv).map((i) => [i.supply.name, i.onHand, i.amount])).toEqual([
      ['Jasmine rice', 1, 4],
      ['Toilet paper', 4, 1],
    ]);
  });

  it('counts open Mismatches only', () => {
    const m = (id: string, resolvedAt: string | null) => ({ id, resolvedAt }) as MismatchRow;
    expect(openMismatches(inventoryFrom({ mismatches: [m('a', null), m('b', '2026-11-17T00:00:00Z')] }))).toHaveLength(1);
  });

  it('keeps ticks only for Supplies still on the Shopping list', () => {
    const inv = household();
    expect(keepTicks(['tp', 'rice'], shoppingList(inv))).toEqual(['tp']);
  });

  it('says when a Batch expires', () => {
    expect([0, 1, 5, -1, -4].map(expiresWhen)).toEqual(['today', 'tomorrow', 'in 5 days', 'expired yesterday', 'expired 4 days ago']);
  });

  it('uses the phone’s own calendar day', () => {
    expect(localToday(new Date(2026, 10, 7, 23, 30))).toBe('2026-11-07');
  });
});
