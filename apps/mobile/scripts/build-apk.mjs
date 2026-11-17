// Builds the Android release APK locally: expo prebuild, then Gradle's assembleRelease.
// Output: apps/mobile/dist/inventory-<version>.apk
//
// Needs JAVA_HOME (JDK 17) and ANDROID_HOME (Android SDK) to be set.
// Signing: until the household's release key exists (see "First server setup wizard and APK
// signing key"), the generated project signs release builds with the debug key.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';

for (const name of ['JAVA_HOME', 'ANDROID_HOME']) {
  if (!process.env[name] || !existsSync(process.env[name])) {
    console.error(`${name} is not set to an existing folder. See README.md, "Android app".`);
    process.exit(1);
  }
}

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows });

console.log('› Generating the android project (expo prebuild)…');
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], appDir);

console.log('› Building the release APK (gradle assembleRelease)…');
const androidDir = join(appDir, 'android');
run(join(androidDir, windows ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', '--console=plain'], androidDir);

const { version } = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')).expo;
const built = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const outDir = join(appDir, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `inventory-${version}.apk`);
copyFileSync(built, out);
console.log(`✓ APK: ${out}`);
