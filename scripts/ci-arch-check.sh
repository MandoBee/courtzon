#!/bin/bash
# Architecture Regression Checks — CI Integration
# Run: bash scripts/ci-arch-check.sh [base-url]
# Default base URL: http://localhost:3000

BASE=${1:-http://localhost:3000}
PASS=0
FAIL=0

check() {
  local label=$1; shift
  if "$@"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Architecture Regression Checks ==="
echo ""

# 1. Liveness
check "GET /health/live returns ok" \
  curl -sf "$BASE/health/live" | grep -q '"ok"'

# 2. Version metadata
check "GET /health/version has gitCommit" \
  curl -sf "$BASE/health/version" | grep -q '"gitCommit"'

check "GET /health/version has applicationVersion" \
  curl -sf "$BASE/health/version" | grep -q '"applicationVersion"'

check "GET /health/version has expectedMigration" \
  curl -sf "$BASE/health/version" | grep -q '"expectedMigration"'

# 3. Payment health (requires token — skip schema check in public CI)
#    To enable: set PAYMENTS_HEALTH_TOKEN env var
if [ -n "$PAYMENTS_HEALTH_TOKEN" ]; then
  check "GET /payments/health has status" \
    curl -sf -H "Authorization: Bearer $PAYMENTS_HEALTH_TOKEN" "$BASE/payments/health" | grep -q '"status"'

  check "GET /payments/health has gatewayConfigured" \
    curl -sf -H "Authorization: Bearer $PAYMENTS_HEALTH_TOKEN" "$BASE/payments/health" | grep -q '"gatewayConfigured"'

  check "GET /payments/health has migrationSynced" \
    curl -sf -H "Authorization: Bearer $PAYMENTS_HEALTH_TOKEN" "$BASE/payments/health" | grep -q '"migrationSynced"'

  check "GET /payments/health has intentFailedByCategory" \
    curl -sf -H "Authorization: Bearer $PAYMENTS_HEALTH_TOKEN" "$BASE/payments/health" | grep -q '"intentFailedByCategory"'
fi

# 4. Webhook endpoint reachable (returns 401 for unauthenticated = HMAC validation active)
check "POST /payments/webhook returns 401 (HMAC active)" \
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/payments/webhook" -H 'Content-Type: application/json' -d '{}')" = "401" ]

# 5. Idempotency — gateway_reference UNIQUE constraint exists
#    Check via migration_history that migrations are applied
echo "  INFO: Verify gateway_reference UNIQUE constraint — check migration_history for deduplication"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All architecture checks passed" || echo "Some checks failed"
exit $FAIL
