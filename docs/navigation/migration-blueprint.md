# CourtZon Navigation — Consumer Migration Blueprint

**Status:** PERMANENT GOVERNANCE (approved 2026-08-07)
**Reference implementation:** Phase 2-a — Admin Sidebar (commit `52064ff`)
**Spec:** `docs/navigation/nav-spec-v1.0.md` (frozen)
**Tracker:** `docs/navigation/implementation-progress.md`
**Cleanup register:** `docs/navigation/navigation-cleanup-register.md`

This document is the **official migration template** for every navigation consumer in CourtZon. It is the permanent engineering standard derived from the Phase 2-a reference implementation. There is **no alternative migration path**.

---

## 1. The Mandatory Migration Lifecycle

Every navigation consumer MUST follow exactly this lifecycle, in this order:

```
Legacy Consumer
      ↓
Frozen Legacy Fixture
      ↓
Registry Consumer
      ↓
Parity Gate
      ↓
Legacy Removal
```

| Step | Requirement |
|------|-------------|
| **1. Freeze** | Capture the legacy consumer's navigation output **verbatim** into `frontend/src/navigation/parity/legacy/<consumer>.ts`. No behavior is modified. This fixture is the permanent parity baseline. |
| **2. Registry integration** | The consumer reads its nav from its registry (`<shell>.registry.ts`) via its resolver. The registry is the single source of truth. |
| **3. Immutable IDs** | Every node carries a stable `nav.<shell>.*` id (see §3). Legacy keys are accepted as aliases during transition (see §7). |
| **4. Parity gate** | The consumer's parity suite compares the **frozen fixture** against the registry resolver across translations, permissions, flags, and saved layouts. |
| **5. Legacy removal** | The inline nav definition is deleted from the consumer component only after registry integration + parity + full regression + build are green. |

**Consumers MUST NOT compare against the current implementation after migration.**
They compare against the **frozen fixture**.

---

## 2. Frozen Legacy Fixture — Mandatory

The Frozen Legacy Fixture is a mandatory migration requirement, not a recommendation.

- Created **before** any migration work begins on a consumer.
- Copied **verbatim** — byte-for-byte logic, no "improvements", no refactoring.
- Stored under `frontend/src/navigation/parity/legacy/`.
- Never edited after freezing (a behavioral fix is a new fixture version, not an edit).
- Becomes the permanent parity baseline the gate compares the registry against.
- Remains in the repository even after legacy removal — it is the audit record of "what the nav was".

Existing fixtures:

| Consumer | Fixture |
|----------|---------|
| Admin Sidebar | `parity/legacy/admin-sidebar.ts` (`buildLegacyAdminNavItems`) |
| Organisation Sidebar | `parity/legacy/org-sidebar.ts` (`buildLegacyOrgNavItems`) |
| Coach Navigation | `parity/legacy/coach-nav.ts` (`COACH_NAV`) |
| Referee Navigation | `parity/legacy/referee-nav.ts` (`REFEREE_NAV`) |

---

## 3. Navigation Identity Rule (PERMANENT)

**Navigation ID and Permission Key are two distinct concepts and MUST never be coupled again.**

| Navigation ID | Permission Key |
|---------------|----------------|
| Immutable | Authorization only |
| Structural identity | Optional |
| Registry identity | Shareable (section + landing child may share one key) |
| Ordering identity | RBAC concern |
| Merge identity | Can change if the RBAC model changes |
| Never changes once assigned | |

- IDs are namespaced per shell: `nav.admin.*`, `nav.org.*`, `nav.coach.*`, `nav.referee.*`, `nav.player.*`, `nav.workspace.*`.
- IDs are unique within a shell (enforced by the parity integrity gate).
- When a section and its landing child share one permission key, the child gets a distinct `{section}.landing` id (Phase 2-a convention).
- Resolved navigation items expose `id` so **all navigation state is keyed by id**, never by label, translated text, or display name (§ `docs/navigation/navigation-cleanup-register.md` NC-001).
- Each shell exports `{SHELL}_ID_TO_KEY` (id → key) and `{SHELL}_LEGACY_KEY_TO_ID` (key → ids) alias maps built from the registry.

