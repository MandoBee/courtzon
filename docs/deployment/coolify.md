# Coolify Deployment Guide

This guide explains how to deploy CourtZon-V3 on **Coolify** using 4 services: MySQL, Redis, Backend, and Frontend.

## Service Architecture

```
┌───────────────────────────────────────────────────────┐
│                    Coolify Server                     │
│                                                       │
│  ┌──────────┐    ┌──────────┐    ┌─────────────────┐ │
│  │  MySQL   │◄───│ Backend  │◄───│    Frontend     │ │
│  │   8.0    │    │ Node.js  │    │  Nginx + React  │ │
│  └──────────┘    │  :3000   │    │     :80         │ │
│       ▲          └──────────┘    └─────────────────┘ │
│       │                │                              │
│  ┌──────────┐         │                              │
│  │  Redis   │◄────────┘                              │
│  │    7     │                                        │
│  └──────────┘                                        │
│                                                       │
│  Domains:  courtzon.cloud  api.courtzon.cloud         │
└───────────────────────────────────────────────────────┘
```

## Setting Up Each Service in Coolify

### Service 1: MySQL (Database)

**Type:** Database service (Docker image)

| Setting | Value |
|---|---|
| **Image** | `mysql:8.0` |
| **Name** | `courtzon-db` |
| **Port** | `3306` (internal) |
| **Persistent Volume** | `/var/lib/mysql` |

**Environment variables:**

```env
MYSQL_ROOT_PASSWORD=<your-root-password>
MYSQL_DATABASE=courtzon_v3
```

**Health check:**

```json
{
  "test": ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"],
  "interval": 10,
  "timeout": 5,
  "retries": 10,
  "start_period": 30
}
```

**Additional command:**

```
--default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

### Service 2: Redis (Cache & Queue)

**Type:** Database service (Docker image)

| Setting | Value |
|---|---|
| **Image** | `redis:7-alpine` |
| **Name** | `courtzon-redis` |
| **Port** | `6379` (internal) |
| **Persistent Volume** | `/data` |

**Start command:**

```bash
redis-server --maxmemory 512mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec
```

**Health check:**

```json
{
  "test": ["CMD-SHELL", "redis-cli ping | grep -q PONG"],
  "interval": 10,
  "timeout": 5,
  "retries": 3
}
```

### Service 3: Backend (Fastify API)

**Type:** Docker service with public port

| Setting | Value |
|---|---|
| **Build context** | Repository root `/` |
| **Dockerfile** | `backend/Dockerfile` |
| **Name** | `courtzon-backend` |
| **Port** | `3000` (HTTP) |
| **Domain** | `api.courtzon.cloud` |
| **Persistent Volume** | `./backend/uploads:/app/uploads` |

**Health check:**

```
GET /health/live
```

**Environment variables:**

```env
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Database
DB_HOST=courtzon-db
DB_PORT=3306
DB_NAME=courtzon_v3
DB_USER=courtzon_app
DB_PASSWORD=<your-db-password>

# Redis
REDIS_HOST=courtzon-redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# URLs
APP_URL=https://api.courtzon.cloud
WEBHOOK_BASE_URL=https://api.courtzon.cloud
CORS_ORIGINS=https://www.courtzon.cloud,https://courtzon.cloud,https://admin.courtzon.cloud

# Security
SESSION_SECRET=<64-char-random-hex>
ENABLE_API_DOCS=false

# Storage
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://your-r2-endpoint.com
S3_BUCKET=courtzon-uploads
S3_ACCESS_KEY=<your-s3-access-key>
S3_SECRET_KEY=<your-s3-secret-key>
S3_REGION=auto
S3_PUBLIC_URL=https://uploads.courtzon.cloud

# Paymob (live)
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_API_KEY=<your-api-key>
PAYMOB_SECRET=<your-secret>
PAYMOB_PUBLIC_KEY=<your-public-key>
PAYMOB_MERCHANT_ID=<your-merchant-id>
PAYMOB_HMAC_SECRET=<your-hmac-secret>
PAYMOB_SANDBOX=false

# Email
MAIL_TRANSPORT=smtp
MAIL_HOST=<smtp-host>
MAIL_PORT=587
MAIL_USER=<smtp-user>
MAIL_PASS=<smtp-password>
MAIL_FROM=CourtZon <noreply@courtzon.cloud>

# Metrics
METRICS_TOKEN=<your-metrics-token>

