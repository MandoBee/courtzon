# Database seeds (CourtZon)

## Baseline snapshot (recommended for resets)

The **baseline snapshot** captures the current configured database (reference data, RBAC, CMS, plans, admin users, etc.) so you can recreate the same environment after a full reset.

| File | Purpose |
|------|---------|
| `003_baseline_snapshot.sql` | Auto-generated `INSERT IGNORE` dump (apply with `--seed`) |
| `baseline-manifest.json` | Export metadata: date, table list, row counts |

### Reset database to baseline

```bash
node backend/scripts/migrate.js --fresh --seed
```

This will:

1. Drop and recreate the database
2. Run all schema migrations (`database/schema/*.sql`)
3. Load `003_baseline_snapshot.sql`

Volatile data is **not** included (sessions, bookings, orders, audit logs, upgrade requests, etc.). See `EXCLUDED_TABLES` in `backend/scripts/export-baseline-seed.mjs`.

### Role permissions (after registry sync)

Templates assign the correct keys per role (`super_admin` = all permissions):

```bash
node backend/scripts/sync-ui-registry.js
node backend/scripts/sync-role-permissions.mjs
# Optional: remove grants outside template (not applied to super_admin)
node backend/scripts/sync-role-permissions.mjs --prune
```

`migrate.js --seed` runs `sync-role-permissions` automatically after the baseline snapshot. Migration `087_role_permissions_super_admin.sql` re-grants all keys to Super Admin on every migrate.

### Refresh baseline from current DB

After you change plans, permissions, CMS, countries, or admin setup in the UI:

```bash
node backend/scripts/export-baseline-seed.mjs
# or
node backend/scripts/export-baseline-seed.js
```

Commit `003_baseline_snapshot.sql` and `baseline-manifest.json` when the new baseline should be shared with the team.

Preview row counts without writing files:

```bash
node backend/scripts/export-baseline-seed.mjs --dry-run
```

## Legacy / demo seeds

| Command | Behavior |
|---------|----------|
| `--seed` | Baseline snapshot (`003`) when present |
| `--seed-legacy` | Old `001_seed_core.sql` + `002_seed_provinces_cities.sql` + migration DML extracts |
| `--seed-demo` | Also runs JS modules in `database/seed/run.mjs` (synthetic orgs, bookings, marketplace) |

Example — fresh DB with synthetic demo data on top of baseline:

```bash
node backend/scripts/migrate.js --fresh --seed --seed-demo
```

## Other seed files

| File | Notes |
|------|-------|
| `001_seed_core.sql` | Original hand-written core seed (legacy fallback) |
| `002_seed_provinces_cities.sql` | Egypt provinces/cities + polygons |
| `cms_seed.mjs`, `dynamic_seed.mjs` | Ad-hoc scripts; not used by default migrate |
| `database/seed/modules/*.mjs` | Used only with `--seed-demo` |

## Related docs

- `docs/data-cascade.md` — soft-delete cascade rules (baseline reset uses `--fresh`, not soft-delete)
- `README.md` — quick start commands
- `AGENTS.md` — agent rules for migrations and Docker
