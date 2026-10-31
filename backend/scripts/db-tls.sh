#!/bin/sh
# ============================================================================
# CourtZon — Unified database TLS policy (shell / MariaDB CLI side)
#
# SINGLE SOURCE OF TRUTH for how the MariaDB command-line client negotiates
# TLS. Sourced by BOTH shell execution paths:
#   - backend/docker-entrypoint.sh   (table count, baseline/seed import, stamping)
#   - scripts/migrate.sh             (migration SQL execution)
#
# The Node half of the same policy lives in backend/scripts/db-tls.js. Both
# implement the identical mode table — change them together:
#
#   DB_TLS_MODE=disable    -> --skip-ssl
#   DB_TLS_MODE=require    -> --ssl --skip-ssl-verify-server-cert
#   DB_TLS_MODE=verify-ca  -> --ssl --ssl-ca=$DB_TLS_CA_PATH --ssl-verify-server-cert
#
# Rules:
#   * Unset DB_TLS_MODE defaults to `disable` ONLY for an explicitly classified
#     local environment (COURTZON_MIGRATION_ENV=local, or NODE_ENV=development/
#     test); non-local environments fail fast.
#   * An UNKNOWN environment (both signals unset) is not local: it fails fast
#     unless DB_TLS_MODE is set explicitly.
#   * Every variable is normalised by trimming leading/trailing whitespace and
#     lowercasing; internal whitespace is preserved so `dis able` is rejected.
#   * Unknown values fail fast.
#   * verify-ca requires a readable, non-empty PEM file at DB_TLS_CA_PATH and
#     never falls back to another mode.
#   * Messages never contain passwords or credentials.
#
# POSIX sh only (the entrypoint is #!/bin/sh): no arrays, no `local`.
# Sets on success:
#   DB_TLS_MODE_RESOLVED   effective mode (disable|require|verify-ca)
#   DB_TLS_ENVIRONMENT     local | non-local | unknown
#   DB_TLS_CLI_ARGS        flags to append to the mariadb client invocation
#   DB_TLS_WARNINGS        non-fatal warning text (may be empty)
# ============================================================================

DB_TLS_MODE_RESOLVED=""
DB_TLS_ENVIRONMENT=""
DB_TLS_CLI_ARGS=""
DB_TLS_WARNINGS=""

db_tls_supported_modes() {
  printf '%s\n' "disable require verify-ca"
}

# Shared normalisation: trim leading/trailing whitespace, then lowercase.
# Internal whitespace is preserved so `dis able` is rejected — identical to
# normalizeEnvValue() in backend/scripts/db-tls.js.
db_tls_normalize() {
  printf '%s' "${1:-}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Classify the deployment environment — mirrors classifyDatabaseEnvironment().
# Precedence: explicit COURTZON_MIGRATION_ENV wins; else NODE_ENV; if both are
# unset/empty the environment is `unknown` (never implicitly local).
db_tls_environment() {
  _db_tls_mig_env=$(db_tls_normalize "${COURTZON_MIGRATION_ENV:-}")
  if [ -n "$_db_tls_mig_env" ]; then
    if [ "$_db_tls_mig_env" = "local" ]; then
      printf '%s' "local"
    else
      printf '%s' "non-local"
    fi
    return 0
  fi

  _db_tls_node_env=$(db_tls_normalize "${NODE_ENV:-}")
  if [ -z "$_db_tls_node_env" ]; then
    printf '%s' "unknown"
    return 0
  fi
  case "$_db_tls_node_env" in
    development|test) printf '%s' "local" ;;
    *) printf '%s' "non-local" ;;
  esac
}

# True only for an explicitly classified local environment.
db_tls_is_local() {
  [ "$(db_tls_environment)" = "local" ]
}

db_tls_fail() {
  echo "FATAL: database TLS policy: $*" >&2
  return 1
}

