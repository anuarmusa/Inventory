import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

/** Where the SQL migrations live: apps/server/drizzle in the repo, /app/drizzle in the image. */
export const migrationsFolder = process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, '../../drizzle');

/** Applies every pending migration to the database at `url`. */
export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
