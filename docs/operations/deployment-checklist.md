# Production Deployment Checklist (v1)

> Run before EVERY production deployment. Store with deployment docs.

## Pre-Deploy

- [ ] **Backup DB**: `mysqldump -u root -p courtzon_v3 > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] **Verify backup**: Check file size > 0 and `grep -c "CREATE TABLE"` matches expected table count
- [ ] **Check migrations**: Compare `ls database/migrations/*.sql | sort | tail -1` with `SELECT filename FROM migration_history ORDER BY id DESC LIMIT 1`
- [ ] **Git status**: `git status` — must be clean, on master, up to date with origin
- [ ] **Environment validation**: Verify `.env` has all required variables (compare with `.env.example`)

## Gateway Validation

- [ ] **DNS resolution**: From the server, verify `accept.paymob.com` resolves
- [ ] **HTTPS reachable**: `curl -I https://accept.paymob.com` returns HTTP response
- [ ] **Credentials present**: `PAYMOB_API_KEY`, `PAYMOB_SECRET`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_MERCHANT_ID`, `PAYMOB_HMAC_SECRET` all set
- [ ] **Webhook URL**: `WEBHOOK_BASE_URL` is publicly accessible (test from external network)

## Deploy

- [ ] **Build**: `docker compose build backend frontend --build-arg GIT_COMMIT=$(git rev-parse HEAD)`
- [ ] **Deploy**: `docker compose up -d`
- [ ] **Wait for healthy**: `docker compose ps` shows all services `(healthy)`

## Post-Deploy Verification

- [ ] **/health/live**: `curl /health/live | jq .status` → `"ok"`
- [ ] **/health/version**: `curl /health/version | jq .gitCommit` → matches deploy SHA
- [ ] **/payments/health**: `curl /payments/health` (with admin token)
  - `gatewayConfigured` → `true`
  - `gatewayConnectivity` → `"ok"`
  - `migrationSynced` → `true`
  - `staleOver15min` → `0`
- [ ] **Frontend**: `curl /` returns HTTP 200 with valid HTML
- [ ] **Webhook endpoint**: `curl -X POST /payments/webhook -d '{}'` returns 401 (HMAC active)
- [ ] **API reachable**: `curl /sports` returns data
- [ ] **Auth working**: `curl -X POST /auth/login` with test credentials returns token

## Smoke Tests

- [ ] **Create booking**: `POST /bookings` with valid payload → returns intent ID + payment URL
- [ ] **Create order**: `POST /marketplace/orders` with valid cart → returns order ID + payment URL
- [ ] **Payment health**: No stale payments (>15 min), no unexpected failed intents
- [ ] **Sync cron**: `docker compose logs backend | grep "sync_pending_payments"` → shows completion

## Rollback Validation

- [ ] **Docker image tagged**: `docker images courtzon-backend --format '{{.Tag}}' | grep <commit>`
- [ ] **Rollback command ready**: `docker compose up -d backend` (uses cached previous image)
- [ ] **DB rollback NOT needed**: Migrations are additive-only (verified in pre-deploy)

## Sign-Off

- [ ] All checks passed
- [ ] Deployer: _______________ Date: _______________
