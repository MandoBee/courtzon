---
document_id: "GOV-ADR-025"
document_name: "Database Migration Strategy — Additive SQL with Authoritative Baseline"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["developer", "database-administrator"]
difficulty: "intermediate"
reading_time: 6
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-DEV-10", "TECH-ARCH-05"]
  related: []
---

# ADR-025: Database Migration Strategy — Additive SQL with Authoritative Baseline

## Status

Accepted

## Context

CourtZon V3 has 162 database tables. Schema changes must be tracked, version-controlled, and deployable from scratch. The project inherited a legacy migration chain from V2 (128 files in `archive/database/schema/`). Common approaches include:

1. **Migration framework (e.g., Knex, TypeORM)** — automated, programmatic; but framework lock-in, complex rollbacks, and hidden state
2. **Sequential SQL files with metadata table** — simple, visible, reversible; but manual ordering and file management
3. **Single authoritative baseline + no migrations** — simple; but requires full re-export on every change

## Decision

**Use additive SQL migrations with a single authoritative baseline.** New schema changes go in `database/migrations/NNN_description.sql` files. The baseline `database/baseline/001_courtzon_v3.sql` is periodically re-exported to include all applied migrations. The `_migrations` table tracks which files have been applied.

### Architecture

```
database/
  ├─ baseline/
  │   └─ 001_courtzon_v3.sql        ← Full schema (162 tables, re-exported periodically)
  ├─ migrations/
  │   ├─ 013_notification_templates.sql
  │   ├─ 014_notification_broadcasts.sql
  │   ├─ 015_enterprise_platform.sql
  │   └─ 016_monitoring_tables.sql
  └─ seeds/
      └─ 001_baseline.sql            ← Reference data (countries, permissions, etc.)
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Migration engine | `node backend/scripts/migrate.js` — applies pending migrations | `scripts/migrate.js` |
| Tracking table | `_migrations` — records filename, batch, and applied timestamp | (internal to migration script) |
| File naming | `NNN_descriptive_name.sql` — zero-padded sequential number | `database/migrations/` |
| Baseline re-export | Full chain run against fresh DB, then mysqldump | (manual, per process in AGENTS.md) |
| Seed data | `node backend/scripts/seed.js` — imports reference data | `scripts/seed.js` |
| Migration status | `node scripts/migrate.js --status` — shows applied/pending | `scripts/migrate.sh` |
| Fresh install | `node scripts/migrate.js --fresh` — drops all, re-imports baseline | `scripts/migrate.sh` |

### Additive-Only Rule

Migrations must only add objects. Never alter or drop existing columns, tables, or constraints.

```sql
-- GOOD: Add a new table
CREATE TABLE notification_broadcasts ( ... );

-- GOOD: Add a new column
ALTER TABLE bookings ADD COLUMN notes TEXT NULL;

-- BAD: Drop a column
ALTER TABLE users DROP COLUMN legacy_field;

-- BAD: Change column type
ALTER TABLE products MODIFY COLUMN price DECIMAL(12,2);

-- BAD: Drop a table
DROP TABLE deprecated_reports;
```

**Evidence:** `TECH-DEV-10_Migration_Standards.md` codifies the additive-only rule.

### Workflow

```
1. Developer creates database/migrations/017_add_feature.sql
2. Runs: node scripts/migrate.js
3. Migration applied to local/development database
4. When preparing release:
   a. Apply all migrations to fresh DB
   b. Re-export baseline: mysqldump > database/baseline/001_courtzon_v3.sql
   c. Commit both the migration and updated baseline
```

## Consequences

### Positive

- **No framework dependency**: Pure SQL — works with any MySQL client
- **Visible state**: Migration files are plain SQL; `_migrations` table shows what's applied
- **Reversible**: Each migration can be manually reversed (but automatic rollback is not built in)
- **Fresh install possible**: Baseline + migrations = full schema from scratch
- **Historical clarity**: Archived V2 migrations preserved for audit but never required
- **Simple CI/CD**: Migrate command is a single Node.js script

### Negative

- **Manual ordering**: Developers must ensure sequential numbering doesn't conflict
- **Baseline drift**: Baseline must be manually re-exported; if forgotten, fresh installs break
- **No automatic rollback**: If a migration fails mid-way, manual cleanup may be needed (mitigated by `--fresh` flag which starts from scratch)
- **Seed data not in migrations**: Reference data is separate from schema; schema + seed must be applied in the right order

## Evidence

- `scripts/migrate.js:1-30` — migration runner that delegates to `migrate.sh`
- `database/baseline/001_courtzon_v3.sql` — single authoritative baseline (3586 lines, 162 tables)
- `database/migrations/` — sequential SQL files (013 through 016)
- `TECH-DEV-10_Migration_Standards.md` — additive-only rule and naming convention
- `docs/database-migration-policy.md` — full migration governance policy

## Related Decisions

- TECH-DEV-10 (Migration Standards): Detailed coding standards for migration files
