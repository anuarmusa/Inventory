/**
 * Photos (spec §4.2, §13): resized to 1600 px on the long edge on the phone, kept on the phone, and
 * uploaded separately from Actions when the phone is home. Actions only carry the photo id. Other
 * Devices download a photo the first time it's viewed and cache it; away from home an uncached
 * photo shows a placeholder.
 */

export const LONG_EDGE = 1600;

/** The resize that brings the long edge down to 1600 px, or null when it's already small enough. */
export function resizeFor(width: number, height: number, longEdge = LONG_EDGE): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= longEdge) return null;
  return width >= height ? { width: longEdge } : { height: longEdge };
}

/** Photo ids taken on this phone that haven't reached the home server yet. */
export interface PhotoQueue {
  pending(): Promise<string[]>;
  add(id: string): Promise<void>;
  done(id: string): Promise<void>;
}

export type UploadOutcome = 'uploaded' | 'away' | 'failed';

/**
 * Uploads every pending photo, oldest first. Stops at the first sign of being away; a photo the
 * server refuses stays queued for the next time.
 */
export async function uploadPending(queue: PhotoQueue, upload: (id: string) => Promise<UploadOutcome>): Promise<{ uploaded: number; left: number }> {
  const ids = await queue.pending();
  let uploaded = 0;
  for (const id of ids) {
    const outcome = await upload(id);
    if (outcome === 'away') break;
    if (outcome === 'uploaded') {
      await queue.done(id);
      uploaded += 1;
    }
  }
  return { uploaded, left: ids.length - uploaded };
}

/** A queue kept as a JSON list under one key of a key/value store. */
export function queueIn(store: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void> }, key: string): PhotoQueue {
  const read = async (): Promise<string[]> => {
    try {
      return JSON.parse((await store.get(key)) ?? '[]') as string[];
    } catch {
      return [];
    }
  };
  return {
    pending: read,
    async add(id) {
      const ids = await read();
      if (!ids.includes(id)) await store.set(key, JSON.stringify([...ids, id]));
    },
    async done(id) {
      await store.set(key, JSON.stringify((await read()).filter((x) => x !== id)));
    },
  };
}
