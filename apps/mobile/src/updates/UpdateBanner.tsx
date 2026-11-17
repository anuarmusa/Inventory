import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppVersions } from '@inventory/shared';
import { KEYS } from '../session/session';
import { useSession } from '../session/SessionProvider';
import { phoneStore } from '../session/store';
import { colors, ui } from '../ui/styles';
import { downloadAndInstall } from './install';
import { shortVersion, updateBanner } from './updates';

const CURRENT = Constants.expoConfig?.version ?? '0.0.0';

/**
 * Home's update banner (spec §9): "Update available: v1.4" with what's new, dismissible; or a red
 * "Update needed to sync" when this app is below the server's minimum.
 */
export function UpdateBanner() {
  const { session, syncState, sync } = useSession();
  const [stored, setStored] = useState<AppVersions | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([phoneStore.get(KEYS.appVersions), phoneStore.get(KEYS.dismissedUpdate)]).then(([app, gone]) => {
      try {
        setStored(app ? (JSON.parse(app) as AppVersions) : null);
      } catch {
        setStored(null);
      }
      setDismissed(gone);
    });
  }, [syncState.lastSyncedAt]);

  const banner = updateBanner(CURRENT, syncState.app ?? stored, { refusedAsTooOld: syncState.problem === 'app_too_old', dismissed });
  if (banner.kind === 'none') return null;

  const update = async () => {
    if (!session?.server) return;
    if (!(await phoneStore.get(KEYS.installGuided))) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Installing the update',
          'Android will ask to allow “Install unknown apps” for Inventory the first time. Turn it on, come back, then tap Install. Your data stays.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!ok) return;
      await phoneStore.set(KEYS.installGuided, '1');
    }
    setBusy(true);
    try {
      // Send what's unsent first, while the server still accepts this version.
      if (banner.kind === 'available') await sync();
      await downloadAndInstall(session.server);
    } catch {
      Alert.alert('Couldn’t download the update', 'Check this phone is on the home Wi-Fi. The download page also has the app.');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (banner.kind !== 'available') return;
    await phoneStore.set(KEYS.dismissedUpdate, banner.version);
    setDismissed(banner.version);
  };

  const required = banner.kind === 'required';
  return (
    <View style={[styles.banner, required ? styles.required : styles.available]}>
      <Text style={[ui.body, { fontWeight: '700', color: required ? colors.bad : colors.accent }]}>
        {required ? 'Update needed to sync' : `⬆️ Update available: ${shortVersion(banner.version)}`}
      </Text>
      {banner.kind === 'available' && banner.notes && <Text style={ui.body}>{banner.notes}</Text>}
      {required && <Text style={ui.body}>The app works offline; your changes wait on this phone until it’s updated.</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[styles.button, { backgroundColor: required ? colors.bad : colors.accent }]} disabled={busy} onPress={() => void update()}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? 'Downloading…' : 'Update'}</Text>
        </Pressable>
        {!required && (
          <Pressable style={[styles.button, { borderWidth: 1, borderColor: colors.line }]} onPress={() => void dismiss()}>
            <Text>Later</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: 12, gap: 6 },
  available: { backgroundColor: colors.accentSoft },
  required: { backgroundColor: colors.badSoft },
  button: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
});
