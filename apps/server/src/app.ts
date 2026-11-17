import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { HealthResponse } from '@inventory/shared';

export interface AppOptions {
  /** Folder holding the built web app. Served at `/` when it exists. */
  webRoot?: string;
  logger?: boolean;
}

export function buildApp({ webRoot, logger = false }: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

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
