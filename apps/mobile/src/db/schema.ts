import type { Action } from '@inventory/shared';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The phone's local database: the last state pulled from the home server, this phone's Unsent
 * Actions, and small settings such as the server address and the last sync sequence number.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * The server's rows as the last pull sent them, one table for all: `table_name` is the pull's table
 * (supplies, batches…) and `row_key` the row's id or code. Kept as JSON so a server column added
 * later needs no phone migration.
 */
export const serverRows = sqliteTable(
  'server_rows',
  {
    tableName: text('table_name').notNull(),
    rowKey: text('row_key').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tableName, t.rowKey] })],
);

/** Actions taken on this phone that the server hasn't taken yet, in the order they were taken. */
export const unsentActions = sqliteTable('unsent_actions', {
  position: integer('position').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  action: text('action', { mode: 'json' }).$type<Action>().notNull(),
});
