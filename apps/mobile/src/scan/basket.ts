import type { ActionBody, CalendarDate } from '@inventory/shared';
import type { Inventory } from '@inventory/shared';
import type { Scanned } from './identify';
import type { FoundProduct, Lookup } from './openFoodFacts';

/**
 * "I bought some": the shopping basket (spec §6.2). Each scan adds a line; scanning the same code
 * again adds that Barcode's units per scan. After "Done scanning", only the lines that need it get
 * questions, one per screen; then a review where the Location can change, and "Put away" records
 * the Actions. Pure: the screens keep a Basket in state and call these functions.
 */

export interface NewSupply {
  supplyId: string;
  name: string;
  unit: string;
  expires: boolean;
}

/** What the household says about a product Barcode it hasn't seen before. */
export interface NewProduct {
  productName: string | null;
  brand: string | null;
  packSize: string | null;
  /** Whether the details came from Open Food Facts. */
  fromOpenFoodFacts: boolean;
}

export interface Line {
  code: string;
  kind: 'known' | 'new' | 'weighed';
  scans: number;
  /** The Supply it adds to: one in the inventory, or one created in this basket. Null until answered. */
  supplyId: string | null;
  unitsPerScan: number;
  /** For new products: the Open Food Facts lookup, while it runs and after. */
  lookup: Lookup | 'pending' | null;
  product: NewProduct | null;
  /** True once the new-product or shop-weighed question is answered (always true for known ones). */
  identified: boolean;
  /** True once the expiry question is answered, or the Supply doesn't expire. */
  expiryAnswered: boolean;
  expiry: CalendarDate | null;
  /** Split: part of the line with a second expiry date, making a second Batch. */
  split: { quantity: number; expiry: CalendarDate | null } | null;
  /** Null: the Supply's usual Location. */
  locationId: string | null;
}

export interface Basket {
  lines: Line[];
  /** Supplies created in this basket, by id. */
  newSupplies: Record<string, NewSupply>;
  /** Locations created in this basket: id → name. */
  newLocations: Record<string, string>;
}

export const emptyBasket = (): Basket => ({ lines: [], newSupplies: {}, newLocations: {} });

export interface SupplyInfo {
  id: string;
  name: string;
  unit: string;
  expires: boolean;
  usualLocationId: string | null;
}

/** The Supply a line adds to, whether it is in the inventory or new in this basket. */
export function supplyOf(basket: Basket, inv: Inventory, supplyId: string | null): SupplyInfo | null {
  if (!supplyId) return null;
  const made = basket.newSupplies[supplyId];
  if (made) return { id: made.supplyId, name: made.name, unit: made.unit, expires: made.expires, usualLocationId: null };
  const s = inv.supplies[supplyId];
  return s ? { id: s.id, name: s.name, unit: s.unit, expires: s.expires, usualLocationId: s.usualLocationId } : null;
}

export const lineQuantity = (line: Line) => line.scans * line.unitsPerScan;

function replaceLine(basket: Basket, code: string, change: (line: Line) => Line): Basket {
  return { ...basket, lines: basket.lines.map((l) => (l.code === code ? change(l) : l)) };
}

