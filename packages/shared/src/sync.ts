import { z } from 'zod';
import { ACTION_SHAPE_VERSION } from './actions.ts';

/**
 * The sync protocol between a Device and the home server (spec §4.2).
 * Requests carry the Device key as `Authorization: Bearer <key>`.
 */

/**
 * The oldest app version the server accepts pushes from. Raise it only when older apps would send
 * Action shapes the server can no longer read, or must not sync (spec §9).
 */
export const MIN_APP_VERSION = '0.1.0';

/** The newest Action shape version this code understands. */
export const LATEST_ACTION_SHAPE_VERSION = ACTION_SHAPE_VERSION;

const version = z.string().regex(/^\d+\.\d+\.\d+$/, 'A version looks like 1.4.0');

/** The header a Device sends its app version in on every request, so the Device list knows it. */
export const APP_VERSION_HEADER = 'x-app-version';

/** Compares `major.minor.patch` versions: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** What the server tells every Device about app versions. */
export const AppVersions = z.object({
  /** The newest APK the server hosts, or null when none is hosted yet. */
  latest: version.nullable(),
  minimum: version,
  /** The one-line what's new of the latest version, for the "Update available" banner. */
  notes: z.string().nullable().optional(),
});
export type AppVersions = z.infer<typeof AppVersions>;

export const PushRequest = z.object({
  /** The Device's clock when it sent the push; the server works out the Device's clock offset from it. */
  deviceNow: z.iso.datetime({ offset: true }),
  appVersion: version,
  /** Unsent Actions in the order they were taken. Validated one by one on the server. */
  actions: z.array(z.unknown()).max(1000),
});
export type PushRequest = z.infer<typeof PushRequest>;

export const PushResult = z.object({
  id: z.uuid(),
  outcome: z.enum(['applied', 'skipped']),
  /** True when applying this Action raised a Mismatch. */
  mismatch: z.boolean(),
});
export type PushResult = z.infer<typeof PushResult>;

export const PushResponse = z.object({
  /** The server's sequence number after this push. */
  seq: z.number().int(),
  app: AppVersions,
  results: z.array(PushResult),
});
export type PushResponse = z.infer<typeof PushResponse>;

/** Why a push was refused. The Device keeps its Actions and shows the matching message. */
export const SyncErrorCode = z.enum([
  /** The app is older than the server's minimum: "Update needed to sync". */
  'app_too_old',
  /** The app sent an Action shape this server doesn't know: "The home server is older than this app". */
  'server_too_old',
  /** The Device key is unknown. */
  'unknown_device',
  /** The Device was removed: "This phone was removed. Connect again." */
  'device_removed',
  /** The request or an Action is malformed. */
  'invalid_request',
]);
export type SyncErrorCode = z.infer<typeof SyncErrorCode>;

export const SyncError = z.object({
  error: SyncErrorCode,
  message: z.string(),
  app: AppVersions.optional(),
});
export type SyncError = z.infer<typeof SyncError>;

/**
 * The hosted app release, as `latest.json` beside the APK describes it (written by the deploy
 * script, spec §9 and §11).
 */
export const AppRelease = z.object({
  version,
  /** The day it was released, `YYYY-MM-DD`. */
  date: z.iso.date(),
  /** One line of what's new. */
  notes: z.string(),
  /** The APK's file name in the same folder. */
  file: z.string().regex(/^[\w.-]+\.apk$/),
});
export type AppRelease = z.infer<typeof AppRelease>;
