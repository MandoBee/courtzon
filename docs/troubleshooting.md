# Troubleshooting Guide

Common issues encountered while setting up and running CourtZon-V3, along with their solutions.

---

## MySQL Connection Refused

### Symptom

```
ECONNREFUSED 127.0.0.1:3306
Error: connect ECONNREFUSED
Backend fails to start — cannot connect to database
```

### Causes & Solutions

**1. MySQL is not running**

```bash
# Docker MySQL
docker compose ps mysql
docker compose logs mysql

# Local MySQL (Windows)
net start MySQL80
# or via Services GUI

# Check port
netstat -ano | findstr :3306
```

**2. Port conflict (Docker MySQL vs local MySQL)**

If you have a local MySQL on port 3306, use the Docker MySQL on port 3307:

```env
MYSQL_PUBLISH_PORT=3307
DB_PORT=3307
```

**3. Wrong hostname inside Docker**

Inside a Docker container, the backend must use the service name `mysql`, not `localhost`:

```env
DB_HOST=mysql    # inside Docker
DB_HOST=localhost # local development
```

**4. MySQL container not healthy**

The backend waits for MySQL to be healthy before starting. Check:

```bash
docker compose ps mysql
# STATUS should show "(healthy)"
```

If the container keeps restarting, check logs:

```bash
docker compose logs mysql --tail 50
```

**5. Authentication plugin issues**

The MySQL container starts with `--default-authentication-plugin=mysql_native_password`. If using a managed MySQL, ensure the backend user uses `mysql_native_password` or `caching_sha2_password`:

```sql
ALTER USER 'courtzon_app'@'%' IDENTIFIED WITH mysql_native_password BY 'password';
```

---

## Migration Failures

### Symptom

```
Migration script exits with errors
migration_history table shows FAIL
```

### Causes & Solutions

**1. Syntax error in migration SQL**

Check the migration file for typos. Test locally before running in production:

```bash
# Test the SQL directly (dry run on a test DB)
mysql -u root -p test_db < database/migrations/043_my_migration.sql
```

**2. Already-applied migration hash mismatch**

If the migration file was modified after being applied, the hash won't match. Check status:

```bash
./scripts/migrate.sh --status
```

To re-apply a failed migration:

```bash
# 1. Roll it back first
./scripts/migrate.sh --rollback 042_broken_migration.sql

# 2. Fix the migration file

# 3. Re-apply
./scripts/migrate.sh
```

**3. Permission denied**

The migration user lacks `ALTER` or `CREATE` privileges:

```sql
GRANT ALTER, CREATE, DROP, INDEX, ALTER ROUTINE, CREATE ROUTINE ON courtzon_v2.* TO 'courtzon_migrator'@'%';
FLUSH PRIVILEGES;
```

**4. Foreign key constraint fails**

If a migration adds a foreign key but the referenced table/data doesn't exist yet. Ensure migrations are ordered correctly, or add the FK constraint after the data is in place.

---

## Docker Container Crashes

### Symptom

```
Container exits immediately after starting
docker compose ps shows "restarting" or "exited"
```

### Causes & Solutions

**1. Missing environment variables**

The backend container validates required env vars on startup. Missing `SESSION_SECRET` is the most common cause:

```bash
docker compose logs backend --tail 50
# Look for: "SESSION_SECRET is required in production"
```

**2. Port already in use**

```bash
# Check if port 3000 is already in use
netstat -ano | findstr :3000

# On Linux/Mac
lsof -i :3000

# Change the port in .env:
PORT=3001
```

**3. Out of memory**

```bash
docker stats --no-stream
# Check memory usage

# Increase memory limit in docker-compose.yml or Docker settings
```

**4. Health check failing**

If the health check fails, Docker will restart the container after `retries` attempts:

```bash
# Check health status
docker inspect courtzon-backend | jq '.[].State.Health'

# View health check logs
docker inspect --format='{{json .State.Health}}' courtzon-backend
```

**5. Docker Desktop on Windows**

Docker Desktop on Windows can hang or behave unexpectedly:

