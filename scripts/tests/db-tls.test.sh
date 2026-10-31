#!/usr/bin/env bash
# ============================================================================
# CourtZon — database TLS policy (shell/CLI) tests.  NO DATABASE, NO NETWORK.
#
# Sources the REAL backend/scripts/db-tls.sh and asserts the mode table that
# scripts/migrate.sh and backend/docker-entrypoint.sh consume. The Node half of
# the same policy is covered by
# backend/src/database/__tests__/db-tls.spec.ts.
# ============================================================================
set -u

ROOT="${COURTZON_PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
ROOT="${ROOT//\\//}"
LIB="$ROOT/backend/scripts/db-tls.sh"

if [ ! -f "$LIB" ]; then
  echo "FATAL: policy library not found at $LIB" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/cz-dbtls.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# shellcheck source=../../backend/scripts/db-tls.sh
. "$LIB"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL  %s — %s\n' "$1" "$2"; }

ERRFILE="$TMP/stderr"
RESOLVE_CODE=0
resolve_into_globals() {
  if db_tls_resolve 2>"$ERRFILE"; then
    RESOLVE_CODE=0
  else
    RESOLVE_CODE=$?
  fi
  ERR_TEXT="$(cat "$ERRFILE" 2>/dev/null || true)"
}

reset_env() {
  unset DB_TLS_MODE DB_TLS_CA_PATH COURTZON_MIGRATION_ENV NODE_ENV DB_PASSWORD MYSQL_ROOT_PASSWORD
}

assert_equals() { # label expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected [$2], got [$3]"; fi
}
assert_contains() { # label needle haystack
  case "$3" in
    *"$2"*) ok "$1" ;;
    *) bad "$1" "expected to contain [$2], got [$3]" ;;
  esac
}
assert_not_contains() { # label needle haystack
  case "$3" in
    *"$2"*) bad "$1" "must NOT contain [$2], got [$3]" ;;
    *) ok "$1" ;;
  esac
}
assert_fails() { # label
  if [ "$RESOLVE_CODE" -ne 0 ]; then ok "$1"; else bad "$1" "expected a non-zero exit, got 0"; fi
}
assert_succeeds() { # label
  if [ "$RESOLVE_CODE" -eq 0 ]; then ok "$1"; else bad "$1" "expected exit 0, got $RESOLVE_CODE ($ERR_TEXT)"; fi
}

# ── 1. local default ─────────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
resolve_into_globals
assert_succeeds "TEST 1: local + unset DB_TLS_MODE resolves"
assert_equals "TEST 1b: local default is disable" "disable" "$DB_TLS_MODE_RESOLVED"
assert_equals "TEST 1c: disable maps to --skip-ssl" "--skip-ssl" "$DB_TLS_CLI_ARGS"
assert_equals "TEST 1d: no warnings for the local default" "" "$DB_TLS_WARNINGS"

# ── 2. NODE_ENV fallback when the migration env is unset ─────────────────────
reset_env
export NODE_ENV=development
resolve_into_globals
assert_succeeds "TEST 2: NODE_ENV=development + unset mode resolves"
assert_equals "TEST 2b: NODE_ENV fallback default is disable" "disable" "$DB_TLS_MODE_RESOLVED"

# ── 3. non-local must not silently default to disable ────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export NODE_ENV=production
resolve_into_globals
assert_fails "TEST 3: non-local + unset mode fails fast"
assert_contains "TEST 3b: error names DB_TLS_MODE" "DB_TLS_MODE is not set" "$ERR_TEXT"
assert_equals "TEST 3c: no CLI args leaked on failure" "" "$DB_TLS_CLI_ARGS"

# ── 4. explicit disable ──────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=disable
resolve_into_globals
assert_succeeds "TEST 4: explicit disable resolves"
assert_equals "TEST 4b: explicit disable maps to --skip-ssl" "--skip-ssl" "$DB_TLS_CLI_ARGS"

# ── 5. explicit disable outside local warns but resolves ─────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=disable
resolve_into_globals
assert_succeeds "TEST 5: explicit disable outside local still resolves"
assert_contains "TEST 5b: explicit disable outside local warns" "NOT encrypted" "$DB_TLS_WARNINGS"

