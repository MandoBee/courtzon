---
document_id: "TECH-DEV-10"
document_name: "Database Migration Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer", "database-administrator"]
difficulty: "intermediate"
reading_time: 12
depends_on: []
related: ["TECH-DEV-04", "TECH-DEV-14", "TECH-ARCH-03"]
---

# CourtZon Database Migration Standards

## 1. Purpose

Define mandatory standards for creating, applying, and managing database migrations in CourtZon.

## 2. Migration Architecture

CourtZon V3 uses a **single authoritative baseline** plus sequential migration files:

- **Baseline:** `database/baseline/001_courtzon_v3.sql` (full schema, 162 tables)
- **Migrations:** `database/migrations/NNN_descriptive_name.sql` (incremental changes)
- **Migration engine:** `backend/scripts/migrate.js` (tracks applied migrations in `_migrations` table)

## 3. File Naming

```
NNN_descriptive_name.sql
```

| Part | Rule | Example |
|------|------|---------|
| `NNN` | Zero-padded, sequential number | `001`, `042` |
| `descriptive_name` | snake_case, max 5 words | `add_booking_notes`, `create_notification_templates` |
| Extension | `.sql` | |

**Evidence:** `database/migrations/` contains `013_notification_templates.sql`, `014_notification_broadcasts.sql`, `015_enterprise_platform.sql`, `016_monitoring_tables.sql`.

## 4. Migration Content

### 4.1 Additive-Only Rule

**Migrations must only add objects. Never alter or drop existing columns, tables, or constraints.**

```sql
-- GOOD: Add a new table
CREATE TABLE booking_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- GOOD: Add a new column (nullable or with default)
ALTER TABLE bookings ADD COLUMN notes TEXT NULL AFTER end_time;

-- BAD: Dropping a column
ALTER TABLE bookings DROP COLUMN notes;

-- BAD: Changing a column type
ALTER TABLE bookings MODIFY COLUMN status VARCHAR(50);

-- BAD: Dropping a table
DROP TABLE bookings;
```

**Rationale:** Additive-only ensures backward compatibility. Production must never lose data.

### 4.2 Required Structure

Every migration file must wrap DDL in a transaction:

```sql
START TRANSACTION;

-- Migration: 042
-- Description: Add booking notes table
-- Author: Jane Doe
-- Date: 2026-07-28

CREATE TABLE booking_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- Update baseline note
-- Run after: node backend/scripts/migrate.js

COMMIT;
```

## 5. Rollback Policy

**Migrations are not rolled back.** If a migration must be reverted, create a new migration that reverses the change additively:

```sql
-- 043: Mark booking_notes as deprecated (do not drop the table)
ALTER TABLE booking_notes ADD COLUMN deprecated_at TIMESTAMP NULL;
```

## 6. Testing Migrations

Before committing a migration:

```bash
# 1. Apply migration locally
node backend/scripts/migrate.js --status    # Check pending
node backend/scripts/migrate.js              # Apply

# 2. Verify schema
mysql -u root -p courtzon_v3 -e "DESCRIBE bookings"

# 3. Roll forward (re-apply) to test idempotency
# Migration engine tracks applied files — re-applying is safe
node backend/scripts/migrate.js
```

## 7. Baseline Updates

After adding new migrations, update the baseline:

```bash
# 1. Run all pending migrations against a fresh database
mysql -u root -p -e "DROP DATABASE IF EXISTS courtzon_v3; CREATE DATABASE courtzon_v3;"
mysql -u root -p courtzon_v3 < database/baseline/001_courtzon_v3.sql  # original baseline
node backend/scripts/migrate.js                                        # apply all pending

# 2. Re-export as new baseline
mysqldump -u root -p --no-data courtzon_v3 > database/baseline/001_courtzon_v3.sql
```

## 8. Migration Status

Check which migrations are applied:

```bash
node backend/scripts/migrate.js --status
```

Expected output:
```
Applied: 013_notification_templates.sql
Applied: 014_notification_broadcasts.sql
Applied: 015_enterprise_platform.sql
Applied: 016_monitoring_tables.sql
Pending: 042_add_booking_notes.sql
```

## 9. Prohibited Operations

| Operation | Why |
|-----------|-----|
| `DROP TABLE` | Destructive, irreversible |
| `DROP COLUMN` | Destructive, irreversible |
| `ALTER ... MODIFY` type | May truncate or corrupt data |
| `RENAME TABLE` | Breaks running application |
| `TRUNCATE TABLE` | Destructive, irreversible |
| Direct `DROP DATABASE` | Never in production |

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-04 | Naming Conventions (table/column naming) |
| TECH-DEV-14 | Security Coding Standards (SQL injection prevention) |
| TECH-ARCH-03 | Database Architecture (schema overview) |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
