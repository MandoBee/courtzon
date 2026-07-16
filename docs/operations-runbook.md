# CourtZon Production Operations Runbook

## Service Overview

| Service | Container | Port | Health Check |
|---------|-----------|------|-------------|
| MySQL | `courtzon-mysql` | 3307 | `mysqladmin ping` |
| Redis | `courtzon-redis` | 6379 | `redis-cli ping` |
| Backend | `courtzon-backend` | 3000 | `GET /health/live` |
| Frontend | `courtzon-frontend` | 5173 | `curl http://localhost:80/` |

## Backup & Recovery

### Automated Backup
```bash
node backend/scripts/backup.js
# Output: /app/backups/courtzon_v3_2026-07-16T10-30-00.sql.gz
```

### Scheduled backup (runs daily via BullMQ)
- Job: `database_backup` (queue: default)
- Schedule: Every 24 hours
- Verify: `docker exec courtzon-backend ls -lh /app/backups/`

### Manual Backup
```bash
docker exec courtzon-backend sh -c "mariadb-dump -h mysql -P 3306 -u root -p\$MYSQL_ROOT_PASSWORD --skip-ssl --single-transaction --routines --triggers --events courtzon_v3 | gzip > /app/backups/manual_\$(date +%s).sql.gz"
```

### Restore Procedure
```bash
# 1. List available backups
docker exec courtzon-backend ls -lh /app/backups/

# 2. Restore (destructive — replaces all data)
docker exec courtzon-backend sh -c "gunzip -c /app/backups/BACKUP_FILE.sql.gz | mariadb -h mysql -P 3306 -u root -p\$MYSQL_ROOT_PASSWORD --skip-ssl courtzon_v3"

# 3. Verify
docker exec courtzon-mysql mysql -u root -p\$MYSQL_ROOT_PASSWORD courtzon_v3 -e "SELECT COUNT(*) as users FROM users; SELECT COUNT(*) as bookings FROM bookings;"
```

### Retention Policy
- Keep last 7 daily backups
- Keep last 4 weekly backups (Sunday)
- Keep last 12 monthly backups (1st of month)
- Manual backups retained indefinitely

## Service Restart

### Restart Single Service
```bash
# Backend only
docker compose restart backend

# Frontend only
docker compose restart frontend

# Database (requires health check wait)
docker compose restart mysql
```

### Full Stack Restart
```bash
docker compose down
docker compose up -d
```

## Deployment

### Standard Deployment
```bash
# 1. Build updated images
docker compose build backend frontend

# 2. Deploy
docker compose up -d

# 3. Verify health
curl -s http://localhost:3000/health | grep -q '"status":"ok"'
```

### Coolify Deployment
- Pushes to `origin/master` auto-deploy via Coolify webhook
- Manual trigger: Coolify Dashboard → Deployment → Deploy

### Rollback
```bash
# 1. Revert to previous git tag
git checkout v1.1.0

# 2. Rebuild and deploy
docker compose build backend frontend
docker compose up -d

# 3. Run pending migrations
docker exec courtzon-backend node dist/scripts/migrate.js

# 4. Verify
curl -s http://localhost:3000/health
```

## Payment Incident Response

### Payment Failed / Stuck
```bash
# 1. Check payment health
curl -s http://localhost:3000/payments/health | jq .

# 2. Sync pending payments
curl -X POST http://localhost:3000/payments/sync

# 3. Run reconciliation
curl -X POST http://localhost:3000/payments/reconciliation/run?autoFix=true

# 4. Manual recovery for specific payment
curl -X POST http://localhost:3000/payments/recover/GATEWAY_REF
```

### Webhook Not Received
1. Verify `WEBHOOK_BASE_URL` is correct and publicly reachable
2. Check Paymob dashboard for webhook delivery status
3. Run sync job: `POST /payments/sync`
4. Manual recovery: `POST /payments/recover/:gatewayReference`

### Refund Failed
1. Check gateway refund status in Paymob dashboard
2. Verify wallet balance is sufficient
3. Process refund manually: `POST /payments/:id/refund`
4. If gateway refund succeeded but local failed, run reconciliation with `autoFix=true`

## Database Recovery

