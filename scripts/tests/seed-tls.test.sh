#!/usr/bin/env bash
# ============================================================================
# CourtZon — seed engine database TLS integration tests.  NO DATABASE.
#
# Copies the REAL scripts/seed.sh and backend/scripts/db-tls.sh into a temporary
# project tree and sources seed.sh (its main() is guarded), so the generated
# MYSQL_OPTS can be asserted without connecting to MySQL or running a seed.
# ============================================================================
set -u

ROOT="${COURTZON_PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
ROOT="${ROOT//\\//}"
REAL_SEED="$ROOT/scripts/seed.sh"
REAL_LIB="$ROOT/backend/scripts/db-tls.sh"

for f in "$REAL_SEED" "$REAL_LIB"; do
  if [ ! -f "$f" ]; then
    echo "FATAL: required file not found: $f" >&2
    exit 1
  fi
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/cz-seedtls.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Repo layout: <root>/scripts/seed.sh + <root>/backend/scripts/db-tls.sh
REPO_TREE="$TMP/repo"
mkdir -p "$REPO_TREE/scripts" "$REPO_TREE/backend/scripts" "$REPO_TREE/database/seeds"
cp "$REAL_SEED" "$REPO_TREE/scripts/seed.sh"
cp "$REAL_LIB" "$REPO_TREE/backend/scripts/db-tls.sh"

# Container layout: /app/scripts/seed.sh + /app/scripts/db-tls.sh (no backend/)
CONTAINER_TREE="$TMP/app"
mkdir -p "$CONTAINER_TREE/scripts" "$CONTAINER_TREE/database/seeds"
cp "$REAL_SEED" "$CONTAINER_TREE/scripts/seed.sh"
cp "$REAL_LIB" "$CONTAINER_TREE/scripts/db-tls.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL  %s — %s\n' "$1" "$2"; }

ERRFILE="$TMP/stderr"
SOURCE_CODE=0
SOURCE_OUT=""
SOURCE_TAIL=""

# Source the seed engine in a subshell: top-level policy resolution runs, main()
# does not. Captures MYSQL_OPTS via a marker appended after sourcing.
source_seed() { # tree
  : > "$ERRFILE"
  SOURCE_OUT="$(
    (
      . "$1/scripts/seed.sh" >/dev/null 2>"$ERRFILE"
      printf 'MYSQL_OPTS:%s' "$MYSQL_OPTS"
    )
  )"
  SOURCE_CODE=$?
  case "$SOURCE_OUT" in
    MYSQL_OPTS:*) SOURCE_TAIL="${SOURCE_OUT#MYSQL_OPTS:}" ;;
    *) SOURCE_TAIL="" ;;
  esac
}

reset_env() {
  unset DB_TLS_MODE DB_TLS_CA_PATH COURTZON_MIGRATION_ENV NODE_ENV DB_PASSWORD MYSQL_ROOT_PASSWORD
  unset DB_HOST DB_PORT DB_USER DB_NAME
}

assert_equals() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected [$2], got [$3]"; fi
}
assert_contains() {
  case "$3" in
    *"$2"*) ok "$1" ;;
    *) bad "$1" "expected to contain [$2], got [$3]" ;;
  esac
}
assert_not_contains() {
  case "$3" in
    *"$2"*) bad "$1" "must NOT contain [$2], got [$3]" ;;
    *) ok "$1" ;;
  esac
}
assert_succeeds() {
  if [ "$SOURCE_CODE" -eq 0 ]; then ok "$1"; else bad "$1" "expected exit 0, got $SOURCE_CODE (stderr: $(cat "$ERRFILE" 2>/dev/null))"; fi
}
assert_fails() {
  if [ "$SOURCE_CODE" -ne 0 ]; then ok "$1"; else bad "$1" "expected a non-zero exit, got 0"; fi
}

CA="$TMP/ca.pem"
printf '%s\n' "-----BEGIN CERTIFICATE-----" "MIIBtest" "-----END CERTIFICATE-----" > "$CA"

# ── 1. local environment default (compatibility) ─────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
source_seed "$REPO_TREE"
assert_succeeds "TEST 1: local + unset DB_TLS_MODE sources"
assert_contains "TEST 1b: local default selects --skip-ssl" "--skip-ssl" "$SOURCE_TAIL"
assert_not_contains "TEST 1c: local default does not require TLS" "--ssl-verify-server-cert" "$SOURCE_TAIL"
assert_equals "TEST 1d: existing host/port/db arguments preserved" \
  "-h localhost -P 3307 -u root --skip-ssl" "$SOURCE_TAIL"

# ── 2. explicit disable ──────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=disable
source_seed "$REPO_TREE"
assert_succeeds "TEST 2: explicit disable sources"
assert_contains "TEST 2b: disable maps to --skip-ssl" "--skip-ssl" "$SOURCE_TAIL"

