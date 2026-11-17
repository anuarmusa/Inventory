import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AppVersions, MIN_APP_VERSION } from '@inventory/shared';

/**
 * Reads the latest hosted app version from `latest.json` beside the APK (written by the deploy
 * script, spec §9). No file yet means no APK is hosted.
 */
export function appVersionsFrom(apkDir: string | undefined): () => AppVersions {
  return () => {
    let latest: string | null = null;
    if (apkDir) {
      try {
        const parsed = JSON.parse(readFileSync(join(apkDir, 'latest.json'), 'utf8')) as { version?: unknown };
        if (typeof parsed.version === 'string') latest = parsed.version;
      } catch {
        latest = null;
      }
    }
    return { latest, minimum: MIN_APP_VERSION };
  };
}
