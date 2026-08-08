# CourtZon Navigation — Implementation Progress

**Owner:** Platform Engineering
**Last updated:** 2026-08-08
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
| **Phase 2-d** — Referee Navigation migration | ✅ Committed (Consumer 4 — shared-permission-key validation, awaiting architecture review) | (see §4) | 2026-08-07 |
| **Phase 2-e** — Player Navigation migration | ✅ Committed (Consumer 5 — two-tier More + composition pipeline, awaiting architecture review) | (see §4) | 2026-08-07 |
| **Phase 2-f** — Workspace migration | ✅ Committed (Consumer 6 — Registry integration, drift resolved) | `d031f33` | 2026-08-07 |
| **Commit 9** — Domain label localization (EN + AR) | ✅ Committed (translation-only; 8 domain labels `LIT`→`T`, 8 EN keys, 8 AR seed rows, integrity tests) | (see §4) | 2026-08-08 |
| **Commit 11** — Sidebar verification (8 domains, permission sets, marketplace flag toggle) | ✅ Committed | `3b3bb79` | 2026-08-08 |
| **Commit 12** — Search: admin search finds all modules under new domain paths | ✅ Committed (Command Palette → Registry via `resolveAdminNav`; pure `search.ts` module; hardcoded `NAV_COMMANDS` + `super_admin` role check removed) | (see §4) | 2026-08-08 |

> **Navigation Platform: 🟢 CLOSED** — all six consumers migrated. Registry is the single source of truth. No parallel navigation model remains. Completion report: `docs/navigation/completion-report.md`.
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

| # | Item | Phase 1 | Phase 2-a | Consumer 2 | Consumer 3 | Consumer 4 | Consumer 5 | Consumer 6 |
|---|------|---------|-----------|------------|------------|------------|------------|------------|
| 1 | Parity gate (own suite) | ✅ 30/30 | ✅ 35/35 | ✅ 37/37 | ✅ 38/38 | ✅ 43/43 | ✅ 53/53 | ✅ 67/67 |
| 2 | Full frontend unit suite | ✅ 40/40 | ✅ 45/45 | ✅ 47/47 | ✅ 48/48 | ✅ 53/53 | ✅ 63/63 | ✅ 67/67 |
| 3 | `npm run build` (tsc -b + vite) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| 4 | `scripts/ci-validate.js` (navigation checks) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS (222 baseline) |
| 5 | Isolated commit hash recorded | ✅ `2175414` | ✅ `52064ff` | ✅ `bbe92e1` | ✅ `d0b83c6` | ✅ `6fa7174` | ✅ `c0f04af` | ✅ `d031f33` |
| 6 | Progress doc updated | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | Pushed (only after milestone approval) | ⬜ Local only | ⬜ Local only | ⬜ Local only | ⬜ Local only | ⬜ Local only | ⬜ Local only | ⬜ Local only |

### Commit 9 — Domain label localization (EN + AR)

| # | Item | Commit 9 |
|---|------|----------|
| 1 | Translation integrity suite (own suite) | ✅ 16/16 |
| 2 | Full frontend unit suite | ✅ 96/96 (80 baseline + 16 new) |
| 3 | `npm run build` (tsc -b + vite) | ✅ PASS |
| 4 | `scripts/ci-validate.js` (222 baseline) | ✅ 222 unchanged (section 4 Translation Registry all PASS) |
| 5 | Isolated commit hash recorded | (see §4) |
| 6 | Progress + log docs updated | ✅ |
| 7 | Pushed | (see §4 / per approval gate) |

### Commit 12 — Search verification (Command Palette → Registry)

