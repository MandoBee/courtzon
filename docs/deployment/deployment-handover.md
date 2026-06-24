# CourtZon V3 — Deployment Handover Package

**Version:** V3 (2026-06-24)
**Status:** Certified for Release
**Target Platform:** Coolify (Docker Compose)

---

## 1. Final Repository Tree

```
CourtZon-V3/
├── .env                            # Local dev environment (not deployed)
├── .env.example
├── docker-compose.yml              # ⭐ Primary deployment manifest
├── AGENTS.md                       # Agent automation rules
├── README.md
├── opencode.json
│
├── backend/
│   ├── Dockerfile                  # ⭐ Backend image (Node 22 Alpine)
│   ├── docker-entrypoint.sh        # ⭐ Startup script (waits for MySQL + Redis)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app.ts                  # CORS, Helmet, routes registration
│   │   ├── server.ts               # Fastify entry point
│   │   ├── modules/                # 37 route modules
│   │   ├── infrastructure/         # Backup service, startup validator
│   │   └── shared/                 # Auth middleware, password utils
│   └── scripts/
│       ├── backup.js               # ⭐ Node.js backup (gzip + VIRTUAL fix)
│       ├── backup.sh               # ⭐ Shell backup (sed filter)
│       ├── restore.js              # ⭐ Node.js restore (encrypted support)
│       ├── migrate.js              # Schema migration runner
│       ├── seed.js                 # Seed data runner
│       ├── setup-db-users.sql      # ⭐ Database user provisioning
│       ├── sync-ui-registry.js     # UI permission registry sync
│       ├── sync-role-permissions.mjs
│       └── emergency-repair.js
│
├── frontend/
│   ├── Dockerfile                  # ⭐ Frontend image (Nginx 1.27 Alpine)
│   ├── nginx.conf                  # ⭐ Nginx config (CSP, proxy, security headers)
│   ├── security-headers.conf       # ⭐ Security headers include file
│   ├── package.json
│   ├── vite.config.ts
│   └── src/                        # React SPA source
│
├── database/
│   ├── baseline/
│   │   └── 001_courtzon_v3.sql     # ⭐ Authoritative schema (163 tables)
│   ├── migrations/                 # Future migration files go here
│   └── seeds/
│       └── 001_baseline.sql        # ⭐ Reference data seed
│
├── scripts/
│   ├── backup.sh                   # ⭐ Production backup (bash)
│   ├── backup-cron.sh              # Cron wrapper for backup
│   ├── restore.sh                  # ⭐ Production restore (bash)
│   ├── migrate.sh                  # Migration helper
│   └── seed.sh                     # Seed helper
│
├── docs/
│   ├── deployment/
│   │   ├── coolify.md              # Coolify-specific setup guide
│   │   ├── production.md           # Production deployment guide
│   │   └── environment_matrix.md   # All 46 environment variables
│   ├── security/
│   │   └── security_audit.md       # Comprehensive security audit
│   ├── validation/                 # Release validation audit (10 phases)
│   ├── database/                   # Database guides
│   ├── troubleshooting.md
│   ├── getting_started.md
│   └── local_development.md
│
├── deployment/                     # Deployment configuration templates
├── archive/                        # Archived historical files (not deployed)
└── backups/                        # Local backup storage directory
```

⭐ = Deployment-critical file

---

