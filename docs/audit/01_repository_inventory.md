# Phase 1: Repository Inventory

**Generated:** 2026-06-24
**Scope:** Complete file-level inventory of the CourtZon-V2 repository

---

## 1.1 Root Level

| Path | Type | Size | Last Modified | Notes |
|------|------|------|---------------|-------|
| `.dockerignore` | file | 69 B | 2026-06-04 | Docker ignore rules |
| `.env` | file | 1.1 KB | 2026-06-22 | Production env — CONTAINS SECRETS |
| `.env.example` | file | 2.7 KB | 2026-06-24 | Environment template |
| `.env.production` | file | 1.8 KB | 2026-06-23 | Production env — CONTAINS SECRETS |
| `.git/` | dir | — | — | Git history |
| `.github/workflows/` | dir | 7 files | — | CI/CD pipelines |
| `.gitignore` | file | 1.9 KB | 2026-06-24 | Git ignore rules |
| `AGENTS.md` | file | 11.9 KB | 2026-06-13 | Agent automation rules |
| `backend/` | dir | — | — | Fastify TypeScript backend |
| `backups/` | dir | empty | 2026-06-24 | Runtime backup destination |
| `database/` | dir | — | — | Schema, seeds, config |
| `docker-compose.dev.yml` | file | 2.9 KB | 2026-06-04 | Dev Docker compose |
| `docker-compose.monitoring.yml` | file | 1.4 KB | 2026-06-04 | Prometheus/Grafana compose |
| `docker-compose.yml` | file | 3.3 KB | 2026-06-23 | Production Docker compose |
| `docs/` | dir | 28 files | — | Documentation |
| `e2e/` | dir | 2 files | — | Playwright e2e tests |
| `frontend/` | dir | — | — | React/Vite frontend |
| `monitoring/` | dir | 4 files | — | Prometheus/Grafana configs |
| `node_modules/` | dir | — | — | Root npm deps (playwright) |
| `opencode.json` | file | 143 B | 2026-05-17 | Opencode config |
| `package.json` | file | 229 B | 2026-06-04 | Root package (playwright scripts) |
| `package-lock.json` | file | 2.1 KB | 2026-06-02 | Root lockfile |
| `PLAN.md` | file | 26.6 KB | 2026-06-22 | Development plan |
| `playwright.config.ts` | file | 511 B | 2026-06-04 | Playwright config |
| `PROJECT_MAP.md` | file | 26.5 KB | 2026-06-04 | Project map |
| `project-files.txt` | file | 94.5 KB | 2026-06-24 | Auto-generated file listing |
| `README.md` | file | 10.8 KB | 2026-06-24 | Project readme |
| `ROADMAP.md` | file | 8.2 KB | 2026-05-18 | Development roadmap |
| `scripts/` | dir | 6 files | — | Deployment/ops scripts |
| `start-tunnel.ps1` | file | 4.1 KB | 2026-06-22 | Cloudflare tunnel script |
| `stop-tunnel.ps1` | file | 664 B | 2026-06-22 | Cloudflare tunnel script |
| `tests/` | dir | 1 file | — | Production verification test |

---

## 1.2 Backend (`backend/`)

### 1.2.1 Top-Level

| Path | Type | Size | Notes |
|------|------|------|-------|
| `.dockerignore` | file | 41 B | Backend Docker ignore |
| `.env` | file | 1.2 KB | Backend env — CONTAINS SECRETS |
| `.env.example` | file | 610 B | Backend env template |
| `database/` | dir | — | Duplicate symlink? Contains `seed/log` only |
| `dist/` | dir | — | Compiled JS output |
| `docker-entrypoint.sh` | file | 1.6 KB | **Auto-migrates + auto-seeds on startup** |
| `Dockerfile` | file | 1.0 KB | Production multi-stage build |
| `Dockerfile.dev` | file | 490 B | Dev hot-reload |
| `node_modules/` | dir | — | Dependencies |
| `package.json` | file | 1.6 KB | Backend manifest |
| `package-lock.json` | file | 232 KB | Backend lockfile |
| `scripts/` | dir | 36 items | Migration, seed, admin, backup scripts |
| `src/` | dir | — | TypeScript source code |
| `tmp/` | dir | — | Runtime temp files |
| `tsconfig.json` | file | 424 B | TypeScript config |
| `uploads/` | dir | 8 subdirs | Runtime uploaded files |
| `vitest.config.ts` | file | 246 B | Unit test config |
| `vitest.integration.config.ts` | file | 335 B | Integration test config |
| `vitest.integration.setup.ts` | file | 751 B | Integration test setup |

