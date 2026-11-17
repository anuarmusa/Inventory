import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@inventory/shared';
import { buildApp } from './app.ts';

describe('GET /health', () => {
  it('returns ok in the shared shape', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ status: 'ok' });
  });
});

describe('serving the web app', () => {
  const webRoot = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Inventory</title>');

  it('serves index.html at /', async () => {
    const res = await buildApp({ webRoot }).inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Inventory</title>');
  });

  it('falls back to index.html for unknown pages', async () => {
    const res = await buildApp({ webRoot }).inject({ method: 'GET', url: '/dashboard', headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Inventory</title>');
  });

  it('returns 404 JSON for unknown API paths', async () => {
    const res = await buildApp({ webRoot }).inject({ method: 'GET', url: '/nope', headers: { accept: 'application/json' } });
    expect(res.statusCode).toBe(404);
  });
});
