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
# An explicitly empty DB_NAME is preserved so the guard can reject it; only an
# unset variable falls back to the default target.
DB_NAME="${DB_NAME-courtzon_v3}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
ALLOW_PERSISTENT_SEED="${ALLOW_PERSISTENT_SEED:-false}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  log "ERROR: $*"
  exit 1
}

# ── Database target guard (fail-closed) ─────────────────────────────────────
# Single source of truth: backend/scripts/seed.js performs no separate target
# validation and simply delegates here, so the rules and refusal messages
# cannot diverge between entry points.
#
#   1. DB_NAME must be non-empty and contain only ASCII letters, digits or
#      underscores. Surrounding whitespace (ASCII and Unicode), embedded
#      whitespace and every other character are rejected — never trimmed or
#      rewritten.
#   2. DB_HOST must be loopback (127.0.0.1, localhost or ::1) for EVERY
#      target, including names ending in '_test'.
#   3. 'courtzon_test' and names ending in '_test' are disposable. Every other
#      name is persistent or unclassified and additionally requires
#      ALLOW_PERSISTENT_SEED=true. The opt-in never relaxes rule 2.
#
# This MUST run before the first MySQL invocation on every write path.
require_safe_seed_target() {
  local db_name="$1"
  local normalized
  # Pin byte semantics so the character-class test behaves identically across
  # locales (Unicode whitespace must never be treated as acceptable).
  local LC_ALL=C

  if [ -z "$db_name" ]; then
    error "DB_NAME is not set or is empty; refusing to seed."
  fi

  case "$db_name" in
    *[!A-Za-z0-9_]*)
      error "DB_NAME contains characters other than ASCII letters, digits or underscores; refusing to seed."
      ;;
  esac

  case "$DB_HOST" in
    127.0.0.1|localhost|::1) ;;
    *) error "Refusing to seed database '$db_name' on non-loopback host '$DB_HOST'. Seeding is restricted to 127.0.0.1, localhost or ::1." ;;
  esac

  # Case-insensitive comparison without requiring bash 4 (`${var,,}`), so the
  # macOS system bash 3.2 behaves identically.
  normalized="$(printf '%s' "$db_name" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    # The '_test' suffix rule also covers names ending in '_restore_test'.
    courtzon_test|*_test) return 0 ;;
  esac

  if [ "$ALLOW_PERSISTENT_SEED" != "true" ]; then
    error "Refusing to seed database '$db_name': persistent and unclassified targets require explicit opt-in. Set ALLOW_PERSISTENT_SEED=true to authorize intentional persistent seeding."
  fi
}

# Argument boundaries matter: arrays keep each MySQL argument as a separate
# argv entry, so values can never be split, glob-expanded or reinterpreted as
# extra options. `MYSQL_OPTS` is the connection-only prefix; `MYSQL_ARGS` adds
# the database name for statements that run inside that schema.
MYSQL_OPTS=(-h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER")
[ -n "$DB_PASSWORD" ] && MYSQL_OPTS+=("-p$DB_PASSWORD")
MYSQL_ARGS=("${MYSQL_OPTS[@]}" "$DB_NAME")

usage() {
  echo "Usage: $0 [--seed-file <filename>] [--list] [--help]"
  echo ""
  echo "  --seed-file <filename>  Run a specific seed file from database/seeds/"
  echo "  --list                  List available seed files (no database connection)"
  echo "  --help                  Show this help"
  echo ""
  echo "Without arguments, runs all seed files in database/seeds/ in order."
  echo ""
  echo "SAFETY: DB_NAME must be non-empty and contain only ASCII letters, digits"
  echo "        or underscores. DB_HOST must be loopback (127.0.0.1, localhost or"
  echo "        ::1) for every target. 'courtzon_test' and names ending in '_test'"
  echo "        are disposable; every other name additionally requires"
  echo "        ALLOW_PERSISTENT_SEED=true."
  echo "        Full seeding is refused when 'users' has more than 5 records;"
  echo "        apply a single file explicitly with --seed-file <filename>."
  exit 0
}

list_seed_files() {
  echo "Available seed files in $SEEDS_DIR:"
  for f in "$SEEDS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    echo "  $(basename "$f")"
  done
}

seed_file() {
  local filepath="$1"
  local filename
  filename=$(basename "$filepath")

  log "Seeding: $filename"
  local start_time
  start_time=$(date +%s%N)

  if "$MYSQL_BIN" "${MYSQL_ARGS[@]}" < "$filepath"; then
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
  local help_only=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --seed-file)
        [ $# -ge 2 ] || error "--seed-file requires a filename"
        [ -n "$2" ] || error "--seed-file requires a filename"
        specific_file="$2"
        shift
        ;;
      --list) list_only=true ;;
      --help) help_only=true ;;
      *) error "Unknown option: $1" ;;
    esac
    shift
  done

  # Read-only modes perform no database I/O and must work without a reachable
  # MySQL server, so they short-circuit BEFORE the target guard and BEFORE the
  # connection probe. Never add a database call to these branches.
  if [ "$help_only" = true ]; then
    usage
  fi
  if [ "$list_only" = true ]; then
    list_seed_files
    exit 0
  fi

  # Every writable path is guarded before the first MySQL invocation.
  require_safe_seed_target "$DB_NAME"

  # Verify DB connection
  "$MYSQL_BIN" "${MYSQL_OPTS[@]}" -N -e "SELECT 1;" >/dev/null 2>&1 || error "Cannot connect to MySQL"

  # ── Safety check: never overwrite existing user data ────────────────
  if [ "$specific_file" = "" ]; then
    local _USER_COUNT
    _USER_COUNT=$("$MYSQL_BIN" "${MYSQL_ARGS[@]}" -N -e "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")
    if [ "$_USER_COUNT" -gt 5 ] 2>/dev/null; then
      log "WARNING: 'users' table has $_USER_COUNT records — refusing to seed."
      log "Apply a specific seed file explicitly with --seed-file <filename>."
      log "Seed aborted."
      exit 0
    fi
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