### 1.2.2 Backend Source (`backend/src/`)

| Path | Type | Notes |
|------|------|-------|
| `app.ts` | file | Fastify app bootstrap (336 lines) |
| `server.ts` | file | Server bootstrap + worker registration (86 lines) |
| `config/` | dir | Environment config |
| `database/` | dir | MySQL connection pool |
| `infrastructure/` | dir | Health, metrics, queue, redis, backup, startup |
| `modules/` | dir | **30 domain modules** (see below) |
| `plugins/` | dir | Fastify plugins |
| `realtime/` | dir | WebSocket/realtime |
| `routes/` | dir | Route definitions |
| `shared/` | dir | Cascade, constants, errors, helpers, kernel, middleware, services, utils, validation |
| `tests/` | dir | Unit/integration tests |
| `types/` | dir | TypeScript type definitions |
| `utils/` | dir | Utility functions |

### 1.2.3 Backend Domain Modules (`backend/src/modules/`)

| Module | Description |
|--------|-------------|
| `activities/` | Activity tracking |
| `amenities/` | Court amenities |
| `app-settings/` | App configuration |
| `approvals/` | Approval workflows |
| `audit-log/` | Audit logging |
| `auth/` | Authentication |
| `banks/` | Bank accounts |
| `booking/` | Court booking logic |
| `brute-force/` | Brute force protection |
| `cities/` | City data |
| `cms/` | Content management |
| `community/` | Community features |
| `countries/` | Country data |
| `coupon/` | Coupon/promo codes |
| `currencies/` | Currency data |
| `design-tokens/` | Theme/appearance studio |
| `financial/` | Financial transactions |
| `geo/` | Geographic data |
| `languages/` | Language/i18n |
| `marketplace/` | E-commerce marketplace |
| `notifications/` | Notifications |
| `organisations/` | Organization management |
| `payment/` | Payment gateway (Paymob) |
| `provinces/` | Province data |
| `rbac/` | Role-based access control |
| `reports/` | Reporting |
| `security/` | Security middleware |
| `settlement/` | Settlement accounting |
| `sidebar-layout/` | Sidebar layout config |
| `translations/` | Translation management |
| `upload/` | File upload |
| `wallet/` | Wallet management |

### 1.2.4 Backend Scripts (`backend/scripts/` — 36 files)

| Script | Purpose |
|--------|---------|
| `backup.js` | Database backup |
| `backup.sh` | Shell backup script |
| `bootstrap-admin.js` | Super admin creation |
| `check-slugs.mjs` | Slug validation |
| `cleanup-check.mjs` | Cleanup validation |
| `clear-database-data.js` | Data clearing utility |
| `clear-marketplace-test-data.js` | Test data cleanup |
| `deployment-validation.cjs` | Deployment check |
| `deployment-validation.js` | Deployment check (ESM) |
| `emergency-repair.js` | DB repair |
| `enrich-polygons.mjs` | Geo polygon enrichment |
| `export-baseline-seed.js` | Baseline export (CJS) |
| `export-baseline-seed.mjs` | Baseline export (ESM) |
| `fix-admin-guard-imports.mjs` | Import path fix |
| `gen-pwa-icons.js` | PWA icon generation |
| `generate-egypt-seed.mjs` | Egypt seed generator |
| `grant-new-perms.js` | Permission grant |
| `import-egypt-seed.mjs` | Egypt seed import |
| `load-file-env.js` | Env file loader |
| **`migrate.js`** | **Main migration engine** |
| `output/` | Script output dir |
| `patch-admin-guard-imports.mjs` | Import path patch |
| `restore.js` | Database restore |
| `retroactive-matchmaking-notifications.js` | One-time notification backfill |
| `role-permission-templates.mjs` | Role permission definitions |
| `run-js-seed.mjs` | JS seed runner |
| `seed-marketplace.cjs` | Marketplace seed |
| `seed-padel-products.mjs` | Padel product seed |
| `seed.js` | Legacy seed runner |
| `setup-db-users.sql` | DB user setup SQL |
| `sync-role-permissions.js` | Role-permission sync (CJS) |
| `sync-role-permissions.mjs` | Role-permission sync (ESM) |
| `sync-translation-keys.js` | Translation sync |
| `sync-ui-registry.js` | UI permission registry sync |
| `test-migrations.cjs` | Migration test |
| `verify-deployment.js` | Deployment verification |