# Backup
BACKUP_ENCRYPTION_KEY=<64-char-hex>
```

### Service 4: Frontend (Nginx + React SPA)

**Type:** Docker service with public port

| Setting | Value |
|---|---|
| **Build context** | `./frontend` |
| **Dockerfile** | `frontend/Dockerfile` |
| **Name** | `courtzon-frontend` |
| **Port** | `80` (HTTP) |
| **Domain** | `courtzon.cloud`, `www.courtzon.cloud` |
| **Standalone** | Yes (no build pack) |

**Health check:**

```
GET / (expects 200)
```

**Environment variables (build-time via `VITE_`):**

```env
VITE_API_URL=https://api.courtzon.cloud
VITE_PAYMOB_PUBLIC_KEY=<your-public-key>
```

## Domain Configuration

| Domain | Service | Type |
|---|---|---|
| `courtzon.cloud` | Frontend | Main application |
| `www.courtzon.cloud` | Frontend | WWW redirect (optional) |
| `api.courtzon.cloud` | Backend | API server |
| `admin.courtzon.cloud` | Frontend (app route) | Admin panel (same SPA, route-based) |
| `uploads.courtzon.cloud` | S3/R2 | Uploaded files CDN (external) |

In Coolify:

1. Add each domain under the service's **Domains** section
2. Set the correct port (80 for frontend, 3000 for backend)
3. Coolify's proxy will automatically obtain Let's Encrypt SSL certificates

## SSL via Coolify Proxy

Coolify handles SSL automatically using Let's Encrypt through its built-in Traefik or Caddy proxy.

1. Ensure **Force HTTPS** is enabled for each service
2. No manual certificate management needed
3. The backend handles HTTP→HTTPS redirect via `x-forwarded-proto` header from the proxy

## Deployment Order

Deploy services in this order:

1. **MySQL** — database must be ready before the backend
2. **Redis** — cache must be ready before the backend
3. **Backend** — API must be healthy before the frontend
4. **Frontend** — last, serves the SPA

After deploying MySQL and Redis, use the backend's terminal to run initial setup:

```bash
# Run migrations
node scripts/migrate.js

# Run seed (first deploy only)
node scripts/migrate.js --seed
```

## Creating Database Users

After MySQL and backend are deployed, create the app users via the backend terminal:

```bash
mysql -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" < database/scripts/setup-db-users.sql
```

Then set the user passwords to match your `.env` values:

```sql
ALTER USER 'courtzon_app'@'%' IDENTIFIED BY '<your-db-password>';
ALTER USER 'courtzon_migrator'@'%' IDENTIFIED BY '<your-migrator-password>';
ALTER USER 'courtzon_backup'@'%' IDENTIFIED BY '<your-backup-password>';
ALTER USER 'courtzon_readonly'@'%' IDENTIFIED BY '<your-readonly-password>';
FLUSH PRIVILEGES;
```

## Persistent Volumes

Coolify can manage persistent storage. The following volumes are needed:

| Service | Mount Point | Contents |
|---|---|---|
| MySQL | `/var/lib/mysql` | InnoDB data files |
| Redis | `/data` | AOF persistence files |
| Backend | `/app/uploads` | User-uploaded files (local fallback) |
| Backend | `/app/backups` | Database backup files |

In Coolify, add these under **Storage** for each service.

## Coolify Backup Configuration

### Database Backups

Coolify can schedule database backups for the MySQL service. Configure:

- **Schedule:** Daily at 01:00
- **Retention:** 30 backups
- **Format:** SQL dump, compressed

### Application-level backups

The backend also runs its own backup mechanism. Set up a cron job via Coolify's scheduler or an external cron service:

```bash
# Run inside the backend container
node scripts/backup.js
```

Or via the shell script:

```bash
bash scripts/backup-cron.sh
```

### S3 Backup Sync

For off-server backups, configure S3 sync in the Coolify S3 storage integration or use the backend's built-in backup encryption + upload capability.

## Post-Deployment Verification

After all services are deployed:

```bash
# 1. Check health endpoints
curl https://api.courtzon.cloud/health/live
curl https://api.courtzon.cloud/health/ready

# 2. Verify frontend serves
curl https://courtzon.cloud/

# 3. Run the deployment verification script
# In the backend terminal:
node scripts/verify-deployment.js

# 4. Check logs
docker compose logs backend --tail 50
```

## Updating a Service

```bash
# In Coolify, trigger a " Redeploy" for the service.
# Coolify will:
#   1. Pull the latest code from the repository
#   2. Build a new Docker image
#   3. Start a new container
#   4. Perform a zero-downtime switch (if configured)
```

For manual update via terminal:

```bash
# Deploy through Coolify UI by clicking "Deploy" on the service
# This rebuilds and restarts automatically
```

## Troubleshooting Coolify Deployments

| Issue | Likely cause | Solution |
|---|---|---|
| Build fails | Missing build args (VITE_* env) | Add build args in Coolify UI |
| Backend can't reach MySQL | DB_HOST incorrect | Use Coolify internal service name `courtzon-db` |
| Frontend shows blank page | VITE_API_URL wrong | Rebuild with correct URL |
| SSL certificate error | Domain not propagated | Wait for DNS, force redeploy proxy |
| Container keeps restarting | Missing `SESSION_SECRET` | Add env var and redeploy |
| Migration fails | DB_USER lacks permissions | Run `setup-db-users.sql` as root |
| Memory limit exceeded | Redis `maxmemory` too high | Reduce to 256mb in start command |

See also the main [Troubleshooting Guide](../troubleshooting.md).
