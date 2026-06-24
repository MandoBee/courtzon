#!/bin/sh
# CourtZon Database Backup Script
# Creates timestamped, gzip-compressed mysqldump backups
# Retention: 30 days
#
# Usage: ./backend/scripts/backup.sh [output-dir]
# Default output dir: ./backups/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +%Y_%m_%d_%H%M%S)
FILENAME="courtzon_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  . "$PROJECT_ROOT/.env"
  set +a
fi

: "${DB_HOST:=localhost}"
: "${DB_PORT:=3306}"
: "${DB_USER:=root}"
: "${DB_PASSWORD:=}"
: "${DB_NAME:=courtzon_v2}"

mkdir -p "$BACKUP_DIR"

echo "Backing up ${DB_NAME}@${DB_HOST}:${DB_PORT} → ${FILEPATH}"

MYSQLDUMP_ARGS="--single-transaction --routines --triggers --events --skip-lock-tables"
MYSQL_ARGS="-h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD}"

mysqldump $MYSQLDUMP_ARGS $MYSQL_ARGS "$DB_NAME" 2>/dev/null | gzip > "$FILEPATH"

# Verify backup integrity
if [ ! -s "$FILEPATH" ]; then
  echo "ERROR: Backup file is empty"
  rm -f "$FILEPATH"
  exit 1
fi

echo "Backup complete: $(du -h "$FILEPATH" | cut -f1)"

# Prune backups older than 30 days
echo "Pruning backups older than 30 days..."
find "$BACKUP_DIR" -name "courtzon_*.sql.gz" -type f -mtime +30 -delete
find "$BACKUP_DIR" -name "courtzon_*.sql.gz.enc" -type f -mtime +30 -delete

echo "Done."
