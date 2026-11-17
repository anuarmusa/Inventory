import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppRelease, type AppVersions, MIN_APP_VERSION } from '@inventory/shared';

/**
 * Reads the hosted release from `latest.json` beside the APK (written by the deploy script,
 * spec §9). No file, or an unreadable one, means no APK is hosted yet.
 */
export function readLatestRelease(apkDir: string | undefined): AppRelease | null {
  if (!apkDir) return null;
  try {
    const parsed = AppRelease.safeParse(JSON.parse(readFileSync(join(apkDir, 'latest.json'), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function appVersionsFrom(apkDir: string | undefined): () => AppVersions {
  return () => {
    const release = readLatestRelease(apkDir);
    return { latest: release?.version ?? null, minimum: MIN_APP_VERSION, notes: release?.notes ?? null };
  };
}
