import { describe, expect, it } from 'vitest';
import { nextBackupAt } from './nightly.ts';

describe('nightly backup', () => {
  it('runs at the next 03:00', () => {
    expect(nextBackupAt(new Date('2026-11-17T01:30:00'))).toEqual(new Date('2026-11-17T03:00:00'));
    expect(nextBackupAt(new Date('2026-11-17T03:00:00'))).toEqual(new Date('2026-11-18T03:00:00'));
    expect(nextBackupAt(new Date('2026-11-17T22:00:00'))).toEqual(new Date('2026-11-18T03:00:00'));
  });
});
