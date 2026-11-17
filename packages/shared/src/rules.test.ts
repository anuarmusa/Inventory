import { describe, expect, it } from 'vitest';
import { daysBetween } from './dates.ts';
import {
  isLowStock,
  isNearExpiry,
  isShopWeighedCode,
  nearExpiryWindow,
  shoppingAmount,
  sortOldestFirst,
  takeOldestFirst,
  totalAssetValueSen,
} from './rules.ts';

const TODAY = '2026-11-17';

describe('daysBetween', () => {
  it('counts calendar days across a month end', () => {
    expect(daysBetween('2026-11-28', '2026-12-02')).toBe(4);
    expect(daysBetween('2026-11-17', '2026-11-10')).toBe(-7);
  });
});

describe('Low stock', () => {
  it('is at or below the minimum', () => {
    expect(isLowStock({ minimum: 2, restockTo: 4 }, 3)).toBe(false);
    expect(isLowStock({ minimum: 2, restockTo: 4 }, 2)).toBe(true);
    expect(isLowStock({ minimum: 2, restockTo: 4 }, 0)).toBe(true);
  });

  it('never applies without a minimum', () => {
    expect(isLowStock({ minimum: null, restockTo: null }, 0)).toBe(false);
  });

  it('applies with a minimum of zero only when none are left', () => {
    expect(isLowStock({ minimum: 0, restockTo: 2 }, 1)).toBe(false);
    expect(isLowStock({ minimum: 0, restockTo: 2 }, 0)).toBe(true);
  });
});

describe('Near expiry', () => {
  const usual = { expires: true, nearExpiryDays: null };

  it('uses the 7-day household default', () => {
    expect(nearExpiryWindow(usual)).toBe(7);
    expect(isNearExpiry('2026-11-24', usual, TODAY)).toBe(true);
    expect(isNearExpiry('2026-11-25', usual, TODAY)).toBe(false);
  });

  it('includes Batches already past their date', () => {
    expect(isNearExpiry('2026-11-10', usual, TODAY)).toBe(true);
  });

  it('honours a per-Supply window', () => {
    const milk = { expires: true, nearExpiryDays: 2 };
    expect(isNearExpiry('2026-11-19', milk, TODAY)).toBe(true);
    expect(isNearExpiry('2026-11-20', milk, TODAY)).toBe(false);
  });

  it('honours a different household default', () => {
    expect(isNearExpiry('2026-11-30', usual, TODAY, 14)).toBe(true);
  });

  it("never applies to Supplies that don't expire, or to undated Batches", () => {
    expect(nearExpiryWindow({ expires: false, nearExpiryDays: 30 })).toBeNull();
    expect(isNearExpiry('2026-11-18', { expires: false, nearExpiryDays: null }, TODAY)).toBe(false);
    expect(isNearExpiry(null, usual, TODAY)).toBe(false);
  });
});

describe('oldest-Batch-first', () => {
  const batches = [
    { id: 'undated', quantity: 5, expiry: null, createdAt: '2026-11-01T00:00:00Z' },
    { id: 'march', quantity: 1, expiry: '2027-03-01', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'dec-later', quantity: 2, expiry: '2026-12-01', createdAt: '2026-11-05T00:00:00Z' },
    { id: 'dec-earlier', quantity: 1, expiry: '2026-12-01', createdAt: '2026-11-02T00:00:00Z' },
  ];

  it('orders by expiry, ties by when added, undated last', () => {
    expect(sortOldestFirst(batches).map((b) => b.id)).toEqual(['dec-earlier', 'dec-later', 'march', 'undated']);
  });

  it('takes from the oldest Batches first', () => {
    expect(takeOldestFirst(batches, 4)).toEqual({
      taken: [
        { batchId: 'dec-earlier', quantity: 1 },
        { batchId: 'dec-later', quantity: 2 },
        { batchId: 'march', quantity: 1 },
      ],
      shortfall: 0,
    });
  });

  it("reports a shortfall when there isn't enough", () => {
    expect(takeOldestFirst(batches, 12).shortfall).toBe(3);
  });

  it('skips empty Batches', () => {
    const empty = { id: 'empty', quantity: 0, expiry: '2026-11-20', createdAt: '2026-11-01T00:00:00Z' };
    expect(takeOldestFirst([empty, ...batches], 1).taken).toEqual([{ batchId: 'dec-earlier', quantity: 1 }]);
  });
});

describe('Shopping list amount', () => {
  it('is restock-to minus on hand', () => {
    expect(shoppingAmount({ minimum: 1, restockTo: 3 }, 1)).toBe(2);
    expect(shoppingAmount({ minimum: 6, restockTo: 20 }, 4)).toBe(16);
  });

  it('is minimum + 1 minus on hand without a restock-to', () => {
    expect(shoppingAmount({ minimum: 2, restockTo: null }, 1)).toBe(2);
    expect(shoppingAmount({ minimum: 2, restockTo: null }, 0)).toBe(3);
  });

  it("is zero when the Supply isn't Low stock", () => {
    expect(shoppingAmount({ minimum: 1, restockTo: 3 }, 2)).toBe(0);
    expect(shoppingAmount({ minimum: null, restockTo: 3 }, 0)).toBe(0);
  });

  it('still buys enough to leave Low stock when restock-to is set at or below the minimum', () => {
    expect(shoppingAmount({ minimum: 3, restockTo: 2 }, 3)).toBe(1);
  });
});

describe('total Asset value', () => {
  it('counts only Assets still owned', () => {
    expect(
      totalAssetValueSen([
        { priceSen: 289_900, disposedAt: null, deletedAt: null },
        { priceSen: 34_900, disposedAt: '2026-10-01', deletedAt: null },
        { priceSen: 10_000, disposedAt: null, deletedAt: '2026-11-01T00:00:00Z' },
        { priceSen: null, disposedAt: null, deletedAt: null },
      ]),
    ).toBe(289_900);
  });
});

describe('shop-weighed codes', () => {
  it('recognises 13-digit codes starting 02 or 20–29', () => {
    for (const code of ['0212345678901', '2012345678901', '2100345012504', '2912345678901']) {
      expect(isShopWeighedCode(code)).toBe(true);
    }
  });

  it('leaves ordinary product barcodes and malformed codes alone', () => {
    for (const code of ['9556001234561', '0312345678901', '3012345678901', '210034501250', '21003450125041', '21003450125a4']) {
      expect(isShopWeighedCode(code)).toBe(false);
    }
  });
});
