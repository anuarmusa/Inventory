import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionBody } from '@inventory/shared';
import { buildApp } from '../app.ts';
import { appVersionsFrom } from '../app-versions.ts';
import { devices } from '../db/schema.ts';
import { createTestDatabase, databaseAvailable, type TestDatabase } from '../test/database.ts';
import { hashDeviceKey, newDeviceKey } from './auth.ts';

const canRun = await databaseAvailable();

describe.skipIf(!canRun)('sync', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const apkDir = mkdtempSync(join(tmpdir(), 'apk-'));
  writeFileSync(join(apkDir, 'latest.json'), JSON.stringify({ version: '1.4.0', date: '2026-11-15', notes: 'Undo after saving.', file: 'inventory-1.4.0.apk' }));

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = buildApp({ db: testDb.db, appVersions: appVersionsFrom(apkDir) });
  });

  afterAll(async () => {
    await app?.close();
    await testDb?.close();
  });

  // ---------- helpers ----------

  const id = () => randomUUID();
  const MINUTE = 60_000;

  interface Device {
    id: string;
    key: string;
    /** How far this phone's clock is behind real time, in ms. */
    clockBehindMs: number;
  }

  async function newDevice(name = 'Kitchen phone', clockBehindMs = 0): Promise<Device> {
    const device = { id: id(), key: newDeviceKey(), clockBehindMs };
    await testDb.db.insert(devices).values({ id: device.id, name, keyHash: hashDeviceKey(device.key) });
    return device;
  }

  /** An Action as the phone records it, `ago` ms of real time in the past (in the phone's own clock). */
  function act(device: Device, body: ActionBody, ago = 0) {
    return {
      id: id(),
      deviceId: device.id,
      deviceTime: new Date(Date.now() - ago - device.clockBehindMs).toISOString(),
      v: 1,
      ...body,
    };
  }

  function push(device: Device, actions: unknown[], appVersion = '1.4.0') {
    return app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${device.key}` },
      payload: { deviceNow: new Date(Date.now() - device.clockBehindMs).toISOString(), appVersion, actions },
    });
  }

  async function pushOk(device: Device, actions: unknown[]) {
    const res = await push(device, actions);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { seq: number; results: { id: string; outcome: string; mismatch: boolean }[] };
  }

  function pull(device: Device, since = 0) {
    return app.inject({ method: 'GET', url: `/sync/pull?since=${since}`, headers: { authorization: `Bearer ${device.key}` } });
  }

  async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await testDb.client.query(sql, params)).rows as T[];
  }

  async function onHand(supplyId: string): Promise<number> {
    const [row] = await query<{ n: number }>('SELECT coalesce(sum(quantity), 0)::int AS n FROM batches WHERE supply_id = $1', [supplyId]);
    return row!.n;
  }

  async function mismatchesFor(actionId: string) {
    return query<{ kind: string; details: Record<string, unknown> }>('SELECT kind, details FROM mismatches WHERE action_id = $1', [actionId]);
  }

  /** A Location and a Supply with Batches of the given quantities and expiry dates. */
  async function stocked(device: Device, batches: { quantity: number; expiry: string | null }[]) {
    const locationId = id();
    const supplyId = id();
    const batchIds = batches.map(() => id());
    await pushOk(device, [
      act(device, { type: 'location.created', payload: { locationId, name: 'Pantry' } }),
      act(device, {
        type: 'supply.created',
        payload: {
          supplyId, name: 'Jasmine rice', unit: 'packs', categoryId: null, usualLocationId: locationId,
          minimum: 1, restockTo: 3, expires: true, nearExpiryDays: null,
        },
      }),
      ...batches.map((b, i) =>
        act(device, { type: 'batch.added', payload: { batchId: batchIds[i]!, supplyId, quantity: b.quantity, expiry: b.expiry, locationId } }),
      ),
    ]);
    return { locationId, supplyId, batchIds };
  }

  // ---------- who may push ----------

  describe('Device keys', () => {
    it('refuses an unknown key', async () => {
      const stranger = { id: id(), key: newDeviceKey(), clockBehindMs: 0 };
      const res = await push(stranger, []);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('unknown_device');
    });

    it('refuses a removed Device', async () => {
      const phone = await newDevice();
      await testDb.client.query('UPDATE devices SET removed_at = now() WHERE id = $1', [phone.id]);
      const res = await push(phone, []);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('device_removed');
    });

    it('refuses Actions recorded by another Device', async () => {
      const phone = await newDevice();
      const other = await newDevice('Other phone');
      const res = await push(phone, [act(other, { type: 'location.created', payload: { locationId: id(), name: 'Garage' } })]);
      expect(res.statusCode).toBe(400);
    });
  });

  // ---------- versions ----------

  describe('versions', () => {
    it('tells every Device the latest and minimum app versions', async () => {
      const phone = await newDevice();
      const body = await pushOk(phone, []);
      const app = { latest: '1.4.0', minimum: '0.1.0', notes: 'Undo after saving.' };
      expect((body as unknown as { app: unknown }).app).toEqual(app);
      expect((await pull(phone)).json().app).toEqual(app);
    });

    it('records the app version a Device reports when it pulls', async () => {
      const phone = await newDevice();
      await app.inject({ method: 'GET', url: '/sync/pull?since=0', headers: { authorization: `Bearer ${phone.key}`, 'x-app-version': '1.3.2' } });
      const [row] = await query<{ app_version: string }>('SELECT app_version FROM devices WHERE id = $1', [phone.id]);
      expect(row!.app_version).toBe('1.3.2');
    });

    it('refuses a push from an app older than the minimum, changing nothing', async () => {
      const phone = await newDevice();
      const locationId = id();
      const res = await push(phone, [act(phone, { type: 'location.created', payload: { locationId, name: 'Garage' } })], '0.0.9');
      expect(res.statusCode).toBe(426);
      expect(res.json().error).toBe('app_too_old');
      expect(await query('SELECT 1 FROM locations WHERE id = $1', [locationId])).toHaveLength(0);
    });

    it('refuses an Action shape the server does not know, changing nothing', async () => {
      const phone = await newDevice();
      const locationId = id();
      const known = act(phone, { type: 'location.created', payload: { locationId, name: 'Garage' } });
      const future = { ...act(phone, { type: 'location.created', payload: { locationId: id(), name: 'Shed' } }), v: 2 };
      const res = await push(phone, [known, future]);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('server_too_old');
      expect(await query('SELECT 1 FROM locations WHERE id = $1', [locationId])).toHaveLength(0);
    });

    it('records the Device’s app version and clock offset', async () => {
      const phone = await newDevice('Slow clock', 2 * 60 * MINUTE);
      await pushOk(phone, []);
      const [row] = await query<{ app_version: string; clock_offset_ms: number }>(
        'SELECT app_version, clock_offset_ms FROM devices WHERE id = $1', [phone.id]);
      expect(row!.app_version).toBe('1.4.0');
      expect(Math.abs(row!.clock_offset_ms - 2 * 60 * MINUTE)).toBeLessThan(5_000);
    });
  });

  // ---------- applying Actions ----------

  describe('applying Actions', () => {
    it('is safe to retry: an Action already received is applied once', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 5, expiry: null }]);
      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 2 } });
      const first = await pushOk(phone, [used]);
      const again = await pushOk(phone, [used]);
      expect(again.results).toEqual(first.results);
      expect(await onHand(supplyId)).toBe(3);
    });

    it('takes "used" from the oldest Batch first and records which Batches', async () => {
      const phone = await newDevice();
      const { supplyId, batchIds } = await stocked(phone, [
        { quantity: 2, expiry: null },
        { quantity: 1, expiry: '2027-03-01' },
        { quantity: 2, expiry: '2026-12-01' },
      ]);
      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 3 } });
      await pushOk(phone, [used]);
      const [row] = await query<{ result: unknown }>('SELECT result FROM actions WHERE id = $1', [used.id]);
      expect(row!.result).toEqual({
        taken: [
          { batchId: batchIds[2], quantity: 2 },
          { batchId: batchIds[1], quantity: 1 },
        ],
        shortfall: 0,
      });
      expect(await onHand(supplyId)).toBe(2);
    });

    it('applies a "used" down to zero and flags the shortfall', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 1, expiry: null }]);
      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 3 } });
      const { results } = await pushOk(phone, [used]);
      expect(results[0]).toMatchObject({ outcome: 'applied', mismatch: true });
      expect(await onHand(supplyId)).toBe(0);
      expect(await mismatchesFor(used.id)).toEqual([{ kind: 'shortfall', details: { supplyId, requested: 3, shortfall: 2 } }]);
    });

    it('applies Actions from different Devices in arrival order', async () => {
      const a = await newDevice('Phone A');
      const b = await newDevice('Phone B');
      const { supplyId } = await stocked(a, [{ quantity: 10, expiry: null }]);
      const pushes = await Promise.all(
        Array.from({ length: 5 }, (_, i) => pushOk(i % 2 ? a : b, [act(i % 2 ? a : b, { type: 'supply.used', payload: { supplyId, quantity: 1 } })])),
      );
      expect(pushes.every((p) => p.results[0]!.outcome === 'applied')).toBe(true);
      expect(await onHand(supplyId)).toBe(5);
    });

    it('makes detail edits last-writer-wins by arrival', async () => {
      const a = await newDevice('Phone A');
      const b = await newDevice('Phone B');
      const { supplyId } = await stocked(a, [{ quantity: 1, expiry: null }]);
      // B's edit was made earlier but arrives later, so it wins.
      await pushOk(a, [act(a, { type: 'supply.edited', payload: { supplyId, changes: { name: 'Rice (A)' } } })]);
      await pushOk(b, [act(b, { type: 'supply.edited', payload: { supplyId, changes: { name: 'Rice (B)' } } }, 30 * MINUTE)]);
      const [row] = await query<{ name: string }>('SELECT name FROM supplies WHERE id = $1', [supplyId]);
      expect(row!.name).toBe('Rice (B)');
    });
  });

  // ---------- Stocktake ----------

  describe('Stocktake', () => {
    it('takes a lower count off the oldest Batches', async () => {
      const phone = await newDevice();
      const { supplyId, batchIds } = await stocked(phone, [
        { quantity: 3, expiry: '2027-01-01' },
        { quantity: 3, expiry: '2026-12-01' },
      ]);
      await pushOk(phone, [act(phone, { type: 'supply.counted', payload: { supplyId, quantity: 4 } })]);
      const rows = await query<{ id: string; quantity: number }>('SELECT id, quantity FROM batches WHERE supply_id = $1', [supplyId]);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.quantity]))).toEqual({ [batchIds[0]!]: 3, [batchIds[1]!]: 1 });
    });

    it('adds a higher count as a new undated Batch at the usual Location', async () => {
      const phone = await newDevice();
      const { supplyId, locationId } = await stocked(phone, [{ quantity: 2, expiry: '2027-01-01' }]);
      await pushOk(phone, [act(phone, { type: 'supply.counted', payload: { supplyId, quantity: 5 } })]);
      const added = await query('SELECT quantity, expiry, location_id FROM batches WHERE supply_id = $1 AND expiry IS NULL', [supplyId]);
      expect(added).toEqual([{ quantity: 3, expiry: null, location_id: locationId }]);
    });

    it('skips a "used" taken before the latest count, using each phone’s corrected clock', async () => {
      const counter = await newDevice('Counts correctly');
      const slow = await newDevice('Clock 2h behind', 2 * 60 * MINUTE);
      const { supplyId } = await stocked(counter, [{ quantity: 10, expiry: null }]);
      await pushOk(counter, [act(counter, { type: 'supply.counted', payload: { supplyId, quantity: 8 } }, 5 * MINUTE)]);

      // Really taken 10 minutes ago, before the count: already reflected in it.
      const before = act(slow, { type: 'supply.used', payload: { supplyId, quantity: 2 } }, 10 * MINUTE);
      // Really taken 1 minute ago, after the count, even though the slow clock says it was ~2h ago.
      const after = act(slow, { type: 'supply.used', payload: { supplyId, quantity: 1 } }, 1 * MINUTE);
      const { results } = await pushOk(slow, [before, after]);

      expect(results.map((r) => r.outcome)).toEqual(['skipped', 'applied']);
      expect(results[0]!.mismatch).toBe(false);
      expect(await onHand(supplyId)).toBe(7);
    });
  });

  // ---------- Mismatches ----------

  describe('Mismatches', () => {
    it('skips an Action on a deleted Supply and flags it', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 1, expiry: null }]);
      await pushOk(phone, [act(phone, { type: 'supply.deleted', payload: { supplyId } })]);
      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 1 } });
      const { results } = await pushOk(phone, [used]);
      expect(results[0]).toMatchObject({ outcome: 'skipped', mismatch: true });
      expect(await mismatchesFor(used.id)).toEqual([
        { kind: 'skipped_action', details: { reason: 'gone', thing: 'supply', id: supplyId } },
      ]);
    });

    it('skips an Action on a Disposed Asset and flags it', async () => {
      const phone = await newDevice();
      const assetId = id();
      const locationId = id();
      await pushOk(phone, [
        act(phone, { type: 'location.created', payload: { locationId, name: 'Garage' } }),
        act(phone, {
          type: 'asset.created',
          payload: {
            assetId, name: 'Cordless drill', categoryId: null, locationId, purchaseDate: null, priceSen: 34_900,
            shop: null, serialNumber: null, warrantyEnd: null, photoIds: [], receiptPhotoId: null, notes: null,
          },
        }),
        act(phone, { type: 'asset.disposed', payload: { assetId, date: '2026-11-17', reason: 'Broken' } }),
      ]);
      const moved = act(phone, { type: 'asset.moved', payload: { assetId, toLocationId: locationId } });
      const { results } = await pushOk(phone, [moved]);
      expect(results[0]).toMatchObject({ outcome: 'skipped', mismatch: true });
      expect((await mismatchesFor(moved.id))[0]!.details).toMatchObject({ reason: 'disposed', thing: 'asset' });
    });

    it('keeps the first Supply when one Barcode is given to two', async () => {
      const a = await newDevice('Phone A');
      const b = await newDevice('Phone B');
      const milo = await stocked(a, [{ quantity: 1, expiry: null }]);
      const choc = await stocked(b, [{ quantity: 1, expiry: null }]);
      const barcode = (supplyId: string) => ({
        code: '9556002345678', supplyId, brand: null, productName: 'Milo tin', packSize: '1 kg', photoId: null,
        unitsPerScan: 1, source: 'household' as const,
      });
      await pushOk(a, [act(a, { type: 'barcode.attached', payload: barcode(milo.supplyId) })]);
      const second = act(b, { type: 'barcode.attached', payload: barcode(choc.supplyId) });
      const { results } = await pushOk(b, [second]);
      expect(results[0]).toMatchObject({ outcome: 'skipped', mismatch: true });
      expect((await query('SELECT supply_id FROM barcodes WHERE code = $1', ['9556002345678']))[0]).toEqual({ supply_id: milo.supplyId });
      expect((await mismatchesFor(second.id))[0]).toMatchObject({ kind: 'double_assignment' });
    });

    it('keeps the first link when one Blank label is attached to two things', async () => {
      const a = await newDevice('Phone A');
      const b = await newDevice('Phone B');
      const freezer = id();
      const garage = id();
      await pushOk(a, [
        act(a, { type: 'location.created', payload: { locationId: freezer, name: 'Freezer' } }),
        act(a, { type: 'location.created', payload: { locationId: garage, name: 'Garage' } }),
      ]);
      await testDb.client.query("INSERT INTO labels (code) VALUES ('7K2QX')");
      await pushOk(a, [act(a, { type: 'label.attached', payload: { code: '7K2QX', target: { kind: 'location', locationId: freezer } } })]);
      const second = act(b, { type: 'label.attached', payload: { code: '7K2QX', target: { kind: 'location', locationId: garage } } });
      const { results } = await pushOk(b, [second]);
      expect(results[0]).toMatchObject({ outcome: 'skipped', mismatch: true });
      expect((await query('SELECT location_id FROM labels WHERE code = $1', ['7K2QX']))[0]).toEqual({ location_id: freezer });
    });

    it('refuses to delete a Location that still holds things', async () => {
      const phone = await newDevice();
      const { locationId } = await stocked(phone, [{ quantity: 1, expiry: null }]);
      const del = act(phone, { type: 'location.deleted', payload: { locationId } });
      const { results } = await pushOk(phone, [del]);
      expect(results[0]).toMatchObject({ outcome: 'skipped', mismatch: true });
      expect((await mismatchesFor(del.id))[0]!.details).toMatchObject({ reason: 'not_empty' });
    });

    it('resolves a Mismatch with a synced Action', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 0 + 1, expiry: null }]);
      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 2 } });
      await pushOk(phone, [used]);
      const [m] = await query<{ id: string }>('SELECT id FROM mismatches WHERE action_id = $1', [used.id]);
      await pushOk(phone, [act(phone, { type: 'mismatch.resolved', payload: { mismatchId: m!.id, resolution: 'accepted' } })]);
      const [row] = await query<{ resolution: string; resolved_at: Date | null }>('SELECT resolution, resolved_at FROM mismatches WHERE id = $1', [m!.id]);
      expect(row!.resolution).toBe('accepted');
      expect(row!.resolved_at).not.toBeNull();
    });
  });

  // ---------- Merge ----------

  it('merges a duplicate Supply: moves its Batches and Barcodes, then hides it', async () => {
    const phone = await newDevice();
    const keep = await stocked(phone, [{ quantity: 2, expiry: null }]);
    const dupe = await stocked(phone, [{ quantity: 3, expiry: '2027-01-01' }]);
    await pushOk(phone, [
      act(phone, {
        type: 'barcode.attached',
        payload: { code: '9556001234561', supplyId: dupe.supplyId, brand: null, productName: null, packSize: null, photoId: null, unitsPerScan: 1, source: 'household' },
      }),
      act(phone, { type: 'supply.merged', payload: { fromSupplyId: dupe.supplyId, intoSupplyId: keep.supplyId } }),
    ]);
    expect(await onHand(keep.supplyId)).toBe(5);
    expect((await query('SELECT supply_id FROM barcodes WHERE code = $1', ['9556001234561']))[0]).toEqual({ supply_id: keep.supplyId });
    expect((await query<{ deleted_at: Date | null }>('SELECT deleted_at FROM supplies WHERE id = $1', [dupe.supplyId]))[0]!.deleted_at).not.toBeNull();
  });

  // ---------- pull ----------

  describe('pull', () => {
    it('carries the restore epoch, which changes when the database is restored', async () => {
      const phone = await newDevice();
      const first = (await pull(phone)).json().epoch;
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      await testDb.client.query('UPDATE household_settings SET epoch = gen_random_uuid()');
      expect((await pull(phone)).json().epoch).not.toBe(first);
    });

    it('gives a first-time Device everything, including household settings', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 2, expiry: '2027-01-01' }]);
      const res = await pull(phone, 0);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.changes.settings).toEqual([expect.objectContaining({ id: 1, nearExpiryDays: 7 })]);
      expect(body.changes.supplies.map((s: { id: string }) => s.id)).toContain(supplyId);
      expect(body.changes.batches.some((b: { supplyId: string; expiry: string }) => b.supplyId === supplyId && b.expiry === '2027-01-01')).toBe(true);
    });

    it('returns only what changed since a sequence number', async () => {
      const phone = await newDevice();
      const { supplyId } = await stocked(phone, [{ quantity: 4, expiry: null }]);
      const { seq } = (await pull(phone, 0)).json();
      expect(seq).toBeGreaterThan(0);

      const used = act(phone, { type: 'supply.used', payload: { supplyId, quantity: 1 } });
      await pushOk(phone, [used]);
      const body = (await pull(phone, seq)).json();

      expect(body.seq).toBeGreaterThan(seq);
      expect(body.changes.supplies).toEqual([]);
      expect(body.changes.batches).toEqual([expect.objectContaining({ supplyId, quantity: 3 })]);
      expect(body.changes.actions.map((a: { id: string }) => a.id)).toEqual([used.id]);
    });

    it('requires a Device key', async () => {
      const res = await app.inject({ method: 'GET', url: '/sync/pull?since=0' });
      expect(res.statusCode).toBe(401);
    });
  });
});
