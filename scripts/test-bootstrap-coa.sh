#!/usr/bin/env bash
# Test-only bootstrap for migration-created global COA reference data.
#
# Applies ONLY the data-only, idempotent COA + org-accounting RBAC migrations in
# dependency order:
#   099 -> 104 -> 118 -> 121 -> 155
# then reruns seed 005 (its INSERT ... SELECT mappings depend on accounts that
# those migrations create), then runs read-only COA + RBAC preflights.
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
# 104 is applied AFTER 099 because its Equity L2/L3 rows attach under the
# EQUITY L1 root that 099 creates (see 104_year_close.sql Part 1).
#
# 121 registers the org-scoped manual-journal permission keys and grants them by
# role slug (org-admin/accountant/...). The permission KEY is already shipped by
# seed 001_baseline.sql, but seed 001 carries NO role_permissions grant for it
# (the key postdates its grant snapshot), and no other seed/harness path grants
# it — so without 121 the org-admin grant is absent and the org-journal RBAC
# integration spec fails. 121 touches only permissions/role_permissions/roles/
# permission_modules (all populated by seed 001), so it has no COA dependency and
# is safe anywhere in this ordered list.
for migration in \
  099_coa_hierarchy.sql \
  104_year_close.sql \
  118_l4_default_catalog.sql \
  121_org_manual_journal_permissions.sql \
  155_revenue_account_separation.sql
do
  migration_file="$MIGRATIONS_DIR/$migration"
  [ -f "$migration_file" ] || die "Missing migration file: $migration"
  printf 'Applying %s\n' "$migration"
  mysql_exec < "$migration_file" || die "Failed to apply $migration"
done

# --- Re-assert 099's intended L3 parents (test-harness reconciliation) -------
# Seed 004 (run earlier by the canonical seed step) pre-parents a subset of
# platform-global accounts directly under an L1 root: 1100/2100/2200 -> their
# class root and 4100 -> 4000. Migration 099 later re-parents the same codes,
# but its UPDATEs are guarded by "AND parent_id IS NULL", so on this bootstrap
# order they are silently skipped and those mapped posting accounts stay at
# Level 2 (non-postable) — e.g. "Account 6317 (4100) is at level 2". Migration
# 104 creates the Equity hierarchy but does not touch these codes.
#
# Seed 004 also leaves five LEGACY child accounts attached to the mapped posting
# accounts: 1101/1102/1103 under 1100, and 2101/2102 under 2100. Even after
# 1100/2100 are re-parented to L4, CoaLevelValidator rejects them because they
# "have children" (only leaf accounts are postable). Those legacy children are
# not part of the 099 hierarchy and are not referenced by any accounting
# concept, so they are moved to their existing L2 class roots
# (ASSETS-CURRENT / LIABILITIES-CURRENT) as structural rows. This keeps 1100 and
# 2100 as leaf posting nodes without inventing codes or making semantic claims.
#
# This idempotent re-parent restores exactly the hierarchy 099 intends (it is a
# no-op once correct, and never touches organisation-owned rows). Since 004 is
# a canonical seed, fixing the order here keeps the change test-harness-only:
# no migration, seed, or production accounting behaviour is altered.
RECONCILE_SQL="$(cat <<'SQL'
UPDATE chart_of_accounts c
JOIN chart_of_accounts p
  ON p.organisation_id IS NULL
 AND p.code = CASE c.code
   WHEN '1100' THEN 'ASSETS-CLEARING'
   WHEN '2100' THEN 'LIABILITIES-WALLET'
   WHEN '2200' THEN 'LIABILITIES-PAYABLES'
   WHEN '4100' THEN 'REVENUE-COURT'
   -- Seed-004 legacy children: detach from the mapped posting accounts so
   -- 1100/2100 remain postable leaves (existing L2 class roots only).
   WHEN '1101' THEN 'ASSETS-CURRENT'
   WHEN '1102' THEN 'ASSETS-CURRENT'
   WHEN '1103' THEN 'ASSETS-CURRENT'
   WHEN '2101' THEN 'LIABILITIES-CURRENT'
   WHEN '2102' THEN 'LIABILITIES-CURRENT'
 END
SET c.parent_id = p.id
WHERE c.organisation_id IS NULL
  AND c.code IN ('1100', '2100', '2200', '4100',
                 '1101', '1102', '1103', '2101', '2102')
  AND (c.parent_id IS NULL OR c.parent_id <> p.id);
SQL
)"
printf 'Re-asserting 099 hierarchy and detaching seed-004 legacy child accounts\n'
mysql_exec -e "$RECONCILE_SQL" || die "Failed to reconcile seed-004/099 parent conflict"

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

# --- Read-only RBAC preflight ------------------------------------------------
# Migration 121 grants org.accounting.journal.create. The org-journal RBAC
# integration spec asserts the org-admin role holds it; migration 121 resolves
# roles by SLUG so both org-admin rows (global + org-scoped) are covered. This
# preflight fails closed if the grant is ever missing again.
RBAC_PREFLIGHT_SQL="$(cat <<'SQL'
SELECT r.slug
FROM roles r
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant')
  AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = r.id
      AND p.permission_key = 'org.accounting.journal.create'
  )
ORDER BY r.slug;
SQL
)"

if ! rbac_missing="$(mysql_exec -e "$RBAC_PREFLIGHT_SQL" 2>/dev/null)"; then
  die "Org accounting RBAC preflight failed (database connection or query failed)"
fi
if [ -n "$rbac_missing" ]; then
  printf 'Missing org.accounting.journal.create grant for roles:\n%s\n' "$rbac_missing" >&2
  exit 1
fi

printf 'Global COA bootstrap complete; all required global accounts are present.\n'
