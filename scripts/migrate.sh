#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
BASELINE_DIR="$PROJECT_ROOT/database/baseline"
LOG_FILE="$PROJECT_ROOT/backups/migration.log"
TRACKING_TABLE="migration_history"

# ── Load the shared migration environment guard ──────────────────────────────
# Single source of truth for the LOCAL_DOCKER_ONLY vs PRODUCTION_SAFE
# classification — the same policy the Docker entrypoint enforces. Missing
# guard = fail-closed (refuse to run migrations without the policy).
GUARD_FILE="$PROJECT_ROOT/backend/scripts/migration-guard.sh"
if [ ! -f "$GUARD_FILE" ]; then
  # Container layout: backend scripts are mounted at /app/scripts with this file.
  GUARD_FILE="$SCRIPT_DIR/migration-guard.sh"
fi
if [ ! -f "$GUARD_FILE" ]; then
  echo "ERROR: migration guard not found (looked in backend/scripts and $SCRIPT_DIR) — refusing to run migrations (fail-closed)" >&2
  exit 1
fi
# shellcheck source=../backend/scripts/migration-guard.sh
source "$GUARD_FILE"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
DB_NAME="${DB_NAME:-courtzon_v3}"

# ── Load the shared database TLS policy ──────────────────────────────────────
# Single source of truth for how the mariadb CLI negotiates TLS (DB_TLS_MODE:
# disable | require | verify-ca). The same policy is sourced by the Docker
# entrypoint and implemented for mysql2 in backend/scripts/db-tls.js, so the
# shell runner and the Node driver can never disagree. Unresolvable policy =
# fail-closed before the first connection attempt.
DB_TLS_LIB="$PROJECT_ROOT/backend/scripts/db-tls.sh"
if [ ! -f "$DB_TLS_LIB" ]; then
  # Container layout: backend scripts are mounted at /app/scripts.
  DB_TLS_LIB="$SCRIPT_DIR/db-tls.sh"
fi
if [ ! -f "$DB_TLS_LIB" ]; then
  echo "ERROR: database TLS policy library not found (looked in backend/scripts and $SCRIPT_DIR) — refusing to run migrations (fail-closed)" >&2
  exit 1
fi
# shellcheck source=../backend/scripts/db-tls.sh
. "$DB_TLS_LIB"

if ! db_tls_resolve; then
  exit 1
fi
if [ -n "$DB_TLS_WARNINGS" ]; then
  echo "$DB_TLS_WARNINGS" >&2
fi
echo "Database TLS policy: $(db_tls_describe)"

if command -v mysql >/dev/null 2>&1; then
  MYSQL_BIN="$(command -v mysql)"
elif command -v mariadb >/dev/null 2>&1; then
  MYSQL_BIN="$(command -v mariadb)"
else
  echo "ERROR: neither mysql nor mariadb client is available; refusing to run migrations" >&2
  exit 1
fi

mysql() {
  "$MYSQL_BIN" "$@"
}

MYSQL_OPTS="-h $DB_HOST -P $DB_PORT -u $DB_USER $DB_TLS_CLI_ARGS"
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
  echo "Usage: $0 [--status] [--rollback <filename>]"
  echo "       $0 --fresh --confirm-destructive-fresh"
  echo ""
  echo "  --status                      Show migration status (applied vs pending)"
  echo "  --rollback <file>             Roll back a specific migration (down migration required)"
  echo "  --fresh                       DESTRUCTIVE: drop and recreate the database, then apply"
  echo "                                the baseline. Refused unless --confirm-destructive-fresh"
  echo "                                is supplied as well."
  echo "  --confirm-destructive-fresh   Explicit acknowledgement that --fresh destroys all data"
  echo "                                in the target database. Only valid together with --fresh."
  echo "  --help                        Show this help"
  echo ""
  echo "  --seed is NOT supported here. Apply seed data separately with scripts/seed.sh;"
  echo "  the combination --fresh --seed is rejected before any database change."
  echo ""
  echo "  Operators should run the canonical entry point (node backend/scripts/migrate.js),"
  echo "  which holds the MySQL advisory lock for the entire run."
  exit 0
}