- Restart Docker Desktop
- Ensure WSL 2 backend is configured
- Increase resource limits (Settings → Resources → Advanced)

---

## Frontend Can't Reach Backend

### Symptom

```
Frontend loads but shows errors in the console:
Failed to load resource: net::ERR_CONNECTION_REFUSED
/api/some-endpoint 502 Bad Gateway
```

### Causes & Solutions

**1. Vite proxy not configured (local dev)**

The Vite dev server proxies `/api/*` to the backend. Check `frontend/vite.config.ts`:

```ts
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3000'
```

Ensure the backend is running on port 3000.

**2. CORS error (production)**

The backend rejects requests from unknown origins. Check `CORS_ORIGINS` in `.env`:

```env
CORS_ORIGINS=https://courtzon.com,https://www.courtzon.com
```

**3. Wrong API URL (Docker frontend)**

The Docker frontend is a static Nginx build. It uses `VITE_API_URL` which is baked in at **build time**. Rebuild if the URL changes:

```bash
VITE_API_URL=https://api.courtzon.com docker compose build frontend
```

**4. Backend not healthy**

Check:

```bash
curl http://localhost:3000/health/live
# Must return {"status":"ok","uptime":...}
```

**5. Nginx proxy misconfiguration**

In production, if using a custom reverse proxy, ensure:
- The proxy forwards `/` to the frontend container
- The proxy forwards `/api/` to the backend container
- WebSocket support is enabled (if needed)
- SSL termination is configured

---

## Paymob Integration Issues

### Symptom

```
Payment fails with "Invalid API key" or "Signature mismatch"
Webhook not received
Payment not reflected after successful checkout
```

### Causes & Solutions

**1. Wrong payment mode**

```env
# Development
PAYMENT_GATEWAY_PROVIDER=mock

# Staging (test Paymob)
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_SANDBOX=true

# Production
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_SANDBOX=false
```

**2. HMAC signature mismatch**

The `PAYMOB_HMAC_SECRET` must match exactly what's configured in the Paymob dashboard → Account → HMAC Secret.

**3. Wrong webhook URL**

Set `WEBHOOK_BASE_URL` to the publicly accessible API URL:

```env
WEBHOOK_BASE_URL=https://api.courtzon.com
```

Paymob sends the transaction callback to: `{WEBHOOK_BASE_URL}/payments/webhook/paymob`

Verify the endpoint is reachable from the internet:

```bash
curl -X POST https://api.courtzon.com/payments/webhook/paymob \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**4. API key permissions**

Ensure the Paymob API key has the correct permissions:
- **API Key** (Accept): For refunds and transaction queries
- **Secret Key** (`sk_`): For Intention API authentication
- **Public Key** (`pk_`): For Unified Checkout URL (browser-facing)
- **HMAC Secret**: For webhook signature verification

**5. Sandbox vs Live keys**

Paymob provides different keys for sandbox and live modes. Ensure you're using the correct set:

| Mode | Key prefix | URL |
|---|---|---|
| Sandbox | `pk_test_...`, `sk_test_...` | `https://accept.paymobsandbox.com` |
| Live | `pk_live_...`, `sk_live_...` | `https://accept.paymob.com` |

The CSP in `frontend/nginx.conf` allows both:

```
connect-src 'self' https://accept.paymob.com https://accept.paymobsandbox.com;
frame-src https://accept.paymob.com https://accept.paymobsandbox.com;
```

**6. Missing `VITE_PAYMOB_PUBLIC_KEY`**

For the frontend build, the Paymob public key is passed as a build argument:

```bash
docker compose build --build-arg VITE_PAYMOB_PUBLIC_KEY=pk_live_... frontend
```

---

## Redis Connection Issues

### Symptom

```
Error: connect ECONNREFUSED 127.0.0.1:6379
BullMQ: Error connecting to Redis
```

### Causes & Solutions

**1. Redis not running**

```bash
docker compose ps redis
docker compose logs redis --tail 20
```

**2. Wrong hostname**

