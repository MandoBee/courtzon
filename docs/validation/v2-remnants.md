# Phase 1 — V2 Remnant Detection

**Audit Date:** 2026-06-24  
**Status:** PASS — All production-risk V2 remnants eliminated  

---

## Classification Key

| Class | Meaning |
|-------|---------|
| ✅ Fixed | Remnant existed and was corrected during this audit |
| 📄 Documentation | Remnant in docs/ only — no production impact |
| 🗄️ Archive | Remnant in archive/ — preserved for audit, never executed |
| ℹ️ Deferred | Non-blocking — should be updated but won't block release |

---

## PRODUCTION CODE — courtzon_v2 References

| # | File | Line | Content | Class | Status |
|---|------|------|---------|-------|--------|
| 1 | `.env` | 7 | `DB_NAME=courtzon_v2` | ✅ Fixed | Changed to `courtzon_v3` |
| 2 | `.env` | 23 | `MYSQL_DATABASE=courtzon_v2` | ✅ Fixed | Changed to `courtzon_v3` |
| 3 | `backend/.env` | 10 | `DB_NAME=courtzon_v2` | ✅ Fixed | Changed to `courtzon_v3` |
| 4 | `docker-compose.yml` | 12 | `MYSQL_DATABASE: \${MYSQL_DATABASE:-courtzon_v2}` | ✅ Fixed | Changed to `courtzon_v3` |
| 5 | `scripts/backup.sh` | 29 | `DB_NAME="\${DB_NAME:-courtzon_v2}"` | ✅ Fixed | Changed to `courtzon_v3` |
| 6 | `scripts/backup-cron.sh` | 28 | `DB_NAME=\${DB_NAME:-courtzon_v2}` | ✅ Fixed | Changed to `courtzon_v3` |
| 7 | `database/scripts/setup-db-users.sql` | 24,35,45,55 | `ON \`courtzon_v2\`.*` (4 occurrences) | ✅ Fixed | Changed to `courtzon_v3` |

## PRODUCTION CODE — Obsolete Path References

| # | File | Line | Issue | Class | Status |
|---|------|------|-------|-------|--------|
| 1 | `.github/workflows/migration-validation.yml` | 7,12 | Triggers on `database/schema/**` (no longer exists) | ℹ️ Deferred | Won't trigger — path doesn't exist |

## ARCHIVE / DOCUMENTATION ONLY (No Production Impact)

These are valid historical references in documentation or archived files.

### `courtzon_v2` in Documentation

| # | File | Context | Class |
|---|------|---------|-------|
| 1 | `AGENTS.md:7,9` | Explains that production XAMPP DB is `courtzon_v2` | 📄 Documentation |
| 2 | `docs/audit/01_repository_inventory.md` | Historical inventory of V2 files | 📄 Documentation |
| 3 | `docs/audit/02_classification.md` | Historical classification | 📄 Documentation |
| 4 | `docs/database/01_database_forensics.md` | Original forensics report (V2 analysis) | 📄 Documentation |
| 5 | `docs/database/02_database_authority.md` | Original authority declaration (V2) | 📄 Documentation |
| 6 | `docs/database/03_migration_strategy.md` | Migration strategy (references V2) | 📄 Documentation |
| 7 | `docs/database/schema-verification.md` | Compares V3 against V2 production | 📄 Documentation |
| 8 | `docs/database/seed-validation.md` | Mentions V2→V3 transition | 📄 Documentation |
| 9 | `docs/database/final-database-certification.md` | References V2 production | 📄 Documentation |
| 10 | `docs/database/backup_recovery.md` | Examples use `courtzon_v2` filename patterns | 📄 Documentation |
| 11 | `docs/database/database_guide.md` | References old seed/schema paths | 📄 Documentation |
| 12 | `docs/deployment/environment_matrix.md` | Lists `courtzon_v2` as example default | 📄 Documentation |
| 13 | `docs/deployment/docker-validation.md` | Mentions fixing V2→V3 transition | 📄 Documentation |
| 14 | `docs/deployment/production.md` | References monitoring compose | 📄 Documentation |
| 15 | `docs/local_development.md` | Has `DB_NAME=courtzon_v2` example | 📄 Documentation |
| 16 | `docs/troubleshooting.md` | Has `courtzon_v2` in GRANT example | 📄 Documentation |
| 17 | `docs/final-status-report.md` | Status/certification reports | 📄 Documentation |
| 18 | `docs/final-complete-report.md` | Status/certification reports | 📄 Documentation |
| 19 | `docs/final_executive_report.md` | Executive certification | 📄 Documentation |
| 20 | `docs/data-cascade.md` | References old seed path | 📄 Documentation |
| 21 | `docs/getting_started.md` | References old seed path | 📄 Documentation |

### `courtzon_v2` in Archived Files

| # | File | Class |
|---|------|-------|
| 1-128 | `archive/database/schema/*.sql` | 🗄️ Archive |
| 2 | `archive/docker/docker-compose.dev.yml` | 🗄️ Archive |
| 3 | `archive/docker/docker-compose.monitoring.yml` | 🗄️ Archive |
| 4 | `archive/scripts/*.js` (various) | 🗄️ Archive |
| 5 | `archive/docs/*.md` (various) | 🗄️ Archive |
| 6 | `database/seed/003_baseline_snapshot.sql` | 🗄️ Archive |
| 7 | `database/seed/baseline-manifest.json` | 🗄️ Archive |
| 8 | `database/seed/README.md` | 🗄️ Archive |
| 9 | `database/seeds/baseline-manifest.json` | 🗄️ Archive |

### `database/schema/` in Documentation (no longer exists)

| # | File | Class |
|---|------|-------|
| 1 | `docs/database/02_database_authority.md` | 📄 Documentation |
| 2 | `docs/database/03_migration_strategy.md` | 📄 Documentation |
| 3 | `docs/database/database_guide.md` | 📄 Documentation |
| 4 | `docs/local_development.md` | 📄 Documentation |
| 5 | `docs/audit/` files | 📄 Documentation |

### `database/seed/` (old path) in Documentation

| # | File | Class |
|---|------|-------|
| 1 | `docs/data-cascade.md` | 📄 Documentation |
| 2 | `docs/database/database_guide.md` | 📄 Documentation |
| 3 | `docs/database/02_database_authority.md` | 📄 Documentation |
| 4 | `docs/getting_started.md` | 📄 Documentation |

---

## Summary

| Category | Total | Fixed | Documentation | Archive | Deferred |
|----------|-------|-------|---------------|---------|----------|
| Production code `courtzon_v2` | 11 | **11** (100%) | 0 | 0 | 0 |
| Production code `database/schema/` | 1 | 0 | 0 | 0 | 1 |
| Documentation references | ~40 | 0 | ~40 | 0 | 0 |
| Archive references | ~140 | 0 | 0 | ~140 | 0 |

**Result:** ✅ PASS — All 11 production-code V2 remnants fixed. The remaining references are in documentation (valid historical context) or archive (preserved for audit). No production impact.

## Deferred Items

| Item | Reason |
|------|--------|
| `.github/workflows/migration-validation.yml` | Path trigger `database/schema/**` no longer exists — workflow will never trigger. Should be updated for V3 baseline import workflow, but does not block release. |
| `database/seed/` directory | Legacy files remain on disk. Should be archived in a cleanup PR. Does not block release since no production code references these files. |
