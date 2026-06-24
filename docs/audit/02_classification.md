# Phase 2: Classification

**Generated:** 2026-06-24
**Classification scheme:** KEEP | MOVE | ARCHIVE | REPLACE | REMOVE

---

## 2.1 Classification Definitions

| Classification | Meaning |
|---------------|---------|
| **KEEP** | File stays in place — actively used, well-structured |
| **MOVE** | File is needed but in wrong location — relocate to new structure |
| **ARCHIVE** | File is historical or obsolete — move to `/archive/` for reference |
| **REPLACE** | File serves a purpose but must be rewritten for V3 standards |
| **REMOVE** | File is dead, generated, or should be deleted entirely |

---

## 2.2 Root Level

| Path | Classification | Rationale |
|------|---------------|-----------|
| `.dockerignore` | **KEEP** | Required for Docker builds |
| `.env` | **REPLACE** | Contains secrets — will be replaced by `deployment/env/` structure |
| `.env.example` | **KEEP** | Valid template, but will be moved to `deployment/env/` |
| `.env.production` | **ARCHIVE** | Duplicate of `.env` with production values; separate example should suffice |
| `.git/` | **KEEP** | Git history |
| `.github/workflows/build.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/ci.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/lint.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/migration-validation.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/restore-validation.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/security-scan.yml` | **REPLACE** | Will be consolidated |
| `.github/workflows/test.yml` | **REPLACE** | Will be consolidated |
| `.gitignore` | **KEEP** | Valid ignore rules |
| `AGENTS.md` | **KEEP** | Agent automation rules — valuable |
| `backend/` | **KEEP** (restructure) | Core backend — will be restructured in Phase 8 |
| `backups/` | **MOVE** | Move to `deployment/backups/` |
| `database/` | **KEEP** (restructure) | Core database — will be restructured in Phases 3-6 |
| `docker-compose.yml` | **REPLACE** | Will be rewritten for V3 Docker architecture |
| `docker-compose.dev.yml` | **REPLACE** | Will be consolidated with main compose |
| `docker-compose.monitoring.yml` | **ARCHIVE** | Monitoring is out of scope for V3 core |
| `docs/01-domain-map.md` | **ARCHIVE** | Historical architecture doc |
| `docs/02-erd-planning.md` | **ARCHIVE** | Historical planning doc |
| `docs/03-rbac-design.md` | **ARCHIVE** | Superseded by current RBAC implementation |
| `docs/04-event-architecture.md` | **ARCHIVE** | Historical |
| `docs/05-financial-system.md` | **ARCHIVE** | Historical |
| `docs/06-realtime-system.md` | **ARCHIVE** | Historical |
| `docs/07-api-standards.md` | **ARCHIVE** | Historical |
| `docs/08-multi-tenancy.md` | **ARCHIVE** | Historical |
| `docs/09-deployment.md` | **REPLACE** | Will be replaced by Phases 11-17 docs |
| `docs/10-scaling-roadmap.md` | **ARCHIVE** | Historical |
| `docs/COURTZON-IMPROVEMENT-PLAN.md` | **ARCHIVE** | Historical audit artifact |
| `docs/data-cascade.md` | **KEEP** | Valid database doc |
| `docs/disaster-recovery-audit.md` | **ARCHIVE** | Superseded by Phase 15 |
| `docs/full-theme-studio.md` | **KEEP** | Active frontend doc |
| `docs/phase1-task1-unused-tables.md` | **ARCHIVE** | Historical audit |
| `docs/phase1-task2-redundant-structures.md` | **ARCHIVE** | Historical audit |
| `docs/phase1-task3-performance-audit.md` | **ARCHIVE** | Historical audit |
| `docs/phase2-backend-audit.md` | **ARCHIVE** | Historical audit |
| `docs/phase3-security-hardening.md` | **ARCHIVE** | Historical audit |
| `docs/phase4-frontend-audit.md` | **ARCHIVE** | Historical audit |
| `docs/phase5-devops-audit.md` | **ARCHIVE** | Historical audit |
| `docs/phase6-product-business-audit.md` | **ARCHIVE** | Historical audit |
| `docs/phase7-executive-summary.md` | **ARCHIVE** | Historical audit |
| `docs/production-go-live-checklist.md` | **ARCHIVE** | Historical |
| `docs/production-hardening.md` | **ARCHIVE** | Superseded by Phase 16 |
| `docs/staging-deployment-guide.md` | **ARCHIVE** | Historical |
| `e2e/` | **KEEP** | Valid e2e tests |
| `frontend/` | **KEEP** (restructure) | Core frontend — restructured in Phase 9 |
| `monitoring/` | **ARCHIVE** | Out of V3 core scope |
| `node_modules/` | **REMOVE** | Generated — not committed |
| `opencode.json` | **KEEP** | Opencode tool config |
| `package.json` | **KEEP** | Root package (playwright) |
| `package-lock.json` | **KEEP** | Root lockfile |
| `PLAN.md` | **ARCHIVE** | Historical plan |
| `playwright.config.ts` | **KEEP** | E2E test config |
| `PROJECT_MAP.md` | **ARCHIVE** | Historical |
| `project-files.txt` | **REMOVE** | Auto-generated listing |
| `README.md` | **REPLACE** | Will be rewritten for V3 |
| `ROADMAP.md` | **ARCHIVE** | Historical |
| `scripts/backup-cron.sh` | **MOVE** | Move to `scripts/` in V3 |
| `scripts/deploy-check.js` | **ARCHIVE** | Superseded by Phase 17 |
| `scripts/deployment-validation.js` | **ARCHIVE** | Superseded |
| `scripts/dns-cutover.sh` | **ARCHIVE** | Historical |
| `scripts/e2e-smoke.js` | **KEEP** | Valid smoke test script |
| `scripts/setup-ssl.sh` | **ARCHIVE** | Superseded by Coolify |
| `start-tunnel.ps1` | **ARCHIVE** | Historical tunnel script |
| `stop-tunnel.ps1` | **ARCHIVE** | Historical tunnel script |
| `tests/verify-production.js` | **KEEP** | Valid production check |

