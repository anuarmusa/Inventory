import { isShopWeighedCode, LabelCode } from '@inventory/shared';
import type { BarcodeRow, Inventory, LabelRow, SupplyRow } from '../sync/inventory';

/**
 * What a scan is (spec §6.2): one of the household's product Barcodes, a product the household
 * hasn't seen, a shop-weighed code, one of our Labels, or something else.
 */
export type Scanned =
  | { kind: 'product'; code: string; barcode: BarcodeRow; supply: SupplyRow }
  | { kind: 'new_product'; code: string }
  | { kind: 'weighed'; code: string }
  | { kind: 'label'; code: string; label: LabelRow | null }
  | { kind: 'not_ours'; text: string };

/** Our Labels' QR content: `INV1:<5-character Label code>` (spec §10.3). */
const LABEL_PREFIX = 'INV1:';

export function identify(text: string, inv: Inventory): Scanned {
  const raw = text.trim();
  if (raw.startsWith(LABEL_PREFIX)) {
    const code = raw.slice(LABEL_PREFIX.length).toUpperCase();
    if (LabelCode.safeParse(code).success) return { kind: 'label', code, label: inv.labels[code] ?? null };
    return { kind: 'not_ours', text: raw };
  }
  if (!/^\d{8,14}$/.test(raw)) return { kind: 'not_ours', text: raw };
  // A UPC-A code (12 digits) is an EAN-13 with a leading 0.
  if (isShopWeighedCode(raw.length === 12 ? `0${raw}` : raw)) return { kind: 'weighed', code: raw };
  const barcode = inv.barcodes[raw];
  const supply = barcode ? inv.supplies[barcode.supplyId] : undefined;
  if (barcode && supply && !supply.deletedAt) return { kind: 'product', code: raw, barcode, supply };
  return { kind: 'new_product', code: raw };
}

/** What to tell the person when a scan isn't ours. */
export const NOT_OURS = 'That’s not a product barcode or one of our Labels.';
