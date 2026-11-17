import { randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  DeviceName,
  type DeviceSummary,
  PAIRING_CODE_TTL_MINUTES,
  type PairingErrorCode,
  type PairingOffer,
  pairingLink,
  RedeemRequest,
  type RedeemResponse,
} from '@inventory/shared';
import type { Db } from '../db/client.ts';
import { devices, pairingCodes } from '../db/schema.ts';
import { authenticateDevice, hashDeviceKey, newDeviceKey } from '../sync/auth.ts';

/**
 * Pairing and the Device list (spec §7). Anyone on the home Wi-Fi may pair a phone or manage
 * Devices: there is no PIN. Failed code guesses are rate-limited so 6-digit codes can't be guessed.
 */

export interface PairingRoutesOptions {
  db: Db;
  /** Overrides the address put in pairing offers (default: the address the page was opened with). */
  publicAddress?: string;
  now?: () => Date;
}

/** At most this many wrong codes per window, across all callers, before redeeming pauses. */
const MAX_FAILED_REDEEMS = 10;
const FAILED_WINDOW_MS = 10 * 60_000;

function pairingError(code: PairingErrorCode, message: string) {
  return { error: code, message };
}

function serverAddress(req: FastifyRequest, publicAddress?: string): string {
  return (publicAddress ?? `${req.protocol}://${req.headers.host}`).replace(/\/+$/, '');
}

function summary(d: typeof devices.$inferSelect): DeviceSummary {
  return {
    id: d.id,
    name: d.name,
    model: d.model,
    appVersion: d.appVersion,
    pairedAt: d.pairedAt.toISOString(),
    lastSyncedAt: d.lastSyncedAt?.toISOString() ?? null,
    removedAt: d.removedAt?.toISOString() ?? null,
  };
}

export function registerPairingRoutes(app: FastifyInstance, { db, publicAddress, now = () => new Date() }: PairingRoutesOptions) {
  const failures: number[] = [];
  const recentFailures = () => {
    const cutoff = now().getTime() - FAILED_WINDOW_MS;
    while (failures.length && failures[0]! < cutoff) failures.shift();
    return failures.length;
  };

  /** Offer a one-time code, shown on the download page as a button, a QR code and typed digits. */
  app.post('/pairing/offers', async (req): Promise<PairingOffer> => {
    const at = now();
    // Forget expired codes (used or not), so their digits can be offered again.
    await db.delete(pairingCodes).where(lt(pairingCodes.expiresAt, at));
    const expiresAt = new Date(at.getTime() + PAIRING_CODE_TTL_MINUTES * 60_000);
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const [inserted] = await db
        .insert(pairingCodes)
        .values({ code, expiresAt, createdAt: at })
        .onConflictDoNothing()
        .returning({ code: pairingCodes.code });
      if (!inserted) continue;
      const server = serverAddress(req, publicAddress);
      return { code, expiresAt: expiresAt.toISOString(), server, link: pairingLink({ server, code }) };
    }
  });

  /** Redeem a code for a Device key. A returning install proves itself with its previous key. */
  app.post('/pairing/redeem', async (req, reply) => {
    if (recentFailures() >= MAX_FAILED_REDEEMS) {
      return reply.code(429).send(pairingError('too_many_attempts', 'Too many wrong codes. Wait a few minutes and try again.'));
    }
    const body = RedeemRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send(pairingError('invalid_request', body.error.message));
    const { code, name, model, previousKey } = body.data;
    const at = now();

    const result = await db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(pairingCodes)
        .where(and(eq(pairingCodes.code, code), isNull(pairingCodes.usedAt), gt(pairingCodes.expiresAt, at)))
        .for('update');
      if (!offer) return null;

      const deviceKey = newDeviceKey();
      const [returning] = previousKey
        ? await tx.select().from(devices).where(eq(devices.keyHash, hashDeviceKey(previousKey)))
        : [];

      let deviceId: string;
      if (returning) {
        // Same install reconnecting: keep its Device so its unsent Actions still belong to it.
        deviceId = returning.id;
        await tx
          .update(devices)
          .set({ keyHash: hashDeviceKey(deviceKey), name, model, removedAt: null, pairedAt: at })
          .where(eq(devices.id, deviceId));
      } else {
        deviceId = randomUUID();
        await tx.insert(devices).values({ id: deviceId, name, model, keyHash: hashDeviceKey(deviceKey), pairedAt: at });
      }
      await tx.update(pairingCodes).set({ usedAt: at, usedByDeviceId: deviceId }).where(eq(pairingCodes.code, code));
      return { deviceId, deviceKey, name } satisfies RedeemResponse;
    });

    if (!result) {
      failures.push(at.getTime());
      return reply.code(400).send(pairingError('invalid_code', 'That code is wrong or has expired. Get a new one from the download page.'));
    }
    return result;
  });

  /** The Device list for the download page. */
  app.get('/devices', async (): Promise<DeviceSummary[]> => {
    const rows = await db.select().from(devices).orderBy(desc(devices.pairedAt));
    return rows.map(summary);
  });

  /** Rename a Device from the download page. */
  app.patch<{ Params: { id: string } }>('/devices/:id', async (req, reply) => {
    const name = DeviceName.safeParse((req.body as { name?: unknown } | null)?.name);
    if (!name.success) return reply.code(400).send(pairingError('invalid_request', 'Give the phone a name.'));
    const [row] = await db.update(devices).set({ name: name.data }).where(eq(devices.id, req.params.id)).returning();
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'No such phone.' });
    return summary(row);
  });

  /** Remove a Device: its key stops working until the same install pairs again. */
  app.post<{ Params: { id: string } }>('/devices/:id/remove', async (req, reply) => {
    const [row] = await db.update(devices).set({ removedAt: now() }).where(eq(devices.id, req.params.id)).returning();
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'No such phone.' });
    return summary(row);
  });

  /** A paired phone renames itself. */
  app.patch('/devices/me', async (req, reply) => {
    const auth = await authenticateDevice(db, req.headers.authorization);
    if ('error' in auth) return reply.code(401).send({ error: auth.error, message: 'This phone is not connected to this home server.' });
    const name = DeviceName.safeParse((req.body as { name?: unknown } | null)?.name);
    if (!name.success) return reply.code(400).send(pairingError('invalid_request', 'Give the phone a name.'));
    const [row] = await db.update(devices).set({ name: name.data }).where(eq(devices.id, auth.device.id)).returning();
    return summary(row!);
  });
}