/** Adds a scanned product to the basket. Returns the basket and a short message for the screen. */
export function addScan(basket: Basket, scanned: Scanned, inv: Inventory): { basket: Basket; message: string } {
  if (scanned.kind !== 'product' && scanned.kind !== 'new_product' && scanned.kind !== 'weighed') {
    return { basket, message: '' };
  }
  const existing = basket.lines.find((l) => l.code === scanned.code);
  if (existing) {
    const next = replaceLine(basket, scanned.code, (l) => ({ ...l, scans: l.scans + 1 }));
    const line = next.lines.find((l) => l.code === scanned.code)!;
    const supply = supplyOf(next, inv, line.supplyId);
    return {
      basket: next,
      message: supply ? `+${line.unitsPerScan} ${supply.name} (now ${lineQuantity(line)})` : `Scanned again (${line.scans} times)`,
    };
  }
  const base = { code: scanned.code, scans: 1, split: null, expiry: null, locationId: null, product: null };
  if (scanned.kind === 'product') {
    const line: Line = {
      ...base,
      kind: 'known',
      supplyId: scanned.supply.id,
      unitsPerScan: scanned.barcode.unitsPerScan,
      lookup: null,
      identified: true,
      expiryAnswered: !scanned.supply.expires,
    };
    return { basket: { ...basket, lines: [...basket.lines, line] }, message: `+${line.unitsPerScan} ${scanned.supply.unit} of ${scanned.supply.name}` };
  }
  const line: Line = {
    ...base,
    kind: scanned.kind === 'weighed' ? 'weighed' : 'new',
    supplyId: null,
    unitsPerScan: 1,
    lookup: scanned.kind === 'new_product' ? 'pending' : null,
    identified: false,
    expiryAnswered: false,
  };
  return {
    basket: { ...basket, lines: [...basket.lines, line] },
    message: scanned.kind === 'weighed' ? 'Shop-weighed item added' : 'New product added',
  };
}

/** Stores the Open Food Facts result on a new product's line. */
export function setLookup(basket: Basket, code: string, lookup: Lookup): Basket {
  return replaceLine(basket, code, (l) => ({ ...l, lookup }));
}

export function foundProduct(line: Line): FoundProduct | null {
  return line.lookup && line.lookup !== 'pending' && line.lookup.status === 'found' ? line.lookup.product : null;
}

export type Question = { code: string; kind: 'new_product' | 'weighed' | 'expiry' };

/** The next question after "Done scanning", or null when every line is ready for the review. */
export function nextQuestion(basket: Basket, inv: Inventory): Question | null {
  for (const line of basket.lines) {
    if (!line.identified) return { code: line.code, kind: line.kind === 'weighed' ? 'weighed' : 'new_product' };
    const supply = supplyOf(basket, inv, line.supplyId);
    if (supply?.expires && !line.expiryAnswered) return { code: line.code, kind: 'expiry' };
  }
  return null;
}

export type SupplyChoice = { supplyId: string } | { newSupply: Omit<NewSupply, 'supplyId'> & { supplyId: string } };

function chooseSupply(basket: Basket, choice: SupplyChoice): { basket: Basket; supplyId: string } {
  if ('supplyId' in choice) return { basket, supplyId: choice.supplyId };
  const made = choice.newSupply;
  return { basket: { ...basket, newSupplies: { ...basket.newSupplies, [made.supplyId]: made } }, supplyId: made.supplyId };
}

/** Answers the new-product question: the name on the pack, which Supply it is, and units per scan. */
export function answerNewProduct(
  basket: Basket,
  inv: Inventory,
  code: string,
  answer: { choice: SupplyChoice; product: NewProduct; unitsPerScan: number },
): Basket {
  const { basket: withSupply, supplyId } = chooseSupply(basket, answer.choice);
  const expires = supplyOf(withSupply, inv, supplyId)?.expires ?? false;
  return replaceLine(withSupply, code, (l) => ({
    ...l,
    supplyId,
    product: answer.product,
    unitsPerScan: Math.max(1, Math.floor(answer.unitsPerScan)),
    identified: true,
    expiryAnswered: !expires,
  }));
}

/** Answers the shop-weighed question: which Supply it is. Each scan adds 1 unit. */
export function answerWeighed(basket: Basket, inv: Inventory, code: string, choice: SupplyChoice): Basket {
  const { basket: withSupply, supplyId } = chooseSupply(basket, choice);
  const expires = supplyOf(withSupply, inv, supplyId)?.expires ?? false;
  return replaceLine(withSupply, code, (l) => ({ ...l, supplyId, identified: true, expiryAnswered: !expires }));
}

/**
 * Answers the expiry question. `expiry` null is "No date on the pack". A Split gives `quantity` of
 * the line a second date; it must leave at least one with the first date.
 */
export function answerExpiry(
  basket: Basket,
  code: string,
  expiry: CalendarDate | null,
  split: { quantity: number; expiry: CalendarDate | null } | null = null,
): Basket {
  return replaceLine(basket, code, (l) => {
    const total = lineQuantity(l);
    const validSplit = split && split.quantity >= 1 && split.quantity < total ? split : null;
    return { ...l, expiry, split: validSplit, expiryAnswered: true };
  });
}

