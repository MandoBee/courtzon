# CourtZon Navigation Specification v1.0

**Status:** FROZEN
**Approved:** 2026-08-06
**Restored to source control:** 2026-08-07
**Owner:** Platform Engineering

> **Restoration note (2026-08-07).** The original `nav-spec-v1.0.md` was produced in the 2026-08-06/07 planning session but was never persisted to the repository or any commit. This file is a faithful reconstruction of the **approved final version** from the session record — every scope decision, constraint, and ordering below was explicitly approved. Where the original line-item wording is no longer available verbatim, the requirement is stated from the approved decision it encodes. The parity report `docs/navigation/phase1-parity-report.md` records the verified implementation state against this spec. This file is the implementation contract for Phase 2 and beyond; it is frozen and may only be changed by a new approval.

---

## 1. Purpose

Navigation must have a **single, authoritative definition source** — the Navigation Registry — from which every navigation consumer (admin sidebar, org sidebar, coach/referee/player navigation, and the Workspace sidebar editor) renders. Today's navigation is defined five times over in ad-hoc component code with duplicated, drifting trees. This spec establishes:

1. A registry-first architecture: definitions live in `frontend/src/navigation/`, consumers resolve from it.
2. A **parity gate** proving the registry is byte-for-byte equivalent to today's production navigation before any consumer is migrated.
3. **Immutable Navigation IDs**, independent of RBAC permission keys, so layouts and references survive IA evolution.
4. RBAC-driven visibility: every element gates through the existing permissions system (`can()` / `<Can>`), never through role checks.
5. Explicit, phased scope: **zero functional change** until each phase is individually approved.

## 2. Scope and Non-Goals

### 2.1 Approved Phase 1 scope (complete)

- Extract the Navigation Registry as the single source of navigation definitions.
- Build an automated parity gate proving byte-for-byte equivalence to today's navigation.
- Zero functional changes to any consumer.

### 2.2 Frozen non-goals (all phases until individually approved)

| Non-goal | Status |
|----------|--------|
| IA renames / moves / restructures | ❌ Not in Phase 1–2 |
| New IA applied (incl. the admin 15-category IA and "Coaching" umbrella) | ❌ Later phase only |
| Sidebar / Workspace / Search / Breadcrumbs / Quick Access behavior changes | ❌ Not in Phase 1–2 |
| DB schema changes | ❌ Not in Phase 1–2 (backfill is data-only) |
| Backend changes | ❌ Not in Phase 1–2 |
| Assigned Layouts | ❌ Later phase only |

## 3. Definitions

| Term | Definition |
|------|------------|
| **Shell** | A navigation surface: `admin`, `org`, `coach`, `referee`, `player`. |
| **Navigation Registry** | The set of definition modules under `frontend/src/navigation/` (`*.registry.ts`), typed by `NavDefinition`. The single source of truth. |
| **NavDefinition** | A typed node: `id` (immutable), `label` (`t`/`lit`/`composite`), `icon`, `path`, `permissionKey` (optional), `requiredFlag`, `featureFlag`, `children`. |
| **ResolvedNavItem** | The runtime shape produced by `resolve*()` — labels translated, paths substituted, filters applied. |
| **Navigation ID** | Immutable structural identity of a node (Phase 2-a onward). Distinct from `permissionKey`. |
| **Parity gate** | The test suite in `frontend/src/navigation/parity/parity.test.ts` proving registry output ≡ legacy output. |
| **Assigned Layouts** | Per-role / per-org layout assignment (future feature; NOT in scope until approved). |
| **IA** | Information Architecture — the tree structure/labels of the navigation. |

## 4. The Five Shells (frozen current state)

