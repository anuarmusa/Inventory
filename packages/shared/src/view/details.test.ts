import { describe, expect, it } from 'vitest';
import { type BarcodeRow, type BatchRow, inventoryFrom, type SupplyRow } from './inventory.ts';
import { supplyDetails, previewUse } from './details.ts';

const RICE = 'rice';
const supply: SupplyRow = {
  id: RICE,
  name: 'Jasmine rice',
  unit: 'packs',
  categoryId: null,
  usualLocationId: 'pantry',
  minimum: 1,
  restockTo: 4,
  expires: true,
  nearExpiryDays: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
};
const batch = (id: string, quantity: number, expiry: string | null, locationId = 'pantry'): BatchRow => ({
  id,
  supplyId: RICE,
  quantity,
  expiry,
  locationId,
  createdAt: '2026-11-01T00:00:00.000Z',
});

const inv = inventoryFrom({
  locations: [
    { id: 'pantry', name: 'Pantry', createdAt: '', deletedAt: null },
    { id: 'store', name: 'Store room', createdAt: '', deletedAt: null },
  ],
  supplies: [supply],
  batches: [batch('late', 2, '2027-05-01', 'store'), batch('none', 1, null), batch('soon', 1, '2026-11-20'), batch('empty', 0, '2026-11-18')],
  barcodes: [{ code: '9556001234561', supplyId: RICE, productName: 'Beras Wangi 5kg', unitsPerScan: 1 } as BarcodeRow],
});

describe('the Supply page', () => {
  it('shows on hand, Batches oldest first with Location and Near expiry, Barcodes, minimum and restock-to', () => {
    const d = supplyDetails(inv, RICE, '2026-11-17')!;
    expect(d).toMatchObject({ onHand: 4, lowStock: false, usualLocationName: 'Pantry' });
    expect(d.supply).toMatchObject({ minimum: 1, restockTo: 4 });
    expect(d.batches.map((b) => [b.batch.id, b.locationName, b.nearExpiry])).toEqual([
      ['soon', 'Pantry', true],
      ['late', 'Store room', false],
      ['none', 'Pantry', false],
    ]);
    expect(d.barcodes.map((b) => b.productName)).toEqual(['Beras Wangi 5kg']);
  });

  it('is null for a Supply it doesn’t know', () => {
    expect(supplyDetails(inv, 'nope', '2026-11-17')).toBeNull();
  });
});

describe('"I used some"', () => {
  it('shows the oldest Batch goes first and what is left', () => {
    expect(previewUse(inv, RICE, 1)).toEqual({
      onHand: 4,
      oldest: { quantity: 1, expiry: '2026-11-20', locationName: 'Pantry' },
      left: 3,
      short: 0,
      willBeLowStock: false,
    });
  });

  it('warns when it will be Low stock, or more than recorded is used', () => {
    expect(previewUse(inv, RICE, 3)).toMatchObject({ left: 1, willBeLowStock: true, short: 0 });
    expect(previewUse(inv, RICE, 6)).toMatchObject({ left: 0, short: 2 });
  });
});
