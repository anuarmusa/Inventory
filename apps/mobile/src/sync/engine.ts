import { Action, type ActionBody } from '@inventory/shared';
import { type Api, ApiError } from '../api/client';
import { KEYS, markRemoved, type SessionStore } from '../session/session';
import type { LocalStore } from './local';

/**
 * Syncing with the home server (spec §4.2, §4.5): push the Unsent Actions, pull what changed, then
 * store both in one step. The server is the source of truth: its result replaces the local view.
 *
 * Sync runs when the app opens or returns to the foreground, after each Action, and from "Sync now".
 * Syncs, edits and drops take turns, so an Unsent Action is never edited while it is being sent.
 */

/** Why the last sync couldn't send the Unsent Actions. They stay on the phone either way. */
export type SyncProblem =
  /** Below the server's minimum app version: "Update needed to sync". */
  | 'app_too_old'
  /** The server doesn't know an Action shape this app sends: "The home server is older than this app". */
  | 'server_too_old'
  /** The server refused or failed for another reason. */
  | 'failed';

export interface SyncState {
  /** Whether the home server answered the last sync; null before the first try. */
  home: boolean | null;
  syncing: boolean;
  problem: SyncProblem | null;
  /** When a sync last finished, as an ISO time. */
  lastSyncedAt: string | null;
}

export type SyncResult = 'synced' | 'away' | 'removed' | 'not_connected';

export interface SyncDeps {
  session: SessionStore;
  local: LocalStore;
  api: Api;
  appVersion: string;
  newId: () => string;
  now?: () => Date;
}

export interface SyncEngine {
  sync(): Promise<SyncResult>;
  /**
   * Records an Action as unsent, then syncs in the background. `syncDelayMs` holds that sync back,
   * e.g. while an Undo toast is showing, so Undo can simply drop the Action.
   */
  record(body: ActionBody, options?: { syncDelayMs?: number }): Promise<Action>;
  /** Changes an Unsent Action. False when it has already synced. */
  editUnsent(id: string, body: ActionBody): Promise<boolean>;
  /** Drops an Unsent Action; nothing of it reaches history. False when it has already synced. */
  dropUnsent(id: string): Promise<boolean>;
  state(): SyncState;
  /** Called after every state change and every change to the stored data. */
  subscribe(listener: () => void): () => void;
}

/** Actions sent per push; the server accepts up to 1000. */
const PUSH_CHUNK = 200;

export function createSyncEngine({ session, local, api, appVersion, newId, now = () => new Date() }: SyncDeps): SyncEngine {
  let state: SyncState = { home: null, syncing: false, problem: null, lastSyncedAt: null };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  const setState = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    changed();
  };

  let tail: Promise<unknown> = Promise.resolve();
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  }

  async function runSync(): Promise<SyncResult> {
    const [key, server] = await Promise.all([session.get(KEYS.deviceKey), session.get(KEYS.server)]);
    if (!key || !server) return 'not_connected';
    setState({ syncing: true });
    try {
      let problem: SyncProblem | null = null;
      const accepted: string[] = [];
      const unsent = await local.listUnsent();
      try {
        for (let i = 0; i < unsent.length; i += PUSH_CHUNK) {
          const res = await api.push(server, key, {
            deviceNow: now().toISOString(),
            appVersion,
            actions: unsent.slice(i, i + PUSH_CHUNK),
          });
          accepted.push(...res.results.map((r) => r.id));
        }
      } catch (error) {
        // A refused push keeps the Actions; the pull still brings the phone up to date.
        if (!(error instanceof ApiError)) throw error;
        if (error.reason === 'app_too_old' || error.reason === 'server_too_old') problem = error.reason;
        else if (error.reason === 'invalid_request') problem = 'failed';
        else throw error;
      }
      const pulled = await api.pull(server, key, await local.lastSeq());
      await local.commitSync(pulled.changes, accepted, pulled.seq);
      setState({ home: true, problem, lastSyncedAt: now().toISOString() });
      return 'synced';
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.reason === 'device_removed' || error.reason === 'unknown_device') {
        await markRemoved(session);
        setState({ home: true, problem: null });
        return 'removed';
      }
      if (error.reason === 'unreachable') {
        setState({ home: false });
        return 'away';
      }
      setState({ home: true, problem: 'failed' });
      return 'away';
    } finally {
      setState({ syncing: false });
    }
  }

  // One sync waiting behind the running one is enough: it will send everything recorded meanwhile.
  let waiting: Promise<SyncResult> | null = null;
  function sync(): Promise<SyncResult> {
    if (waiting) return waiting;
    const run = inTurn(() => {
      waiting = null;
      return runSync();
    });
    waiting = run;
    return run;
  }

  return {
    sync,
    async record(body, { syncDelayMs = 0 } = {}) {
      const deviceId = await session.get(KEYS.deviceId);
      if (!deviceId) throw new Error('This phone isn’t connected to the home server yet.');
      const action = Action.parse({ id: newId(), deviceId, deviceTime: now().toISOString(), v: 1, ...body });
      await local.addUnsent(action);
      changed();
      const later = () => void sync().catch(() => undefined);
      if (syncDelayMs > 0) setTimeout(later, syncDelayMs);
      else later();
      return action;
    },
    editUnsent: (id, body) =>
      inTurn(async () => {
        const existing = (await local.listUnsent()).find((a) => a.id === id);
        if (!existing) return false;
        const { id: _id, deviceId, deviceTime, v } = existing;
        const ok = await local.replaceUnsent(Action.parse({ id: _id, deviceId, deviceTime, v, ...body }));
        changed();
        return ok;
      }),
    dropUnsent: (id) =>
      inTurn(async () => {
        const ok = await local.dropUnsent(id);
        changed();
        return ok;
      }),
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
