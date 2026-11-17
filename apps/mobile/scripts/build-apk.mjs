// Builds the Android release APK locally: expo prebuild, then Gradle's assembleRelease.
// Output: apps/mobile/dist/inventory-<version>.apk
//
// Needs JAVA_HOME (JDK 17) and ANDROID_HOME (Android SDK) to be set.
// Signing: with INVENTORY_KEYSTORE (and INVENTORY_KEY_ALIAS) in the environment or the repo's .env,
// the APK is signed with the household's release key; its password comes from
// INVENTORY_KEYSTORE_PASSWORD or is asked for here (it is never stored). Without a key the debug key
// signs it; `--require-release-key` (used by the deploy script) refuses that.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
// On Windows, Metro and Expo Router build broken relative paths when the drive letter is lowercase
// (e.g. a terminal opened at e:\). Always work from the uppercase form.
const upperDrive = (p) => (windows ? p.replace(/^[a-z]:/, (d) => d.toUpperCase()) : p);
const appDir = upperDrive(join(dirname(fileURLToPath(import.meta.url)), '..'));
process.chdir(appDir);

for (const name of ['JAVA_HOME', 'ANDROID_HOME']) {
  if (!process.env[name] || !existsSync(process.env[name])) {
    console.error(`${name} is not set to an existing folder. See README.md, "Android app".`);
    process.exit(1);
  }
}

// The release key's location from the repo's .env, unless already in the environment.
const repoEnv = join(appDir, '..', '..', '.env');
const fromEnvFile = (name) =>
  existsSync(repoEnv)
    ? readFileSync(repoEnv, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${name}=`))
        ?.slice(name.length + 1)
        .trim()
        .replace(/^'(.*)'$/, '$1') || undefined
    : undefined;
for (const name of ['INVENTORY_KEYSTORE', 'INVENTORY_KEY_ALIAS']) process.env[name] ??= fromEnvFile(name);

/** Asks for a password without showing it. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) process.stdout.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

if (process.env.INVENTORY_KEYSTORE) {
  if (!existsSync(process.env.INVENTORY_KEYSTORE)) {
    console.error(`The release key ${process.env.INVENTORY_KEYSTORE} isn't there (INVENTORY_KEYSTORE).`);
    process.exit(1);
  }
  process.env.INVENTORY_KEYSTORE_PASSWORD ||= await askHidden('Release key password: ');
  console.log(`› Signing with the release key (${process.env.INVENTORY_KEY_ALIAS ?? 'inventory'})`);
} else if (process.argv.includes('--require-release-key')) {
  console.error('No release key: set INVENTORY_KEYSTORE in .env (the first-setup wizard makes the key).');
  console.error('A debug-signed APK on the phones would force an uninstall when the real key arrives.');
  process.exit(1);
} else {
  console.log('› No release key (INVENTORY_KEYSTORE): signing with the debug key');
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
