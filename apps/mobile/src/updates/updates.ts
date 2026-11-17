import { type AppVersions, compareVersions } from '@inventory/shared';

/**
 * App updates (spec §9). Sync answers carry the latest hosted version and the minimum accepted one;
 * there's no separate polling. Below the minimum, a red "Update needed to sync" banner shows (the
 * app keeps working offline and sync waits). Otherwise a newer version shows a dismissible
 * "Update available" banner with the one-line what's new.
 */
export type UpdateBanner =
  | { kind: 'none' }
  | { kind: 'available'; version: string; notes: string | null }
  | { kind: 'required'; version: string | null };

export function updateBanner(
  current: string,
  app: AppVersions | null,
  { refusedAsTooOld = false, dismissed = null }: { refusedAsTooOld?: boolean; dismissed?: string | null } = {},
): UpdateBanner {
  const latest = app?.latest ?? null;
  const belowMinimum = refusedAsTooOld || (app !== null && compareVersions(current, app.minimum) < 0);
  if (belowMinimum) return { kind: 'required', version: latest };
  if (latest && compareVersions(latest, current) > 0 && dismissed !== latest) {
    return { kind: 'available', version: latest, notes: app?.notes ?? null };
  }
  return { kind: 'none' };
}

/** "v1.4" for 1.4.0, "v1.4.2" otherwise. */
export function shortVersion(version: string): string {
  return `v${version.replace(/\.0$/, '')}`;
}
