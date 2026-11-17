import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ActionBody, type BackupStatus, emptyInventory, type Inventory, inventoryFrom, type PulledChanges, type PushResult, type WebState } from '@inventory/shared';

/** The calls the dashboard makes. The dashboard records Actions as its own Device ("Dashboard"). */
export interface DashboardApi {
  state(): Promise<WebState>;
  record(actions: ActionBody[]): Promise<PushResult[]>;
  server(): Promise<{ version: string; lastBackup: BackupStatus | null }>;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T & { message?: string };
  if (!res.ok) throw new Error(body?.message ?? `The home server answered ${res.status}.`);
  return body;
}

export const dashboardApi: DashboardApi = {
  state: async () => json<WebState>(await fetch('/web/state')),
  record: async (actions) =>
    (
      await json<{ results: PushResult[] }>(
        await fetch('/web/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actions }) }),
      )
    ).results,
  server: async () => json(await fetch('/web/server')),
};

/** How often an open dashboard picks up what phones changed. */
const REFRESH_MS = 30_000;

export interface Household {
  inventory: Inventory;
  state: WebState | null;
  error: string | null;
  /** Records Actions in order, then reloads. */
  record(...actions: ActionBody[]): Promise<void>;
  reload(): Promise<void>;
}

export function useHousehold(api: DashboardApi = dashboardApi): Household {
  const [state, setState] = useState<WebState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Can’t reach the home server.');
    }
  }, [api]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const record = useCallback(
    async (...actions: ActionBody[]) => {
      try {
        await api.record(actions);
      } catch (e) {
        setError((e as Error).message);
      }
      await reload();
    },
    [api, reload],
  );

  const inventory = useMemo(() => (state ? inventoryFrom(state.changes as PulledChanges) : emptyInventory()), [state]);
  return { inventory, state, error, record, reload };
}
