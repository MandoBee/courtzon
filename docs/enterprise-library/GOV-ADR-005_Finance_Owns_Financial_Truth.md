---
document_id: "GOV-ADR-005"
document_name: "Finance Owns Financial Truth"
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
related_decisions: ["GOV-ADR-004"]
---

# ADR-005: Finance Owns Financial Truth

**Status:** Accepted | **Date:** 2025-02-05

## Context

Multiple domains generate financial data:
- **Booking** generates booking payments
- **Marketplace** generates order payments, commissions, settlements
- **Academy** generates enrollment fees
- **Membership** generates subscription fees

These business domains should NOT create accounting entries directly — they understand their own business logic but not accounting rules.

## Decision

**Only the Accounting/Financial module creates ledger entries and transaction records.** Business domains publish events; the Financial module listens and creates the corresponding accounting entries.

```
Business Domain (Booking)           Financial Module
    │                                      │
    │  emits booking:confirmed              │
    │────────────────────────────────►      │
    │                                      │
    │                              createLedgerPair(
    │                                platform_revenue DEBIT,
    │                                club_revenue CREDIT
    │                              )
    │                                      │
    │                              emits ledger.entry.created
    │                                      │
```

### Ownership Rules

| Who | Creates | Does NOT Create |
|-----|---------|-----------------|
| **Booking** | Booking record, status changes | Ledger entries, transactions |
| **Marketplace** | Order, items, shipping | Payment ledgers, settlement transfers |
| **Inventory** | Inventory logs, stock adjustments | Financial entries |
| **Membership** | Membership assignment, status | Payment ledgers |
| **Financial** | Ledger entries, transactions, settlement batches | Business domain data |
| **Payment Gateway** | Payment intent, gateway response | Internal ledger entries |

### Evidence

**Booking** only emits events — does NOT create ledger entries:
- `booking/application/booking.service.ts` — emits `booking:created`, `booking:cancelled`, etc.
- No direct calls to `ledgerRepository` or `transactionRepository`

**Marketplace Settlement** (`settlement/application/settlement.service.ts:248-267`):
When marking a settlement as paid, the settlement module calls `transactionRepository.createTransaction()` + `createEntries()` — this is acceptable because settlement IS a financial domain operation (it's in the Settlement module which is part of the financial ecosystem).

**Payment Service** (`payment/application/payment.service.ts:571-622`):
Emits `payment:succeeded` and `payment:failed` — lets Financial module create the ledger entries.

**Ledger Service** (`financial/application/ledger.service.ts:17-34`):
`recordTransaction()` calls `createLedgerPair()` and `ledgerRepository.createEntries()` — the ONLY place that creates ledger entries.

## Consequences

**Positive:**
- Single source of truth for all financial data
- Accounting rules enforced in one place
- Business domains stay simple — they emit events, don't manage money
- Easy to add new revenue sources (publish event, add listener)
- Audit trail is complete and consistent

**Negative:**
- Financial module is a potential bottleneck
- Eventual consistency: temporary gap between business event and ledger entry
- Requires disciplined event contract management
- Business domain developers must not bypass the rule
