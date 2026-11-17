#!/usr/bin/env bash
# restore.sh [--yes] [--no-start] <backup>: restores a backup onto the home server (spec §11).
#   <backup> is a folder name in backups/ (e.g. 20261117-030000-nightly) or a path to one.
# Replaces the whole database and the photos folder with the backup's, then gives the database a new
# restore epoch so every phone syncs everything again. Changes synced since the backup are lost from
# the server; phones resend only what they hadn't sent.
#
# Runs on the server, from anywhere: INVENTORY_DIR (default /srv/inventory) holds compose.yaml and .env.
set -euo pipefail

DIR=${INVENTORY_DIR:-/srv/inventory}
yes=no start=yes
while [[ ${1:-} == --* ]]; do
  case $1 in
    --yes) yes=yes ;;
    --no-start) start=no ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
[[ $# -eq 1 ]] || { echo "Usage: restore.sh [--yes] [--no-start] <backup>" >&2; exit 2; }

compose() { docker compose --project-directory "$DIR" -f "$DIR/compose.yaml" --env-file "$DIR/.env" "$@"; }
DATA=$(grep -E '^DATA_DIR=' "$DIR/.env" 2>/dev/null | cut -d= -f2- || true)
DATA=${DATA:-$DIR}

backup=$1
[[ -d $backup ]] || backup="$DATA/backups/$1"
if [[ ! -f $backup/db.dump || ! -f $backup/photos.tar ]]; then
  echo "Not a backup: $backup (needs db.dump and photos.tar)" >&2
  exit 1
fi

if [[ $yes != yes ]]; then
  echo "Restore $(basename "$backup")?"
  echo "The database and photos are replaced. Changes synced since then are lost from the server."
  read -r -p "Type 'restore' to go on: " answer
  [[ $answer == restore ]] || { echo "Nothing changed."; exit 1; }
fi

echo "› Stopping the app"
compose stop app

echo "› Restoring the database"
compose exec -T db psql -U inventory -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS inventory WITH (FORCE)" -c "CREATE DATABASE inventory OWNER inventory"
compose exec -T db pg_restore -U inventory -d inventory --no-owner --exit-on-error < "$backup/db.dump"
# A new epoch: phones forget what they pulled and sync everything again.
compose exec -T db psql -U inventory -d inventory -v ON_ERROR_STOP=1 -c "UPDATE household_settings SET epoch = gen_random_uuid()"

echo "› Restoring the photos"
rm -rf "$DATA/photos.restoring" "$DATA/photos.before-restore"
mkdir -p "$DATA/photos.restoring"
tar --force-local -xf "$backup/photos.tar" -C "$DATA/photos.restoring"
[[ -d $DATA/photos ]] && mv "$DATA/photos" "$DATA/photos.before-restore"
mv "$DATA/photos.restoring/photos" "$DATA/photos"
rm -rf "$DATA/photos.restoring" "$DATA/photos.before-restore"

if [[ $start == yes ]]; then
  echo "› Starting the app"
  compose up -d app
fi
echo "✓ Restored $(basename "$backup")"
