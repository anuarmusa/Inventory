import type { RedeemRequest } from '@inventory/shared';
import { ApiError, type Api } from '../api/client';
import { checkIn, connect, finishFirstSync, KEYS, loadSession, type SessionStore, suggestedName } from './session';

function memoryStore(initial: Record<string, string> = {}): SessionStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    delete: async (k) => {
      delete data[k];
    },
  };
}

interface FakeServer extends Api {
  redeemed: RedeemRequest[];
  pulls: { key: string; since: number }[];
  pullError?: ApiError | Error;
  redeemError?: ApiError;
}

function fakeServer(): FakeServer {
  let keys = 0;
  const server: FakeServer = {
    redeemed: [],
    pulls: [],
    async redeem(_server, body) {
      if (server.redeemError) throw server.redeemError;
      server.redeemed.push(body);
      keys += 1;
      return { deviceId: body.previousKey ? 'device-1' : `device-${keys}`, deviceKey: `key-${keys}`, name: body.name };
    },
    async pull(_server, key, since) {
      if (server.pullError) throw server.pullError;
      server.pulls.push({ key, since });
      return { seq: since + 10 };
    },
  };
  return server;
}

const request = { server: 'http://192.168.1.10', code: '482913', name: 'Kitchen phone', model: 'Redmi Note 13' };

describe('first run', () => {
  it('holds at "Connect at home" until paired', async () => {
    expect((await loadSession(memoryStore())).status).toBe('needs_pairing');
  });

  it('pairs, then does the first full sync, then is ready', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const session = await connect(store, server, request);
    expect(session).toMatchObject({ status: 'ready', server: 'http://192.168.1.10', deviceId: 'device-1', deviceName: 'Kitchen phone', lastSeq: 10 });
    expect(server.redeemed[0]).toEqual({ code: '482913', name: 'Kitchen phone', model: 'Redmi Note 13', previousKey: null });
    expect(server.pulls).toEqual([{ key: 'key-1', since: 0 }]);
    expect(store.data[KEYS.deviceKey]).toBe('key-1');
  });

  it('stays held if the first sync fails, and can finish it later', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.pullError = new ApiError('unreachable', 'offline');
    await expect(connect(store, server, request)).rejects.toThrow('offline');
    expect((await loadSession(store)).status).toBe('needs_first_sync');

    server.pullError = undefined;
    expect((await finishFirstSync(store, server)).status).toBe('ready');
  });

  it('stays unpaired when the code is wrong', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.redeemError = new ApiError('invalid_code', 'wrong');
    await expect(connect(store, server, request)).rejects.toMatchObject({ reason: 'invalid_code' });
    expect((await loadSession(store)).status).toBe('needs_pairing');
  });
});

describe('checking in', () => {
  async function readyPhone() {
    const store = memoryStore();
    const server = fakeServer();
    await connect(store, server, request);
    return { store, server };
  }

  it('pulls changes since the last sequence number', async () => {
    const { store, server } = await readyPhone();
    const session = await checkIn(store, server);
    expect(server.pulls.at(-1)).toEqual({ key: 'key-1', since: 10 });
    expect(session.lastSeq).toBe(20);
  });

  it('changes nothing away from home', async () => {
    const { store, server } = await readyPhone();
    server.pullError = new ApiError('unreachable', 'offline');
    expect((await checkIn(store, server)).status).toBe('ready');
  });

  it('shows "removed" when the server says this phone was removed', async () => {
    const { store, server } = await readyPhone();
    server.pullError = new ApiError('device_removed', 'removed');
    expect((await checkIn(store, server)).status).toBe('removed');
    expect(store.data[KEYS.deviceKey]).toBeUndefined();
    expect(store.data[KEYS.previousDeviceKey]).toBe('key-1');
  });

  it('reconnects a removed phone with its previous key, keeping its Device', async () => {
    const { store, server } = await readyPhone();
    server.pullError = new ApiError('device_removed', 'removed');
    await checkIn(store, server);
    server.pullError = undefined;

    const session = await connect(store, server, { ...request, code: '111222' });
    expect(server.redeemed.at(-1)?.previousKey).toBe('key-1');
    expect(session).toMatchObject({ status: 'ready', deviceId: 'device-1' });
    expect(store.data[KEYS.previousDeviceKey]).toBeUndefined();
  });

  it('lets unexpected errors through', async () => {
    const { store, server } = await readyPhone();
    server.pullError = new Error('bug');
    await expect(checkIn(store, server)).rejects.toThrow('bug');
  });
});

describe('suggestedName', () => {
  it('uses the phone model, then its name, then a plain fallback', () => {
    expect(suggestedName('Samsung A54', 'Dad’s phone')).toBe('Samsung A54');
    expect(suggestedName(null, 'Dad’s phone')).toBe('Dad’s phone');
    expect(suggestedName(null, null)).toBe('My phone');
  });
});
