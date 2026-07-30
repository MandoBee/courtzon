---
document_id: "OPS-RUN-02"
document_name: "Troubleshooting Guide"
family: "OPS-RUN"
document_type: "OPS"
status: "Draft"
version: "0.1"
audience: ["devops", "developer"]
difficulty: "intermediate"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "DevOps Lead"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Engineering Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["OPS-DEPLOY-01", "OPS-MON-01", "OPS-RUN-01"]
  related: ["TECH-ARCH-25"]
---

# Troubleshooting Guide (OPS-RUN-02)

## 1. Database Connection Failures

### Symptom: Backend cannot connect to MySQL

**Log message:** `ER_ACCESS_DENIED_ERROR` or `ECONNREFUSED`
**Health check:** `GET /health/database` returns `status: 'down'`

**Checklist:**

1. **Is MySQL running?**
   ```bash
   docker compose ps mysql
   ```
   If not: `docker compose logs mysql`
   
2. **Is the port correct?**
   - Docker internal: port 3306 (use `mysql` hostname)
   - Host access: port 3307 (use `localhost`)
   
3. **Are credentials correct?**
   - Verify `.env`: `DB_USER`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`
   - Test manually:
   ```bash
   docker exec -it courtzon-mysql mysql -u root -p -e "SELECT 1"
   ```

4. **Is the database created?**
   ```bash
   docker exec courtzon-mysql mysql -u root -p -e "SHOW DATABASES LIKE 'courtzon_v3'"
   ```

5. **Check the entrypoint log:** `docker logs courtzon-backend | grep -i mysql`

**Solutions:**
- Restart MySQL: `docker compose restart mysql`
- Rebuild backend: `docker compose build backend && docker compose up -d backend`
- If `courtzon_backup` user missing: run `backend/scripts/setup-db-users.sql`
- If database empty and entrypoint failed: manually import baseline

## 2. Redis Connection Failures

### Symptom: Backend cannot connect to Redis

**Log message:** `Redis connection error` or `connect ECONNREFUSED`
**Health check:** `GET /health/redis` returns `status: 'down'`

**Checklist:**

1. **Is Redis running?**
   ```bash
   docker compose ps redis
   ```

2. **Can we ping Redis?**
   ```bash
   docker exec courtzon-redis redis-cli ping
   # Should return: PONG
   ```

3. **Is Redis password correct?**
   ```bash
   docker exec courtzon-redis redis-cli -a <password> ping
   ```

4. **Is maxmemory policy causing evictions?**
   ```bash
   docker exec courtzon-redis redis-cli INFO evicted_keys
   ```

**Solutions:**
- Restart Redis: `docker compose restart redis`
- If OOM: reduce `REDIS_MEM_LIMIT` or increase Redis maxmemory
- If password mismatch: update `REDIS_PASSWORD` in `.env` and rebuild backend

## 3. Payment Gateway Failures

### Symptom: Payments failing or stuck in pending

**Log message:** `Payment gateway error` or `HMAC validation failed`
**Health check:** `GET /payments/production-readiness`

**Checklist:**

1. **Check production readiness:**
   ```bash
   curl -s http://localhost:3000/payments/production-readiness
   ```
   Review 10 checks including gateway, webhook, DB schema, replay protection, reconciliation, refund workflow

2. **Check payment health:**
   ```bash
   curl -s http://localhost:3000/payments/health | jq .
   ```

3. **Is the gateway configured?**
   - `PAYMENT_GATEWAY_PROVIDER` must be `paymob` or `mock`
   - For production: `paymob` with valid `PAYMOB_API_KEY`, `PAYMOB_SECRET`, `PAYMOB_HMAC_SECRET`

4. **Are webhooks reaching the server?**
   - `WEBHOOK_BASE_URL` must be publicly accessible
   - Test: `POST /payments/webhook` with signed payload

5. **Are there stale pending payments?**
   - Run sync: `POST /payments/sync`
   - Run expire: `POST /payments/expire?timeoutMinutes=15`

**Solutions:**
- Toggle to `mock` gateway for testing: set `PAYMENT_GATEWAY_PROVIDER=mock`
- Run reconciliation: `POST /payments/reconciliation/run?autoFix=true`
- Manually recover specific payment: `POST /payments/recover/:gatewayReference`

## 4. Queue Processing Issues

### Symptom: Background jobs not processing

**Checklist:**

1. **Are workers running?**
   ```bash
   docker compose logs backend | grep -i "worker\|queue\|bull"
   ```

2. **Check Redis queue health:**
   - Verify pending booking expiry: check `booking-expiry.worker.ts`
   - Verify auto-complete: check `booking-auto-complete.worker.ts`
   - Verify payment sync cron: check `payment-cron.worker.ts`

3. **Is Redis connected?** (see Redis section above)

**Solutions:**
- Restart backend: `docker compose restart backend`
- Check worker logs for unhandled errors
- If workers are stuck: restart the entire stack

## 5. WebSocket Connection Issues

### Symptom: Real-time updates not working (matches, notifications)

**Checklist:**

1. **Is nginx proxying WebSocket correctly?**
   ```nginx
   # nginx.conf must have:
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   proxy_read_timeout 86400;
   ```

2. **Check nginx config:**
   - `frontend/nginx.conf:96-109` — `/socket.io/` location block
   - Verify WebSocket upgrade headers are passed

3. **Is Socket.IO configured correctly on backend?**

**Solutions:**
- Rebuild frontend: `docker compose build frontend && docker compose up -d frontend`
- Check browser console for WebSocket connection errors
- Verify no firewall blocking WebSocket upgrade (port 5173)

## 6. Nginx Proxy Issues

### Symptom: 502 Bad Gateway, 404 on admin routes, SPA routing broken

**Checklist:**

1. **Is backend reachable from nginx?**
   ```bash
   docker exec courtzon-frontend curl -s http://backend:3000/health
   ```

2. **Is the accept-header routing working?**
   - Browser navigation (`Accept: text/html`) → should serve `index.html`
   - API calls (`Accept: application/json`) → should proxy to backend
   - See `nginx.conf:17-20`

3. **Check nginx error log:**
   ```bash
   docker compose logs frontend | grep -i error
   ```

4. **Are security headers causing issues?**
   - Check `security-headers.conf`
   - CSP may block inline scripts or WebSocket connections

**Solutions:**
- Rebuild frontend: `docker compose build frontend && docker compose up -d frontend`
- Verify `api-proxy.conf` includes for all API prefixes
- Clear browser cache (CSP is cached)

## 7. Migration Failures

### Symptom: Database migration errors on startup

**Log message:** `Migration failed` or SQL errors in entrypoint log

**Checklist:**

1. **Check migration history:**
   ```bash
   docker exec courtzon-mysql mysql -u root -p courtzon_v3 -e "SELECT * FROM migration_history ORDER BY applied_at"
   ```

2. **Check for duplicate column/table errors:**
   - The entrypoint auto-handles these (`duplicate column` → non-fatal)
   - See `docker-entrypoint.sh:73-78`

3. **Check expected migration:**
   ```bash
   docker exec courtzon-backend cat /app/expected-migration.txt
   ```

**Solutions:**
- Manually apply failed migration:
  ```bash
  docker exec -i courtzon-mysql mysql -u root -p courtzon_v3 < database/migrations/XXX_migration.sql
  ```
- Record as applied:
  ```bash
  docker exec courtzon-mysql mysql -u root -p courtzon_v3 -e "INSERT IGNORE INTO migration_history (filename, hash) VALUES ('XXX_migration.sql', SHA2('XXX_migration.sql', 256))"
  ```
- If baseline is corrupted: restore from backup (see OPS-RUN-01)

## 8. Docker Container Issues

### Symptom: Container exits unexpectedly, fails to start, or is unhealthy

**Checklist:**

1. **Check container status:**
   ```bash
   docker compose ps
   ```

2. **Check logs:**
   ```bash
   docker compose logs <service>
   ```

3. **Verify health checks:**
   - Backend: `docker inspect courtzon-backend | jq '.[].State.Health'`
   - All services must pass health checks before dependents start

4. **Check resource limits:**
   ```bash
   docker stats courtzon-backend
   ```

5. **Check volume permissions:**
   - Backend uploads: docker-entrypoint fixes permissions at startup
   - If bind-mounted uploads have wrong permissions, restart backend

**Solutions:**

| Issue | Solution |
|-------|----------|
| Container exits immediately | Check logs; likely misconfiguration |
| Backend unhealthy | Check DB + Redis connectivity |
| MySQL unhealthy | Check data volume corruption |
| Frontend unhealthy | Check nginx config |
| OOM killed | Increase memory limit in `.env` |
| Port conflict | Change publish port in `.env` |

**Complete reset (preserves data):**
```bash
docker compose down
docker compose up -d
```

**Hard reset (destroys data):**
```bash
docker compose down -v
# WARNING: This destroys MySQL and Redis volumes
docker compose up -d
```

## 9. General Debugging Commands

```bash
# View all logs
docker compose logs -f

# View backend logs (last 100 lines, follow)
docker compose logs -f --tail=100 backend

# Check backend health
curl -s http://localhost:3000/health | jq .

# Check database tables
docker exec courtzon-mysql mysql -u root -p courtzon_v3 -e "SHOW TABLES"

# Check Redis keys
docker exec courtzon-redis redis-cli --scan --pattern '*'

# Test API
curl -s -H "Authorization: Bearer <token>" http://localhost:3000/bookings

# Rebuild a service
docker compose build backend && docker compose up -d backend

# Full rebuild
docker compose build backend frontend
docker compose up -d
```

## 10. Support Escalation

| Issue | Contact | Channel |
|-------|---------|---------|
| Application bug | Engineering team | GitHub Issues |
| Infrastructure | DevOps lead | Slack #devops |
| Payment gateway | Paymob support | support@paymob.com |
| Hostinger VPS | Hostinger support | Hostinger dashboard |

**Evidence:** Troubleshooting steps based on known issues in `docker-compose.yml`, `backend/docker-entrypoint.sh`, `frontend/nginx.conf`, `health.service.ts`, `metrics.ts`, `payment.service.ts`, and common Docker failure modes.
