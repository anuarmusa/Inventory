import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.ts';

describe('HealthResponse', () => {
  it('accepts an ok status', () => {
    expect(HealthResponse.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects anything else', () => {
    expect(HealthResponse.safeParse({ status: 'down' }).success).toBe(false);
  });
});
