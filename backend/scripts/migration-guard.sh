#!/bin/sh
# ============================================================================
# CourtZon — Migration Environment Guard  (SINGLE SOURCE OF TRUTH)
#
# Sourced by BOTH migration execution paths so the local-vs-production policy
# is enforced exactly once:
#   - backend/docker-entrypoint.sh   (automatic, in-container, every start)
#   - scripts/migrate.sh             (manual: node backend/scripts/migrate.js
#                                     -> bash scripts/migrate.sh)
#
# ────────────────────────────────────────────────────────────────────────────
# ENVIRONMENT DETECTION  (explicit signal — never inferred from hostname /
# DB name / IP / Docker presence)
#
#   COURTZON_MIGRATION_ENV=local      -> local Docker development
#   COURTZON_MIGRATION_ENV=production -> Hostinger / production
#   unset or anything else            -> unknown  (FAIL-CLOSED below)
#
# ────────────────────────────────────────────────────────────────────────────
# MIGRATION CLASSIFICATION  (machine-readable marker, parsed, not commented)
#
# Each migration may declare, on its own line anywhere in the file:
#
#   -- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY   (dev-only)
#   -- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE     (runs everywhere)
#
#   (no marker)                    -> treated as PRODUCTION_SAFE
#                                     (backward-compatible default: the entire
#                                      existing production chain 001..158 keeps
#                                      working exactly as before)
#   (unrecognized marker value)    -> INVALID (fail-closed, see below)
#
# ────────────────────────────────────────────────────────────────────────────
# DECISION TABLE
#
#   classification      | local     | production | unknown
#   --------------------|-----------|------------|----------
#   PRODUCTION_SAFE     | RUN       | RUN        | RUN
#     (or unmarked)     |           |            |  (backward-compat)
#   LOCAL_DOCKER_ONLY   | RUN       | SKIP       | SKIP
#   INVALID (bad marker)| RUN+warn  | SKIP       | SKIP
#
# FAIL-CLOSED RULES
#   * An unknown/empty migration environment is NEVER treated as local.
#   * LOCAL_DOCKER_ONLY migrations MUST NOT execute when the environment is
#     not explicitly "local".
#   * A skipped migration is NOT executed and NOT recorded in migration_history;
#     it remains pending until a permitted environment runs it.
# ============================================================================

COURTZON_MIGRATION_MARKER_RE='^--[[:space:]]*COURTZON_MIGRATION_ENV:[[:space:]]*[A-Za-z0-9_]+[[:space:]]*$'

# Resolve the migration environment. Echoes: local | production | unknown
courtzon_migration_env() {
  case "${COURTZON_MIGRATION_ENV:-}" in
    local) echo "local" ;;
    production) echo "production" ;;
    *) echo "unknown" ;;
  esac
}

# Classify a migration file. Echoes: LOCAL_DOCKER_ONLY | PRODUCTION_SAFE | INVALID
# The marker is parsed (grep + last field) — the file's SQL is never executed
# here, and classification is a pure function of the file content.
courtzon_migration_classify() {
  _cz_file="$1"
  _cz_val=$(grep -E "$COURTZON_MIGRATION_MARKER_RE" "$_cz_file" 2>/dev/null \
    | head -n 1 | awk '{print $NF}' || true)
  case "${_cz_val}" in
    LOCAL_DOCKER_ONLY) echo "LOCAL_DOCKER_ONLY" ;;
    PRODUCTION_SAFE) echo "PRODUCTION_SAFE" ;;
    "") echo "PRODUCTION_SAFE" ;;
    *) echo "INVALID" ;;
  esac
}

# Decide whether a migration may run in the current environment.
# Returns 0 (run) or 1 (skip by policy). Safe under `set -e` / `set -u`.
courtzon_migration_should_run() {
  _cz_file="$1"
  _cz_env=$(courtzon_migration_env)
  _cz_cls=$(courtzon_migration_classify "$_cz_file")
  case "$_cz_cls" in
    PRODUCTION_SAFE) return 0 ;;
    LOCAL_DOCKER_ONLY)
      [ "$_cz_env" = "local" ] && return 0 || return 1
      ;;
    INVALID)
      # Unrecognized marker value — FAIL-CLOSED. Runs only in an explicitly
      # local environment (so a developer sees the warning and fixes the
      # marker); production and unknown environments skip it.
      [ "$_cz_env" = "local" ] && return 0 || return 1
      ;;
    *) return 1 ;;
  esac
}

# Human-readable reason a migration was skipped (empty when it should run).
# Optional 2nd arg overrides the displayed filename.
courtzon_migration_skip_reason() {
  _cz_file="$1"
  _cz_fname="${2:-$(basename "$_cz_file")}"
  _cz_env=$(courtzon_migration_env)
  _cz_cls=$(courtzon_migration_classify "$_cz_file")
  case "$_cz_cls" in
    PRODUCTION_SAFE) echo "" ;;
    LOCAL_DOCKER_ONLY)
      echo "migration '$_cz_fname' is LOCAL_DOCKER_ONLY and COURTZON_MIGRATION_ENV='${COURTZON_MIGRATION_ENV:-<unset>}' (not 'local')" ;;
    INVALID)
      echo "migration '$_cz_fname' has an unrecognized COURTZON_MIGRATION_ENV marker (treated as local-only, fail-closed) and COURTZON_MIGRATION_ENV='${COURTZON_MIGRATION_ENV:-<unset>}'" ;;
    *) echo "migration '$_cz_fname' has an unknown classification" ;;
  esac
}