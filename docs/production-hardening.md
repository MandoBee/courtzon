# CourtZon Production Hardening Guide

## Overview
This document summarizes all security and production-readiness improvements implemented for the CourtZon platform.

## Completed Improvements

### 1. Security Headers (CSP, HSTS, CORS)
- **CORS**: Strict whitelist replaces `origin: true`. Only `https://courtzon.com`, `https://admin.courtzon.com`, `https://media.courtzon.com`, and localhost dev URLs allowed.
- **Helmet/CSP**: Content Security Policy enabled with strict directives (self-only scripts, no inline JS, frame ancestors denied).
- **HSTS**: Enabled with 1-year max-age, includeSubDomains, preload.
- **HTTPS Redirect**: Automatic redirect for non-HTTPS requests in production.
- **X-Frame-Options**: DENY.
- **Referrer-Policy**: `strict-origin-when-cross-origin`.

### 2. Brute Force Protection
- **Redis-based rate limiting**: Tracks failed login attempts per IP.
- **Account lockout**: 5 failed attempts → 30-minute lockout.
- **Graceful degradation**: Returns remaining attempts and lockout TTL in error responses.
- **Audit logging**: All failed/successful logins logged.

### 3. Audit Logging System
- **New audit-log module** at `backend/src/modules/audit-log/`.
- Tracks: user actions (login/logout/register), admin actions, permission changes, wallet changes, settlement actions, uploads, and critical CRUD.
- Persistent logging to existing `audit_logs` database table.
- Admin API at `GET /admin/audit-logs`.

### 4. File Upload Hardening
- **MIME type whitelist**: Only JPEG, PNG, WebP, GIF, HEIC, HEIF, PDF allowed.
- **Magic byte validation**: Verifies file content matches declared MIME type.
- **Extension blocking**: Blocks dangerous extensions (SVG, HTML, JS, PHP, EXE, etc.).
- **SVG blocking**: SVG files explicitly blocked due to XSS risk.
- **Image re-encoding**: All images re-encoded server-side via Sharp (strips metadata, converts to WebP).
- **Audit logging**: All uploads/deletes logged.

### 5. Database Security
- **Least-privilege user script**: `backend/scripts/setup-db-users.sql` creates `app_user`, `readonly_user`, `migration_user`.
- **Index optimization**: New migration `029_security_indexes.sql` with optimized indexes for bookings, marketplace, orders, wallets, sessions, organisations, and activity feed.
- **Session security**: Migration `030_session_device_fingerprint.sql` adds IP country tracking, suspicious flag, and `login_attempts` table.

### 6. Secrets Management
- **.env files**: All `.env` files cleaned of real passwords. `.env.example` files created for all environments.
- **Docker secrets**: Docker Compose updated to use `env_file` instead of hardcoded env vars.
- **Dockerfile**: No longer copies `.env` into the image.

### 7. Frontend Security
- **Session storage**: Migrated from `localStorage` to `sessionStorage` for tokens (tokens cleared on tab close).
- **Route guards**: New `RouteGuard` component for permission-based route protection.
- **Permission check**: `createPermissionRoute` helper for wrapping routes with permission checks.

### 8. DevOps & CI/CD
- **Security scanning workflow**: New GitHub Actions workflow runs npm audit, Trivy Docker scanning, truffleHog secrets detection, and TypeScript compilation.
- **Existing CI**: Updated with security scanning jobs.

### 9. Monitoring & Observability
- **Prometheus + Grafana stack**: `docker-compose.monitoring.yml` for metrics collection and visualization.
- **Node Exporter**: System-level metrics.
- **Grafana dashboards**: Pre-configured datasource, accessible at port 3001.

### 10. Backups
- **Encryption**: Optional AES-256-CBC encryption for database backups (`BACKUP_ENCRYPTION_KEY`).
- **Retention**: Automated pruning of backups older than 30 days.
- **Compression**: Gzip compression for storage efficiency.

### 11. Redis & Caching
- **Redis password**: Optional Redis authentication via `REDIS_PASSWORD`.
- **Memory limits**: Redis configured with `--maxmemory 512mb --maxmemory-policy allkeys-lru`.
- **Cache service**: New `redis-cache.service.ts` with `getOrSet`, TTL management, cache key generation, and pattern-based invalidation.
- **Persistent volumes**: Redis data persisted via Docker volume.

### 12. Multi-Tenant Isolation
- **Organisation access guard**: `requireOrganisationAccess` middleware validates ownership/scope access for organisation-level routes.
- **Permission-based gate**: Existing RBAC system with `requireRole()` and `requirePermission()` middleware.

## Remaining Improvements (Future)

### 1. S3/MinIO Cloud Storage
- Implement S3-compatible storage provider (Cloudflare R2 / MinIO).
- Replace `LocalStorageProvider` with `S3StorageProvider`.
- Use signed URLs for private bucket access.
- Separate media domain (e.g., `media.courtzon.com`).

### 2. HttpOnly Auth Cookies
- Migrate from Bearer token header to HttpOnly Secure SameSite cookies.
- Set cookies on login/refresh.
- Remove token exposure from response bodies.

### 3. Service Separation
- Split monolith into microservices: auth, booking, payments, notifications, marketplace.
- Each service in its own Docker container with independent scaling.

### 4. Advanced WAF & DDoS Protection
- Cloudflare WAF with custom rules.
- Rate limiting at edge.
- Bot management.

### 5. Container Security
- Run containers as non-root user.
- Read-only root filesystem.
- Security context constraints.
- Image signing.

### 6. Vulnerability Management
- Regular dependency updates (Dependabot/Renovate).
- SAST scanning (SonarQube/Semgrep).
- DAST scanning (OWASP ZAP).
- Penetration testing.

### 7. Advanced Observability
- Sentry error tracking integration.
- OpenTelemetry instrumentation.
- Distributed tracing.
- Custom Grafana dashboards for business metrics.

### 8. Disaster Recovery
- Multi-region database replicas.
- Automated failover.
- Restore testing automation.
- Business continuity plan documentation.

## Running the Improvements

```bash
# 1. Set up database users
mysql -u root -p < backend/scripts/setup-db-users.sql

# 2. Update .env with new database credentials
# (copy from .env.example and fill in)

# 3. Run new migrations (dev reset with baseline config)
node backend/scripts/migrate.js --fresh --seed

# Refresh baseline snapshot after admin/config changes (optional)
# node backend/scripts/export-baseline-seed.mjs

# 4. Recreate backend container (do not use restart — old image may persist)
docker compose build backend && docker compose up -d backend

# 5. Start monitoring stack (optional)
docker compose -f docker-compose.monitoring.yml up -d
```