# ── 6. require ───────────────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=require
resolve_into_globals
assert_succeeds "TEST 6: require resolves"
assert_equals "TEST 6b: require requests TLS without identity verification" \
  "--ssl --skip-ssl-verify-server-cert" "$DB_TLS_CLI_ARGS"
assert_equals "TEST 6c: require has no warnings (secure mode)" "" "$DB_TLS_WARNINGS"

# ── 7. verify-ca with a CA file ──────────────────────────────────────────────
CA="$TMP/ca.pem"
printf '%s\n' "-----BEGIN CERTIFICATE-----" "MIIBtest" "-----END CERTIFICATE-----" > "$CA"
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$CA"
resolve_into_globals
assert_succeeds "TEST 7: verify-ca with a readable PEM resolves"
assert_contains "TEST 7b: verify-ca passes the CA to the client" "--ssl-ca=$CA" "$DB_TLS_CLI_ARGS"
assert_contains "TEST 7c: verify-ca enables certificate verification" "--ssl-verify-server-cert" "$DB_TLS_CLI_ARGS"
assert_not_contains "TEST 7d: verify-ca does not disable verification" "--skip-ssl-verify-server-cert" "$DB_TLS_CLI_ARGS"

# ── 8. verify-ca without DB_TLS_CA_PATH ──────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
resolve_into_globals
assert_fails "TEST 8: verify-ca without DB_TLS_CA_PATH fails fast"
assert_contains "TEST 8b: error names DB_TLS_CA_PATH" "DB_TLS_CA_PATH" "$ERR_TEXT"

# ── 9. verify-ca with a nonexistent CA ───────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$TMP/does-not-exist.pem"
resolve_into_globals
assert_fails "TEST 9: verify-ca with a missing CA file fails fast"
assert_contains "TEST 9b: error reports the missing path" "does not exist" "$ERR_TEXT"

# ── 10. verify-ca with a non-PEM file ────────────────────────────────────────
JUNK="$TMP/junk.pem"
printf 'this is not a certificate\n' > "$JUNK"
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$JUNK"
resolve_into_globals
assert_fails "TEST 10: verify-ca with a non-PEM file fails fast"
assert_contains "TEST 10b: error reports the invalid PEM" "not a PEM certificate" "$ERR_TEXT"

# ── 11. verify-ca with an empty file ─────────────────────────────────────────
EMPTY="$TMP/empty.pem"
: > "$EMPTY"
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$EMPTY"
resolve_into_globals
assert_fails "TEST 11: verify-ca with an empty CA fails fast"

# ── 12. unknown mode ─────────────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=preferred
resolve_into_globals
assert_fails "TEST 12: unknown mode fails fast"
assert_contains "TEST 12b: error lists the supported modes" "disable require verify-ca" "$ERR_TEXT"

# ── 13. case/whitespace normalisation ────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=" REQUIRE "
resolve_into_globals
assert_succeeds "TEST 13: uppercase/whitespace mode resolves"
assert_equals "TEST 13b: mode is normalised" "require" "$DB_TLS_MODE_RESOLVED"

# ── 14. secrets never appear in policy output ────────────────────────────────
SECRET='sup3r-secret-password-value'
reset_env
export COURTZON_MIGRATION_ENV=production
export DB_PASSWORD="$SECRET"
export MYSQL_ROOT_PASSWORD="$SECRET"
export DB_TLS_MODE=nonsense
resolve_into_globals
assert_fails "TEST 14: invalid mode fails with the secret present in env"
assert_not_contains "TEST 14b: invalid-mode error never leaks the password" "$SECRET" "$ERR_TEXT"
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$TMP/does-not-exist.pem"
resolve_into_globals
assert_fails "TEST 14c: missing CA fails with the secret present in env"
assert_not_contains "TEST 14d: CA error never leaks the password" "$SECRET" "$ERR_TEXT"

# ── 15. log-safe description ─────────────────────────────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE=disable
resolve_into_globals
assert_contains "TEST 15: describe() is log-safe for disable" "disable (plaintext)" "$(db_tls_describe)"

export DB_TLS_MODE=require
resolve_into_globals
assert_contains "TEST 15b: describe() states require does not verify" "not verified" "$(db_tls_describe)"

export DB_TLS_MODE=verify-ca
export DB_TLS_CA_PATH="$CA"
resolve_into_globals
assert_contains "TEST 15c: describe() reports the verified CA path" "$CA" "$(db_tls_describe)"

