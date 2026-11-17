import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { AppVersions, HealthResponse } from '@inventory/shared';
import type { Db } from './db/client.ts';
import { registerApkRoutes } from './apk-routes.ts';
import { appVersionsFrom } from './app-versions.ts';
import { registerPairingRoutes } from './pairing/routes.ts';
import { registerPhotoRoutes } from './photo-routes.ts';
import { registerSyncRoutes } from './sync/routes.ts';
import { registerWebRoutes } from './web-routes.ts';

export interface AppOptions {
  /** Folder holding the built web app. Served at `/` when it exists. */
  webRoot?: string;
  logger?: boolean;
  /** The database; sync routes are only registered when it is given. */
  db?: Db;
  /** The folder holding the APK and its latest.json. */
  apkDir?: string;
  /** Latest hosted and minimum accepted app versions (default: read from `apkDir`). */
  appVersions?: () => AppVersions;
  /** Overrides the server address put in pairing offers. */
  publicAddress?: string;
  /** The clock; tests replace it. */
  now?: () => Date;
  /** The photos folder; photo routes are registered when it and the database are given. */
  photosDir?: string;
  /** This server's version, shown in the dashboard footer. */
  serverVersion?: string;
  /** Where the nightly backup writes its last result. */
  backupStatusFile?: string;
}

export function buildApp({
  webRoot,
  logger = false,
  db,
  apkDir,
  appVersions = appVersionsFrom(apkDir),
  publicAddress,
  now,
  photosDir,
  serverVersion = '0.0.0',
  backupStatusFile,
}: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));
  registerApkRoutes(app, { apkDir });

  if (db) {
    registerSyncRoutes(app, { db, appVersions });
    registerPairingRoutes(app, { db, publicAddress, now });
    if (photosDir) registerPhotoRoutes(app, { db, photosDir });
    registerWebRoutes(app, { db, appVersions, serverVersion, backupStatusFile });
  }

  if (webRoot && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot });
    // The web app is a single-page app: unknown GET paths get index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
