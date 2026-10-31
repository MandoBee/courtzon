#!/bin/sh
set -e

# ── Load the shared migration environment guard ──────────────────────
# Single source of truth for the LOCAL_DOCKER_ONLY vs PRODUCTION_SAFE
# classification used by the automatic migration loop below (and by the
# manual runner scripts/migrate.sh). If the guard is missing the container
# fails to start — fail-closed: migrations never run without the policy.
# shellcheck source=./migration-guard.sh
. /app/scripts/migration-guard.sh

# ── Load the shared database TLS policy ──────────────────────────────
# Single source of truth (DB_TLS_MODE: disable | require | verify-ca) for how
# every path in this container negotiates TLS: this entrypoint's CLI queries,
# the canonical migration runner (scripts/migrate.sh), and the Node/mysql2
# connections (backend/scripts/db-tls.js). An unresolvable or invalid policy
# fails closed here — the container never connects with an implicit TLS mode.
# shellcheck source=./db-tls.sh
. /app/scripts/db-tls.sh
if ! db_tls_resolve; then
  exit 1
fi
if [ -n "$DB_TLS_WARNINGS" ]; then
  echo "$DB_TLS_WARNINGS" >&2
fi
echo "Database TLS policy: $(db_tls_describe)"

# ── Fix bind-mounted uploads directory permissions ──────────────────
# Docker creates bind mount source dirs as root:root with mode 0755.
# The container runs as root during entrypoint, so we fix ownership
# BEFORE dropping privileges to appuser.
# Dirs: 775 (rwxrwxr-x) — owner+group can traverse and create files.
# Files: 664 (rw-rw-r--) — owner+group can read/write, others read-only.
UP="/app/uploads"
if [ -d "$UP" ]; then
  chown -R appuser:appgroup "$UP" 2>/dev/null || true
  find "$UP" -type d -exec chmod 775 {} \; 2>/dev/null || true
  find "$UP" -type f -exec chmod 664 {} \; 2>/dev/null || true
  echo "Uploads permissions fixed for $UP (dirs:775, files:664)"
else
  mkdir -p "$UP"
  chown appuser:appgroup "$UP"
  chmod 775 "$UP"
fi

echo "Waiting for MySQL..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  sleep 1
done
echo "MySQL is ready."

echo "Waiting for Redis..."
until nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; do
  sleep 1
done
echo "Redis is ready."

echo "Checking database state..."
_PASS="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
_MYSQL="/usr/bin/mariadb -h $DB_HOST -P $DB_PORT -u $DB_USER -p$_PASS $DB_TLS_CLI_ARGS"
_TABLE_COUNT=$($_MYSQL -N -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME'" 2>/dev/null)
if [ -z "$_TABLE_COUNT" ] || [ "$_TABLE_COUNT" = "0" ]; then
  echo "Database is empty — importing baseline schema..."
  $_MYSQL "$DB_NAME" < /app/database/baseline/001_courtzon_v3.sql
  echo "Baseline schema imported."

  echo "Importing seed data..."
  $_MYSQL "$DB_NAME" < /app/database/seeds/001_baseline.sql
  echo "Seed data imported."
  # The baseline ALREADY contains the full production-safe schema for every
  # migration (the single authoritative baseline). Stamp migration_history so a
  # container RESTART does not re-run the additive 001-162 patch chain over a
  # baseline-hydrated database (replays are destructive: e.g. 061 renames
  # academy_enrollments, 138 drops the mislabeled legacy copy). Files whose
  # marker policy would skip them (LOCAL_DOCKER_ONLY outside local) are NOT
  # stamped and stay pending for the canonical runner below.
  echo "Stamping migration_history for the imported baseline..."
  $_MYSQL "$DB_NAME" -e \
    "CREATE TABLE IF NOT EXISTS migration_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      direction ENUM('up', 'down', 'failed') NOT NULL DEFAULT 'up',
      hash VARCHAR(64) NOT NULL,
      hash_kind VARCHAR(32) NOT NULL DEFAULT 'unknown',
      execution_ms INT NOT NULL DEFAULT 0,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mh_filename_id (filename, id),
      KEY idx_mh_direction (direction)
    )"
  for f in /app/database/migrations/*.sql; do
    if [ -f "$f" ]; then
      fname=$(basename "$f")
      if courtzon_migration_should_run "$f"; then
        $_MYSQL "$DB_NAME" -e \
          "INSERT IGNORE INTO migration_history (filename, direction, hash, hash_kind) VALUES ('$fname', 'up', SHA2('$fname', 256), 'legacy_filename_sha256')"
      fi
    fi
  done
  echo "Baseline schema stamped into migration_history."
else
  echo "Database has $_TABLE_COUNT tables — skipping baseline re-import."

  # Canonical migration execution path. The Node runner holds the MySQL advisory
  # lock and delegates file execution to scripts/migrate.sh (mysql CLI).
  echo "Applying pending migrations via canonical runner..."
  node /app/scripts/migrate.js
  echo "Migrations complete."

  # Sync role permissions from the canonical templates on every startup.
  # Add-only (no --prune): grants missing assignments and never revokes an
  # existing one, so a restart cannot strip permissions from a live role.
  # The deployment environment declares its target explicitly; the sync script
  # fails closed without all three confirmation flags.
  echo "Syncing role permissions from templates..."
  DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" \
    node /app/scripts/sync-role-permissions.mjs \
      --confirm-host="$DB_HOST" --confirm-port="$DB_PORT" --confirm-db="$DB_NAME" \
    || {
      _sync_exit=$?
      case "$_sync_exit" in
        2)
          echo "  ERROR: Permission sync refused the target confirmation (exit 2) — startup continues; permissions may be stale" >&2
          ;;
        *)
          echo "  ERROR: Permission sync failed (exit $_sync_exit) — startup continues; permissions may be stale" >&2
          ;;
      esac
    }
fi

echo "Starting backend as appuser..."
exec su-exec appuser:appgroup "$@"
