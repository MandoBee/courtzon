#!/bin/bash
# ============================================================================
# CourtZon Database Restore Script
# Usage: ./scripts/restore.sh --file <backup-file> [--db <database>]
#
# Dependencies: mysql, gzip (if restoring .sql.gz)
# Environment: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
#
# SAFETY: This script will prompt for confirmation before restoring.
# A pre-restore backup is always created automatically.
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
DB_USER="${DB_USER:-courtzon_backup}"
DB_PASSWORD="${DB_PASSWORD:-}"

BACKUP_FILE=""
TARGET_DB=""
LOG_DIR="$PROJECT_DIR/backups"
LOG_FILE="${LOG_DIR}/restore.log"

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      BACKUP_FILE="$2"
      shift 2
      ;;
    --db)
      TARGET_DB="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --file <backup-file> [--db <database>]"
      echo ""
      echo "Options:"
      echo "  --file <path>   Path to backup file (.sql or .sql.gz) (required)"
      echo "  --db <name>     Target database name (default: from .env or courtzon_v3)"
      echo "  --help          Show this help"
      exit 0
      ;;
    *)
      echo "ERROR: Unknown flag: $1" >&2
      echo "Usage: $0 --file <backup-file> [--db <database>]" >&2
      exit 1
      ;;
  esac
done

# ── Logging helper ────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

log() {
  local level="$1"
  shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "$LOG_FILE"
}

cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    log "ERROR" "Restore failed with exit code $exit_code"
  fi
  exit "$exit_code"
}
trap cleanup EXIT

# ── Validate required --file flag ─────────────────────────────────────────────
if [ -z "$BACKUP_FILE" ]; then
  log "ERROR" "--file is required"
  echo "Usage: $0 --file <backup-file> [--db <database>]" >&2
  exit 1
fi

# Resolve relative paths
BACKUP_FILE="$(cd "$(dirname "$BACKUP_FILE")" 2>/dev/null && pwd)/$(basename "$BACKUP_FILE")" || true

if [ ! -f "$BACKUP_FILE" ]; then
  log "ERROR" "Backup file not found: $BACKUP_FILE"
  exit 1
fi

# ── Determine target database ─────────────────────────────────────────────────
if [ -n "$TARGET_DB" ]; then
  DB_NAME="$TARGET_DB"
fi

# ── Determine file type ───────────────────────────────────────────────────────
IS_COMPRESSED=0
if [[ "$BACKUP_FILE" == *.gz ]]; then
  IS_COMPRESSED=1
  if ! command -v gzip &>/dev/null; then
    log "ERROR" "gzip is required to restore .sql.gz files"
    exit 1
  fi
  if ! command -v zcat &>/dev/null; then
    log "ERROR" "zcat is required to restore .sql.gz files"
    exit 1
  fi
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if ! command -v mysql &>/dev/null; then
  log "ERROR" "mysql client not found. Install MySQL client tools."
  exit 1
fi

# ── Confirmation prompt ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   D A T A B A S E   R E S T O R E           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  WARNING: This will REPLACE all data in the target DB!     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Source file:  $(basename "$BACKUP_FILE")"
echo "║  Target host:  ${DB_HOST}:${DB_PORT}"
echo "║  Target DB:    ${DB_NAME}"
echo "║  Backup user:  ${DB_USER}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verify the file can be read (peek header)
log "INFO" "Verifying backup file integrity..."
if [ "$IS_COMPRESSED" -eq 1 ]; then
  if ! zcat "$BACKUP_FILE" | head -n 5 > /dev/null 2>&1; then
    log "ERROR" "Backup file appears corrupted or is not a valid gzip: $BACKUP_FILE"
    exit 1
  fi
  log "INFO" "Gzip integrity check passed"
else
  if ! head -n 5 "$BACKUP_FILE" > /dev/null 2>&1; then
    log "ERROR" "Backup file appears corrupted or unreadable: $BACKUP_FILE"
    exit 1
  fi
fi

read -r -p "Type 'RESTORE' (all caps) to proceed: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  log "INFO" "Restore cancelled by user"
  echo "Aborted."
  exit 0
fi

# ── Create pre-restore backup ─────────────────────────────────────────────────
PRE_BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_BACKUP_FILE="${LOG_DIR}/pre_restore_${DB_NAME}_${PRE_BACKUP_TIMESTAMP}.sql.gz"

log "INFO" "Creating pre-restore backup: ${PRE_BACKUP_FILE}"

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

if ! mysqldump "${MYSQLDUMP_OPTS[@]}" | sed "/INSERT INTO \`roles\` VALUES/s/,[0-9]\{1,\})/,DEFAULT)/g" | gzip > "$PRE_BACKUP_FILE"; then
  log "ERROR" "Pre-restore backup failed — aborting restore to protect data"
  exit 1
fi

PRE_SIZE=$(stat -c%s "$PRE_BACKUP_FILE" 2>/dev/null || stat -f%z "$PRE_BACKUP_FILE" 2>/dev/null)
if [ -z "$PRE_SIZE" ] || [ "$PRE_SIZE" -eq 0 ]; then
  log "ERROR" "Pre-restore backup is empty — aborting restore"
  rm -f "$PRE_BACKUP_FILE"
  exit 1
fi

log "INFO" "Pre-restore backup saved: ${PRE_BACKUP_FILE}"

# ── Perform restore ───────────────────────────────────────────────────────────
MYSQL_OPTS=(
  --host="${DB_HOST}"
  --port="${DB_PORT}"
  --user="${DB_USER}"
)

if [ -n "$DB_PASSWORD" ]; then
  MYSQL_OPTS+=(--password="${DB_PASSWORD}")
fi

log "INFO" "Restoring '${DB_NAME}' from $(basename "$BACKUP_FILE")..."

if [ "$IS_COMPRESSED" -eq 1 ]; then
  zcat "$BACKUP_FILE" | mysql "${MYSQL_OPTS[@]}" "$DB_NAME"
  RESTORE_EXIT=${PIPESTATUS[1]}
else
  mysql "${MYSQL_OPTS[@]}" "$DB_NAME" < "$BACKUP_FILE"
  RESTORE_EXIT=$?
fi

if [ "$RESTORE_EXIT" -ne 0 ]; then
  log "ERROR" "Restore failed (mysql exit code: $RESTORE_EXIT)"
  echo ""
  echo "  Pre-restore backup saved at:"
  echo "    ${PRE_BACKUP_FILE}"
  echo "  Use it to recover: $0 --file ${PRE_BACKUP_FILE}"
  exit 1
fi

log "INFO" "Restore completed successfully from: $(basename "$BACKUP_FILE")"
log "INFO" "Pre-restore backup retained at: ${PRE_BACKUP_FILE}"
echo ""
echo "✓ Restore successful. Pre-restore backup: ${PRE_BACKUP_FILE}"

exit 0
