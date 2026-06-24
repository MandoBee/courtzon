#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
BASELINE_DIR="$PROJECT_ROOT/database/baseline"
LOG_FILE="$PROJECT_ROOT/backups/migration.log"
TRACKING_TABLE="migration_history"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-courtzon_v3}"

MYSQL_OPTS="-h $DB_HOST -P $DB_PORT -u $DB_USER"
[ -n "$DB_PASSWORD" ] && MYSQL_OPTS="$MYSQL_OPTS -p$DB_PASSWORD"
MYSQL="$MYSQL_OPTS $DB_NAME"
MYSQL_ADMIN="$MYSQL_OPTS"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  log "ERROR: $*"
  exit 1
}

usage() {
  echo "Usage: $0 [--fresh] [--status] [--rollback <filename>]"
  echo ""
  echo "  --fresh              Drop and recreate database before applying migrations"
  echo "  --status             Show migration status (applied vs pending)"
  echo "  --rollback <file>    Roll back a specific migration (down migration required)"
  echo "  --help               Show this help"
  exit 0
}

ensure_tracking_table() {
  mysql $MYSQL_ADMIN -N -e "
    CREATE TABLE IF NOT EXISTS \`$DB_NAME\`.\`$TRACKING_TABLE\` (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      filename      VARCHAR(255) NOT NULL UNIQUE,
      hash          VARCHAR(64) NOT NULL,
      direction     ENUM('up', 'down') NOT NULL DEFAULT 'up',
      execution_ms  INT DEFAULT 0,
      applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  " 2>/dev/null || true
}

apply_baseline() {
  local baseline_file="$BASELINE_DIR/001_courtzon_v3.sql"
  if [ ! -f "$baseline_file" ]; then
    log "No baseline found at $baseline_file. Skipping."
    return
  fi

  log "Applying baseline: $baseline_file"
  local start_time
  start_time=$(date +%s%N)

  if mysql $MYSQL < "$baseline_file"; then
    local end_time
    end_time=$(date +%s%N)
    local elapsed_ms=$(( (end_time - start_time) / 1000000 ))
    log "Baseline applied successfully (${elapsed_ms}ms)"

    local file_hash
    file_hash=$(sha256sum "$baseline_file" | cut -c1-12)
    mysql $MYSQL -N -e "
      INSERT IGNORE INTO $TRACKING_TABLE (filename, hash, direction, execution_ms)
      VALUES ('baseline/001_courtzon_v3.sql', '$file_hash', 'up', $elapsed_ms);
    " 2>/dev/null || true
  else
    error "Baseline application failed"
  fi
}

apply_migrations() {
  local count=0
  for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration_file" ] || continue
    local filename
    filename=$(basename "$migration_file")

    local already_applied
    already_applied=$(mysql $MYSQL -N -e "
      SELECT COUNT(*) FROM $TRACKING_TABLE WHERE filename='$filename' AND direction='up';
    " 2>/dev/null || echo "0")

    if [ "$already_applied" -gt 0 ]; then
      log "SKIP $filename (already applied)"
      continue
    fi

    log "Applying: $filename"
    local start_time
    start_time=$(date +%s%N)

    if mysql $MYSQL < "$migration_file"; then
      local end_time
      end_time=$(date +%s%N)
      local elapsed_ms=$(( (end_time - start_time) / 1000000 ))
      local file_hash
      file_hash=$(sha256sum "$migration_file" | cut -c1-12)

      mysql $MYSQL -N -e "
        INSERT IGNORE INTO $TRACKING_TABLE (filename, hash, direction, execution_ms)
        VALUES ('$filename', '$file_hash', 'up', $elapsed_ms);
      " 2>/dev/null || true
      log "OK $filename (${elapsed_ms}ms)"
      count=$((count + 1))
    else
      log "FAIL $filename"
      return 1
    fi
  done

  if [ "$count" -eq 0 ]; then
    log "No new migrations to apply."
  else
    log "$count migration(s) applied."
  fi
}

show_status() {
  echo "=== Migration Status ==="
  echo "Database: $DB_NAME"
  echo ""

  local total
  total=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)
  echo "Migration files: $total"
  echo ""

  echo "Applied migrations:"
  mysql $MYSQL -N -e "
    SELECT CONCAT('  [', applied_at, '] ', filename, ' (', hash, ') ', execution_ms, 'ms')
    FROM $TRACKING_TABLE WHERE direction='up' ORDER BY id;
  " 2>/dev/null || echo "  (none)"

  echo ""
  echo "Pending migrations:"
  mysql $MYSQL -N -e "
    SELECT filename FROM $TRACKING_TABLE WHERE direction='down';
  " 2>/dev/null | while read -r f; do
    echo "  [ROLLED BACK] $f"
  done

  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    local fname
    fname=$(basename "$f")
    local applied
    applied=$(mysql $MYSQL -N -e "
      SELECT COUNT(*) FROM $TRACKING_TABLE WHERE filename='$fname' AND direction='up';
    " 2>/dev/null || echo "0")
    if [ "$applied" -eq 0 ]; then
      echo "  [PENDING] $fname"
    fi
  done
}

rollback() {
  local target="$1"
  log "Rolling back: $target"

  local is_applied
  is_applied=$(mysql $MYSQL -N -e "
    SELECT COUNT(*) FROM $TRACKING_TABLE WHERE filename='$target' AND direction='up';
  " 2>/dev/null || echo "0")

  if [ "$is_applied" -eq 0 ]; then
    error "Migration '$target' is not applied or not found"
  fi

  local migration_file="$MIGRATIONS_DIR/$target"
  if [ ! -f "$migration_file" ]; then
    migration_file="$BASELINE_DIR/$target"
  fi
  if [ ! -f "$migration_file" ]; then
    error "Migration file not found: $target"
  fi

  local has_down
  has_down=$(grep -c "^-- DOWN:" "$migration_file" 2>/dev/null || echo "0")
  if [ "$has_down" -eq 0 ]; then
    error "No -- DOWN: section found in $target. Cannot roll back."
  fi

  local start_time
  start_time=$(date +%s%N)

  sed -n '/^-- DOWN:/,/^-- UP:/p' "$migration_file" | grep -v "^-- DOWN:" | grep -v "^-- UP:" | mysql $MYSQL

  local end_time
  end_time=$(date +%s%N)
  local elapsed_ms=$(( (end_time - start_time) / 1000000 ))

  mysql $MYSQL -N -e "
    INSERT INTO $TRACKING_TABLE (filename, hash, direction, execution_ms)
    VALUES ('$target', 'rollback', 'down', $elapsed_ms);
  " 2>/dev/null || true
  log "Rolled back $target (${elapsed_ms}ms)"
}

main() {
  local fresh=false
  local status=false
  local rollback_target=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --fresh) fresh=true ;;
      --status) status=true ;;
      --rollback) shift; rollback_target="$1" ;;
      --help) usage ;;
      *) error "Unknown option: $1" ;;
    esac
    shift
  done

  if [ "$status" = true ]; then
    ensure_tracking_table
    show_status
    exit 0
  fi

  if [ -n "$rollback_target" ]; then
    ensure_tracking_table
    rollback "$rollback_target"
    exit 0
  fi

  if [ "$fresh" = true ]; then
    log "Fresh mode: dropping and recreating database..."
    mysql $MYSQL_ADMIN -N -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;"
    mysql $MYSQL_ADMIN -N -e "CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    log "Database recreated."
  fi

  ensure_tracking_table

  if [ "$fresh" = true ]; then
    apply_baseline
  fi

  apply_migrations

  log "Migration complete."
}

main "$@"
