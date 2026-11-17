import { describe, expect, it } from 'vitest';
import { bumpPatch, imagesToRemove, latestJson, nextVersionCode, remoteScript, setEnv } from './deploy-lib.mjs';

describe('deploy', () => {
  it('bumps the visible version and the Android version code', () => {
    expect(bumpPatch('1.4.2')).toBe('1.4.3');
    expect(() => bumpPatch('v1')).toThrow();
    expect(nextVersionCode(undefined)).toBe(1);
    expect(nextVersionCode(41)).toBe(42);
  });

  it('writes latest.json with the one-line what’s new', () => {
    expect(latestJson('1.4.0', ' Undo after saving. \n', new Date(2026, 10, 15))).toEqual({
      version: '1.4.0',
      date: '2026-11-15',
      notes: 'Undo after saving.',
      file: 'inventory-1.4.0.apk',
    });
  });

  it('sets .env values, keeping the rest', () => {
    expect(setEnv('POSTGRES_PASSWORD=x\nAPP_VERSION=1.3.0\n', { APP_VERSION: '1.4.0', PREVIOUS_APP_VERSION: '1.3.0' })).toBe(
      'POSTGRES_PASSWORD=x\nAPP_VERSION=1.4.0\nPREVIOUS_APP_VERSION=1.3.0\n',
    );
    expect(setEnv('', { A: '1' })).toBe('A=1\n');
  });

  it('keeps only the current and previous images', () => {
    expect(imagesToRemove(['1.4.0', '1.3.0', '1.2.0', 'dev'], ['1.4.0', '1.3.0'])).toEqual(['1.2.0', 'dev']);
  });

  it('records the previous version on the server before starting the new one', () => {
    const script = remoteScript({ dir: '/srv/inventory', version: '1.4.0' });
    expect(script).toContain('cd /srv/inventory');
    expect(script.indexOf('PREVIOUS_APP_VERSION=$current')).toBeLessThan(script.indexOf('docker compose up -d'));
    expect(script).toContain('APP_VERSION=1.4.0');
  });
});
