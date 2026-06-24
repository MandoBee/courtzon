# Production Deployment Guide

## Prerequisites

- **Docker** 24+ and Docker Compose v2+
- **Server** with minimum 2 vCPUs and 4 GB RAM (8 GB recommended)
- **Domain names** configured (e.g., `courtzon.com`, `api.courtzon.com`)
- **MySQL 8.0** — Docker container or managed service (RDS, CloudSQL, etc.)
- **Redis 7** — Docker container or managed service (ElastiCache, Upstash, etc.)
- **Object storage** — S3-compatible (Cloudflare R2, AWS S3, MinIO) for uploads
- **SMTP provider** for transactional emails
- **Paymob** live account for payment processing
- **Node.js 22+** (only needed for build/CI — not required on the server)

## Deployment Options

- **Coolify** (recommended) — see [Coolify Deployment Guide](coolify.md)
- **Manual VPS** — follow this guide
- **Docker Compose** on any Linux host

## Environment Variables

Copy and configure the production environment template:

```bash
cp deployment/coolify/.env.production .env
```

Or use `deployment/env/.env.example` as a reference. Key production differences from development:

| Variable | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `LOG_LEVEL` | `debug` | `info` |
| `SESSION_SECRET` | dev default | Random 32+ char string |
| `ENABLE_API_DOCS` | `true` | `false` |
| `RELAX_RATE_LIMIT` | (unset) | Must NOT be set |
| `PAYMENT_GATEWAY_PROVIDER` | `mock` | `paymob` (backend rejects `mock` in prod) |
| `STORAGE_PROVIDER` | `local` | `s3` or `r2` |
| `MAIL_TRANSPORT` | `log` | `smtp` |
| `BACKUP_ENCRYPTION_KEY` | (unset) | Required for encrypted backups |

### Mandatory secrets in production

These must be set and kept secret:

```env
SESSION_SECRET=<64-char-random-hex>     # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DB_PASSWORD=<strong-unique-password>
MYSQL_ROOT_PASSWORD=<strong-unique-password>
PAYMOB_API_KEY=...
PAYMOB_SECRET=...
PAYMOB_HMAC_SECRET=...
PAYMOB_PUBLIC_KEY=...
BACKUP_ENCRYPTION_KEY=<64-char-hex>
```

### CORS Configuration

Set `CORS_ORIGINS` to include all domains that access the API:

```env
CORS_ORIGINS=https://courtzon.com,https://www.courtzon.com,https://admin.courtzon.com
```

## Building Images

```bash
# From the project root
docker compose build backend frontend
```

This produces:

- `courtzon-backend` — Node.js 22 Alpine, compiled TypeScript
- `courtzon-frontend` — Nginx 1.27 Alpine serving built SPA

> **Important:** On Windows, Docker builds can hang. Run them as a background task with sufficient timeout. On Linux VPS, builds are fast and reliable.

### Build arguments

The frontend build accepts `VITE_PAYMOB_PUBLIC_KEY` as a build argument (set in `docker-compose.yml`):

```yaml
args:
  VITE_PAYMOB_PUBLIC_KEY: ${VITE_PAYMOB_PUBLIC_KEY:-}
```

## Database Setup

### Option A: Docker MySQL (same host)

Database setup happens automatically via `docker-entrypoint.sh` on first run. The MySQL container initializes the database specified by `MYSQL_DATABASE`.

### Option B: Managed MySQL (RDS, CloudSQL, etc.)

1. Create the database:
   ```sql
   CREATE DATABASE courtzon_v3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Create application users with least privilege:
   ```bash
   mysql -h <host> -P <port> -u admin -p < database/scripts/setup-db-users.sql
   ```

3. Set strong passwords:
   ```sql
   ALTER USER 'courtzon_app'@'%' IDENTIFIED BY '<strong-password>';
   ALTER USER 'courtzon_migrator'@'%' IDENTIFIED BY '<strong-password>';
   ALTER USER 'courtzon_backup'@'%' IDENTIFIED BY '<strong-password>';
   ALTER USER 'courtzon_readonly'@'%' IDENTIFIED BY '<strong-password>';
   FLUSH PRIVILEGES;
   ```

### Running Migrations

```bash
# After the stack is running
docker compose exec backend node scripts/migrate.js

# Full reset (first deploy only — destroys data)
docker compose exec backend node scripts/migrate.js --fresh --seed
```

Migrations are **manual** — they never run on container startup. This prevents accidental schema changes during restarts.

## SSL/TLS Configuration

### Via Coolify Proxy (recommended)

Coolify's built-in proxy handles SSL automatically via Let's Encrypt. See the [Coolify guide](coolify.md).

### Via Nginx (standalone VPS)

If not using Coolify, configure a reverse proxy with Certbot:

```bash
# Install Nginx and Certbot
apt install nginx certbot python3-certbot-nginx

# Configure the proxy — example at deployment/nginx/courtzon.conf
nano /etc/nginx/sites-available/courtzon

# Obtain certificates
certbot --nginx -d courtzon.com -d api.courtzon.com

# Enable the site
ln -s /etc/nginx/sites-available/courtzon /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Backend HTTPS enforcement

In production, the backend redirects HTTP to HTTPS automatically when `x-forwarded-proto` is present (requires a reverse proxy that sets this header). This is enabled by the `trustProxy: true` setting in Fastify.

