# CourtZon IA Migration — Implementation Governance Lock

**Type:** Implementation Governance  
**Status:** AUTHORIZED — Binding on all 15 IA Migration commits  
**Baseline:** `0e8bad4`  
**Constitutions:** L1 (Business), L2 (Navigation), Hierarchy — all frozen  

---

## 1. Baseline Protection

### 1.1 Git Tag

**Create immediately before Commit 1:**

```
git tag -a pre-ia-migration -m "IA Migration baseline — rollback point before Business Domain restructuring begins"
git push origin pre-ia-migration
```

This tag becomes the **permanent rollback point.** Any partial or complete IA Migration rollback returns to this tag. It is the last commit where every architectural document is approved and zero IA code exists.

### 1.2 Why This Tag Is Permanent

- It predates every IA Migration commit.
- It is the exact state where the Navigation Platform is complete and frozen.
- A `git reset --hard pre-ia-migration` undoes the entire IA Migration in one command.
- A `git revert` chain from the current HEAD back to this tag undoes the migration commit-by-commit if partial rollback is needed.

### 1.3 Verification

```bash
git tag -l pre-ia-migration   # must return the tag
git log pre-ia-migration -1   # must return 0e8bad4 (Architecture Hierarchy)
```

---

## 2. Implementation Decision Log

### 2.1 Purpose

The IA Migration is a 15-commit restructuring exercise. During implementation, decisions will arise that do NOT change architecture but DO matter for future understanding. Examples:

- "Why was Module X placed in Domain Y instead of Domain Z?" → cites Business Constitution §1.3 boundary rule.
- "Why was the landing page label chosen as 'Overview' instead of 'Dashboard'?" → cites Conflict Resolution Matrix: Dashboard is a top-level domain, not a label.
- "Why was Module X kept as a leaf instead of becoming a section?" → cites the rule that sections require ≥2 children.

These are NOT ADRs — they do not change architecture. But without a log, six months from now nobody will remember why the decision was made.

### 2.2 Location

`docs/navigation/ia-implementation-log.md`

### 2.3 Structure

| Field | Example |
|-------|---------|
| **Commit** | `abc1234` |
| **Domain** | Commerce |
| **Module** | Wallet |
| **Decision** | Wallet kept as a direct child of Commerce, not nested under Payments |
| **Reason** | Wallet is a first-class revenue concept (balance, top-up, withdrawal) — not merely a payment sub-type. Per Business Constitution §1.6, Commerce owns Wallet as a top-level module. |
| **Constitution Ref** | Business Constitution §1.6 — Commerce Included Modules |
| **ADR Ref** | None — implementation decision, no architectural change |

### 2.4 Rules

- One entry per non-obvious decision.
- If the decision is explicitly defined in the Business Constitution, cite the section — no further justification needed.
- If the decision requires interpreting a boundary, log it.
- If the decision is trivial (e.g., icon choice), do not log it.
- The log is append-only. Never edit historical entries.

---

## 3. Implementation Conformance Review

From Commit 1 forward, every review is an **Implementation Conformance Review** — not an Architecture Review. Architecture is frozen. The only question is: does this commit correctly implement the frozen architecture?

### 3.1 What a Conformance Review Verifies

| # | Check | Question |
|---|-------|----------|
| 1 | Domain | Is every module in the correct Business Domain per the Constitution? |
| 2 | Boundary | Does any module cross a domain boundary? |
| 3 | Navigation | Is every module registered in the Navigation Registry with a `nav.admin.*` ID? |
| 4 | Sidebar | Does the admin sidebar render the commit's domain structure correctly? |
| 5 | Workspace | Does the DnD editor reflect the commit's domain structure? |
| 6 | Search | Are all modules findable under their new domain? |
| 7 | Translation | Are all new labels registered in EN + AR? |
| 8 | Saved Layout | Do existing saved layouts survive? |
| 9 | Regression | Do parity tests, full suite, build, and CI all pass? |
| 10 | Scope | Does the commit do ANYTHING beyond move/rename/reclassify/regroup? |

### 3.2 What a Conformance Review NEVER Does

- Reopens business domain boundaries.
- Questions domain ownership.
- Challenges the 8-domain structure.
- Proposes new architecture.
- Suggests "better" organization.
- Debates naming.
- Discusses whether a module "should" be somewhere else.

