#!/bin/sh
# The app container's start (spec §11): take a backup, apply pending migrations, then serve.
# A failed migration stops the container and leaves <data>/MIGRATION_FAILED, so restarts don't
# loop through backups; scripts/rollback.sh clears it.
set -eu

DATA=${DATA_DIR:-/data}
VERSION=$(node -p "require('/app/package.json').version")
mkdir -p "$DATA/backups" "$DATA/photos" "$DATA/apk"

if [ -f "$DATA/MIGRATION_FAILED" ]; then
  echo "start: a migration failed earlier: $(cat "$DATA/MIGRATION_FAILED")" >&2
  echo "start: roll back with scripts/rollback.sh, or delete $DATA/MIGRATION_FAILED once fixed." >&2
  exit 1
fi

# Wait for the database to accept connections (it may still be starting).
for _ in $(seq 1 60); do
  pg_isready -q -h "${PGHOST:-db}" -U inventory -d inventory && break
  sleep 2
done

# A backup before anything changes. When the USB copy fails the local backup still exists, and the
# dashboard footer says so; that mustn't stop the app.
/app/ops/backup.sh "start-$VERSION" || echo "start: the backup reported a problem (see the dashboard footer)" >&2
BACKUP=$(cat "$DATA/backups/latest" 2>/dev/null || echo "")

applied() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "${PGHOST:-db}" -U inventory -d inventory -tAc \
    "SELECT count(*) FROM drizzle.__drizzle_migrations" 2>/dev/null || echo 0
}
before=$(applied)
if ! node dist/db/migrate.js; then
  echo "$VERSION at $(date -Iseconds); backup before it: $BACKUP" > "$DATA/MIGRATION_FAILED"
  echo "start: migration failed; stopping." >&2
  exit 1
fi
after=$(applied)
if [ "$after" != "$before" ]; then
  # This version changed the schema: a rollback must restore the backup taken just before.
  printf '{"version":"%s","backup":"%s","migrationsBefore":%s,"migrationsAfter":%s}\n' "$VERSION" "$BACKUP" "$before" "$after" \
    > "$DATA/backups/migrated-$VERSION.json"
  echo "start: migrations $before → $after; rollback point: $BACKUP"
fi

exec node dist/index.js
