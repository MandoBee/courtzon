# Phase 5: Migration Strategy

**Generated:** 2026-06-24
**Objective:** Define the single authoritative migration strategy for CourtZon V3.

---

## 5.1 Current State Assessment

| Metric | Value | Verdict |
|--------|-------|---------|
| Total migration files | 128 SQL files in `database/schema/` | **BLOATED** |
| Migration types | Schema creation, alterations, renames, grants, data inserts | **MIXED CONCERNS** |
| Rollback support | None | **MISSING** |
| Lenient error skipping | 8 error codes silently skipped | **DANGEROUS** |
| Auto-migrate on startup | Yes (in docker-entrypoint.sh) | **MUST REMOVE** |
| Migration tracking | `migration_history` table (added in #128) | **INCOMPLETE** |

---

## 5.2 Baseline Consolidation Plan

### Step 1: Generate the Baseline

Run the following commands to generate the authoritative baseline:

```bash
# Connect to a fresh DB, run all migrations + seed
node backend/scripts/migrate.js --fresh --seed

# Dump the cumulative schema (structure only, no data)
mysqldump --no-data --routines --triggers --events \
  --host=localhost --port=3306 --user=root --password=... \
  courtzon_v2 > database/baseline/001_courtzon_v3.sql
```

The resulting `001_courtzon_v3.sql` will contain:
- All `CREATE TABLE` statements with current column definitions
- All indexes and constraints
- All triggers and events
- No `INSERT` data (data is seed, not migration)

### Step 2: Archive Old Migrations

```bash
# Move all 128 migration files to archive
mv database/schema/ archive/database/schema/
```

### Step 3: New Directory Structure

```
database/
├── baseline/
│   └── 001_courtzon_v3.sql       ← Single authoritative schema
├── migrations/
│   └── (future numbered migrations)
├── seeds/
│   └── 001_baseline.sql           ← Seed data (copied from 003_baseline_snapshot.sql)
└── scripts/
    └── setup-db-users.sql         ← Database user setup
```

---

## 5.3 Future Migration Convention

### Naming Convention

```
migrations/YYYYMMDD_HHMMSS_description.sql
```

Example:
```
migrations/20260624_120000_add_user_preferences.sql
```

### Migration File Format

Every migration must include:
- `-- UP:` section for forward migration
- `-- DOWN:` section for rollback (optional but recommended)
- Idempotent DDL (`IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`)

Example:
```sql
-- UP:
ALTER TABLE users ADD COLUMN preferences JSON DEFAULT NULL AFTER timezone;
CREATE INDEX idx_user_preferences ON users((CAST(preferences->>'$.theme' AS CHAR(10))));

-- DOWN:
DROP INDEX idx_user_preferences ON users;
ALTER TABLE users DROP COLUMN preferences;
```

### Migration Runbook

```bash
# Apply all pending migrations
scripts/migrate.sh

# Check migration status
scripts/migrate.sh --status

# Manual rollback
scripts/migrate.sh --rollback 20260624_120000
```

---

## 5.4 New Migration Runner Requirements

The replacement for `backend/scripts/migrate.js` (`scripts/migrate.sh`) must be:

| Requirement | Implementation |
|-------------|----------------|
| **Idempotent** | `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF EXISTS` |
| **Logged** | Each run writes to `migration_history` table with hash, timestamp, duration |
| **Explicit** | No silent error skipping — fail loudly on unexpected errors |
| **Rollback aware** | Down migrations supported (optional but tracked) |
| **No seed mixing** | Migrations do NOT contain seed data |
| **No auto-run on startup** | Must be executed manually only |

---

## 5.5 Execution Plan

| Phase | Action | When |
|-------|--------|------|
| Before V3 cutover | Generate `001_courtzon_v3.sql` from current schema | Before first V3 deploy |
| V3 cutover | Archive `database/schema/` → `archive/database/schema/` | During restructuring |
| V3 cutover | Place `001_courtzon_v3.sql` in `database/baseline/` | During restructuring |
| V3+ | All new schema changes → `database/migrations/` | Ongoing |
| V3+ | New runner → `scripts/migrate.sh` | Phase 14 |
| V3+ | `migration_history` table tracks all future runs | Ongoing |

---

## 5.6 Migration History Table Schema

```sql
-- Created by baseline migration
CREATE TABLE IF NOT EXISTS migration_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  filename      VARCHAR(255) NOT NULL UNIQUE,
  hash          VARCHAR(64) NOT NULL COMMENT 'SHA-256 of migration file content',
  direction     ENUM('up', 'down') NOT NULL DEFAULT 'up',
  execution_ms  INT DEFAULT 0,
  applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5.7 Risk Assessment

| Risk | Mitigation |
|------|------------|
| Baseline generation might differ from cumulative migrations | Test on fresh DB: run all 128 migrations + compare schema with baseline |
| `--fresh` on production | Baseline is only for fresh deployments; existing DBs use normal migrations |
| Lost migration history tracking | Old `migration_history` entries preserved; V3 tracking starts clean |
| Triggers/events missed in dump | `--routines --triggers --events` flags in mysqldump |
