import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionBody } from '@inventory/shared';
import { buildApp } from '../app.ts';
import { devices } from '../db/schema.ts';
import { createTestDatabase, databaseAvailable, type TestDatabase } from '../test/database.ts';
import { hashDeviceKey, newDeviceKey } from './auth.ts';

const canRun = await databaseAvailable();

describe.skipIf(!canRun)('Undo and Correction', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const phone = { id: randomUUID(), key: newDeviceKey() };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = buildApp({ db: testDb.db });
    await testDb.db.insert(devices).values({ id: phone.id, name: 'Kitchen phone', keyHash: hashDeviceKey(phone.key) });
  });
  afterAll(async () => {
    await app?.close();
    await testDb?.close();
  });

  const id = () => randomUUID();
  let clock = Date.now() - 60 * 60_000;

  /** An Action, each one a minute after the last. */
  function act(body: ActionBody) {
    clock += 60_000;
    return { id: id(), deviceId: phone.id, deviceTime: new Date(clock).toISOString(), v: 1, ...body };
  }

  async function push(...actions: ReturnType<typeof act>[]) {
    const res = await app.inject({
      method: 'POST',
      url: '/sync/push',
      headers: { authorization: `Bearer ${phone.key}` },
      payload: { deviceNow: new Date().toISOString(), appVersion: '1.0.0', actions },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().results as { id: string; outcome: string; mismatch: boolean }[];
  }

  async function one(body: ActionBody) {
    const a = act(body);
    const [r] = await push(a);
    return { ...a, outcome: r!.outcome, mismatch: r!.mismatch };
  }

  const undo = (targetActionId: string) => one({ type: 'action.undone', payload: { targetActionId } });

  async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await testDb.client.query(sql, params)).rows as T[];
  }
  const quantities = async (supplyId: string) =>
    Object.fromEntries(
      (await query<{ id: string; quantity: number }>('SELECT id, quantity FROM batches WHERE supply_id = $1', [supplyId])).map((b) => [
        b.id,
        b.quantity,
      ]),
    );
  const onHand = async (supplyId: string) => Object.values(await quantities(supplyId)).reduce((n, q) => n + q, 0);
  const reversedBy = async (actionId: string) =>
    (await query<{ r: string | null }>('SELECT reversed_by_action_id AS r FROM actions WHERE id = $1', [actionId]))[0]!.r;

  /** A Supply with two Batches: 2 expiring sooner, 5 later. */
  async function stocked() {
    const locationId = id();
    const supplyId = id();
    const soon = id();
    const later = id();
    await push(
      act({ type: 'location.created', payload: { locationId, name: 'Pantry' } }),
      act({
        type: 'supply.created',
        payload: { supplyId, name: 'Jasmine rice', unit: 'packs', categoryId: null, usualLocationId: locationId, minimum: 1, restockTo: 3, expires: true, nearExpiryDays: null },
      }),
      act({ type: 'batch.added', payload: { batchId: soon, supplyId, quantity: 2, expiry: '2026-12-01', locationId } }),
      act({ type: 'batch.added', payload: { batchId: later, supplyId, quantity: 5, expiry: '2027-06-01', locationId } }),
    );
    return { locationId, supplyId, soon, later };
  }

  it('undoing "used" refills the exact Batches it took from, recreating emptied ones', async () => {
    const { supplyId, soon, later } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 3 } });
    expect(await quantities(supplyId)).toEqual({ [soon]: 0, [later]: 4 });
    // A later "used" moves on; the Undo still puts back exactly what the first one took.
    await one({ type: 'supply.used', payload: { supplyId, quantity: 1 } });
    const u = await undo(used.id);
    expect(u.outcome).toBe('applied');
    expect(await quantities(supplyId)).toEqual({ [soon]: 2, [later]: 4 });
    expect(await reversedBy(used.id)).toBe(u.id);
  });

  it('undoing "added a Batch" removes what is left; the used part becomes a shortfall Mismatch', async () => {
    const { supplyId, later } = await stocked();
    const added = act({ type: 'batch.added', payload: { batchId: id(), supplyId, quantity: 4, expiry: '2026-11-25', locationId: (await query<{ l: string }>('SELECT usual_location_id AS l FROM supplies WHERE id = $1', [supplyId]))[0]!.l } });
    await push(added);
    await one({ type: 'supply.used', payload: { supplyId, quantity: 3 } }); // all 3 from the new Batch: it expires first (Nov 25)
    const before = await onHand(supplyId);
    const u = await undo(added.id);
    expect(u.mismatch).toBe(true);
    expect(await onHand(supplyId)).toBe(before - 1); // the 1 left of it
    const [m] = await query<{ kind: string; details: { shortfall: number } }>('SELECT kind, details FROM mismatches WHERE action_id = $1', [u.id]);
    expect(m).toMatchObject({ kind: 'shortfall', details: { shortfall: 3 } }); // the 3 already used
    expect((await quantities(supplyId))[later]).toBe(5);
  });

  it('a later Stocktake wins: the Undo is recorded but the amount stays as counted', async () => {
    const { supplyId } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 1 } });
    await one({ type: 'supply.counted', payload: { supplyId, quantity: 10 } });
    const u = await undo(used.id);
    expect(u.outcome).toBe('applied');
    expect(await onHand(supplyId)).toBe(10);
    expect(await reversedBy(used.id)).toBe(u.id);
    const [row] = await query<{ result: { countedSince?: boolean } }>('SELECT result FROM actions WHERE id = $1', [u.id]);
    expect(row!.result.countedSince).toBe(true);
  });

  it('skips a second Undo of the same Action quietly', async () => {
    const { supplyId } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 1 } });
    await undo(used.id);
    const again = await undo(used.id);
    expect(again).toMatchObject({ outcome: 'skipped', mismatch: false });
    expect(await onHand(supplyId)).toBe(7);
  });

  it('undoing an Undo restores the original exactly', async () => {
    const { supplyId, soon, later } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 3 } });
    const u1 = await undo(used.id);
    const u2 = await undo(u1.id);
    expect(u2.outcome).toBe('applied');
    expect(await quantities(supplyId)).toEqual({ [soon]: 0, [later]: 4 });
    expect(await reversedBy(used.id)).toBeNull();
    expect(await reversedBy(u1.id)).toBe(u2.id);
    // And once more: the original is undone again.
    await undo(u2.id);
    expect(await onHand(supplyId)).toBe(7);
    expect(await reversedBy(used.id)).toBe(u1.id);
  });

  it('closes the open Mismatch behind the undone Action ("resolved by undo")', async () => {
    const { supplyId } = await stocked();
    const tooMany = await one({ type: 'supply.used', payload: { supplyId, quantity: 9 } });
    expect(tooMany.mismatch).toBe(true);
    await undo(tooMany.id);
    const [m] = await query<{ resolution: string | null }>('SELECT resolution FROM mismatches WHERE action_id = $1', [tooMany.id]);
    expect(m!.resolution).toBe('undone');
    expect(await onHand(supplyId)).toBe(7);
  });

  it('corrects "used 2" to "used 3", and chains Corrections', async () => {
    const { supplyId } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 2 } });
    expect(await onHand(supplyId)).toBe(5);
    const fix = await one({ type: 'action.corrected', payload: { targetActionId: used.id, corrected: { type: 'supply.used', payload: { supplyId, quantity: 3 } } } });
    expect(fix.outcome).toBe('applied');
    expect(await onHand(supplyId)).toBe(4);
    expect(await reversedBy(used.id)).toBe(fix.id);

    const fixAgain = await one({ type: 'action.corrected', payload: { targetActionId: fix.id, corrected: { type: 'supply.used', payload: { supplyId, quantity: 1 } } } });
    expect(fixAgain.outcome).toBe('applied');
    expect(await onHand(supplyId)).toBe(6);

    // Undoing the last Correction brings back the one it replaced.
    await undo(fixAgain.id);
    expect(await onHand(supplyId)).toBe(4);
    expect(await reversedBy(fix.id)).toBeNull();
  });

  it('corrects which Supply was used ("Milo, not rice")', async () => {
    const rice = await stocked();
    const milo = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId: rice.supplyId, quantity: 1 } });
    await one({ type: 'action.corrected', payload: { targetActionId: used.id, corrected: { type: 'supply.used', payload: { supplyId: milo.supplyId, quantity: 1 } } } });
    expect(await onHand(rice.supplyId)).toBe(7);
    expect(await onHand(milo.supplyId)).toBe(6);
  });

  it('refuses a Correction of a different type', async () => {
    const { supplyId } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 1 } });
    const fix = await one({ type: 'action.corrected', payload: { targetActionId: used.id, corrected: { type: 'supply.counted', payload: { supplyId, quantity: 1 } } } });
    expect(fix.outcome).toBe('skipped');
    expect(await onHand(supplyId)).toBe(6);
  });

  it('restores a Disposed Asset and a deleted Supply; Merge cannot be undone', async () => {
    const assetId = id();
    await one({
      type: 'asset.created',
      payload: { assetId, name: 'Cordless drill', categoryId: null, locationId: null, purchaseDate: null, priceSen: 34900, shop: null, serialNumber: null, warrantyEnd: null, photoIds: [], receiptPhotoId: null, notes: null },
    });
    const disposed = await one({ type: 'asset.disposed', payload: { assetId, date: '2026-11-17', reason: 'Broken' } });
    await undo(disposed.id);
    const [asset] = await query<{ disposed_at: string | null }>('SELECT disposed_at FROM assets WHERE id = $1', [assetId]);
    expect(asset!.disposed_at).toBeNull();

    const { supplyId } = await stocked();
    const deleted = await one({ type: 'supply.deleted', payload: { supplyId } });
    await undo(deleted.id);
    const [supply] = await query<{ deleted_at: string | null }>('SELECT deleted_at FROM supplies WHERE id = $1', [supplyId]);
    expect(supply!.deleted_at).toBeNull();

    const other = await stocked();
    const merged = await one({ type: 'supply.merged', payload: { fromSupplyId: other.supplyId, intoSupplyId: supplyId } });
    expect((await undo(merged.id)).outcome).toBe('skipped');
  });

  it('sends undone Actions again in the next pull, with who undid them', async () => {
    const { supplyId } = await stocked();
    const used = await one({ type: 'supply.used', payload: { supplyId, quantity: 1 } });
    const pull = (since: number) =>
      app.inject({ method: 'GET', url: `/sync/pull?since=${since}`, headers: { authorization: `Bearer ${phone.key}` } }).then((r) => r.json());
    const { seq } = await pull(0);
    const u = await undo(used.id);
    const { changes } = await pull(seq);
    expect(changes.actions).toContainEqual(expect.objectContaining({ id: used.id, reversedByActionId: u.id }));
    expect(changes.actions).toContainEqual(expect.objectContaining({ id: u.id, type: 'action.undone' }));
    expect(changes.devices).toContainEqual({ id: phone.id, name: 'Kitchen phone' });
  });
});
