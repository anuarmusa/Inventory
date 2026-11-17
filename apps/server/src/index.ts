import { resolve } from 'node:path';
import { buildApp } from './app.ts';
import { createDb } from './db/client.ts';
import { loadDevEnv } from './env.ts';

loadDevEnv();

const port = Number(process.env.PORT ?? 3000);
const webRoot = process.env.WEB_ROOT ?? resolve(import.meta.dirname, '../../web/dist');

// The APK folder: set APK_DIR in production; on the dev PC it is the mobile app's local build output.
const apkDir = process.env.APK_DIR ?? resolve(import.meta.dirname, '../../mobile/dist');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const { db } = createDb(databaseUrl);

const app = buildApp({
  webRoot,
  logger: true,
  db,
  apkDir,
  publicAddress: process.env.PUBLIC_ADDRESS || undefined,
});
await app.listen({ host: '0.0.0.0', port });