# ── 16. UNKNOWN environment (both signals unset) ─────────────────────────────
reset_env
resolve_into_globals
assert_fails "TEST 16: unknown environment + unset DB_TLS_MODE fails closed"
assert_contains "TEST 16b: error explains the unknown environment" "cannot be classified" "$ERR_TEXT"
assert_contains "TEST 16c: error refuses to infer local plaintext" "Refusing to infer local plaintext" "$ERR_TEXT"
assert_equals "TEST 16d: environment is reported as unknown" "unknown" "$DB_TLS_ENVIRONMENT"

# ── 17. UNKNOWN environment + explicit valid mode is accepted ────────────────
reset_env
export DB_TLS_MODE=require
resolve_into_globals
assert_succeeds "TEST 17: unknown environment + explicit require is accepted"
assert_equals "TEST 17b: mode resolves" "require" "$DB_TLS_MODE_RESOLVED"
assert_equals "TEST 17c: environment stays unknown" "unknown" "$DB_TLS_ENVIRONMENT"

# ── 18. UNKNOWN environment + explicit disable warns distinctly ──────────────
reset_env
export DB_TLS_MODE=disable
resolve_into_globals
assert_succeeds "TEST 18: unknown environment + explicit disable is accepted"
assert_contains "TEST 18b: unknown disable warns about the unclassified environment" "cannot be classified" "$DB_TLS_WARNINGS"
assert_contains "TEST 18c: unknown disable warning still states plaintext" "NOT encrypted" "$DB_TLS_WARNINGS"

# ── 19. leading/trailing whitespace in DB_TLS_MODE ───────────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE="  disAble  "
resolve_into_globals
assert_succeeds "TEST 19: padded DB_TLS_MODE resolves"
assert_equals "TEST 19b: padded mode normalises to disable" "disable" "$DB_TLS_MODE_RESOLVED"

# ── 20. internal whitespace is rejected (not stripped) ───────────────────────
reset_env
export COURTZON_MIGRATION_ENV=local
export DB_TLS_MODE="dis able"
resolve_into_globals
assert_fails "TEST 20: internal whitespace in DB_TLS_MODE fails fast"
assert_contains "TEST 20b: error quotes the unmodified invalid value" "invalid DB_TLS_MODE 'dis able'" "$ERR_TEXT"

# ── 21. padded environment signal still classifies as local ──────────────────
reset_env
export COURTZON_MIGRATION_ENV="  LOCAL  "
resolve_into_globals
assert_succeeds "TEST 21: padded COURTZON_MIGRATION_ENV resolves"
assert_equals "TEST 21b: padded signal classifies as local" "local" "$DB_TLS_ENVIRONMENT"
assert_equals "TEST 21c: local default is still disable" "disable" "$DB_TLS_MODE_RESOLVED"

# ── 22. padded NODE_ENV=production is non-local ──────────────────────────────
reset_env
export NODE_ENV="  PRODUCTION  "
resolve_into_globals
assert_fails "TEST 22: padded NODE_ENV=production + unset mode fails closed"
assert_equals "TEST 22b: padded NODE_ENV classifies as non-local" "non-local" "$DB_TLS_ENVIRONMENT"

# ── 23. environment classification table ─────────────────────────────────────
reset_env
assert_equals "TEST 23a: no signals -> unknown" "unknown" "$(db_tls_environment)"
export COURTZON_MIGRATION_ENV=local
assert_equals "TEST 23b: migration env local -> local" "local" "$(db_tls_environment)"
export COURTZON_MIGRATION_ENV=production
assert_equals "TEST 23c: migration env production -> non-local" "non-local" "$(db_tls_environment)"
reset_env
export NODE_ENV=test
assert_equals "TEST 23d: NODE_ENV=test -> local" "local" "$(db_tls_environment)"
export NODE_ENV=production
assert_equals "TEST 23e: NODE_ENV=production -> non-local" "non-local" "$(db_tls_environment)"

# ── summary ──────────────────────────────────────────────────────────────────
echo
echo "PASSED: $PASS   FAILED: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo "DB TLS POLICY TESTS FAILED" >&2
  exit 1
fi
echo "ALL DB TLS POLICY TESTS PASSED"