```env
# Inside Docker
REDIS_HOST=redis

# Local development
REDIS_HOST=localhost
```

**3. Redis password mismatch**

If `REDIS_PASSWORD` is set in `.env`, the Redis container must be started with the same password:

```bash
docker compose up -d redis
# The docker-compose.yml passes REDIS_PASSWORD automatically
```

**4. Redis port conflict**

If another service uses port 6379, change the Redis port:

```env
REDIS_PORT=6380
REDIS_PUBLISH_PORT=6380
```

---

## Slow Queries

### Symptom

```
API endpoints take >2 seconds to respond
High database CPU usage
Page load times >5 seconds
```

### Causes & Solutions

**1. Missing indexes**

Identify slow queries:

```sql
-- MySQL slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;

-- View slow queries
SHOW VARIABLES LIKE 'slow_query_log_file';
```

**2. N+1 queries**

Check backend logs for repeated identical queries. Ensure the backend code uses batch loading or eager loading instead of lazy loading in loops.

**3. Large result sets**

Ensure all list endpoints are paginated. The frontend should use React Query with proper pagination.

**4. Missing connection pool**

The backend uses `mysql2/promise` with a connection pool. Check pool settings in `backend/src/database/mysql.ts`. Increase `connectionLimit` if hitting the ceiling.

**5. Redis cache misses**

If a query is frequently executed but not cached, add caching:

- Use Redis for read-heavy data (sports, amenities, product listings)
- Cache API responses with TTL
- Invalidate cache on relevant mutations

**6. Full table scans**

Use `EXPLAIN` to check query plans:

```sql
EXPLAIN SELECT * FROM bookings WHERE status = 'pending';
```

Ensure indexed columns are used in `WHERE` clauses.

---

## Disk Space / Backup Issues

### Symptom

```
Backup script fails with "No space left on device"
MySQL crashes with "table is full"
Docker containers paused
```

### Causes & Solutions

**1. Backup directory full**

Backups accumulate in `backups/` with 30-day retention. If the drive is full:

```bash
# Check disk usage
df -h

# Check backup directory size
du -sh backups/

# Manual cleanup
rm backups/courtzon_2026_05_*.sql.gz*
```

**2. MySQL data directory too large**

The MySQL Docker volume grows with data and binary logs:

```bash
# Check volume size
docker exec courtzon-mysql du -sh /var/lib/mysql

# Purge binary logs (if not needed for replication)
docker exec courtzon-mysql mysql -e "PURGE BINARY LOGS BEFORE NOW() - INTERVAL 3 DAY;"
```

**3. Docker overlay disk full**

Docker stores images, containers, and volumes in its own directory:

```bash
# Clean up unused images and volumes
docker system prune -a --volumes

# Check Docker disk usage
docker system df
```

**4. Backup encryption consumes space**

Encrypted backups (`*.sql.gz.enc`) have similar size to the compressed backups. If both encrypted and unencrypted backups are kept, disk usage doubles. Ensure your retention policy handles both.

**5. Uploads directory growing**

The `backend/uploads/` directory can grow large with user uploads:

- Configure S3/R2 storage for production
- Set up lifecycle policies in your S3 provider
- Use the `scripts/backup-cron.sh` to sync uploads to remote storage and optionally clean local files

---

## Generic Container Troubleshooting

```bash
# View logs for a specific service
docker compose logs backend
docker compose logs backend --tail 100 -f

# Inspect a running container
docker exec -it courtzon-backend sh

# Check environment variables inside the container
docker exec courtzon-backend env | sort

# Restart a service
docker compose restart backend

# Full rebuild and restart
docker compose build backend && docker compose up -d backend
```

---

## Getting Help

If an issue persists:

1. Check the logs: `docker compose logs [service] --tail 100`
2. Verify environment variables: `docker exec [container] env | sort`
3. Check health endpoints: `curl http://localhost:3000/health`
4. Review the [AGENTS.md](../AGENTS.md) for automated agent rules
5. Open an issue in the repository with:
   - The exact error message
   - Steps to reproduce
   - Relevant logs
   - Docker version and OS
