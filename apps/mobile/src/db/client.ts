import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

/** The phone's local database file. */
export const DATABASE_NAME = 'inventory.db';

export const sqlite = openDatabaseSync(DATABASE_NAME);
export const db = drizzle(sqlite, { schema });
