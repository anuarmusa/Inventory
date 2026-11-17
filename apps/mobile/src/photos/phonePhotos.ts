import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { KEYS } from '../session/session';
import { phoneStore } from '../session/store';
import { queueIn, resizeFor, uploadPending, type UploadOutcome } from './photos';

/** Photos taken here wait in the documents folder; ones downloaded from the server are a cache. */
const mine = new Directory(Paths.document, 'photos');
const cached = new Directory(Paths.cache, 'photos');
const queue = queueIn(phoneStore, KEYS.pendingPhotos);
const TIMEOUT_MS = 10_000;

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

/** The photo on this phone, if it's here. */
export function localPhoto(id: string): string | null {
  for (const dir of [mine, cached]) {
    const file = new File(dir, `${id}.jpg`);
    if (file.exists) return file.uri;
  }
  return null;
}

/**
 * Takes a photo (or picks one), resizes it to 1600 px on the long edge, keeps it, and queues it for
 * upload. Returns its id, or null when the person cancelled.
 */
export async function takePhoto(source: 'camera' | 'library'): Promise<string | null> {
  const permission =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(source === 'camera' ? 'The camera is needed to take a photo.' : 'Photos access is needed to pick one.');
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets[0]) return null;
  const { uri, width, height } = picked.assets[0];
  const resize = resizeFor(width, height);
  const result = await manipulateAsync(uri, resize ? [{ resize }] : [], { compress: 0.8, format: SaveFormat.JPEG });

  const id = randomUUID();
  ensure(mine);
  new File(result.uri).copy(new File(mine, `${id}.jpg`));
  await queue.add(id);
  return id;
}

/** Uploads the photos taken here that the home server hasn't got yet. */
export async function uploadPhotos(server: string, key: string): Promise<void> {
  await uploadPending(queue, async (id): Promise<UploadOutcome> => {
    const file = new File(mine, `${id}.jpg`);
    if (!file.exists) return 'uploaded'; // Nothing left to send; drop it from the queue.
    try {
      const res = await withTimeout(
        file.upload(`${server}/photos/${id}`, {
          httpMethod: 'PUT',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'image/jpeg' },
          mimeType: 'image/jpeg',
        }),
      );
      return res.status >= 200 && res.status < 300 ? 'uploaded' : 'failed';
    } catch {
      return 'away';
    }
  });
}

/** Downloads a photo from the home server into the cache. Null when away or not there yet. */
export async function downloadPhoto(server: string, id: string): Promise<string | null> {
  ensure(cached);
  const target = new File(cached, `${id}.jpg`);
  try {
    const file = await withTimeout(File.downloadFileAsync(`${server}/photos/${id}`, target, { idempotent: true }));
    return file.uri;
  } catch {
    if (target.exists) target.delete();
    return null;
  }
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);
}
