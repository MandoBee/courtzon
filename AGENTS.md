# Agent Automation Rules

## CRITICAL: NEVER run destructive DB operations without explicit user approval

- **NEVER** run `migrate.sh --fresh` or force-drop/recreate databases unless the user explicitly requests it.
- **BEFORE** any seeding or data reset, you MUST list the specific tables that will be affected and get the user's explicit agreement.
- The production database lives on the local MySQL (XAMPP, port 3306) — destroying it is NOT acceptable (`courtzon_v2`).
- `docker compose down mysql` also destroys data — do NOT run it without approval.
- The V3 database name is `courtzon_v3` (Docker default). The production XAMPP database is still `courtzon_v2`.

## Toast System

A global toast system exists at `frontend/src/components/ui/Toast.tsx`.

Usage:
```tsx
import { useToast } from '../../components/ui/Toast';

const { showToast } = useToast();
showToast('Saved successfully!');                    // default: success
showToast('Something went wrong', 'error');           // error (5s)
showToast('Warning!', 'warning');                     // warning (4s)
showToast('Info', 'info');                            // info (4s)
showToast('Deleted. Undo?', 'warning', { label: 'Undo', onClick: () => restore(itemId) }); // with action
```

Types: `'success' | 'error' | 'warning' | 'info'`

The third parameter is an optional action (e.g. "Undo" for delete rollback). Duration defaults to 4s for warning/info, 5s for error, 4s for success. Override with 4th param.

**Rules:**
- Always show a success toast on every create/update/delete mutation's `onSuccess`
- Always show an error toast on `onError` with the error message
- Use `'warning'` type + action for delete confirmations when undo is available
- Wrap every new mutation's `onSuccess` callback with `showToast`

## Database architecture

V3 uses a **single authoritative baseline** — no migration chain.

- **Baseline schema:** `database/baseline/001_courtzon_v3.sql` (207 KB, 162 tables)
- **Seed data:** `database/seeds/001_baseline.sql` (reference data: countries, permissions, roles, amenities, etc.)
- **Historical migrations:** Archived at `archive/database/schema/` (128 files) — preserved for audit, **never required for deployment**
- **New migrations:** Place in `database/migrations/` as sequential SQL files. Update baseline after adding them.

### Creating a new DB migration
1. Add the migration SQL file to `database/migrations/`
2. Update the baseline by running the full chain against a fresh DB and re-exporting
3. Run `node backend/scripts/migrate.js` to apply pending migrations (or import the new baseline)

### Applying baseline + seed
```bash
# Import schema
mysql -u root -p courtzon_v3 < database/baseline/001_courtzon_v3.sql

# Import seed data
mysql -u root -p courtzon_v3 < database/seeds/001_baseline.sql
```

For Docker: import into `courtzon_v3` database on MySQL container (port 3307).

## Role permissions

- **Sync UI keys:** `node backend/scripts/sync-ui-registry.js`
- **Apply role templates:** `node backend/scripts/sync-role-permissions.mjs` (`super_admin` gets all permissions)
- Templates live in `backend/scripts/role-permission-templates.mjs`

## ⚠️ Mandatory: Always rebuild & recreate Docker after changes

**Whenever you change backend TS, database schema/seed, `docker-compose.yml`, Dockerfiles, `nginx.conf`, or any code that the Docker stack serves — you MUST run this before finishing the task (do not skip on Windows):**

```bash
docker compose build backend frontend
docker compose up -d
```

- Use `up -d`, **NOT** `docker compose restart` — restart keeps the old image.
- If only backend changed: `docker compose build backend && docker compose up -d backend`
- If only Docker frontend/nginx changed: `docker compose build frontend && docker compose up -d frontend`

## After modifying backend code (TypeScript) or database files
- Backend runs inside Docker on port 3000. HMR does not apply inside Docker — rebuild per rule above.
- The startup-validator checks `database/baseline/001_courtzon_v3.sql` at startup (baseline must exist in the image).

