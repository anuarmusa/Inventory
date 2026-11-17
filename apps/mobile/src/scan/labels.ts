import type { ActionBody } from '@inventory/shared';
import type { Inventory } from '../sync/inventory';

/**
 * Labels in the app (spec §6.4, §10.3). A Label's QR is `INV1:<code>`. A code linked to an Asset or
 * Location opens it from anywhere, even mid-basket. A code linked to nothing, or one the household
 * hasn't seen (a Blank label from a printed sheet), offers to attach it. A retired code was replaced.
 */
export type LabelOpens =
  | { kind: 'asset'; assetId: string }
  | { kind: 'location'; locationId: string }
  | { kind: 'blank' }
  | { kind: 'retired' };

export function whatLabelOpens(inv: Inventory, code: string): LabelOpens {
  const label = inv.labels[code];
  if (label?.retiredAt) return { kind: 'retired' };
  if (label?.assetId) return { kind: 'asset', assetId: label.assetId };
  if (label?.locationId) return { kind: 'location', locationId: label.locationId };
  return { kind: 'blank' };
}

export const RETIRED_MESSAGE = 'This Label was replaced. Use the new Label on this thing.';

/** Attaches a Blank label to an Asset or Location. Works offline: it is an Action like any other. */
export function attachLabel(code: string, target: { assetId: string } | { locationId: string }): ActionBody {
  return {
    type: 'label.attached',
    payload: { code, target: 'assetId' in target ? { kind: 'asset', assetId: target.assetId } : { kind: 'location', locationId: target.locationId } },
  };
}

/** The current Label on an Asset or Location, or null: "No Label yet". */
export function labelOf(inv: Inventory, target: { assetId: string } | { locationId: string }): string | null {
  const found = Object.values(inv.labels).find(
    (l) => !l.retiredAt && ('assetId' in target ? l.assetId === target.assetId : l.locationId === target.locationId),
  );
  return found?.code ?? null;
}
