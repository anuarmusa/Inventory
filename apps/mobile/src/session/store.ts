import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';
import { db } from '../db/client';
import { appMeta } from '../db/schema';
import { KEYS, type SessionStore } from './session';

/**
 * The phone's session store: Device keys in secure storage (wiped when the app is uninstalled, so a
 * reinstall pairs as a new Device), everything else in the local database.
 */
const SECRET = new Set<string>([KEYS.deviceKey, KEYS.previousDeviceKey]);

export const phoneStore: SessionStore = {
  async get(key) {
    if (SECRET.has(key)) return SecureStore.getItemAsync(key);
    const [row] = await db.select().from(appMeta).where(eq(appMeta.key, key));
    return row?.value ?? null;
  },
  async set(key, value) {
    if (SECRET.has(key)) return SecureStore.setItemAsync(key, value);
    await db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
  },
  async delete(key) {
    if (SECRET.has(key)) return SecureStore.deleteItemAsync(key);
    await db.delete(appMeta).where(eq(appMeta.key, key));
  },
};
