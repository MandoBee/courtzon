---
document_id: "GOV-ADR-019"
document_name: "HR-Payroll / Finance Boundary — HR Calculates, Finance Posts"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-23", "TECH-MOD-16", "TECH-MOD-12"]
  related: ["GOV-ADR-005", "GOV-ADR-004", "GOV-ADR-011"]
---

# ADR-019: Payroll / Finance Boundary — HR Calculates, Finance Posts

## Status

Accepted

## Context

The payroll run lifecycle spans two domains: HR (owns employee data, salary calculations, leave, attendance) and Finance/Accounting (owns the general ledger, accounting periods, accounts). The question is which module performs each step and where the boundary lies. This ADR extends GOV-ADR-011 with implementation details.

Common approaches include:

1. **HR does everything** — HR calculates and posts to the ledger; simple but HR needs knowledge of accounting schemas
2. **Finance does everything** — Finance receives raw data from HR and performs calculations; HR logic duplicated in Finance
3. **HR calculates, Finance posts via event** — loosely coupled; Finance subscribes to `payroll:calculated` event
4. **HR calculates, HR posts synchronously** — tight coupling at post time; single atomic transaction

## Decision

**HR owns payroll calculation; HR posts to Finance (writes to `general_ledger`) synchronously within a single database transaction.** The `posted` status is the boundary — before posting HR can re-calculate; after posting the payroll run is locked.

### Boundary Definition

```
HR domain:       draft → calculated → approved → posted
Finance domain:                                  posted → paid → closed
```

| Step | Owner | Detail |
|------|-------|--------|
| Create payroll run | HR | `POST /hr/payroll-runs` |
| Calculate earnings/deductions | HR | `POST /hr/payroll-runs/:id/calculate` |
| Approve | HR | `POST /hr/payroll-runs/:id/approve` |
| **Post to General Ledger** | **HR writes to GL** | `POST /hr/payroll-runs/:id/post` |
| Mark as paid | HR | `POST /hr/payroll-runs/:id/mark-paid` |
| Close | HR | `POST /hr/payroll-runs/:id/close` |

### How "Post" Works (the Cross-Domain Step)

The `postPayrollRunHandler` performs:

1. Writes to `payroll_runs` (owned by HR): sets `status = 'posted'`, `posted_at`, `posted_by`
2. Writes to `general_ledger` (owned by Finance): creates double-entry journal entries per employee

The GL entries follow the pattern:
- **Debit** (account_id = 1): Employee's net_pay (salary expense)
- **Credit** (account_id = 5): Employee's net_pay (salary payable)

This is done in a **single database transaction** within the HR controller. The HR controller has knowledge of the accounting schema (`general_ledger`, `accounting_periods`) but only for this specific posting operation.

**Evidence:** `hr.controller.ts:1376-1445` — `postPayrollRunHandler` writes to both `payroll_runs` and `general_ledger`.

### Current vs. Future Architecture

| Aspect | Current (MVP) | Future (Event-Driven) |
|--------|--------------|----------------------|
| Post timing | Synchronous in HR controller | Async via `payroll:calculated` event |
| GL knowledge | HR controller knows GL account IDs (1 and 5) | Finance resolves accounts via chart-of-accounts service |
| Transaction boundary | Single DB transaction across HR + Finance | Separate transactions; saga pattern for rollback |
| Coupling | Tight (HR imports Finance schema) | Loose (event-based, no direct imports) |

## Consequences

### Positive

- **HR owns payroll logic**: Calculation rules (fixed amounts, percentages of base salary, component breakdowns) live in HR where domain expertise resides
- **Finance owns the ledger**: General ledger, accounting periods, and chart of accounts are managed by Finance
- **Single atomic transaction**: Post operation is atomic — if GL writing fails, HR status update rolls back
- **Clear lifecycle**: `posted` status is the handoff point; before posting HR can re-calculate (`draft` → calculated → `draft`)

### Negative

- **Tight coupling at post time**: HR controller has hardcoded knowledge of GL account IDs (`account_id = 1` and `account_id = 5`)
- **No async boundary**: Synchronous post means HR controller directly writes to Finance tables
- **Cross-domain dependency**: HR tests require Finance schema; Finance schema changes may break HR post logic

## Evidence

- `hr.controller.ts:1376-1445` — `postPayrollRunHandler` writes to both `payroll_runs` and `general_ledger`
- `hr.controller.ts:1259-1349` — `calculatePayrollRunHandler` (HR-only, no Finance involvement)
- GOV-ADR-005 (Finance Owns Financial Truth): The general ledger is the authoritative financial record
- GOV-ADR-004 (Ledger Based Transactions): All financial movements use double-entry

## Related Decisions

- GOV-ADR-005 (Finance Owns Financial Truth): General ledger is the authoritative financial record
- GOV-ADR-004 (Ledger Based Transactions): All financial movements use double-entry
- GOV-ADR-011 (HR Payroll — Finance Separation): Original ADR establishing the boundary principle
