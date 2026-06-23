#!/bin/bash
# CourtZon Backup Cron Script
# Run on the Hostinger VPS via crontab
# 
# Crontab entry (daily at 1 AM):
#   0 1 * * * /opt/courtzon/scripts/backup-cron.sh >> /var/log/courtzon-backup.log 2>&1
#
# This script:
#   1. Runs mysqldump (the app also does this via BullMQ, this is a backup)
#   2. Syncs uploads/ to S3/R2
#   3. Cleans up old local backups

set -e

COURTZON_DIR="/opt/courtzon"
BACKUP_DIR="$COURTZON_DIR/backups"
UPLOADS_DIR="$COURTZON_DIR/backend/uploads"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Load environment
source "$COURTZON_DIR/.env" 2>/dev/null || true

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-courtzon_app}
DB_PASSWORD=${DB_PASSWORD:-}
DB_NAME=${DB_NAME:-courtzon_v2}

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# 1. Database backup
DB_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
mysqldump --single-transaction --routines --triggers --events \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" \
  "$DB_NAME" | gzip > "$DB_FILE"
echo "[$(date)] DB backup: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# 2. Uploads backup to S3/R2 (if aws-cli installed and configured)
if command -v aws &>/dev/null && [ -n "$S3_BUCKET" ]; then
  if [ -d "$UPLOADS_DIR" ]; then
    aws s3 sync "$UPLOADS_DIR" "s3://$S3_BUCKET/uploads/" \
      --endpoint-url "$S3_ENDPOINT" \
      --quiet 2>/dev/null || true
    echo "[$(date)] Uploads synced to S3"
  fi
fi

# 3. Alternative: rclone for Cloudflare R2
if command -v rclone &>/dev/null; then
  if [ -d "$UPLOADS_DIR" ]; then
    rclone sync "$UPLOADS_DIR" "r2:courtzon-uploads/uploads/" --quiet 2>/dev/null || true
    echo "[$(date)] Uploads synced via rclone"
  fi
fi

# 4. Cleanup old local backups
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
echo "[$(date)] Cleaned up backups older than $RETENTION_DAYS days"

echo "[$(date)] Backup complete."
