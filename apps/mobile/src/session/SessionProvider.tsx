import type { Action, ActionBody } from '@inventory/shared';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';
import { createApi } from '../api/client';
import { db } from '../db/client';
import { createSyncEngine, type SyncState } from '../sync/engine';
import { emptyInventory, type Inventory, replay } from '../sync/inventory';
import { phoneLocal } from '../sync/phoneLocal';
import { connect, type ConnectRequest, finishFirstSync, loadSession, type Session } from './session';
import { phoneStore } from './store';

interface SessionContext {
  /** Null while the local database and session are loading. */
  session: Session | null;
  /** A local database problem that stops the app. */
  error: string | null;
  connect(request: ConnectRequest): Promise<void>;
  finishFirstSync(): Promise<void>;
  /** "Sync now". */
  sync(): Promise<void>;
  syncState: SyncState;
  /** What the app shows: the server state with this phone's Unsent Actions replayed on top. */
  inventory: Inventory;
  unsent: Action[];
  record(body: ActionBody): Promise<Action>;
  editUnsent(id: string, body: ActionBody): Promise<boolean>;
  dropUnsent(id: string): Promise<boolean>;
}

const Context = createContext<SessionContext | null>(null);
const api = createApi();
const engine = createSyncEngine({
  session: phoneStore,
  local: phoneLocal,
  api,
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  newId: randomUUID,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const [session, setSession] = useState<Session | null>(null);
  const [server, setServer] = useState<Inventory>(emptyInventory);
  const [unsent, setUnsent] = useState<Action[]>([]);
  const syncState = useSyncExternalStore(engine.subscribe, engine.state);

  /** Re-reads what is stored: the session, the server state and the Unsent Actions. */
  const reload = useCallback(async () => {
    const [s, inv, pending] = await Promise.all([loadSession(phoneStore), phoneLocal.serverState(), phoneLocal.listUnsent()]);
    setSession(s);
    setServer(inv);
    setUnsent(pending);
  }, []);

  /** Runs a step, then shows what is stored, whether or not it worked; failures still reach the caller. */
  const thenReload = useCallback(
    async <T,>(work: Promise<T>): Promise<T> => {
      try {
        return await work;
      } finally {
        await reload();
      }
    },
    [reload],
  );

  /** Syncing never leaves the app stuck: on an unexpected error it shows what is stored. */
  const syncQuietly = useCallback(() => thenReload(engine.sync().then(() => undefined, () => undefined)), [thenReload]);

  // Every stored change (an Action recorded, a sync finished) refreshes what is shown.
  useEffect(() => {
    if (!migrated) return;
    return engine.subscribe(() => {
      if (!engine.state().syncing) void reload();
    });
  }, [migrated, reload]);

  // Sync when the app opens and whenever it comes back to the foreground.
  useEffect(() => {
    if (!migrated) return;
    void syncQuietly();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncQuietly();
    });
    return () => sub.remove();
  }, [migrated, syncQuietly]);

  const inventory = useMemo(() => replay(server, unsent), [server, unsent]);

  const value = useMemo<SessionContext>(
    () => ({
      session,
      error: migrationError ? `Local database error: ${migrationError.message}` : null,
      connect: (request) => thenReload(connect(phoneStore, api, phoneLocal, request)).then(() => undefined),
      finishFirstSync: () => thenReload(finishFirstSync(phoneStore, api, phoneLocal)).then(() => undefined),
      sync: syncQuietly,
      syncState,
      inventory,
      unsent,
      record: (body) => thenReload(engine.record(body)),
      editUnsent: (id, body) => thenReload(engine.editUnsent(id, body)),
      dropUnsent: (id) => thenReload(engine.dropUnsent(id)),
    }),
    [session, migrationError, thenReload, syncQuietly, syncState, inventory, unsent],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionContext {
  const value = useContext(Context);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
