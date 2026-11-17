/**
 * Looks up an unknown Barcode on Open Food Facts, directly from the phone (spec §8): no API key,
 * at most 15 lookups a minute. Away from the internet it simply reports `offline` and the details
 * are typed in by hand.
 */

export const OFF_ATTRIBUTION = 'Product data © Open Food Facts contributors (ODbL)';

export interface FoundProduct {
  productName: string | null;
  brand: string | null;
  packSize: string | null;
}

export type Lookup = { status: 'found'; product: FoundProduct } | { status: 'not_found' } | { status: 'offline' };

const LIMIT_PER_MINUTE = 15;
const TIMEOUT_MS = 5_000;

const clean = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

export function createLookup(
  fetchImpl: typeof fetch = fetch,
  { appVersion = '0.0.0', now = () => Date.now(), timeoutMs = TIMEOUT_MS } = {},
) {
  const recent: number[] = [];
  const cache = new Map<string, Lookup>();

  return async function lookup(code: string): Promise<Lookup> {
    const known = cache.get(code);
    if (known) return known;
    const t = now();
    while (recent.length && t - recent[0]! > 60_000) recent.shift();
    // Over the allowed rate: type it in, as when offline.
    if (recent.length >= LIMIT_PER_MINUTE) return { status: 'offline' };
    recent.push(t);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity`,
        { headers: { 'User-Agent': `HouseholdInventory/${appVersion} (Android app)` }, signal: controller.signal },
      );
      if (res.status === 404) return remember(code, { status: 'not_found' });
      if (!res.ok) return { status: 'offline' };
      const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      if (body.status !== 1 || !body.product) return remember(code, { status: 'not_found' });
      const product: FoundProduct = {
        productName: clean(body.product.product_name),
        brand: clean(String(body.product.brands ?? '').split(',')[0]),
        packSize: clean(body.product.quantity),
      };
      if (!product.productName && !product.brand) return remember(code, { status: 'not_found' });
      return remember(code, { status: 'found', product });
    } catch {
      return { status: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  };

  function remember(code: string, result: Lookup): Lookup {
    cache.set(code, result);
    return result;
  }
}
