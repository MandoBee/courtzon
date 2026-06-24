#!/bin/bash
# ============================================================================
# CourtZon Database Backup Script
# Usage: ./scripts/backup.sh [--db <database>] [--output <dir>] [--compress|--no-compress]
#
# Dependencies: mysqldump, gzip (optional)
# Environment: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD (or --db overrides DB_NAME)
#
# The backup user 'courtzon_backup' must exist with:
#   SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, PROCESS, REPLICATION CLIENT
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load environment ──────────────────────────────────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
  source "$PROJECT_DIR/.env"
fi
if [ -f "$PROJECT_DIR/.env.local" ]; then
  source "$PROJECT_DIR/.env.local"
fi

# ── Config with defaults ──────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-courtzon_v3}"
DB_USER="${DB_BACKUP_USER:-courtzon_backup}"
DB_PASSWORD="${DB_BACKUP_PASSWORD:-}"

BACKUP_DIR=""
COMPRESS=1
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ── S3/Remote settings (commented out by default) ────────────────────────────
# S3_ENABLED="${BACKUP_S3_ENABLED:-false}"
# S3_BUCKET="${BACKUP_S3_BUCKET:-courtzon-backups}"
# S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
# S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
# S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"
# S3_REGION="${BACKUP_S3_REGION:-auto}"
# S3_PATH_PREFIX="${BACKUP_S3_PATH_PREFIX:-database/}"

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_NAME="$2"
      shift 2
      ;;
    --output)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --compress)
      COMPRESS=1
      shift
      ;;
    --no-compress)
      COMPRESS=0
      shift
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --db <name>           Database name to back up (default: couritzon_v2)"
      echo "  --output <dir>        Output directory (default: backups/)"
      echo "  --compress            Enable gzip compression (default)"
      echo "  --no-compress         Disable gzip compression"
      echo "  --retention-days <n>  Auto-rotate backups older than n days (default: 30, 0=never)"
      echo "  --help                Show this help"
      exit 0
      ;;
    *)
      echo "ERROR: Unknown flag: $1" >&2
      echo "Usage: $0 [--db <database>] [--output <dir>] [--compress|--no-compress]" >&2
      exit 1
      ;;
  esac
done

# ── Setup paths ───────────────────────────────────────────────────────────────
if [ -z "$BACKUP_DIR" ]; then
  BACKUP_DIR="$PROJECT_DIR/backups"
fi
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXT="sql"
if [ "$COMPRESS" -eq 1 ]; then
  EXT="sql.gz"
fi
LOCAL_FILE="${BACKUP_DIR}/courtzon_${DB_NAME}_${TIMESTAMP}.${EXT}"
LOG_FILE="${BACKUP_DIR}/backup.log"

# ── Logging helper ────────────────────────────────────────────────────────────
log() {
  local level="$1"
  shift
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    log "ERROR" "Backup failed with exit code $exit_code"
    # Remove partial backup file
    if [ -f "$LOCAL_FILE" ]; then
      rm -f "$LOCAL_FILE"
      log "INFO" "Removed partial backup: $LOCAL_FILE"
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if ! command -v mysqldump &>/dev/null; then
  log "ERROR" "mysqldump not found. Install MySQL client tools."
  exit 1
fi

if [ "$COMPRESS" -eq 1 ] && ! command -v gzip &>/dev/null; then
  log "WARN" "gzip not found. Falling back to uncompressed backup."
  COMPRESS=0
  EXT="sql"
  LOCAL_FILE="${BACKUP_DIR}/courtzon_${DB_NAME}_${TIMESTAMP}.${EXT}"
fi

# ── Run backup ────────────────────────────────────────────────────────────────
log "INFO" "Starting backup of database '${DB_NAME}' on ${DB_HOST}:${DB_PORT}"

MYSQLDUMP_OPTS=(
  --single-transaction
  --routines
  --triggers
  --events
  --host="${DB_HOST}"
  --port="${DB_PORT}"
  --user="${DB_USER}"
)

if [ -n "$DB_PASSWORD" ]; then
  MYSQLDUMP_OPTS+=(--password="${DB_PASSWORD}")
fi

MYSQLDUMP_OPTS+=("${DB_NAME}")

if [ "$COMPRESS" -eq 1 ]; then
  mysqldump "${MYSQLDUMP_OPTS[@]}" | sed "/INSERT INTO \`roles\` VALUES/s/,[0-9]\{1,\})/,DEFAULT)/g" | gzip > "$LOCAL_FILE"
  DUMP_EXIT=${PIPESTATUS[0]}
else
  mysqldump "${MYSQLDUMP_OPTS[@]}" | sed "/INSERT INTO \`roles\` VALUES/s/,[0-9]\{1,\})/,DEFAULT)/g" > "$LOCAL_FILE"
  DUMP_EXIT=$?
fi

if [ "$DUMP_EXIT" -ne 0 ]; then
  log "ERROR" "mysqldump failed with exit code $DUMP_EXIT"
  exit 1
fi

# ── Verify backup file ────────────────────────────────────────────────────────
if [ ! -f "$LOCAL_FILE" ]; then
  log "ERROR" "Backup file was not created at: $LOCAL_FILE"
  exit 1
fi

FILE_SIZE=$(stat -c%s "$LOCAL_FILE" 2>/dev/null || stat -f%z "$LOCAL_FILE" 2>/dev/null)
if [ -z "$FILE_SIZE" ] || [ "$FILE_SIZE" -eq 0 ]; then
  log "ERROR" "Backup file is empty: $LOCAL_FILE"
  rm -f "$LOCAL_FILE"
  exit 1
fi

HUMAN_SIZE=""
if command -v du &>/dev/null; then
  HUMAN_SIZE=$(du -h "$LOCAL_FILE" | cut -f1)
fi

log "INFO" "Backup completed successfully: ${LOCAL_FILE} (${HUMAN_SIZE:-${FILE_SIZE} bytes})"

# ── Auto-rotate old backups ───────────────────────────────────────────────────
if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "courtzon_${DB_NAME}_*.sql*" -type f -mtime +"${RETENTION_DAYS}" -print -delete 2>/dev/null | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    log "INFO" "Auto-rotation: removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
  fi
fi

# ── S3/Remote upload (commented out by default) ───────────────────────────────
# if [ "$S3_ENABLED" = "true" ] && command -v aws &>/dev/null; then
#   log "INFO" "Uploading backup to S3..."
#   export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
#   export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
#   export AWS_DEFAULT_REGION="$S3_REGION"
#
#   S3_URI="s3://${S3_BUCKET}/${S3_PATH_PREFIX}${LOCAL_FILE##*/}"
#   if [ -n "$S3_ENDPOINT" ]; then
#     aws s3 cp "$LOCAL_FILE" "$S3_URI" --endpoint-url "$S3_ENDPOINT"
#   else
#     aws s3 cp "$LOCAL_FILE" "$S3_URI"
#   fi
#
#   if [ $? -eq 0 ]; then
#     log "INFO" "Uploaded backup to ${S3_URI}"
#   else
#     log "WARN" "S3 upload failed (non-fatal)"
#   fi
# fi

log "INFO" "Backup process finished successfully"
exit 0
