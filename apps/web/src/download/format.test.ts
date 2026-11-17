import { describe, expect, it } from 'vitest';
import { countdown, formatDate, isOutOfDate, spacedCode, timeAgo } from './format';

const now = new Date('2026-11-17T09:41:00Z');

describe('download page formatting', () => {
  it('formats a release date', () => {
    expect(formatDate('2026-11-15')).toBe('15 Nov 2026');
  });

  it('says how long ago a phone last synced', () => {
    expect(timeAgo(null, now)).toBe('never');
    expect(timeAgo('2026-11-17T09:40:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-17T09:31:00Z', now)).toBe('10 min ago');
    expect(timeAgo('2026-11-17T06:41:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-16T08:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-15T08:00:00Z', now)).toBe('2 days ago');
  });

  it('flags phones on an older app version', () => {
    expect(isOutOfDate('1.3.2', '1.4.0')).toBe(true);
    expect(isOutOfDate('1.4.0', '1.4.0')).toBe(false);
    expect(isOutOfDate('1.10.0', '1.9.0')).toBe(false);
    expect(isOutOfDate(null, '1.4.0')).toBe(false);
    expect(isOutOfDate('1.0.0', null)).toBe(false);
  });

  it('spaces the pairing code for reading aloud', () => {
    expect(spacedCode('482913')).toBe('482 913');
  });

  it('counts down to the code expiring, never below zero', () => {
    expect(countdown('2026-11-17T09:50:41Z', now)).toBe('9:41');
    expect(countdown('2026-11-17T09:40:00Z', now)).toBe('0:00');
  });
});
