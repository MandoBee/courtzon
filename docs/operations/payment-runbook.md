# Payment Operations Runbook

> All alerts are exposed by `GET /payments/health`  
> Monitor endpoint every 60 seconds via UptimeRobot, Prometheus, or Grafana

---

## RUN-001: gateway_unavailable

| Field | Value |
|---|---|
| **Alert name** | `gateway_unavailable` |
| **Trigger** | `intentFailedByCategory.gateway_unavailable > 0` in 5-minute window |
| **Severity** | **CRITICAL** |
| **Expected recovery time** | < 5 minutes |

### Root causes (ordered by likelihood)
1. Paymob API is down — check https://status.paymob.com
2. Docker container has no outbound internet access — DNS failure, firewall, proxy down
3. `PAYMENT_GATEWAY_PROVIDER` env var is set to `paymob` but Paymob credentials are missing/invalid
4. TLS certificate expiration on Paymob's side

### Immediate investigation
```bash
# 1. Check if Paymob API is reachable from the server
docker compose exec backend curl -I https://accept.paymobsandbox.com

# 2. Check the payment health endpoint
curl https://your-domain/payments/health | jq .gatewayConfigured

# 3. Check recent failed intents
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT id, failure_reason, created_at FROM booking_intents WHERE intent_status='failed' AND failure_category='gateway_unavailable' ORDER BY id DESC LIMIT 5"

# 4. Check backend logs for fetch errors
docker compose logs backend --tail 100 | grep "fetch failed"
```

### Recovery
1. **Paymob down**: Wait for Paymob to recover. Intents stay as `failed`. User sees error. They can retry once Paymob is back.
2. **Docker network**: Restart Docker daemon or fix DNS. Then test connectivity.
3. **Credentials**: Verify `.env` has `PAYMOB_API_KEY`, `PAYMOB_SECRET`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_MERCHANT_ID`, `PAYMOB_HMAC_SECRET`.
4. **TLS**: Update CA certificates in Docker image or check Paymob certificate expiry.

### Escalation
- If Paymob is down > 30 minutes → escalate to Paymob support (support@paymob.com)
- If Docker network failure persists > 15 minutes → escalate to infrastructure team

---

## RUN-002: gateway_rejected

| Field | Value |
|---|---|
| **Alert name** | `gateway_rejected` |
| **Trigger** | `intentFailedByCategory.gateway_rejected > 5` in 1 hour |
| **Severity** | **HIGH** |
| **Expected recovery time** | Varies (investigate root cause) |

### Root causes
1. Paymob API rejects requests due to invalid parameters (amount, currency, merchant ID)
2. Paymob sandbox credentials expired or deactivated
3. Paymob merchant account has issues (KYC, limits, funding)
4. Specific payment methods (card, wallet) are disabled in Paymob dashboard

### Immediate investigation
```bash
# Check recent rejected intents
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT id, failure_reason, created_at FROM booking_intents WHERE intent_status='failed' AND failure_category='gateway_rejected' ORDER BY id DESC LIMIT 10"

# Check payment transactions for gateway_response (raw Paymob error)
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT id, gateway_response FROM payment_transactions WHERE payment_status='failed' ORDER BY id DESC LIMIT 5"
```

### Recovery
1. **Invalid params**: Check recent code changes to charge request payload. Validate amounts are positive, currency is 'EGP'.
2. **Expired credentials**: Log into Paymob dashboard (https://accept.paymobsandbox.com → API Keys) and verify keys are active. Rotate if needed.
3. **Merchant issues**: Log into Paymob dashboard and check account status, KYC status, transaction limits.
4. **Disabled methods**: Check Paymob dashboard → Payment Methods configuration.

### Escalation
- If > 20 rejections in 1 hour → escalate to Paymob support
- If credential-related → escalate to security team for rotation

---

## RUN-003: staleOver15min

| Field | Value |
|---|---|
| **Alert name** | `staleOver15min` |
| **Trigger** | `staleOver15min > 10` |
| **Severity** | **MEDIUM** |
| **Expected recovery time** | < 5 minutes |

### Root causes
1. Webhook endpoint unreachable (reverse proxy down, tunnel disconnected, firewall)
2. Paymob stopped sending webhooks
3. Sync cron is not running or failing
4. `WEBHOOK_BASE_URL` is misconfigured

### Immediate investigation
```bash
# 1. Verify webhook endpoint is reachable
curl -X POST https://your-domain/payments/webhook -d '{}' -H "Content-Type: application/json"
# Should return 401 (HMAC validation failed) — means endpoint IS reachable

# 2. Check sync cron is running
docker compose logs backend --tail 50 | grep "sync_pending_payments"

# 3. Manually trigger sync
curl -X POST https://your-domain/payments/sync -H "Authorization: Bearer ADMIN_TOKEN"

# 4. Check pending payments
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT COUNT(*) FROM payment_transactions WHERE payment_status IN ('created','pending','processing') AND created_at < NOW() - INTERVAL 15 MINUTE"
```

### Recovery
1. **Reverse proxy down**: Restart Nginx / Cloudflare tunnel / Coolify proxy. Verify with curl.
2. **Webhook issue**: Check Paymob dashboard → Webhooks → Delivery Log. If Paymob shows delivery failures, verify `WEBHOOK_BASE_URL` is correct and publicly accessible.
3. **Sync cron**: If sync is not running, restart backend container: `docker compose restart backend`
4. **WEBHOOK_BASE_URL**: Verify the URL is correct in `.env`. It must be a URL that Paymob's servers can reach (public internet-facing, not localhost).

### Escalation
- If webhook unreachable > 30 minutes → escalate to infrastructure
- If sync shows `synced:0` but pending payments exist → escalate to engineering

---

## RUN-004: lastWebhookAt

| Field | Value |
|---|---|
| **Alert name** | `lastWebhookAt` |
| **Trigger** | `lastWebhookAt IS NULL` OR `lastWebhookAt < NOW() - 15 minutes` |
| **Severity** | **HIGH** |
| **Expected recovery time** | < 15 minutes |

### Root causes
1. No webhooks have ever been received (new deployment, wrong URL)
2. Webhook delivery stopped (proxy down, network issue)
3. Paymob is not sending webhooks (configuration issue in Paymob dashboard)

### Immediate investigation
```bash
# 1. Check when the last webhook was received
curl https://your-domain/payments/health | jq .lastWebhookAt