## Health Checks and Monitoring

### Built-in health endpoints

| Endpoint | Purpose | Expected status code |
|---|---|---|
| `GET /health/live` | Liveness probe | 200 |
| `GET /health/ready` | Readiness probe | 200 (OK) / 503 (down) |
| `GET /health` | Aggregate status | 200 / 503 |
| `GET /health/database` | DB connectivity | 200 / 503 |
| `GET /health/redis` | Redis connectivity | 200 / 503 |
| `GET /health/storage` | Storage backend | 200 / 503 |
| `GET /metrics` | Prometheus metrics | 200 (requires `METRICS_TOKEN`) |

### Docker healthchecks

Both backend and frontend containers have built-in healthchecks defined in their Dockerfiles and `docker-compose.yml`.

### Prometheus + Grafana

A monitoring stack is available via `docker-compose.monitoring.yml`:

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

This starts Grafana (port 3001) pre-configured with dashboards for:

- Node.js process metrics (event loop, memory, GC)
- HTTP request rate, latency, errors
- Redis cache hit rate
- MySQL query performance
- BullMQ queue depth

### Uptime monitoring

Configure external monitoring (UptimeRobot, BetterStack, or similar) to hit:

- `https://api.courtzon.com/health/live` every 1 minute
- `https://courtzon.com/` every 5 minutes (ensures the SPA is serving)

## Backup Configuration

### Automated Daily Backups

The cron script at `scripts/backup-cron.sh` is designed to run daily (e.g., at 1 AM):

```bash
# Add to crontab
0 1 * * * /opt/courtzon/scripts/backup-cron.sh >> /var/log/courtzon-backup.log 2>&1
```

What it does:
1. Creates a `mysqldump` with `--single-transaction` (no locking)
2. Compresses with gzip
3. Syncs `backend/uploads/` to S3/R2
4. Cleans up backups older than 30 days

### Encryption

Set `BACKUP_ENCRYPTION_KEY` to AES-256 encrypt backups. Generate the key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Manual Backup

```bash
docker compose exec backend node scripts/backup.js
# or via the shell script:
./scripts/backup.sh
```

### Backup Retention

- **Local:** 30 days (configurable via `BACKUP_RETENTION_DAYS`)
- **Remote (S3):** Configure lifecycle rules in your S3 provider

See `docs/database/backup_recovery.md` for detailed backup and recovery procedures.

## Scaling Considerations

### Vertical Scaling

- **Backend:** Stateless — scale by increasing container resources or adding replicas behind a load balancer
- **Frontend:** Static files served by Nginx — scales trivially
- **MySQL:** Increase CPU/RAM for the DB container; consider read replicas for reporting
- **Redis:** Increase `maxmemory` in `redis-server` config; ensure `noeviction` policy

### Horizontal Scaling

The backend is stateless (sessions stored in Redis, not memory). To run multiple backend instances:

1. Add a reverse proxy / load balancer (Nginx, Traefik, Caddy)
2. Ensure `SESSION_SECRET` is identical across all instances
3. Redis and MySQL remain the single source of truth

### Queue Workers

BullMQ workers run in the same process by default. For high-throughput deployments, run dedicated worker processes:

```bash
# In the backend container or service
node dist/workers/booking-expiry.js
node dist/workers/settlement.js
```

## Rollback Procedure

### Code Rollback

```bash
# 1. Revert to the previous Docker image
docker compose stop backend frontend
docker compose rm backend frontend

# 2. Tag and run the previous image
docker tag courtzon-backend:previous courtzon-backend:latest
docker tag courtzon-frontend:previous courtzon-frontend:latest
docker compose up -d backend frontend
```

### Database Rollback

```bash
# 1. Restore from the last known good backup
./scripts/restore.sh backups/courtzon_2026_06_23_010000.sql.gz

# 2. Restart the stack
docker compose restart backend
```

### Migration Rollback

```bash
# Roll back the last migration
./scripts/migrate.sh --rollback 042_my_migration.sql
```

### Zero-downtime deployment approach

For production, use a blue-green deployment strategy:

1. Build new images with a different tag
2. Start new containers alongside existing ones
3. Switch the reverse proxy when the new stack is healthy
4. Tear down the old containers

## Security Checklist

Before going live:

- [ ] `SESSION_SECRET` is a strong random string (32+ chars)
- [ ] `JWT_SECRET` is set (or falls back to `SESSION_SECRET`)
- [ ] `ENABLE_API_DOCS` is `false`
- [ ] `RELAX_RATE_LIMIT` is not set
- [ ] `PAYMENT_GATEWAY_PROVIDER` is NOT `mock`
- [ ] `PAYMOB_SANDBOX` is `false`
- [ ] Database users use strong passwords and SSL (`REQUIRE SSL`)
- [ ] CORS origins are restricted to known domains
- [ ] HTTPS is enforced (Coolify proxy or Nginx)
- [ ] CSP headers are configured in Nginx (`frontend/nginx.conf`)
- [ ] Backups are encrypted and stored off-server
- [ ] Monitoring alerts are configured
- [ ] Rate limiting is active (100 req/min per IP default)
- [ ] Brute force protection is enabled
- [ ] Audit logging is active
