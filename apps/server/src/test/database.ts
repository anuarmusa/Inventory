import pg from 'pg';
import { loadDevEnv } from '../env.ts';
import { createDb, type Db } from '../db/client.ts';
import { runMigrations } from '../db/migrations.ts';

/**
 * A throwaway, fully migrated database for tests that need real Postgres.
 * Returns null when no database is reachable, so those tests can skip.
 */
export interface TestDatabase {
  url: string;
  db: Db;
  client: pg.Client;
  close(): Promise<void>;
}

loadDevEnv();
const baseUrl = process.env.DATABASE_URL;

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** True when the dev database is reachable. */
export async function databaseAvailable(): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    await admin('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `inventory_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin(`CREATE DATABASE ${name}`);
  const url = new URL(baseUrl!);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  const { db, pool } = createDb(url.toString());
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  return {
    url: url.toString(),
    db,
    client,
    async close() {
      await client.end();
      await pool.end();
      await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}
