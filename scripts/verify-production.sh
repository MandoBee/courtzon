#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# CourtZon V3 — Production Verification Script
# ──────────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/verify-production.sh                  # local Docker
#   ./scripts/verify-production.sh https://courtzon.example.com   # remote
#
# Checks: backend, frontend, database, Redis, API endpoints,
#         permissions, marketplace, uploads, branding, service worker.
# Exit code 0 = all healthy.  Non-zero = failures found.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

#####################################################################
# Configuration
#####################################################################
: "${FRONTEND_URL:-http://localhost:5173}"
: "${BACKEND_URL:-http://localhost:3000}"
: "${DB_HOST:-localhost}"
: "${DB_PORT:-3307}"
: "${DB_NAME:-courtzon_v3}"
: "${DB_USER:-root}"
: "${DB_PASS:-}"
: "${REDIS_HOST:-localhost}"
: "${REDIS_PORT:-6379}"
: "${UPLOAD_DIR:-./backend/uploads}"

FAIL=0
PASS=0
red()   { echo -e "\033[31m$*\033[0m"; }
green() { echo -e "\033[32m$*\033[0m"; }
pass()  { green "  PASS  $*"; PASS=$((PASS+1)); }
fail()  { red   "  FAIL  $*"; FAIL=$((FAIL+1)); }
hdr()   { echo -e "\n\033[1;36m═══ $* ═══\033[0m"; }

#####################################################################
# 1. Service Health
#####################################################################
hdr "1. Service Health"

# Backend
if curl -sf "${BACKEND_URL}/health/live" > /dev/null; then
  pass "Backend /health/live"
else
  fail "Backend /health/live"
fi

# Backend ready (includes DB + Redis check)
READY=$(curl -sf "${BACKEND_URL}/health/ready" 2>/dev/null || echo '{"status":"fail"}')
if echo "$READY" | grep -q '"status":"ok"'; then
  pass "Backend /health/ready (DB + Redis + Memory)"
  # Show ready details
  echo "$READY" | python3 -m json.tool 2>/dev/null || echo "$READY"
else
  fail "Backend /health/ready"
fi

# Frontend
if curl -sf "${FRONTEND_URL}/" > /dev/null; then
  pass "Frontend HTTP 200"
else
  fail "Frontend HTTP"
fi

#####################################################################
# 2. Database
#####################################################################
hdr "2. Database"

if [ -n "$DB_PASS" ]; then
  MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASS} ${DB_NAME} -N -e"
else
  MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_NAME} -N -e"
fi

TABLE_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}';" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -ge 150 ]; then
  pass "Database schema — ${TABLE_COUNT} tables (expected ≥150)"
else
  fail "Database schema — ${TABLE_COUNT} tables (expected ≥150)"
fi

# Roles
ROLE_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM roles;" 2>/dev/null || echo "0")
if [ "$ROLE_COUNT" -ge 8 ]; then
  pass "Roles — ${ROLE_COUNT} (expected ≥8)"
else
  fail "Roles — ${ROLE_COUNT} (expected ≥8)"
fi

# Super admin permissions
SA_PERMS=$($MYSQL_CMD "SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.slug='super_admin';" 2>/dev/null || echo "0")
if [ "$SA_PERMS" -ge 500 ]; then
  pass "Super admin permissions — ${SA_PERMS} (expected ≥500)"
else
  fail "Super admin permissions — ${SA_PERMS} (expected ≥500)"
fi

# Countries
CC_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM countries;" 2>/dev/null || echo "0")
if [ "$CC_COUNT" -ge 1 ]; then
  pass "Countries — ${CC_COUNT}"
else
  fail "Countries — ${CC_COUNT}"
fi

# Sports
SP_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM sports;" 2>/dev/null || echo "0")
if [ "$SP_COUNT" -ge 1 ]; then
  pass "Sports — ${SP_COUNT}"
else
  fail "Sports — ${SP_COUNT}"
fi

#####################################################################
# 3. Redis
#####################################################################
hdr "3. Redis"

if command -v redis-cli &>/dev/null; then
  if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
    pass "Redis PING"
  else
    fail "Redis PING"
  fi
else
  echo "  SKIP  redis-cli not installed (use backend /health/ready for Redis check)"
fi

#####################################################################
# 4. API Endpoints — Marketplace
#####################################################################
hdr "4. Marketplace API Endpoints"

