import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The phone's local database. It holds the last state pulled from the home server plus this phone's
 * unsent Actions (added by "Sync client in the app"). For now: small settings the phone keeps,
 * such as the server address and the last sync sequence number.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
