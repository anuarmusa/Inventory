import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SyncErrorCode } from '@inventory/shared';
import type { Db } from '../db/client.ts';
import { devices } from '../db/schema.ts';

/** Device keys are stored only as hashes; the key itself lives on the phone. */
export function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** A new long-lived Device key (handed out at Pairing). */
export function newDeviceKey(): string {
  return randomBytes(32).toString('base64url');
}

export type DeviceRow = typeof devices.$inferSelect;

/** Finds the Device for an `Authorization: Bearer <key>` header. */
export async function authenticateDevice(
  db: Db,
  authorization: string | undefined,
): Promise<{ device: DeviceRow } | { error: SyncErrorCode }> {
  const key = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!key) return { error: 'unknown_device' };
  const [device] = await db.select().from(devices).where(eq(devices.keyHash, hashDeviceKey(key)));
  if (!device) return { error: 'unknown_device' };
  if (device.removedAt) return { error: 'device_removed' };
  return { device };
}
