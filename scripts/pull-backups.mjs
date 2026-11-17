#!/usr/bin/env node
// pnpm run backups:pull: copies the server's backups to this PC (spec §11: the dev PC keeps a copy
// as a fallback to the USB drive). Into BACKUP_COPY_DIR (default ./backups-from-server, git-ignored).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = (name) =>
  process.env[name] ??
  (existsSync(join(root, '.env'))
    ? readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    : undefined);

const host = env('DEPLOY_HOST');
if (!host) {
  console.error('Set DEPLOY_HOST in .env, e.g. DEPLOY_HOST=admin@192.168.1.10');
  process.exit(1);
}
const target = resolve(root, env('BACKUP_COPY_DIR') || 'backups-from-server');
mkdirSync(target, { recursive: true });
// scp -r copies every backup folder; ones already here are simply copied again.
execSync(`scp -r ${host}:/srv/inventory/backups/. "${target}"`, { stdio: 'inherit', shell: true });
console.log(`✓ Backups copied to ${target}`);
