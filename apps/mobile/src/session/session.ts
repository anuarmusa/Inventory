import type { Api } from '../api/client';
import type { LocalStore } from '../sync/local';

/**
 * Whether this phone is connected to the home server (spec §4.2 first run, §7 Pairing).
 *
 * - `needs_pairing`: first run, or a reinstall. The app holds at "Connect at home".
 * - `needs_first_sync`: paired, but the first full sync hasn't finished; still held at "Connect at home".
 * - `removed`: the Device was removed. "This phone was removed. Connect again."
 * - `ready`: paired and fully synced.
 *
 * Pure logic over a key/value store and the server API, so it can be tested without a phone.
 */
export type ConnectionStatus = 'needs_pairing' | 'needs_first_sync' | 'removed' | 'ready';

/** Keys the session keeps. The two Device keys live in secure storage; the rest in the local database. */
export const KEYS = {
  deviceKey: 'device_key',
  previousDeviceKey: 'previous_device_key',
  server: 'server',
  deviceId: 'device_id',
  deviceName: 'device_name',
  lastSeq: 'last_seq',
  firstSyncDone: 'first_sync_done',
  removed: 'removed',
} as const;

export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Session {
  status: ConnectionStatus;
  server: string | null;
  deviceId: string | null;
  deviceName: string | null;
  lastSeq: number;
}

export async function loadSession(store: SessionStore): Promise<Session> {
  const [key, server, deviceId, deviceName, lastSeq, firstSyncDone, removed] = await Promise.all([
    store.get(KEYS.deviceKey),
    store.get(KEYS.server),
    store.get(KEYS.deviceId),
    store.get(KEYS.deviceName),
    store.get(KEYS.lastSeq),
    store.get(KEYS.firstSyncDone),
    store.get(KEYS.removed),
  ]);
  const status: ConnectionStatus = removed
    ? 'removed'
    : !key
      ? 'needs_pairing'
      : firstSyncDone
        ? 'ready'
        : 'needs_first_sync';
  return { status, server, deviceId, deviceName, lastSeq: Number(lastSeq ?? 0) };
}

export interface ConnectRequest {
  server: string;
  code: string;
  name: string;
  model: string | null;
}

/**
 * Pairs with the home server, then does the first full sync. A phone that was removed sends its
 * previous key, so the server gives it back the same Device and its unsent Actions still sync.
 */
export async function connect(store: SessionStore, api: Api, local: LocalStore, request: ConnectRequest): Promise<Session> {
  const previousKey = (await store.get(KEYS.previousDeviceKey)) ?? (await store.get(KEYS.deviceKey));
  const paired = await api.redeem(request.server, {
    code: request.code,
    name: request.name,
    model: request.model,
    previousKey,
  });
  // Connected as a new Device: this phone's Unsent Actions are sent as the new Device's.
  const before = await store.get(KEYS.deviceId);
  if (before && before !== paired.deviceId) await local.reassignUnsent(paired.deviceId);
  await store.set(KEYS.deviceKey, paired.deviceKey);
  await store.set(KEYS.server, request.server);
  await store.set(KEYS.deviceId, paired.deviceId);
  await store.set(KEYS.deviceName, paired.name);
  await store.delete(KEYS.previousDeviceKey);
  await store.delete(KEYS.removed);
  await store.delete(KEYS.firstSyncDone);
  return finishFirstSync(store, api, local);
}

/** The first full sync after pairing. Until it succeeds the phone stays at "Connect at home". */
export async function finishFirstSync(store: SessionStore, api: Api, local: LocalStore): Promise<Session> {
  const [key, server] = await Promise.all([store.get(KEYS.deviceKey), store.get(KEYS.server)]);
  if (!key || !server) return loadSession(store);
  const { seq, changes } = await api.pull(server, key, 0);
  await local.commitSync(changes, [], seq);
  await store.set(KEYS.firstSyncDone, '1');
  return loadSession(store);
}

/** Moves the key aside so a reconnect can prove it is the same install. */
export async function markRemoved(store: SessionStore): Promise<void> {
  const key = await store.get(KEYS.deviceKey);
  if (key) await store.set(KEYS.previousDeviceKey, key);
  await store.delete(KEYS.deviceKey);
  await store.set(KEYS.removed, '1');
}

/** The name the app suggests for this phone at Pairing: its model, or a plain fallback. */
export function suggestedName(modelName: string | null, deviceName: string | null): string {
  return (modelName ?? deviceName ?? 'My phone').trim() || 'My phone';
}
