#!/bin/sh
# backup.sh <reason>: one backup (spec §11), run inside the app container.
#   <data>/backups/<YYYYMMDD-HHMMSS>-<reason>/db.dump    pg_dump, custom format
#   <data>/backups/<YYYYMMDD-HHMMSS>-<reason>/photos.tar the photos folder
# Keeps 14 days, copies to the USB drive, and writes last-backup.json for the dashboard footer.
# Reasons: "nightly" (03:00), "start-<version>" (before migrations), "manual".
set -u

DATA=${DATA_DIR:-/data}
BACKUPS="$DATA/backups"
USB=${BACKUP_USB_DIR:-/usb}
reason=${1:-manual}
stamp=$(date +%Y%m%d-%H%M%S)
dir="$BACKUPS/$stamp-$reason"
mkdir -p "$dir"

status() {
  # $1: true/false, $2: message
  printf '{"at":"%s","ok":%s,"message":"%s"}\n' "$(date -Iseconds)" "$1" "$2" > "$BACKUPS/last-backup.json.tmp"
  mv "$BACKUPS/last-backup.json.tmp" "$BACKUPS/last-backup.json"
}

if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "${PGHOST:-db}" -U inventory -d inventory -Fc -f "$dir/db.dump"; then
  rm -rf "$dir"
  status false "The database backup failed"
  echo "backup: pg_dump failed" >&2
  exit 1
fi
mkdir -p "$DATA/photos"
tar -C "$DATA" -cf "$dir/photos.tar" photos
echo "$dir" > "$BACKUPS/latest"
echo "backup: $dir"

# Keep 14 days.
find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -mtime +13 -exec rm -rf {} +

# Copy to the USB drive. The first-setup wizard puts a marker file on it; without the marker the
# drive isn't mounted, and writing there would only fill the server's own disk.
if [ "${BACKUP_USB:-required}" = "off" ]; then
  status true ""
  exit 0
fi
if [ ! -f "$USB/.inventory-backups" ]; then
  status false "USB drive not mounted"
  echo "backup: USB drive not mounted ($USB/.inventory-backups missing)" >&2
  exit 1
fi
if mkdir -p "$USB/inventory" && cp -r "$dir" "$USB/inventory/"; then
  find "$USB/inventory" -mindepth 1 -maxdepth 1 -type d -mtime +13 -exec rm -rf {} +
  status true ""
else
  status false "Copy to the USB drive failed"
  exit 1
fi
