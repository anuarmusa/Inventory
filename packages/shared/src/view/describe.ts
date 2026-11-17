import type { Action } from '../actions.ts';
import type { Inventory } from './inventory.ts';

const plural = (n: number, unit: string) => `${n} ${unit}`;

/** One line describing an Action, in the household's words. */
export function describeAction(action: Action, inv: Inventory): string {
  const supply = (id: string) => inv.supplies[id]?.name ?? 'a Supply';
  const unitOf = (id: string) => inv.supplies[id]?.unit ?? 'units';
  const location = (id: string | null) => (id && inv.locations[id]?.name) || 'a Location';
  const asset = (id: string) => inv.assets[id]?.name ?? 'an Asset';
  switch (action.type) {
    case 'supply.used':
      return `Used ${plural(action.payload.quantity, unitOf(action.payload.supplyId))} of ${supply(action.payload.supplyId)}`;
    case 'supply.counted':
      return `Counted ${supply(action.payload.supplyId)}: ${plural(action.payload.quantity, unitOf(action.payload.supplyId))}`;
    case 'batch.added':
      return `Added ${plural(action.payload.quantity, unitOf(action.payload.supplyId))} of ${supply(action.payload.supplyId)}`;
    case 'batch.discarded': {
      const batch = inv.batches[action.payload.batchId];
      return `Threw away ${action.payload.quantity} of ${batch ? supply(batch.supplyId) : 'a Batch'}`;
    }
    case 'batch.moved':
      return `Moved a Batch to ${location(action.payload.toLocationId)}`;
    case 'supply.created':
      return `New Supply: ${action.payload.name}`;
    case 'supply.edited':
      return `Edited ${supply(action.payload.supplyId)}`;
    case 'supply.deleted':
      return `Deleted ${supply(action.payload.supplyId)}`;
    case 'supply.merged':
      return `Merged ${supply(action.payload.fromSupplyId)} into ${supply(action.payload.intoSupplyId)}`;
    case 'barcode.attached':
      return `Barcode ${action.payload.code} → ${supply(action.payload.supplyId)}`;
    case 'barcode.moved':
      return `Moved barcode ${action.payload.code} to ${supply(action.payload.toSupplyId)}`;
    case 'asset.created':
      return `New Asset: ${action.payload.name}`;
    case 'asset.edited':
      return `Edited ${asset(action.payload.assetId)}`;
    case 'asset.deleted':
      return `Deleted ${asset(action.payload.assetId)}`;
    case 'asset.moved':
      return `Moved ${asset(action.payload.assetId)} to ${location(action.payload.toLocationId)}`;
    case 'asset.disposed':
      return `Disposed of ${asset(action.payload.assetId)}`;
    case 'maintenance.added':
      return `Maintenance on ${asset(action.payload.assetId)}: ${action.payload.note}`;
    case 'category.created':
      return `New Category: ${action.payload.name}`;
    case 'category.renamed':
      return `Renamed a Category to ${action.payload.name}`;
    case 'category.deleted':
      return 'Deleted a Category';
    case 'location.created':
      return `New Location: ${action.payload.name}`;
    case 'location.renamed':
      return `Renamed a Location to ${action.payload.name}`;
    case 'location.deleted':
      return `Deleted ${location(action.payload.locationId)}`;
    case 'label.attached':
      return `Label ${action.payload.code} attached`;
    case 'label.replaced':
      return `Label ${action.payload.oldCode} replaced by ${action.payload.newCode}`;
    case 'label.retired':
      return `Label ${action.payload.code} retired`;
    case 'mismatch.resolved':
      return 'Checked a Mismatch';
    case 'action.undone':
      return 'Undo';
    case 'action.corrected':
      return 'Correction';
  }
}
