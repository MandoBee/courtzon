# CourtZon V3.0.0 — Coolify Deployment Runbook

**Date:** 2026-06-25
**Target:** Coolify (self-hosted or cloud)
**Duration:** ~45 minutes (first deployment)
**Prerequisites:** Coolify server running, domains DNS propagated

---

## Before You Begin

### Required Values — Fill In Before Starting

Generate these and fill in placeholders throughout this runbook:

```bash
# Generate with: openssl rand -hex 32
SESSION_SECRET="________________"
BACKUP_ENCRYPTION_KEY="________________"

# Generate with: openssl rand -base64 32
JWT_SECRET="________________"

# Database passwords (create unique strong passwords)
MYSQL_ROOT_PASSWORD="________________"
DB_PASSWORD="________________"
MIGRATION_PASSWORD="________________"
BACKUP_PASSWORD="________________"
READONLY_PASSWORD="________________"

# Paymob live credentials
PAYMOB_API_KEY="________________"
PAYMOB_SECRET="________________"
PAYMOB_PUBLIC_KEY="________________"
PAYMOB_MERCHANT_ID="________________"
PAYMOB_HMAC_SECRET="________________"

# S3/R2 storage
S3_ENDPOINT="https://________________"
S3_BUCKET="________________"
S3_ACCESS_KEY="________________"
S3_SECRET_KEY="________________"
S3_PUBLIC_URL="https://uploads.courtzon.cloud"

# SMTP
MAIL_HOST="________________"
MAIL_PORT="587"
MAIL_USER="________________"
MAIL_PASS="________________"
MAIL_FROM="CourtZon <noreply@courtzon.cloud>"

# Metrics token
METRICS_TOKEN=$(openssl rand -hex 16)
```

### Prerequisites Checklist

- [ ] Coolify server installed and accessible
- [ ] Repository pushed to GitHub/GitLab (Coolify needs to clone it)
- [ ] Domains DNS A/AAAA records pointed to Coolify server IP:
  - `courtzon.cloud`
  - `www.courtzon.cloud`
  - `api.courtzon.cloud`
  - `admin.courtzon.cloud`
- [ ] S3-compatible bucket created for uploads (R2, Wasabi, DigitalOcean Spaces)
- [ ] Paymob live account activated
- [ ] SMTP credentials ready

---

## Step 1 — Create MySQL Service

### 1.1 Create Service
1. In Coolify, navigate to your project
2. Click **+ New Service**
3. Select **Database**
4. Choose **MySQL**

### 1.2 Configure

| Field | Value |
|-------|-------|
| Name | `courtzon-db` |
| Image | `mysql:8.0` |

### 1.3 Environment Variables

```
MYSQL_ROOT_PASSWORD=<YOUR_MYSQL_ROOT_PASSWORD>
MYSQL_DATABASE=courtzon_v3
```

### 1.4 Health Check

```json
{
  "test": ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"],
  "interval": 10,
  "timeout": 5,
  "retries": 10,
  "start_period": 30
}
```

### 1.5 Storage
Add persistent volume:
| Mount Path | Capacity |
|------------|----------|
| `/var/lib/mysql` | 20 GB |

### 1.6 Command (optional)
If Coolify supports command overrides, add:
```
--default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```

### 1.7 Deploy
Click **Deploy**. Wait for status **Healthy** before proceeding.

---

## Step 2 — Create Redis Service

### 2.1 Create Service
1. Click **+ New Service**
2. Select **Database**
3. Choose **Redis**

### 2.2 Configure

| Field | Value |
|-------|-------|
| Name | `courtzon-redis` |
| Image | `redis:7-alpine` |

### 2.3 Command Override

```
redis-server --maxmemory 512mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec
```

### 2.4 Health Check

```json
{
  "test": ["CMD-SHELL", "redis-cli ping | grep -q PONG"],
  "interval": 10,
  "timeout": 5,
  "retries": 3
}
```

### 2.5 Storage
Add persistent volume:
| Mount Path | Capacity |
|------------|----------|
| `/data` | 1 GB |

### 2.6 Deploy
Click **Deploy**. Wait for status **Healthy** before proceeding.

---

## Step 3 — Import Database

MySQL and Redis must both be **Healthy** before continuing.

### 3.1 Access MySQL Terminal
In Coolify, open the terminal for the `courtzon-db` service.

### 3.2 Download Schema File
From the terminal, download the baseline schema:
```bash
# Option A: copy-paste from a local file
# Open database/baseline/001_courtzon_v3.sql on your machine,
# copy the entire contents, and paste into the terminal.

# Option B: wget from a URL (if you've hosted the file)
wget https://raw.githubusercontent.com/<your-repo>/master/database/baseline/001_courtzon_v3.sql
```

