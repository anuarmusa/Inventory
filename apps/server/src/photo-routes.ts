import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Db } from './db/client.ts';
import { authenticateDevice } from './sync/auth.ts';

/**
 * Photos (spec §4.2): stored as files under the photos folder, named by photo id. Records refer to
 * them by id. A phone uploads a photo when it is home (`PUT /photos/:id`, with its Device key);
 * phones and the dashboard fetch it on first view (`GET /photos/:id`). Phones resize to 1600 px on
 * the long edge before upload, so a photo is a few hundred KB.
 */

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Well above a 1600 px JPEG; anything bigger wasn't resized. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function registerPhotoRoutes(app: FastifyInstance, { db, photosDir }: { db: Db; photosDir: string }): void {
  mkdirSync(photosDir, { recursive: true });
  const pathOf = (id: string) => join(photosDir, `${id.toLowerCase()}.jpg`);

  app.addContentTypeParser(['image/jpeg', 'image/png'], { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  app.put<{ Params: { id: string } }>('/photos/:id', async (req, reply) => {
    const auth = await authenticateDevice(db, req.headers.authorization);
    if ('error' in auth) return reply.code(401).send({ error: auth.error, message: 'This phone is not connected to this home server.' });
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'invalid_request', message: 'A photo id is a UUID.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return reply.code(400).send({ error: 'invalid_request', message: 'Send the photo as image/jpeg.' });
    }
    const path = pathOf(req.params.id);
    // Photos never change: an upload that already arrived is accepted again without rewriting.
    if (!existsSync(path)) {
      const partial = `${path}.part`;
      writeFileSync(partial, req.body);
      renameSync(partial, path);
    }
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/photos/:id', async (req, reply) => {
    const path = ID.test(req.params.id) ? pathOf(req.params.id) : null;
    if (!path || !existsSync(path)) return reply.code(404).send({ error: 'not_found', message: 'This photo hasn’t reached the home server yet.' });
    return reply
      .header('content-type', 'image/jpeg')
      .header('content-length', statSync(path).size)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(path));
  });
}