export function setLocation(basket: Basket, code: string, locationId: string): Basket {
  return replaceLine(basket, code, (l) => ({ ...l, locationId }));
}

export function addLocation(basket: Basket, locationId: string, name: string): Basket {
  return { ...basket, newLocations: { ...basket.newLocations, [locationId]: name } };
}

/** Changes how many times a line was scanned (from the review). A Split is kept only while it still fits. */
export function setScans(basket: Basket, code: string, scans: number): Basket {
  return replaceLine(basket, code, (l) => {
    const next = { ...l, scans: Math.max(1, Math.floor(scans)) };
    if (next.split && next.split.quantity >= lineQuantity(next)) next.split = null;
    return next;
  });
}

export function removeLine(basket: Basket, code: string): Basket {
  return { ...basket, lines: basket.lines.filter((l) => l.code !== code) };
}

/** Where a line goes: the chosen Location, else the Supply's usual one; null when neither is set. */
export function lineLocation(basket: Basket, inv: Inventory, line: Line): string | null {
  return line.locationId ?? supplyOf(basket, inv, line.supplyId)?.usualLocationId ?? null;
}

/** Lines that can't be put away yet, and why. */
export interface LineProblem {
  code: string;
  problem: 'questions' | 'location';
}

export function problems(basket: Basket, inv: Inventory): LineProblem[] {
  return basket.lines.flatMap((line): LineProblem[] => {
    if (!line.identified || !line.expiryAnswered) return [{ code: line.code, problem: 'questions' }];
    if (!lineLocation(basket, inv, line)) return [{ code: line.code, problem: 'location' }];
    return [];
  });
}

/**
 * Put away: the Actions the basket records, in order. New Locations, then new Supplies (usually kept
 * where their first line goes), then new Barcodes, then one Batch per line, or two for a Split.
 */
export function putAway(basket: Basket, inv: Inventory, newId: () => string): ActionBody[] {
  if (problems(basket, inv).length) throw new Error('Some lines still need answers.');
  const actions: ActionBody[] = [];
  const usedLocations = new Set(basket.lines.map((l) => lineLocation(basket, inv, l)!));
  for (const [locationId, name] of Object.entries(basket.newLocations)) {
    if (usedLocations.has(locationId)) actions.push({ type: 'location.created', payload: { locationId, name } });
  }
  const created = new Set<string>();
  for (const line of basket.lines) {
    const made = basket.newSupplies[line.supplyId!];
    if (made && !created.has(made.supplyId)) {
      created.add(made.supplyId);
      actions.push({
        type: 'supply.created',
        payload: {
          supplyId: made.supplyId,
          name: made.name,
          unit: made.unit,
          categoryId: null,
          usualLocationId: lineLocation(basket, inv, line),
          minimum: null,
          restockTo: null,
          expires: made.expires,
          nearExpiryDays: null,
        },
      });
    }
  }
  for (const line of basket.lines) {
    if (line.kind !== 'new' || !line.product) continue;
    actions.push({
      type: 'barcode.attached',
      payload: {
        code: line.code,
        supplyId: line.supplyId!,
        brand: line.product.brand,
        productName: line.product.productName,
        packSize: line.product.packSize,
        photoId: null,
        unitsPerScan: line.unitsPerScan,
        source: line.product.fromOpenFoodFacts ? 'open_food_facts' : 'household',
      },
    });
  }
  for (const line of basket.lines) {
    const locationId = lineLocation(basket, inv, line)!;
    const total = lineQuantity(line);
    const splitQuantity = line.split?.quantity ?? 0;
    const batch = (quantity: number, expiry: CalendarDate | null): ActionBody => ({
      type: 'batch.added',
      payload: { batchId: newId(), supplyId: line.supplyId!, quantity, expiry, locationId },
    });
    actions.push(batch(total - splitQuantity, line.expiry));
    if (line.split) actions.push(batch(splitQuantity, line.split.expiry));
  }
  return actions;
}
