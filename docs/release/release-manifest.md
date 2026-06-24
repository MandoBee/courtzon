# CourtZon V3.0.0 — Release Manifest

**Release:** CourtZon-V3.0.0
**Date:** 2026-06-25
**Status:** Production Certified
**This document is immutable — do not modify.**

---

## 1. Git Commit SHA

```
Commit:  d719adb1e067e1d213b90417af943a5022fe1f41
Tag:     v3.0.0
Branch:  master
Message: Docs: Coolify deployment runbook — step-by-step executable guide
```

### Release Commit Chain

```
d719adb Docs: Coolify deployment runbook
4a9693e Release: CourtZon V3.0.0 — source, database, release notes, deployment package, checksums
6d183c4 Release: final pre-deployment verification report — all 8 checks PASS
e7f9840 Pre-deployment: fix courtzon_v2 references in .env.example
991768a Pre-deployment: fix residual courtzon_v2 references in health service, seed/migrate scripts, and legacy seed manifests
3770b43 CourtZon V3 - Production Certified Release
1c23fc2 CourtZon V3 certified architecture rebuild and release validation
```

---

## 2. Git Tag

```
Tag Name:    v3.0.0
Tag Type:    Annotated
Points to:   d719adb1e067e1d213b90417af943a5022fe1f41
Message:     CourtZon V3.0.0 — Production Certified Release (2026-06-25)
```

---

## 3. SHA256 Checksums

### Release Artifacts — `release/CourtZon-V3.0.0/`

| File | Size | SHA256 |
|------|------|--------|
| `CourtZon-V3.0.0-Source.zip` | 8,839 KB | `768FB090CC323916DB13C9C3B9A5121A29E44695081E85CEC882BA36D741EF06` |
| `CourtZon-V3.0.0-DeploymentPackage.zip` | 8,768 KB | `6E9171C69785797D1D16A68FDAACF2B332293F92E09B1412B2887428B047A4E0` |
| `CourtZon-V3.0.0-Database.sql` | 194 KB | `D4779B40EBF604B2EB7A121554D4B296E16DDAD556E80FDE949DE5B6FC32548F` |
| `CourtZon-V3.0.0-ReleaseNotes.md` | 6 KB | `E04474E6050E48803DB24894CB3A75DD2349F0367C654C6F6C8F42FA306135A1` |

**Full checksum file:** `release/CourtZon-V3.0.0/CourtZon-V3.0.0-SHA256SUMS.txt`

---

## 4. Active Database

```
Database:    courtzon_v3
Engine:      MySQL 8.0.46
Host:        Docker (courtzon-mysql)
Port:        3306 (container) / 3307 (host)
Charset:     utf8mb4 / utf8mb4_unicode_ci
Auth:        mysql_native_password

Tables:      163
Foreign Keys: 211
Triggers:    4
Events:      2

Seed Data:
  Users:        3
  Roles:        9
  Permissions:  555
  Role-Perms:   1,144
  Orgs:         1
  Branches:     2
  Countries:    8
  Sports:       16

Connection:  mysql://root:***@mysql:3306/courtzon_v3
App User:    courtzon_app (CRUD on courtzon_v3.*)
```

---

## 5. Backend Image

```
Image ID:    7ea990ae009d
Repository:  courtzon-backend
Tag:         latest
Size:        537 MB
Created:     2026-06-24 23:49:09 +0300 EEST

Base:        node:22-alpine
Runtime:     Node.js 22 (Fastify)
Init:        tini
User:        appuser (non-root)
Exposed:     :3000
Healthcheck: GET /health/live
Entrypoint:  docker-entrypoint.sh (waits for MySQL + Redis)

Build Context:  repository root (/)
Dockerfile:     backend/Dockerfile
```

---

## 6. Frontend Image

```
Image ID:    fffbd9a9c10f
Repository:  courtzon-frontend
Tag:         latest
Size:        83.1 MB
Created:     2026-06-24 23:02:25 +0300 EEST

Base:        nginx:1.27-alpine
User:        appuser (non-root)
Exposed:     :80
Healthcheck: curl -f http://localhost:80/

Proxy Pass:
  /api/*     → backend:3000
  /auth/*    → backend:3000
  /admin/*   → backend:3000
  /uploads/* → backend:3000

Security:    X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
             Referrer-Policy, Permissions-Policy, CSP (10 directives)

Build Context:  ./frontend
Dockerfile:     frontend/Dockerfile
Build Args:     VITE_PAYMOB_PUBLIC_KEY
```

---

## Release Package Contents

```
release/CourtZon-V3.0.0/
├── CourtZon-V3.0.0-Source.zip              Complete source (933 files, no node_modules/.git/.env)
├── CourtZon-V3.0.0-Database.sql            Baseline schema (163 tables, 211 FKs, 4 triggers)
├── CourtZon-V3.0.0-ReleaseNotes.md         Changelog, breaking changes, quick start
├── CourtZon-V3.0.0-DeploymentPackage.zip   Deployable package (6 folders, 724 files)
│   ├── backend/                            Node.js Fastify API
│   ├── frontend/                           Nginx + React SPA
│   ├── database/                           Baseline + seeds
│   ├── deployment/                         Config templates
│   ├── docs/                               Full documentation
│   ├── scripts/                            Backup/restore/migrate/seed
│   ├── docker-compose.yml                  Deployment manifest
│   └── README.md
├── CourtZon-V3.0.0-SHA256SUMS.txt          Verification checksums
└── CourtZon-V3.0.0-ReleaseNotes.md         (same as above)
```

---

## Validation Record

All 10 release validation phases passed. Reports at `docs/validation/`.

| # | Phase | Status | Report |
|---|-------|--------|--------|
| 1 | V2 Remnant Detection | PASS | `v2-remnants.md` |
| 2 | Baseline Certification | PASS | `phase-2-baseline-certification.md` |
| 3 | Seed Certification | PASS | `phase-3-seed-certification.md` |
| 4 | Fresh Install Certification | PASS | `phase-4-fresh-install-certification.md` |
| 5 | Smoke Tests | PASS | `phase-5-smoke-tests.md` |
| 6 | Backup Certification | PASS | `phase-6-backup-certification.md` |
| 7 | Restore Certification | PASS | `phase-7-restore-certification.md` |
| 8 | Security Verification | PASS | `phase-8-security-verification.md` |
| 9 | Coolify Review | PASS | `phase-9-coolify-review.md` |
| 10 | Release Certification | PASS | `phase-10-release-certification.md` |

**Pre-Deployment Verification:** `docs/release/final-pre-deployment-check.md` — 8/8 checks PASS.

---

## Deployment

| Document | Path |
|----------|------|
| Deployment Handover | `docs/deployment/deployment-handover.md` |
| Coolify Runbook | `docs/deployment/coolify-deployment-runbook.md` |
| Coolify Guide | `docs/deployment/coolify.md` |
| Production Guide | `docs/deployment/production.md` |
| Environment Variables | `docs/deployment/environment_matrix.md` |
| Security Audit | `docs/security/security_audit.md` |

---

**Immutable record.** This manifest is the definitive reference for CourtZon V3.0.0. Any subsequent changes create a new version.