| Shell | Items | Top-level | Sections | Leaf | Permission keys |
|-------|-------|-----------|----------|------|-----------------|
| Admin | 120 | 26 | 15 | 105 | 120 |
| Org | 23 | 23 | 0 | 23 | 23 |
| Coach | 6 | 6 | 0 | 6 | 0 (no gating) |
| Referee | 6 | 6 | 0 | 6 | 6 |
| Player (core tabs) | 3 | 3 | — | — | 0 |
| Player (more items) | 15 | 15 | — | — | 8 + 1 feature flag |

## 5. Registry-First Migration Order (frozen)

| Step | Work | Consumer impact |
|------|------|-----------------|
| **P1** ✅ | Registry extraction + parity gate (Phase 1) | None |
| **P2-a** | Decouple `id` from `permissionKey`; assign immutable IDs | None (registry-only) |
| **P2-b** | Migrate sidebar consumers to resolvers; delete legacy builders | Zero (parity-proven) |
| **P2-c** | Data backfill: `sidebar_layout` rows → immutable IDs | Backward-compatible |
| **P2-d** | Workspace editor migrates to registry; reconcile editor drift | Editor becomes WYSIWYG |
| **P2-e** | Apply new admin IA (15 categories incl. "Coaching" umbrella) | Parity flips to spec tree |

No step may begin until its precondition is met (registry-first) and its own approval is granted.

## 6. Requirements

### 6.1 Registry (R1–R10)

- **R1.** Every shell's navigation is defined in the Navigation Registry and nowhere else. Consumer code may reference definitions only through `resolve*()` functions.
- **R2.** The registry is typed by `NavDefinition`; labels are `t` (i18n key), `lit` (literal), or `composite` (parts).
- **R3.** Every i18n `t` key used in the registry must exist in the i18n defaults registry (`getRegistryDefaultsMap()`); the integrity tests enforce this.
- **R4.** The registry must not contain duplicate definitions between shells (each shell is independent but node identity is global).
- **R5.** **No duplicate Navigation IDs within a shell.** (Violated today by 5 admin keys where the section and its landing-page child share a permissionKey — see `immutable-navigation-ids-design-note.md`; fixed by P2-a.)
- **R6.** The registry is the source for: sidebar consumers, Workspace editor, parity gate, and future Assigned Layouts.
- **R7.** Registry modules may not import consumer components (one-directional dependency).
- **R8.** Icon and metadata live with the definition, not in hardcoded consumer maps.
- **R9.** Org paths use `{orgId}` placeholders substituted at resolve time.
- **R10.** Shell registries for player/coach/referee remain frozen on the current IA until their own approval.

### 6.2 Parity (R11–R20)

- **R11.** Phase 1 requires an automated parity gate proving the registry produces byte-for-byte equivalent output to today's consumers.
- **R12.** Admin parity must hold across: EN / strict / alternate locales; all / partial / empty permission allowlists; feature-flag toggles; saved-layout root reorder; saved root + section reorders; stale saved keys; non-section key as container.
- **R13.** Org parity holds across i18n bundle swaps (global `t()`) and permission allowlists.
- **R14.** Coach parity is definition-for-definition (no permission keys exist).
- **R15.** Referee parity holds across permission allowlists.
- **R16.** Player parity holds across locales, seller flag, chat feature flag, and every permission combination.
- **R17.** The parity gate is the release gate for any migration; a consumer may not be migrated while its parity test is red.
- **R18.** Known drift (Workspace editor vs sidebar) is documented and asserted by contract tests, not hidden. Drift must be resolved (P2-d), not copied.
- **R19.** The parity gate must not require a running backend or DB.
- **R20.** A consumer may be deleted only after its resolver is parity-proven and the consumer renders through the registry.

### 6.3 RBAC (R21–R25)

- **R21.** Visibility gates through `permissionKey` → `can()` / `<Can>`; never hardcoded role checks.
- **R22.** `permissionKey` is optional on `NavDefinition` — a node may be ungated (coach shell has none). No invented keys.
- **R23.** A feature-flag gate is distinct from a permission gate and recorded as `featureFlag` (player "Messages" = `community.chat_enabled`).
- **R24.** Gating semantics are parity-proven per shell (sections pass children through; leaves check `can()`; flags checked first).
- **R25.** A `permissionKey` may be shared by multiple nodes (RBAC is not structural identity); this is normal and separate from ID uniqueness (R5).

