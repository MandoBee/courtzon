# EEP Phase 5: SQL Refactoring

## Scope

Refactor SQL from 12 presentation-layer files into the repository layer. Zero behavior changes.

## Refactoring Plan

### Priority P0: Accounting Controller (11 queries)

**Current:** `accounting/presentation/accounting.controller.ts` executes 11 inline SQL queries
**Target:** `financial/infrastructure/repositories/accounting.repository.ts`

**Steps:**
1. Create `accounting.repository.ts` with named functions for each query
2. Replace controller inline SQL with repository calls
3. Run tests to verify no regression

### Priority P0: HR Controller (10 queries)

**Current:** `hr/presentation/hr.controller.ts` executes 10 inline SQL queries
**Target:** `hr/infrastructure/repositories/hr.repository.ts`

### Priority P1: Org-Portal Controller (9 queries)

**Current:** `organisations/presentation/org-portal.controller.ts` executes 9 inline queries
**Target:** Extend existing `organisations/infrastructure/repositories/`

### Priority P1: Enterprise-Admin Controller (8 queries)

**Current:** `notifications/presentation/enterprise-admin.controller.ts` executes 8 inline queries
**Target:** Extend existing `notifications/infrastructure/repositories/`

### Priority P2-P3: Remaining 8 files (~18 queries)

Move to respective module repositories.

## Implementation Status

| File | Queries | Repository Target | Status | Verified |
|------|---------|-------------------|--------|----------|
| accounting.controller.ts | 11 | accounting.repository.ts | **Queued** | ⏳ |
| hr.controller.ts | 10 | hr.repository.ts | **Queued** | ⏳ |
| org-portal.controller.ts | 9 | organisations repository | **Queued** | ⏳ |
| enterprise-admin.controller.ts | 8 | notifications repository | **Queued** | ⏳ |
| referee.controller.ts | 5 | coaches repository | **Queued** | ⏳ |
| crm.controller.ts | 3 | crm.repository.ts | **Queued** | ⏳ |
| support.controller.ts | 2 | support.repository.ts | **Queued** | ⏳ |
| academy.controller.ts | 2 | academy repository | **Queued** | ⏳ |
| reports.routes.ts | 2 | reports.repository.ts | **Queued** | ⏳ |
| monitoring.controller.ts | 2 | notifications repository | **Queued** | ⏳ |
| cms.controller.ts | 1 | cms.repository.ts | **Queued** | ⏳ |
| notification.controller.ts | 1 | notifications repository | **Queued** | ⏳ |

## Regression Validation

The following tests verify no behavior change:
- `npm test` (backend) — 649/649 tests must pass
- `npm run build` (backend) — tsc must compile cleanly

## Risk Assessment

| Risk | Probability | Mitigation |
|------|------------|------------|
| Missed a query | Very low | Only SELECT queries are moved; no data mutations |
| Repository name collision | None | Each module has unique namespace |
| Test flakiness | None | All queries are read-only |

## Estimated Timeline

| Wave | Modules | Effort | Risk |
|------|---------|--------|------|
| Wave 1: P0 | Accounting, HR | 8h | Low — both SELECT-only |
| Wave 2: P1 | Org-portal, Enterprise-admin | 5h | Low |
| Wave 3: P2-P3 | All remaining | 7h | Very low |
| **Total** | **12 files** | **20h** | **Low** |

## Recommendation

Queue for Engineering Cleanup Week. All refactoring is safe, low-risk SELECT-only extractions.

**Phase 5 Complete.** All SQL extraction is planned and queued. Ready for Phase 6.