---

## 1.3 Frontend (`frontend/`)

### 1.3.1 Top-Level

| Path | Type | Size | Notes |
|------|------|------|-------|
| `.dockerignore` | file | 28 B | Docker ignore |
| `.env` | file | 83 B | Frontend env |
| `.env.example` | file | 219 B | Frontend env template |
| `.gitignore` | file | 253 B | Git ignore |
| `dist/` | dir | — | Build output |
| `Dockerfile` | file | 569 B | Nginx multi-stage |
| `eslint.config.js` | file | 872 B | ESLint config |
| `eslint-rules/` | dir | — | Custom ESLint rules |
| `index.html` | file | 2.1 KB | Vite entry HTML |
| `nginx.conf` | file | 5.2 KB | **Contains hardcoded proxy URL** |
| `nginx.prod.conf` | file | 4.4 KB | Production nginx config |
| `nginx.prod.conf.template` | file | 4.2 KB | Templated production config |
| `node_modules/` | dir | — | Dependencies |
| `package.json` | file | 1.7 KB | Frontend manifest |
| `package-lock.json` | file | 391 KB | Frontend lockfile |
| `postcss.config.js` | file | 80 B | PostCSS config |
| `public/` | dir | — | Static assets |
| `README.md` | file | 2.4 KB | Frontend readme |
| `scripts/` | dir | — | Frontend scripts |
| `src/` | dir | — | React source |
| `tailwind.config.js` | file | 2.8 KB | Tailwind config |
| `tsconfig.json` | file | 119 B | Root TS config |
| `tsconfig.app.json` | file | 617 B | App TS config |
| `tsconfig.node.json` | file | 591 B | Node TS config |
| `vite.config.ts` | file | 6.6 KB | Vite build config |
| `vitest.config.ts` | file | 309 B | Test config |

### 1.3.2 Frontend Source (`frontend/src/`)

| Path | Type | Notes |
|------|------|-------|
| `App.tsx` | file | Root React component |
| `main.tsx` | file | Entry point |
| `index.css` | file | Global CSS |
| `vite-env.d.ts` | file | Vite type declarations |
| `app/` | dir | Layouts, providers, router |
| `assets/` | dir | Icons, images |
| `branding/` | dir | Branding assets |
| `components/` | dir | **18 component directories** |
| `constants/` | dir | App constants |
| `hooks/` | dir | Custom React hooks |
| `i18n/` | dir | Internationalization |
| `pages/` | dir | **16 page directories** |
| `permissions/` | dir | UI permission registry |
| `services/` | dir | API service layer |
| `store/` | dir | Zustand stores |
| `test/` | dir | Test utilities |
| `theme/` | dir | Theme configuration |
| `types/` | dir | TypeScript types |
| `utils/` | dir | Utility functions |

### 1.3.3 Frontend Pages

| Page Directory | Description |
|----------------|-------------|
| `academies/` | Academy management |
| `admin/` | Admin dashboard |
| `auth/` | Login, register, password reset |
| `booking/` | Booking flow |
| `coaches/` | Coach management |
| `community/` | Community features |
| `home/` | Home dashboard |
| `landing/` | Public landing pages |
| `marketplace/` | E-commerce marketplace |
| `notifications/` | Notification center |
| `org/` | Organization detail views |
| `organisations/` | Organization management |
| `profile/` | User profile |
| `settings/` | User settings |
| `subscription/` | Subscription management |
| `tournaments/` | Tournament management |

### 1.3.4 Frontend Components