# Resolve the effective policy. Returns 1 (and prints to stderr) on failure.
db_tls_resolve() {
  DB_TLS_MODE_RESOLVED=""
  DB_TLS_ENVIRONMENT=""
  DB_TLS_CLI_ARGS=""
  DB_TLS_WARNINGS=""

  _db_tls_env=$(db_tls_environment)
  DB_TLS_ENVIRONMENT="$_db_tls_env"

  _db_tls_mode=$(db_tls_normalize "${DB_TLS_MODE:-}")

  if [ -z "$_db_tls_mode" ]; then
    case "$_db_tls_env" in
      local) _db_tls_mode="disable" ;;
      non-local)
        db_tls_fail "DB_TLS_MODE is not set. Non-local deployments must choose an explicit policy: disable, require or verify-ca (COURTZON_MIGRATION_ENV/NODE_ENV report a non-local environment). Refusing to fall back to plaintext."
        return 1
        ;;
      *)
        db_tls_fail "DB_TLS_MODE is not set and the deployment environment cannot be classified (COURTZON_MIGRATION_ENV and NODE_ENV are both unset). Set DB_TLS_MODE explicitly to one of: disable, require, verify-ca. Refusing to infer local plaintext from missing environment variables."
        return 1
        ;;
    esac
  fi

  case "$_db_tls_mode" in
    disable|require|verify-ca) ;;
    *)
      db_tls_fail "invalid DB_TLS_MODE '$_db_tls_mode'. Expected one of: $(db_tls_supported_modes | tr '\n' ' ' | sed 's/ $//')"
      return 1
      ;;
  esac

  if [ "$_db_tls_mode" = "disable" ] && [ "$_db_tls_env" != "local" ]; then
    if [ "$_db_tls_env" = "non-local" ]; then
      DB_TLS_WARNINGS="WARNING: DB_TLS_MODE=disable is explicitly set in a non-local environment — database traffic is NOT encrypted."
    else
      DB_TLS_WARNINGS="WARNING: DB_TLS_MODE=disable is explicitly set while the deployment environment cannot be classified (COURTZON_MIGRATION_ENV and NODE_ENV are both unset) — database traffic is NOT encrypted."
    fi
  fi

  case "$_db_tls_mode" in
    disable)
      DB_TLS_CLI_ARGS="--skip-ssl"
      ;;
    require)
      DB_TLS_CLI_ARGS="--ssl --skip-ssl-verify-server-cert"
      ;;
    verify-ca)
      if [ -z "${DB_TLS_CA_PATH:-}" ]; then
        db_tls_fail "DB_TLS_MODE=verify-ca requires DB_TLS_CA_PATH to point at the PEM CA certificate used to sign the MySQL server certificate."
        return 1
      fi
      case "$DB_TLS_CA_PATH" in
        *[[:space:]]*)
          db_tls_fail "DB_TLS_CA_PATH must not contain whitespace: the shell runner and the Node driver must resolve the identical path."
          return 1
          ;;
      esac
      if [ ! -e "$DB_TLS_CA_PATH" ]; then
        db_tls_fail "DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH does not exist or is not accessible: $DB_TLS_CA_PATH"
        return 1
      fi
      if [ ! -f "$DB_TLS_CA_PATH" ]; then
        db_tls_fail "DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not a regular file: $DB_TLS_CA_PATH"
        return 1
      fi
      if [ ! -r "$DB_TLS_CA_PATH" ]; then
        db_tls_fail "DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not readable: $DB_TLS_CA_PATH"
        return 1
      fi
      if [ ! -s "$DB_TLS_CA_PATH" ]; then
        db_tls_fail "DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is empty: $DB_TLS_CA_PATH"
        return 1
      fi
      if ! grep -q "BEGIN CERTIFICATE" "$DB_TLS_CA_PATH" 2>/dev/null; then
        db_tls_fail "DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not a PEM certificate file: $DB_TLS_CA_PATH"
        return 1
      fi
      DB_TLS_CLI_ARGS="--ssl --ssl-ca=$DB_TLS_CA_PATH --ssl-verify-server-cert"
      ;;
  esac

  DB_TLS_MODE_RESOLVED="$_db_tls_mode"
  return 0
}

# Secret-free one-line description safe to log at startup.
db_tls_describe() {
  case "${DB_TLS_MODE_RESOLVED:-}" in
    disable) printf '%s' "disable (plaintext)" ;;
    require) printf '%s' "require (encrypted; server certificate not verified)" ;;
    verify-ca) printf '%s' "verify-ca (encrypted; CA + hostname verified via $DB_TLS_CA_PATH)" ;;
    *) printf '%s' "${DB_TLS_MODE_RESOLVED:-<unresolved>}" ;;
  esac
}