## 2. Docker Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      Docker Network: courtzon                      │
│                                                                    │
│  ┌──────────────────┐       ┌──────────────────┐                 │
│  │     MySQL 8.0    │       │   Redis 7 Alpine  │                 │
│  │   courtzon-mysql │       │  courtzon-redis   │                 │
│  │   Port: 3307→3306│       │   Port: 6379→6379 │                 │
│  │   Volume: mysql_ │       │   Volume: redis_  │                 │
│  │          data     │       │          data     │                 │
│  │   Health: mysql-  │       │   Health: redis-  │                 │
│  │   admin ping      │       │   cli ping        │                 │
│  └────────┬─────────┘       └────────┬──────────┘                 │
│           │                          │                             │
│           └──────────┬───────────────┘                             │
│                      │                                             │
│           ┌──────────▼──────────┐                                  │
│           │   Backend (Fastify) │                                  │
│           │   courtzon-backend  │                                  │
│           │   Port: 3000→3000   │                                  │
│           │   Volume: uploads/  │                                  │
│           │          backups/   │                                  │
│           │   User: appuser     │                                  │
│           │   Entry: tini       │                                  │
│           │   Health: GET       │                                  │
│           │   /health/live      │                                  │
│           └──────────┬──────────┘                                  │
│                      │                                             │
│           ┌──────────▼──────────┐                                  │
│           │ Frontend (Nginx)    │                                  │
│           │ courtzon-frontend   │                                  │
│           │ Port: 5173→80       │                                  │
│           │ User: appuser       │                                  │
│           │ Health: curl -f /   │                                  │
│           │                     │                                  │
│           │ Proxy pass:         │                                  │
│           │  /api/* → backend   │                                  │
│           │  /auth/* → backend  │                                  │
│           │  /admin/* → backend │                                  │
│           │  /uploads/* → backend│                                │
│           │  / → index.html     │                                  │
│           └─────────────────────┘                                  │
│                                                                    │
│  Healthcheck order: MySQL → Redis → Backend → Frontend             │
│  depends_on with condition: service_healthy at each step           │
└──────────────────────────────────────────────────────────────────┘
```

### Named Volumes
| Volume | Mount | Contents |
|--------|-------|----------|
| `mysql_data` | `/var/lib/mysql` | InnoDB tablespaces, binary logs |
| `redis_data` | `/data` | AOF append-only file |
| `backend_backups` | `/app/backups` | Database dump files |
| `./backend/uploads` (bind) | `/app/uploads` | User-uploaded files |

---

## 3. Coolify Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Coolify Server                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Coolify Proxy (Traefik/Caddy)                │   │
│  │         Auto SSL via Let's Encrypt                        │   │
│  └──────┬───────────────┬───────────────┬───────────────────┘   │
│         │               │               │                        │
│  ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────────┐       │
│  │  Frontend   │ │  Backend    │ │  S3/R2 External     │       │
│  │  Nginx :80  │ │  Fastify    │ │  (Uploads CDN)      │       │
│  │             │ │  :3000      │ │                     │       │
│  │  Domain:    │ │  Domain:    │ │  Domain:            │       │
│  │  courtzon   │ │  api.court  │ │  uploads.courtzon   │       │
│  │  .cloud     │ │  zon.cloud  │ │  .cloud             │       │
│  │  www.court  │ │             │ │                     │       │
│  │  zon.cloud  │ │             │ │                     │       │
│  └──────┬──────┘ └──────┬──────┘ └─────────────────────┘       │
│         │               │                                        │
│         │        ┌──────▼──────┐ ┌──────────────────┐          │
│         │        │  MySQL 8.0  │ │  Redis 7 Alpine  │          │
│         │        │  courtzon-  │ │  courtzon-redis  │          │
│         │        │  db :3306   │ │  :6379           │          │
│         │        └─────────────┘ └──────────────────┘          │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐    │
│  │              Coolify Managemennt Dashboard               │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │    │
│  │  │Backups   │ │Logs      │ │Env Vars  │ │Deploy      │ │    │
│  │  │Daily 1AM │ │Real-time │ │Per-svc   │ │Button      │ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Coolify Services (4 total)

| # | Service Name | Type | Image/Build | Internal Port | Public Port | Domain |
|---|---|---|---|---|---|---|
| 1 | `courtzon-db` | Database | `mysql:8.0` | 3306 | — | — |
| 2 | `courtzon-redis` | Database | `redis:7-alpine` | 6379 | — | — |
| 3 | `courtzon-backend` | App (Dockerfile) | `backend/Dockerfile` | 3000 | 3000 | `api.courtzon.cloud` |
| 4 | `courtzon-frontend` | App (Dockerfile) | `frontend/Dockerfile` | 80 | 80 | `courtzon.cloud`, `www.courtzon.cloud` |

### Domain Map

| Domain | Service | SSL | Notes |
|--------|---------|-----|-------|
| `courtzon.cloud` | Frontend | Auto (Let's Encrypt) | Main app |
| `www.courtzon.cloud` | Frontend | Auto | Redirect to apex |
| `api.courtzon.cloud` | Backend | Auto | API server |
| `admin.courtzon.cloud` | Frontend (route) | Auto | Admin SPA (same build, route-based) |
| `uploads.courtzon.cloud` | S3/R2 CDN | Provider | External file storage |

---

## 4. Required Coolify Services

### Service 1: MySQL (`courtzon-db`)

**Type:** Database (Docker Image)

| Setting | Value |
|----------|-------|
| Image | `mysql:8.0` |
| Internal Port | `3306` |
| Persistent Volume | `/var/lib/mysql` |
| Restart Policy | Always |

**Environment:**
```env
MYSQL_ROOT_PASSWORD=<strong-root-password>
MYSQL_DATABASE=courtzon_v3
```

**Command Override:**
```
--default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

**Health Check:**
```json
["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
```
Interval: 10s, Timeout: 5s, Retries: 10, Start Period: 30s

### Service 2: Redis (`courtzon-redis`)

**Type:** Database (Docker Image)

| Setting | Value |
|----------|-------|
| Image | `redis:7-alpine` |
| Internal Port | `6379` |
| Persistent Volume | `/data` |
| Restart Policy | Always |

**Command Override:**
```bash
redis-server --maxmemory 512mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec
```

**Health Check:**
```json
["CMD-SHELL", "redis-cli ping | grep -q PONG"]
```
Interval: 10s, Timeout: 5s, Retries: 3

### Service 3: Backend (`courtzon-backend`)

**Type:** Application (Dockerfile)

| Setting | Value |
|----------|-------|
| Build Context | Repository root (`/`) |
| Dockerfile Path | `backend/Dockerfile` |
| Internal Port | `3000` |
| Public Port | `3000` |
| Domain | `api.courtzon.cloud` |
| Persistent Volume | `/app/uploads` |
| Restart Policy | Always |

**Health Check:** `GET /health/live` (expects 200 with `{"status":"ok"}`)

### Service 4: Frontend (`courtzon-frontend`)

**Type:** Application (Dockerfile)

| Setting | Value |
|----------|-------|
| Build Context | `./frontend` |
| Dockerfile Path | `frontend/Dockerfile` |
| Internal Port | `80` |
| Public Port | `80` |
| Domain | `courtzon.cloud`, `www.courtzon.cloud` |
| Build Args | `VITE_PAYMOB_PUBLIC_KEY` |
| Restart Policy | Always |

**Health Check:** `GET /` (expects 200)

---

## 5. Required Environment Variables

### Production Secrets (REQUIRED — generate new values)

```env
# Generate with: openssl rand -hex 32
SESSION_SECRET=<64-char-random-hex>
BACKUP_ENCRYPTION_KEY=<64-char-random-hex>

# Generate with: openssl rand -base64 32
JWT_SECRET=<random-string>

# Database
MYSQL_ROOT_PASSWORD=<strong-unique-password>
DB_PASSWORD=<strong-unique-password>
DB_USER=courtzon_app
```

### Backend Environment (place in Coolify env vars for `courtzon-backend`)

```env
# Runtime
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
CORS_ORIGINS=https://courtzon.cloud,https://www.courtzon.cloud,https://admin.courtzon.cloud

# Security
SESSION_SECRET=<64-char-random-hex>
JWT_SECRET=<random-string>
ENABLE_API_DOCS=false

# Storage (S3-compatible — R2, Wasabi, DigitalOcean Spaces, etc.)
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<your-endpoint>
S3_BUCKET=courtzon-uploads
S3_ACCESS_KEY=<your-access-key>
S3_SECRET_KEY=<your-secret-key>
S3_REGION=auto
S3_PUBLIC_URL=https://uploads.courtzon.cloud

# Paymob (live payments)
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_API_KEY=<your-api-key>
PAYMOB_SECRET=<your-secret>
PAYMOB_PUBLIC_KEY=<your-public-key>
PAYMOB_MERCHANT_ID=<your-merchant-id>
PAYMOB_HMAC_SECRET=<your-hmac-secret>
PAYMOB_SANDBOX=false

# Email (SMTP)
MAIL_TRANSPORT=smtp
MAIL_HOST=<smtp-host>
MAIL_PORT=587
MAIL_USER=<smtp-user>
MAIL_PASS=<smtp-password>
MAIL_FROM=CourtZon <noreply@courtzon.cloud>

# Monitoring
METRICS_TOKEN=<random-token>
```

### Frontend Build Arguments (place in Coolify build args for `courtzon-frontend`)

```env
VITE_PAYMOB_PUBLIC_KEY=<your-public-key>
```

---

## 6. Deployment Order

Deploy services in this exact sequence:

| Step | Service | Wait For | Notes |
|------|---------|----------|-------|
| 1 | `courtzon-db` (MySQL) | — | Must be healthy before step 3 |
| 2 | `courtzon-redis` (Redis) | — | Must be healthy before step 3 |
| 3 | `courtzon-backend` | MySQL healthy + Redis healthy | Run baseline import + seed below |
| 4 | `courtzon-frontend` | Backend healthy | Last, serves the SPA |

**In Coolify:** Create all 4 services, then click "Deploy" on MySQL and Redis first. Once both are healthy, deploy Backend. Once Backend is healthy, deploy Frontend.

---

## 7. First-Time Deployment Steps

### Step 1: Clone Repository
```bash
git clone <repo-url> courtzon-v3
cd courtzon-v3
```

### Step 2: Set Up Coolify Services
Create the 4 services in Coolify as described in Section 4. Set ALL environment variables from Section 5 before building.

### Step 3: Deploy MySQL + Redis
Deploy both database services and wait for healthy status.

### Step 4: Import Baseline Schema + Seed Data
```bash
# Via Coolify terminal (MySQL service), or from any host with mysql client:

# Import schema
mysql -h <mysql-host> -P 3306 -u root -p"$MYSQL_ROOT_PASSWORD" courtzon_v3 < database/baseline/001_courtzon_v3.sql

# Import seed data
mysql -h <mysql-host> -P 3306 -u root -p"$MYSQL_ROOT_PASSWORD" courtzon_v3 < database/seeds/001_baseline.sql
```

### Step 5: Create Database Users
```bash
mysql -h <mysql-host> -P 3306 -u root -p"$MYSQL_ROOT_PASSWORD" < backend/scripts/setup-db-users.sql
```

Then set actual passwords:
```sql
ALTER USER 'courtzon_app'@'%' IDENTIFIED BY '<your-db-password>';
ALTER USER 'courtzon_migration'@'%' IDENTIFIED BY '<your-migration-password>';
ALTER USER 'courtzon_backup'@'%' IDENTIFIED BY '<your-backup-password>';
ALTER USER 'courtzon_readonly'@'%' IDENTIFIED BY '<your-readonly-password>';
FLUSH PRIVILEGES;
```

### Step 6: Deploy Backend
Deploy the backend service in Coolify. Wait for healthy status.

### Step 7: Deploy Frontend
Deploy the frontend service in Coolify. Wait for healthy status.

### Step 8: Verify Deployment
```bash
# Health endpoints
curl https://api.courtzon.cloud/health
# → {"status":"ok","service":"courtzon-v2-backend",...}

curl https://api.courtzon.cloud/health/database
# → {"status":"ok"}

curl https://api.courtzon.cloud/health/redis
# → {"status":"ok"}

# Frontend serves
curl https://courtzon.cloud/
# → 200 OK (HTML with "CourtZon")

# Login test
curl -X POST https://api.courtzon.cloud/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"01012637733","countryCode":"+20","password":"123456"}'
# → 200 OK with user object
```

### Step 9: Configure SSL
In Coolify, ensure "Force HTTPS" is enabled for both frontend and backend domains. Coolify's built-in proxy will automatically obtain Let's Encrypt certificates.

### Step 10: Configure Backup Schedule
Set up daily backups in Coolify:
- **Coolify's built-in backup:** Schedule daily at 01:00 for the MySQL service
- **Application-level backup:** Add a Coolify cron job to run `node scripts/backup.js` inside the backend container daily

---

## 8. Upgrade Deployment Steps

### Standard Update (code changes, no schema changes)
```bash
# 1. Pull latest code
git pull origin master

# 2. In Coolify, click "Redeploy" on:
#    - courtzon-backend (if backend changed)
#    - courtzon-frontend (if frontend changed)

# 3. Verify health
curl https://api.courtzon.cloud/health
curl https://courtzon.cloud/
```

### Update with Schema Migration
```bash
# 1. Pull latest code
git pull origin master

# 2. Run pending migrations (via Coolify backend terminal)
docker compose exec backend node scripts/migrate.js

# 3. If first migration, also run seed
docker compose exec backend node scripts/migrate.js --fresh --seed

# 4. Redeploy backend
# In Coolify: click "Redeploy" on courtzon-backend

# 5. Redeploy frontend (if applicable)
# In Coolify: click "Redeploy" on courtzon-frontend

# 6. Verify
curl https://api.courtzon.cloud/health
```

### Update with New Permissions
```bash
# After deploying code that adds new UI permissions:
docker compose exec backend node scripts/sync-ui-registry.js
docker compose exec backend node scripts/sync-role-permissions.mjs
```

---

## 9. Rollback Procedure

### Option A: Coolify Rollback (Preferred)
1. In Coolify, navigate to the service that needs rollback
2. Click "Deployments" → select the previous successful deployment
3. Click "Rollback to this deployment"
4. Verify health after rollback

### Option B: Manual Rollback
```bash
# 1. Identify the last known-good git commit
git log --oneline -5

# 2. Checkout the known-good commit
git checkout <commit-hash>

# 3. Redeploy affected services in Coolify

# 4. Verify
curl https://api.courtzon.cloud/health
```

### Option C: Database Rollback (Emergency)
```bash
# Restore from the last backup BEFORE the problematic deployment
./scripts/restore.sh --file backups/courtzon_courtzon_v3_<timestamp>.sql.gz --db courtzon_v3

# Redeploy the last known-good backend code
```

**Important:** The restore script automatically creates a pre-restore backup of the current database before overwriting, so you can recover if needed.

---

## 10. Backup Procedure

### Automatic (Recommended)
Configure Coolify's built-in database backup:
- Service: `courtzon-db`
- Schedule: Daily at 01:00 UTC
- Retention: 30 backups
- Format: SQL dump (compressed)

Plus a Coolify cron job for application-level backup:
- Container: `courtzon-backend`
- Schedule: Daily at 02:00 UTC
- Command: `node scripts/backup.js`

### Manual Backup
```bash
# Via Coolify backend terminal, or from any host:

# Full backup with compression
./scripts/backup.sh

# With specific options
./scripts/backup.sh --db courtzon_v3 --output /path/to/backups --compress

# Node.js backup (includes VIRTUAL column fix)
node backend/scripts/backup.js
```

**Backup contents:**
- All 163 tables (schema + data)
- 211 foreign keys
- 4 triggers
- 2 events
- Stored routines

**Backup file naming:** `courtzon_courtzon_v3_YYYYMMDD_HHMMSS.sql.gz`

**Retention:** 30 days (auto-rotation). Older backups are automatically deleted.

**S3 off-site sync:** Enable by setting `BACKUP_S3_ENABLED=true` and configuring S3 environment variables. Uploads backups to S3/R2 automatically.

---

## 11. Restore Procedure

### Restore from Backup
```bash
# Interactive restore (prompts for confirmation)
./scripts/restore.sh --file backups/courtzon_courtzon_v3_20260624_010000.sql.gz

# Specify target database
./scripts/restore.sh --file backups/courtzon_courtzon_v3_20260624_010000.sql.gz --db courtzon_v3

# Restore from Coolify-managed backup
# Download the backup from Coolify UI first, then:
./scripts/restore.sh --file /path/to/downloaded/backup.sql.gz
```

### What Happens During Restore
1. Script verifies the backup file exists and is readable
2. Peeks the file header to verify integrity
3. Prompts you to type `RESTORE` (all caps) to confirm
4. **Creates a pre-restore backup** of the current database (saved to `backups/pre_restore_<db>_<timestamp>.sql.gz`)
5. Drops all tables and re-creates from the backup
6. Verifies the restore completed successfully

### Restore from Encrypted Backup
```bash
# Set the encryption key
export BACKUP_ENCRYPTION_KEY=<your-64-char-hex-key>

# Restore via Node.js script
node backend/scripts/restore.js backups/courtzon_20260624.sql.gz.enc
```

### Verify Restore
```bash
# Check table count
mysql -u root -p -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='courtzon_v3'"
# Expected: 163

# Verify users
mysql -u root -p -e "SELECT id, email, full_name FROM courtzon_v3.users"
# Expected: 3 users

# Test login
curl -X POST https://api.courtzon.cloud/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"01012637733","countryCode":"+20","password":"123456"}'
# Expected: 200 OK
```

---

## 12. Production Checklist

### Pre-Launch Security (REQUIRED)

- [ ] `SESSION_SECRET` set to 64-char random hex string
- [ ] `JWT_SECRET` set to random string (different from SESSION_SECRET)
- [ ] `ENABLE_API_DOCS` = `false`
- [ ] `RELAX_RATE_LIMIT` is NOT set
- [ ] `NODE_ENV` = `production`
- [ ] `PAYMENT_GATEWAY_PROVIDER` ≠ `mock`
- [ ] `PAYMOB_SANDBOX` = `false`
- [ ] All database user passwords changed from `CHANGE_ME_*` defaults
- [ ] `BACKUP_ENCRYPTION_KEY` set to 64-char random hex
- [ ] CORS origins restricted to production domains only
- [ ] SSL enforced for all domains
- [ ] `STORAGE_PROVIDER` = `s3` (not `local`)

### Infrastructure

- [ ] All 4 services deployed and healthy in Coolify
- [ ] MySQL volume persisted and backed up
- [ ] Redis AOF persistence enabled (already in command override)
- [ ] Backend uploads volume persisted
- [ ] SSL certificates active for all 4 domains
- [ ] DNS propagated for all domains
- [ ] Monitoring endpoint accessible with `METRICS_TOKEN`

### Data Integrity

- [ ] Baseline schema imported (163 tables)
- [ ] Seed data imported (3 users, 9 roles, 555 permissions)
- [ ] Database users created with strong passwords
- [ ] Super admin can log in
- [ ] All admin endpoints return 200

### Backup & Recovery

- [ ] Daily backup schedule configured in Coolify
- [ ] Application-level backup cron job active
- [ ] Backup retention set to 30 days
- [ ] Backup restore tested successfully
- [ ] S3 off-site backup configured (optional but recommended)
- [ ] Backup encryption key stored securely (password manager / vault)

### Operational

- [ ] Health endpoints responding:
  - [ ] `GET /health` → 200
  - [ ] `GET /health/live` → 200
  - [ ] `GET /health/ready` → 200
  - [ ] `GET /health/database` → 200
  - [ ] `GET /health/redis` → 200
- [ ] Frontend serves at all configured domains
- [ ] Login flow works end-to-end
- [ ] File uploads work (test with avatar upload)
- [ ] Payment gateway webhooks configured (Paymob)
- [ ] Email delivery functional (test password reset)
- [ ] Rate limiting active (100 req/min per IP)
- [ ] Brute-force protection active (5 attempts → 30 min lockout)

### Documentation

- [ ] All environment variables documented in password manager
- [ ] Deployment handover package delivered
- [ ] Rollback procedure documented
- [ ] Emergency contacts listed
- [ ] API documentation location known (`GET /docs` when enabled)

---

## Quick Reference Card

```bash
# ═══════════════════════════════════════════════
#  CourtZon V3 — Operations Quick Reference
# ═══════════════════════════════════════════════

# Health Check
curl https://api.courtzon.cloud/health

# Database Backup (manual)
./scripts/backup.sh --db courtzon_v3

# Database Restore (from backup)
./scripts/restore.sh --file backups/courtzon_courtzon_v3_TIMESTAMP.sql.gz

# Run Migrations
docker compose exec backend node scripts/migrate.js

# Sync UI Permissions
docker compose exec backend node scripts/sync-ui-registry.js

# View Logs
docker compose logs backend --tail 100 -f
docker compose logs frontend --tail 100 -f

# Restart a Service
docker compose restart backend
docker compose restart frontend

# Rebuild After Code Change
docker compose build backend && docker compose up -d backend
docker compose build frontend && docker compose up -d frontend

# Full Stack Restart
docker compose down && docker compose up -d

# ⚠️  DESTRUCTIVE — destroys all volumes
# docker compose down -v
```

---

**Document Version:** 1.0
**Generated:** 2026-06-24
**Validation Status:** All 10 phases PASSED — Certified for Release
**Next Review:** After first production deployment
