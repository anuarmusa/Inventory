import { APP_VERSION_HEADER, type AppVersions, type PushRequest, type PushResponse, type RedeemRequest, type RedeemResponse } from '@inventory/shared';
import type { PulledChanges } from '@inventory/shared';

/**
 * Talks to the home server. Every failure becomes an ApiError with a reason the screens can explain.
 * `unreachable` means the server didn't answer: usually the phone isn't on the home Wi-Fi.
 */
export type ApiErrorReason =
  | 'unreachable'
  | 'invalid_code'
  | 'too_many_attempts'
  | 'device_removed'
  | 'unknown_device'
  | 'app_too_old'
  | 'server_too_old'
  | 'invalid_request'
  | 'server_error';

export class ApiError extends Error {
  constructor(
    readonly reason: ApiErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PullResult {
  /** The server's sequence number this snapshot is complete up to. */
  seq: number;
  /** Rows changed since the `since` asked for. */
  changes: PulledChanges;
  app: AppVersions;
  /** Changes when the server's database is restored from a backup. */
  epoch?: string | null;
}

export interface Api {
  redeem(server: string, body: RedeemRequest): Promise<RedeemResponse>;
  pull(server: string, key: string, since: number): Promise<PullResult>;
  push(server: string, key: string, body: PushRequest): Promise<PushResponse>;
}

const KNOWN: ApiErrorReason[] = [
  'invalid_code',
  'too_many_attempts',
  'device_removed',
  'unknown_device',
  'app_too_old',
  'server_too_old',
  'invalid_request',
];

/** "At home" means the server answers within this time. */
const TIMEOUT_MS = 5_000;

/** `appVersion` is sent with every sync, so the Device list can flag out-of-date phones. */
export function createApi(fetchImpl: typeof fetch = fetch, timeoutMs = TIMEOUT_MS, appVersion?: string): Api {
  const versionHeader: Record<string, string> = appVersion ? { [APP_VERSION_HEADER]: appVersion } : {};
  async function call<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      throw new ApiError('unreachable', 'Can’t reach the home server. Are you on the home Wi-Fi?');
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!res.ok) {
      const reason = KNOWN.find((k) => k === body?.error) ?? 'server_error';
      throw new ApiError(reason, body?.message ?? `The home server answered ${res.status}.`);
    }
    return body as T;
  }

  return {
    redeem: (server, body) =>
      call<RedeemResponse>(`${server}/pairing/redeem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    pull: (server, key, since) =>
      call<PullResult>(`${server}/sync/pull?since=${since}`, { headers: { authorization: `Bearer ${key}`, ...versionHeader } }),
    push: (server, key, body) =>
      call<PushResponse>(`${server}/sync/push`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...versionHeader },
        body: JSON.stringify(body),
      }),
  };
}
