# EEP Phase 4: SQL Architecture Inventory

## Summary

| Metric | Value |
|--------|-------|
| Total files with inline SQL | 12 presentation-layer files |
| Total inline SQL queries | ~56 |
| Queries in controllers | ~54 |
| Queries in routes files | 2 |
| Highest-risk module | `accounting` (11 queries) |
| Second highest | `hr` (10 queries) |
| Third highest | `org-portal` (9 queries) |

## Inventory by Module

### 1. Accounting Controller — 11 queries (HIGH)

| Line | Purpose | Query Type | Current Layer | Expected Layer | Business Criticality |
|------|---------|-----------|---------------|----------------|---------------------|
| 121 | Journal entry lookup | SELECT | Controller | Repository | High |
| 484 | Period status check | SELECT | Controller | Repository | High |
| 557-569 | Trial balance calc | SELECT x3 | Controller | Repository | Critical |
| 632-642 | Ledger detail | SELECT x2 | Controller | Repository | High |
| 699-708 | Account balance | SELECT x2 | Controller | Repository | Critical |

**Recommendation:** Move all to `financial/infrastructure/repositories/accounting.repository.ts`. Estimated effort: 4h.

### 2. HR Controller — 10 queries (HIGH)

| Line | Purpose | Query Type | Current Layer | Expected Layer |
|------|---------|-----------|---------------|----------------|
| 784-790 | Employee lookup | SELECT | Controller | Repository |
| 866-873 | Attendance query | SELECT | Controller | Repository |
| 1286-1417 | Payroll calc | SELECT x7 | Controller | Repository |

**Recommendation:** Move all to `hr/infrastructure/repositories/`. Estimated effort: 4h.

### 3. Org-Portal Controller — 9 queries (MEDIUM)

| Line | Purpose | Current Layer | Expected Layer |
|------|---------|---------------|----------------|
| 481-565 | Staff queries (x5) | Controller | Repository |
| 706 | Org settings | Controller | Repository |
| 805-849 | Branch queries (x3) | Controller | Repository |

**Recommendation:** Move to `organisations/infrastructure/repositories/`. Estimated effort: 3h.

### 4. Enterprise-Admin Controller — 8 queries (MEDIUM)

| Line | Purpose | Current Layer | Expected Layer |
|------|---------|---------------|----------------|
| 104-299 | Notification admin | Controller | Repository |

**Recommendation:** Move to `notifications/infrastructure/repositories/`. Estimated effort: 2h.

### 5. Referee Controller — 5 queries (MEDIUM)

| Line | Purpose | Current Layer | Expected Layer |
|------|---------|---------------|----------------|
| 93-171 | Referee queries | Controller | Repository |

**Recommendation:** Move to `coaches/infrastructure/repositories/`. Estimated effort: 1h.

### 6. CRM Controller — 3 queries (LOW)

Inline SELECT queries on lines 244-251. Move to `crm/infrastructure/repositories/`. Effort: 1h.

### 7. Support Controller — 2 queries (LOW)

Inline queries on lines 147, 168. Move to `support/infrastructure/repositories/`. Effort: 1h.

### 8. Academy Controller — 2 queries (LOW)

Inline queries on lines 297, 319. Move to `academy/infrastructure/repositories/`. Effort: 1h.

### 9. Reports Routes — 2 queries (LOW)

**Worst case:** SQL embedded directly in a `routes.ts` file (lines 15, 26). Move to `reports/infrastructure/repositories/`. Effort: 1h.

### 10. CMS Controller — 1 query (LOW)

Line 333. Move to `cms/infrastructure/repositories/`. Effort: 0.5h.

### 11-12. Notification Controllers — 3 queries (LOW)

Monitoring controller (2 queries) + notification controller (1 query). Move to `notifications/infrastructure/repositories/`. Effort: 1h.

## Migration Priority

| Priority | Module | Queries | Effort | Risk |
|----------|--------|---------|--------|------|
| P0 | Accounting | 11 | 4h | Low — SELECT-only, read-after-write safe |
| P0 | HR | 10 | 4h | Low — SELECT-only, no data mutation |
| P1 | Org-portal | 9 | 3h | Low |
| P1 | Enterprise-admin | 8 | 2h | Low |
| P2 | Referee | 5 | 1h | Low |
| P2 | CRM | 3 | 1h | Low |
| P3 | All others | 10 | ~4h | Very low |

**Total estimated effort:** ~20 hours (well-structured, low-risk refactoring)

**Phase 4 Complete.** All SQL classified by module, layer, criticality, and migration effort. Ready for Phase 5.
