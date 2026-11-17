#!/usr/bin/env node
// pnpm run deploy [-- --version 1.5.0] [--notes "…"] [--skip-apk] [--dry-run]
//
// Ships a new version to the home server (spec §11), from the dev PC:
//   1. bumps the Android version code and sets the visible version (patch +1 unless --version);
//   2. asks for a one-line "what's new";
//   3. builds the APK and writes latest.json next to it;
//   4. builds the Docker image, tagged with the version;
//   5. copies it with `docker save | ssh <server> docker load` (no registry, no git on the server);
//   6. copies the APK, latest.json, compose.yaml and the server scripts to /srv/inventory;
//   7. runs `docker compose up -d` there and keeps only the last two images and APKs.
// Needs DEPLOY_HOST (e.g. admin@192.168.1.10) in .env, an SSH key for it, and for the APK, JAVA_HOME
// and ANDROID_HOME (see README.md, "Android app"). Commit the version bump afterwards.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { bumpPatch, latestJson, nextVersionCode, remoteScript } from './deploy-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const REMOTE_DIR = '/srv/inventory';
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = flag('dry-run');

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

function run(command, { input } = {}) {
  console.log(`  $ ${command}`);
  if (dry) return '';
  return execSync(command, { cwd: root, stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'], input, shell: true });
}

const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const writeJson = (p, value) => {
  if (!dry) writeFileSync(join(root, p), `${JSON.stringify(value, null, 2)}\n`);
};

const host = env('DEPLOY_HOST');
if (!host) {
  console.error('Set DEPLOY_HOST in .env, e.g. DEPLOY_HOST=admin@192.168.1.10');
  process.exit(1);
}

// 1. Versions.
const appJson = readJson('apps/mobile/app.json');
const version = option('version') ?? bumpPatch(appJson.expo.version);
appJson.expo.version = version;
appJson.expo.android = { ...appJson.expo.android, versionCode: nextVersionCode(appJson.expo.android?.versionCode) };
console.log(`› Version ${version} (Android version code ${appJson.expo.android.versionCode})${dry ? ' [dry run]' : ''}`);

// 2. What's new.
let notes = option('notes');
if (!notes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  notes = (await rl.question('What’s new, in one line: ')).trim();
  rl.close();
}
if (!notes) {
  console.error('A one-line "what’s new" is needed; it shows on every phone’s update banner.');
  process.exit(1);
}

writeJson('apps/mobile/app.json', appJson);
for (const pkg of ['apps/mobile/package.json', 'apps/server/package.json']) writeJson(pkg, { ...readJson(pkg), version });

// 3. APK and latest.json.
const apk = `apps/mobile/dist/inventory-${version}.apk`;
if (!flag('skip-apk')) {
  console.log('› Building the APK');
  run('node apps/mobile/scripts/build-apk.mjs');
}
const latest = latestJson(version, notes);
writeJson('apps/mobile/dist/latest.json', latest);

// 4–5. Image.
const image = `inventory-app:${version}`;
console.log('› Building and shipping the image');
run(`docker build -t ${image} .`);
run(`docker save ${image} | ssh ${host} docker load`);

// 6. Files.
console.log('› Copying the APK, compose.yaml and scripts');
run(`ssh ${host} mkdir -p ${REMOTE_DIR}/apk ${REMOTE_DIR}/scripts`);
if (!flag('skip-apk')) run(`scp ${apk} ${host}:${REMOTE_DIR}/apk/`);
run(`scp apps/mobile/dist/latest.json ${host}:${REMOTE_DIR}/apk/latest.json`);
run(`scp compose.yaml ${host}:${REMOTE_DIR}/compose.yaml`);
run(`scp scripts/restore.sh scripts/rollback.sh ${host}:${REMOTE_DIR}/scripts/`);

// 7. Start it.
console.log('› Starting it on the server');
run(`ssh ${host} bash -s`, { input: remoteScript({ dir: REMOTE_DIR, version }) });

console.log(`✓ Deployed ${version}. Commit the version bump (apps/mobile/app.json and package.json files).`);
