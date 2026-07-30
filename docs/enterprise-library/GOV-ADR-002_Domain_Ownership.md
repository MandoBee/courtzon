---
document_id: "GOV-ADR-002"
document_name: "Domain Ownership — Modular Monolith"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 15
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-001", "GOV-ADR-003"]
---

# ADR-002: Domain Ownership — Modular Monolith

**Status:** Accepted | **Date:** 2025-01-15

## Context

CourtZon has 30+ business domains. Cross-domain data sharing is common (e.g., Booking needs Payment status, Marketplace needs Inventory stock). Options:

1. **Microservices** — each domain as independent service with API contracts
2. **Modular Monolith** — single deployable, strict module boundaries, event-driven cross-domain communication
3. **Traditional Monolith** — no boundaries, shared DB access everywhere

## Decision

**Use a Modular Monolith** with:
- One codebase, one deployable (Docker container)
- Each domain is a `module/` directory with `domain/`, `application/`, `presentation/`, `infrastructure/`
- Strict boundaries: modules NEVER import each other's domain/application layers directly
- Cross-domain communication ONLY via `eventBusV2` or shared read repositories

```
backend/src/modules/
  booking/       — domain/, application/, presentation/, infrastructure/
  financial/     — domain/, application/, presentation/, infrastructure/
  marketplace/   — domain/, application/, presentation/, infrastructure/
  match/         — domain/, application/, presentation/, infrastructure/
  ... 28 modules total, each following the same structure
```

**Evidence:** All modules follow this structure (e.g., `modules/match/` has 31 files across domain/application/presentation). `modules/financial/` has 6 sub-directories.

### Communication Rules

| Pattern | Allowed? | Example |
|---------|----------|---------|
| Module A emits event → Module B listens | ✓ | Booking emits `booking:created`, Notifications listens |
| Module A calls Module B's service directly | ✗ | Must go through event bus |
| Module A reads Module B's DB table directly | ✗ | Use shared read repository or event-sourced projection |
| Both modules use shared kernel | ✓ | `shared/` directory for middleware, utils, error classes |
| Module A imports Module B's DTOs | ✗ | Each module owns its own types |

**Evidence:** `modules/settlement/application/settlement.service.ts:2` imports `marketplaceRepository` — this is a read-only repository, NOT a service call. `financial/application/ledger.service.ts:4` imports `eventBusV2` for cross-domain events.

## Consequences

**Positive:**
- Single deployment — no orchestration complexity
- Transactional consistency within module boundaries
- Shared DB connection pool — no distributed transactions
- Fast developer onboarding — one codebase
- Easy debugging and testing (no network calls between modules)
- docker compose build/up is fast

**Negative:**
- Scaling requires scaling entire monolith
- Module boundary discipline requires code review enforcement
- Eventual consistency for cross-domain operations
- Cannot independently deploy different module versions
