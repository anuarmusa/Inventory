import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { devices } from './db/schema.ts';
import { hashDeviceKey, newDeviceKey } from './sync/auth.ts';
import { createTestDatabase, databaseAvailable, type TestDatabase } from './test/database.ts';

const canRun = await databaseAvailable();

describe.skipIf(!canRun)('photos', () => {
  let testDb: TestDatabase;
  let app: FastifyInstance;
  const photosDir = mkdtempSync(join(tmpdir(), 'photos-'));
  const key = newDeviceKey();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = buildApp({ db: testDb.db, photosDir });
    await testDb.db.insert(devices).values({ id: randomUUID(), name: 'Kitchen phone', keyHash: hashDeviceKey(key) });
  });
  afterAll(async () => {
    await app?.close();
    await testDb?.close();
  });

  const put = (id: string, body: Buffer, authorization = `Bearer ${key}`) =>
    app.inject({ method: 'PUT', url: `/photos/${id}`, headers: { authorization, 'content-type': 'image/jpeg' }, payload: body });

  it('stores an uploaded photo under the photos folder and serves it', async () => {
    const id = randomUUID();
    expect((await put(id, jpeg)).statusCode).toBe(204);
    expect(existsSync(join(photosDir, `${id}.jpg`))).toBe(true);
    const res = await app.inject({ method: 'GET', url: `/photos/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.rawPayload.equals(jpeg)).toBe(true);
  });

  it('accepts the same upload again (phones retry)', async () => {
    const id = randomUUID();
    await put(id, jpeg);
    expect((await put(id, jpeg)).statusCode).toBe(204);
  });

  it('needs a Device key to upload', async () => {
    expect((await put(randomUUID(), jpeg, 'Bearer nope')).statusCode).toBe(401);
  });

  it('refuses ids that aren’t photo ids, and empty or oversized uploads', async () => {
    expect((await put('../../etc/passwd', jpeg)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await put(randomUUID(), Buffer.alloc(0))).statusCode).toBe(400);
    expect((await put(randomUUID(), Buffer.alloc(6 * 1024 * 1024))).statusCode).toBe(413);
  });

  it('answers 404 for a photo that hasn’t arrived', async () => {
    expect((await app.inject({ method: 'GET', url: `/photos/${randomUUID()}` })).statusCode).toBe(404);
  });
});
