import { ApiError } from '../api/client';
import { memoryLocal } from '../sync/local';
import { fakeServer, memoryStore } from '../test/fakes';
import { connect, finishFirstSync, KEYS, loadSession, suggestedName } from './session';

const request = { server: 'http://192.168.1.10', code: '482913', name: 'Kitchen phone', model: 'Redmi Note 13' };

describe('first run', () => {
  it('holds at "Connect at home" until paired', async () => {
    expect((await loadSession(memoryStore())).status).toBe('needs_pairing');
  });

  it('pairs, then does the first full sync, then is ready', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const session = await connect(store, server, memoryLocal(store), request);
    expect(session).toMatchObject({ status: 'ready', server: 'http://192.168.1.10', deviceId: 'device-1', deviceName: 'Kitchen phone', lastSeq: 10 });
    expect(server.redeemed[0]).toEqual({ code: '482913', name: 'Kitchen phone', model: 'Redmi Note 13', previousKey: null });
    expect(server.pulls).toEqual([{ key: 'key-1', since: 0 }]);
    expect(store.data[KEYS.deviceKey]).toBe('key-1');
  });

  it('stays held if the first sync fails, and can finish it later', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.pullError = new ApiError('unreachable', 'offline');
    await expect(connect(store, server, memoryLocal(store), request)).rejects.toThrow('offline');
    expect((await loadSession(store)).status).toBe('needs_first_sync');

    server.pullError = undefined;
    expect((await finishFirstSync(store, server, memoryLocal(store))).status).toBe('ready');
  });

  it('stays unpaired when the code is wrong', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.redeemError = new ApiError('invalid_code', 'wrong');
    await expect(connect(store, server, memoryLocal(store), request)).rejects.toMatchObject({ reason: 'invalid_code' });
    expect((await loadSession(store)).status).toBe('needs_pairing');
  });
});

describe('suggestedName', () => {
  it('uses the phone model, then its name, then a plain fallback', () => {
    expect(suggestedName('Samsung A54', 'Dad’s phone')).toBe('Samsung A54');
    expect(suggestedName(null, 'Dad’s phone')).toBe('Dad’s phone');
    expect(suggestedName(null, null)).toBe('My phone');
  });
});
