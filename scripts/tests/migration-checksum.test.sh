#!/usr/bin/env bash
# ============================================================================
# CourtZon — migration checksum verification tests (NO DATABASE).
#
# Sources the REAL scripts/migrate.sh and exercises verify_applied_hashes and
# apply_migrations against a temporary project tree. The mysql command is
# stubbed by a shell function; no database is contacted and no project file is
# written.
# ============================================================================
set -u

ROOT="${COURTZON_PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
ROOT="${ROOT//\\//}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/cz-checksum.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/state"
MIGRATIONS_DIR="$TMP/database/migrations"
BASELINE_DIR="$TMP/database/baseline"
mkdir -p "$STATE/history" "$STATE/latest" "$MIGRATIONS_DIR" "$BASELINE_DIR" "$TMP/bin"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/mysql"
chmod +x "$TMP/bin/mysql"
export PATH="$TMP/bin:$PATH"
export COURTZON_MIGRATION_ENV=local

# Source the actual runner functions. The source guard prevents main().
# shellcheck disable=SC1090
source "$ROOT/scripts/migrate.sh"
set +e +u

MIGRATIONS_DIR="$TMP/database/migrations"
BASELINE_DIR="$TMP/database/baseline"
TRACKING_TABLE="migration_history"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

log() { printf '%s\n' "$*"; }

state_key() { printf '%s' "$1" | tr '/' '_'; }

