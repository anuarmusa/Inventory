import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app.ts';
import { createDb } from './db/client.ts';
import { loadDevEnv } from './env.ts';

loadDevEnv();

/** The server package's version (beside dist/ in the image, beside src/ on the dev PC). */
function packageVersion(): string {
  try {
    return (JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const port = Number(process.env.PORT ?? 3000);
const webRoot = process.env.WEB_ROOT ?? resolve(import.meta.dirname, '../../web/dist');

// The APK folder: set APK_DIR in production; on the dev PC it is the mobile app's local build output.
const apkDir = process.env.APK_DIR ?? resolve(import.meta.dirname, '../../mobile/dist');

// Photos: set PHOTOS_DIR in production (under /srv/inventory); on the dev PC a folder beside the repo's server.
const photosDir = process.env.PHOTOS_DIR ?? resolve(import.meta.dirname, '../photos');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const { db } = createDb(databaseUrl);

const app = buildApp({
  webRoot,
  logger: true,
  db,
  apkDir,
  photosDir,
  // SERVER_VERSION overrides the package's version.
  serverVersion: process.env.SERVER_VERSION ?? packageVersion(),
  backupStatusFile: process.env.BACKUP_STATUS_FILE || undefined,
  publicAddress: process.env.PUBLIC_ADDRESS || undefined,
});
await app.listen({ host: '0.0.0.0', port });
