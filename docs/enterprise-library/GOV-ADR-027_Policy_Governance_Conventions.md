---
document_id: "GOV-ADR-027"
document_name: "Policy Governance Conventions"
family: "GOV-ADR"
document_type: "ADR"
status: "Approved"
version: "1.0"
---

# ADR-027: Policy Governance Conventions

## Status
Approved

## Context
ADR-026 established the Policy Architecture Pattern. However, governance conventions are needed to ensure long-term consistency as new policy domains are added by different teams over multiple releases.

## Decision

### Convention 1: Policy Discovery
Every policy domain resides under `backend/src/policies/` in its own directory. The directory name matches the business domain. Examples:

- `policies/cancellation/`
- `policies/pricing/`
- `policies/refund/`
- `policies/commission/`
- `policies/loyalty/`

### Convention 2: Standard Internal Structure
Every policy domain contains:

```
<policy-name>/
├── <policy-name>.policy.ts       # evaluate() function — the core decision logic
├── <policy-name>.repository.ts   # Data access layer
├── <policy-name>.models.ts       # Domain types and interfaces
└── README.md                     # Developer documentation
```

No exceptions without documented architectural justification.

### Convention 3: README Per Policy Domain
Every policy domain includes a README.md documenting:

- **Purpose**: What business decision this policy makes
- **Inputs**: What data the `evaluate()` function expects
- **Outputs**: What the `PolicyResult` contains
- **Scope**: What organizational/branch/sport scope applies
- **Database tables**: Which tables store policy configuration
- **Evaluation flow**: Step-by-step logic description
- **Example usage**: Code snippet showing how the policy is called
- **Known limitations**: Current version constraints

### Convention 4: Policy Independence
- A policy domain must not import another policy domain's repository
- A policy domain must not call another policy domain's `evaluate()` method
- Shared infrastructure (database pool, logger, telemetry) is acceptable
- Cross-policy orchestration belongs in Application Services or Domain Services
- Policies are independent building blocks

### Convention 5: One Business Decision Per Domain
Each policy domain represents exactly one business decision:

| Policy Domain | Business Decision |
|---------------|-------------------|
| Cancellation | What is the cancellation fee? |
| Refund | What is the refund amount and method? |
| Pricing | What is the final price after rules? |
| Commission | What is the platform commission? |
| Loyalty | What tier and multiplier applies? |

Combining unrelated decisions into one domain is prohibited.

### Convention 6: No Speculative Abstraction
- No generic policy engine
- No shared base classes
- No plugin system
- No DSL or expression language
- No centralized policy registry

Every new policy domain starts by copying the structure of an existing policy domain. This is intentional and preferred over abstraction.

## Alternatives Considered

1. **Unified Policy Engine** — Rejected. Would require DSL, parser, conflict resolver, and priority system. Over-engineering for V1's 5 policy domains.

2. **Shared Base Class** — Rejected. Creates coupling. A change to accommodate one policy domain's needs would affect all others.

3. **Centralized Policy Registry** — Rejected. Adds a single point of change. Policies are discovered by directory convention, not runtime registration.

## Consequences

### Positive
- Long-term consistency across all policy domains
- Reduced cognitive load for developers moving between policy domains
- Clear boundaries prevent unintended coupling
- No architectural drift as new teams contribute

### Negative
- Duplication of structural code across domains (acceptable — this is symmetry, not duplication of logic)
- Pattern enforcement relies on code review, not compilation

## Architecture Closure

With ADR-026 and ADR-027, the CourtZon governance architecture is considered complete. Future architectural work should only be introduced when driven by real implementation needs:

- No speculative abstractions
- No additional frameworks
- No generic engines
- No architectural redesign without a documented business requirement

**Incremental evolution only, driven by real business requirements.**

## Related Documents
- ADR-026: Policy Architecture Pattern
- `POLICY_ARCHITECTURE.md` (guideline document)
