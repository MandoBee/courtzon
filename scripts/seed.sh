#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEEDS_DIR="$PROJECT_ROOT/database/seeds"

LOG_FILE="$PROJECT_ROOT/backups/seed.log"

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
  echo "Usage: $0 [--seed-file <filename>] [--list]"
  echo ""
  echo "  --seed-file <filename>  Run a specific seed file from database/seeds/"
  echo "  --list                  List available seed files"
  echo "  --force                 Run even if users table has existing data"
  echo "  --help                  Show this help"
  echo ""
  echo "Without arguments, runs all seed files in database/seeds/ in order."
  echo ""
  echo "SAFETY: Refuses to run if 'users' table has more than 5 records (seed threshold)."
  echo "        Use --force or --seed-file to bypass."
  exit 0
}

seed_file() {
  local filepath="$1"
  local filename
  filename=$(basename "$filepath")

  log "Seeding: $filename"
  local start_time
  start_time=$(date +%s%N)

  if mysql $MYSQL < "$filepath"; then
    local end_time
    end_time=$(date +%s%N)
    local elapsed_ms=$(( (end_time - start_time) / 1000000 ))
    log "OK $filename (${elapsed_ms}ms)"
    return 0
  else
    log "FAIL $filename"
    return 1
  fi
}

main() {
  local specific_file=""
  local list_only=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --seed-file) shift; specific_file="$1" ;;
      --list) list_only=true ;;
      --help) usage ;;
      *) error "Unknown option: $1" ;;
    esac
    shift
  done

  # Verify DB connection
  mysql $MYSQL_ADMIN -N -e "SELECT 1;" >/dev/null 2>&1 || error "Cannot connect to MySQL"

  # ── Safety check: never overwrite existing user data ────────────────
  if [ "$specific_file" = "" ] && [ "$list_only" = false ]; then
    local _USER_COUNT
    _USER_COUNT=$(mysql $MYSQL -N -e "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")
    if [ "$_USER_COUNT" -gt 5 ] 2>/dev/null; then
      log "WARNING: 'users' table has $_USER_COUNT records — refusing to seed."
      log "Use --force to seed anyway (INSERT IGNORE will skip existing rows)."
      log "Seed aborted."
      exit 0
    fi
  fi

  if [ "$list_only" = true ]; then
    echo "Available seed files in $SEEDS_DIR:"
    for f in "$SEEDS_DIR"/*.sql; do
      [ -f "$f" ] || continue
      echo "  $(basename "$f")"
    done
    exit 0
  fi

  if [ -n "$specific_file" ]; then
    local filepath="$SEEDS_DIR/$specific_file"
    [ -f "$filepath" ] || error "Seed file not found: $specific_file"
    seed_file "$filepath"
    log "Seed complete."
    exit 0
  fi

  # Run all seed files in order
  local count=0
  for seed_file in "$SEEDS_DIR"/*.sql; do
    [ -f "$seed_file" ] || continue
    seed_file "$seed_file"
    count=$((count + 1))
  done

  log "$count seed file(s) applied."
  log "Seed complete."
}

main "$@"
