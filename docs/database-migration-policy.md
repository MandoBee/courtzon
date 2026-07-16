# CourtZon Coach Platform — Database Migration Policy

> **Status:** APPROVED — Mandatory for all schema changes
> **Principle:** Database is the Source of Truth

---

## Rules

### 1. Database is the Source of Truth

- The database schema defines the system's data model
- Code must adapt to the schema, not the other way around
- Baseline schema is the single reference: `database/baseline/001_courtzon_v3.sql`

### 2. No Direct Production Schema Edits

- Never run `ALTER TABLE`, `CREATE TABLE`, or `DROP TABLE` directly on production
- Every schema change goes through a migration file
- Migrations are reviewed, version-controlled, and auditable

### 3. Every Schema Change Goes Through Migrations

- New tables, columns, indexes, constraints — all via migration files
- Migration files live in `database/migrations/`
- Naming convention: `NNN_description.sql` (sequential number)

### 4. Prefer Additive Changes

- Adding a column is safe (existing rows get NULL/default)
- Adding a table is safe
- Adding an index is safe (except on very large tables — use online index)
- Prefer additive changes over destructive changes

### 5. Avoid Destructive Migrations

- Never `DROP COLUMN` without deprecation period
- Never `DROP TABLE` without confirmation
- Never `TRUNCATE` production data
- Never `DELETE` data as part of schema migration

### 6. Deprecate Before Removing

- Step 1: Add new column/field
- Step 2: Migrate data to new column
- Step 3: Update code to use new column
- Step 4: Stop reading old column
- Step 5: Remove old column (next release, after verification)

### 7. Rollback Strategy

Every migration should have a rollback:

```sql
-- Migration: Add phone column
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Rollback: Remove phone column
ALTER TABLE users DROP COLUMN phone;
```

- Rollback scripts live alongside migration files
- Test rollback on staging before production
- If no rollback possible, document why and get approval

### 8. Breaking Changes Require Rollback Plan

- API breaking change + DB breaking change = high risk
- Never release both together without a rollback plan
- DB changes should be backward-compatible with current API
- API changes should be forward-compatible with current DB

---

## Migration Workflow

```
1. Create migration file
   └── database/migrations/017_add_phone_column.sql

2. Test on local database
   └── mysql -u root -p courtzon_v3 < database/migrations/017_add_phone_column.sql

3. Test rollback
   └── Run rollback script, verify schema reverts

4. Update baseline (after verification)
   └── Re-export full schema to database/baseline/

5. Review and merge

6. Apply to staging
   └── node backend/scripts/migrate.js

7. Apply to production
   └── node backend/scripts/migrate.js
```

---

## Migration File Format

```sql
-- Migration: 017_add_phone_column
-- Author: developer_name
-- Date: 2026-07-16
-- Description: Add phone number column to users table
-- Rollback: Yes (see bottom)

-- Forward migration
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER email;

-- Rollback
-- ALTER TABLE users DROP COLUMN phone;
```

---

## What Requires a Migration

| Change | Migration Required |
|--------|-------------------|
| New table | Yes |
| New column | Yes |
| New index | Yes |
| New constraint | Yes |
| Column type change | Yes |
| Column rename | Yes (add new, migrate, drop old) |
| Table rename | Yes (create new, migrate, drop old) |
| Data fix (one-time) | No (use script, document in release notes) |
| Seed data update | No (use seed script) |

---

*Every schema change goes through migrations. No exceptions. No direct production edits.*