---

## 2.3 Backend — Top Level

| Path | Classification | Rationale |
|------|---------------|-----------|
| `backend/.dockerignore` | **KEEP** | Required |
| `backend/.env` | **REMOVE** | Secrets — use `deployment/env/` |
| `backend/.env.example` | **MOVE** | Move to `deployment/env/` |
| `backend/database/` | **REMOVE** | Empty/log only — unnecessary |
| `backend/dist/` | **REMOVE** | Build output |
| `backend/docker-entrypoint.sh` | **REPLACE** | **Critical flaw:** auto-migrates + auto-seeds on startup |
| `backend/Dockerfile` | **REPLACE** | Will be rewritten for Phase 12 standards |
| `backend/Dockerfile.dev` | **ARCHIVE** | Dev Dockerfile superseded by local dev |
| `backend/node_modules/` | **REMOVE** | Dependencies |
| `backend/package.json` | **KEEP** | Valid |
| `backend/package-lock.json` | **KEEP** | Lockfile |
| `backend/scripts/` | **RESTRUCTURE** | 36 scripts — many need archiving |
| `backend/src/` | **KEEP** (restructure) | Core source — Phase 8 |
| `backend/tmp/` | **REMOVE** | Temp artifacts |
| `backend/tsconfig.json` | **KEEP** | Valid |
| `backend/uploads/` | **KEEP** | Runtime data (not committed) |
| `backend/vitest.config.ts` | **KEEP** | Valid |
| `backend/vitest.integration.config.ts` | **KEEP** | Valid |
| `backend/vitest.integration.setup.ts` | **KEEP** | Valid |

---

## 2.4 Backend Scripts — Detailed Classification

