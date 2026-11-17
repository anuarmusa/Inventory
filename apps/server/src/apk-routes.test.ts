import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

function apkFolder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'apk-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

const release = { version: '1.4.0', date: '2026-11-15', notes: 'Undo after saving.', file: 'inventory-1.4.0.apk' };

describe('the hosted app', () => {
  it('describes the latest release', async () => {
    const app = buildApp({ apkDir: apkFolder({ 'latest.json': JSON.stringify(release), 'inventory-1.4.0.apk': 'APK' }) });
    const res = await app.inject({ method: 'GET', url: '/apk/latest' });
    expect(res.json()).toEqual({ release });
  });

  it('serves the APK as a download', async () => {
    const app = buildApp({ apkDir: apkFolder({ 'latest.json': JSON.stringify(release), 'inventory-1.4.0.apk': 'APK-BYTES' }) });
    const res = await app.inject({ method: 'GET', url: '/apk/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(res.headers['content-disposition']).toBe('attachment; filename="inventory-1.4.0.apk"');
    expect(res.body).toBe('APK-BYTES');
  });

  it('says nothing is hosted when there is no release yet', async () => {
    const app = buildApp({ apkDir: apkFolder({}) });
    expect((await app.inject({ method: 'GET', url: '/apk/latest' })).json()).toEqual({ release: null });
    expect((await app.inject({ method: 'GET', url: '/apk/download' })).statusCode).toBe(404);
  });

  it('ignores a release file that is malformed or names a missing APK', async () => {
    const broken = buildApp({ apkDir: apkFolder({ 'latest.json': '{"version":"1.4"}' }) });
    expect((await broken.inject({ method: 'GET', url: '/apk/latest' })).json()).toEqual({ release: null });
    const missing = buildApp({ apkDir: apkFolder({ 'latest.json': JSON.stringify(release) }) });
    expect((await missing.inject({ method: 'GET', url: '/apk/download' })).statusCode).toBe(404);
  });

  it('refuses a release that points outside the APK folder', async () => {
    const app = buildApp({ apkDir: apkFolder({ 'latest.json': JSON.stringify({ ...release, file: '../secret.apk' }) }) });
    expect((await app.inject({ method: 'GET', url: '/apk/download' })).statusCode).toBe(404);
  });
});
