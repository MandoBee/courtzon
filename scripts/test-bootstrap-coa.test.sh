#!/usr/bin/env bash
# Focused regression check: test-bootstrap-coa.sh must disable xtrace before
# any database password is read, assigned, or used.
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
