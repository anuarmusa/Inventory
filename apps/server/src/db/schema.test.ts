import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, databaseAvailable, type TestDatabase } from '../test/database.ts';

// Runs the real migrations into a throwaway database, then checks the rules Postgres enforces.
// Skipped when no database is configured (e.g. without Docker running).
const canRun = await databaseAvailable();

describe.skipIf(!canRun)('database schema', () => {
  let testDb: TestDatabase;
  let client: pg.Client;
  const id = () => randomUUID();

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = testDb.client;
  });

  afterAll(async () => {
    await testDb?.close();
  });

  it('starts with the household Near-expiry default of 7 days', async () => {
    const { rows } = await client.query('SELECT near_expiry_days FROM household_settings');
    expect(rows).toEqual([{ near_expiry_days: 7 }]);
  });

  it('keeps household settings to a single row', async () => {
    await expect(client.query('INSERT INTO household_settings (id) VALUES (2)')).rejects.toThrow(/single_row/);
  });

  it('stores a Supply with a Batch and reads the expiry back as a calendar date', async () => {
    const location = id();
    const supply = id();
    await client.query('INSERT INTO locations (id, name) VALUES ($1, $2)', [location, 'Pantry']);
    await client.query('INSERT INTO supplies (id, name, unit, usual_location_id, minimum, restock_to) VALUES ($1, $2, $3, $4, 1, 3)', [
      supply, 'Jasmine rice', 'packs', location,
    ]);
    await client.query('INSERT INTO batches (id, supply_id, quantity, expiry, location_id) VALUES ($1, $2, 2, $3, $4)', [
      id(), supply, '2027-05-01', location,
    ]);
    const { rows } = await client.query("SELECT to_char(expiry, 'YYYY-MM-DD') AS expiry FROM batches WHERE supply_id = $1", [supply]);
    expect(rows).toEqual([{ expiry: '2027-05-01' }]);
  });

  it('gives each Barcode to exactly one Supply', async () => {
    const a = id();
    const b = id();
    await client.query("INSERT INTO supplies (id, name, unit) VALUES ($1, 'Milo', 'tins'), ($2, 'Chocolate drink', 'tins')", [a, b]);
    await client.query("INSERT INTO barcodes (code, supply_id) VALUES ('9556002345678', $1)", [a]);
    await expect(client.query("INSERT INTO barcodes (code, supply_id) VALUES ('9556002345678', $1)", [b])).rejects.toThrow(/duplicate key/);
  });

  it('rejects negative Batch quantities', async () => {
    const location = id();
    const supply = id();
    await client.query("INSERT INTO locations (id, name) VALUES ($1, 'Fridge')", [location]);
    await client.query("INSERT INTO supplies (id, name, unit) VALUES ($1, 'Fresh milk', 'bottles')", [supply]);
    await expect(
      client.query('INSERT INTO batches (id, supply_id, quantity, location_id) VALUES ($1, $2, -1, $3)', [id(), supply, location]),
    ).rejects.toThrow(/quantity_nonnegative/);
  });

  it('links a Label to an Asset or a Location, never both', async () => {
    const location = id();
    const asset = id();
    await client.query("INSERT INTO locations (id, name) VALUES ($1, 'Freezer')", [location]);
    await client.query("INSERT INTO assets (id, name) VALUES ($1, 'TV')", [asset]);
    await client.query("INSERT INTO labels (code) VALUES ('7K2QX')"); // a Blank label
    await expect(
      client.query("INSERT INTO labels (code, asset_id, location_id) VALUES ('8M3RY', $1, $2)", [asset, location]),
    ).rejects.toThrow(/one_target/);
  });

  it('numbers Actions with a sequence that only goes up', async () => {
    const device = id();
    await client.query("INSERT INTO devices (id, name, key_hash) VALUES ($1, 'Kitchen phone', 'x')", [device]);
    const insert = () =>
      client.query(
        `INSERT INTO actions (id, device_id, type, shape_version, payload, device_time, corrected_time, outcome)
         VALUES ($1, $2, 'supply.used', 1, '{}', now(), now(), 'applied') RETURNING seq`,
        [id(), device],
      );
    const first = (await insert()).rows[0].seq;
    const second = (await insert()).rows[0].seq;
    expect(Number(second)).toBeGreaterThan(Number(first));
  });
});
