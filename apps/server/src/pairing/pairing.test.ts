import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parsePairingLink, type PairingOffer, type RedeemResponse } from '@inventory/shared';
import { buildApp } from '../app.ts';
import { createTestDatabase, databaseAvailable, type TestDatabase } from '../test/database.ts';

const canRun = await databaseAvailable();

describe.skipIf(!canRun)('pairing and Devices', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  let clock = new Date('2026-11-17T09:00:00Z');

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = buildApp({ db: testDb.db, now: () => clock });
  });

  beforeEach(() => {
    clock = new Date(clock.getTime() + 60 * 60_000); // each test an hour later: earlier codes have expired
  });

  afterAll(async () => {
    await app?.close();
    await testDb?.close();
  });

  const minutes = (n: number) => {
    clock = new Date(clock.getTime() + n * 60_000);
  };

  async function offer(host = '192.168.1.10'): Promise<PairingOffer> {
    const res = await app.inject({ method: 'POST', url: '/pairing/offers', headers: { host } });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  function redeem(code: string, extra: { name?: string; model?: string | null; previousKey?: string | null } = {}) {
    return app.inject({
      method: 'POST',
      url: '/pairing/redeem',
      payload: { code, name: extra.name ?? 'Kitchen phone', model: extra.model ?? 'Redmi Note 13', previousKey: extra.previousKey ?? null },
    });
  }

  async function pairPhone(extra: Parameters<typeof redeem>[1] = {}): Promise<RedeemResponse> {
    const res = await redeem((await offer()).code, extra);
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  }

  function pull(key: string) {
    return app.inject({ method: 'GET', url: '/sync/pull?since=0', headers: { authorization: `Bearer ${key}` } });
  }

  describe('offers', () => {
    it('gives a 6-digit code valid for 10 minutes, with the link and QR content', async () => {
      const o = await offer('192.168.1.10');
      expect(o.code).toMatch(/^\d{6}$/);
      expect(new Date(o.expiresAt).getTime() - clock.getTime()).toBe(10 * 60_000);
      expect(o.server).toBe('http://192.168.1.10');
      expect(parsePairingLink(o.link)).toEqual({ server: 'http://192.168.1.10', code: o.code });
    });

    it('uses the address the page was opened with, including a port', async () => {
      expect((await offer('192.168.1.20:8080')).server).toBe('http://192.168.1.20:8080');
    });

    it('uses the configured public address when set', async () => {
      const configured = buildApp({ db: testDb.db, now: () => clock, publicAddress: 'http://inventory.home/' });
      const res = await configured.inject({ method: 'POST', url: '/pairing/offers', headers: { host: 'localhost:3000' } });
      expect(res.json().server).toBe('http://inventory.home');
      await configured.close();
    });
  });

  describe('redeeming', () => {
    it('pairs a phone: the key it gets works for sync', async () => {
      const paired = await pairPhone();
      expect(paired.name).toBe('Kitchen phone');
      expect((await pull(paired.deviceKey)).statusCode).toBe(200);
      const [row] = (await testDb.client.query('SELECT name, model, key_hash FROM devices WHERE id = $1', [paired.deviceId])).rows;
      expect(row).toMatchObject({ name: 'Kitchen phone', model: 'Redmi Note 13' });
      expect(row.key_hash).not.toContain(paired.deviceKey);
    });

    it('uses a code only once', async () => {
      const { code } = await offer();
      expect((await redeem(code)).statusCode).toBe(200);
      const again = await redeem(code);
      expect(again.statusCode).toBe(400);
      expect(again.json().error).toBe('invalid_code');
    });

    it('refuses a code after 10 minutes', async () => {
      const { code } = await offer();
      minutes(10);
      expect((await redeem(code)).json().error).toBe('invalid_code');
    });

    it('accepts a code just before it expires', async () => {
      const { code } = await offer();
      minutes(9);
      expect((await redeem(code)).statusCode).toBe(200);
    });

    it('refuses a code nobody was offered', async () => {
      const res = await redeem('999999');
      expect(res.statusCode).toBe(400);
    });

    it('pauses after too many wrong codes, so codes cannot be guessed', async () => {
      const guarded = buildApp({ db: testDb.db, now: () => clock });
      const wrong = () => guarded.inject({ method: 'POST', url: '/pairing/redeem', payload: { code: '000000', name: 'x', model: null, previousKey: null } });
      for (let i = 0; i < 10; i++) expect((await wrong()).statusCode).toBe(400);
      expect((await wrong()).statusCode).toBe(429);
      minutes(11);
      expect((await wrong()).statusCode).toBe(400);
      await guarded.close();
    });

    it('requires a name', async () => {
      const res = await redeem((await offer()).code, { name: '  ' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_request');
    });
  });

  describe('removing and reconnecting', () => {
    it('stops a removed Device’s key', async () => {
      const phone = await pairPhone();
      expect((await app.inject({ method: 'POST', url: `/devices/${phone.deviceId}/remove` })).statusCode).toBe(200);
      const res = await pull(phone.deviceKey);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('device_removed');
    });

    it('lets the same install reconnect as the same Device, so its unsent Actions still belong to it', async () => {
      const phone = await pairPhone();
      await app.inject({ method: 'POST', url: `/devices/${phone.deviceId}/remove` });

      const again = await pairPhone({ previousKey: phone.deviceKey });
      expect(again.deviceId).toBe(phone.deviceId);
      expect(again.deviceKey).not.toBe(phone.deviceKey);
      expect((await pull(phone.deviceKey)).statusCode).toBe(401);

      // An Action recorded before removal, with the old Device id, now syncs with the new key.
      const locationId = randomUUID();
      const push = await app.inject({
        method: 'POST',
        url: '/sync/push',
        headers: { authorization: `Bearer ${again.deviceKey}` },
        payload: {
          deviceNow: clock.toISOString(),
          appVersion: '1.0.0',
          actions: [{ id: randomUUID(), deviceId: phone.deviceId, deviceTime: clock.toISOString(), v: 1, type: 'location.created', payload: { locationId, name: 'Garage' } }],
        },
      });
      expect(push.statusCode, push.body).toBe(200);
    });

    it('pairs a reinstall (no previous key) as a new Device', async () => {
      const phone = await pairPhone();
      const reinstall = await pairPhone();
      expect(reinstall.deviceId).not.toBe(phone.deviceId);
    });

    it('treats an unknown previous key as a new Device', async () => {
      const paired = await pairPhone({ previousKey: 'not-a-key-we-know' });
      expect(paired.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('the Device list', () => {
    it('lists Devices with name, model, version and state', async () => {
      const phone = await pairPhone({ name: 'Aisyah’s phone', model: 'Oppo A78' });
      const list = (await app.inject({ method: 'GET', url: '/devices' })).json();
      expect(list).toContainEqual(
        expect.objectContaining({ id: phone.deviceId, name: 'Aisyah’s phone', model: 'Oppo A78', appVersion: null, removedAt: null }),
      );
    });

    it('renames a Device from the download page', async () => {
      const phone = await pairPhone();
      const res = await app.inject({ method: 'PATCH', url: `/devices/${phone.deviceId}`, payload: { name: 'Dad’s Samsung A54' } });
      expect(res.json().name).toBe('Dad’s Samsung A54');
    });

    it('lets a phone rename itself with its key', async () => {
      const phone = await pairPhone();
      const res = await app.inject({
        method: 'PATCH',
        url: '/devices/me',
        headers: { authorization: `Bearer ${phone.deviceKey}` },
        payload: { name: 'Pantry tablet' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: phone.deviceId, name: 'Pantry tablet' });
    });

    it('answers 404 for an unknown Device', async () => {
      const res = await app.inject({ method: 'POST', url: `/devices/${randomUUID()}/remove` });
      expect(res.statusCode).toBe(404);
    });
  });
});