# 2. Check webhook journal entries
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT description, created_at FROM financial_journal_entries WHERE reference_type='gateway_webhook' ORDER BY id DESC LIMIT 5"

# 3. Test webhook endpoint
curl -X POST https://your-domain/payments/webhook -d '{}' -H "Content-Type: application/json"
```

### Recovery
1. Verify `WEBHOOK_BASE_URL` is correct and publicly accessible
2. Verify the reverse proxy is routing `/payments/webhook` to the backend
3. Check Paymob dashboard → Webhooks for delivery errors
4. If Paymob is configured: update the webhook URL in Paymob dashboard to match WEBHOOK_BASE_URL

### Escalation
- If no webhooks received in 1 hour → escalate to Paymob support
- If proxy/Nginx issue → escalate to infrastructure

---

## RUN-005: migrationSynced

| Field | Value |
|---|---|
| **Alert name** | `migrationSynced` |
| **Trigger** | `migrationSynced == false` |
| **Severity** | **CRITICAL** |
| **Expected recovery time** | < 10 minutes |

### Root causes
1. New migrations were added to the repository but not applied to the database
2. Docker image was rebuilt with new migrations but the database wasn't updated
3. Migration was applied out of order

### Immediate investigation
```bash
# 1. Check expected vs actual migration
curl https://your-domain/payments/health | jq '{expected: .expectedMigrationVersion, actual: .databaseMigrationVersion}'

# 2. List pending migrations
ls database/migrations/*.sql | sort

# 3. Check applied migrations
docker compose exec mysql mysql -u root -p courtzon_v3 \
  -e "SELECT filename, applied_at FROM migration_history ORDER BY id"
```

### Recovery
1. Compare expected migration (from `/app/expected-migration.txt`) with applied migrations (from `migration_history` table)
2. Apply any missing migrations in sequential order:
```bash
docker compose exec -T mysql mysql -u root -p courtzon_v3 < database/migrations/00X_something.sql
```
3. Restart backend after all migrations are applied
4. Re-verify with `curl /payments/health | jq .migrationSynced`

### Escalation
- If migrations fail to apply → escalate to engineering
- Do NOT deploy new application code until migrations are synced

---

## RUN-006: gatewayConfigured

| Field | Value |
|---|---|
| **Alert name** | `gatewayConfigured` |
| **Trigger** | `gatewayConfigured == false` |
| **Severity** | **CRITICAL** |
| **Expected recovery time** | < 5 minutes |

### Root causes
1. `PAYMOB_API_KEY` or `PAYMOB_SECRET` or `PAYMOB_HMAC_SECRET` is missing from environment
2. `.env` file was modified or lost during deployment
3. Coolify environment variables not synced

### Immediate investigation
```bash
# 1. Check payment health
curl https://your-domain/payments/health | jq '{provider, gatewayConfigured}'

# 2. Check env vars in container
docker compose exec backend printenv | grep PAYMOB

# 3. Compare with .env.example
diff <(grep PAYMOB .env.example) <(docker compose exec backend printenv | grep PAYMOB)
```

### Recovery
1. Verify `.env` file contains all required Paymob variables:
   - `PAYMOB_API_KEY`
   - `PAYMOB_SECRET` (must be a valid Paymob Secret Key starting with `egy_sk_test_` or `egy_sk_live_`)
   - `PAYMOB_PUBLIC_KEY`
   - `PAYMOB_MERCHANT_ID`
   - `PAYMOB_HMAC_SECRET`
2. If missing, add them to `.env` and restart backend:
```bash
docker compose up -d backend
```
3. Re-verify with `curl /payments/health | jq .gatewayConfigured`

### Escalation
- If credentials are lost → escalate to security team to rotate Paymob keys
- Do NOT deploy without valid credentials in production

---

## Disaster Recovery Paths

### Path 1: Webhook arrives (normal)
```
User pays → Paymob sends webhook → backend verifies HMAC → updates payment_transactions
→ fulfills booking/order → frontend polls → UI updates
Recovery time: ~1-2 seconds
```

### Path 2: Webhook missed → Sync recovery
```
Webhook missed → sync_pending_payments cron (every 5 min) finds pending payment
→ calls getTransactionStatus() on Paymob → detects paid status
→ updates payment_transactions → fulfills booking/order
Recovery time: up to 5 minutes
```

### Path 3: Expired before recovery → Manual recovery
```
Payment expired before sync ran → payment_transactions.status='expired'
→ ORDER: order stays pending/unpaid → support can manually update
→ BOOKING: intent_expired, no booking created
This is the only path where manual intervention is needed.
Currently only reachable if sync cron is completely non-functional.
The PaymobGateway URL fix (commit 3b9c926) makes this path extremely unlikely.
```

### No Permanent Data Loss Scenario
- Paid transactions ALWAYS have a `gateway_reference` in `payment_transactions`
- The UNIQUE constraint on `gateway_reference` prevents duplicates
- `sync_pending_payments` provides automated recovery
- Expired payments are detectable via `payment_transactions.payment_status='expired'`
- Manual recovery: query Paymob by gateway_reference, manually update status