| Component Dir | Description |
|---------------|-------------|
| `app-settings/` | App settings forms |
| `auth/` | Auth forms |
| `booking/` | Booking widgets |
| `branches/` | Branch management |
| `branding/` | Branding components |
| `form/` | Form building blocks |
| `i18n/` | Language switcher |
| `layout/` | Layout shell |
| `marketplace/` | Marketplace components |
| `notifications/` | Notification components |
| `organisations/` | Organization forms |
| `pwa/` | PWA prompt |
| `reports/` | Report components |
| `subscription/` | Subscription UI |
| `ui/` | **Shared UI component library** |
| `welcome/` | Welcome wizard |

---

## 1.4 Database (`database/`)

### 1.4.1 Top-Level

| Path | Type | Size | Notes |
|------|------|------|-------|
| `courtzon_v2_05062026.sql` | file | 1.0 MB | Full DB dump (historical) |
| `my.cnf` | file | 2.1 KB | MySQL client config |
| `schema/` | dir | **129 SQL migration files** |
| `scripts/` | dir | empty | Placeholder |
| `seed/` | dir | Complex seed system |

### 1.4.2 Schema Migrations (`database/schema/`)

| Range | Count | Notes |
|-------|-------|-------|
| `000` – `010` | 11 | Core foundation (sports, orgs, RBAC, booking, marketplace, payment, tournaments, community, financial) |
| `011` – `030` | 20 | Renames, currency, geo, CMS, payment methods, UI permissions, security indexes |
| `031` – `050` | 20 | Amenities, banks, settlements, roles, catalog, org types, registrations, sidebar, booking |
| `051` – `070` | 20 | Coupon, coaches, settlements, appearance studio, component tokens, app settings |
| `071` – `090` | 20 | Favicon, translations, branches, subscriptions, CMS pages, blog |
| `091` – `110` | 20 | Blog blocks, seller, orders, cleanup, roles consolidation |
| `111` – `128` | 18 | Payment, shipping, categories, accounting, settlements, booking intents, migration history |

**Total: 128 schema files + `128_add_migration_history.sql` (the last migration tracks itself)**

### 1.4.3 Seed Files (`database/seed/`)

| File | Size | Purpose |
|------|------|---------|
| `001_seed_core.sql` | 43 KB | Legacy core seed |
| `002_seed_provinces_cities.sql` | 32 KB | Legacy geo seed |
| `003_baseline_snapshot.sql` | 1.0 MB | **Baseline snapshot (current authority)** |
| `014_update_product_images.sql` | 19 KB | Product image update |
| `baseline-manifest.json` | 6.9 KB | Baseline metadata |
| `cities_polygons.sql` | 1.4 MB | Geo polygons |
| `cms_seed.mjs` | 21 KB | CMS seed script |
| `countries_polygons.sql` | 90 KB | Country polygons |
| `dynamic_seed.mjs` | 43 KB | Dynamic seed generator |
| `fix_seller.sql` | 1.9 KB | Seller fix |
| `generate_geo_sql.mjs` | 11 KB | Geo SQL generator |
| `hash_password.mjs` | 856 B | Password hasher |
| `migrate_fix.cjs` | 3.2 KB | Migration fix |
| `perm_descriptions.sql` | 6.0 KB | Permission descriptions |
| `provinces_polygons.sql` | 216 KB | Province polygons |
| `README.md` | 2.9 KB | Seed documentation |
| `run.mjs` | 5.7 KB | JS seed runner |
| `seed-marketplace.mjs` | 56 KB | Marketplace seed |
| `seed-org-products.mjs` | 20 KB | Org product seed |
| `node_modules/` | dir | Geo tooling deps |
| `package.json` | 55 B | Geo tooling package |
| `package-lock.json` | 86 KB | Geo tooling lockfile |
| `data/` | dir | Seed data files |
| `database/` | dir | Nested directory |
| `modules/` | dir | **15 JS seed modules** (academies, activity, bookings, community, comprehensive, financial, marketplace, misc, new_tables, notifications, orgs, polygons, rbac, reference, users) |

---

## 1.5 Docker & Deployment

### 1.5.1 Docker Compose Files

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | mysql, redis, backend, frontend | **Production stack** |
| `docker-compose.dev.yml` | mysql (profile:db), redis, backend, frontend | Dev hot-reload stack |
| `docker-compose.monitoring.yml` | prometheus, grafana, node-exporter | Monitoring stack |

