#!/bin/sh
set -e

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
_MYSQL="/usr/bin/mariadb -h $DB_HOST -P $DB_PORT -u $DB_USER -p$_PASS --skip-ssl"
_TABLE_COUNT=$($_MYSQL -N -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME'" 2>/dev/null)
if [ -z "$_TABLE_COUNT" ] || [ "$_TABLE_COUNT" = "0" ]; then
  echo "Database is empty — importing baseline schema..."
  $_MYSQL "$DB_NAME" < /app/database/baseline/001_courtzon_v3.sql
  echo "Baseline schema imported."

  echo "Importing seed data..."
  $_MYSQL "$DB_NAME" < /app/database/seeds/001_baseline.sql
  echo "Seed data imported."
else
  echo "Database has $_TABLE_COUNT tables — skipping baseline re-import."

  echo "Applying pending migrations..."
  if [ -d /app/database/migrations ]; then
    # Ensure migration_history table exists (may be missing on older DBs)
    $_MYSQL "$DB_NAME" -e \
      "CREATE TABLE IF NOT EXISTS migration_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        hash VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_ms INT DEFAULT 0
      )" 2>/dev/null || true

    for f in /app/database/migrations/*.sql; do
      if [ -f "$f" ]; then
        fname=$(basename "$f")
        applied=$($_MYSQL "$DB_NAME" -N -e \
          "SELECT COUNT(*) FROM migration_history WHERE filename='$fname'" 2>/dev/null || echo "0")
        if [ "$applied" = "0" ]; then
          echo "  Applying: $fname"
          set +e
          _MIG_OUT=$($_MYSQL "$DB_NAME" < "$f" 2>&1)
          _MIG_EXIT=$?
          set -e
          if [ $_MIG_EXIT -ne 0 ]; then
            if echo "$_MIG_OUT" | grep -qi "duplicate column\|already exists\|duplicate key\|duplicate entry"; then
              echo "  OK: $fname (already applied, non-fatal)"
            else
              echo "  WARNING: $fname had errors (exit $_MIG_EXIT) — marking as applied anyway"
              echo "  $_MIG_OUT" | head -3
            fi
          else
            echo "  OK: $fname"
          fi
          $_MYSQL "$DB_NAME" -e \
            "INSERT IGNORE INTO migration_history (filename, hash) VALUES ('$fname', SHA2('$fname', 256))" 2>/dev/null || true
        else
          echo "  Already applied: $fname"
        fi
      fi
    done
  fi
  echo "Migrations complete."
fi

echo "Starting backend as appuser..."
exec su-exec appuser:appgroup "$@"
