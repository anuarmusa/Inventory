import { describe, expect, it } from 'vitest';
import { ActionBody } from '../actions.ts';
import { type AssetRow, type BatchRow, inventoryFrom, type SupplyRow } from './inventory.ts';
import {
  assetForm,
  assetList,
  canDeleteCategory,
  canDeleteLocation,
  locationContents,
  parseRinggit,
  ringgit,
  saveAsset,
  saveSupply,
  supplyForm,
  supplyNameFrom,
  supplyProblems,
  unitProblem,
} from './things.ts';

const PANTRY = '22222222-2222-4222-8222-222222222222';
const GARAGE = '23232323-2323-4323-8323-232323232323';
const FOOD = '24242424-2424-4424-8424-242424242424';
const TOOLS = '25252525-2525-4525-8525-252525252525';
const RICE = '11111111-1111-4111-8111-111111111111';
const DRILL = '12121212-1212-4212-8212-121212121212';
const OLD_TV = '13131313-1313-4313-8313-131313131313';

const rice: SupplyRow = {
  id: RICE,
  name: 'Jasmine rice',
  unit: 'packs',
  categoryId: FOOD,
  usualLocationId: PANTRY,
  minimum: 1,
  restockTo: 3,
  expires: true,
  nearExpiryDays: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
};
const asset = (id: string, name: string, extra: Partial<AssetRow> = {}) =>
  ({ ...assetForm(), id, name, photoIds: [], receiptPhotoId: null, disposedAt: null, disposedReason: null, createdAt: '', updatedAt: '', deletedAt: null, ...extra }) as AssetRow;

const inv = inventoryFrom({
  locations: [
    { id: PANTRY, name: 'Pantry', createdAt: '', deletedAt: null },
    { id: GARAGE, name: 'Garage', createdAt: '', deletedAt: null },
  ],
  categories: [
    { id: FOOD, name: 'Food', createdAt: '', deletedAt: null },
    { id: TOOLS, name: 'Tools', createdAt: '', deletedAt: null },
  ],
  supplies: [rice],
  batches: [{ id: 'b1', supplyId: RICE, quantity: 2, expiry: null, locationId: PANTRY, createdAt: '' } as BatchRow],
  assets: [asset(DRILL, 'Cordless drill', { locationId: GARAGE }), asset(OLD_TV, 'Old TV', { locationId: GARAGE, disposedAt: '2026-01-01', disposedReason: 'Sold' })],
});

describe('Locations and Categories', () => {
  it('a Location holds its Batches on hand and the Assets still owned there', () => {
    const garage = locationContents(inv, GARAGE);
    expect(garage.assets.map((a) => a.name)).toEqual(['Cordless drill']);
    expect(locationContents(inv, PANTRY).supplies.map((s) => s.name)).toEqual(['Jasmine rice']);
  });

  it('can be deleted only when empty', () => {
    expect(canDeleteLocation(inv, PANTRY)).toBe(false);
    expect(canDeleteLocation(inv, GARAGE)).toBe(false);
    expect(canDeleteCategory(inv, FOOD)).toBe(false);
    expect(canDeleteCategory(inv, TOOLS)).toBe(true);
  });
});

describe('forms', () => {
  it('a new Supply records supply.created', () => {
    const body = saveSupply(undefined, { ...supplyForm(), name: ' Milo ', unit: 'tins' }, () => '99999999-9999-4999-8999-999999999999');
    expect(body).toMatchObject({ type: 'supply.created', payload: { name: 'Milo', unit: 'tins', expires: true } });
    expect(ActionBody.safeParse(body).success).toBe(true);
  });

  it('an edit records only what changed, and nothing when nothing did', () => {
    expect(saveSupply(rice, { ...supplyForm(rice), minimum: 2 }, () => 'x')).toEqual({
      type: 'supply.edited',
      payload: { supplyId: RICE, changes: { minimum: 2 } },
    });
    expect(saveSupply(rice, supplyForm(rice), () => 'x')).toBeNull();
  });

  it('a new Asset records asset.created with no photos yet', () => {
    const body = saveAsset(undefined, { ...assetForm(), name: 'Fridge', priceSen: 210000, shop: '  ' }, () => '98989898-9898-4898-8898-989898989898');
    expect(body).toMatchObject({ type: 'asset.created', payload: { name: 'Fridge', priceSen: 210000, shop: null, photoIds: [] } });
    expect(ActionBody.safeParse(body).success).toBe(true);
  });

  it('says what stops a Supply being saved', () => {
    expect(supplyProblems({ ...supplyForm(), name: '', unit: '' })).toEqual(['Give it a name.', 'Say what it’s counted in, like cans or packs.']);
  });

  it('refuses a number as the unit: prices and weights don’t go there', () => {
    expect(unitProblem('5.70')).toMatch(/not a number/);
    expect(unitProblem('RM 5')).toBeNull();
    expect(unitProblem('cans')).toBeNull();
    expect(supplyProblems({ ...supplyForm(), name: 'Mushroom soup', unit: '5.70' })).toHaveLength(1);
  });

  it('suggests a Supply name from the product name, without the pack size', () => {
    expect(supplyNameFrom('Campbell mushroom soup')).toBe('Campbell mushroom soup');
    expect(supplyNameFrom('Kuih bangkit 300g')).toBe('Kuih bangkit');
    expect(supplyNameFrom('Milo 1.5 kg tin')).toBe('Milo tin');
    expect(supplyNameFrom(null)).toBe('');
  });

  it('reads and shows ringgit', () => {
    expect(parseRinggit('2,899.50')).toBe(289950);
    expect(parseRinggit('RM 85')).toBe(8500);
    expect(parseRinggit('')).toBeNull();
    expect(parseRinggit('lots')).toBeUndefined();
    expect(ringgit(289950)).toBe('RM 2,899.50');
  });
});

it('lists owned Assets before Disposed ones', () => {
  expect(assetList(inv).map((a) => a.name)).toEqual(['Cordless drill', 'Old TV']);
});
