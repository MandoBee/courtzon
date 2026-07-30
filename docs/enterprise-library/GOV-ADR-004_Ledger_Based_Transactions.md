---
document_id: "GOV-ADR-004"
document_name: "Ledger-Based Transaction Model"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 12
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-005"]
---

# ADR-004: Ledger-Based Transaction Model

**Status:** Accepted | **Date:** 2025-02-01

## Context

CourtZon handles financial movements (booking payments, marketplace payouts, wallet transactions, commissions, refunds) and inventory movements (stock in/out, adjustments, transfers). Both require:

1. **Immutability** — records must never be altered or deleted
2. **Auditability** — every movement must have a complete audit trail
3. **Before/After snapshots** — you must know the state before and after

Options:
1. **CRUD on balances** — Simple but no audit trail
2. **Ledger entries** — Immutable append-only logs
3. **Blockchain** — Over-engineered for this scale

## Decision

**Use immutable ledger entries for ALL financial and inventory movements.** No updates or deletes — only appends with before/after snapshots.

### Financial Ledger (`ledger_entries` table)

Every financial transaction creates balanced debit/credit pairs via `createLedgerPair()`:

```typescript
function createLedgerPair(
  transactionId, sourceType, sourceId,
  debitAccount, creditAccount, amount, currency, description
): [LedgerEntry, LedgerEntry] {
  // Returns [debit entry, credit entry] with equal amounts
}
```

**Evidence:** `financial/domain/ledger-aggregate.ts:58-74`.

Validation: `validateLedgerBalance()` (`:76-80`) ensures total debits === total credits.

### Inventory Ledger (`inventory_logs` table)

Every stock movement records:
- `stock_before` and `stock_after` — complete snapshot
- `movement_type` — `'in' | 'out' | 'adjustment'`
- `reason`, `reference_type`, `reference_id` — source provenance

**Evidence:** `inventory.controller.ts:397-401` (PO receive), `:473-477` (transfer out), `:543-546` (transfer in), `:590-593` (adjustment).

### Transaction Entries (`transaction_entries` table)

The `transaction.repository.ts` creates:
- `transactions` — top-level record
- `transaction_entries` — debit/credit entries per entity

**Evidence:** `financial/infrastructure/transaction.repository.ts:35-65` — `createTransaction()` + `createEntries()`.

## Consequences

**Positive:**
- Complete audit trail for every financial and inventory movement
- Impossible to lose money or inventory — every cent/unit is traceable
- Regulatory compliance (tax, audit)
- Before/after snapshots enable rollback analysis
- Double-entry ensures system-wide balance integrity

**Negative:**
- Storage grows unbounded (requires archiving strategy)
- Read-heavy queries need aggregation (reports materialize from ledger)
- More complex write path (two entries per transaction)
- Balance queries require SUM over ledger entries