| Script | Classification | Rationale |
|--------|---------------|-----------|
| `backend/scripts/migrate.js` | **REPLACE** | Bloated with seed logic — split migration/seed |
| `backend/scripts/load-file-env.js` | **KEEP** | Utility used by migrate.js |
| `backend/scripts/backup.js` | **REPLACE** | Will be replaced by `scripts/backup.sh` |
| `backend/scripts/backup.sh` | **REPLACE** | Will be replaced by `scripts/backup.sh` |
| `backend/scripts/restore.js` | **REPLACE** | Will be replaced by `scripts/restore.sh` |
| `backend/scripts/bootstrap-admin.js` | **MOVE** | Move to `scripts/` |
| `backend/scripts/seed.js` | **ARCHIVE** | Superseded by migrate.js seed mode |
| `backend/scripts/run-js-seed.mjs` | **ARCHIVE** | Demo seed runner |
| `backend/scripts/sync-ui-registry.js` | **KEEP** | Active permission sync tool |
| `backend/scripts/sync-role-permissions.js` | **ARCHIVE** | Duplicate of .mjs version |
| `backend/scripts/sync-role-permissions.mjs` | **KEEP** | Active |
| `backend/scripts/role-permission-templates.mjs` | **KEEP** | Active |
| `backend/scripts/export-baseline-seed.mjs` | **KEEP** | Active baseline export |
| `backend/scripts/export-baseline-seed.js` | **ARCHIVE** | Duplicate of .mjs version |
| `backend/scripts/deployment-validation.cjs` | **ARCHIVE** | Superseded |
| `backend/scripts/deployment-validation.js` | **ARCHIVE** | Superseded |
| `backend/scripts/verify-deployment.js` | **ARCHIVE** | Superseded |
| `backend/scripts/emergency-repair.js` | **KEEP** | Emergency tool |
| `backend/scripts/clear-database-data.js` | **ARCHIVE** | One-time utility |
| `backend/scripts/clear-marketplace-test-data.js` | **ARCHIVE** | One-time utility |
| `backend/scripts/check-slugs.mjs` | **ARCHIVE** | One-time utility |
| `backend/scripts/cleanup-check.mjs` | **ARCHIVE** | One-time utility |
| `backend/scripts/setup-db-users.sql` | **MOVE** | Move to `database/scripts/` |
| `backend/scripts/gen-pwa-icons.js` | **KEEP** | PWA icon generator |
| `backend/scripts/grant-new-perms.js` | **ARCHIVE** | One-time |
| `backend/scripts/fix-admin-guard-imports.mjs` | **ARCHIVE** | One-time fix |
| `backend/scripts/patch-admin-guard-imports.mjs` | **ARCHIVE** | One-time fix |
| `backend/scripts/sync-translation-keys.js` | **KEEP** | Active |
| `backend/scripts/test-migrations.cjs` | **ARCHIVE** | Testing utility |
| `backend/scripts/enrich-polygons.mjs` | **ARCHIVE** | One-time geo utility |
| `backend/scripts/generate-egypt-seed.mjs` | **ARCHIVE** | One-time |
| `backend/scripts/import-egypt-seed.mjs` | **ARCHIVE** | One-time |
| `backend/scripts/seed-marketplace.cjs` | **ARCHIVE** | One-time |
| `backend/scripts/seed-padel-products.mjs` | **ARCHIVE** | One-time |
| `backend/scripts/retroactive-matchmaking-notifications.js` | **ARCHIVE** | One-time backfill |

---

## 2.5 Frontend — Top Level

| Path | Classification | Rationale |
|------|---------------|-----------|
| `frontend/.dockerignore` | **KEEP** | Required |
| `frontend/.env` | **REMOVE** | Secrets |
| `frontend/.env.example` | **MOVE** | Move to `deployment/env/` |
| `frontend/.gitignore` | **KEEP** | Valid |
| `frontend/dist/` | **REMOVE** | Build output |
| `frontend/Dockerfile` | **REPLACE** | Rewrite for Phase 12 |
| `frontend/eslint.config.js` | **KEEP** | Valid |
| `frontend/eslint-rules/` | **KEEP** | Custom rules |
| `frontend/index.html` | **KEEP** | Entry point |
| `frontend/nginx.conf` | **REPLACE** | Hardcoded proxy URL — rewrite |
| `frontend/nginx.prod.conf` | **ARCHIVE** | Superseded by Coolify |
| `frontend/nginx.prod.conf.template` | **ARCHIVE** | Superseded |
| `frontend/node_modules/` | **REMOVE** | Dependencies |
| `frontend/package.json` | **KEEP** | Valid |
| `frontend/package-lock.json` | **KEEP** | Lockfile |
| `frontend/postcss.config.js` | **KEEP** | Valid |
| `frontend/public/` | **KEEP** | Static assets |
| `frontend/README.md` | **KEEP** | Valid |
| `frontend/scripts/` | **KEEP** (review) | Frontend build scripts |
| `frontend/src/` | **KEEP** (restructure) | Phase 9 |
| `frontend/tailwind.config.js` | **KEEP** | Valid |
| `frontend/tsconfig.json` | **KEEP** | Valid |
| `frontend/tsconfig.app.json` | **KEEP** | Valid |
| `frontend/tsconfig.node.json` | **KEEP** | Valid |
| `frontend/vite.config.ts` | **KEEP** | Valid |
| `frontend/vitest.config.ts` | **KEEP** | Valid |

---

## 2.6 Database — Top Level

