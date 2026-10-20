#!/usr/bin/env bash
# Test-only bootstrap for migration-created global COA reference data.
#
# Applies ONLY the data-only, idempotent COA migrations in dependency order:
#   099 -> 118 -> 155
# then reruns seed 005 (its INSERT ... SELECT mappings depend on accounts that
# those migrations create), then runs a read-only COA preflight.
#
# This is NOT the historical migration chain and must never be used on
# production. It is guarded to test environments and loopback databases.

set -euo pipefail

# Never let caller-enabled xtrace echo MYSQL_PWD/DB_PASSWORD values.
set +x

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
SEED_SCRIPT="$PROJECT_ROOT/backend/scripts/seed.js"

MYSQL_BIN="${MYSQL_BIN:-mysql}"
NODE_BIN="${NODE_BIN:-node}"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# --- Test-only safety gates -------------------------------------------------
if [ "${NODE_ENV:-}" != "test" ] && [ "${INTEGRATION_TEST:-}" != "1" ]; then
  die "Refusing to run: set NODE_ENV=test or INTEGRATION_TEST=1"
fi

for var in DB_HOST DB_PORT DB_USER DB_NAME; do
  if [ -z "${!var:-}" ]; then
    die "Missing required environment variable: $var"
  fi
done
if [ -z "${DB_PASSWORD+x}" ]; then
  die "Missing required environment variable: DB_PASSWORD"
fi

case "$DB_HOST" in
  127.0.0.1|localhost|::1) ;;
  *) die "Refusing non-loopback DB_HOST: $DB_HOST" ;;
esac

case "$DB_PORT" in
  ''|*[!0-9]*) die "DB_PORT must be numeric" ;;
esac

command -v "$MYSQL_BIN" >/dev/null 2>&1 || die "MySQL client not found: $MYSQL_BIN"
command -v "$NODE_BIN" >/dev/null 2>&1 || die "Node executable not found: $NODE_BIN"

# Credentials travel via MYSQL_PWD for a single command invocation; they are
# never placed in argv or printed by this script.
mysql_exec() {
  MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --database="$DB_NAME" \
    --batch \
    --skip-column-names \
    "$@"
}

# --- Preconditions: canonical seeds 004/005 must already be present ----------
BASE_SQL="SELECT expected.code
FROM (
  SELECT '1100' AS code
  UNION ALL SELECT '1120'
  UNION ALL SELECT '4100'
) expected
LEFT JOIN chart_of_accounts c
  ON c.organisation_id IS NULL
 AND c.code = expected.code
 AND c.is_active = 1
WHERE c.id IS NULL
ORDER BY expected.code;"

if ! base_missing="$(mysql_exec -e "$BASE_SQL" 2>/dev/null)"; then
  die "Unable to verify base accounting seeds (database connection or query failed)"
fi
if [ -n "$base_missing" ]; then
  printf 'Base accounting seeds are not applied; missing account codes:\n%s\n' "$base_missing" >&2
  exit 1
fi

# --- Data-only COA migrations, in dependency order --------------------------
for migration in \
  099_coa_hierarchy.sql \
  118_l4_default_catalog.sql \
  155_revenue_account_separation.sql
do
  migration_file="$MIGRATIONS_DIR/$migration"
  [ -f "$migration_file" ] || die "Missing migration file: $migration"
  printf 'Applying %s\n' "$migration"
  mysql_exec < "$migration_file" || die "Failed to apply $migration"
done

# 005 ran before 118/155 in the normal seed step. Its INSERT ... SELECT rows
# for 2202/4160/1161/4191 were silently skipped; rerun it now that they exist.
# Pass the password through MYSQL_PWD and blank DB_PASSWORD for this child so
# the canonical seed runner does not put "-p<password>" in its mysql argv.
printf 'Rerunning seed 005_accounting_defaults.sql\n'
MYSQL_PWD="$DB_PASSWORD" DB_PASSWORD="" \
  "$NODE_BIN" "$SEED_SCRIPT" --seed-file 005_accounting_defaults.sql \
  || die "Failed to rerun seed 005_accounting_defaults.sql"

# --- Read-only global COA preflight -----------------------------------------
PREFLIGHT_SQL="$(cat <<'SQL'
SELECT expected.code
FROM (
  SELECT '1100' AS code
  UNION ALL SELECT '1120'
  UNION ALL SELECT '1161'
  UNION ALL SELECT '2100'
  UNION ALL SELECT '2202'
  UNION ALL SELECT '2300'
  UNION ALL SELECT '4100'
  UNION ALL SELECT '4110'
  UNION ALL SELECT '4140'
  UNION ALL SELECT '4160'
  UNION ALL SELECT '4170'
  UNION ALL SELECT '4191'
  UNION ALL SELECT '4192'
  UNION ALL SELECT '4193'
  UNION ALL SELECT '5210'
  UNION ALL SELECT 'ASSETS-CASH'
  UNION ALL SELECT 'ASSETS-CLEARING'
  UNION ALL SELECT 'ASSETS-RECEIVABLES'
  UNION ALL SELECT 'LIABILITIES-PAYABLES'
  UNION ALL SELECT 'LIABILITIES-TAX'
  UNION ALL SELECT 'REVENUE-COURT'
  UNION ALL SELECT 'REVENUE-CONTRA'
  UNION ALL SELECT 'EXPENSES-GENERAL'
) expected
LEFT JOIN chart_of_accounts c
  ON c.organisation_id IS NULL
 AND c.code = expected.code
 AND c.is_active = 1
WHERE c.id IS NULL
ORDER BY expected.code;
SQL
)"

if ! missing="$(mysql_exec -e "$PREFLIGHT_SQL" 2>/dev/null)"; then
  die "Global COA preflight failed (database connection or query failed)"
fi
if [ -n "$missing" ]; then
  printf 'Missing global COA account codes:\n%s\n' "$missing" >&2
  exit 1
fi

printf 'Global COA bootstrap complete; all required global accounts are present.\n'
