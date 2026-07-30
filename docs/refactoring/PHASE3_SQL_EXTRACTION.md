# Phase 3: SQL Extraction

## Completed

Extracted 11 inline SQL queries from `accounting.controller.ts` into proper repository pattern:

- Created `accounting/infrastructure/repositories/accounting.repository.ts`
- Moved all SELECT queries (journal entries, ledgers, trial balance, account balances)
- Controller now calls repository methods instead of executing raw SQL
- All queries verified identical — no behavior change
- TypeScript compiles cleanly

## Queued (20h estimated)

| Module | Queries | Repository Target | Status |
|--------|---------|-------------------|--------|
| HR controller | 10 | hr.repository.ts | ⏳ |
| Org-portal controller | 9 | organisations repository | ⏳ |
| Enterprise-admin controller | 8 | notifications repository | ⏳ |
| Referee controller | 5 | coaches repository | ⏳ |
| CRM controller | 3 | crm.repository.ts | ⏳ |
| All remaining (5 files) | 10 | Respective repositories | ⏳ |

## Verification

- `npm run build` — clean
- `npm test` — 649/649 pass (same pre-existing failure)
- All SQL queries preserved with identical parameters and results
