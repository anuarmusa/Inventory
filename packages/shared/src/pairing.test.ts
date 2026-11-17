import { describe, expect, it } from 'vitest';
import { pairingLink, parsePairingLink, ServerAddress } from './pairing.ts';

describe('pairing links', () => {
  it('round-trips the server address and code', () => {
    const link = pairingLink({ server: 'http://192.168.1.10', code: '482913' });
    expect(link).toBe('inventory://pair?server=http%3A%2F%2F192.168.1.10&code=482913');
    expect(parsePairingLink(link)).toEqual({ server: 'http://192.168.1.10', code: '482913' });
  });

  it('keeps a port', () => {
    expect(parsePairingLink(pairingLink({ server: 'http://192.168.1.20:8080', code: '000123' }))).toEqual({
      server: 'http://192.168.1.20:8080',
      code: '000123',
    });
  });

  it('accepts the triple-slash form some scanners produce', () => {
    expect(parsePairingLink('inventory:///pair?server=http%3A%2F%2F10.0.0.5&code=123456')).toEqual({
      server: 'http://10.0.0.5',
      code: '123456',
    });
  });

  it('rejects anything that is not one of our pairing links', () => {
    for (const text of [
      'WIFI:S:Jiran;T:WPA;P:x;;',
      'INV1:7K2QX',
      'https://example.com/pair?server=x&code=123456',
      'inventory://pair?server=http%3A%2F%2F10.0.0.5&code=12345',
      'inventory://pair?code=123456',
      'inventory://other?server=http%3A%2F%2F10.0.0.5&code=123456',
    ]) {
      expect(parsePairingLink(text)).toBeNull();
    }
  });
});

describe('ServerAddress', () => {
  it('adds http:// and drops a trailing slash when typed by hand', () => {
    expect(ServerAddress.parse(' 192.168.1.10/ ')).toBe('http://192.168.1.10');
    expect(ServerAddress.parse('http://192.168.1.10:8080')).toBe('http://192.168.1.10:8080');
  });

  it('rejects things that are not addresses', () => {
    expect(ServerAddress.safeParse('').success).toBe(false);
    expect(ServerAddress.safeParse('ftp://192.168.1.10').success).toBe(false);
  });
});