| # | Item | Commit 12 |
|---|------|-----------|
| 1 | Search test suite (own block in `parity.test.ts`) | ✅ 10 new `it` |
| 2 | Full frontend unit suite | ✅ 115/115 (105 baseline + 10 new) |
| 3 | `npm run build` (tsc -b + vite) | ✅ PASS |
| 4 | `scripts/ci-validate.js` (222 baseline) | ✅ 222 unchanged |
| 5 | Isolated commit hash recorded | (see §4) |
| 6 | Progress + log docs updated | ✅ |
| 7 | Pushed | (see §4 / per approval gate) |

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
| ADR-027 | 2026-08-07 | Consumer 4 (referee) is the **architectural validation of Shared Permission Key Navigation**: ids `nav.referee.*` decoupled from keys; `referee.assignments.view` intentionally protects two nodes (Assignments + Matches); `REFEREE_LEGACY_KEY_TO_ID` maps 1 key → 2 ids (array, registry order); identity stays unique per node, authorization stays shared — the two remain completely independent. No cleanup items resolved; no registry contract change. |
| ADR-028 | 2026-08-07 | **Navigation Composition is a multi-stage pipeline, not per-consumer filtering.** Consumer 5 (player) introduces `navigation/pipeline.ts` (Stable shared infra): discrete composable stages `sellerFilter` → `permissionFilter` → `featureFlagFilter` (plus `requiredFlagFilter`), assembled by `composeFilters(...)` into per-shell pipelines (`PLAYER_MORE_PIPELINE`, `PLAYER_CORE_PIPELINE`) and projected by `projectPlayerCoreTabs`/`projectPlayerMoreItems`. Bottom Navigation is just another projection of the same Registry; stages stay consumer-agnostic (verified: the same stages filter org/admin defs). No consumer-specific filter code remains in `BottomNav.tsx`. |
| ADR-029 | 2026-08-07 | Consumer 5 (player): ids normalized **`nav.*` → `nav.player.*`** (18 nodes: 3 core + 15 More). `sellerOnly` is a **context-gating** attribute (declarative, projection-level), not RBAC — enforced by the Seller stage; `community.chat_enabled` is a **feature-flag** gate on the same Messages node (combined flag+permission first validated on a non-admin shell). `PLAYER_ID_TO_KEY`/`PLAYER_LEGACY_KEY_TO_ID` (12 keyed items) exported uniformly. Legacy `buildPlayerCoreTabs`/`buildPlayerMoreItems`/`filterPlayerMoreItems` frozen verbatim into `parity/legacy/player-nav.ts`; `BottomNav.tsx` now renders only registry resolvers. Cart badge (badgeCount) stays a component-level projection overlay, not registry data. |
| ADR-030 | 2026-08-07 | Consumer 6 (workspace) is the **final integration milestone** — not another architecture validation. `SidebarLayoutPage.tsx`'s `buildSections()` (110-line parallel navigation tree) replaced with `resolveWorkspaceNav(t)`, consuming `ADMIN_NAV` directly. **Drift fully resolved:** 15 missing admin sections now visible, 10 editor-only keys removed, label/path/icon drift eliminated. DnD editor preserves all existing behavior (save/load via permission keys, backward compatible with `sidebar_layout` table). All 120 `nav.admin.*` ids carried on every workspace node via `WorkspaceNode`. The Navigation Platform is now **closed** — Registry is the single source of truth for all 6 consumers. Completion report: `docs/navigation/completion-report.md`. NC-003 (Workspace editor legacy identity) resolved by this consumer. |
| ADR-031 | 2026-08-08 | **Commit 9 — IA domain label localization is a label-system change, not a navigation-migration change.** The 8 domain labels introduced by the IA restructure are now `T('nav.admin.domain.*')` (EN registry + AR seed), replacing their `LIT()` literals. **No navigation structure changed**: Navigation IDs, permission keys, routes, icons, feature flags, ordering, and hierarchy are byte-identical across locales (proved by the 16-test translation-integrity suite). The 61 remaining `LIT()` labels in `admin.registry.ts` are pre-existing (Classification D) and stay untouched. AR registration uses the existing seed convention (`INSERT IGNORE INTO translations`) — additive, ids 308-315, no schema/migration/runtime change. Pipeline: `generate-translation-artifact.js` (1525 keys — the generated artifact contains the **EN registry defaults**; Arabic translations remain **DB-driven**, supplied by the committed database seed) + `sync-translation-keys.js` (registry→DB; DB write blocked by local XAMPP root auth environment — environment limitation, no bypass). **AR status: Source Verification PASS / Seed Integrity PASS / Runtime Verification NOT EXECUTED.** |
| ADR-032 | 2026-08-08 | **Commit 10 — Workspace DnD round-trip is now regression-guarded (UAT gate for the DnD editor).** Implements the post-mortem §7 recommendation: `resolveWorkspaceNav` → DnD → save → load → `resolveAdminNav` is covered by a dedicated 5-test block (`Commit 10 — Workspace DnD round-trip (saved layout compatibility)`) in `frontend/src/navigation/parity/parity.test.ts`. Covers: 8 domains as sortable containers, within-domain reorder survives save→load→resolve, `mergeSavedLayout` editor-load parity, stale-key drop without module orphaning, and legacy `sidebar.*` permission-key rows round-tripping into `resolveAdminNav`. **Shared pure module `frontend/src/navigation/workspace-layout.ts` extracted** (`buildContainerKeys`, `buildDefaultContainers`, `serializeContainers`, `mergeSavedLayout`, `WorkspaceLayoutRow`) so tests exercise the real page logic (ADR-014 shared-utility promotion applies only to the extraction into the shared `navigation/` layer; ADR-030 scope — no new ADR). SidebarLayoutPage refactored to consume it, behavior byte-compatible. DnD identity stays legacy permission keys (NC-003 Recommended, intentionally left open). **Tests: 96 → 101 (5 new). Build PASS. CI-validate 222 baseline unchanged.** |
| ADR-032 | 2026-08-08 | **Classification of `workspace-layout.ts` (conformance clarification):** **Workspace-specific shared utility — Stable for Workspace consumption. NOT promoted to platform-wide shared infrastructure.** The shared pure module lives in the shared `navigation/` layer (ADR-014 extraction) but has no second independent consumer; its layout concerns (`buildContainerKeys`, `buildDefaultContainers`, `serializeContainers`, `mergeSavedLayout`, `WorkspaceLayoutRow`) are validated solely by the Workspace DnD save→load→resolve round-trip. Platform-wide promotion requires (1) a future independent consumer, (2) evidence of genuine reusability beyond Workspace, (3) explicit conformance review. The distinction Workspace-specific shared utility vs platform-wide shared infrastructure is preserved; it is NOT Stable Shared Infrastructure, NOT Platform Infrastructure, NOT navigation-wide infrastructure until such promotion. | The existence of a shared pure module does not automatically make it platform-wide infrastructure. This is a conformance clarification of the existing ADR-032 record — no new ADR, no classification change to the implementation. | Navigation Constitution (ADR-005), ADR-014, ADR-030 |
| ADR-032 | 2026-08-08 | **Search classification (conformance clarification, extends the ADR-032 record):** `frontend/src/navigation/search.ts` is a **Search-specific shared utility — Stable for the Command Palette consumption. NOT promoted to platform-wide shared infrastructure.** `buildAdminSearchCommands`, `matchNavSearchCommands`, and `LEGACY_NAV_COMMANDS` are validated by the Commit 12 search test block + the Command Palette consumer; the module has a single consumer today. Promotion to platform-wide shared infrastructure requires (1) a future independent consumer, (2) evidence of genuine reusability beyond Search, (3) explicit conformance review. Same classification rationale as `workspace-layout.ts` (ADR-032). | No new ADR, no classification change to the implementation. Consistent with the established Workspace-specific classification precedent. | Navigation Constitution (ADR-005), ADR-014, ADR-032 |

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
| 4 Referee | `RefereeLayout` + `RefereeBottomNav` | Flat permission-gated | 1 level | Permissions (6 keys, **1 shared**) | None | Referee | ✅ 2-d (`6fa7174`) |
| 5 Player | `BottomNav` | Two-tier (core + More) | 2 groups | Permissions + seller + chat flag | None | Player / Seller | ✅ 2-e (Consumer 5) |
| 6 Workspace | `SidebarLayoutPage` (DnD editor) | Complex, Registry-driven | Deep | Permissions (key-based saved layout) | Reads/writes saved layout | Admin | ✅ 2-f (`d031f33`) |

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
| ✓ Registry-first rendering | all four |
| ✓ Frozen legacy fixture | all four |
| ✓ Parity gate (translations, permissions, flags, saved layouts) | all four |
| ✓ Generic resolver | all four |
| ✓ Shared registry utilities (`buildNavIdKeyMaps`) | Org (2-b), Coach (2-c), Referee (2-d) |
| ✓ Immutable id on every resolved node | Org (2-b), Coach (2-c), Referee (2-d) |
| ✓ Uniform map exports incl. empty maps | Coach (2-c) |
| ✓ **Small permission-gated shell** | **Referee (2-d)** |
| ✓ **Shared Permission Key Navigation** (1 key protects multiple nodes; ids stay unique, filtering stays correct, resolution deterministic) | **Referee (2-d)** — `referee.assignments.view` → Assignments + Matches |
| ✓ **Two-tier navigation (core tabs + More sheet)** | **Player (2-e)** — 3 core + 15 More, both projections of the same Registry |
| ✓ **Composable filtering pipeline** (Seller → Permission → FeatureFlag stages, `composeFilters`) | **Player (2-e)** — `pipeline.ts` shared infra, stages consumer-agnostic |
| ✓ **Seller-context gating** (`sellerOnly`, non-RBAC context attribute) | **Player (2-e)** — my_shop visible only for seller |
| ✓ **Feature-flag gating** (`featureFlag`, chat enabled) | **Player (2-e)** — Messages hidden when `community.chat_enabled` off |