### 3.3 Import Schema
```bash
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>" courtzon_v3 < 001_courtzon_v3.sql
```

**Expected:** 163 tables created. Verify:
```bash
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>" -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='courtzon_v3' AND TABLE_TYPE='BASE TABLE';"
# Output: 163
```

### 3.4 Import Seed Data
```bash
# Download and import seed data
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>" courtzon_v3 < 001_baseline.sql
```

**Expected:** Reference data loaded. Verify:
```bash
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>" -e "SELECT COUNT(*) FROM courtzon_v3.users; SELECT COUNT(*) FROM courtzon_v3.roles; SELECT COUNT(*) FROM courtzon_v3.permissions;"
# Output: 3, 9, 555
```

### 3.5 Create Database Users
```bash
# Paste the contents of backend/scripts/setup-db-users.sql
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>"

# Then set actual passwords:
SET PASSWORD FOR 'courtzon_app'@'%' = '<YOUR_DB_PASSWORD>';
SET PASSWORD FOR 'courtzon_migration'@'%' = '<YOUR_MIGRATION_PASSWORD>';
SET PASSWORD FOR 'courtzon_backup'@'%' = '<YOUR_BACKUP_PASSWORD>';
SET PASSWORD FOR 'courtzon_readonly'@'%' = '<YOUR_READONLY_PASSWORD>';
FLUSH PRIVILEGES;
EXIT;
```

### 3.6 Verify Users
```bash
mysql -u root -p"<YOUR_MYSQL_ROOT_PASSWORD>" -e "SELECT user, host FROM mysql.user WHERE user LIKE 'courtzon_%';"
```
**Expected:** 4 users (courtzon_app, courtzon_migration, courtzon_backup, courtzon_readonly).

---

## Step 4 — Create Backend Service

### 4.1 Create Service
1. Click **+ New Service**
2. Select **Application**
3. Choose **Dockerfile** as source type

### 4.2 Configure — Source

| Field | Value |
|-------|-------|
| Repository URL | `<your-github-repo-url>` |
| Branch | `master` |
| Build Pack | **None** (Dockerfile-based) |
| Dockerfile Path | `backend/Dockerfile` |
| Build Context | `/` (repository root) |

### 4.3 Configure — General

| Field | Value |
|-------|-------|
| Name | `courtzon-backend` |
| Ports | `3000:3000` |

### 4.4 Environment Variables

Copy-paste the entire block into Coolify's environment variable field:

```
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Database
DB_HOST=courtzon-db
DB_PORT=3306
DB_NAME=courtzon_v3
DB_USER=courtzon_app
DB_PASSWORD=<YOUR_DB_PASSWORD>

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
SESSION_SECRET=<YOUR_SESSION_SECRET>
JWT_SECRET=<YOUR_JWT_SECRET>
ENABLE_API_DOCS=false

# Storage (S3-compatible)
STORAGE_PROVIDER=s3
S3_ENDPOINT=<YOUR_S3_ENDPOINT>
S3_BUCKET=<YOUR_S3_BUCKET>
S3_ACCESS_KEY=<YOUR_S3_ACCESS_KEY>
S3_SECRET_KEY=<YOUR_S3_SECRET_KEY>
S3_REGION=auto
S3_PUBLIC_URL=<YOUR_S3_PUBLIC_URL>

# Paymob (live)
PAYMENT_GATEWAY_PROVIDER=paymob
PAYMOB_API_KEY=<YOUR_PAYMOB_API_KEY>
PAYMOB_SECRET=<YOUR_PAYMOB_SECRET>
PAYMOB_PUBLIC_KEY=<YOUR_PAYMOB_PUBLIC_KEY>
PAYMOB_MERCHANT_ID=<YOUR_PAYMOB_MERCHANT_ID>
PAYMOB_HMAC_SECRET=<YOUR_PAYMOB_HMAC_SECRET>
PAYMOB_SANDBOX=false

# Email (SMTP)
MAIL_TRANSPORT=smtp
MAIL_HOST=<YOUR_MAIL_HOST>
MAIL_PORT=<YOUR_MAIL_PORT>
MAIL_USER=<YOUR_MAIL_USER>
MAIL_PASS=<YOUR_MAIL_PASS>
MAIL_FROM=<YOUR_MAIL_FROM>

# Monitoring
METRICS_TOKEN=<YOUR_METRICS_TOKEN>

# Backup
BACKUP_ENCRYPTION_KEY=<YOUR_BACKUP_ENCRYPTION_KEY>
```

### 4.5 Health Check
In Coolify, set health check endpoint:
| Field | Value |
|-------|-------|
| Path | `/health/live` |
| Port | `3000` |
| Expected Status | `200` |
| Interval | `30s` |
| Timeout | `10s` |
| Start Period | `30s` |
| Retries | `5` |

