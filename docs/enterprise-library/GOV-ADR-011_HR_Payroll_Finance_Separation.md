---
document_id: "GOV-ADR-011"
document_name: "HR Payroll — Finance Separation"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Architect"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-23", "TECH-MOD-16", "TECH-MOD-12"]
  related: ["GOV-ADR-005", "GOV-ADR-004"]
---

# ADR-011: HR Calculates Payroll, Finance Posts It

## Status

Accepted

## Context

The payroll run lifecycle includes a "post to finance" step where payroll data becomes accounting entries. Two domains are involved: HR (owns employee data, salary calculations, leave, attendance) and Finance/Accounting (owns the general ledger, accounting periods, accounts). The question is which module performs each step.

## Decision

**HR owns payroll calculation; Finance owns accounting posting.** The boundary is the `posted` status:

```
HR domain:       draft → calculated → approved → posted
Finance domain:                                  posted → paid → closed
```

### Boundary Definition

| Step | Owner | Detail |
|------|-------|--------|
| Create payroll run | HR | `POST /hr/payroll-runs` |
| Calculate (compute earnings/deductions) | HR | `POST /hr/payroll-runs/:id/calculate` |
| Approve | HR | `POST /hr/payroll-runs/:id/approve` |
| **Post to General Ledger** | **HR writes to GL** | `POST /hr/payroll-runs/:id/post` |
| Mark as paid | HR | `POST /hr/payroll-runs/:id/mark-paid` |
| Close | HR | `POST /hr/payroll-runs/:id/close` |

### How "Post" Works (the Cross-Domain Step)

The `postPayrollRunHandler` (`hr.controller.ts:1376-1445`) performs:

1. Writes to `payroll_runs` (owned by HR): sets `status = 'posted'`, `posted_at`, `posted_by`
2. Writes to `general_ledger` (owned by Finance): creates double-entry journal entries per employee

The GL entries follow the pattern:
- **Debit** (account_id = 1): Employee's net_pay (salary expense)
- **Credit** (account_id = 5): Employee's net_pay (salary payable)

This is done in a **single database transaction** within the HR controller. The HR controller has knowledge of the accounting schema (`general_ledger`, `accounting_periods`) but only for this specific posting operation.

## Consequences

### Positive

- **HR owns payroll logic**: Calculation rules (fixed amounts, percentages of base salary, component breakdowns) live in HR where domain expertise resides.
- **Finance owns the ledger**: The general ledger, accounting periods, and chart of accounts are managed by Finance. HR does not create accounts or modify accounting periods.
- **Single atomic transaction**: The post operation is atomic — if GL writing fails, the HR status update rolls back.
- **Clear lifecycle**: The `posted` status is the handoff point. Before posting, HR can re-calculate (go back to `draft`). After posting, payroll is locked for HR editing.

### Negative

- **Tight coupling at post time**: The HR controller has hardcoded knowledge of GL account IDs (`account_id = 1` and `account_id = 5`). This should ideally be configurable or resolved through a chart-of-accounts service.
- **No async boundary**: Currently the post happens synchronously. An event-driven approach (`payroll:calculated` → Finance listens and posts) would be more decoupled but adds complexity.

## Future Direction

The `payroll:calculated` event (when implemented) should allow Finance to independently subscribe and post. The current synchronous approach is an MVP simplification.

## Evidence

- `hr.controller.ts:1376-1445` — `postPayrollRunHandler` writes to both `payroll_runs` and `general_ledger`
- `hr.controller.ts:1259-1349` — `calculatePayrollRunHandler` (HR-only, no Finance involvement)
- `database/migrations/070_hr_payroll.sql:158-178` — `payroll_runs` table (owned by HR)
- `GOV-ADR-005` — Finance Owns Financial Truth

## Related Decisions

- GOV-ADR-005 (Finance Owns Financial Truth): The general ledger is the authoritative financial record
- GOV-ADR-004 (Ledger Based Transactions): All financial movements use double-entry
