import { ApiError } from '../api/client';
import { connect, KEYS, loadSession } from '../session/session';
import { fakeServer, memoryStore } from '../test/fakes';
import { createSyncEngine } from './engine';
import { memoryLocal } from './local';
import type { SupplyRow } from './inventory';

const SUPPLY = '11111111-1111-4111-8111-111111111111';
const DEVICE = '33333333-3333-4333-8333-333333333333';

function readyPhone() {
  const store = memoryStore({
    [KEYS.deviceKey]: 'key-1',
    [KEYS.server]: 'http://192.168.1.10',
    [KEYS.deviceId]: DEVICE,
    [KEYS.firstSyncDone]: '1',
    [KEYS.lastSeq]: '10',
  });
  const server = fakeServer();
  const local = memoryLocal(store);
  let ids = 0;
  const engine = createSyncEngine({
    session: store,
    local,
    api: server,
    appVersion: '0.1.0',
    newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++ids).padStart(12, '0')}`,
    now: () => new Date('2026-11-17T09:00:00Z'),
  });
  return { store, server, local, engine };
}

const used = (quantity: number) => ({ type: 'supply.used' as const, payload: { supplyId: SUPPLY, quantity } });

/** Lets the background sync that `record` starts finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('syncing', () => {
  it('pushes Unsent Actions, then drops them once the server has them, and takes the server’s rows', async () => {
    const { server, local, engine } = readyPhone();
    server.pushError = new ApiError('unreachable', 'offline');
    const action = await engine.record(used(2));
    await settle();
    expect(local.unsent).toHaveLength(1);

    server.pushError = undefined;
    const rice = { id: SUPPLY, name: 'Jasmine rice' } as SupplyRow;
    server.rows = { supplies: [rice] };
    expect(await engine.sync()).toBe('synced');

    expect(server.pushes.at(-1)?.body).toMatchObject({ appVersion: '0.1.0', deviceNow: '2026-11-17T09:00:00.000Z', actions: [action] });
    expect(server.received).toEqual([action.id]);
    expect(local.unsent).toEqual([]);
    expect((await local.serverState()).supplies[SUPPLY]).toEqual(rice);
    expect(await local.lastSeq()).toBe(11);
    expect(engine.state()).toMatchObject({ home: true, problem: null, syncing: false });
  });

  it('records Actions with this Device, its clock and a new id', async () => {
    const { engine, server } = readyPhone();
    server.pushError = new ApiError('unreachable', 'offline');
    const action = await engine.record(used(1));
    expect(action).toMatchObject({ deviceId: DEVICE, deviceTime: '2026-11-17T09:00:00.000Z', v: 1, type: 'supply.used' });
  });

  it('syncs after each Action', async () => {
    const { engine, server } = readyPhone();
    await engine.record(used(1));
    await settle();
    expect(server.received).toHaveLength(1);
  });

  it('pulls only what changed since the last sync', async () => {
    const { engine, server } = readyPhone();
    await engine.sync();
    await engine.sync();
    expect(server.pulls.map((p) => p.since)).toEqual([10, 10]);
    server.seq = 15;
    await engine.sync();
    await engine.sync();
    expect(server.pulls.map((p) => p.since)).toEqual([10, 10, 10, 15]);
  });

  it('skips the push when nothing is unsent', async () => {
    const { engine, server } = readyPhone();
    await engine.sync();
    expect(server.pushes).toEqual([]);
  });

  it('keeps an Action recorded while a push is on its way', async () => {
    const { engine, server, local } = readyPhone();
    server.pushError = new ApiError('unreachable', 'offline');
    await engine.record(used(1));
    await settle();
    server.pushError = undefined;

    let later: string | undefined;
    server.duringPush = async () => {
      server.duringPush = undefined;
      later = (await engine.record(used(5))).id;
    };
    await engine.sync();
    expect(local.unsent.map((a) => a.id)).toEqual([later]);
    await settle();
    expect(local.unsent).toEqual([]);
  });

  it('keeps Actions if the pull fails after the push; sending them again is safe', async () => {
    const { engine, server, local } = readyPhone();
    server.pushError = new ApiError('unreachable', 'offline');
    await engine.record(used(1));
    await settle();
    server.pushError = undefined;
    server.pullError = new ApiError('unreachable', 'offline');
    expect(await engine.sync()).toBe('away');
    expect(local.unsent).toHaveLength(1);

    server.pullError = undefined;
    await engine.sync();
    expect(local.unsent).toEqual([]);
    expect(server.received).toHaveLength(1);
  });
});

describe('away from home', () => {
  it('keeps Unsent Actions and says the phone is away', async () => {
    const { engine, server, local } = readyPhone();
    server.pushError = new ApiError('unreachable', 'offline');
    await engine.record(used(1));
    expect(await engine.sync()).toBe('away');
    expect(local.unsent).toHaveLength(1);
    expect(engine.state()).toMatchObject({ home: false, syncing: false });
  });

  it('does nothing before the phone is connected', async () => {
    const { engine, store, server } = readyPhone();
    delete store.data[KEYS.deviceKey];
    expect(await engine.sync()).toBe('not_connected');
    expect(server.pulls).toEqual([]);
  });
});

describe('refusals', () => {
  it.each([
    ['app_too_old', 'app_too_old'],
    ['server_too_old', 'server_too_old'],
    ['invalid_request', 'failed'],
  ] as const)('keeps Actions safely when the push is refused with %s', async (reason, problem) => {
    const { engine, server, local } = readyPhone();
    server.pushError = new ApiError(reason, 'refused');
    await engine.record(used(1));
    await settle();
    server.rows = { supplies: [{ id: SUPPLY, name: 'Jasmine rice' } as SupplyRow] };
    expect(await engine.sync()).toBe('synced');
    expect(local.unsent).toHaveLength(1);
    expect(engine.state()).toMatchObject({ home: true, problem });
    // The pull still brings the rest of the household's changes.
    expect((await local.serverState()).supplies[SUPPLY]).toBeDefined();

    server.pushError = undefined;
    await engine.sync();
    expect(local.unsent).toEqual([]);
    expect(engine.state().problem).toBeNull();
  });

  it('moves to "removed" when the server says this phone was removed, keeping its Actions', async () => {
    const { engine, server, store, local } = readyPhone();
    server.pushError = new ApiError('device_removed', 'removed');
    await engine.record(used(1));
    await settle();
    expect((await loadSession(store)).status).toBe('removed');
    expect(store.data[KEYS.previousDeviceKey]).toBe('key-1');
    expect(local.unsent).toHaveLength(1);
  });

  it('lets unexpected errors through', async () => {
    const { engine, server } = readyPhone();
    server.pullError = new Error('bug');
    await expect(engine.sync()).rejects.toThrow('bug');
    expect(engine.state().syncing).toBe(false);
  });
});

describe('Unsent Actions', () => {
  async function withUnsent() {
    const phone = readyPhone();
    phone.server.pushError = new ApiError('unreachable', 'offline');
    const action = await phone.engine.record(used(2));
    await settle();
    return { ...phone, action };
  }

  it('can be changed before they sync, keeping their id and time', async () => {
    const { engine, local, action } = await withUnsent();
    expect(await engine.editUnsent(action.id, used(3))).toBe(true);
    expect(local.unsent).toEqual([{ ...action, payload: { supplyId: SUPPLY, quantity: 3 } }]);
  });

  it('can be dropped before they sync, leaving nothing to send', async () => {
    const { engine, local, server, action } = await withUnsent();
    expect(await engine.dropUnsent(action.id)).toBe(true);
    server.pushError = undefined;
    await engine.sync();
    expect(local.unsent).toEqual([]);
    expect(server.received).toEqual([]);
  });

  it('wait for a sync on its way, then report they already synced', async () => {
    const { engine, server, action } = await withUnsent();
    server.pushError = undefined;
    const syncing = engine.sync();
    const edit = engine.editUnsent(action.id, used(9));
    await syncing;
    expect(await edit).toBe(false);
    expect(await engine.dropUnsent(action.id)).toBe(false);
  });

  it('are given to the new Device when the phone connects again as one', async () => {
    const { store, server, local, action } = await withUnsent();
    server.pushError = undefined;
    await connect(store, server, local, { server: 'http://192.168.1.10', code: '123456', name: 'Kitchen phone', model: null });
    expect(store.data[KEYS.deviceId]).not.toBe(DEVICE);
    expect(local.unsent).toEqual([{ ...action, deviceId: store.data[KEYS.deviceId] }]);
  });

  it('refuses an Action that isn’t valid', async () => {
    const { engine } = readyPhone();
    await expect(engine.record({ type: 'supply.used', payload: { supplyId: SUPPLY, quantity: 0 } })).rejects.toThrow();
  });
});
