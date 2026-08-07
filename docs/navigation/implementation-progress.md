# CourtZon Navigation — Implementation Progress

**Owner:** Platform Engineering
**Last updated:** 2026-08-07
**Spec:** `docs/navigation/nav-spec-v1.0.md` (frozen)
**Report:** `docs/navigation/phase1-parity-report.md`
**Blueprint:** `docs/navigation/migration-blueprint.md` (permanent governance)
**Cleanup register:** `docs/navigation/navigation-cleanup-register.md`

This document is the single synchronized record of navigation implementation state. It is updated after every approved milestone and must always reflect the repository as committed.

---

## 1. Status Summary

| Phase | Status | Commit | Date |
|-------|--------|--------|------|
| **Phase 1** — Registry extraction + parity gate | ✅ Approved & committed | `2175414` | 2026-08-07 |
| **Phase 2-a** — Admin Sidebar migration | ✅ Committed (awaiting architecture review) | `52064ff` | 2026-08-07 |
| **Phase 2-b** — Organisation Sidebar migration | ✅ Committed (Consumer 2, awaiting architecture review) | `bbe92e1` | 2026-08-07 |
| **Phase 2-c** — Coach Navigation migration | ✅ Approved (Consumer 3) | `d0b83c6` | 2026-08-07 |
| **Phase 2-d** — Referee Navigation migration | ⬜ Not started (Consumer 4 readiness below) | — | — |
| **Phase 2-e** — Player Navigation migration | ⬜ Not started | — | — |
| **Phase 2-f** — Workspace migration | ⬜ Not started | — | — |

> **Blueprint status: 🟢 STABLE** — validated on three navigation models (Admin hierarchical, Org flat+permissions, Coach static no-RBAC). No architectural change during remaining migrations unless a critical issue (ADR-017).
>
> **Registry status: 🟢 STABLE CONTRACT** — every exported registry interface is a platform contract (ADR-018).

---

## 2. Phase 2 Commit Plan (approved 2026-08-07)

Each migrated consumer is an **isolated commit** — never combined:

| Commit | Phase | Scope | Parity gate used |
|--------|-------|-------|------------------|
| 1 | 2-a | Admin Sidebar migration | `Phase 1 parity gate — admin sidebar` |
| 2 | 2-b | Organisation Sidebar migration | `Phase 1 parity gate — org sidebar` |
| 3 | 2-c | Coach Navigation migration | `Phase 1 parity gate — coach nav` |
| 4 | 2-d | Referee Navigation migration | `Phase 1 parity gate — referee nav` |
| 5 | 2-e | Player Navigation migration | `Phase 1 parity gate — player nav` |
| 6 | 2-f | Workspace migration (editor → registry, drift reconciliation) | Editor drift contract + integrity |

### 2.1 Hard requirements per commit

Each commit must:

- Build successfully (`npm run build` in `frontend/`).
- Pass all tests (full frontend unit suite).
- Pass its **own** parity gate (the suite named above).
- Be independently reviewable.
- Be independently revertible (a single `git revert` restores the prior consumer without touching others).

### 2.2 Mapping to the original spec sequence

The spec §5 sequence (`P2-a` id-decouple → `P2-e` IA) remains the logical order; the per-consumer commit plan **re-scopes it into independently shippable units**:

| Spec (logical) | Where it lands in the commit plan |
|----------------|-----------------------------------|
| Decouple `id` from `permissionKey` (registry-only) | Folded into **Commit 1** (Phase 2-a) — first consumer migration carries the registry id layer (R5/R26–R30) |
| Sidebar consumer migration | Commits 1–2 (admin, org) |
| Coach/Referee/Player consumer migration | Commits 3–5 |
| Data backfill (`sidebar_layout` → immutable ids) | Per-consumer, as each shell's persisted layouts are affected; backward-compatible alias read ships in Commit 1 |
| Workspace editor reconciliation + drift resolution | Commit 6 (Phase 2-f) |
| New admin IA (15 categories, "Coaching" umbrella) | LATER phase (spec R32/R33) — separate approval, NOT Phase 2 |

---

## 3. Process Rules (locked)

### 3.1 Git strategy

1. One navigation consumer = one commit.
2. Never combine multiple consumer migrations in a single commit.
3. Each commit: builds, passes tests, passes its own parity gate, independently reviewable, independently revertible.

### 3.2 GitHub strategy

