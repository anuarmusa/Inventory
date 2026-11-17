import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';
import { createApi } from '../api/client';
import { db } from '../db/client';
import { checkIn, connect, type ConnectRequest, finishFirstSync, loadSession, type Session } from './session';
import { phoneStore } from './store';

interface SessionContext {
  /** Null while the local database and session are loading. */
  session: Session | null;
  /** A local database problem that stops the app. */
  error: string | null;
  connect(request: ConnectRequest): Promise<void>;
  finishFirstSync(): Promise<void>;
  checkIn(): Promise<void>;
}

const Context = createContext<SessionContext | null>(null);
const api = createApi();

export function SessionProvider({ children }: { children: ReactNode }) {
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const [session, setSession] = useState<Session | null>(null);

  /** Runs a session step and shows its result; on failure shows what is stored, then reports the error. */
  const refreshFrom = useCallback(async (work: Promise<Session>) => {
    try {
      setSession(await work);
    } catch (error) {
      setSession(await loadSession(phoneStore));
      throw error;
    }
  }, []);
  /** Checking in never leaves the app stuck: on an unexpected error it falls back to what is stored. */
  const safeCheckIn = useCallback(() => checkIn(phoneStore, api).catch(() => loadSession(phoneStore)), []);

  useEffect(() => {
    if (migrated) void refreshFrom(safeCheckIn());
  }, [migrated, refreshFrom, safeCheckIn]);

  // Check in again whenever the app comes back to the foreground.
  useEffect(() => {
    if (!migrated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFrom(safeCheckIn());
    });
    return () => sub.remove();
  }, [migrated, refreshFrom, safeCheckIn]);

  const value = useMemo<SessionContext>(
    () => ({
      session,
      error: migrationError ? `Local database error: ${migrationError.message}` : null,
      connect: (request) => refreshFrom(connect(phoneStore, api, request)),
      finishFirstSync: () => refreshFrom(finishFirstSync(phoneStore, api)),
      checkIn: () => refreshFrom(safeCheckIn()),
    }),
    [session, migrationError, refreshFrom, safeCheckIn],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionContext {
  const value = useContext(Context);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