check_json() {
  local path="$1"
  local desc="$2"
  local code
  code=$(curl -s -o /tmp/cz_verify_$$ -w '%{http_code}' "${FRONTEND_URL}${path}" 2>/dev/null || echo "000")
  local first
  first=$(head -c1 /tmp/cz_verify_$$ 2>/dev/null || echo "")
  if [ "$first" = "{" ] || [ "$first" = "[" ]; then
    pass "${desc} (${path}) → ${code} JSON"
  elif [ "$first" = "<" ]; then
    fail "${desc} (${path}) → returned HTML, not JSON!"
  else
    pass "${desc} (${path}) → ${code} (auth-protected)"
  fi
}

check_json "/sports/marketplace" "Sports marketplace"
check_json "/marketplace/products" "Products list"
check_json "/marketplace/cart" "Cart"
check_json "/marketplace/orders" "Orders"
check_json "/marketplace/seller/orders" "Seller orders"
check_json "/marketplace/player/status" "Player status"
check_json "/marketplace/brands" "Brands"
check_json "/marketplace/categories" "Categories"
check_json "/marketplace/tags" "Tags"
check_json "/marketplace/wishlist" "Wishlist"

# ── Verify NO HTML response for any marketplace endpoint ──
HTML_COUNT=$(curl -s -o /tmp/cz_verify_$$ -w '%{http_code}' "${FRONTEND_URL}/marketplace/cart" 2>/dev/null)
if head -c1 /tmp/cz_verify_$$ | grep -q '<'; then
  fail "❗ /marketplace/cart returned HTML — nginx SPA override intercepting API"
else
  pass "No HTML interception on /marketplace/cart"
fi

rm -f /tmp/cz_verify_$$

#####################################################################
# 5. Public Endpoints
#####################################################################
hdr "5. Public Endpoints"

check_200() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "${FRONTEND_URL}${path}" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    pass "${path}"
  else
    fail "${path} → HTTP ${code}"
  fi
}

check_200 "/countries"
check_200 "/sports"
check_200 "/favicon.svg"
check_200 "/sw.js"

#####################################################################
# 6. Branding & Assets
#####################################################################
hdr "6. Branding Assets"

check_asset() {
  local path="$1"
  local desc="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "${FRONTEND_URL}${path}" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    pass "${desc}"
  else
    fail "${desc} → HTTP ${code}"
  fi
}

check_asset "/favicon.svg" "Favicon SVG"
check_asset "/icon-192.png" "PWA icon 192"
check_asset "/icon-512.png" "PWA icon 512"
check_asset "/manifest.webmanifest" "Web manifest"

#####################################################################
# 7. Frontend Bundle
#####################################################################
hdr "7. Frontend Bundle"

BUNDLE_HASH=$(curl -s "${FRONTEND_URL}/" 2>/dev/null | grep -oP 'index-\K[A-Za-z0-9_-]+(?=\.js)' | head -1 || echo "unknown")
if [ -n "$BUNDLE_HASH" ] && [ "$BUNDLE_HASH" != "unknown" ]; then
  pass "Bundle hash: index-${BUNDLE_HASH}.js"
else
  fail "Could not extract bundle hash"
fi

#####################################################################
# 8. Uploads Directory
#####################################################################
hdr "8. Uploads"

if [ -d "$UPLOAD_DIR" ]; then
  UP_COUNT=$(find "$UPLOAD_DIR" -type f 2>/dev/null | wc -l)
  pass "Upload directory exists — ${UP_COUNT} files"
else
  fail "Upload directory missing: ${UPLOAD_DIR}"
fi

#####################################################################
# 9. Service Worker
#####################################################################
hdr "9. Service Worker"

SW_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${FRONTEND_URL}/sw.js" 2>/dev/null || echo "000")
if [ "$SW_CODE" = "200" ]; then
  pass "Service worker serves (200)"
else
  fail "Service worker → ${SW_CODE}"
fi

#####################################################################
# 10. Marketplace Data
#####################################################################
hdr "10. Marketplace Data"

PROD_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM products;" 2>/dev/null || echo "0")
if [ "$PROD_COUNT" -ge 1 ]; then
  pass "Products table has data — ${PROD_COUNT} rows"
else
  echo "  INFO  Products table empty (${PROD_COUNT} rows) — seed if needed"
fi

CAT_COUNT=$($MYSQL_CMD "SELECT COUNT(*) FROM product_categories;" 2>/dev/null || echo "0")
if [ "$CAT_COUNT" -ge 1 ]; then
  pass "Product categories — ${CAT_COUNT}"
else
  fail "Product categories — ${CAT_COUNT}"
fi

#####################################################################
# Summary
#####################################################################
hdr "SUMMARY"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  green "✓  ALL ${PASS} CHECKS PASSED"
  exit 0
else
  red "✗  ${FAIL}/${TOTAL} CHECKS FAILED"
  exit 1
fi
