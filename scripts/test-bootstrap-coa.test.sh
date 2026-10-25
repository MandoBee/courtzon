#!/usr/bin/env bash
# Focused regression checks for the test-only COA bootstrap:
#   1. it disables xtrace before any database password is read, assigned, or used;
#   2. it applies the COA + org-accounting RBAC migrations in the intended order;
#   3. it re-asserts 099's intended L3 parents for seed-004 pre-parented accounts;
#   4. it grants org.accounting.journal.create (migration 121) and preflights it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/test-bootstrap-coa.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

[ -f "$SCRIPT" ] || fail "missing $SCRIPT"

set_euo="$(grep -nE '^set -euo pipefail$' "$SCRIPT" | head -n 1 | cut -d: -f1 || true)"
set_plus_x="$(grep -nE '^set \+x$' "$SCRIPT" | head -n 1 | cut -d: -f1 || true)"
# Ignore comments that mention credential variable names; only executable
# references matter for the ordering check.
first_credential="$(grep -nE 'MYSQL_PWD|DB_PASSWORD' "$SCRIPT" \
  | grep -vE '^[0-9]+:[[:space:]]*#' \
  | head -n 1 | cut -d: -f1 || true)"

[ -n "$set_euo" ] || fail 'set -euo pipefail missing'
[ -n "$set_plus_x" ] || fail 'set +x missing'
[ -n "$first_credential" ] || fail 'no credential handling found'
[ "$set_plus_x" -lt "$first_credential" ] \
  || fail "set +x (line $set_plus_x) must precede first credential reference (line $first_credential)"
if grep -qE '^set -x$' "$SCRIPT"; then
  fail 'script enables xtrace'
fi

# Dynamic check with a dummy credential and non-database binaries. The script
# must fail at its base-seed precondition before applying migrations/seed 005.
probe='xtrace-probe-do-not-log'
set +e
output="$(NODE_ENV=test INTEGRATION_TEST=1 \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root \
  DB_PASSWORD="$probe" DB_NAME=xtrace_probe \
  MYSQL_BIN=false NODE_BIN=false \
  bash -x "$SCRIPT" 2>&1)"
status=$?
set -e

[ "$status" -ne 0 ] || fail 'script unexpectedly succeeded with MYSQL_BIN=false'
case "$output" in
  *"$probe"*) fail 'xtrace exposed the probe credential' ;;
esac
case "$output" in
  *'Applying 099_coa_hierarchy.sql'*|*'Rerunning seed 005_accounting_defaults.sql'*)
    fail 'script reached migration/seed steps' ;;
esac

printf 'PASS: set +x (line %s) precedes first credential reference (line %s)\n' \
  "$set_plus_x" "$first_credential"
printf 'PASS: bash -x with dummy password did not expose the probe\n'

# ── COA bootstrap ordering regression (Groups A + B1) ────────────────────────
# 104 must run, and it must run after 099 (its Equity L2/L3 attach to the EQUITY
# root created by 099). 118/155 retain their existing relative order.
migration_block="$(awk '/^for migration in/,/^do$/' "$SCRIPT")"
[ -n "$migration_block" ] || fail 'migration apply loop not found'

expect_order="$(
  printf '%s\n' "$migration_block" \
    | sed -E 's/^\s+//; s/[[:space:]]*\\$//' \
    | grep -E '^[0-9]{3}_.*\.sql$'
)"
expected="099_coa_hierarchy.sql
104_year_close.sql
118_l4_default_catalog.sql
121_org_manual_journal_permissions.sql
155_revenue_account_separation.sql"
[ "$expect_order" = "$expected" ] \
  || fail "unexpected migration order in bootstrap:
--- expected ---
$expected
--- actual ---
$expect_order"

# Seed 004 pre-parents 1100/2100/2200/4100 under L1; 099's guarded UPDATEs are
# then skipped. The bootstrap must re-assert 099's intended L3 parents for those
# exact codes, org-global scoped, and never touch organisation-owned rows.
grep -q "RECONCILE_SQL=" "$SCRIPT" || fail 'RECONCILE_SQL block missing'
grep -qE "WHEN '1100' THEN 'ASSETS-CLEARING'" "$SCRIPT" || fail 'reconcile: 1100->ASSETS-CLEARING missing'
grep -qE "WHEN '2100' THEN 'LIABILITIES-WALLET'" "$SCRIPT" || fail 'reconcile: 2100->LIABILITIES-WALLET missing'
grep -qE "WHEN '2200' THEN 'LIABILITIES-PAYABLES'" "$SCRIPT" || fail 'reconcile: 2200->LIABILITIES-PAYABLES missing'
grep -qE "WHEN '4100' THEN 'REVENUE-COURT'" "$SCRIPT" || fail 'reconcile: 4100->REVENUE-COURT missing'
grep -qE "c\.organisation_id IS NULL" "$SCRIPT" || fail 'reconcile not scoped to org-global rows'
grep -qE "c\.parent_id <> p\.id" "$SCRIPT" || fail 'reconcile not idempotent'

# Reconcile must sit after the migration loop and before seed 005 is re-run.
loop_line="$(grep -nE '^for migration in' "$SCRIPT" | head -n 1 | cut -d: -f1)"
reconcile_line="$(grep -nE '^mysql_exec -e "\$RECONCILE_SQL"' "$SCRIPT" | head -n 1 | cut -d: -f1 || true)"
seed005_line="$(grep -nE 'Rerunning seed 005_accounting_defaults\.sql' "$SCRIPT" | head -n 1 | cut -d: -f1)"
[ -n "$reconcile_line" ] || fail 'reconcile invocation not found'
[ "$loop_line" -lt "$reconcile_line" ] || fail "reconcile (line $reconcile_line) must follow migration loop (line $loop_line)"
[ "$reconcile_line" -lt "$seed005_line" ] || fail "reconcile (line $reconcile_line) must precede seed 005 rerun (line $seed005_line)"

printf 'PASS: bootstrap migration order is 099 -> 104 -> 118 -> 121 -> 155\n'
printf 'PASS: seed-004/099 parent reconciliation present, scoped, and idempotent\n'

# ── B2: org.accounting.journal.create grant regression ───────────────────────
# Seed 001 ships the permission KEY but NO role_permissions grant, and no other
# harness/seed path grants it — migration 121 is the sole grant source. It must
# be applied, and a fail-closed RBAC preflight must verify the grant.
printf '%s\n' "$migration_block" | grep -q '121_org_manual_journal_permissions\.sql' \
  || fail 'migration 121 not applied by bootstrap'
grep -q "RBAC_PREFLIGHT_SQL=" "$SCRIPT" || fail 'RBAC preflight block missing'
grep -qE "org\.accounting\.journal\.create" "$SCRIPT" || fail 'RBAC preflight does not check org.accounting.journal.create'
grep -qE "r\.slug IN \('super_admin', 'org-admin', 'accountant'\)" "$SCRIPT" \
  || fail 'RBAC preflight does not scope to expected roles'
grep -qE 'rbac_missing' "$SCRIPT" || fail 'RBAC preflight does not fail closed'

rbac_line="$(grep -nE '^if ! rbac_missing=' "$SCRIPT" | head -n 1 | cut -d: -f1 || true)"
[ -n "$rbac_line" ] || fail 'RBAC preflight enforcement missing'
[ "$seed005_line" -lt "$rbac_line" ] || fail 'RBAC preflight must run after seed 005 rerun'

printf 'PASS: migration 121 applied and org-admin journal-create grant verified\n'