**Pending validation:**

| Pattern | First exercised by |
|---------|--------------------|
| ◻ DnD workspace reconciliation | Workspace (Consumer 6) |
| ◻ Saved-layout DB backfill | NC-004 (post-2-f) |
| ◻ Id-keyed React state cleanups | NC-001 / NC-002 (cleanup milestone) |

---

## 10. Shared Infrastructure Review (ADR-021)

| Helper | Layer | Class | Consumers | Notes |
|--------|-------|-------|-----------|-------|
| `NavDefinition`, `ResolvedNavItem` | `navigation/types.ts` | **Stable** | all | Platform contract |
| `T`, `LIT`, `COMPOSITE`, `resolveLabel` | `navigation/labels.ts` | **Stable** | all | Label system |
| `buildNavIdKeyMaps`, `NavIdKeyMaps` | `navigation/id-key.ts` | **Stable** | admin, org, coach, referee, player | 5 shells |
| Generic resolvers + `toResolved` | `navigation/resolve.ts` | **Stable** | all | |
| `pipeline.ts` (`composeFilters`, `sellerFilter`, `permissionFilter`, `featureFlagFilter`, `requiredFlagFilter`) | `navigation/pipeline.ts` | **Stable** | player (validated) → reusable for all shells | Composable filtering stages; consumer-agnostic (tested against org/admin defs) |
| `findByIdOrKey` | `navigation/resolve.ts` (private) | **Experimental** | admin only | Promote if a 2nd consumer needs key-or-id saved layouts (review at Workspace) |
| Parity `compare.ts` + frozen fixtures | `navigation/parity/` | **Stable (test-only)** | suite | Permanent baselines |
| Per-shell alias maps (`*_ID_TO_KEY`, `*_LEGACY_KEY_TO_ID`) | per registry | **Stable** | per shell | Uniform, additive |