### 4.6 Storage
Add persistent volume:
| Mount Path | Capacity |
|------------|----------|
| `/app/uploads` | 10 GB |
| `/app/backups` | 10 GB |

### 4.7 Deploy
Click **Deploy**. Wait for status **Healthy** before proceeding.

---

## Step 5 — Create Frontend Service

### 5.1 Create Service
1. Click **+ New Service**
2. Select **Application**
3. Choose **Dockerfile** as source type

### 5.2 Configure — Source

| Field | Value |
|-------|-------|
| Repository URL | `<your-github-repo-url>` |
| Branch | `master` |
| Build Pack | **None** (Dockerfile-based) |
| Dockerfile Path | `frontend/Dockerfile` |
| Build Context | `./frontend` |

### 5.3 Build Arguments

```
VITE_PAYMOB_PUBLIC_KEY=<YOUR_PAYMOB_PUBLIC_KEY>
```

### 5.4 Configure — General

| Field | Value |
|-------|-------|
| Name | `courtzon-frontend` |
| Ports | `80:80` |

### 5.5 Health Check

| Field | Value |
|-------|-------|
| Path | `/` |
| Port | `80` |
| Expected Status | `200` |
| Interval | `30s` |
| Timeout | `5s` |
| Start Period | `10s` |
| Retries | `3` |

### 5.6 Deploy
Click **Deploy**. Wait for status **Healthy** before proceeding.

---

## Step 6 — Configure Domains & SSL

### 6.1 Backend Domains
In the `courtzon-backend` service, add domain:

| Domain | Port |
|--------|------|
| `api.courtzon.cloud` | `3000` |

Enable **Force HTTPS**.

### 6.2 Frontend Domains
In the `courtzon-frontend` service, add domains:

| Domain | Port |
|--------|------|
| `courtzon.cloud` | `80` |
| `www.courtzon.cloud` | `80` |
| `admin.courtzon.cloud` | `80` |

Enable **Force HTTPS** for all.

### 6.3 SSL Verification
Wait 5-10 minutes for Let's Encrypt certificates. Verify:
```bash
curl -I https://courtzon.cloud
# Should return HTTP/2 200 with strict-transport-security header

curl -I https://api.courtzon.cloud/health
# Should return HTTP/2 200
```

---

## Step 7 — Production Smoke Test

### 7.1 Health Endpoints

Run each command and check the response:

```bash
# 1. Backend health
curl https://api.courtzon.cloud/health
# Expected: {"status":"ok","service":"courtzon-v2-backend",...}

# 2. Liveness
curl https://api.courtzon.cloud/health/live
# Expected: {"status":"ok"}

# 3. Readiness (includes DB + Redis checks)
curl https://api.courtzon.cloud/health/ready
# Expected: {"status":"ok","database":"connected","redis":"connected"}

# 4. Database connectivity
curl https://api.courtzon.cloud/health/database
# Expected: {"status":"ok","database":"connected","tables":163,...}

# 5. Redis connectivity
curl https://api.courtzon.cloud/health/redis
# Expected: {"status":"ok"}

# 6. Frontend
curl https://courtzon.cloud/
# Expected: 200 OK, HTML containing "CourtZon"

# 7. WWW redirect
curl -I https://www.courtzon.cloud/
# Expected: 200 OK

# 8. Admin panel
curl https://admin.courtzon.cloud/
# Expected: 200 OK (same SPA, route-based admin)
```

**☐ All 8 endpoints return 200**

### 7.2 First Login

```bash
# Login as super admin
curl -X POST https://api.courtzon.cloud/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"01012637733","countryCode":"+20","password":"123456"}'
```

**Expected response:**
```json
{
  "user": {
    "id": 1,
    "fullName": "Mohamed Niazy",
    "email": "mniazyy@gmail.com",
    "roles": ["super_admin"],
    "permissions": ["platform.admin", "translations.sync", ...]
  },
  "session": {
    "expiresAt": "2026-07-25T..."
  }
}
```

**☐ Login returns 200 with super_admin role and 467 permissions**

### 7.3 Protected Endpoint Access

```bash
# Extract session token from the Set-Cookie header above, or use as Bearer token:
TOKEN="<session_token_from_login_response>"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" https://api.courtzon.cloud/roles
# Expected: 200 with 9 roles

curl -H "Authorization: Bearer $TOKEN" https://api.courtzon.cloud/admin/users
# Expected: 200 with 3 users

curl -H "Authorization: Bearer $TOKEN" https://api.courtzon.cloud/organisations
# Expected: 200 with 1 organisation
```

**☐ All 3 protected endpoints return 200**

