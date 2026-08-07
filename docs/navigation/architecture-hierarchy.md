# CourtZon Architecture Hierarchy v1.0

**Document Type:** Reference Governance — Platform Constitution Index  
**Status:** PERMANENTLY FROZEN  
**Authority:** This document defines the hierarchy governing every architectural document in CourtZon. It is the single entry point for every architect and engineer joining the project.

---

## 1. Architecture Hierarchy

CourtZon architecture is governed by five levels. Each level inherits the constraints of every level above it. No lower level may violate a higher level.

```
Level 1 — Business Architecture Constitution
  │
  ▼
Level 2 — Navigation Platform Constitution
  │
  ▼
Level 3 — Engineering Standards
  │
  ▼
Level 4 — Module Specifications
  │
  ▼
Level 5 — Implementation
```

---

## 2. Authority Matrix

| Level | Document | Grants | Restricts | Overrides |
|-------|----------|--------|-----------|-----------|
| **L1** | Business Architecture Constitution | Business domains, ownership, boundaries, business governance | Nothing above it | Levels 2, 3, 4, 5 |
| **L2** | Navigation Platform Constitution | Navigation Registry, navigation IDs, navigation governance, consumer pattern | L1 boundaries | Levels 3, 4, 5 |
| **L3** | Engineering Standards | Coding standards, testing, security, performance, documentation, reusable patterns | L1 + L2 | Levels 4, 5 |
| **L4** | Module Specifications | Module-specific behavior, API contracts, data models, business logic | L1 + L2 + L3 | Level 5 |
| **L5** | Implementation | Source code, database, API endpoints, frontend components, infrastructure | L1 + L2 + L3 + L4 | Nothing |

---

## 3. What Each Level Governs — and What It Does Not

### Level 1 — Business Architecture Constitution

**Governs:**
- Which Business Domains exist
- Which domain owns which business capability
- Domain boundaries — what belongs where, what must never belong
- Business governance — the questionnaires, reviews, and approvals required for business decisions
- Permanent architectural rules (Booking, Dashboard, Facilities, Platform, etc.)
- Constitutional chapters (Domain Dependencies, API Ownership, Event Ownership, Reporting, AI)

