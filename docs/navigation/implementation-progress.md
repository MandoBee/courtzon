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
| **Phase 2-c** — Coach Navigation migration | ⬜ Not started | — | — |
| **Phase 2-d** — Referee Navigation migration | ⬜ Not started | — | — |
| **Phase 2-e** — Player Navigation migration | ⬜ Not started | — | — |
| **Phase 2-f** — Workspace migration | ⬜ Not started | — | — |

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

| # | Item | Phase 1 | Phase 2-a | Consumer 2 |
|---|------|---------|-----------|------------|
| 1 | Parity gate (own suite) | ✅ 30/30 | ✅ 35/35 | ✅ 37/37 |
| 2 | Full frontend unit suite | ✅ 40/40 | ✅ 45/45 | ✅ 47/47 |
| 3 | `npm run build` (tsc -b + vite) | ✅ PASS | ✅ PASS | ✅ PASS |
| 4 | `scripts/ci-validate.js` (navigation checks) | ✅ PASS | ✅ PASS (222 pre-existing backend errors = known noise) | ✅ PASS (222 pre-existing backend errors = known noise) |
| 5 | Isolated commit hash recorded | ✅ `2175414` | ✅ `52064ff` | ✅ `bbe92e1` |
| 6 | Progress doc updated | ✅ | ✅ | ✅ |
| 7 | Pushed (only after milestone approval) | ⬜ Local only | ⬜ Local only | ⬜ Local only |

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

## 6. Deviations

| ID | Date | Deviation | Approved by |
|----|------|-----------|-------------|
| — | — | (none) | — |

## 6a. Governance Artifacts (approved 2026-08-07)

- **Migration blueprint** — `docs/navigation/migration-blueprint.md`: official template, Navigation Identity Rule, frozen-fixture mandate, parity-first, backward-compat, generic-architecture, consumer independence, lessons learned, final engineering rules.
- **Cleanup register** — `docs/navigation/navigation-cleanup-register.md`: mandatory debt tracker (NC-001 label-keyed state is Mandatory).

## 7. Known Drift (open, Phase 2-f scope)

- 66 sidebar-only keys absent from the editor; 10 editor-only keys; `sidebar.roles` label drift; `sidebar.finance` path drift; per-node icon style. Full tables in `phase1-parity-report.md` §4. Tracked as NC-003 (Phase 2-f).
- ~~5 duplicated admin IDs~~ — **resolved by Commit 1 (`52064ff`)** via `nav.admin.*` id-decoupling; the 5 shared permission keys are now intentional section+landing pairs (ADR-005).
