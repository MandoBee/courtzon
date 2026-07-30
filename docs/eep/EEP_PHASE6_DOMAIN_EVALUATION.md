# EEP Phase 6: Domain Layer Evaluation

## Criteria

A module justifies a Domain layer if it contains:
- Business rules / policies
- State machines
- Aggregates
- Invariants
- Domain events
- Complex calculations
- Validation logic
- Lifecycle management
- Decision logic

## Module Classification

### Rich Domain (Has Domain Layer — KEEP)

| Module | Domain Contents | Score |
|--------|----------------|-------|
| Booking | `booking-aggregate.ts` — 9-state state machine, transition validation, aggregate versioning | **10/10** |
| Payment | `payment-aggregate.ts` — status machine, event emission | **8/10** |
| Tournament | `tournament-aggregate.ts` — bracket generation, standings computation | **9/10** |
| Marketplace | Domain types for orders, products, variants | **7/10** |
| Wallet | Wallet state, balance invariants | **7/10** |
| Notifications | Notification types, dispatch decisions | **6/10** |
| Membership | Plan types, lifecycle rules | **6/10** |
| Organisations | Org types, subscription lifecycle | **5/10** |

### Should Have Domain Layer (Missing — RECOMMENDED)

| Module | Missing Logic | Effort | Value |
|--------|--------------|--------|-------|
| **Match** | Match state, join/withdraw rules, applicant lifecycle | 4h | High — currently no business rules enforcement |
| **Academy** | Enrollment state machine, attendance rules, capacity invariants | 6h | High — enrollment logic scattered |
| **Academy** | Attendance validation, waitlist rules | 4h | Medium |
| **Membership** | Plan pricing rules, upgrade/downgrade policies | 4h | Medium |

### Application Service Only (No Domain Needed — KEEP AS-IS)

| Module | Reason |
|--------|--------|
| CRM | CRUD-only: leads, segments, campaigns |
| HR | CRUD-only: employees, departments, payroll records |
| Accounting | CRUD + reports: journal entries, ledgers, trial balance |
| Support | CRUD-only: tickets, messages |
| CMS | CRUD-only: pages, blog posts |
| Geo | CRUD-only: countries, provinces, cities |
| Reports | Report generation only |
| Pricing | Calculation engine (could benefit from domain rules) |
| Coach | Coach profile + availability (application logic only) |
| Referee | Referee profile + assignment (application logic only) |

### Mixed (Partial Domain — ADD SELECTIVELY)

| Module | Current | Recommended |
|--------|---------|-------------|
| Auth | Auth service with login/register logic | Consider domain for password policies, account state |
| Admin | App settings, feature flags | No domain needed |
| Leagues | Season state machine, division logic | Extract league state machine to domain |
| Activities | Coach/academy mixed | No domain needed, split into coaches/academy |

## Summary

| Classification | Count | Action |
|---------------|-------|--------|
| Rich Domain (has layer) | 8 | Keep |
| Should have domain | **4** | Add domain layer **recommended** |
| Application Service only | 15 | Keep as-is |
| Mixed | 3 | Selective extraction |

## Estimated Effort

| Module | Hours | Priority |
|--------|-------|----------|
| Match (state machine) | 4h | **High** — currently no business rules |
| Academy (enrollment) | 6h | Medium |
| Membership (pricing) | 4h | Medium |
| Match (applicant lifecycle) | 4h | High |
| Leagues (state machine extraction) | 4h | Low |
| **Total** | **22h** | |

## Recommendation

Add domain layers only to Match (highest value — currently has zero business rule enforcement) and Academy enrollment. Queue others for post-launch.

**Phase 6 Complete.** 4 modules recommended for domain layer addition. Ready for Phase 7.
