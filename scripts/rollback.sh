#!/usr/bin/env bash
# rollback.sh [--yes]: goes back to the previous version (spec §11).
# If the current version ran a migration, the database is first restored to the backup taken just
# before it (Actions synced since then are lost from the server). Otherwise only the image changes.
#
# Runs on the server: INVENTORY_DIR (default /srv/inventory) holds compose.yaml and .env, whose
# APP_VERSION and PREVIOUS_APP_VERSION the deploy script keeps.
set -euo pipefail

DIR=${INVENTORY_DIR:-/srv/inventory}
HERE=$(cd "$(dirname "$0")" && pwd)
yes=no
[[ ${1:-} == --yes ]] && yes=yes

env_get() { grep -E "^$1=" "$DIR/.env" | tail -1 | cut -d= -f2- || true; }
env_set() {
  if grep -qE "^$1=" "$DIR/.env"; then sed -i "s|^$1=.*|$1=$2|" "$DIR/.env"; else echo "$1=$2" >> "$DIR/.env"; fi
}
compose() { docker compose --project-directory "$DIR" -f "$DIR/compose.yaml" --env-file "$DIR/.env" "$@"; }

current=$(env_get APP_VERSION)
previous=$(env_get PREVIOUS_APP_VERSION)
DATA=$(env_get DATA_DIR)
DATA=${DATA:-$DIR}
if [[ -z $previous ]]; then
  echo "There's no previous version to roll back to (PREVIOUS_APP_VERSION is empty)." >&2
  exit 1
fi
if ! docker image inspect "inventory-app:$previous" > /dev/null 2>&1; then
  echo "The image inventory-app:$previous isn't on this server." >&2
  exit 1
fi

marker="$DATA/backups/migrated-$current.json"
restore_from=""
if [[ -f $marker ]]; then
  # The backup path is as the container saw it (/data/...): map it to this server's folder.
  restore_from=$(sed -n 's/.*"backup":"\([^"]*\)".*/\1/p' "$marker")
  restore_from="$DATA${restore_from#/data}"
fi

echo "Roll back from $current to $previous."
if [[ -n $restore_from ]]; then
  echo "$current changed the database, so it goes back to $(basename "$restore_from")."
  echo "Changes synced since then are lost from the server."
else
  echo "$current didn't change the database; only the app goes back."
fi
if [[ $yes != yes ]]; then
  read -r -p "Type 'rollback' to go on: " answer
  [[ $answer == rollback ]] || { echo "Nothing changed."; exit 1; }
fi

compose stop app
if [[ -n $restore_from ]]; then
  INVENTORY_DIR=$DIR "$HERE/restore.sh" --yes --no-start "$restore_from"
  mv "$marker" "$marker.rolled-back"
fi
rm -f "$DATA/MIGRATION_FAILED"
env_set APP_VERSION "$previous"
env_set PREVIOUS_APP_VERSION ""
compose up -d app
echo "✓ Running $previous"
