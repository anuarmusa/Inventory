import { Action, type ActionBody } from '@inventory/shared';
import { type BarcodeRow, inventoryFrom, type LabelRow, onHand, replay, type SupplyRow } from '@inventory/shared';
import {
  addLocation,
  addScan,
  answerExpiry,
  answerNewProduct,
  answerWeighed,
  type Basket,
  emptyBasket,
  lineQuantity,
  nextQuestion,
  problems,
  putAway,
  removeLine,
  setLocation,
  setLookup,
  setScans,
} from './basket';
import { addMonths, expiryChoices, formatDate, parseTypedDate } from '@inventory/shared';
import { identify } from './identify';

const PANTRY = '22222222-2222-4222-8222-222222222222';
const STORE = '23232323-2323-4323-8323-232323232323';
const RICE = '11111111-1111-4111-8111-111111111111';
const TP = '12121212-1212-4212-8212-121212121212';

const supply = (id: string, name: string, unit: string, expires: boolean): SupplyRow => ({
  id,
  name,
  unit,
  categoryId: null,
  usualLocationId: PANTRY,
  minimum: null,
  restockTo: null,
  expires,
  nearExpiryDays: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
});
const barcode = (code: string, supplyId: string, unitsPerScan: number) => ({ code, supplyId, unitsPerScan }) as BarcodeRow;

const inv = inventoryFrom({
  locations: [
    { id: PANTRY, name: 'Pantry', createdAt: '', deletedAt: null },
    { id: STORE, name: 'Store room', createdAt: '', deletedAt: null },
  ],
  supplies: [supply(RICE, 'Jasmine rice', 'packs', true), supply(TP, 'Toilet paper', 'rolls', false)],
  barcodes: [barcode('9556001234561', RICE, 1), barcode('9556003456789', TP, 10)],
  labels: [{ code: '7K2QX', assetId: 'tv', locationId: null, retiredAt: null, createdAt: '' } as LabelRow],
});

