import { type CalendarDate, daysBetween } from './dates.ts';

/** The household's Near-expiry window when a Supply doesn't set its own. */
export const DEFAULT_NEAR_EXPIRY_DAYS = 7;

export interface StockLevels {
  /** At or below this amount the Supply is Low stock. No minimum: never Low stock. */
  minimum: number | null;
  /** The amount the Shopping list aims to get back to. */
  restockTo: number | null;
}

export interface ExpirySettings {
  /** False for Supplies that don't expire. */
  expires: boolean;
  /** Overrides the household window when set. */
  nearExpiryDays: number | null;
}

export interface BatchForOrdering {
  id: string;
  quantity: number;
  expiry: CalendarDate | null;
  /** When the Batch was added; breaks ties between Batches with the same expiry. */
  createdAt: string;
}

/** A Supply is Low stock when its amount on hand is at or below its minimum. */
export function isLowStock(supply: StockLevels, onHand: number): boolean {
  return supply.minimum !== null && onHand <= supply.minimum;
}

/** Days before expiry that a Batch counts as Near expiry, or null for Supplies that don't expire. */
export function nearExpiryWindow(supply: ExpirySettings, householdDays = DEFAULT_NEAR_EXPIRY_DAYS): number | null {
  if (!supply.expires) return null;
  return supply.nearExpiryDays ?? householdDays;
}

/**
 * A Batch is Near expiry when its expiry date falls within the window (already-expired Batches included).
 * Undated Batches and Supplies that don't expire are never Near expiry.
 */
export function isNearExpiry(
  expiry: CalendarDate | null,
  supply: ExpirySettings,
  today: CalendarDate,
  householdDays = DEFAULT_NEAR_EXPIRY_DAYS,
): boolean {
  const window = nearExpiryWindow(supply, householdDays);
  if (expiry === null || window === null) return false;
  return daysBetween(today, expiry) <= window;
}

/** Oldest first: earliest expiry first, undated Batches last, ties by when they were added. */
export function sortOldestFirst<B extends BatchForOrdering>(batches: readonly B[]): B[] {
  return [...batches].sort((a, b) => {
    if (a.expiry !== b.expiry) {
      if (a.expiry === null) return 1;
      if (b.expiry === null) return -1;
      return a.expiry < b.expiry ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export interface Taken {
  batchId: string;
  quantity: number;
}

/** Takes `quantity` from the oldest Batches first. `shortfall` is what couldn't be taken. */
export function takeOldestFirst(
  batches: readonly BatchForOrdering[],
  quantity: number,
): { taken: Taken[]; shortfall: number } {
  const taken: Taken[] = [];
  let left = quantity;
  for (const batch of sortOldestFirst(batches)) {
    if (left === 0) break;
    const n = Math.min(batch.quantity, left);
    if (n > 0) {
      taken.push({ batchId: batch.id, quantity: n });
      left -= n;
    }
  }
  return { taken, shortfall: left };
}

/**
 * How much of a Supply the Shopping list asks for: zero unless it is Low stock; otherwise
 * restock-to − on hand, or minimum + 1 − on hand without a restock-to. Never less than what
 * lifts it out of Low stock, so a restock-to set at or below the minimum still buys enough.
 */
export function shoppingAmount(supply: StockLevels, onHand: number): number {
  if (supply.minimum === null || !isLowStock(supply, onHand)) return 0;
  const leaveLowStock = supply.minimum + 1 - onHand;
  const toRestock = supply.restockTo === null ? leaveLowStock : supply.restockTo - onHand;
  return Math.max(toRestock, leaveLowStock);
}

export interface AssetForValue {
  /** Purchase price in sen (RM 1 = 100 sen); null when not recorded. */
  priceSen: number | null;
  disposedAt: CalendarDate | null;
  deletedAt: string | null;
}

/** Total Asset value in sen: purchase prices of Assets still owned (not Disposed, not deleted). */
export function totalAssetValueSen(assets: readonly AssetForValue[]): number {
  return assets.reduce(
    (sum, a) => (a.disposedAt === null && a.deletedAt === null ? sum + (a.priceSen ?? 0) : sum),
    0,
  );
}

/**
 * Shop-weighed codes (13 digits starting 02 or 20–29) carry a weight or price, not a product,
 * so they never identify a Supply.
 */
export function isShopWeighedCode(code: string): boolean {
  return /^(02|2\d)\d{11}$/.test(code);
}
