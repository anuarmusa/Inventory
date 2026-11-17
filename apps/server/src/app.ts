import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { type AppVersions, type HealthResponse, MIN_APP_VERSION } from '@inventory/shared';
import type { Db } from './db/client.ts';
import { registerSyncRoutes } from './sync/routes.ts';

export interface AppOptions {
  /** Folder holding the built web app. Served at `/` when it exists. */
  webRoot?: string;
  logger?: boolean;
  /** The database; sync routes are only registered when it is given. */
  db?: Db;
  /** Latest hosted and minimum accepted app versions. */
  appVersions?: () => AppVersions;
}

export function buildApp({
  webRoot,
  logger = false,
  db,
  appVersions = () => ({ latest: null, minimum: MIN_APP_VERSION }),
}: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  if (db) registerSyncRoutes(app, { db, appVersions });

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