| Path | Classification | Rationale |
|------|---------------|-----------|
| `database/courtzon_v2_05062026.sql` | **ARCHIVE** | Historical dump |
| `database/my.cnf` | **MOVE** | Move to `deployment/` |
| `database/schema/` (all 129 files) | **ARCHIVE** | Will be replaced by single baseline in Phase 5 |
| `database/seed/003_baseline_snapshot.sql` | **KEEP** | Current seed authority |
| `database/seed/baseline-manifest.json` | **KEEP** | Baseline metadata |
| `database/seed/001_seed_core.sql` | **ARCHIVE** | Legacy seed |
| `database/seed/002_seed_provinces_cities.sql` | **ARCHIVE** | Legacy seed |
| `database/seed/014_update_product_images.sql` | **ARCHIVE** | One-off |
| `database/seed/cities_polygons.sql` | **ARCHIVE** | Historical |
| `database/seed/countries_polygons.sql` | **ARCHIVE** | Historical |
| `database/seed/provinces_polygons.sql` | **ARCHIVE** | Historical |
| `database/seed/README.md` | **KEEP** | Useful guide |
| `database/seed/dynamic_seed.mjs` | **ARCHIVE** | Historical |
| `database/seed/cms_seed.mjs` | **ARCHIVE** | Historical |
| `database/seed/run.mjs` | **ARCHIVE** | Historical |
| `database/seed/seed-marketplace.mjs` | **ARCHIVE** | Historical |
| `database/seed/seed-org-products.mjs` | **ARCHIVE** | Historical |
| `database/seed/fix_seller.sql` | **ARCHIVE** | One-off |
| `database/seed/generate_geo_sql.mjs` | **ARCHIVE** | Historical |
| `database/seed/hash_password.mjs` | **ARCHIVE** | Historical |
| `database/seed/migrate_fix.cjs` | **ARCHIVE** | Historical |
| `database/seed/perm_descriptions.sql` | **ARCHIVE** | Historical |
| `database/seed/node_modules/` | **REMOVE** | Dependencies |
| `database/seed/package.json` | **REMOVE** | Not needed |
| `database/seed/package-lock.json` | **REMOVE** | Not needed |
| `database/seed/data/` | **ARCHIVE** | Historical |
| `database/seed/database/` | **REMOVE** | Nested artifact |
| `database/seed/modules/` (15 files) | **ARCHIVE** | Historical |
| `database/scripts/` | **KEEP** (empty — will be populated) |

---

## 2.7 Docker Classification

| Path | Classification | Rationale |
|------|---------------|-----------|
| `docker-compose.yml` | **REPLACE** | Will be rewritten with health dependencies, no auto-migrate |
| `docker-compose.dev.yml` | **ARCHIVE** | Dev workflow changes |
| `docker-compose.monitoring.yml` | **ARCHIVE** | Out of scope for V3 core |
| `monitoring/prometheus.yml` | **ARCHIVE** | Out of scope |
| `monitoring/grafana-datasources.yml` | **ARCHIVE** | Out of scope |
| `monitoring/alerts.yml` | **ARCHIVE** | Out of scope |
| `monitoring/README.md` | **ARCHIVE** | Out of scope |

---

## 2.8 Summary — What Moves Where

| Target Path | Source Files |
|-------------|-------------|
| `archive/database/` | All 129 schema files, historical dumps, legacy seeds |
| `archive/docker/` | docker-compose.dev.yml, docker-compose.monitoring.yml, monitoring/ |
| `archive/deployment/` | nginx.prod.conf, nginx.prod.conf.template, dns-cutover.sh, setup-ssl.sh |
| `archive/scripts/` | One-time backend scripts (see 2.4) |
| `archive/config/` | .env.production, backend/private files |
| `archive/docs/` | All phase1-7 audit docs, historical docs |
| `deployment/env/` | All .env.example files, environment_matrix.md |
| `database/seeds/` | Consolidated seeds |
| `scripts/` | Consolidated operational scripts |

---

## 2.9 Critical Issues Identified

### P0 — Startup auto-migrate + auto-seed
`backend/docker-entrypoint.sh` lines 10-42: Runs migrations AND seeds AND bootstraps admin on every container start. This violates Phase 8 requirements. Startup must NEVER modify data.

### P1 — 129 migrations in single directory
Extremely bloated migration history. Needs baseline consolidation (Phase 5).

### P1 — Hardcoded proxy URL in nginx.conf
`frontend/nginx.conf` line 68: `proxy_pass http://mst7w2pk5lx2cpf1d1s6yitc.187.127.72.93.sslip.io;` — This is a hardcoded tunnel URL that should be an environment variable or backend service reference.

### P2 — Multiple .env files with secrets
`.env` (root), `backend/.env`, `frontend/.env`, `.env.production` — scattered secrets.

### P2 — 36 backend scripts, many one-time use
Half the scripts are historical one-offs that should be archived.

### P2 — Seed system complexity
4 seed modes (baseline, legacy, demo, JS modules), with auto-seed on startup.