---

## 4. Consumer Migration Rules

Every remaining consumer migration MUST include **all** of the following before legacy removal:

1. Frozen legacy fixture.
2. Registry integration.
3. Immutable IDs (`nav.<shell>.*`) + id/key alias maps.
4. Legacy compatibility (old saved layouts / keys keep working).
5. Consumer parity gate (green).
6. Full regression suite (green).
7. Build verification (green).
8. Documentation update (tracker + ADR log + this blueprint's fixture table).

Only after **all** are green may the legacy implementation be removed.

---

## 5. Parity First

**Parity is the primary success criterion.**

- Architecture improvements MUST NEVER change behavior during migration.
- If parity fails, the migration is **incomplete** — regardless of how good the new code is.
- Behavioral improvements (IA, ordering, new features) belong to **later phases**, never inside a consumer migration.
- The parity comparator is intentionally restricted to the legacy-visible surface (label, icon, path, permissionKey, requiredFlag, featureFlag, children). `id` is registry-layer identity and is excluded from the comparison surface.

---

## 6. Backward Compatibility (PERMANENT)

No migration may break:

- Existing saved layouts.
- Existing navigation ordering.
- Existing feature flags.
- Existing permission behavior.
- Existing routing.

No migration may require:

- Database schema changes.
- Data migrations.
- User intervention.

…unless explicitly approved in a future phase.

---

## 7. Legacy-Key Compatibility During Transition

During the transition, both forms MUST be accepted wherever a persisted layout references navigation entries:

- **Legacy keys** (e.g. `sidebar.organisations`) — the persisted form today.
- **Immutable ids** (e.g. `nav.admin.organisations`) — the registry form going forward.

The resolver matches a persisted token via `findByIdOrKey` (matches `n.id === token || n.permissionKey === token`). Unknown/stale tokens are silently dropped with the exact legacy reorder semantics preserved (ordered matches first, then remaining items in registry order).

---

## 8. Generic Architecture

- **No shell-specific abstractions.** Every abstraction introduced during migration must be reusable by Admin, Organisation, Coach, Referee, Player, and Workspace.
- Shared helpers (e.g. `buildNavIdKeyMaps`, `findByIdOrKey`, `toResolved`, `cloneDefs`, id/key maps) live in the shared `navigation/` layer — never inside a shell registry.
- If a solution cannot be reused by all consumers: **stop**, document the limitation, then continue.

---

## 9. Consumer Independence

Phase 2 is **not** a sequence of "2-a, 2-b, 2-c…". It is a sequence of **independent consumers**:

```
Consumer 1 (Admin)      ✅ approved
Consumer 2 (Organisation)   ← current
Consumer 3 (Coach)
Consumer 4 (Referee)
Consumer 5 (Player)
Consumer 6 (Workspace Editor)
```

Every consumer:

- Has its **own commit**.
- Has its **own parity gate**.
- Has its **own regression report**.
- Has its **own architecture review**.
- Has its **own approval**.

**No consumer migration automatically authorizes the next one.**

---

## 10. Stop Rule

- After completing a consumer: update documentation, commit, return the 11 deliverables, and **stop** for architecture review and approval.
- **Never** migrate multiple consumers together.
- Begin the next consumer only after approval.
- **Do not skip any step.**

---

## 11. Lessons Learned (from Phase 2-a)

1. **The frozen fixture is the single most valuable artifact.** It turns "did the nav change?" into a deterministic, reviewable test instead of a judgment call.
2. **Freeze before touching anything.** Editing the legacy component and freezing afterwards risks the fixture reflecting the edit, not the true baseline.
3. **`findByIdOrKey` (key OR id) is the correct transition primitive.** Legacy rows keep working with zero data migration; new rows can use ids immediately.
4. **Section + landing child key collisions are handled with `.landing` child ids**, not by duplicating the section's id.
5. **Keep ids off the parity comparison surface.** The comparator enumerates the legacy-visible fields explicitly; adding `id` to resolved items for state keying must not leak into the comparison.
6. **Remaining-items preservation must be copied exactly.** Legacy reordering puts ordered matches first, then sections, then the leftover leaves in registry order. Any "improvement" here silently breaks saved layouts.
7. **Count assertions are documentation, not enforcement.** Asserting a fixed node count (e.g. 120) documents the tree but should be accompanied by structural invariants (unique ids, namespace prefix, key coverage).
8. **Resolved labels that come from short translation keys** (e.g. `organisation_types` → "Types") must be asserted via the actual resolved value, not an assumed human-readable label.

---

## 12. Architectural Decisions Introduced (ADR pointer)

New decisions are logged in `docs/navigation/implementation-progress.md` §5 (ADR log). The governance decisions in this document correspond to ADR-007 → ADR-009.

---

## 14. Blueprint Is Frozen (PERMANENT)

The migration blueprint has been validated on **three consumers** representing three distinct navigation models:

- Consumer 1 — Admin (complex hierarchical nav, permissions, saved layouts, feature flags).
- Consumer 2 — Organisation (flat nav, permissions, org context).
- Consumer 3 — Coach (flat static nav, no permissions, no persistence).

The blueprint is now **STABLE**. The migration process is FROZEN. Do NOT modify the migration process for the remaining consumers unless a **critical architectural issue** is discovered. A "nice to have" is not a reason to change the process. Remaining consumers (Referee, Player, Workspace) must reuse the blueprint exactly as documented.

---

## 15. Registry API Stability

The Navigation Registry public interfaces are becoming **platform APIs**. Before changing any exported registry API:

1. Evaluate the impact on **every existing consumer**.
2. Document the reason.
3. Update this blueprint if the change is architectural.

Avoid unnecessary API churn. The Registry should begin stabilizing; post-migration changes are additive (new ids, new maps, new helpers), never breaking.

---

## 16. Shared Utilities — Immediate Promotion

Any helper that becomes useful for more than one consumer **must immediately become shared infrastructure**.

- ❌ `AdminHelper` / `OrgHelper` / `CoachHelper` duplication.
- ✅ One shared helper in the `navigation/` layer, imported by all shells.

If the abstraction is generic, promote it **immediately**. The goal is to prevent copy/paste divergence. Existing shared helpers: `buildNavIdKeyMaps`, `findByIdOrKey`, `toResolved`, `cloneDefs`, `resolveLabel`, id/key maps, `T`/`LIT`/`COMPOSITE`.

---

## 17. Consumer Complexity Report (per consumer)

Every consumer report includes a short complexity comparison against previous consumers.

Example scale:

| Consumer | Complexity |
|----------|------------|
| Admin | High |
| Organisation | Low |
| Coach | Medium |
| Referee | Low |
| Player | Medium |
| Workspace | Very High |

For each consumer, explain:

- Why this consumer differs.
- Which parts of the blueprint were reused **unchanged**.
- Which parts required **adaptation** (and why that adaptation stays inside the blueprint's constraints).

---

## 18. Registry Growth Review (per consumer)

At the end of every consumer report include **Registry Statistics**, e.g.:

- Number of Navigation IDs
- Number of Categories (sections/shells)
- Number of Pages (leaf nodes)
- Number of Shared Utilities
- Number of Consumers migrated
- Remaining Consumers

This monitors registry growth over time and prevents drift.

---

## 19. Navigation Cleanup Progress (per consumer)

The Cleanup Register is a **living document**. Every migration report must include:

- **Resolved Cleanup Items**
- **Remaining Cleanup Items**
- **New Cleanup Items**

No cleanup item may silently disappear. A resolution must be recorded with its commit hash.

---

## 20. Technical Debt Budget

**No consumer migration may introduce new technical debt** unless it is:

1. Documented (this blueprint / cleanup register).
2. Justified.
3. Assigned a planned resolution phase.

Undocumented technical debt is not acceptable.

---

## 21. Phase Health

At the end of every migration report, include **Phase Health**:

- 🟢 **Green** — no drift; parity + regression + build green; docs synchronized.
- 🟡 **Yellow** — acceptable deviation documented with a resolution plan.
- 🔴 **Red** — architectural drift or unresolved debt; migration NOT complete.

The objective is to identify architectural drift early, not late.

---

## 22. Documentation Synchronization

Every completed consumer must keep synchronized:

- Migration Blueprint (fixture table, shared utilities, complexity scale).
- Cleanup Register (resolved / remaining / new items).
- Implementation Progress (status, checklist, ADR log, drift).
- ADR Log (every new architectural decision).

**No document may fall behind the implementation.**

---

## 23. Consumer Deliverables (mandatory format)

Every remaining consumer migration MUST return the following 16 items:

1. Architecture summary
2. Consumer classification
3. Files changed
4. Navigation ID mapping
5. Registry contract changes (if any)
6. Legacy compatibility report
7. Consumer parity report
8. Full test results
9. Registry statistics
10. Pattern validation matrix
11. Cleanup progress (resolved / remaining / new)
12. Risks
13. Readiness for the next consumer
14. Lessons learned
15. Documentation updates
16. Git commit hash

---

## 24. Final Engineering Rules (PERMANENT)

1. Phase 2-a is the official reference implementation.
2. Every consumer follows this migration template.
3. Every consumer begins with a Frozen Legacy Fixture.
4. Navigation IDs are immutable.
5. Permission Keys are authorization only.
6. Registry-first development is mandatory.
7. Every consumer has its own parity gate.
8. Every consumer has its own Git commit.
9. Every consumer has its own architecture review.
10. Every consumer has its own approval.
11. Label-based navigation state is technical debt and must be eliminated (see cleanup register).
12. No new label-based state may ever be introduced.
13. Every remaining architectural debt is tracked in the Navigation Cleanup register until resolved.
14. The migration blueprint is frozen; no process change without a critical architectural issue.
15. The Registry API is stabilizing; no breaking public API change without impact review + documentation.
16. Any helper useful to more than one consumer is promoted to shared infrastructure immediately.
17. Every consumer reports complexity, registry statistics, cleanup progress, and phase health.
18. No consumer migration introduces undocumented technical debt.

---

## 25. Consumer Classification (documented)

Every consumer's migration characteristics are recorded in the Implementation Progress tracker (§8 Classification). Each entry documents: model, hierarchy, RBAC, persistence, and context. The classification is the basis of the readiness assessment (§30).

| Consumer | Model | Hierarchy | RBAC | Persistence | Context |
|----------|-------|-----------|------|-------------|---------|
| 1 Admin | Complex hierarchical | Deep (sections + landing children) | Permissions + feature flags | Saved layouts | Global admin |
| 2 Organisation | Flat | 1 level | Permissions (23 keys) | None | Org context (path templates) |
| 3 Coach | Flat static | 1 level | None (0 keys) | None | Coach |
| 4 Referee | Flat permission-gated | 1 level | Permissions (6 keys, 1 shared) | None | Referee |
| 5 Player | Two-tier (core + More) | 2 groups | Permissions + seller + chat flag | None | Player / Seller |
| 6 Workspace | DnD editor, legacy-keyed | Deep | Permissions | Reads/writes saved layout | Admin |

---

## 26. Pattern Validation Matrix

Maintained in the Implementation Progress tracker (§9). A pattern is marked **validated** only after at least one consumer passes its parity gate using it. Pending patterns are listed explicitly so no pattern is assumed validated before it has been exercised.

Currently validated: hierarchical navigation, flat navigation, permission-gated flat navigation, static no-RBAC navigation, Navigation IDs, legacy compatibility (key-or-id alias), registry-first rendering, frozen legacy fixture, parity gate, generic resolver, shared registry utilities, immutable id on every resolved node, uniform (incl. empty) map exports, small permission-gated shell, shared permission key navigation (one key protects multiple nodes — validated by Consumer 4 / Referee).

Pending: two-tier more-sheet filtering, feature-flag gating, seller-context gating, DnD workspace reconciliation, saved-layout DB backfill, id-keyed React state cleanups.

---

## 27. Shared Infrastructure Review (Stable / Experimental / Temporary)

Every shared helper is classified at each migration. Consumers rely **only on Stable** infrastructure whenever possible.

| Helper | Layer | Class | Consumers | Notes |
|--------|-------|-------|-----------|-------|
| `NavDefinition`, `ResolvedNavItem` | `navigation/types.ts` | **Stable** | all | Platform contract (§15) |
| `T`, `LIT`, `COMPOSITE`, `resolveLabel` | `navigation/labels.ts` | **Stable** | all | Label system |
| `buildNavIdKeyMaps`, `NavIdKeyMaps` | `navigation/id-key.ts` | **Stable** | admin, org, coach | Used by 3 shells |
| Generic resolvers + `toResolved` | `navigation/resolve.ts` | **Stable** | all | |
| `findByIdOrKey` | `navigation/resolve.ts` (private) | **Experimental** | admin only | Promote to shared if a 2nd consumer needs key-or-id saved-layout resolution (review at Consumer 6 / Workspace) |
| Parity `compare.ts` + frozen fixtures | `navigation/parity/` | **Stable (test-only)** | test suite | Permanent baselines |
| Per-shell alias maps (`*_ID_TO_KEY`, `*_LEGACY_KEY_TO_ID`) | per registry | **Stable** | per shell | Uniform exports, additive |

---

## 28. Cleanup Burndown

The Cleanup Register tracks every item with: **Status** (Open / In Progress / Completed) and **Class** (Mandatory / Recommended / Optional). The tracker maintains a burndown (open vs completed) so technical-debt reduction is measurable during migration.

- **Mandatory** — blocks the Navigation Platform completion declaration (NC-001).
- **Recommended** — must be resolved before the platform is production-complete (was High/Medium).
- **Optional** — nice-to-have, tracked for completeness (was Low).

A resolution is recorded with its commit hash; no item may silently disappear.

---

## 29. Registry Metrics (historical record)

After **every** migration, the tracker's Registry Metrics table is extended with a new as-of row:

- Navigation IDs (immutable, migrated shells)
- Categories (top-level groups in migrated shells)
- Pages (total registry nodes across all shells)
- Consumers migrated
- Shared utilities (Stable)
- Cleanup items (open / completed)
- ADR count
- Registry version
- Blueprint version

Versioning: **Registry version** bumps on every consumer migration (v1.0 extraction → v1.1 admin → v1.2 org → v1.3 coach → …). **Blueprint version** is v1.0 (creation) → v2.0-STABLE (governance formalization). This creates the historical engineering record.

---

## 30. Consumer Readiness Assessment

Before beginning each consumer, the tracker records a short readiness assessment:

- Complexity (Low / Medium / High / Very High)
- Dependencies (legacy files, consumers, test suites)
- Expected risks
- Estimated validation scope

The readiness assessment reduces surprises during implementation and is updated if reality diverges.

---

## 31. Documentation Freeze

The **Navigation Specification** (`docs/navigation/nav-spec-v1.0.md`) remains FROZEN. If no architectural change occurs during a migration, the specification is not modified.

Migrations may update only:

- Implementation Progress (tracker)
- Cleanup Register
- ADR Log
- Migration Blueprint (only its fixture table / shared utilities / metrics tables)

No document may fall behind the implementation (§22), and no document beyond the four above changes unless the architecture changes.

---

## 32. Stop Rule (permanent)

The Navigation Platform migration is an **engineering program with a stable blueprint**:

- Migrate **exactly one consumer at a time**.
- Every migration is an independent milestone with **independent review, approval, commit, and parity verification**.
- Do **not** optimize for speed — optimize for architectural consistency.
- Maintain this discipline through the final consumer.
