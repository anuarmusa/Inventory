// The pure parts of `pnpm run deploy` (spec §11), kept apart so they can be tested.

/** 1.4.2 → 1.4.3. */
export function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Not a version: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/** Android needs a version code that only goes up. */
export function nextVersionCode(current) {
  return (Number.isInteger(current) && current > 0 ? current : 0) + 1;
}

/** latest.json beside the APK: what the server reports and the download page shows (spec §9). */
export function latestJson(version, notes, date = new Date()) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { version, date: d, notes: notes.trim(), file: `inventory-${version}.apk` };
}

/** Sets KEY=value lines in a .env text, adding the ones that aren't there. */
export function setEnv(text, values) {
  let out = text.endsWith('\n') || text === '' ? text : `${text}\n`;
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    out = re.test(out) ? out.replace(re, line) : `${out}${line}\n`;
  }
  return out;
}

/** The image tags to delete: everything but the current and previous versions (spec: keep two). */
export function imagesToRemove(tags, keep) {
  return tags.filter((t) => t && !keep.includes(t));
}

/**
 * The script the server runs after the image and files arrive: record the version (keeping the
 * one before for rollback), start it, then keep only the last two images and APKs.
 */
export function remoteScript({ dir, version }) {
  return `set -euo pipefail
cd ${dir}
touch .env
current=$(grep -E '^APP_VERSION=' .env | tail -1 | cut -d= -f2- || true)
if [ "$current" != "${version}" ]; then
  if grep -qE '^PREVIOUS_APP_VERSION=' .env; then sed -i "s|^PREVIOUS_APP_VERSION=.*|PREVIOUS_APP_VERSION=$current|" .env; else echo "PREVIOUS_APP_VERSION=$current" >> .env; fi
fi
if grep -qE '^APP_VERSION=' .env; then sed -i "s|^APP_VERSION=.*|APP_VERSION=${version}|" .env; else echo "APP_VERSION=${version}" >> .env; fi
chmod +x scripts/*.sh
docker compose up -d
previous=$(grep -E '^PREVIOUS_APP_VERSION=' .env | tail -1 | cut -d= -f2- || true)
for tag in $(docker images inventory-app --format '{{.Tag}}'); do
  if [ "$tag" != "${version}" ] && [ "$tag" != "$previous" ]; then docker image rm "inventory-app:$tag" || true; fi
done
for apk in apk/inventory-*.apk; do
  [ -e "$apk" ] || continue
  case "$apk" in apk/inventory-${version}.apk|apk/inventory-$previous.apk) ;; *) rm -f "$apk" ;; esac
done
echo "Deployed ${version} (previous: \${previous:-none})"
`;
}
