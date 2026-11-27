#!/bin/sh
# Nightly copy of the database, kept for 14 days.
#   0 3 * * *  /opt/portal/server/backup.sh >> /var/log/portal-backup.log 2>&1
set -eu
DB="${PORTAL_DB:-/data/portal.db}"
OUT="${PORTAL_BACKUPS:-/data/backups}"
mkdir -p "$OUT"
# .backup copies a consistent snapshot even while the app is writing.
sqlite3 "$DB" ".backup '$OUT/portal-$(date -u +%Y%m%d).db'"
find "$OUT" -name 'portal-*.db' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backed up to $OUT"
