import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDevEnv } from '../env.ts';
import { createDb } from './client.ts';

// Applies pending migrations from apps/server/drizzle (copied next to dist/ in the image).
loadDevEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationsFolder = process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, '../../drizzle');
const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder });
await pool.end();
console.log(`Migrations applied from ${migrationsFolder}`);