# ── 3. require ───────────────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=require
source_seed "$REPO_TREE"
assert_succeeds "TEST 3: require sources"
assert_contains "TEST 3b: require requests TLS" "--ssl" "$SOURCE_TAIL"
assert_contains "TEST 3c: require does not verify identity" "--skip-ssl-verify-server-cert" "$SOURCE_TAIL"
assert_not_contains "TEST 3d: require does not fall back to plaintext" "--skip-ssl " "$SOURCE_TAIL "

# ── 4. verify-ca ─────────────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$CA"
source_seed "$REPO_TREE"
assert_succeeds "TEST 4: verify-ca sources with a readable CA"
assert_contains "TEST 4b: verify-ca passes the CA file" "--ssl-ca=$CA" "$SOURCE_TAIL"
assert_contains "TEST 4c: verify-ca enables certificate verification" "--ssl-verify-server-cert" "$SOURCE_TAIL"
assert_not_contains "TEST 4d: verify-ca never disables verification" "--skip-ssl-verify-server-cert" "$SOURCE_TAIL"

# ── 5. invalid mode fails safely ─────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=preferred
source_seed "$REPO_TREE"
assert_fails "TEST 5: invalid mode aborts before any connection"
assert_contains "TEST 5b: error names the invalid mode" "invalid DB_TLS_MODE 'preferred'" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 6. verify-ca without CA fails safely ─────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
source_seed "$REPO_TREE"
assert_fails "TEST 6: verify-ca without DB_TLS_CA_PATH aborts"
assert_contains "TEST 6b: error names DB_TLS_CA_PATH" "DB_TLS_CA_PATH" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 7. UNKNOWN environment fails closed ──────────────────────────────────────
reset_env
source_seed "$REPO_TREE"
assert_fails "TEST 7: unknown environment + unset mode aborts"
assert_contains "TEST 7b: error explains the unknown environment" "cannot be classified" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 8. explicit disable outside local warns ──────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=disable
source_seed "$REPO_TREE"
assert_succeeds "TEST 8: explicit disable outside local still sources"
assert_contains "TEST 8b: explicit disable warns" "NOT encrypted" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 9. secrets never appear ──────────────────────────────────────────────────
SECRET='sup3r-secret-seed-password'
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_PASSWORD="$SECRET"
export MYSQL_ROOT_PASSWORD="$SECRET"
export DB_TLS_MODE=nonsense
source_seed "$REPO_TREE"
assert_fails "TEST 9: invalid mode aborts with a secret in env"
assert_not_contains "TEST 9b: error never leaks the password" "$SECRET" "$(cat "$ERRFILE" 2>/dev/null)"
reset_env
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$TMP/missing.pem"
source_seed "$REPO_TREE"
assert_fails "TEST 9c: missing CA aborts with a secret in env"
assert_not_contains "TEST 9d: CA error never leaks the password" "$SECRET" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 10. container layout (/app/scripts, no backend/) ─────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
source_seed "$CONTAINER_TREE"
assert_succeeds "TEST 10: container layout resolves the policy library"
assert_contains "TEST 10b: container layout still selects --skip-ssl" "--skip-ssl" "$SOURCE_TAIL"

reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$CA"
source_seed "$CONTAINER_TREE"
assert_succeeds "TEST 10c: container layout supports verify-ca"
assert_contains "TEST 10d: container layout passes the CA" "--ssl-ca=$CA" "$SOURCE_TAIL"

# ── 11. missing policy library fails closed ──────────────────────────────────
BROKEN_TREE="$TMP/broken"
mkdir -p "$BROKEN_TREE/scripts" "$BROKEN_TREE/database/seeds"
cp "$REAL_SEED" "$BROKEN_TREE/scripts/seed.sh"
reset_env
export COURTZON_MIGRATION_ENV=local
source_seed "$BROKEN_TREE"
assert_fails "TEST 11: missing policy library aborts"
assert_contains "TEST 11b: error explains the missing library" "policy library not found" "$(cat "$ERRFILE" 2>/dev/null)"

# ── 12. policy summary is printed for operators ──────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
POLICY_LINE="$(
  (
    . "$REPO_TREE/scripts/seed.sh" 2>/dev/null
  ) | head -n 1
)"
assert_equals "TEST 12: startup prints the resolved policy" \
  "Database TLS policy: disable (plaintext)" "$POLICY_LINE"

# ── summary ──────────────────────────────────────────────────────────────────
echo
echo "PASSED: $PASS   FAILED: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo "SEED TLS INTEGRATION TESTS FAILED" >&2
  exit 1
fi
echo "ALL SEED TLS INTEGRATION TESTS PASSED"