1. Commit locally.
2. Architecture review.
3. Approval.
4. Continue to next milestone.
5. Push to `origin/master` only after a complete logical milestone has been approved.

### 3.3 Documentation

After each approved milestone:

- Update this document (mark completed phases).
- Record architectural decisions in §5 (ADR log).
- Record approved deviations in §6.
- Keep the checklist synchronized with the repository.

---

## 4. Verification Checklist (per milestone)

| # | Item | Phase 1 | Phase 2-a | Consumer 2 | Consumer 3 |
|---|------|---------|-----------|------------|------------|
| 1 | Parity gate (own suite) | ✅ 30/30 | ✅ 35/35 | ✅ 37/37 | ✅ 38/38 |
| 2 | Full frontend unit suite | ✅ 40/40 | ✅ 45/45 | ✅ 47/47 | ✅ 48/48 |
| 3 | `npm run build` (tsc -b + vite) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| 4 | `scripts/ci-validate.js` (navigation checks) | ✅ PASS | ✅ PASS (222 pre-existing backend errors = known noise) | ✅ PASS (222 pre-existing backend errors = known noise) | ✅ PASS (222 pre-existing backend errors = known noise) |
| 5 | Isolated commit hash recorded | ✅ `2175414` | ✅ `52064ff` | ✅ `bbe92e1` | ✅ `d0b83c6` |
| 6 | Progress doc updated | ✅ | ✅ | ✅ | ✅ |
| 7 | Pushed (only after milestone approval) | ⬜ Local only | ⬜ Local only | ⬜ Local only | ⬜ Local only |

---

## 5. ADR Log

