// Expo config plugin: sign release builds with the household's release key (spec §11).
//
// Every APK must be signed with the same key, so an update installs over the old app and its data
// (including Unsent Actions) survives. The key lives on the dev PC outside the repo; its location,
// alias and password come from the environment when Gradle runs (scripts/build-apk.mjs sets them):
//   INVENTORY_KEYSTORE, INVENTORY_KEY_ALIAS, INVENTORY_KEYSTORE_PASSWORD
// Without INVENTORY_KEYSTORE, release builds keep the debug key (fine for trying the app, but such
// an APK can't later be updated by a properly signed one without uninstalling).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @inventory/release-signing';

const releaseConfig = `
        ${MARKER}
        release {
            if (System.getenv("INVENTORY_KEYSTORE")) {
                storeFile file(System.getenv("INVENTORY_KEYSTORE"))
                storePassword System.getenv("INVENTORY_KEYSTORE_PASSWORD")
                keyAlias System.getenv("INVENTORY_KEY_ALIAS") ?: "inventory"
                keyPassword System.getenv("INVENTORY_KEYSTORE_PASSWORD")
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('with-release-signing expects a Groovy app/build.gradle');
    let gradle = mod.modResults.contents;
    if (gradle.includes(MARKER)) return mod;
    if (!/signingConfigs \{/.test(gradle) || !/release \{[\s\S]*?signingConfig signingConfigs\.debug/.test(gradle)) {
      throw new Error('with-release-signing: app/build.gradle no longer has the expected signingConfigs/release blocks');
    }
    gradle = gradle.replace(/signingConfigs \{/, `signingConfigs {${releaseConfig}`);
    gradle = gradle.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig System.getenv("INVENTORY_KEYSTORE") ? signingConfigs.release : signingConfigs.debug',
    );
    mod.modResults.contents = gradle;
    return mod;
  });
};