---

## 11. Cleanup Burndown (ADR-022)

| Item | Class | Status | Blocked by | Notes |
|------|-------|--------|-----------|-------|
| NC-001 — label-keyed `openMenus` | **Mandatory** | **Open** | — | Enabler landed (id on resolved items, `bbe92e1`) |
| NC-002 — path-keyed React keys | **Optional** | **Open** | — | Coach/Org/Admin all path-keyed; low risk |
| NC-003 — Workspace editor legacy identity | **Recommended** | **Completed** (`d031f33`) | — | Consumer 6 resolution |
| NC-004 — saved-layout DB rows legacy-keyed | **Recommended** | **Open** | Post-2-f + approval | One-time backfill |

**Burndown:** 3 open / 0 in progress / 1 completed. **Consumer 6 resolved NC-003** — workspace editor now uses Registry-driven identities.

---

## 12. Registry Metrics (ADR-023)

Versioning: **Registry** v1.0 → v1.1 → v1.2 → v1.3 → v1.4 → v1.5 → **v2.0-STABLE** (all 6 consumers migrated). **Blueprint** v1.0 → **v2.0-STABLE**.

| As of | Nav IDs (`nav.*`) | Categories | Pages (nodes) | Consumers migrated | Shared utilities (Stable) | Cleanup open/completed | ADRs | Registry | Blueprint |
|-------|-------------------|------------|---------------|--------------------|---------------------------|------------------------|------|----------|-----------|
| Phase 1 | 0 | 0 | 173 | 0/6 | 0 | — | 1 | v1.0 | — |
| 2-a | 120 | 26 | 173 | 1/6 | 1 | — | 11 | v1.1 | v1.0 |
| 2-b | 143 | 49 | 173 | 2/6 | 1 | 4/0 | 16 | v1.2 | v1.0 |
| 2-c | 149 | 55 | 173 | 3/6 | 1 | 4/0 | 26 | v1.3 | v2.0-STABLE |
| 2-d | 155 | 61 | 173 | 4/6 | 1 | 4/0 | 27 | v1.4 | v2.0-STABLE |
| 2-e | 173 | 79 | 173 | 5/6 | 2 | 4/0 | 29 | v1.5 | v2.0-STABLE |
| **2-f** | **173** | **79** | **173** | **6/6** | **2** | **3/1** | **30** | **v2.0-STABLE** | **v2.0-STABLE** |

