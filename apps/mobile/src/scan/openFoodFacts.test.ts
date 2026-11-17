import { createLookup } from './openFoodFacts';

function respond(status: number, body: unknown) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & jest.Mock;
}

describe('Open Food Facts lookup', () => {
  it('finds a product and keeps only what the app needs', async () => {
    const fetchImpl = respond(200, { status: 1, product: { product_name: 'Lime refill', brands: 'Kilat, Kilat Group', quantity: '900 ml' } });
    const lookup = createLookup(fetchImpl, { appVersion: '0.1.0' });
    expect(await lookup('9556005678901')).toEqual({
      status: 'found',
      product: { productName: 'Lime refill', brand: 'Kilat', packSize: '900 ml' },
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://world.openfoodfacts.org/api/v2/product/9556005678901.json?fields=product_name,brands,quantity');
    expect(init.headers['User-Agent']).toBe('HouseholdInventory/0.1.0 (Android app)');
  });

  it('says when a product isn’t there', async () => {
    expect(await createLookup(respond(404, { status: 0 }))('1')).toEqual({ status: 'not_found' });
    expect(await createLookup(respond(200, { status: 0 }))('1')).toEqual({ status: 'not_found' });
  });

  it('reports offline when it can’t reach Open Food Facts', async () => {
    const failing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await createLookup(failing)('1')).toEqual({ status: 'offline' });
  });

  it('looks each code up once', async () => {
    const fetchImpl = respond(404, {});
    const lookup = createLookup(fetchImpl);
    await lookup('1');
    await lookup('1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stays within 15 lookups a minute', async () => {
    let t = 0;
    const fetchImpl = respond(404, {});
    const lookup = createLookup(fetchImpl, { now: () => t });
    for (let i = 0; i < 15; i++) await lookup(`code-${i}`);
    expect(await lookup('one-too-many')).toEqual({ status: 'offline' });
    t = 61_000;
    expect(await lookup('later')).toEqual({ status: 'not_found' });
    expect(fetchImpl).toHaveBeenCalledTimes(16);
  });
});
