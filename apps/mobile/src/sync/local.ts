import type { Action } from '@inventory/shared';
import { KEYS, type SessionStore } from '../session/session';
import { emptyInventory, type Inventory, inventoryFrom, type PulledChanges, rowKey, TABLE_NAMES } from './inventory';

/**
 * What the phone keeps between syncs: the server state it last pulled and its Unsent Actions, in the
 * order they were taken. The phone's copy lives in SQLite (`phoneLocal.ts`); tests use `memoryLocal`.
 */
export interface LocalStore {
  /** The server sequence number the stored state is complete up to. */
  lastSeq(): Promise<number>;
  serverState(): Promise<Inventory>;
  listUnsent(): Promise<Action[]>;
  addUnsent(action: Action): Promise<void>;
  /** Replaces an Unsent Action with the same id, keeping its place. False when it has already synced. */
  replaceUnsent(action: Action): Promise<boolean>;
  /** False when it has already synced. */
  dropUnsent(id: string): Promise<boolean>;
  /** Gives every Unsent Action to this Device, after the phone connects again as a new Device. */
  reassignUnsent(deviceId: string): Promise<void>;
  /**
   * Stores one sync's result in one step: the pulled rows, the new sequence number, and drops the
   * Actions the server took. If the phone dies part way, nothing is lost: pushes are safe to repeat.
   */
  commitSync(changes: PulledChanges, acceptedIds: readonly string[], seq: number): Promise<void>;
}

/**
 * An in-memory LocalStore, for tests. Like the phone's, it keeps the sequence number in the session
 * store's `last_seq` when given one.
 */
export function memoryLocal(meta?: SessionStore): LocalStore & { unsent: Action[]; rows: PulledChanges } {
  let seq = 0;
  const local = {
    unsent: [] as Action[],
    rows: {} as PulledChanges,
    lastSeq: async () => (meta ? Number((await meta.get(KEYS.lastSeq)) ?? 0) : seq),
    serverState: async () => (Object.keys(local.rows).length ? inventoryFrom(local.rows) : emptyInventory()),
    listUnsent: async () => [...local.unsent],
    addUnsent: async (action: Action) => {
      local.unsent.push(action);
    },
    replaceUnsent: async (action: Action) => {
      const i = local.unsent.findIndex((a) => a.id === action.id);
      if (i < 0) return false;
      local.unsent[i] = action;
      return true;
    },
    dropUnsent: async (id: string) => {
      const before = local.unsent.length;
      local.unsent = local.unsent.filter((a) => a.id !== id);
      return local.unsent.length < before;
    },
    reassignUnsent: async (deviceId: string) => {
      local.unsent = local.unsent.map((a) => ({ ...a, deviceId }));
    },
    commitSync: async (changes: PulledChanges, acceptedIds: readonly string[], newSeq: number) => {
      const inv = inventoryFrom(local.rows);
      for (const table of TABLE_NAMES) {
        for (const row of changes[table] ?? []) (inv[table] as Record<string, unknown>)[rowKey(table, row as never)] = row;
      }
      local.rows = Object.fromEntries(TABLE_NAMES.map((t) => [t, Object.values(inv[t])])) as PulledChanges;
      local.unsent = local.unsent.filter((a) => !acceptedIds.includes(a.id));
      if (meta) await meta.set(KEYS.lastSeq, String(newSeq));
      else seq = newSeq;
    },
  };
  return local;
}