reset_state() {
  rm -f "$MIGRATIONS_DIR"/*.sql "$BASELINE_DIR"/*.sql
  rm -rf "$STATE"
  mkdir -p "$STATE/history" "$STATE/latest"
  : > "$STATE/all_files"
  : > "$STATE/up_files"
  : > "$STATE/inserts"
  : > "$STATE/executed"
}

add_file() {
  printf '%s\n' "$2" > "$MIGRATIONS_DIR/$1"
}

add_up() {
  printf '%s\t%s\n' "$2" "$3" > "$STATE/history/$(state_key "$1")"
  printf '%s\n' "$1" >> "$STATE/all_files"
  printf '%s\n' "$1" >> "$STATE/up_files"
}

add_latest() {
  printf '%s\n' "$2" > "$STATE/latest/$(state_key "$1")"
}

# Stub mysql. Queries are answered from the temp state; INSERTs are captured;
# migration SQL read from stdin is never executed.
mysql() {
  local arg prev="" sql=""
  for arg in "$@"; do
    if [ "$prev" = "-e" ]; then sql="$arg"; fi
    prev="$arg"
  done
  if [ -z "$sql" ]; then
    cat >/dev/null
    [ -f "$STATE/fail_apply" ] && return 1
    return 0
  fi
  case "$sql" in
    *"INSERT INTO"*)
      printf '%s\n' "$sql" >> "$STATE/inserts"
      return 0
      ;;
    *"SELECT hash, hash_kind FROM"*)
      local fname key
      fname=$(printf '%s' "$sql" | sed -n "s/.*filename[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" | head -n1)
      key=$(state_key "$fname")
      [ -f "$STATE/history/$key" ] && cat "$STATE/history/$key"
      return 0
      ;;
    *"SELECT DISTINCT filename FROM"*)
      if printf '%s' "$sql" | grep -q "direction='up'"; then
        cat "$STATE/up_files"
      else
        cat "$STATE/all_files"
      fi
      return 0
      ;;
    *"SELECT direction FROM"*)
      local fname key
      fname=$(printf '%s' "$sql" | sed -n "s/.*filename[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" | head -n1)
      key=$(state_key "$fname")
      [ -f "$STATE/latest/$key" ] && cat "$STATE/latest/$key"
      return 0
      ;;
    *)
      return 0
      ;;
  esac
}

run_verify() { verify_applied_hashes 2>&1; }
sha_of() { sha256sum "$1" | awk '{print $1}'; }
text_sha() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }

assert_contains() {
  printf '%s\n' "$1" | grep -F -q -- "$2" || fail "expected to contain: $2\n--- output ---\n$1"
}
assert_not_contains() {
  if printf '%s\n' "$1" | grep -F -q -- "$2"; then fail "expected NOT to contain: $2\n--- output ---\n$1"; fi
}
assert_count() {
  local actual
  actual=$(printf '%s\n' "$1" | grep -F -c -- "$2" || true)
  [ "$actual" = "$3" ] || fail "expected $3 occurrences of '$2', got $actual\n--- output ---\n$1"
}

echo 'TEST 1: matching lowercase 64-char content hash'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql"); add_up 001_a.sql "$h" content_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'
assert_contains "$out" 'CONTENT_DRIFT=0'

echo 'TEST 2: matching uppercase 64-char content hash'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql"); upper=$(printf '%s' "$h" | tr 'a-f' 'A-F'); add_up 001_a.sql "$upper" content_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'

echo 'TEST 3: matching 12-char content prefix'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql"); add_up 001_a.sql "${h:0:12}" content_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'

echo 'TEST 4: genuine content mismatch'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(printf 'different' | sha256sum | awk '{print $1}')" content_sha256
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[CONTENT_DRIFT] 001_a.sql'

echo 'TEST 5: full legacy filename hash'
reset_state; add_file 001_a.sql 'SELECT 1;'; l=$(text_sha '001_a.sql'); add_up 001_a.sql "$l" legacy_filename_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[LEGACY_FORMAT_MISMATCH]'

echo 'TEST 6: 12-char legacy filename prefix'
reset_state; add_file 001_a.sql 'SELECT 1;'; l=$(text_sha '001_a.sql'); add_up 001_a.sql "${l:0:12}" legacy_filename_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[LEGACY_FORMAT_MISMATCH]'

echo 'TEST 7: placeholder values'
reset_state
add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql manual unknown
add_file 002_b.sql 'SELECT 2;'; add_up 002_b.sql GROUP2 unknown
add_file 091_c.sql 'SELECT 3;'; add_up 091_c.sql 091 unknown
out=$(run_verify)
assert_count "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH]' 3
assert_contains "$out" 'CONTENT_DRIFT=0'

echo 'TEST 7b: placeholder with legacy_filename_sha256 kind is unverifiable'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql manual legacy_filename_sha256
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH] 001_a.sql'

echo 'TEST 7c: unmatched hex legacy filename hash is a format mismatch'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(printf '0%.0s' {1..64})" legacy_filename_sha256
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[LEGACY_FORMAT_MISMATCH] 001_a.sql'

echo 'TEST 8: unknown full-length unmatched hash'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(printf '0%.0s' {1..64})" unknown
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH] 001_a.sql'

echo 'TEST 9: unknown 12-char unmatched hash'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql '000000000000' unknown
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH] 001_a.sql'

echo 'TEST 9b: unknown full-length hash matching content is verified'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql"); add_up 001_a.sql "$h" unknown
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH]'
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'

echo 'TEST 9c: unknown 12-char prefix matching content is verified'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql"); add_up 001_a.sql "${h:0:12}" unknown
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[UNVERIFIABLE_LEGACY_HASH]'
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'

echo 'TEST 10: attempt_started is not a content checksum'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql 'deadbeef' attempt_started
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT]'
assert_contains "$out" 'checked,'

echo 'TEST 11a: latest failed state stops apply_migrations'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_latest 001_a.sql failed
out=$( (apply_migrations) 2>&1 ); rc=$?
[ "$rc" -eq 1 ] || fail "expected exit 1 for failed state, got $rc"
assert_contains "$out" 'STOP 001_a.sql'
assert_not_contains "$out" 'OK 001_a.sql'

echo 'TEST 11b: latest down state stops apply_migrations'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_latest 001_a.sql down
out=$( (apply_migrations) 2>&1 ); rc=$?
[ "$rc" -eq 1 ] || fail "expected exit 1 for down state, got $rc"
assert_contains "$out" 'STOP 001_a.sql'

echo 'TEST 11c: already-applied migration is skipped'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(sha_of "$MIGRATIONS_DIR/001_a.sql")" content_sha256; add_latest 001_a.sql up
out=$( (apply_migrations) 2>&1 ); rc=$?
[ "$rc" -eq 0 ] || fail "expected exit 0 for applied state, got $rc"
assert_contains "$out" 'SKIP 001_a.sql (already applied)'
[ ! -s "$STATE/inserts" ] || fail 'skip path must not write migration_history'

echo 'TEST 12: orphan history row, deduplicated (103b)'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(sha_of "$MIGRATIONS_DIR/001_a.sql")" content_sha256
printf '103b_coa_cleanup.sql\n103b_coa_cleanup.sql\n' >> "$STATE/all_files"
out=$(run_verify)
assert_count "$out" 'CHECKSUM[ORPHAN_HISTORY_ROW] 103b_coa_cleanup.sql' 1

echo 'TEST 13a: trailing pending migration is not missing history'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(sha_of "$MIGRATIONS_DIR/001_a.sql")" content_sha256; add_file 002_b.sql 'SELECT 2;'
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[MISSING_HISTORY_ROW]'

echo 'TEST 13b: gap before an applied migration is missing history'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_file 002_b.sql 'SELECT 2;'; add_up 002_b.sql "$(sha_of "$MIGRATIONS_DIR/002_b.sql")" content_sha256
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[MISSING_HISTORY_ROW] 001_a.sql'

echo 'TEST 13c: failed/down history is not missing history'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_file 002_b.sql 'SELECT 2;'; add_latest 001_a.sql failed; printf '001_a.sql\n' >> "$STATE/all_files"; add_up 002_b.sql "$(sha_of "$MIGRATIONS_DIR/002_b.sql")" content_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[MISSING_HISTORY_ROW] 001_a.sql'

echo 'TEST 14a: baseline content hash matches'
reset_state; printf 'SELECT 1;\n' > "$BASELINE_DIR/001_courtzon_v3.sql"; add_up baseline/001_courtzon_v3.sql "$(sha_of "$BASELINE_DIR/001_courtzon_v3.sql")" content_sha256
out=$(run_verify)
assert_not_contains "$out" 'CHECKSUM[CONTENT_DRIFT] baseline/001_courtzon_v3.sql'

echo 'TEST 14b: baseline content mismatch is visible'
reset_state; printf 'SELECT 1;\n' > "$BASELINE_DIR/001_courtzon_v3.sql"; add_up baseline/001_courtzon_v3.sql "$(printf 'different' | sha256sum | awk '{print $1}')" content_sha256
out=$(run_verify)
assert_contains "$out" 'CHECKSUM[CONTENT_DRIFT] baseline/001_courtzon_v3.sql'

echo 'TEST 15: duplicate findings are suppressed'
reset_state; add_file 001_a.sql 'SELECT 1;'; add_up 001_a.sql "$(printf 'different' | sha256sum | awk '{print $1}')" content_sha256
out=$(run_verify)
assert_count "$out" 'CHECKSUM[CONTENT_DRIFT] 001_a.sql' 1

echo 'TEST 16: newly applied migration records full hash and content_sha256'
reset_state; add_file 001_a.sql 'SELECT 1;'; h=$(sha_of "$MIGRATIONS_DIR/001_a.sql")
out=$( (apply_migrations) 2>&1 ); rc=$?
[ "$rc" -eq 0 ] || fail "expected apply success, got $rc\n$out"
assert_contains "$out" 'OK 001_a.sql'
inserts=$(cat "$STATE/inserts")
assert_contains "$inserts" "001_a.sql"
assert_contains "$inserts" "attempt_started"
assert_contains "$inserts" "content_sha256"
assert_contains "$inserts" "'up'"
assert_contains "$inserts" "$h"

echo 'ALL CHECKS PASSED'