Definitions: Nav IDs = immutable ids in migrated shells (admin 120 + org 23 + coach 6 + referee 6 + player 18). Categories = top-level entries in migrated shells. Pages = total registry nodes across all shells. Workspace consumes admin's 120 ids directly — no new ids added. Cleanup: NC-003 resolved by Consumer 6 (`d031f33`).

> **Commit 9 (2026-08-08) note:** Localization of the 8 IA domain labels adds **translation keys, not navigation nodes**. Nav IDs (128 admin), categories (8 domains / 79), and node count (173) are unchanged — verified structural identity across locales by the translation-integrity suite. Test suite: 80 → 96. CI baseline: 222 unchanged.

---

## 13. Consumer Readiness Assessments (ADR-024)

### Consumer 4 — Referee (completed 2-d)

| Item | Assessment | Outcome |
|------|-----------|---------|
| **Complexity** | **Low** — 6 flat nodes, 1 level, no sections, no saved layouts, no flags. Mirrors Coach (2-c) plus real RBAC. | Matched expectation. |
| **Dependencies** | `pages/referee/referee-nav.ts` (legacy static array, self-contained → deletable after freeze); consumers `RefereeLayout.tsx` + `RefereeBottomNav.tsx` (both filter by `permission` — **real** RBAC, not a no-op); existing referee parity block in `parity.test.ts` (all/partial/none permissions). | Confirmed; legacy file fully deleted. |
| **Expected risks** | (1) `referee.assignments.view` **shared** by Assignments + Matches → 1 key → 2 ids. (2) RBAC filter behavior-bearing → `resolveRefereeNav(can, t)`. (3) ids renamed `referee.*` → `nav.referee.*`. (4) No label-keyed state; React keys stay path-keyed (NC-002). | All confirmed; shared-key validated by 5 new tests. |
| **Estimated validation scope** | Parity all/partial/none, registry integrity, full suite, build, ci-validate. | Done — 43/43, 53/53, build PASS, ci-validate 222 baseline. |

### Consumer 5 — Player (completed 2-e)

| Item | Assessment | Outcome |
|------|-----------|---------|
| **Complexity** | **Medium–High** — two-tier model (3 core tabs + 15 More items), combined gating (permissions + `sellerOnly` context + `community.chat_enabled` feature flag), consumed by the large multi-purpose `BottomNav.tsx`. | Matched expectation. |
| **Dependencies** | `components/layout/BottomNav.tsx` (exports `buildPlayerCoreTabs`, `buildPlayerMoreItems`, `filterPlayerMoreItems` used by parity; the component also renders More sheet, seller shop link, chat item); player registry already extracted (`PLAYER_CORE_TABS`, `PLAYER_MORE_ITEMS`) with generic `nav.*` ids; 18 player nodes. | Confirmed; legacy helpers frozen into `parity/legacy/player-nav.ts`, `BottomNav.tsx` now renders registry resolvers only. |
| **Expected risks** | (1) **id namespace gap**: player ids are generic `nav.home`, `nav.bookings`, `nav.matches`… — not `nav.player.*`. Normalize to `nav.player.*` during migration (no persisted player consumer yet → safe, consistent with coach/referee normalization). (2) `sellerOnly` is a **context-gating** pattern (not RBAC) — first of its kind; must be preserved exactly. (3) `community.chat_enabled` feature flag + `permissionKey` on the same item — first combined flag+RBAC node outside admin. (4) `BottomNav.tsx` is large (mobile nav, More sheet, haptics, notifications badge) — freeze must capture the two-tier filtered output, not the whole component. (5) AppLayout uses BottomNav; no saved layouts → no NC-001/NC-004 exposure. | All confirmed; id namespace normalized to `nav.player.*` (18 ids), seller stage preserves `sellerOnly` gating, chat flag gated via pipeline, freeze captured the two-tier filtered output, no cleanup exposure. |
| **Estimated validation scope** | Parity: core across 3 translation modes; More items across isSeller × chatEnabled × can combinations (existing exhaustive loop); registry integrity (namespace `nav.player.*`, 3+15 ids, unique); full suite, build, ci-validate. | Done — 53/53 parity, 63/63 full suite, build PASS, ci-validate 222 baseline unchanged. +10 new tests (pipeline determinism, stage independence, consumer-agnostic stages, resolver≡pipeline composition proof, player id-key maps, namespace integrity). |