## After modifying frontend code
- **Docker UI** (http://localhost:5173): rebuild frontend image — Vite HMR does not apply inside the Nginx container
- **Local HMR**: `npm run dev` in `frontend/` on port 5173
- Run `npm run build` in `frontend/` to verify TypeScript compilation

## ⚠️ Mandatory: Finalize, sync & deploy

**After every task completes (code change, config change, seed, migration, etc.), you MUST do all of the following in order:**

### 1. Commit & push to GitHub
- Stage only the intended files (`git add -A` for all, or selective staging)
- Commit with a clear, concise message describing what was changed and why
- Push to the remote (`git push`)

### 2. Sync all environments to match the final working local state
- Verify:
  - **Local files**: unstaged changes committed, working tree clean
  - **Docker images**: rebuilt with the latest code (`docker compose build`, `docker compose up -d`)
  - **Database**: schema/migrations applied (run `node backend/scripts/migrate.js --status` and apply if pending)
  - **Seeds**: run if seed data changed (`node backend/scripts/seed.js`)
  - **Permission registry**: synced if UI permissions changed (`node backend/scripts/sync-ui-registry.js`)
- Confirm all services respond correctly:
  - `curl -f http://localhost:3000/health` (backend)
  - `curl -f http://localhost:5173` (frontend)

### 3. Deploy / redeploy on Hostinger
- Push the latest commit to the production branch (or deploy via the Hostinger workflow)
- Ensure the Hostinger environment pulls the latest code and restarts services
- Confirm the production instance is serving the updated version
- **After deploy, verify that local, Docker, and Hostinger are all running the same code** (same commit hash, same DB schema version)

## Port 5173 cleanup
- Always free up port 5173 after using it for local frontend dev (kill the `npm run dev` process) — the user needs it elsewhere.

## ⚠️ Docker hangs on Windows — use async tasks
- **Do NOT run `docker compose build` or heavy Docker commands synchronously** — they hang Docker Desktop on Windows.
- Instead, always delegate Docker builds to a **background subagent** via the `task` tool with `subagent_type: "general"`.
- Never set bash timeout > 120000ms for Docker commands.
- If you must run a Docker command inline (e.g., `docker compose up -d`), keep the timeout low (≤ 60000ms) — it should be near-instant if the image already exists.
- After the async build completes, run `docker compose up -d` inline (it's fast).

## Build commands
- Frontend: `npm run build` in `frontend/`
- Backend: `npm run build` in `backend/`

## Starting services
- Docker services: `docker compose up -d` from project root
- Local frontend: `npm run dev` in `frontend/`
- The Docker stack includes MySQL (3307), Redis (6379), Backend (3000), Frontend (5173)

## Scripts
- **Backup:** `scripts/backup.sh` (Linux/Coolify) or `node backend/scripts/backup.js`
- **Restore:** `scripts/restore.sh` or `node backend/scripts/restore.js <file>`
- **Migrate:** `node backend/scripts/migrate.js [--fresh] [--status]`
- **Seed:** `node backend/scripts/seed.js [--seed-file <file>]`
- **Emergency repair:** `node backend/scripts/emergency-repair.js`

## Security / Production Commands
- Setup database users: `mysql -u root -p < backend/scripts/setup-db-users.sql`
- Run npm audit: `npm audit --audit-level=high` in `backend/` or `frontend/`
- Security scan: `trivy image courtzon-backend:latest`

## Key Security Files
- CORS/CSP/Helmet config: `backend/src/app.ts`
- Frontend CSP: `frontend/nginx.conf` (Content-Security-Policy header)
- Brute-force protection: `backend/src/modules/brute-force/application/brute-force.service.ts`
- Audit logging: `backend/src/modules/audit-log/`
- Upload hardening: `backend/src/modules/upload/application/upload.service.ts`
- DB users script: `backend/scripts/setup-db-users.sql`
- Production hardening doc: `docs/production-hardening.md`

## Full theme / Appearance Studio

Published themes drive UI via CSS variables. Tailwind `gray`/`green`/`red`/`blue`/`amber` map to `var(--color-*)`; native inputs use form-control tokens. See `docs/full-theme-studio.md`. User light/dark toggle must not clear published schemes (`theme.store.ts`).

## UI Permissions / Frontend Access Control System

### How it works
Every UI element (page, button, tab, section, action, field) is registered in `frontend/src/permissions/registry.ts` with a flat permission key. These are synced to the `permissions` DB table via a sync script or the "Sync Registry" button in the admin UI Permissions screen.

### Adding a new UI element
1. Add an entry to `frontend/src/permissions/registry.ts` with:
   - `permissionKey` — unique flat key (e.g. `"users.export"`)
   - `moduleSlug` — matching an existing `permission_modules` slug
    - `elementType` — `'button' | 'tab' | 'page' | 'section' | 'action' | 'field'`
   - `elementLabel` — human-readable label for the admin screen
   - `componentPath` — optional path to the component file
2. Run the sync script: `node backend/scripts/sync-ui-registry.js` (or click "Sync Registry" in admin)
3. Wrap the element in `<Can permission="your.key">` to gate visibility

### Gating a button/tab/field
```tsx
import { Can } from '../../permissions/Can';

<Can permission="users.edit">
  <button onClick={...}>Edit User</button>
</Can>

<Can permission="users.edit.first-name">
  <input name="firstName" />
</Can>
```

### Checking permissions in code
```tsx
import { useCan } from '../../hooks/useCan';

const { can } = useCan();
if (can('users.edit')) { /* show something */ }
```

### Form Field Permissions

**Every form input field must be permission-gated using `elementType: 'field'`.**

1. Add an entry in `frontend/src/permissions/registry.ts` with `elementType: 'field'`
2. Naming convention: `{module}.{entity}.{field-name}` (e.g. `users.edit.first-name`, `organisations.edit.name`, `bookings.create.start-date`)
3. Also add to `backend/scripts/sync-ui-registry.js`
4. Wrap the field in `<Can permission="key">`
5. Run `node backend/scripts/sync-ui-registry.js`

The admin UI Permissions screen now shows a "Fields" filter tab to manage field-level access per role.

### Admin screen
- Navigate to `/admin/ui-permissions` to see all registered UI elements
- Toggle role checkboxes to grant/revoke access per element
- Click "Sync Registry" to pull new entries from the codebase

## ⚠️ Mandatory: Always use the roles/permissions system for UI gating

**Whenever asked to hide/show a UI element (button, tab, page, section, action, field):**

1. FIRST check if the element already has a permission key in `frontend/src/permissions/registry.ts`
2. If YES (permission exists): check if the proper role has that permission in the DB. If not, assign it via the admin UI Permissions screen or add it in the seed/role setup.
3. If NO (permission doesn't exist): register a new entry in `frontend/src/permissions/registry.ts`, run `node backend/scripts/sync-ui-registry.js`, then assign the permission to the proper role.
4. Only then, gate the element using `<Can permission="key">` or `can('key')`.

**Never hardcode role checks like `user.roles?.includes('seller')` for UI gating.** The permissions system is the single source of truth.

## PermGatedSharedComponent Pattern

**Use when** two or more user types need to edit the same data with different field visibility (e.g., admin edits an org vs seller edits their shop).

### Steps

1. **Create one shared component** (e.g., `components/organisations/OrganisationForm.tsx`)
   - Accepts `orgId`, `context` ('admin' | 'seller'), `onClose`
   - Contains ALL tabs/fields/buttons — nothing hidden by default
   - Context determines the API endpoint: admin → `PUT /entities/:id`, seller → `PUT /marketplace/seller/shop`

2. **Wrap every tab, field, button in `<Can>`** with a granular permission key:
   ```tsx
   <Can permission="organisations.edit.name">
     <input ... />
   </Can>
   <Can permission="organisations.edit.org-type">
     <select ... />
   </Can>
   ```
   Each tab is a permission. Each restricted field is a permission (using `elementType: 'field'`). Each action button is a permission.

3. **Register ALL permissions** in BOTH:
   - `frontend/src/permissions/registry.ts`
   - `backend/scripts/sync-ui-registry.js` (inline array)

4. **Run sync**: `node backend/scripts/sync-ui-registry.js`

5. **Assign all permissions to admin roles** by default. For other roles (seller), assign what they need. Admin can later toggle individual perms from `/admin/permissions`.

6. **Remove any hardcoded role/context checks** — permissions alone control visibility.

### Key principle
The component renders the SAME form for everyone. Roles differ only in which `<Can>` blocks pass — controlled entirely from the admin Permissions screen.

## ⚠️ Mandatory: Security amendments for every change

**Whenever implementing, adding, or creating anything new (feature, page, component, API, entity, field, button, action):**
1. Automatically make corresponding security amendments — this is **not optional** and requires no reminder.
2. This includes, at minimum:
   - Registering permission keys in `frontend/src/permissions/registry.ts`
   - Wrapping new UI elements in `<Can permission="key">`
   - Adding audit logging for state-changing operations
   - Adding route guards / role checks for new API endpoints
   - Running `node backend/scripts/sync-ui-registry.js` after adding permissions
3. You are also responsible for proactively handling related side effects the user doesn't mention — if they ask for X, handle Y, Z that are naturally implied (e.g., a new page needs routes, sidebar link, permission keys, API endpoints, audit logging).

## Mobile Layout Architecture (Post-Audit)

### Layout Hierarchy
- **AppLayout** (`App.tsx`): Wraps all 29 consumer routes. Renders `<Navbar>` (sticky top) + `<main className="pb-24 md:pb-6 cz-pb-safe">` + `<BottomNav />`
- **AdminLayout**: Admin routes, collapsible sidebar. No BottomNav.
- **OrgLayout**: Organisation management, collapsible sidebar. No BottomNav.
- **LandingLayout**: Public marketing pages. No BottomNav.

### Bottom Navigation
- Component: `frontend/src/components/layout/BottomNav.tsx`
- Fixed `bottom-0` with `z-[60]` (above all modals and overlays)
- Visible on mobile only (`md:hidden`)
- Core tabs: Home, Bookings, Marketplace + "More" sheet (Matches, Coaches, etc.) + Profile
- **No hamburger menu on mobile** — removed; BottomNav provides all navigation
- Org switcher, NotificationBell, and logout remain in the mobile header

### Safe Area
- `<main>` has `cz-pb-safe` for iPhone home indicator
- BottomNav has `cz-pb-safe` for its own bottom padding
- Modal component has `mb-16 md:mb-0` to clear the BottomNav

### Key Rules
- **NEVER** render a `min-h-screen` or `h-screen` inside AppLayout pages
- **NEVER** use `fixed bottom-0` in consumer pages
- **NEVER** create inline modals with `z-50` — use the `z-[70]` standard or the `<Modal>` component
- **ALWAYS** respect `cz-pb-safe` for bottom-positioned elements
- New consumer routes MUST be inside `<AppLayout>` to get the BottomNav

## CI / Pre-Build Validation

Run before every build to catch regressions:
```bash
node scripts/ci-validate.js
```

Checks: mobile routes inside AppLayout, BottomNav z-index, notification templates, translation keys, eventBus import, DB migrations, safe-area CSS.

## Testing

### Backend
- **Unit tests**: `npm test` (backend/) — excludes integration tests
- **Integration tests**: `npm run test:int` (backend/) — uses Testcontainers (MySQL + Redis), full schema + seeds
- **E2E validation**: `node backend/scripts/e2e-validation.mjs` — hits live Docker backend, covers auth/wallet/health/admin/security/notifications/client-errors

### Frontend
- **Unit tests**: `npm test` (frontend/) — vitest + jsdom
- **E2E (Playwright)**: `npm run test:e2e` (root) — currently empty; add tests in `e2e/` directory

### Test Conventions
- Backend integration tests: use `setupIntegrationTest()` / `teardownIntegrationTest()` from `backend/src/tests/helpers/integration-setup.ts`
- Name pattern: `*.spec.ts` (unit), `*.integration.spec.ts` (integration)
- DB tests clean up after themselves using transactions or explicit deletes

## Monitoring & Observability

### Metrics
- Prometheus at `GET /metrics` (requires `METRICS_TOKEN` in production)
- Custom metrics: `courtzon_http_request_duration_seconds`, `courtzon_http_requests_total`
- Default Node.js metrics: CPU, memory, event loop, GC, handles

### Health Checks
- `GET /health` — full composite (DB + Redis + memory)
- `GET /health/live` — liveness (process alive)
- `GET /health/ready` — readiness (DB + Redis up)
- `GET /health/database`, `/health/redis`, `/health/storage` — component-level
- `GET /health/version` — build metadata

### Alerting
- `monitoring/alerts.yml` — 6 Prometheus alert rules (BackendDown, HighErrorRate, HighLatency, NotificationDeliveryFailure, etc.)
- Activate with: `docker compose --profile monitoring up -d prometheus grafana`

### Client Error & Web Vitals Tracking
- `POST /client/errors` — report client-side JS errors (stored in `client_error_reports`)
- `POST /client/web-vitals` — report Web Vitals (LCP, CLS, FCP, etc.) (stored in `web_vitals_metrics`)
- Use from `ErrorBoundary.onError` in frontend

### Migration Table Summary
| Migration | Purpose |
|-----------|---------|
| 013 | Notification templates, delivery, digests, rate limits, analytics, dead letter queue |
| 014 | Notification broadcasts table |
| 015 | Enterprise platform: providers, devices, quiet hours, channel prefs, template versioning, webhooks, audit trail, A/B testing, feature flags, cleanup policies, event replay |
| 016 | Monitoring: alerting table, client error reports, web vitals metrics |
