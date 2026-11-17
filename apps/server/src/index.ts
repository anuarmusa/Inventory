import { resolve } from 'node:path';
import { buildApp } from './app.ts';
import { appVersionsFrom } from './app-versions.ts';
import { createDb } from './db/client.ts';
import { loadDevEnv } from './env.ts';

loadDevEnv();

const port = Number(process.env.PORT ?? 3000);
const webRoot = process.env.WEB_ROOT ?? resolve(import.meta.dirname, '../../web/dist');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const { db } = createDb(databaseUrl);

const app = buildApp({ webRoot, logger: true, db, appVersions: appVersionsFrom(process.env.APK_DIR) });
await app.listen({ host: '0.0.0.0', port });
