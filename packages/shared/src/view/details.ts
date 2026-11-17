import type { CalendarDate } from '../dates.ts';
import { isLowStock, isNearExpiry, sortOldestFirst } from '../rules.ts';
import { householdNearExpiryDays } from './lists.ts';
import { type BarcodeRow, type BatchRow, type Inventory, onHand, type SupplyRow } from './inventory.ts';

/** The Supply page (spec §6.3): amount on hand, its Batches, its Barcodes, minimum and restock-to. */
export interface SupplyDetails {
  supply: SupplyRow;
  onHand: number;
  lowStock: boolean;
  usualLocationName: string | null;
  /** Batches still on hand, oldest first (the order they are used in). */
  batches: { batch: BatchRow; locationName: string | null; nearExpiry: boolean }[];
  barcodes: BarcodeRow[];
}

const locationName = (inv: Inventory, id: string | null) => (id ? (inv.locations[id]?.name ?? null) : null);

const liveBatches = (inv: Inventory, supplyId: string) =>
  sortOldestFirst(Object.values(inv.batches).filter((b) => b.supplyId === supplyId && b.quantity > 0));

export function supplyDetails(inv: Inventory, supplyId: string, today: CalendarDate): SupplyDetails | null {
  const supply = inv.supplies[supplyId];
  if (!supply) return null;
  const amount = onHand(inv, supplyId);
  const window = householdNearExpiryDays(inv);
  return {
    supply,
    onHand: amount,
    lowStock: isLowStock(supply, amount),
    usualLocationName: locationName(inv, supply.usualLocationId),
    batches: liveBatches(inv, supplyId).map((batch) => ({
      batch,
      locationName: locationName(inv, batch.locationId),
      nearExpiry: isNearExpiry(batch.expiry, supply, today, window),
    })),
    barcodes: Object.values(inv.barcodes)
      .filter((b) => b.supplyId === supplyId)
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

/** What "I used some" shows before Save (spec §6.2): the oldest Batch goes first, and what's left. */
export interface UsePreview {
  onHand: number;
  /** The Batch used first, or null when none is on hand. */
  oldest: { quantity: number; expiry: CalendarDate | null; locationName: string | null } | null;
  /** On hand after this; never below zero. */
  left: number;
  /** How many more than recorded are being used; the home server will flag it to check. */
  short: number;
  willBeLowStock: boolean;
}

export function previewUse(inv: Inventory, supplyId: string, quantity: number): UsePreview | null {
  const supply = inv.supplies[supplyId];
  if (!supply) return null;
  const amount = onHand(inv, supplyId);
  const first = liveBatches(inv, supplyId)[0];
  const left = Math.max(0, amount - quantity);
  return {
    onHand: amount,
    oldest: first ? { quantity: first.quantity, expiry: first.expiry, locationName: locationName(inv, first.locationId) } : null,
    left,
    short: Math.max(0, quantity - amount),
    willBeLowStock: isLowStock(supply, left),
  };
}