### 1.5.2 Dockerfiles

| File | Base | Target |
|------|------|--------|
| `backend/Dockerfile` | node:22-alpine | Production multi-stage |
| `backend/Dockerfile.dev` | node:22-alpine | Dev with tsx watch |
| `frontend/Dockerfile` | node:22-alpine → nginx:1.27-alpine | Production multi-stage |

### 1.5.3 Nginx Configs

| File | Purpose |
|------|---------|
| `frontend/nginx.conf` | Docker container nginx (proxies to remote host) |
| `frontend/nginx.prod.conf` | Production VPS nginx (TLS/Coolify) |
| `frontend/nginx.prod.conf.template` | Templated version for dns-cutover.sh |

---

## 1.6 Root Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `backup-cron.sh` | Cron-based backup |
| `deploy-check.js` | Pre-deployment checks |
| `deployment-validation.js` | Deployment validation |
| `dns-cutover.sh` | DNS cutover script |
| `e2e-smoke.js` | E2E smoke test script |
| `setup-ssl.sh` | SSL setup |

---

## 1.7 CI/CD (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `build.yml` | Build verification |
| `ci.yml` | Continuous integration |
| `lint.yml` | Lint checks |
| `migration-validation.yml` | Migration validation |
| `restore-validation.yml` | Restore validation |
| `security-scan.yml` | Security scanning |
| `test.yml` | Test runner |

---

## 1.8 Documentation (`docs/`)

| File | Size | Category |
|------|------|----------|
| `01-domain-map.md` | 4.6 KB | Architecture |
| `02-erd-planning.md` | 4.4 KB | Architecture |
| `03-rbac-design.md` | 3.1 KB | Architecture |
| `04-event-architecture.md` | 2.3 KB | Architecture |
| `05-financial-system.md` | 6.6 KB | Architecture |
| `06-realtime-system.md` | 2.6 KB | Architecture |
| `07-api-standards.md` | 2.0 KB | Architecture |
| `08-multi-tenancy.md` | 2.3 KB | Architecture |
| `09-deployment.md` | 13.2 KB | Deployment |
| `10-scaling-roadmap.md` | 2.8 KB | Roadmap |
| `COURTZON-IMPROVEMENT-PLAN.md` | 79 KB | Audit |
| `data-cascade.md` | 3.8 KB | Database |
| `disaster-recovery-audit.md` | 6.1 KB | Operations |
| `full-theme-studio.md` | 3.1 KB | Frontend |
| `phase1-task1-unused-tables.md` | 4.8 KB | Audit |
| `phase1-task2-redundant-structures.md` | 9.3 KB | Audit |
| `phase1-task3-performance-audit.md` | 5.6 KB | Audit |
| `phase2-backend-audit.md` | 8.9 KB | Audit |
| `phase3-security-hardening.md` | 18.8 KB | Security |
| `phase4-frontend-audit.md` | 23.9 KB | Audit |
| `phase5-devops-audit.md` | 27.1 KB | Audit |
| `phase6-product-business-audit.md` | 28.9 KB | Audit |
| `phase7-executive-summary.md` | 40.9 KB | Audit |
| `production-go-live-checklist.md` | 27.6 KB | Operations |
| `production-hardening.md` | 6.5 KB | Security |
| `staging-deployment-guide.md` | 3.5 KB | Deployment |

---

## 1.9 Summary Statistics

| Category | Count |
|----------|-------|
| Total files (excluding node_modules, .git, dist) | ~350 |
| Database migrations | 129 SQL files |
| Backend scripts | 36 files |
| Backend modules | 30 domain modules |
| Frontend pages | 16 page directories |
| Frontend components | 18 component directories |
| Docker compose files | 3 |
| Dockerfiles | 3 |
| Nginx configs | 3 |
| GitHub Actions workflows | 7 |
| Root scripts | 6 |
| Documentation files | 28 |
| Seed files | 19 + 15 JS modules |
| .env files | 5 (root, backend, frontend + .example variants) |
| node_modules dirs | 4 (root, backend, frontend, database/seed) |
