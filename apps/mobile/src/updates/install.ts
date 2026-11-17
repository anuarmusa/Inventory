import { File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';

/** Android's FLAG_GRANT_READ_URI_PERMISSION: lets the installer read our downloaded APK. */
const GRANT_READ = 1;

/**
 * Downloads the APK from the home server and opens Android's installer. Every APK is signed with
 * the same key, so it installs over this app and its data (including Unsent Actions) survives.
 */
export async function downloadAndInstall(server: string): Promise<void> {
  const target = new File(Paths.cache, 'inventory-update.apk');
  if (target.exists) target.delete();
  const apk = await File.downloadFileAsync(`${server}/apk/download`, target, { idempotent: true });
  const contentUri = await getContentUriAsync(apk.uri);
  await startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: GRANT_READ,
    type: 'application/vnd.android.package-archive',
  });
}
