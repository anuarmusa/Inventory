import type { Action } from '@inventory/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { appMeta, serverRows, unsentActions } from '../db/schema';
import { KEYS } from '../session/session';
import { inventoryFrom, type PulledChanges, rowKey, TABLE_NAMES, type TableName } from './inventory';
import type { LocalStore } from './local';

/** On a repeated row, take the newly pulled data. */
const sqlExcludedData = sql`excluded.data`;

/** SQLite allows a limited number of bound values per statement. */
const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** The phone's LocalStore, in its SQLite database. */
export const phoneLocal: LocalStore = {
  async lastSeq() {
    const [row] = await db.select().from(appMeta).where(eq(appMeta.key, KEYS.lastSeq));
    return Number(row?.value ?? 0);
  },

  async serverState() {
    const rows = await db.select().from(serverRows);
    const byTable: Record<string, unknown[]> = {};
    for (const row of rows) (byTable[row.tableName] ??= []).push(row.data);
    return inventoryFrom(byTable as PulledChanges);
  },

  async listUnsent() {
    const rows = await db.select().from(unsentActions).orderBy(asc(unsentActions.position));
    return rows.map((r) => r.action);
  },

  async addUnsent(action) {
    await db.insert(unsentActions).values({ id: action.id, action });
  },

  async replaceUnsent(action) {
    const updated = await db
      .update(unsentActions)
      .set({ action })
      .where(eq(unsentActions.id, action.id))
      .returning({ id: unsentActions.id });
    return updated.length > 0;
  },

  async dropUnsent(id) {
    const dropped = await db.delete(unsentActions).where(eq(unsentActions.id, id)).returning({ id: unsentActions.id });
    return dropped.length > 0;
  },

  async reassignUnsent(deviceId) {
    const rows = await db.select().from(unsentActions);
    for (const row of rows) {
      await db
        .update(unsentActions)
        .set({ action: { ...row.action, deviceId } as Action })
        .where(eq(unsentActions.position, row.position));
    }
  },

  async commitSync(changes, acceptedIds, seq) {
    db.transaction((tx) => {
      for (const table of TABLE_NAMES as TableName[]) {
        const values = (changes[table] ?? []).map((row) => ({
          tableName: table,
          rowKey: rowKey(table, row as never),
          data: row as unknown as Record<string, unknown>,
        }));
        for (const part of chunks(values)) {
          tx.insert(serverRows)
            .values(part)
            .onConflictDoUpdate({ target: [serverRows.tableName, serverRows.rowKey], set: { data: sqlExcludedData } })
            .run();
        }
      }
      for (const part of chunks(acceptedIds)) tx.delete(unsentActions).where(inArray(unsentActions.id, part)).run();
      tx.insert(appMeta)
        .values({ key: KEYS.lastSeq, value: String(seq) })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: String(seq) } })
        .run();
    });
  },
};
