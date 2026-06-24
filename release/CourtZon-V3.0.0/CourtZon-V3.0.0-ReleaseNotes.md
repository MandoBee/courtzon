# CourtZon V3.0.0 — Release Notes

**Release Date:** 2026-06-25
**Status:** Production Certified
**Previous Version:** CourtZon V2

---

## Overview

CourtZon V3.0.0 is a complete architecture rebuild of the CourtZon platform. The V2 codebase has been fully migrated to a modern Docker-based deployment with improved security, proper database versioning, and comprehensive validation.

## What's New

### Architecture
- **Single authoritative baseline schema** (163 tables, 211 foreign keys) replaces 128 historical migration files
- **Docker Compose** 4-service stack: MySQL 8.0, Redis 7, Backend (Node.js 22/Fastify), Frontend (Nginx/React)
- **Coolify-ready** deployment with comprehensive deployment documentation
- **Multi-stage Docker builds** with non-root users and proper healthchecks

### Database
- **163 tables** with 211 foreign key constraints
- **4 triggers** for audit logging (organisations, users, orders)
- **2 scheduled events** (session cleanup, notification queue)
- **Reference seed data**: 3 users, 9 roles, 555 permissions, 1,144 role-permission assignments
- **Database users** with least-privilege design: app, readonly, migration, backup
- **Proper backup/restore pipeline** with gzip compression, AES-256 encryption, and S3 support

### Security
- **PBKDF2-SHA512 password hashing** (210,000 iterations)
- **Opaque session tokens** (SHA-256 hashed in database)
- **Redis-backed brute-force protection** (5 attempts → 30 min lockout)
- **Comprehensive CSP + security headers** (Helmet + Nginx)
- **Layered file upload defenses**: MIME whitelist, extension blocklist, magic byte verification, Sharp re-encoding
- **Audit logging** with 41 action types at 100+ call sites
- **Route guards**: `requireRole`, `requirePermission`, `requireApprovedOrg`
- **467 granular UI permissions** with registry sync

### Backup & Recovery
- **4 backup tools**: bash scripts (Linux), Node.js scripts, in-app scheduled service
- **VIRTUAL generated column compatibility** ensured in all backup/restore pipelines
- **Pre-restore safety backup** with confirmation prompt
- **Encrypted backups** (AES-256-CBC) with S3/R2 upload support
- **30-day auto-rotation**

### Validation (10-Phase Audit)
All 10 release validation phases passed with 27 defects fixed:

| Phase | Result | Fixes |
|-------|--------|-------|
| V2 Remnant Detection | PASS | 18 V2 references purged |
| Baseline Certification | PASS | STORED→VIRTUAL generated column |
| Seed Certification | PASS | — |
| Fresh Install Certification | PASS | — |
| Smoke Tests | PASS | MySQL2 execute→query (3 endpoints) |
| Backup Certification | PASS | VIRTUAL DEFAULT placeholder + V2 defaults |
| Restore Certification | PASS | V2 defaults + pre-backup fix |
| Security Verification | PASS | Nginx header inheritance bug fixed |
| Coolify Review | PASS | — |
| Pre-Deployment Verification | PASS | 7 residual V2 references |

## Breaking Changes from V2

| Change | Impact |
|--------|--------|
| Database name `courtzon_v2` → `courtzon_v3` | All DB_NAME env vars must be updated |
| Migrations directory `database/schema/` → archived | Use `database/baseline/` for schema |
| Seed directory `database/seed/` → `database/seeds/` | New seed path |
| Opaque tokens replace JWT | Session management changed |
| VIRTUAL generated column `org_id_normalized` | Backup scripts must use DEFAULT placeholder |
| Frontend Docker user → non-root | `chown`-based permission changes |

## Deployment Requirements

| Component | Minimum |
|-----------|---------|
| Docker | 24+ |
| Docker Compose | v2+ |
| Server CPU | 2 vCPUs |
| Server RAM | 4 GB (8 GB recommended) |
| MySQL | 8.0 |
| Redis | 7 |
| Node.js | 22 |
| Domains | 4 (app, api, admin, uploads CDN) |
| SSL | Let's Encrypt via Coolify |
| S3-compatible storage | For production uploads |
| Paymob account | For live payments |
| SMTP provider | For email delivery |

## Quick Start

```bash
# Clone and start
git clone <repo-url> courtzon-v3
cd courtzon-v3
cp .env.example .env  # Edit with your values
docker compose up -d

# Import database
mysql -u root -p courtzon_v3 < database/baseline/001_courtzon_v3.sql
mysql -u root -p courtzon_v3 < database/seeds/001_baseline.sql

# Verify
curl http://localhost:3000/health
# → {"status":"ok"}

curl http://localhost:5173/
# → CourtZon app

# Login (super admin)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"01012637733","countryCode":"+20","password":"123456"}'
# → 200 OK
```

## Known Limitations

1. **Docker containers**: MySQL runs as root (by design). Backend and frontend use non-root users.
2. **No CSRF tokens**: Relies on SameSite cookies and CORS. CSRF protection recommended for production.
3. **No permission caching**: Every guarded request hits the database for role/permission checks. Redis caching recommended at scale.
4. **Database user hosts**: All users use `@'%'` (any host). Restrict to specific Docker network IPs in production.
5. **Paymob sandbox**: Default payment gateway is `mock`. Set `PAYMOB_SANDBOX=false` for live payments.

## Artifact Checksums

See `CourtZon-V3.0.0-SHA256SUMS.txt` for cryptographic verification hashes.

## Documentation

| Document | Path |
|----------|------|
| Deployment Handover | `docs/deployment/deployment-handover.md` |
| Coolify Guide | `docs/deployment/coolify.md` |
| Production Guide | `docs/deployment/production.md` |
| Environment Variables | `docs/deployment/environment_matrix.md` |
| Security Audit | `docs/security/security_audit.md` |
| Validation Reports | `docs/validation/phase-{1..10}-*.md` |
| Pre-Deployment Check | `docs/release/final-pre-deployment-check.md` |

---

**Next Steps After Deployment:**
1. Configure production environment variables via Coolify UI
2. Set up daily backup schedule
3. Create database users with strong passwords
4. Enable S3 storage for uploads
5. Switch Paymob to live mode
6. Configure SMTP for email delivery
7. Set up monitoring (Prometheus metrics at `/metrics`)
