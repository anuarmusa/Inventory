import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}