### 6.4 Immutable Navigation IDs (R26–R30)

- **R26.** Every node has an immutable `id`, globally unique within its shell.
- **R27.** `id` and `permissionKey` are distinct concepts; layout persistence, DnD identity, and editor references use `id`.
- **R28.** `id` never changes; IA operations (rename, move, merge, split) are metadata-only and preserve `id`.
- **R29.** Legacy `permissionKey`-keyed persisted layouts remain readable during the transition via an alias map.
- **R30.** **Navigation IDs are immutable and version-safe.** (See `immutable-navigation-ids-design-note.md` for migration strategy.)

### 6.5 IA & Evolution (R31–R35)

- **R31.** The current IA is frozen until the IA phase is separately approved.
- **R32.** The new admin IA (15 categories incl. the "Coaching" umbrella) is applied only in P2-e, to `ADMIN_NAV` only, after consumer migration.
- **R33.** After P2-e, the parity gate flips from "equivalent to legacy" to "matches the frozen spec expected tree".
- **R34.** Assigned Layouts is a later, separately-approved feature; no layout-assignment schema work in Phase 2.
- **R35.** Any IA change requiring layout migration must ship with a backfill step (P2-c pattern).

### 6.6 Delivery & Quality (R36–R40)

- **R36.** Every phase passes: parity gate, full unit suite, `npm run build` (tsc -b + vite), and `scripts/ci-validate.js` (navigation-related checks).
- **R37.** No functional change ships before its parity test is green (UAT gate applies).
- **R38.** The parity report is kept in `docs/navigation/` and updated with each phase.
- **R39.** Docker rebuild + Hostinger deploy follow the repository's mandatory finalize policy for any committed code change.
- **R40.** The spec lives in source control; it may not be changed outside the repository or outside the approval process.

## 7. Parity Gate Specification

- **Equality:** `firstDiff()` canonical comparison of `resolve*()` output vs legacy builder output at every tree node (label, icon, path, permissionKey, requiredFlag, featureFlag, children, order).
- **Coverage:** the matrix in R12–R16, executed as automated tests in `frontend/src/navigation/parity/parity.test.ts`.
- **Drift contract:** editor-vs-sidebar divergence is asserted explicitly (present-only-in-editor, sidebar-only, shared-key label/path differences, icon style) so it cannot silently regress.
- **Integrity:** duplicate-ID census per shell (R5) and i18n label-key registration (R3) are part of the gate.

## 8. Phase 2 Requirements (consumer migration)

- Migrate `AdminSidebar`, `OrgSidebar`, `BottomNav`, coach/referee pages to their resolvers; delete legacy builders after parity.
- Backfill `sidebar_layout` to immutable IDs with a reversible, alias-tolerating migration (P2-c).
- Reconcile the Workspace editor's second tree with the registry (P2-d), closing the non-WYSIWYG gap and the two shared-key label/path divergences.
- Keep the `sidebar_layout` table format (parent_key varchar + ordered_keys JSON array); only the key VALUES change.

## 9. Appendix A — Corrected note

The original draft listed the Workspace editor (`buildSections`) alongside the sidebar as a co-equal parity source. **Correction (approved):** the **production admin sidebar (`buildNavItems`) is the sole authoritative legacy source** for admin parity. The Workspace editor is a documented, drifted second tree (definition-only divergence: 66 sidebar-only keys, 10 editor-only keys, `sidebar.roles` label, `sidebar.finance` path, per-node icons). It is reconciled to the registry in P2-d, not treated as a second source of truth. All parity assertions, drift tables, and counts reflect this corrected stance; see `docs/navigation/phase1-parity-report.md`.
