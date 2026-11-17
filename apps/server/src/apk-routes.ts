import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { readLatestRelease } from './app-versions.ts';

/** The download page's app release (spec §10.2): what's hosted, and the APK file itself. */
export function registerApkRoutes(app: FastifyInstance, { apkDir }: { apkDir: string | undefined }): void {
  app.get('/apk/latest', async () => ({ release: readLatestRelease(apkDir) }));

  app.get('/apk/download', async (_req, reply) => {
    const release = readLatestRelease(apkDir);
    const path = release && apkDir ? join(apkDir, release.file) : null;
    if (!release || !path || !existsSync(path)) {
      return reply.code(404).send({ error: 'not_found', message: 'No app has been put on the home server yet.' });
    }
    return reply
      .header('content-type', 'application/vnd.android.package-archive')
      .header('content-disposition', `attachment; filename="${release.file}"`)
      .send(createReadStream(path));
  });
}
