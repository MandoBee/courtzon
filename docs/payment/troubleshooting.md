# Payment Troubleshooting Guide

## Common Issues

### 1. Webhook Returns 401 (Invalid Signature)

**Symptoms**: Paymob webhooks are rejected, payments not completing.

**Check**:
- Verify `PAYMOB_HMAC_SECRET` matches the value in Paymob Dashboard
- Check logs: `docker logs <backend> | grep "Invalid webhook signature"`
- Confirm the signature is being extracted from the correct source (query param `?hmac=` for Intention API)

**Fix**: Update `PAYMOB_HMAC_SECRET` in Coolify environment to match Paymob dashboard value.

### 2. Payment Stuck in "pending" State

**Symptoms**: User paid but order shows "pending/unpaid".

**Check**:
1. Did the webhook arrive?
   ```
   docker logs <backend> | grep "webhook\|intention"
   ```
2. Is the sync worker recovering?
   ```
   docker logs <backend> | grep "synced"
   ```
3. Check database:
   ```sql
   SELECT id, payment_status, gateway_reference, created_at
   FROM payment_transactions WHERE payment_status = 'pending';
   ```

**Fix**:
- If webhook never arrived: trigger manual sync
  ```
  POST /payments/sync (admin auth required)
  ```
- If webhook arrived but failed: check error logs
- If sync failed: check Paymob API connectivity

### 3. Intention API Fails

**Symptoms**: Checkout fails, can't create payment intention.

**Check**:
- Verify `PAYMOB_SECRET` is correct and not expired
- Verify `PAYMOB_MERCHANT_ID` (integration ID) is correct
- Test connectivity: `curl https://accept.paymob.com/v1/intention/`
- Check container DNS: `docker exec <backend> nslookup accept.paymob.com`

**Fix**:
- Update Paymob credentials in Coolify
- If DNS fails: check Docker network configuration
- Rebuild and redeploy

### 4. Cart Items Not Clearing

**Symptoms**: After successful payment, cart still has items.

**Check**:
- Verify `_fulfillOrder()` was called
- Check logs for "fulfillOrder" or "cart cleared" entries
- Check if order status is actually "confirmed"

**Debug**:
```sql
SELECT o.id, o.status, o.payment_status, t.payment_status
FROM orders o
JOIN payment_transactions t ON t.order_id = o.id
WHERE o.id = <order_id>;
```

### 5. Duplicate Journal Entries

**Symptoms**: Financial records show duplicated entries for same payment.

**Cause**: Usually webhook replay without proper idempotency.

**Check**:
```sql
SELECT reference_id, COUNT(*)
FROM financial_journal_entries
WHERE reference_type = 'payment'
GROUP BY reference_id
HAVING COUNT(*) > 1;
```

**Fix**: If duplicates exist, they predate the idempotency fix. The `uk_gateway_reference` unique index should prevent new duplicates. Clean up old duplicates manually.

### 6. BullMQ Jobs Failing

**Symptoms**: Workers not processing, jobs accumulating.

**Check**:
```bash
docker exec <redis> redis-cli PING
docker exec <redis> redis-cli ZRANGE "bull:default:failed" 0 -1
```

**Fix**:
- If Redis is down: restart the Redis container
- If workers not running: restart the backend container
- Old failed jobs are non-critical (historical)

### 7. Health Endpoint Shows Stale Payments

**Symptoms**: `GET /payments/health` shows high `staleOver15min` count.

**Action**:
```bash
# Check stale transactions
SELECT id, gateway_reference, created_at
FROM payment_transactions
WHERE payment_status IN ('created','pending')
  AND created_at < NOW() - INTERVAL 15 MINUTE;

# Trigger manual expiry
POST /payments/expire?timeoutMinutes=15
```

## Logging & Debugging

### Enable Debug Logs (temporary)

The payment module uses structured logging with levels:
```typescript
log.info({ ... }, 'message');   // Normal operations
log.warn({ ... }, 'warning');   // Recoverable issues
log.error({ ... }, 'error');    // Errors
```

There are no `console.log` statements in payment code.

### View Recent Payment Logs

```bash
# Last 50 payment-related log entries
docker logs <backend> --tail 200 | grep -iE "payment|webhook|intent|fulfill|sync|expire"
```

### Test Webhook Endpoint

```bash
# Using the validation script (creates real intention + simulates webhook)
docker exec <backend> node /app/scripts/validate-payment-flow.mjs
```

## Recovery Commands

```bash
# Check system health
curl https://api.courtzon.cloud/health/live

# Trigger payment sync (requires auth)
curl -X POST https://api.courtzon.cloud/payments/sync \
  -H "Authorization: Bearer <token>"

# Trigger payment expiry (requires auth)
curl -X POST https://api.courtzon.cloud/payments/expire?timeoutMinutes=15 \
  -H "Authorization: Bearer <token>"

# View payment health (requires auth)
curl https://api.courtzon.cloud/payments/health \
  -H "Authorization: Bearer <token>"
```

## Emergency Contacts

- **Paymob Dashboard**: https://accept.paymob.com/portal2/en/login
- **Paymob Support**: Through dashboard
- **Paymob API Docs**: https://developers.paymob.com
- **Coolify Dashboard**: https://courtzon.cloud (admin)
