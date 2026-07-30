---
document_id: "GOV-ADR-026"
document_name: "Policy Architecture Pattern"
family: "GOV-ADR"
document_type: "ADR"
status: "Approved"
version: "1.0"
---

# ADR-026: Policy Architecture Pattern

## Status
Approved

## Context
CourtZon has multiple business domains that require configurable decision logic: cancellation policies, pricing rules, commission rates, refund policies, and loyalty tiers. Each was implemented independently, resulting in inconsistent patterns across the codebase. A unified approach is needed to ensure maintainability as the platform grows.

## Decision
Establish a **Policy Architecture Pattern** as an architectural guideline. Each policy domain:

1. **Has its own directory** under `backend/src/policies/`
2. **Is completely independent** — no shared base classes, no abstract classes, no runtime framework
3. **Follows a consistent internal structure**: `*.policy.ts`, `*.repository.ts`, `*.models.ts`
4. **Implements an `evaluate(input, context)` function** that returns a `PolicyResult`
5. **Has its own database table(s)** — no shared policy table
6. **Is independently testable and deployable**

## Policy Directory Convention

```
backend/src/policies/
├── cancellation/
│   ├── cancellation.policy.ts       // evaluate() function
│   ├── cancellation.repository.ts   // Data access
│   ├── cancellation.models.ts       // Domain types
│   └── README.md
├── pricing/
│   ├── pricing.policy.ts
│   ├── pricing.repository.ts
│   ├── pricing.models.ts
│   └── README.md
├── refund/
│   ├── refund.policy.ts
│   ├── refund.repository.ts
│   ├── refund.models.ts
│   └── README.md
├── commission/
│   ├── commission.policy.ts
│   ├── commission.repository.ts
│   ├── commission.models.ts
│   └── README.md
├── loyalty/
│   ├── loyalty.policy.ts
│   ├── loyalty.repository.ts
│   ├── loyalty.models.ts
│   └── README.md
└── POLICY_ARCHITECTURE.md           # The guideline document
```

## Common Contract (Documented, Not Enforced)

```typescript
interface PolicyService<Input, Output> {
  evaluate(input: Input, context: PolicyContext): Promise<PolicyResult<Output>>;
}

interface PolicyContext {
  organisationId?: number;
  branchId?: number;
  userId: number;
  effectiveDate: Date;
}

interface PolicyResult<T> {
  allowed: boolean;
  value?: T;
  reason?: string;
  appliedRules: string[];
  evaluatedAt: Date;
}
```

This contract is a documentation convention, not a shared interface. Domains may define their own types locally.

## Independence Rules

- A policy must not directly depend on another policy's repository
- A policy must not call another policy's `evaluate()` method
- Shared infrastructure (logging, database connection) is acceptable
- Business orchestration across policies belongs in Application Services or Domain Services
- One business decision = one policy domain

## Alternatives Considered

1. **Generic Rule Engine** — Rejected. Unnecessary complexity for V1. Would require DSL, parser, evaluator, conflict resolver.

2. **Shared Base Class** — Rejected. Creates coupling between unrelated domains. Changes to base class affect all policies.

3. **Plugin Registry** — Rejected. Premature abstraction. Add when dynamic policy loading is actually required.

4. **No Pattern (Status Quo)** — Rejected. Inconsistent implementations increase maintenance cost and onboarding time.

## Consequences

### Positive
- Consistent structure across all policy domains
- Reduced implementation time for new policy domains (40-60% boilerplate elimination)
- Predictable code review
- Uniform test patterns
- Easy discovery for new developers

### Negative
- Some code duplication across policy domain boundaries (acceptable — duplication of structure, not logic)
- Developers must learn the pattern (one-time cost)

## Related Documents
- ADR-027: Policy Governance Conventions
- `POLICY_ARCHITECTURE.md` (guideline document)