**Does NOT govern:**
- How navigation renders (that's Level 2)
- How code is written (that's Level 3)
- Module-specific behavior (that's Level 4)
- Database schemas, API implementations, component code (that's Level 5)

**Governing document:** `docs/navigation/business-ia-governance.md`

---

### Level 2 — Navigation Platform Constitution

**Governs:**
- The Navigation Registry as the single source of navigation truth
- Immutable Navigation IDs (namespaced per shell: `nav.admin.*`, `nav.org.*`, etc.)
- Navigation resolvers and the consumer/projection pattern
- The composable filtering pipeline
- Frozen legacy fixtures and parity gates
- Navigation governance (ADRs, frozen blueprint, stop rules)
- Workspace DnD editor as a Registry consumer

**Does NOT govern:**
- Business domain boundaries (that's Level 1)
- How code is written (that's Level 3)
- Module-specific behavior (that's Level 4)

**Governing document:** `docs/navigation/migration-blueprint.md` (permanent governance)  
**Supporting documents:** `docs/navigation/nav-spec-v1.0.md`, `docs/navigation/implementation-progress.md`, `docs/navigation/completion-report.md`, `docs/navigation/post-mortem.md`, `docs/navigation/immutable-navigation-ids-design-note.md`, `docs/navigation/navigation-cleanup-register.md`  
**ADR Log:** 30 ADRs in `docs/navigation/implementation-progress.md` §5  
**Engineering standards extracted:** `docs/navigation/post-mortem.md` §8 (promoted to Level 3)

---

### Level 3 — Engineering Standards

**Governs:**
- Registry-first development (every definition module must have a single typed Registry)
- Immutable IDs (every platform entity carries a namespaced, stable identifier)
- Frozen legacy fixture + parity gate (mandatory for every migration replacing legacy code)
- ADR governance (every architectural decision recorded with rationale, date, commit)
- Consumer independence (multi-consumer migrations are independent, revertible commits)
- Composable pipelines (discrete filter stages, never monolithic per-consumer logic)
- Cleanup register (debt tracked by severity and status, burndown measurable)
- Blueprint freeze (after 2-3 validations, freeze the process)
- Stop rules (force review between milestones)
- Shared-utility promotion (≥2 consumers = move to shared layer immediately)
- Additive API changes (once stable, no breaking changes without impact review)
- Projection separation (definitions in Registry, rendering in consumers)
- Namespace conventions (immutable IDs use reverse-domain pattern)
- Deterministic resolvers (pure functions, no side effects, no state)
- Coding standards, testing requirements, security policies, performance budgets, documentation standards

**Does NOT govern:**
- Business domain boundaries (Level 1)
- Navigation platform architecture (Level 2)
- Module-specific behavior (Level 4)

**Source:** Extracted from Navigation Migration Program (`docs/navigation/post-mortem.md` §8).

---

### Level 4 — Module Specifications

**Governs:**
- Module-specific API contracts
- Module data models
- Module business logic
- Module integration points with other modules
- Module-specific acceptance criteria

**Does NOT govern:**
- Business domain boundaries (Level 1 — the module must specify its owning domain)
- How the module appears in navigation (Level 2 — the module registers in the Navigation Registry)
- How the module's code is written (Level 3)

**Current state:** No formal Module Specifications exist yet. They will be created per module as the IA migration proceeds.

**Requirement:** Every Module Specification must declare its owning Business Domain (Level 1) and register its navigation entries in the Navigation Registry (Level 2).

---

### Level 5 — Implementation

**Governs:**
- Source code (backend TypeScript, frontend React/TypeScript)
- Database schemas, migrations, and seed data
- API implementations (REST endpoints, WebSocket handlers)
- Frontend components, pages, and layouts
- Docker configuration and infrastructure

**Must conform to:** Every constraint from Levels 1, 2, 3, and 4.

---

## 4. Conflict Resolution Matrix

When two documents at different levels appear to conflict, the higher level wins. When two documents at the same level conflict, the more specific document wins (Module Specification over Engineering Standard for that module's behavior).

| If | Conflicts with | Then |
|----|---------------|------|
| L4 Module Specification | L1 Business Constitution | **L1 wins.** The module is incorrectly specified. Redesign the module. |
| L4 Module Specification | L2 Navigation Constitution | **L2 wins.** The module's navigation entries are misregistered. Fix the Registry. |
| L4 Module Specification | L3 Engineering Standards | **L3 wins.** The module violates a standard. Fix the module. |
| L5 Implementation | L1 Business Constitution | **L1 wins.** The code is wrong. The Business Constitution is the source of truth. |
| L5 Implementation | L2 Navigation Constitution | **L2 wins.** The code bypasses the Registry. Fix the code to consume from the Registry. |
| L5 Implementation | L3 Engineering Standards | **L3 wins.** The code violates a standard. Fix the code. |
| L5 Implementation | L4 Module Specification | **L4 wins.** The code does not match the specification. Fix the code or update the specification (with approval). |
| L2 Navigation | L1 Business | **L1 wins.** Navigation implements Business Architecture. It never redefines it. |
| L3 Engineering | L2 Navigation | **L2 wins.** Navigation governance supercedes general engineering standards where they conflict. |
| L3 Engineering | L1 Business | **L1 wins.** Business Architecture trumps engineering convenience. |
| Two L4 Specifications | Each other | **Higher-priority domain wins** (per Business Constitution ownership). If ownership is ambiguous, escalate to Business Architecture Review. |
| AGENTS.md (practical) | Any architectural document | **Architectural document wins.** AGENTS.md reflects current practice. If it contradicts architecture, AGENTS.md is stale, not the architecture. |

---

## 5. Architecture Review Workflow

Every feature that introduces or modifies a business capability must pass through review in order. No level may be skipped.

```
1. Business Architecture Review
   │  (Does this feature have a clear owning domain?)
   │  (Does it respect domain boundaries?)
   │  (Does it violate any Permanent Architectural Rule?)
   │
   ▼
2. Navigation Review (if applicable)
   │  (How does this feature appear in navigation?)
   │  (Which shells render it? Admin? Org? Coach? Player?)
   │  (What is its immutable navigation ID?)
   │
   ▼
3. Engineering Review
   │  (Does it follow Engineering Standards?)
   │  (Does it need a parity gate?)
   │  (Does it need an ADR?)
   │
   ▼
4. Module Specification (if applicable)
   │  (What is the API contract? Data model? Integration points?)
   │
   ▼
5. Implementation
   │  (Code, tests, build, CI)
```

A feature that does not introduce a business capability (e.g., a bug fix, a refactor, a dependency update) may bypass Levels 1 and 2, starting at Level 3 (Engineering Review).

---

## 6. Change Governance

Each level has its own change process. The process becomes stricter as authority increases.

| Level | Document | Change process |
|-------|----------|---------------|
| **L1** | Business Architecture Constitution | Architecture Review + ADR + Business Approval. No change without all three. |
| **L2** | Navigation Platform Constitution | Architecture Review + ADR + Navigation Approval. Additive changes only. |
| **L3** | Engineering Standards | Engineering Review + Technical Approval. Standards may evolve with platform maturity. |
| **L4** | Module Specifications | Module Owner Approval. May be updated as the module evolves. |
| **L5** | Implementation | Standard engineering workflow (code review, CI, tests). |

**L1 decisions are permanent unless explicitly reopened by a new ADR with business approval.**

---

## 7. Decision Tree — "Where does this belong?"

Every engineer and architect should use this decision tree when evaluating a new feature, module, or capability.

```
Question 1: Does it create, modify, or remove a Business Domain?
  ├─ YES → L1 — Business Architecture Review + ADR + Business Approval
  │
  └─ NO  → Question 2: Does it create, modify, or remove navigation?
              ├─ YES → L2 — Navigation Review + ADR + Navigation Approval
              │
              └─ NO  → Question 3: Does it introduce a new engineering practice?
                        ├─ YES → L3 — Engineering Review + Technical Approval
                        │
                        └─ NO  → Question 4: Does it introduce a new module or change module behavior?
                                  ├─ YES → L4 — Module Specification + Module Owner Approval
                                  │
                                  └─ NO  → L5 — Standard implementation workflow
```

---

## 8. Example: Feature Lifecycle — "Coach Certification Tracking"

A product manager requests: "We need to track coach certifications — when they expire, which level, and which sport."

**Step 1 — Business Architecture Review (L1):**
- Which domain owns coach certifications?
- Coach identity (name, profile) = People.
- Certification = a credential attached to a person. The credential describes the person's qualifications.
- **Decision:** People owns coach certifications. Coaching may DISPLAY certification status but does not own the credential data.

**Step 2 — Navigation Review (L2):**
- Where does this appear in the admin sidebar?
- Under People → Coaches → Certifications.
- Assign immutable ID: `nav.admin.people.coach-certifications`.
- Register in the Navigation Registry.
- Workspace editor will show it under People when the DnD editor is opened.

**Step 3 — Engineering Review (L3):**
- Does this need a parity gate? No — it's a new feature, not a migration.
- Does this need an ADR? No — it maps cleanly to an existing domain boundary.
- Does it follow engineering standards? Registry-first: yes. Immutable IDs: yes.

**Step 4 — Module Specification (L4):**
- API: `GET /people/coaches/{id}/certifications`, `POST /people/coaches/{id}/certifications`
- Data model: certification_id, coach_id, sport, level, issuing_body, issued_date, expiry_date
- Integration: Coaching domain reads certification status via People API — does not duplicate the data.

**Step 5 — Implementation (L5):**
- Write code. Write tests. Build. Deploy.

---

## 9. Example: Conflict — "AI needs its own domain"

A proposal arrives: "AI is becoming so important to CourtZon that it should be its own top-level Business Domain."

**Conflict detection:** The Business Architecture Constitution (L1) explicitly states: "There will never be an AI Business Domain. Any proposal to create one is an architectural anti-pattern and will be rejected."

**Resolution:** L1 wins. The proposal is rejected. AI capabilities remain distributed across the domains they augment: Coaching for coach matching, Competitions for tournament seeding, Commerce for dynamic pricing, etc.

**To change this:** A new ADR must be filed to amend the Business Architecture Constitution (L1), with full Architecture Review and Business Approval. The bar is intentionally high.

---

## 10. Example: Conflict — "Let's skip the Registry for this feature"

A developer proposes: "This new admin page is simple — let's just hardcode it in the sidebar instead of going through the Registry."

**Conflict detection:** The Navigation Platform Constitution (L2) states: "Every consumer reads from the Registry. No consumer may define its own navigation tree." The Engineering Standards (L3) state: "Registry-first development is mandatory."

**Resolution:** L2 and L3 both reject this. The feature must register in the Navigation Registry and be consumed through a resolver.

**Escalation:** The developer doesn't need approval — they need to follow the existing rules.

---

## 11. Example: Conflict — Module Specification vs. Engineering Standard

A Module Specification for "Academy Management" defines its own ID scheme: `academy-{uuid}` instead of `nav.coaching.academy.{name}`.

**Conflict detection:** Engineering Standards (L3) require: "Immutable IDs use reverse-domain namespacing: `{system}.{domain}.{entity}`."

**Resolution:** L3 wins. The Module Specification must use the namespaced ID convention. The module owner fixes the specification before implementation begins.

---

## 12. Visual Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  L1 — BUSINESS ARCHITECTURE CONSTITUTION                │
│  Business domains, ownership, boundaries, governance    │
│  Changes: ADR + Architecture Review + Business Approval │
│  Authority: Supreme — overrides all levels below        │
├─────────────────────────────────────────────────────────┤
│  L2 — NAVIGATION PLATFORM CONSTITUTION                  │
│  Registry, IDs, resolvers, consumers, workspace          │
│  Changes: ADR + Architecture Review + Nav Approval       │
│  Authority: Overrides L3, L4, L5                        │
│  Constraint: Must implement L1, never redefine it        │
├─────────────────────────────────────────────────────────┤
│  L3 — ENGINEERING STANDARDS                              │
│  Coding, testing, security, patterns, ADR governance     │
│  Changes: Engineering Review + Technical Approval        │
│  Authority: Overrides L4, L5                             │
│  Constraint: Must implement L1 + L2                      │
├─────────────────────────────────────────────────────────┤
│  L4 — MODULE SPECIFICATIONS                              │
│  API contracts, data models, business logic per module   │
│  Changes: Module Owner Approval                          │
│  Authority: Overrides L5                                 │
│  Constraint: Must implement L1 + L2 + L3                 │
├─────────────────────────────────────────────────────────┤
│  L5 — IMPLEMENTATION                                     │
│  Source code, database, API, frontend, infrastructure    │
│  Changes: Standard engineering workflow                  │
│  Authority: None — defers to all levels above            │
│  Constraint: Must implement L1 + L2 + L3 + L4            │
└─────────────────────────────────────────────────────────┘
```

---

## 13. Final Freeze Declaration

This document is the constitutional index of CourtZon. It defines the hierarchy, authority, conflict resolution, and change governance for every architectural document in the project.

**Frozen:**

- Five-level architecture hierarchy
- Authority matrix
- Conflict resolution matrix
- Architecture review workflow (5-step sequential)
- Change governance per level
- Decision tree
- The principle that higher levels override lower levels

**This document becomes the entry point for every architect and engineer joining the project.**

No lower level may override a higher level. No level may be skipped in architecture review. Every new business feature must declare its owning domain, pass Business Architecture Review, and conform to every governing document above it.

---

## 14. Document Index

| Document | Level | Path |
|----------|-------|------|
| Business Architecture Constitution | L1 | `docs/navigation/business-ia-governance.md` |
| Navigation Migration Blueprint (permanent governance) | L2 | `docs/navigation/migration-blueprint.md` |
| Navigation Specification (frozen) | L2 | `docs/navigation/nav-spec-v1.0.md` |
| Navigation Implementation Tracker | L2 | `docs/navigation/implementation-progress.md` |
| Navigation Completion Report | L2 | `docs/navigation/completion-report.md` |
| Navigation Post-Mortem | L2 | `docs/navigation/post-mortem.md` |
| Navigation Cleanup Register | L2 | `docs/navigation/navigation-cleanup-register.md` |
| Immutable Navigation IDs Design Note | L2 | `docs/navigation/immutable-navigation-ids-design-note.md` |
| Phase 1 Parity Report | L2 | `docs/navigation/phase1-parity-report.md` |
| Engineering Standards (extracted from Post-Mortem §8) | L3 | `docs/navigation/post-mortem.md` §8, §9 |
| Architecture Decision Records (30) | L2 | `docs/navigation/implementation-progress.md` §5 |
| Practical Working Instructions | N/A | `AGENTS.md` |
| Architecture Hierarchy (this document) | Index | `docs/navigation/architecture-hierarchy.md` |

---

**CourtZon Architecture Hierarchy v1.0**

**Status: PERMANENTLY FROZEN**

**This is the governing index. All other documents derive their authority from this hierarchy.**
