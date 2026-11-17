import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { createTestDatabase, databaseAvailable, type TestDatabase } from './test/database.ts';
import { DASHBOARD_DEVICE_ID } from './web-routes.ts';

const canRun = await databaseAvailable();

describe.skipIf(!canRun)('web dashboard API', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const backupStatusFile = join(mkdtempSync(join(tmpdir(), 'backup-')), 'last-backup.json');

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = buildApp({ db: testDb.db, serverVersion: '1.4.0', backupStatusFile });
  });
  afterAll(async () => {
    await app?.close();
    await testDb?.close();
  });

  const record = (actions: unknown[]) => app.inject({ method: 'POST', url: '/web/actions', payload: { actions } });
  const state = async () => (await app.inject({ method: 'GET', url: '/web/state' })).json();

  it('records Actions as the Dashboard Device, so they show in history and can be undone', async () => {
    const locationId = randomUUID();
    const res = await record([{ type: 'location.created', payload: { locationId, name: 'Garage' } }]);
    expect(res.statusCode, res.body).toBe(200);
    const [result] = res.json().results;
    expect(result.outcome).toBe('applied');

    const s = await state();
    expect(s.changes.locations).toContainEqual(expect.objectContaining({ id: locationId, name: 'Garage' }));
    expect(s.changes.devices).toContainEqual({ id: DASHBOARD_DEVICE_ID, name: 'Dashboard' });
    const logged = s.changes.actions.find((a: { id: string }) => a.id === result.id);
    expect(logged.deviceId).toBe(DASHBOARD_DEVICE_ID);

    const undo = await record([{ type: 'action.undone', payload: { targetActionId: result.id } }]);
    expect(undo.json().results[0].outcome).toBe('skipped'); // creating a Location is fixed by deleting it, not undone
  });

  it('refuses Actions that aren’t valid, recording none of them', async () => {
    const before = (await state()).seq;
    const res = await record([
      { type: 'location.created', payload: { locationId: randomUUID(), name: 'Shed' } },
      { type: 'supply.used', payload: { supplyId: 'nope', quantity: 1 } },
    ]);
    expect(res.statusCode).toBe(400);
    expect((await state()).seq).toBe(before);
  });

  it('tells the footer the server version and the last backup', async () => {
    expect((await state()).server).toEqual({ version: '1.4.0', lastBackup: null });
    writeFileSync(backupStatusFile, JSON.stringify({ at: '2026-11-17T03:00:12+08:00', ok: false, message: 'USB drive not mounted' }));
    expect((await state()).server.lastBackup).toEqual({ at: '2026-11-17T03:00:12+08:00', ok: false, message: 'USB drive not mounted' });
    expect((await app.inject({ method: 'GET', url: '/web/server' })).json()).toEqual((await state()).server);
  });
});
