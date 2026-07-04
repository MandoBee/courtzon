# Architecture Governance

> **Effective:** 2026-07-04  
> **Status:** Active

---

## ADR Freeze

All existing Architecture Decision Records (ADR 001-007) are **frozen**. Future architectural changes must create a new ADR with a new sequential number rather than modifying existing ADRs. This preserves the historical context of each decision.

Current ADRs:
- [ADR 001](adr/001-payment-architecture.md) — Payment Architecture
- [ADR 002](adr/002-api-response-standard.md) — API Response Standard
- [ADR 003](adr/003-react-query-strategy.md) — React Query Strategy
- [ADR 004](adr/004-logging-strategy.md) — Logging Strategy
- [ADR 005](adr/005-health-endpoint-strategy.md) — Health Endpoint Strategy
- [ADR 006](adr/006-deployment-strategy.md) — Deployment Strategy
- [ADR 007](adr/007-security-model.md) — Security Model

---

## Payment Architecture — Immutable Guarantees

Any change to these guarantees is a breaking change and requires a new ADR:

1. **Payment flow:** charge → webhook → `_processPaymentOutcome` → `_fulfillPayment`
2. **Lifecycle states:** `pending` → `payment_initiated` → `fulfilled` / `failed` / `expired` / `cancelled`
3. **Retry model:** Never reuse intents. Each retry creates new intent with `retry_of_intent_id`
4. **Health contract:** `/payments/health` response schema must not break existing monitoring
5. **Audit trail:** Every payment state change records `recordAudit()` + `financial_journal_entries`
6. **Idempotency:** `UNIQUE gateway_reference` + `FINAL_STATES` guard + `FOR UPDATE` lock

---

## Periodic Architecture Review

**Schedule:** Every 6 months (January, July)

**Scope:** Review ADRs against production metrics. Evaluate whether decisions remain valid. Identify architectural drift. Propose changes only if measurable production benefit exists.

**Format:** 1-page summary per ADR answering: (1) Decision still valid? (2) Production metrics support? (3) Any drift detected? (4) Recommended changes?

---

## Contract Tests

Recommended (not yet implemented):

1. `/payments/health` schema validation — verify response shape matches v1 contract
2. `/health/version` schema validation — verify all v1 fields present
3. Webhook idempotency — send same payload twice, verify second is idempotent
4. Manual recovery — recover an already-paid transaction, verify idempotent response

Implementation: Add to existing test suite or CI pipeline. Use Zod schema validation against contract types.

---

## CI Architecture Regression Checks

Run via `scripts/ci-arch-check.sh`:
