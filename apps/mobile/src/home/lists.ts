import { type CalendarDate, daysBetween, DEFAULT_NEAR_EXPIRY_DAYS, isLowStock, isNearExpiry, shoppingAmount } from '@inventory/shared';
import { type BatchRow, type Inventory, type MismatchRow, onHand, type SupplyRow } from '../sync/inventory';

/**
 * What Home counts and lists (spec §6.1), worked out on the phone from the local view with the
 * shared rules, so it works away from home.
 */

export interface LowStockItem {
  supply: SupplyRow;
  onHand: number;
}

export interface NearExpiryItem {
  batch: BatchRow;
  supply: SupplyRow;
  locationName: string | null;
  /** Days until the expiry date; 0 is today, negative has already passed. */
  daysLeft: number;
}

export interface ShoppingItem {
  supply: SupplyRow;
  onHand: number;
  /** How many to buy to get back to the restock-to level. */
  amount: number;
}

const liveSupplies = (inv: Inventory) => Object.values(inv.supplies).filter((s) => !s.deletedAt);
const byName = (a: { supply: SupplyRow }, b: { supply: SupplyRow }) => a.supply.name.localeCompare(b.supply.name);

/** The household's Near-expiry window. */
export function householdNearExpiryDays(inv: Inventory): number {
  return inv.settings['1']?.nearExpiryDays ?? DEFAULT_NEAR_EXPIRY_DAYS;
}

export function lowStock(inv: Inventory): LowStockItem[] {
  return liveSupplies(inv)
    .map((supply) => ({ supply, onHand: onHand(inv, supply.id) }))
    .filter(({ supply, onHand }) => isLowStock(supply, onHand))
    .sort(byName);
}

/** Near-expiry Batches still on hand, soonest first. */
export function nearExpiry(inv: Inventory, today: CalendarDate): NearExpiryItem[] {
  const window = householdNearExpiryDays(inv);
  const items: NearExpiryItem[] = [];
  for (const batch of Object.values(inv.batches)) {
    const supply = inv.supplies[batch.supplyId];
    if (!supply || supply.deletedAt || batch.quantity <= 0 || !batch.expiry) continue;
    if (!isNearExpiry(batch.expiry, supply, today, window)) continue;
    const location = batch.locationId ? inv.locations[batch.locationId] : undefined;
    items.push({ batch, supply, locationName: location?.name ?? null, daysLeft: daysBetween(today, batch.expiry) });
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.supply.name.localeCompare(b.supply.name));
}

/** The Shopping list: Low stock Supplies with the amount to buy. */
export function shoppingList(inv: Inventory): ShoppingItem[] {
  return lowStock(inv)
    .map(({ supply, onHand }) => ({ supply, onHand, amount: shoppingAmount(supply, onHand) }))
    .filter((item) => item.amount > 0);
}

export function openMismatches(inv: Inventory): MismatchRow[] {
  return Object.values(inv.mismatches).filter((m) => !m.resolvedAt);
}

/** "today", "tomorrow", "in 3 days", "expired yesterday", "expired 4 days ago". */
export function expiresWhen(daysLeft: number): string {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === -1) return 'expired yesterday';
  return `expired ${-daysLeft} days ago`;
}

/** Today on this phone, as a calendar date. */
export function localToday(now = new Date()): CalendarDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Ticks on the Shopping list. They are this phone's own (the person holding it at the shop) and only
 * last while the Supply is still on the list: once it is bought and no longer Low stock, its tick goes.
 */
export function keepTicks(ticked: readonly string[], list: readonly ShoppingItem[]): string[] {
  const onList = new Set(list.map((i) => i.supply.id));
  return ticked.filter((id) => onList.has(id));
}