let ids = 0;
const newId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++ids).padStart(12, '0')}`;

function scan(basket: Basket, code: string) {
  return addScan(basket, identify(code, inv), inv);
}

describe('what a scan is', () => {
  it('knows the household’s Barcodes, new products, shop-weighed codes, Labels, and the rest', () => {
    expect(identify('9556001234561', inv)).toMatchObject({ kind: 'product', supply: { name: 'Jasmine rice' } });
    expect(identify('9556006789012', inv)).toEqual({ kind: 'new_product', code: '9556006789012' });
    expect(identify('2100345012504', inv)).toEqual({ kind: 'weighed', code: '2100345012504' });
    expect(identify('210034501250', inv).kind).toBe('weighed'); // UPC-A form
    expect(identify('INV1:7K2QX', inv)).toMatchObject({ kind: 'label', code: '7K2QX', label: { assetId: 'tv' } });
    expect(identify('INV1:AAAAA', inv)).toMatchObject({ kind: 'label', label: null });
    for (const text of ['WIFI:S:Jiran;T:WPA;P:x;;', 'https://example.com', 'INV1:nope', '1234']) {
      expect(identify(text, inv).kind).toBe('not_ours');
    }
  });
});

describe('the basket', () => {
  it('adds a line per scan, and a repeat scan adds that Barcode’s units per scan', () => {
    let b = scan(emptyBasket(), '9556003456789').basket;
    const again = scan(b, '9556003456789');
    b = again.basket;
    expect(again.message).toBe('+10 Toilet paper (now 20)');
    b = scan(b, '9556001234561').basket;
    expect(b.lines.map((l) => [l.code, lineQuantity(l)])).toEqual([
      ['9556003456789', 20],
      ['9556001234561', 1],
    ]);
  });

  it('asks only where needed: new product, shop-weighed, then expiry for Supplies that expire', () => {
    let b = emptyBasket();
    for (const code of ['9556003456789', '9556001234561', '9556006789012', '2100345012504']) b = scan(b, code).basket;

    expect(nextQuestion(b, inv)).toEqual({ code: '9556001234561', kind: 'expiry' });
    b = answerExpiry(b, '9556001234561', '2027-05-01');

    expect(nextQuestion(b, inv)).toEqual({ code: '9556006789012', kind: 'new_product' });
    b = answerNewProduct(b, inv, '9556006789012', {
      choice: { newSupply: { supplyId: newId(), name: 'Kuih bangkit', unit: 'tubs', expires: true } },
      product: { productName: 'Kuih bangkit 300g', brand: null, packSize: '300 g', fromOpenFoodFacts: false },
      unitsPerScan: 1,
    });
    expect(nextQuestion(b, inv)).toEqual({ code: '9556006789012', kind: 'expiry' });
    b = answerExpiry(b, '9556006789012', null);

    expect(nextQuestion(b, inv)).toEqual({ code: '2100345012504', kind: 'weighed' });
    b = answerWeighed(b, inv, '2100345012504', { supplyId: TP });
    expect(nextQuestion(b, inv)).toBeNull();
  });

  it('puts away: records new Supplies, new Barcodes and one Batch per line, at the usual Location', () => {
    let b = scan(emptyBasket(), '9556001234561').basket;
    b = scan(b, '9556001234561').basket;
    b = scan(b, '9556009999999').basket;
    b = setLookup(b, '9556009999999', { status: 'found', product: { productName: 'Lime refill', brand: 'Kilat', packSize: '900 ml' } });
    const dish = newId();
    b = answerNewProduct(b, inv, '9556009999999', {
      choice: { newSupply: { supplyId: dish, name: 'Dishwashing liquid', unit: 'bottles', expires: false } },
      product: { productName: 'Lime refill', brand: 'Kilat', packSize: '900 ml', fromOpenFoodFacts: true },
      unitsPerScan: 2,
    });
    b = answerExpiry(b, '9556001234561', '2027-05-01');
    expect(problems(b, inv)).toEqual([{ code: '9556009999999', problem: 'location' }]);
    b = setLocation(b, '9556009999999', STORE);

    const actions = putAway(b, inv, newId);
    expect(actions.map((a) => a.type)).toEqual(['supply.created', 'barcode.attached', 'batch.added', 'batch.added']);
    expect(actions[0]!.payload).toMatchObject({ supplyId: dish, name: 'Dishwashing liquid', usualLocationId: STORE, expires: false });
    expect(actions[1]!.payload).toMatchObject({ code: '9556009999999', supplyId: dish, source: 'open_food_facts', unitsPerScan: 2, brand: 'Kilat' });
    expect(actions[2]!.payload).toMatchObject({ supplyId: RICE, quantity: 2, expiry: '2027-05-01', locationId: PANTRY });
    expect(actions[3]!.payload).toMatchObject({ supplyId: dish, quantity: 2, expiry: null, locationId: STORE });
  });

  it('Split gives part of a line a second date, making two Batches', () => {
    let b = emptyBasket();
    for (let i = 0; i < 5; i++) b = scan(b, '9556001234561').basket;
    b = answerExpiry(b, '9556001234561', '2027-01-01', { quantity: 2, expiry: '2027-06-01' });
    const batches = putAway(b, inv, newId).map((a) => a.payload);
    expect(batches).toEqual([
      expect.objectContaining({ quantity: 3, expiry: '2027-01-01' }),
      expect.objectContaining({ quantity: 2, expiry: '2027-06-01' }),
    ]);
  });

  it('ignores a Split that would take the whole line', () => {
    let b = scan(emptyBasket(), '9556001234561').basket;
    b = answerExpiry(b, '9556001234561', '2027-01-01', { quantity: 1, expiry: '2027-06-01' });
    expect(b.lines[0]!.split).toBeNull();
  });

  it('can change the Location to a new one, recorded first', () => {
    let b = scan(emptyBasket(), '9556003456789').basket;
    const garage = newId();
    b = addLocation(b, garage, 'Garage');
    b = setLocation(b, '9556003456789', garage);
    const actions = putAway(b, inv, newId);
    expect(actions[0]).toEqual({ type: 'location.created', payload: { locationId: garage, name: 'Garage' } });
    expect(actions[1]!.payload).toMatchObject({ locationId: garage });
  });

  it('lets the review change how many and remove lines', () => {
    let b = scan(emptyBasket(), '9556001234561').basket;
    b = scan(b, '9556003456789').basket;
    b = setScans(b, '9556003456789', 3);
    expect(lineQuantity(b.lines[1]!)).toBe(30);
    b = removeLine(b, '9556001234561');
    expect(b.lines.map((l) => l.code)).toEqual(['9556003456789']);
  });

  it('records valid Actions that show up in the local view', () => {
    let b = scan(emptyBasket(), '9556003456789').basket;
    b = scan(b, '9556003456789').basket;
    const recorded = putAway(b, inv, newId).map(
      (body: ActionBody) => Action.parse({ id: newId(), deviceId: '33333333-3333-4333-8333-333333333333', deviceTime: '2026-11-17T09:00:00.000Z', v: 1, ...body }),
    );
    expect(onHand(replay(inv, recorded), TP)).toBe(20);
  });
});

describe('dates on the expiry screen', () => {
  it('reads typed dates, day first', () => {
    expect(parseTypedDate('31/12/2026')).toBe('2026-12-31');
    expect(parseTypedDate('1-3-27')).toBe('2027-03-01');
    expect(parseTypedDate('31/02/2026')).toBeNull();
    expect(parseTypedDate('soon')).toBeNull();
  });

  it('offers quick picks and shows dates plainly', () => {
    expect(expiryChoices('2026-11-17').map((c) => c.date)).toEqual(['2026-11-24', '2026-12-17', '2027-02-17', '2027-05-17', '2027-11-17']);
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(formatDate('2027-03-10')).toBe('10 Mar 2027');
    expect(formatDate(null)).toBe('No date');
  });
});