### 7.4 Failed Auth Test

```bash
# Wrong password
curl -X POST https://api.courtzon.cloud/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"01012637733","countryCode":"+20","password":"wrong"}'
# Expected: 401

# No auth
curl https://api.courtzon.cloud/roles
# Expected: 401
```

**☐ Both return 401**

### 7.5 Public Endpoints

```bash
curl https://api.courtzon.cloud/public/theme
# Expected: 200

curl https://api.courtzon.cloud/public/languages
# Expected: 200

curl https://api.courtzon.cloud/sports
# Expected: 200

curl https://api.courtzon.cloud/public/translations/en
# Expected: 200
```

**☐ All 4 public endpoints return 200**

### 7.6 Security Headers

```bash
curl -I https://courtzon.cloud/ 2>&1 | grep -iE "x-frame|x-content|x-xss|referrer-policy|content-security-policy|permissions-policy"
```

**Expected output must include ALL of:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://accept.paymob.com" "https://accept.paymobsandbox.com")
Content-Security-Policy: default-src 'self';...
```

**☐ All 6 security headers present**

### 7.7 SSL Verification

```bash
curl -I https://courtzon.cloud/ 2>&1 | grep -i "strict-transport-security"
# Expected: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

curl -I https://api.courtzon.cloud/health 2>&1 | grep -i "strict-transport-security"
# Expected: same HSTS header
```

**☐ HSTS header present on both frontend and backend**

---

## Step 8 — Post-Deployment Configuration

### 8.1 Change Super Admin Password (IMPORTANT)

Login to the admin panel at `https://admin.courtzon.cloud`, navigate to profile settings, and change the password from `123456` to a strong password immediately.

### 8.2 Configure Backup Schedule

In Coolify, add a scheduled backup for the `courtzon-db` service:
- **Schedule:** Daily at `01:00 UTC`
- **Retention:** 30 backups
- **Format:** SQL dump, compressed

### 8.3 Verify Backups

After the first backup runs, verify:
```bash
# List backup files in the backend container
# (accessible via Coolify terminal for courtzon-backend service)
ls -la /app/backups/
```

### 8.4 Enable Monitoring (Optional)

If using Prometheus/Grafana, configure the scrape endpoint:
```
https://api.courtzon.cloud/metrics
Header: Authorization: Bearer <YOUR_METRICS_TOKEN>
```

---

## Quick Verification Summary

After completing all steps, every box should be checked:

```
☐ Step 1 — MySQL Healthy
☐ Step 2 — Redis Healthy
☐ Step 3 — 163 tables, seed data imported, 4 DB users created
☐ Step 4 — Backend Healthy
☐ Step 5 — Frontend Healthy
☐ Step 6 — SSL active for all 4 domains
☐ Step 7.1 — 8/8 health endpoints → 200
☐ Step 7.2 — Login → 200 with super_admin
☐ Step 7.3 — 3/3 protected endpoints → 200
☐ Step 7.4 — 2/2 failed auth → 401
☐ Step 7.5 — 4/4 public endpoints → 200
☐ Step 7.6 — 6/6 security headers present
☐ Step 7.7 — HSTS on frontend + backend
☐ Step 8.1 — Super admin password changed
☐ Step 8.2 — Backup schedule configured
```

---

## First-Login Credentials

| Field | Value | Notes |
|-------|-------|-------|
| Login Method | Phone + Password | `POST /auth/login` |
| Phone Number | `01012637733` | With country code: `+20` |
| Password | `123456` | **CHANGE IMMEDIATELY after first login** |
| Role | `super_admin` | Full platform access (467 permissions) |
| Email | `mniazyy@gmail.com` | Super admin email |

**To change password:** Navigate to Admin Panel → Profile → Security → Change Password.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Backend won't start | Verify MySQL + Redis are Healthy. Check DB_HOST=courtzon-db matches MySQL service name. |
| Frontend blank page | Verify VITE_PAYMOB_PUBLIC_KEY build arg is set. Rebuild after changing. |
| SSL certificate error | DNS may not have propagated. Wait 10 min, redeploy proxy. |
| Login returns 500 | Verify seed data imported. Check `SELECT * FROM users WHERE id=1;`. |
| Uploads fail | Verify S3 credentials. Check STORAGE_PROVIDER=s3. |
| Email not sending | Verify SMTP credentials. Default is `MAIL_TRANSPORT=log` (console only). |
| 401 on /api/ through frontend | Normal — auth requires direct API call. Use nginx proxy path `/auth/login`. |
| Container restarting | Check Coolify logs. Most common: missing SESSION_SECRET or DB_HOST wrong. |

---

**Runbook complete.** If all steps pass, CourtZon V3.0.0 is live in production.
