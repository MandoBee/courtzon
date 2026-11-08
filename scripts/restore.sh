#!/usr/bin/env bash
# ============================================================================
# CourtZon database restore — compatibility wrapper.
#
# Delegates to the single Node restore engine:
#   backend/scripts/restore.js
#
# The Node engine supports:
#   - AES-256-GCM  (.sql.gz.enc2, CZBAK2, authenticated)
#   - legacy CBC   (.sql.gz.enc)
#   - plain gzip   (.sql.gz)
#   - plain SQL    (.sql)
#
# This wrapper forwards every argument unchanged and exits with the Node
# process exit code. It deliberately contains no restore logic, no database
# defaults, and never pipes backup data into mysql itself.
#
# Usage:
#   ./scripts/restore.sh --file <backup-file> [options]
#   npm run db:restore -- --file <backup-file> [options]
#
# Required environment for a real restore:
#   DB_USER / DB_PASSWORD (no implicit root), BACKUP_ENCRYPTION_KEY for
#   encrypted backups. See backend/scripts/restore.js --help.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESTORE_JS="$PROJECT_DIR/backend/scripts/restore.js"

if [ ! -f "$RESTORE_JS" ]; then
  printf 'ERROR: restore engine not found: %s\n' "$RESTORE_JS" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'ERROR: node is required to run the restore engine\n' >&2
  exit 1
fi

exec node "$RESTORE_JS" "$@"
