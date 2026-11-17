import { describe, expect, it } from 'vitest';
import { compareVersions, MIN_APP_VERSION, PushRequest } from './sync.ts';

describe('compareVersions', () => {
  it('compares major, minor and patch numerically', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.12', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
  });

  it('accepts the minimum version itself', () => {
    expect(compareVersions(MIN_APP_VERSION, MIN_APP_VERSION)).toBe(0);
  });
});

describe('PushRequest', () => {
  it('requires a dotted app version', () => {
    const base = { deviceNow: '2026-11-17T09:41:00+08:00', actions: [] };
    expect(PushRequest.safeParse({ ...base, appVersion: '1.4.0' }).success).toBe(true);
    expect(PushRequest.safeParse({ ...base, appVersion: 'v1.4' }).success).toBe(false);
  });
});
