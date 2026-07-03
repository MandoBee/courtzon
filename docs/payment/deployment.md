# Payment Deployment Guide

## Environment Variables

All variables must be set in Coolify environment (or `.env` for local Docker).

```
# Database
DB_HOST=mysql
DB_PORT=3306
DB_NAME=courtzon_v3
DB_USER=root
DB_PASSWORD=<secure_password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Payment Gateway
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_SANDBOX=true          # false for production
PAYMOB_SECRET=<secret_key>
PAYMOB_API_KEY=<api_key>
PAYMOB_PUBLIC_KEY=<public_key>
PAYMOB_HMAC_SECRET=<hmac_secret>
PAYMOB_MERCHANT_ID=<integration_id>

# Frontend build arg
VITE_PAYMOB_PUBLIC_KEY=<public_key>

# Webhook
WEBHOOK_BASE_URL=https://courtzon.cloud

# Service URLs
SERVICE_URL_FRONTEND=https://www.courtzon.cloud
SERVICE_URL_BACKEND=https://api.courtzon.cloud
SERVICE_FQDN_FRONTEND=www.courtzon.cloud
SERVICE_FQDN_BACKEND=api.courtzon.cloud

# Secrets (rotate before live)
JWT_SECRET=<production_secret>
SESSION_SECRET=<production_secret>
SECRET_KEY=<production_secret>
```

## Deployment Steps

### 1. Local Development

```bash
cd backend && npm run dev     # Backend on :3000
cd frontend && npm run dev    # Frontend on :5173
```

### 2. Production Deployment

```bash
# Commit changes
git add -A
git commit -m "message"
git push origin master

# Coolify auto-deploys from GitHub
# Wait ~60-90 seconds for build + deploy
```

### 3. Verify Deployment

```bash
# Check containers
docker ps | grep courtzon

# Check image tag matches commit
docker images "k10fyzmeoemrg9agnrr90zfk_backend*" --format "{{.Tag}}" | head -1

# Check health
curl https://api.courtzon.cloud/health/live

# Run validation
docker exec <backend-container> node /app/scripts/validate-payment-flow.mjs
```

### 4. Database Migrations

```bash
# Apply pending migrations
node backend/scripts/migrate.js

# Import fresh baseline (if needed)
mysql -u root -p courtzon_v3 < database/baseline/001_courtzon_v3.sql
mysql -u root -p courtzon_v3 < database/seeds/001_baseline.sql
```

## Before Live Launch Checklist

- [ ] Rotate `JWT_SECRET` to production value
- [ ] Rotate `SESSION_SECRET` to production value
- [ ] Rotate `SECRET_KEY` to production value
- [ ] Replace `PAYMOB_SANDBOX=true` with `false`
- [ ] Replace all Paymob sandbox credentials with live keys
- [ ] Verify HMAC secret matches live Paymob dashboard
- [ ] Set up production database credentials (non-root user)
- [ ] Enable HTTPS-only (already via Traefik/Caddy)
- [ ] Run full validation: `node backend/scripts/validate-payment-flow.mjs`
- [ ] Verify webhook receives real callbacks
- [ ] Verify sync worker reports `synced: 0`
- [ ] Set up monitoring/alerting for payment failures

## Recovery Procedures

### Webhook Not Processing

```bash
# Check webhook endpoint
curl -X POST https://api.courtzon.cloud/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return 401 (no HMAC = expected)

# Check logs
docker logs <backend-container> | grep "webhook\|payment"
```

### Stuck Payments

```bash
# Trigger manual sync
curl -X POST https://api.courtzon.cloud/payments/sync \
  -H "Authorization: Bearer <admin_jwt>"

# Trigger manual expiry
curl -X POST https://api.courtzon.cloud/payments/expire?timeoutMinutes=15 \
  -H "Authorization: Bearer <admin_jwt>"
```

### Database Consistency

```bash
# Run consistency checks
mysql -u root -p courtzon_v3 -e "
  SELECT 'orphans' as check_name, COUNT(*) FROM payment_transactions
  WHERE order_id NOT IN (SELECT id FROM orders);
  SELECT 'inconsistent' as check_name, COUNT(*) FROM orders o
  JOIN payment_transactions t ON t.order_id=o.id
  WHERE o.payment_status='paid' AND t.payment_status!='paid';
"
```
