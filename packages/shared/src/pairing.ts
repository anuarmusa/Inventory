import { z } from 'zod';

/**
 * Pairing (spec §7): the download page offers the server address and a one-time code; the app
 * redeems it for a long-lived Device key. The "Connect this phone" link and the pairing QR code
 * carry the same thing: `inventory://pair?server=<address>&code=<6 digits>`.
 */

export const PAIRING_CODE_TTL_MINUTES = 10;

export const PairingCode = z.string().regex(/^\d{6}$/, 'The code is 6 digits');

/** The home server's address as the app stores it, e.g. `http://192.168.1.10`. */
export const ServerAddress = z
  .string()
  .trim()
  .transform((s) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`))
  .pipe(z.url({ protocol: /^https?$/ }))
  .transform((s) => s.replace(/\/+$/, ''));

export interface PairingTarget {
  server: string;
  code: string;
}

/** The link and QR content for a pairing offer. */
export function pairingLink({ server, code }: PairingTarget): string {
  return `inventory://pair?server=${encodeURIComponent(server)}&code=${code}`;
}

/** Reads a pairing link or scanned QR content; null when it isn't one of ours. */
export function parsePairingLink(text: string): PairingTarget | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const isPair = url.protocol === 'inventory:' && (url.hostname === 'pair' || url.pathname.replace(/^\/+/, '') === 'pair');
  if (!isPair) return null;
  const server = ServerAddress.safeParse(url.searchParams.get('server') ?? '');
  const code = PairingCode.safeParse(url.searchParams.get('code') ?? '');
  if (!server.success || !code.success) return null;
  return { server: server.data, code: code.data };
}

/** What the download page shows: the offer, to be redeemed within 10 minutes. */
export const PairingOffer = z.object({
  code: PairingCode,
  expiresAt: z.iso.datetime(),
  server: z.string(),
  link: z.string(),
});
export type PairingOffer = z.infer<typeof PairingOffer>;

export const DeviceName = z.string().trim().min(1).max(60);

export const RedeemRequest = z.object({
  code: PairingCode,
  name: DeviceName,
  model: z.string().trim().max(100).nullable(),
  /**
   * The key this install used before it was removed. Proves it is the same install, so it keeps its
   * Device (and its unsent Actions) instead of becoming a new one.
   */
  previousKey: z.string().min(1).nullable(),
});
export type RedeemRequest = z.infer<typeof RedeemRequest>;

export const RedeemResponse = z.object({
  deviceId: z.uuid(),
  deviceKey: z.string(),
  name: DeviceName,
});
export type RedeemResponse = z.infer<typeof RedeemResponse>;

export const PairingErrorCode = z.enum(['invalid_code', 'too_many_attempts', 'invalid_request']);
export type PairingErrorCode = z.infer<typeof PairingErrorCode>;

/** A Device as the Device list shows it. */
export const DeviceSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  model: z.string().nullable(),
  appVersion: z.string().nullable(),
  pairedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime().nullable(),
  removedAt: z.iso.datetime().nullable(),
});
export type DeviceSummary = z.infer<typeof DeviceSummary>;