**If a reviewer believes a module is in the wrong domain, they must cite the specific section of the Business Constitution that it violates. If no violation exists, the module stays where it was placed. Architecture is frozen. Conformance means conformance.**

---

## 4. Implementation Discipline

Every commit must respect these rules. No exceptions.

### 4.1 Permitted Operations

| Operation | Definition |
|-----------|------------|
| **Move** | Relocate a module from its current position in `ADMIN_NAV` to its Business Domain |
| **Rename** | Change a label to match the Business Constitution's domain terminology |
| **Reclassify** | Change a module's parent section to its correct domain container |
| **Regroup** | Group modules within a domain into logical sub-sections |

### 4.2 Prohibited Operations

| Operation | Example | Why prohibited |
|-----------|---------|----------------|
| Feature addition | "Let's add a new report module" | Out of scope. Separate feature. |
| Feature removal | "This module is unused — let's delete it" | Out of scope. Separate deprecation. |
| UI redesign | "The sidebar should use collapsible sections" | Out of scope. Navigation Platform is frozen. |
| RBAC redesign | "Let's change this module's permission key" | Out of scope. Permission changes require ADR. |
| Route redesign | "Let's change /admin/finance to /admin/accounting" | Out of scope. Routes are unchanged. |
| Registry redesign | "Let's change how NavDefinition works" | Out of scope. Registry is frozen at L2. |
| Navigation redesign | "Let's add a new resolver pattern" | Out of scope. Navigation is frozen at L2. |
| Business redesign | "Let's merge Commerce and Finance" | Out of scope. Business Constitution is frozen at L1. |
| Unrelated bug fixes | "While editing admin.registry.ts, let's fix that sidebar bug" | Out of scope. Separate PR. |
| Translation improvements | "Let's fix old translations while adding new ones" | Out of scope. Only new keys in Commit 9. |

### 4.3 Scope Violation Response

If a scope violation is identified during review:
1. The commit is rejected.
2. The violating change is removed.
3. The commit is re-submitted with only permitted operations.
4. If the violating change is genuinely needed, it becomes a separate feature request — after the IA Migration is complete.

---

## 5. Migration Governance

### 5.1 Stop Rule

After every commit: **STOP.** Wait for explicit approval. Do not begin the next commit. The Navigation Migration's 30 ADRs and zero regressions are directly attributable to this rule. It applies identically here.

### 5.2 Review Rule

Every commit must pass all 12 acceptance gates before approval. No gate may be skipped. No gate may be waived.

### 5.3 Acceptance Gates

| Gate | Requirement |
|------|-------------|
| Business Review | Domain ownership correct per Constitution |
| DDD Review | No boundary violation |
| Boundary Review | No overlap with neighboring domains |
| Sidebar Review | Admin sidebar renders correctly |
| Workspace Review | DnD editor shows domain structure |
| Search Review | Modules findable under new domain |
| Translation Review | New keys registered (EN + AR) |
| Saved Layout Review | Existing layouts backward-compatible |
| Architecture Compliance | Per §7 checklist — all PASS |
| Regression Tests | 67 parity + full suite |
| Build | `npm run build` |
| CI | 222-baseline unchanged |
| Documentation | Tracker + implementation log updated |

### 5.4 Rollback

- Single commit rollback: `git revert <commit>`
- Full migration rollback: `git reset --hard pre-ia-migration`

### 5.5 Independent Commits

Each commit is independently reviewable and independently revertible. No commit depends on the previous commit being correct — only on the baseline being correct.

---

## 6. Completion Definition

The IA Migration is complete when ALL of the following are true. No subjective judgment.

| # | Condition | Verification |
|---|-----------|-------------|
| 1 | `ADMIN_NAV` contains exactly 8 top-level domains | Count: `ADMIN_NAV.length === 8` |
| 2 | Every pre-migration module is in exactly one domain | Compare permission key sets before/after |
| 3 | No module is orphaned | Zero modules outside a domain |
| 4 | All 120 `nav.admin.*` IDs preserved | Parity test: `collectIds` before/after |
| 5 | All new translation keys registered | Translation integrity test |
| 6 | Sidebar renders 8 domains correctly | Manual UAT desktop + mobile |
| 7 | Permission filtering works | Test: domain-level permission sets |
| 8 | Feature flag gating works | Test: marketplace flag toggle |
| 9 | Workspace shows 8 domains | Manual UAT |
| 10 | DnD reorder works per domain | Manual UAT |
| 11 | Saved layouts survive migration | Manual UAT: pre-saved layout verified |
| 12 | Search finds all modules | Manual UAT |
| 13 | Parity gate: 67/67 | Automated |
| 14 | Full suite: all passing | Automated |
| 15 | Build: PASS | Automated |
| 16 | CI: 222 baseline | Automated |
| 17 | Docker: all healthy | `docker compose ps` |
| 18 | Production: deployed + smoke tested | Manual verification |
| 19 | All 15 commits logged in implementation log | `docs/navigation/ia-implementation-log.md` |
| 20 | Architecture Compliance checklist passed for every commit | Per §7 |