### Database Corruption
```bash
# 1. Stop dependent services
docker compose stop backend

# 2. Restore from latest backup
docker exec courtzon-backend sh -c "gunzip -c /app/backups/LATEST.sql.gz | mariadb -h mysql -P 3306 -u root -p\$MYSQL_ROOT_PASSWORD --skip-ssl courtzon_v3"

# 3. Apply pending migrations
docker exec courtzon-backend node dist/scripts/migrate.js

# 4. Restart services
docker compose up -d
```

### Database Connection Issues
```bash
# Test connectivity
docker exec courtzon-backend sh -c "mariadb -h mysql -P 3306 -u root -p\$MYSQL_ROOT_PASSWORD --skip-ssl -e 'SELECT 1'"

# Check MySQL logs
docker logs courtzon-mysql --tail 50
```

## Redis Recovery

### Redis Data Loss
```bash
# Redis is a cache — data loss is non-critical
# Sessions will be re-created on login
# Locks will expire automatically
docker compose restart redis
```

### Redis Connection Issues
```bash
docker exec courtzon-redis redis-cli ping
# Should return: PONG
```

## Monitoring

### Health Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Full composite (DB + Redis + memory) |
| `GET /health/live` | Liveness (process alive) |
| `GET /health/ready` | Readiness (DB + Redis up) |
| `GET /payments/health` | Payment-specific metrics |
| `GET /payments/production-readiness` | Pre-flight checks |
| `POST /payments/reconciliation/run` | Financial reconciliation |

### Dashboard
- **Financial Ops**: `/admin/financial-ops` (requires `financial.reconcile`)
- **System Health**: `/admin/security/system-health`
- **Prometheus Metrics**: `GET /metrics` (requires `METRICS_TOKEN`)

### Prometheus + Grafana
```bash
# Start monitoring stack
docker compose --profile monitoring up -d prometheus grafana
```
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (default: admin/admin)

### Alerting Rules
Alert rules defined in `monitoring/alerts.yml`:
- BackendDown — no 200 from /health for 1m
- HighErrorRate — HTTP 5xx > 5% in 5m
- HighLatency — p95 > 3s for 5m
- NotificationDeliveryFailure — > 10% failure rate
- QueueBacklog — jobs > 100
- DatabaseDown — no ping response

## Maintenance

### Apply Pending Migrations
```bash
docker exec courtzon-backend node dist/scripts/migrate.js --status
docker exec courtzon-backend node dist/scripts/migrate.js
```

### Run Seeds (new installations only)
```bash
docker exec courtzon-backend node dist/scripts/seed.js
```

### Sync Permission Registry
```bash
docker exec courtzon-backend node dist/scripts/sync-ui-registry.js
```

## Troubleshooting

### Backend Crash Loop
```bash
# Check logs
docker logs courtzon-backend --tail 100

# Verify environment
docker exec courtzon-backenv printenv | grep -E "DB_|REDIS_|PAYMOB_"

# Check database connectivity
docker exec courtzon-backend sh -c "mariadb -h mysql -P 3306 -u root -p\$MYSQL_ROOT_PASSWORD --skip-ssl -e 'SELECT 1'"
```

### Frontend Not Loading
```bash
# Verify nginx is serving
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# Check nginx config
docker exec courtzon-frontend cat /etc/nginx/nginx.conf

# Check frontend health
curl -s http://localhost:5173/health/live
```

### Slow Queries
- Check MySQL slow query log (configured in `database/my.cnf`)
- Monitor `Questions` and `Slow queries` via `mysqladmin status`
- Verify index usage with `EXPLAIN SELECT ...`

## Security

### Credentials
- All secrets stored in Coolify environment variables (never in `.env` files)
- Paymob API keys rotated before production activation
- Session secret: `SESSION_SECRET` (auto-generated)
- Database password: `MYSQL_ROOT_PASSWORD` (set in Coolify)

### HTTPS
- Terminated at Coolify/Cloudflare
- Backend-for-frontend requests use HTTPS only
- CSP headers enforced via frontend `nginx.conf`

### Rate Limiting
- Global: 100 requests/minute/IP (2000 in dev)
- Auth: 5 login attempts/15min per IP
- Password reset: 3 attempts/15min
- Webhook: No additional rate limit (HMAC protected)