history_column_exists() {
  local count
  count=$(mysql $MYSQL -N -e "
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = '$TRACKING_TABLE'
       AND COLUMN_NAME = '$1';
  ")
  [ "$count" -gt 0 ]
}

history_index_exists() {
  local count
  count=$(mysql $MYSQL -N -e "
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = '$TRACKING_TABLE'
       AND INDEX_NAME = '$1';
  ")
  [ "$count" -gt 0 ]
}

history_index_columns() {
  mysql $MYSQL -N -e "
    SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = '$TRACKING_TABLE'
       AND INDEX_NAME = '$1';
  "
}

record_history() {
  local filename="$1"
  local direction="$2"
  local file_hash="$3"
  local hash_kind="$4"
  local execution_ms="$5"

  if mysql $MYSQL -e "
    INSERT INTO $TRACKING_TABLE (filename, direction, hash, hash_kind, execution_ms)
    VALUES ('$filename', '$direction', '$file_hash', '$hash_kind', $execution_ms);
  "; then
    return 0
  fi
  return 1
}

ensure_tracking_table() {
  local table_exists
  table_exists=$(mysql $MYSQL -N -e "
    SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$TRACKING_TABLE';
  ")

  if [ "$table_exists" -eq 0 ]; then
    mysql $MYSQL -e "
      CREATE TABLE \`$TRACKING_TABLE\` (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        filename      VARCHAR(255) NOT NULL,
        direction     ENUM('up', 'down', 'failed') NOT NULL DEFAULT 'up',
        hash          VARCHAR(64) NOT NULL,
        hash_kind     VARCHAR(32) NOT NULL DEFAULT 'unknown',
        execution_ms  INT NOT NULL DEFAULT 0,
        applied_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_mh_filename_id (filename, id),
        KEY idx_mh_direction (direction)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    "
    return
  fi

  # Resumable, additive compatibility bootstrap. Each step is guarded by
  # information_schema; a partial previous run can be completed on the next start.
  local required_col
  for required_col in filename hash execution_ms applied_at; do
    if ! history_column_exists "$required_col"; then
      error "migration_history is missing required column '$required_col'; refusing to continue"
    fi
  done

  if ! history_column_exists direction; then
    mysql $MYSQL -e "
      ALTER TABLE \`$TRACKING_TABLE\`
        ADD COLUMN direction ENUM('up', 'down', 'failed') NOT NULL DEFAULT 'up'
        AFTER filename;
    "
  else
    local direction_type
    direction_type=$(mysql $MYSQL -N -e "
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$TRACKING_TABLE'
         AND COLUMN_NAME = 'direction';
    ")
    case "$direction_type" in
      *failed*) : ;;
      *)
        mysql $MYSQL -e "
          ALTER TABLE \`$TRACKING_TABLE\`
            MODIFY COLUMN direction ENUM('up', 'down', 'failed') NOT NULL DEFAULT 'up';
        "
        ;;
    esac
  fi

  if ! history_column_exists hash_kind; then
    mysql $MYSQL -e "
      ALTER TABLE \`$TRACKING_TABLE\`
        ADD COLUMN hash_kind VARCHAR(32) NOT NULL DEFAULT 'unknown'
        AFTER hash;
    "
  fi

  # UNIQUE(filename) is incompatible with append-only rollback/failure history.
  # Drop it only after proving there are no duplicate filenames; never delete rows.
  local unique_filename_indexes
  unique_filename_indexes=$(mysql $MYSQL -N -e "
    SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = '$TRACKING_TABLE'
       AND NON_UNIQUE = 0
     GROUP BY INDEX_NAME
    HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'filename';
  ")
  if [ -n "$unique_filename_indexes" ]; then
    local duplicates
    duplicates=$(mysql $MYSQL -N -e "
      SELECT COUNT(*) FROM (
        SELECT filename FROM $TRACKING_TABLE GROUP BY filename HAVING COUNT(*) > 1
      ) AS duplicate_files;
    ")
    if [ "$duplicates" -ne 0 ]; then
      error "migration_history contains duplicate filenames; refusing to drop UNIQUE(filename). Manual review required"
    fi
    local idx
    for idx in $unique_filename_indexes; do
      mysql $MYSQL -e "ALTER TABLE \`$TRACKING_TABLE\` DROP INDEX \`$idx\`;"
    done
  fi

  if history_index_exists idx_mh_filename_id; then
    local filename_index_cols
    filename_index_cols=$(history_index_columns idx_mh_filename_id)
    if [ "$filename_index_cols" != "filename,id" ]; then
      error "migration_history index idx_mh_filename_id has an unexpected definition ($filename_index_cols); refusing to continue"
    fi
  else
    mysql $MYSQL -e "ALTER TABLE \`$TRACKING_TABLE\` ADD INDEX idx_mh_filename_id (filename, id);"
  fi
  if history_index_exists idx_mh_direction; then
    local direction_index_cols
    direction_index_cols=$(history_index_columns idx_mh_direction)
    if [ "$direction_index_cols" != "direction" ]; then
      error "migration_history index idx_mh_direction has an unexpected definition ($direction_index_cols); refusing to continue"
    fi
  else
    mysql $MYSQL -e "ALTER TABLE \`$TRACKING_TABLE\` ADD INDEX idx_mh_direction (direction);"
  fi
}

latest_history_direction() {
  mysql $MYSQL -N -e "
    SELECT direction FROM $TRACKING_TABLE
     WHERE filename = '$1'
     ORDER BY id DESC LIMIT 1;
  "
}

# ── Applied-file checksum provenance verification ─────────────────────────────
# Historical rows use several formats. Classify by hash_kind, compare hex
# case-insensitively, and never treat placeholders as content drift. This is
# observability only: it never blocks or re-runs an applied migration.

checksum_lower() { printf '%s' "$1" | tr 'A-F' 'a-f'; }

checksum_is_hex12() { [[ "$1" =~ ^[0-9a-fA-F]{12}$ ]]; }
checksum_is_hex64() { [[ "$1" =~ ^[0-9a-fA-F]{64}$ ]]; }

checksum_matches() {
  local stored candidate
  stored=$(checksum_lower "$1")
  candidate=$(checksum_lower "$2")
  if checksum_is_hex12 "$stored"; then
    [ "${candidate:0:12}" = "$stored" ]
    return
  fi
  if checksum_is_hex64 "$stored"; then
    [ "$candidate" = "$stored" ]
    return
  fi
  return 1
}

checksum_filename_sha256() {
  printf '%s' "$1" | sha256sum | awk '{print $1}'
}

# Echo the finding category, or nothing when the record is verified or ignored.
classify_applied_checksum() {
  local filename="$1" stored="$2" kind="${3:-unknown}" current="$4"
  case "$kind" in
    attempt_started)
      return 0
      ;;
    content_sha256)
      if { checksum_is_hex12 "$stored" || checksum_is_hex64 "$stored"; } && checksum_matches "$stored" "$current"; then
        return 0
      fi
      if checksum_is_hex12 "$stored" || checksum_is_hex64 "$stored"; then
        printf '%s\n' CONTENT_DRIFT
      else
        printf '%s\n' UNVERIFIABLE_LEGACY_HASH
      fi
      return 0
      ;;
    legacy_filename_sha256)
      local legacy
      if ! checksum_is_hex12 "$stored" && ! checksum_is_hex64 "$stored"; then
        printf '%s\n' UNVERIFIABLE_LEGACY_HASH
        return 0
      fi
      legacy=$(checksum_filename_sha256 "$filename")
      if checksum_matches "$stored" "$legacy"; then
        return 0
      fi
      printf '%s\n' LEGACY_FORMAT_MISMATCH
      return 0
      ;;
    *)
      if checksum_is_hex12 "$stored" || checksum_is_hex64 "$stored"; then
        local legacy
        legacy=$(checksum_filename_sha256 "$filename")
        if checksum_matches "$stored" "$current" || checksum_matches "$stored" "$legacy"; then
          return 0
        fi
        printf '%s\n' UNVERIFIABLE_LEGACY_HASH
      else
        printf '%s\n' UNVERIFIABLE_LEGACY_HASH
      fi
      return 0
      ;;
  esac
}

verify_applied_hashes() {
  local checked=0 drift=0 legacy_fmt=0 unverifiable=0 orphan=0 missing=0
  local -A reported=()
  local -A up_files=()
  local baseline_name='baseline/001_courtzon_v3.sql'
  local baseline_file="$BASELINE_DIR/001_courtzon_v3.sql"

  # All history filenames (orphan detection) and applied filenames (gap detection).
  local all_history up_history
  all_history=$(mysql $MYSQL -N -e "SELECT DISTINCT filename FROM $TRACKING_TABLE ORDER BY filename;" 2>/dev/null || true)
  up_history=$(mysql $MYSQL -N -e "SELECT DISTINCT filename FROM $TRACKING_TABLE WHERE direction='up' ORDER BY filename;" 2>/dev/null || true)
  local -A has_history=()
  local history_name
  while IFS= read -r history_name; do
    history_name="${history_name%$'\r'}"
    [ -n "$history_name" ] || continue
    has_history["$history_name"]=1
  done <<< "$all_history"
  while IFS= read -r history_name; do
    history_name="${history_name%$'\r'}"
    [ -n "$history_name" ] || continue
    up_files["$history_name"]=1
  done <<< "$up_history"

  while IFS= read -r history_name; do
    history_name="${history_name%$'\r'}"
    [ -n "$history_name" ] || continue
    [ "$history_name" = "$baseline_name" ] && continue
    if [ ! -f "$MIGRATIONS_DIR/$history_name" ]; then
      local orphan_key="ORPHAN_HISTORY_ROW:$history_name"
      if [ -z "${reported[$orphan_key]+x}" ]; then
        reported[$orphan_key]=1
        orphan=$((orphan + 1))
        log "CHECKSUM[ORPHAN_HISTORY_ROW] $history_name — history row has no migration file; row preserved"
      fi
    fi
  done <<< "$all_history"

  # Baseline synthetic record.
  if [ -f "$baseline_file" ]; then
    local baseline_row b_hash b_kind b_current b_category
    baseline_row=$(mysql $MYSQL -N -e "SELECT hash, hash_kind FROM $TRACKING_TABLE WHERE filename='$baseline_name' AND direction='up' ORDER BY id DESC LIMIT 1;" 2>/dev/null || true)
    if [ -n "$baseline_row" ]; then
      IFS=$'\t' read -r b_hash b_kind <<< "$baseline_row"
      b_hash="${b_hash%$'\r'}"
      b_kind="${b_kind%$'\r'}"
      b_kind=$(printf '%s' "${b_kind:-unknown}" | tr '[:upper:]' '[:lower:]')
      [ -n "$b_kind" ] || b_kind=unknown
      b_current=$(sha256sum "$baseline_file" | awk '{print $1}')
      b_category=$(classify_applied_checksum "$baseline_name" "$b_hash" "$b_kind" "$b_current")
      checked=$((checked + 1))
      case "$b_category" in
        CONTENT_DRIFT) drift=$((drift + 1)) ;;
        LEGACY_FORMAT_MISMATCH) legacy_fmt=$((legacy_fmt + 1)) ;;
        UNVERIFIABLE_LEGACY_HASH) unverifiable=$((unverifiable + 1)) ;;
      esac
      if [ -n "$b_category" ]; then
        reported["$b_category:$baseline_name"]=1
        log "CHECKSUM[$b_category] $baseline_name recorded=$b_hash kind=$b_kind current=$b_current"
      fi
    fi
  fi

  # Collect migration files in deterministic filename order.
  local files=()
  local migration_file
  for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration_file" ] || continue
    files+=("$(basename "$migration_file")")
  done

  local index filename stored kind current category key later_index later_name eligible row
  for ((index = 0; index < ${#files[@]}; index++)); do
    filename="${files[$index]}"
    migration_file="$MIGRATIONS_DIR/$filename"
    row=$(mysql $MYSQL -N -e "SELECT hash, hash_kind FROM $TRACKING_TABLE WHERE filename='$filename' AND direction='up' ORDER BY id DESC LIMIT 1;" 2>/dev/null || true)
    if [ -z "$row" ]; then
      # Pending. Report missing history only when a later eligible migration is
      # already applied (ordered-runner semantics); a trailing pending file is
      # genuinely pending, not missing.
      later_index=-1
      for ((later_index = index + 1; later_index < ${#files[@]}; later_index++)); do
        later_name="${files[$later_index]}"
        if [ -n "${up_files[$later_name]+x}" ]; then
          break
        fi
      done
      if [ "$later_index" -lt "${#files[@]}" ] && [ -z "${has_history[$filename]+x}" ]; then
        eligible=1
        if command -v courtzon_migration_should_run >/dev/null 2>&1; then
          courtzon_migration_should_run "$migration_file" || eligible=0
        fi
        if [ "$eligible" -eq 1 ]; then
          missing=$((missing + 1))
          log "CHECKSUM[MISSING_HISTORY_ROW] $filename — later migration is applied but this eligible file has no up history"
        fi
      fi
      continue
    fi

    IFS=$'\t' read -r stored kind <<< "$row"
    stored="${stored%$'\r'}"
    kind="${kind%$'\r'}"
    kind=$(printf '%s' "${kind:-unknown}" | tr '[:upper:]' '[:lower:]')
    [ -n "$kind" ] || kind=unknown
    [ "$kind" = "attempt_started" ] && continue

    checked=$((checked + 1))
    current=$(sha256sum "$migration_file" | awk '{print $1}')
    category=$(classify_applied_checksum "$filename" "$stored" "$kind" "$current")
    if [ -n "$category" ]; then
      key="$category:$filename"
      if [ -z "${reported[$key]+x}" ]; then
        reported[$key]=1
        case "$category" in
          CONTENT_DRIFT) drift=$((drift + 1)) ;;
          LEGACY_FORMAT_MISMATCH) legacy_fmt=$((legacy_fmt + 1)) ;;
          UNVERIFIABLE_LEGACY_HASH) unverifiable=$((unverifiable + 1)) ;;
        esac
        log "CHECKSUM[$category] $filename recorded=$stored kind=$kind current=$current"
      fi
    fi
  done

  log "Checksum verification: $checked applied file(s) checked, CONTENT_DRIFT=$drift, LEGACY_FORMAT_MISMATCH=$legacy_fmt, UNVERIFIABLE_LEGACY_HASH=$unverifiable, ORPHAN_HISTORY_ROW=$orphan, MISSING_HISTORY_ROW=$missing"
}

apply_baseline() {
  local baseline_file="$BASELINE_DIR/001_courtzon_v3.sql"
  if [ ! -f "$baseline_file" ]; then
    log "No baseline found at $baseline_file. Skipping."
    return
  fi

  log "Applying baseline: $baseline_file"
  local start_time
  start_time=$(date +%s)

  local baseline_exit
  local baseline_out
  set +e
  baseline_out=$(mysql $MYSQL < "$baseline_file" 2>&1)
  baseline_exit=$?
  set -e

  if [ "$baseline_exit" -eq 0 ]; then
    local end_time
    end_time=$(date +%s)
    local elapsed_ms=$(( (end_time - start_time) * 1000 ))
    log "Baseline applied successfully (${elapsed_ms}ms)"

    local file_hash
    file_hash=$(sha256sum "$baseline_file" | awk '{print $1}')
    if ! record_history 'baseline/001_courtzon_v3.sql' 'up' "$file_hash" 'content_sha256' "$elapsed_ms"; then
      # A4 (limited warning): the baseline has no attempt-marker gate, so a
      # normal run against this database would replay the whole patch chain
      # over an imported baseline. Stop loudly and forbid that path.
      error "Baseline applied but its migration_history recording failed. Do NOT run the ordinary runner against this database: it would replay the migration chain over the imported baseline. Record the baseline row manually, or rerun only with --fresh --confirm-destructive-fresh. Aborting."
    fi
  else
    error "Baseline application failed (exit $baseline_exit); SQL diagnostics: $baseline_out"
  fi
}

apply_migrations() {
  local count=0
  for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration_file" ] || continue
    local filename
    filename=$(basename "$migration_file")

    local latest
    latest=$(latest_history_direction "$filename")
    case "$latest" in
      up)
        log "SKIP $filename (already applied)"
        continue
        ;;
      failed)
        error "STOP $filename (previous attempt failed; automatic retry is disabled. Manual schema review is required)"
        ;;
      down)
        error "STOP $filename (latest history state is down; automatic reapply is disabled. Explicit operator action is required)"
        ;;
      *)
        log "Applying: $filename"
        ;;
    esac

    # Migration-environment policy guard (fail-closed). A LOCAL_DOCKER_ONLY
    # migration is skipped — and never recorded — outside an explicit local
    # environment, so it can never reach Hostinger/production.
    if ! courtzon_migration_should_run "$migration_file"; then
      log "SKIP $filename (policy: $(courtzon_migration_skip_reason "$migration_file" "$filename"))"
      continue
    fi

    # ── Fail-closed attempt marker (A1) ──────────────────────────────────────
    # Written BEFORE execution so an unrecorded outcome — an 'up' write that
    # fails after the SQL succeeded, a crash, or a kill — still leaves a
    # non-'up' latest event and the next ordinary run stops instead of
    # re-executing possibly-partial SQL. Reuses the existing table, the
    # existing 'failed' direction and the free-form hash_kind column: there is
    # no new table, file or schema change.
    local file_hash
    file_hash=$(sha256sum "$migration_file" | awk '{print $1}')
    if ! record_history "$filename" 'failed' "$file_hash" 'attempt_started' 0; then
      error "Could not record the pre-execution attempt marker for $filename; refusing to execute it (fail-closed). No SQL was run."
    fi

    local start_time
    start_time=$(date +%s)

    local migration_exit
    local migration_out
    set +e
    migration_out=$(mysql $MYSQL < "$migration_file" 2>&1)
    migration_exit=$?
    set -e

    if [ "$migration_exit" -eq 0 ]; then
      local end_time
      end_time=$(date +%s)
      local elapsed_ms=$(( (end_time - start_time) * 1000 ))

      if ! record_history "$filename" 'up' "$file_hash" 'content_sha256' "$elapsed_ms"; then
        error "$filename applied successfully but the up event could not be recorded. The pre-execution attempt marker is still the latest history state, so the next run will STOP instead of re-executing it. Reconcile migration_history manually before continuing."
      fi
      log "OK $filename (${elapsed_ms}ms)"
      count=$((count + 1))
    else
      local end_time
      end_time=$(date +%s)
      local elapsed_ms=$(( (end_time - start_time) * 1000 ))

      # Append the real failure event. The pre-execution marker already blocks
      # automatic retries; this row records the actual SQL failure.
      if record_history "$filename" 'failed' "$file_hash" 'content_sha256' "$elapsed_ms"; then
        log "FAIL $filename (SQL exit $migration_exit, ${elapsed_ms}ms) — failed event recorded; automatic retry is disabled"
        log "SQL diagnostics: $migration_out"
      else
        # Two independent failures: the migration itself, and the failure
        # row. The pre-execution marker still prevents the retry, so report
        # both without claiming the failure row exists.
        log "FAIL $filename (SQL exit $migration_exit, ${elapsed_ms}ms) — SQL diagnostics: $migration_out"
        error "FAIL $filename — the failed event could not be appended, but the pre-execution attempt marker remains the latest history state, so the next run will STOP instead of retrying. Manual recovery required (SQL exit $migration_exit)."
      fi
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
  echo "Migration environment: $(courtzon_migration_env) (COURTZON_MIGRATION_ENV=${COURTZON_MIGRATION_ENV:-<unset>})"
  echo ""

  echo "Note: LOCAL_DOCKER_ONLY migrations are reported [PENDING] unless the
  environment is explicitly 'local' — they are intentionally never applied to
  production. They stay pending here by design."
  echo ""

  local total
  total=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)
  echo "Migration files: $total"
  echo ""

  echo "Migration history (latest state per file):"
  mysql $MYSQL -N -e "
    SELECT CONCAT('  [', mh.direction, '] ', mh.filename, ' (', mh.hash_kind, ') ', mh.execution_ms, 'ms')
    FROM $TRACKING_TABLE mh
    JOIN (
      SELECT filename, MAX(id) AS latest_id
      FROM $TRACKING_TABLE GROUP BY filename
    ) latest ON latest.latest_id = mh.id
    ORDER BY mh.filename;
  " 2>/dev/null || echo "  (none)"

  echo ""
  echo "Pending migrations:"
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    local fname
    fname=$(basename "$f")
    local latest
    latest=$(latest_history_direction "$fname")
    case "$latest" in
      up) : ;;
      down) echo "  [ROLLED BACK] $fname" ;;
      failed) echo "  [FAILED - manual review required] $fname" ;;
      *) echo "  [PENDING] $fname" ;;
    esac
  done
}

rollback() {
  local target="$1"
  log "Rolling back: $target"

  local latest
  latest=$(latest_history_direction "$target")

  if [ "$latest" != "up" ]; then
    error "Migration '$target' is not applied (latest state: ${latest:-none}) — cannot roll back"
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
  start_time=$(date +%s)

  local rollback_exit
  local rollback_out
  set +e
  rollback_out=$(sed -n '/^-- DOWN:/,/^-- UP:/p' "$migration_file" | grep -v "^-- DOWN:" | grep -v "^-- UP:" | mysql $MYSQL 2>&1)
  rollback_exit=$?
  set -e
  if [ "$rollback_exit" -ne 0 ]; then
    error "Rollback failed for $target (exit $rollback_exit); SQL diagnostics: $rollback_out"
  fi

  local end_time
  end_time=$(date +%s)
  local elapsed_ms=$(( (end_time - start_time) * 1000 ))

  # Append a down event; the prior up event is preserved for audit.
  if ! record_history "$target" 'down' 'rollback' 'rollback' "$elapsed_ms"; then
    error "Rollback executed but migration_history recording failed for $target; aborting"
  fi
  log "Rolled back $target (${elapsed_ms}ms)"
}

main() {
  local fresh=false
  local confirm_destructive_fresh=false
  local status=false
  local rollback_target=""
  local seed_requested=false

  local seen=""
  while [ $# -gt 0 ]; do
    # Duplicate options are rejected before any parsing side effect and before
    # any database command.
    case " $seen " in
      *" $1 "*) error "Duplicate option: $1. No database changes were made." ;;
    esac
    case "$1" in
      --fresh) seen="$seen $1"; fresh=true ;;
      --confirm-destructive-fresh) seen="$seen $1"; confirm_destructive_fresh=true ;;
      --seed) seen="$seen $1"; seed_requested=true ;;
      --status) seen="$seen $1"; status=true ;;
      --rollback)
        seen="$seen $1"
        shift
        rollback_target="${1:-}"
        if [ -z "$rollback_target" ]; then
          error "--rollback requires a migration filename. No database changes were made."
        fi
        # A filename must never be an option token: previously --rollback --fresh
        # silently swallowed --fresh as a filename.
        case "$rollback_target" in
          --*) error "--rollback requires a migration filename, not an option: '$rollback_target'. No database changes were made." ;;
        esac
        ;;
      --help) usage ;;
      *) error "Unknown option: $1. No database changes were made." ;;
    esac
    shift
  done

  # ── Argument safety, evaluated before ANY database command ─────────────────
  # --fresh drops and recreates the target database, so it is never implicit.
  # Unsupported combinations are rejected here, before the destructive branch,
  # which guarantees they cannot drop or create anything.
  if [ "$fresh" = true ] && [ "$seed_requested" = true ]; then
    error "--fresh --seed is not a supported combination (seeding is a separate step). No database changes were made. Use --fresh --confirm-destructive-fresh, then scripts/seed.sh."
  fi
  if [ "$seed_requested" = true ]; then
    error "--seed is not supported by the migration runner; use scripts/seed.sh after migrating. No database changes were made."
  fi
  if [ "$confirm_destructive_fresh" = true ] && [ "$fresh" != true ]; then
    error "--confirm-destructive-fresh is only valid together with --fresh. No database changes were made."
  fi
  if [ "$fresh" = true ] && [ "$confirm_destructive_fresh" != true ]; then
    error "--fresh is destructive (it drops and recreates database '$DB_NAME') and is disabled without explicit confirmation. Re-run with --fresh --confirm-destructive-fresh only if destroying all data in '$DB_NAME' is intended. No database changes were made."
  fi
  if [ "$fresh" = true ] && { [ "$status" = true ] || [ -n "$rollback_target" ]; }; then
    error "--fresh cannot be combined with --status or --rollback. No database changes were made."
  fi
  if [ "$status" = true ] && [ -n "$rollback_target" ]; then
    error "--status cannot be combined with --rollback. No database changes were made."
  fi

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
  verify_applied_hashes

  if [ "$fresh" = true ]; then
    apply_baseline
  fi

  log "Migration environment: $(courtzon_migration_env) (COURTZON_MIGRATION_ENV=${COURTZON_MIGRATION_ENV:-<unset>})"
  apply_migrations

  log "Migration complete."
}

if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  main "$@"
fi