---

## 7. Architecture Compliance Checklist

Every commit must pass this checklist. Attach to the commit review.

```
COMMIT: _______
DOMAIN: _______
REVIEWER: _______
DATE: _______

ARCHITECTURE COMPLIANCE
──────────────────────────────────────────
Business Constitution      [ ] PASS  [ ] FAIL
Navigation Constitution    [ ] PASS  [ ] FAIL
Architecture Hierarchy     [ ] PASS  [ ] FAIL
Engineering Standards      [ ] PASS  [ ] FAIL
Module Specification       [ ] PASS  [ ] FAIL

SCOPE COMPLIANCE
──────────────────────────────────────────
Only move/rename/reclassify/regroup  [ ] PASS  [ ] FAIL
No feature additions                 [ ] PASS  [ ] FAIL
No scope creep                       [ ] PASS  [ ] FAIL

IMPLEMENTATION
──────────────────────────────────────────
Registry conformity          [ ] PASS  [ ] FAIL
Sidebar conformity           [ ] PASS  [ ] FAIL
Workspace conformity         [ ] PASS  [ ] FAIL
Search conformity            [ ] PASS  [ ] FAIL
Translation conformity       [ ] PASS  [ ] FAIL
Saved layout conformity      [ ] PASS  [ ] FAIL
Regression tests             [ ] PASS  [ ] FAIL
Build                        [ ] PASS  [ ] FAIL
CI baseline                  [ ] PASS  [ ] FAIL

FINAL
──────────────────────────────────────────
Ready for approval           [ ] YES   [ ] NO

NOTES:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## 8. Final Readiness Confirmation

### 8.1 Pre-Flight Checklist

| Check | Status |
|-------|--------|
| Architecture Hierarchy frozen | ✅ `0e8bad4` |
| Business Constitution frozen | ✅ `b649237` |
| Navigation Constitution frozen | ✅ Consumer 6 complete |
| Engineering Standards frozen | ✅ Post-mortem §8 |
| All documents internally consistent | ✅ Readiness Audit §1 |
| No cross-document contradictions | ✅ Readiness Audit §1.2 |
| Repository clean | ✅ Readiness Audit §2 |
| Rollback point defined | ✅ `pre-ia-migration` tag |
| Migration strategy approved | ✅ 15 commits, 12 gates per commit |
| Scope locked | ✅ Move/rename/reclassify/regroup only |
| Risks assessed and mitigated | ✅ Readiness Audit §5 |
| Success criteria measurable | ✅ 20 objective conditions |
| Scope protection rules defined | ✅ §4.2 — prohibited operations |
| Implementation governance defined | ✅ This document |

### 8.2 Remaining Blockers

**None.**

Every architectural document is frozen. Every governance rule is defined. Every risk is mitigated. Every success criterion is measurable. Every scope protection is in place. The implementation playbook is complete.

---

## Final Declaration

**CourtZon Information Architecture Migration**

| Field | Status |
|-------|--------|
| **Architecture** | LOCKED — L1, L2, Hierarchy frozen |
| **Governance** | LOCKED — This document governs implementation |
| **Implementation** | AUTHORIZED — Commit 1 may begin |
| **Baseline** | `0e8bad4` |
| **Rollback** | `pre-ia-migration` tag |
| **Future reviews** | Implementation Conformance Reviews only |
| **Architecture reviews** | CLOSED — no further architecture debate |
| **Navigation reviews** | CLOSED — Navigation Platform is frozen |
| **Scope** | Move, rename, reclassify, regroup existing `ADMIN_NAV` modules into 8 Business Domains |

**Commit 1 is authorized. The IA Migration begins on the start order.**