| ID | Date | Decision |
|----|------|----------|
| ADR-001 | 2026-08-07 | The **production admin sidebar** (`buildNavItems`) is the sole authoritative legacy parity source; the Workspace editor is a documented, drifted second tree (spec Appendix A). |
| ADR-002 | 2026-08-07 | **Immutable Navigation IDs** separate from `permissionKey`; legacy keys accepted via alias map during transition (`immutable-navigation-ids-design-note.md`). |
| ADR-003 | 2026-08-07 | Phase 2 executed as **per-consumer isolated commits** (P2-a…P2-f), local-only until milestone approval. |
| ADR-004 | 2026-08-07 | **No DB schema changes** in Phase 2; `sidebar_layout` key-value backfill only. |
| ADR-005 | 2026-08-07 | Admin nav ids use the **`nav.admin.*` namespace**, immutable and decoupled from `permissionKey`. Section+landing-child pairs that shared one legacy key get a distinct `{section}.landing` child id. `ADMIN_ID_TO_KEY` / `ADMIN_LEGACY_KEY_TO_ID` alias maps keep legacy keys valid; `resolveAdminNav` accepts **key OR id** in saved layouts with legacy-exact reorder semantics. |
| ADR-006 | 2026-08-07 | The legacy `buildNavItems` definition is **frozen verbatim as the parity fixture** (`frontend/src/navigation/parity/legacy/admin-sidebar.ts`); AdminSidebar now renders only `resolveAdminNav(...)`. The parity gate compares registry vs the frozen legacy source. |
| ADR-007 | 2026-08-07 | `docs/navigation/migration-blueprint.md` is the **permanent consumer migration template** — the Phase 2-a lifecycle (Freeze → Fixture → Registry → Parity → Remove) is the only allowed migration path; no alternatives. |
| ADR-008 | 2026-08-07 | **Navigation Identity Rule is permanent:** Navigation IDs (immutable, structural, ordering, merge identity) and Permission Keys (authorization only, optional, shareable, RBAC) are decoupled and must never be coupled again. |
| ADR-009 | 2026-08-07 | `docs/navigation/navigation-cleanup-register.md` is the **mandatory debt tracker**; the platform is not complete until all Mandatory items resolve. Label-keyed nav state (NC-001) is the first Mandatory item. |
| ADR-010 | 2026-08-07 | All remaining consumers are treated as **independent milestones** (Consumer 1…6), each with its own fixture, parity gate, commit, review, and approval. No consumer authorizes the next. |
| ADR-011 | 2026-08-07 | Consumer 2 (org): org ids namespaced **`nav.org.*`**; shared **`buildNavIdKeyMaps`** helper (ADR-008, blueprint §8) replaces the admin-private indexer; **`ResolvedNavItem.id`** is now populated for every node on every shell — parity comparator excludes `id` from the legacy-visible surface. |
| ADR-012 | 2026-08-07 | **Migration blueprint is FROZEN** after two successful consumers (Admin hierarchical, Org flat). No process change for remaining consumers without a critical architectural issue. |
| ADR-013 | 2026-08-07 | **Registry API is stabilizing** — no breaking public API change without consumer impact review + documentation; changes are additive only. |
| ADR-014 | 2026-08-07 | **Shared-utility promotion is mandatory** — any helper used by >1 consumer moves to the shared `navigation/` layer immediately (prevents copy/paste divergence). |
| ADR-015 | 2026-08-07 | Consumer reports adopt the **15-item mandatory format** (blueprint §23): complexity assessment, registry statistics, cleanup progress (resolved/remaining/new), and phase health (green/yellow/red) are now required per consumer. |
| ADR-016 | 2026-08-07 | Consumer 3 (coach): ids namespaced **`nav.coach.*`**; coach nav carries **zero permission keys**, so `COACH_ID_TO_KEY` / `COACH_LEGACY_KEY_TO_ID` are intentionally empty (uniform map exports for API stability, ADR-013). Consumers' legacy `permission`-filter was a **no-op** (no item carried a key) and was removed as behavior-neutral; `CoachLayout`/`CoachBottomNav` now render `resolveCoachNav(t)` directly. The legacy `pages/coaches/coach-nav.ts` was fully self-contained and is **deleted** (whole file became the fixture). |
| ADR-017 | 2026-08-07 | **Blueprint declared STABLE** after three validated consumers (Admin hierarchical, Org flat+permissions, Coach static no-RBAC). No architectural changes during remaining migrations unless a critical issue; remaining consumers reuse the blueprint exactly as documented. |
| ADR-018 | 2026-08-07 | The **Navigation Registry is a platform contract** — every exported interface is stable. Any future public-interface change requires: reason, consumer impact, backward-compatibility analysis, and an ADR if architectural. |
| ADR-019 | 2026-08-07 | **Consumer classification is documented** (§8) — model, hierarchy, RBAC, persistence, context per consumer. Basis for readiness assessments (ADR-024). |
| ADR-020 | 2026-08-07 | **Pattern Validation Matrix** (§9) — a pattern is validated only after a consumer passes its parity gate using it; pending patterns are listed explicitly. |
| ADR-021 | 2026-08-07 | **Shared infrastructure is classified** Stable / Experimental / Temporary (§10). Consumers rely on Stable only; `findByIdOrKey` is Experimental (admin-private) pending a second consumer's need. |
| ADR-022 | 2026-08-07 | **Cleanup burndown tracking** (§11) — every register item carries Status (Open / In Progress / Completed) and Class (Mandatory / Recommended / Optional) so debt reduction is measurable. |
| ADR-023 | 2026-08-07 | **Registry Metrics are versioned** (§12) — Registry v1.0→v1.1→v1.2→v1.3… per consumer; Blueprint v1.0→v2.0-STABLE. Historical engineering record extended after every migration. |
| ADR-024 | 2026-08-07 | **Consumer readiness assessment** (§13) before every consumer: complexity, dependencies, expected risks, estimated validation scope. |
| ADR-025 | 2026-08-07 | **Documentation freeze** — the Navigation Specification stays frozen; migrations update only the tracker, cleanup register, ADR log, and blueprint (fixture/utilities/metrics tables). |
| ADR-026 | 2026-08-07 | Consumer deliverables adopt the **16-item mandatory format** (blueprint §23): architecture, classification, files, id mapping, registry contract changes, legacy compat, parity, tests, registry stats, pattern matrix, cleanup, risks, next-consumer readiness, lessons, documentation, commit hash. |

## 6. Deviations

| ID | Date | Deviation | Approved by |
|----|------|-----------|-------------|
| — | — | (none) | — |

## 6a. Governance Artifacts (approved 2026-08-07, extended with governance formalization)

- **Migration blueprint** — `docs/navigation/migration-blueprint.md` (v2.0-STABLE): official template, Navigation Identity Rule, frozen-fixture mandate, parity-first, backward-compat, generic-architecture, consumer independence, consumer classification (§25), pattern validation matrix (§26), shared infrastructure review (§27), cleanup burndown (§28), registry metrics (§29), consumer readiness (§30), documentation freeze (§31), stop rule (§32), final engineering rules.
- **Cleanup register** — `docs/navigation/navigation-cleanup-register.md`: mandatory debt tracker with burndown (Status + Class) — NC-001 label-keyed state is Mandatory.
- **Spec** — `docs/navigation/nav-spec-v1.0.md`: frozen (ADR-025 — not modified by migrations).

