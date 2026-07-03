# Sync Worker (Recovery)

## Overview

The sync worker is a **RECOVERY ONLY** mechanism. It runs on a schedule to find payments that were initiated but never received a webhook callback. The webhook is the primary payment completion path.

## Schedule

- **Interval**: Every 30 seconds (BullMQ repeat job)
- **Job ID**: `repeat:{key}:{timestamp}`
- **Job Type**: `sync_pending_payments`

## Flow

```
Timer fires (every 30s)
           │
           ▼
   syncPendingPayments()
           │
           ▼
   Query: SELECT * FROM payment_transactions
          WHERE payment_status IN ('created', 'pending', 'processing')
          AND created_at > NOW() - INTERVAL 1 HOUR
           │
           ▼
   For each pending transaction:
      │
      ├─ Call Paymob getTransactionStatus(gatewayReference)
      │    (Checks both Order API and Transaction API)
      │
      ├─ Status = "paid" → _fulfillOrder() (same as webhook)
      │
      ├─ Status = "failed" → _failPayment()
      │
      └─ Status = "pending" → Skip (still waiting)
           │
           ▼
   Log: { synced: N } (N = number recovered)
```

## When Sync Is Needed

1. Webhook never arrived (network issue, Paymob outage)
2. Webhook arrived but processing failed (bug, timeout)
3. Webhook was delayed and order entered "stale" state

## Health Indicator

If `synced > 0`, the webhook recovery is being used — investigate root cause immediately.

## Expiry Worker

A separate repeat job (`expire_stale_payments`) marks payments as expired if they exceed the timeout:

- **Default timeout**: 15 minutes
- **Default interval**: Every 60 seconds
- **Action**: Sets `payment_status = 'expired'` on stale transactions
- **Side effect**: Does NOT clear the cart (cart stays for retry)

## Workers

| Worker | Interval | Job Type | Purpose |
|--------|----------|----------|---------|
| sync_pending_payments | 30s | BullMQ repeat | Recovery sync |
| expire_stale_payments | 60s | BullMQ repeat | Mark expired payments |
| booking_* | varies | BullMQ | Booking-related jobs |
| settlement_* | varies | BullMQ | Settlement/wallet jobs |

## Queue Health

```bash
# Check Redis
docker exec redis-xxx redis-cli PING

# Check failed jobs
docker exec redis-xxx redis-cli ZRANGE "bull:default:failed" 0 -1

# Check active jobs
docker exec redis-xxx redis-cli KEYS "bull:*" | wc -l
```
