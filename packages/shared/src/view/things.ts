import type { ActionBody } from '../actions.ts';
import type { AssetRow, BatchRow, Inventory, SupplyRow } from './inventory.ts';
import { onHand } from './inventory.ts';

/**
 * Assets, Locations, Categories and the forms that edit them (spec §3, §6.3, §13). Pure helpers;
 * the screens record what these return.
 */

/** "RM 2,899.00" from sen. */
export function ringgit(sen: number | null): string {
  if (sen === null) return '—';
  return `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Sen from what was typed ("2899", "2,899.50", "RM 85"); null when empty; undefined when not money. */
export function parseRinggit(text: string): number | null | undefined {
  const t = text.replace(/rm/i, '').replace(/,/g, '').trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

const live = <T extends { deletedAt: string | null }>(rows: Record<string, T>) => Object.values(rows).filter((r) => !r.deletedAt);

export const liveLocations = (inv: Inventory) => live(inv.locations).sort((a, b) => a.name.localeCompare(b.name));
export const liveCategories = (inv: Inventory) => live(inv.categories).sort((a, b) => a.name.localeCompare(b.name));

/** What a Location holds: Batches still on hand (with their Supply) and Assets still owned. */
export function locationContents(inv: Inventory, locationId: string) {
  const batches = Object.values(inv.batches)
    .filter((b) => b.locationId === locationId && b.quantity > 0)
    .map((batch) => ({ batch, supply: inv.supplies[batch.supplyId] }))
    .filter((x): x is { batch: BatchRow; supply: SupplyRow } => Boolean(x.supply && !x.supply.deletedAt));
  const assets = live(inv.assets).filter((a) => a.locationId === locationId && !a.disposedAt);
  /** "Count what's here": each Supply kept here once. */
  const supplies = [...new Map(batches.map((b) => [b.supply.id, b.supply])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return { batches, assets, supplies };
}

/** A Location can be deleted only when empty (spec §3). */
export function canDeleteLocation(inv: Inventory, locationId: string): boolean {
  const { batches, assets } = locationContents(inv, locationId);
  return batches.length === 0 && assets.length === 0;
}

/** A Category can be deleted only when no Supply or Asset uses it. */
export function canDeleteCategory(inv: Inventory, categoryId: string): boolean {
  return !live(inv.supplies).some((s) => s.categoryId === categoryId) && !live(inv.assets).some((a) => a.categoryId === categoryId);
}

/** Supplies, by name, with what's on hand; deleted ones hidden. */
export function supplyList(inv: Inventory, search = '') {
  const q = search.trim().toLowerCase();
  return live(inv.supplies)
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((supply) => ({ supply, onHand: onHand(inv, supply.id) }));
}

/** Assets, by name: owned ones first, then Disposed. Asset value isn't shown on the phone. */
export function assetList(inv: Inventory, search = '') {
  const q = search.trim().toLowerCase();
  return live(inv.assets)
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((a, b) => Number(Boolean(a.disposedAt)) - Number(Boolean(b.disposedAt)) || a.name.localeCompare(b.name));
}

export interface SupplyForm {
  name: string;
  unit: string;
  categoryId: string | null;
  usualLocationId: string | null;
  minimum: number | null;
  restockTo: number | null;
  expires: boolean;
  nearExpiryDays: number | null;
}

export interface AssetForm {
  name: string;
  categoryId: string | null;
  locationId: string | null;
  purchaseDate: string | null;
  priceSen: number | null;
  shop: string | null;
  serialNumber: string | null;
  warrantyEnd: string | null;
  notes: string | null;
}

export const supplyForm = (s?: SupplyRow): SupplyForm => ({
  name: s?.name ?? '',
  unit: s?.unit ?? 'pieces',
  categoryId: s?.categoryId ?? null,
  usualLocationId: s?.usualLocationId ?? null,
  minimum: s?.minimum ?? null,
  restockTo: s?.restockTo ?? null,
  expires: s?.expires ?? true,
  nearExpiryDays: s?.nearExpiryDays ?? null,
});

export const assetForm = (a?: AssetRow): AssetForm => ({
  name: a?.name ?? '',
  categoryId: a?.categoryId ?? null,
  locationId: a?.locationId ?? null,
  purchaseDate: a?.purchaseDate ?? null,
  priceSen: a?.priceSen ?? null,
  shop: a?.shop ?? null,
  serialNumber: a?.serialNumber ?? null,
  warrantyEnd: a?.warrantyEnd ?? null,
  notes: a?.notes ?? null,
});

/** Only the fields that changed: detail edits are last-writer-wins per field, so unchanged ones aren't sent. */
function changed<T extends object>(before: T, after: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(after).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k])),
  ) as Partial<T>;
}

const trimText = (s: string | null) => (s && s.trim() ? s.trim() : null);

/** The Action a Supply form records: created, edited with what changed, or nothing. */
export function saveSupply(existing: SupplyRow | undefined, form: SupplyForm, newId: () => string): ActionBody | null {
  const clean: SupplyForm = { ...form, name: form.name.trim(), unit: form.unit.trim() };
  if (!existing) return { type: 'supply.created', payload: { supplyId: newId(), ...clean } };
  const changes = changed(supplyForm(existing), clean);
  return Object.keys(changes).length ? { type: 'supply.edited', payload: { supplyId: existing.id, changes } } : null;
}

/** The Action an Asset form records. Photos are added separately. */
export function saveAsset(existing: AssetRow | undefined, form: AssetForm, newId: () => string): ActionBody | null {
  const clean: AssetForm = {
    ...form,
    name: form.name.trim(),
    shop: trimText(form.shop),
    serialNumber: trimText(form.serialNumber),
    notes: trimText(form.notes),
  };
  if (!existing) return { type: 'asset.created', payload: { assetId: newId(), ...clean, photoIds: [], receiptPhotoId: null } };
  const changes = changed(assetForm(existing), clean);
  return Object.keys(changes).length ? { type: 'asset.edited', payload: { assetId: existing.id, changes } } : null;
}

/** Problems that stop a form being saved, in the household's words. */
export function supplyProblems(form: SupplyForm): string[] {
  const out: string[] = [];
  if (!form.name.trim()) out.push('Give it a name.');
  if (!form.unit.trim()) out.push('Say what it’s counted in.');
  if (form.restockTo !== null && form.restockTo < 1) out.push('Restock-to must be at least 1.');
  return out;
}

export function assetProblems(form: AssetForm): string[] {
  return form.name.trim() ? [] : ['Give it a name.'];
}

/** Reasons offered when Disposing of an Asset; any other can be typed. */
export const DISPOSE_REASONS = ['Sold', 'Thrown away', 'Broken', 'Given away'];