## 7. Known Drift (open, Phase 2-f scope)

- 66 sidebar-only keys absent from the editor; 10 editor-only keys; `sidebar.roles` label drift; `sidebar.finance` path drift; per-node icon style. Full tables in `phase1-parity-report.md` §4. Tracked as NC-003 (Phase 2-f).
- ~~5 duplicated admin IDs~~ — **resolved by Commit 1 (`52064ff`)** via `nav.admin.*` id-decoupling; the 5 shared permission keys are now intentional section+landing pairs (ADR-005).

---

## 8. Consumer Classification (ADR-019)

| Consumer | Shell | Model | Hierarchy | RBAC | Persistence | Context | Status |
|----------|-------|-------|-----------|------|-------------|---------|--------|
| 1 Admin | `AdminSidebar` | Complex hierarchical | Deep (sections + landing children) | Permissions + feature flags | Saved layouts (`sidebar_layout`) | Global admin | ✅ 2-a (`52064ff`) |
| 2 Organisation | `OrgSidebar` | Flat | 1 level | Permissions (23 keys) | None | Org context (`{orgId}` path templates) | ✅ 2-b (`bbe92e1`) |
| 3 Coach | `CoachLayout` + `CoachBottomNav` | Flat static | 1 level | None (0 keys) | None | Coach | ✅ 2-c (`d0b83c6`) |
| 4 Referee | `RefereeLayout` + `RefereeBottomNav` | Flat permission-gated | 1 level | Permissions (6 keys, 1 shared) | None | Referee | ⬜ Consumer 4 |
| 5 Player | `BottomNav` | Two-tier (core + More) | 2 groups | Permissions + seller + chat flag | None | Player / Seller | ⬜ Consumer 5 |
| 6 Workspace | `SidebarLayoutPage` (DnD editor) | Complex, legacy-keyed | Deep | Permissions | Reads/writes saved layout | Admin | ⬜ Consumer 6 |

---

## 9. Pattern Validation Matrix (ADR-020)

**Validated** (consumer that first proved it):

| Pattern | Proved by |
|---------|-----------|
| ✓ Hierarchical navigation | Admin (2-a) |
| ✓ Flat navigation | Org (2-b), Coach (2-c) |
| ✓ Permission-gated flat navigation | Org (2-b) |
| ✓ Static navigation without RBAC | Coach (2-c) |
| ✓ Navigation IDs (immutable, namespaced `nav.*`) | Admin (2-a) |
| ✓ Legacy compatibility (key-or-id alias) | Admin (2-a), Org (2-b) |
| ✓ Registry-first rendering | Admin, Org, Coach |
| ✓ Frozen legacy fixture | all three |
| ✓ Parity gate (translations, permissions, flags, saved layouts) | all three |
| ✓ Generic resolver | all three |
| ✓ Shared registry utilities (`buildNavIdKeyMaps`) | Org (2-b), Coach (2-c) |
| ✓ Immutable id on every resolved node | Org (2-b), Coach (2-c) |
| ✓ Uniform map exports incl. empty maps | Coach (2-c) |

**Pending validation:**

| Pattern | First exercised by |
|---------|--------------------|
| ◻ Small permission-gated shell | Referee (Consumer 4) |
| ◻ Shared permission key across multiple items | Referee (Consumer 4) — `referee.assignments.view` on Assignments + Matches |
| ◻ Two-tier more-sheet filtering | Player (Consumer 5) |
| ◻ Feature-flag gating | Player (Consumer 5) — chat flag |
| ◻ Seller-context gating | Player (Consumer 5) |
| ◻ DnD workspace reconciliation | Workspace (Consumer 6) |
| ◻ Saved-layout DB backfill | NC-004 (post-2-f) |
| ◻ Id-keyed React state cleanups | NC-001 / NC-002 (cleanup milestone) |

---

## 10. Shared Infrastructure Review (ADR-021)

