import { ApiError, createApi } from './client';

function respond(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe('api client', () => {
  it('returns the body on success', async () => {
    const api = createApi(respond(200, { seq: 42 }));
    await expect(api.pull('http://192.168.1.10', 'key', 0)).resolves.toEqual({ seq: 42 });
  });

  it('reports the app version on every sync request', async () => {
    const seen: (Record<string, string> | undefined)[] = [];
    const record = (async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ seq: 1, app: { latest: null, minimum: '0.1.0' }, results: [] }), { status: 200 });
    }) as typeof fetch;
    const api = createApi(record, undefined, '1.3.2');
    await api.pull('http://192.168.1.10', 'key', 0);
    await api.push('http://192.168.1.10', 'key', { deviceNow: '2026-11-17T09:00:00Z', appVersion: '1.3.2', actions: [] });
    expect(seen.map((h) => h?.['x-app-version'])).toEqual(['1.3.2', '1.3.2']);
  });

  it('turns server refusals into reasons the screens can explain', async () => {
    const api = createApi(respond(401, { error: 'device_removed', message: 'removed' }));
    await expect(api.pull('http://192.168.1.10', 'key', 0)).rejects.toMatchObject({ reason: 'device_removed' });
  });

  it('treats no answer as not being at home', async () => {
    const api = createApi((async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch);
    const error = await api.pull('http://192.168.1.10', 'key', 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).reason).toBe('unreachable');
  });

  it('gives up after the timeout', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    await expect(createApi(hang, 20).pull('http://192.168.1.10', 'key', 0)).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('labels unexpected failures as server errors', async () => {
    const api = createApi(respond(500, { nope: true }));
    await expect(api.redeem('http://x', { code: '123456', name: 'a', model: null, previousKey: null })).rejects.toMatchObject({
      reason: 'server_error',
    });
  });
});