| Helper | Layer | Class | Consumers | Notes |
|--------|-------|-------|-----------|-------|
| `NavDefinition`, `ResolvedNavItem` | `navigation/types.ts` | **Stable** | all | Platform contract |
| `T`, `LIT`, `COMPOSITE`, `resolveLabel` | `navigation/labels.ts` | **Stable** | all | Label system |
| `buildNavIdKeyMaps`, `NavIdKeyMaps` | `navigation/id-key.ts` | **Stable** | admin, org, coach | 3 shells |
| Generic resolvers + `toResolved` | `navigation/resolve.ts` | **Stable** | all | |
| `findByIdOrKey` | `navigation/resolve.ts` (private) | **Experimental** | admin only | Promote if a 2nd consumer needs key-or-id saved layouts (review at Workspace) |
| Parity `compare.ts` + frozen fixtures | `navigation/parity/` | **Stable (test-only)** | suite | Permanent baselines |
| Per-shell alias maps (`*_ID_TO_KEY`, `*_LEGACY_KEY_TO_ID`) | per registry | **Stable** | per shell | Uniform, additive |

---

## 11. Cleanup Burndown (ADR-022)

| Item | Class | Status | Blocked by | Notes |
|------|-------|--------|-----------|-------|
| NC-001 — label-keyed `openMenus` | **Mandatory** | **Open** | — | Enabler landed (id on resolved items, `bbe92e1`) |
| NC-002 — path-keyed React keys | **Optional** | **Open** | — | Coach/Org/Admin all path-keyed; low risk |
| NC-003 — Workspace editor legacy identity | **Recommended** | **Open** | Phase 2-f | Largest consumer |
| NC-004 — saved-layout DB rows legacy-keyed | **Recommended** | **Open** | Post-2-f + approval | One-time backfill |

**Burndown:** 4 open / 0 in progress / 0 completed. Open count must be reported every migration.

---

## 12. Registry Metrics (ADR-023)

Versioning: **Registry** v1.0 (extraction) → v1.1 (admin) → v1.2 (org) → v1.3 (coach). **Blueprint** v1.0 → **v2.0-STABLE** (governance formalization).

| As of | Nav IDs (`nav.*`) | Categories | Pages (nodes) | Consumers migrated | Shared utilities (Stable) | Cleanup open/completed | ADRs | Registry | Blueprint |
|-------|-------------------|------------|---------------|--------------------|---------------------------|------------------------|------|----------|-----------|
| Phase 1 | 0 | 0 | 173 | 0/6 | 0 | — | 1 | v1.0 | — |
| 2-a | 120 | 26 | 173 | 1/6 | 1 | — | 11 | v1.1 | v1.0 |
| 2-b | 143 | 49 | 173 | 2/6 | 1 | 4/0 | 16 | v1.2 | v1.0 |
| **2-c** | **149** | **55** | **173** | **3/6** | **1** | **4/0** | **26** | **v1.3** | **v2.0-STABLE** |

Definitions: Nav IDs = immutable ids in migrated shells (admin 120 + org 23 + coach 6). Categories = top-level entries in migrated shells (admin 26 + org 23 + coach 6). Pages = total registry nodes across all shells (incl. unmigrated referee 6, player 18). Shared utilities = Stable-layer helpers (label system + `buildNavIdKeyMaps`; types/resolvers counted as platform surface).

---

## 13. Consumer 4 — Readiness Assessment (Referee, ADR-024)

| Item | Assessment |
|------|-----------|
| **Complexity** | **Low** — 6 flat nodes, 1 level, no sections, no saved layouts, no flags. Mirrors Coach (2-c) plus real RBAC. |
| **Dependencies** | `pages/referee/referee-nav.ts` (legacy static array, self-contained → deletable after freeze); consumers `RefereeLayout.tsx` + `RefereeBottomNav.tsx` (both filter by `permission` — **real** RBAC, not a no-op); existing referee parity block in `parity.test.ts` (all/partial/none permissions). |
| **Expected risks** | (1) `referee.assignments.view` is **shared** by Assignments + Matches → `REFEREE_LEGACY_KEY_TO_ID` maps 1 key → 2 ids (mirrors admin section+landing pairs). (2) RBAC filter must be preserved exactly → migrate to `resolveRefereeNav(can, t)`; unlike Coach, the filter is behavior-bearing. (3) ids must be renamed `referee.*` → `nav.referee.*`. (4) No label-keyed state exists (checked) — no NC-001 exposure; React keys remain path-keyed (NC-002, unchanged). |
| **Estimated validation scope** | Parity: all / partial / none permissions (3 cases exist). Registry integrity: namespace `nav.referee.*`, count 6, key coverage 6 keys / 5 unique, shared-key map. Full frontend suite, `npm run build`, `ci-validate.js`. |
