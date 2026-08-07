# Phase 1 Parity Report — Navigation Registry Extraction

**Status:** ✅ Complete — parity gate green, awaiting Phase 2 approval
**Date:** 2026-08-07
**Spec:** `docs/navigation/nav-spec-v1.0.md` (frozen, restored 2026-08-07)

---

## 1. Summary

Phase 1 extracted a **Navigation Registry** at `frontend/src/navigation/` as the single source of navigation definitions for all five shells (admin, org, coach, referee, player), and proved **byte-for-byte equivalence** to today's navigation via an automated parity gate.

**Strict scope honored:**
- ✅ Registry + parity harness only. ZERO functional changes to consumers.
- ✅ No IA renames/moves, no new IA applied, no Assigned Layouts.
- ✅ No DB schema changes, no backend changes.
- ✅ No Sidebar/Workspace/Search/Breadcrumbs/Quick Access behavior changes.

**Verification:**
| Gate | Result |
|------|--------|
| Parity gate (`parity.test.ts`) | **30/30 PASS** |
| Frontend unit suite | **40/40 PASS** |
| `npm run build` (tsc -b + vite) | ✅ PASS |
| `scripts/ci-validate.js` (navigation-related checks) | ✅ PASS (222 failures are pre-existing backend "Presentation layer DB access" rule noise, unrelated to this change) |

## 2. Registry contents (verified counts)

| Shell | Legacy source | Registry file | Items | Top-level | Sections | Leaf | Permission keys |
|-------|--------------|---------------|-------|-----------|----------|------|-----------------|
| Admin | `AdminSidebar.tsx` `buildNavItems()` | `admin.registry.ts` | 120 | 26 | 15 | 105 | 120 |
| Org | `OrgSidebar.tsx` `buildOrgNavItems()` | `org.registry.ts` | 23 | 23 | 0 | 23 | 23 |
| Coach | `coach-nav.ts` `COACH_NAV` | `coach.registry.ts` | 6 | 6 | 0 | 6 | **0** (no gating) |
| Referee | `referee-nav.ts` `REFEREE_NAV` | `referee.registry.ts` | 6 | 6 | 0 | 6 | 6 |
| Player core tabs | `BottomNav.tsx` `buildPlayerCoreTabs()` | `player.registry.ts` | 3 | 3 | — | — | 0 |
| Player more items | `BottomNav.tsx` `buildPlayerMoreItems()` | `player.registry.ts` | 15 | 15 | — | — | 8 + 1 feature flag |

- Coach nav has **no** permission keys, so `NavDefinition.permissionKey` is **optional** — no invented keys were introduced.
- Player "Messages" chat gate is a **feature flag** (`community.chat_enabled`), not a permission — recorded as `featureFlag`, the only flagged player item.
- Org labels resolve through the live i18n bundle (the org sidebar uses the global `t()`); org "Announcements" is the only non-literal, so the org parity test swaps the i18n bundle and asserts against `getRegistryDefaultsMap()` EN defaults + AR mapping.
- Cart badge count is runtime state and is **not** in the registry — the BottomNav component re-applies it when a tab's path is `/marketplace`.

## 3. Parity test coverage (30 tests)

| Suite | Tests | Variants exercised |
|-------|-------|--------------------|
| Admin | 10 | EN / strict / alternate locales · all / partial / empty permission allowlists · feature-flag toggles (Marketplace, Events, none) · saved root reorder · saved root + section reorders · stale saved keys (silently dropped) · non-section key used as container · combined strict+partial+layout |
| Org | 5 | EN / strict / alternate locales (i18n bundle swap) · all / partial / empty permissions |
| Coach | 1 | Definition-for-definition |
| Referee | 3 | all / partial / empty permissions |
| Player | 5 | raw more-items across 3 locales × seller flag · core tabs · gating matrix (permissions × chat flag × seller) · chat gate recorded as feature flag |
| Integrity | 2 | duplicate-id census per shell · every registry label key registered in i18n defaults |
| Editor drift contract | 4 | sidebar-only keys · editor-only keys · shared label/path drift · icon style drift |

Every suite re-implements the legacy builder's exact filtering/flag/layout logic in `resolve*.ts` — proven by `firstDiff()` canonical comparison at every tree node.

## 4. Known drift: Workspace editor (`buildSections`) vs production sidebar

The parity gate treats the **admin sidebar** (production nav, `buildNavItems`) as the source of truth. The **Workspace editor** (`SidebarLayoutPage.tsx` `buildSections()`) is a *second, drifted tree* — real drift exists but is **definition-only** (no functional impact today because the editor's POST only persists a flat ordered list of keys).

### 4.1 Sidebar-only sections (in registry/sidebar, **absent** from the editor) — 66 keys

These sections/children exist in production nav but cannot be arranged in the Workspace editor:

| Group | Keys |
|-------|------|
| Academy | `sidebar.academy`, `sidebar.academy-dashboard`, `sidebar.academy-attendance`, `sidebar.academy-enrollments`, `sidebar.academy-groups`, `sidebar.academy-programs` |
| BI | `sidebar.bi`, `sidebar.bi-dashboard`, `sidebar.bi-observability` |
| CRM | `sidebar.crm`, `sidebar.crm-dashboard`, `sidebar.crm-leads`, `sidebar.crm-customers`, `sidebar.crm-campaigns`, `sidebar.crm-communications`, `sidebar.crm-segments` |
| Finance | `sidebar.finance-dashboard`, `sidebar.finance-ledger`, `sidebar.finance-reports`, `sidebar.finance-transactions` |
| HR | `sidebar.hr`, `sidebar.hr-dashboard`, `sidebar.hr-employees`, `sidebar.hr-departments`, `sidebar.hr-attendance`, `sidebar.hr-leave`, `sidebar.hr-payroll` |
| Inventory | `sidebar.inventory`, `sidebar.inventory-stock`, `sidebar.inventory-suppliers`, `sidebar.inventory-warehouses`, `sidebar.inventory-purchase-orders` |
| League | `sidebar.league`, `sidebar.league-dashboard`, `sidebar.league-list`, `sidebar.league-seasons`, `sidebar.league-divisions` |
| Membership | `sidebar.membership`, `membership.view`, `membership.plans`, `membership.rewards`, `membership.campaigns` |
| Notifications | `sidebar.notifications`, `notifications.analytics`, `notifications.broadcast`, `notifications.config.manage`, `notifications.dead-letters`, `notification_templates.view`, `notification_types.view` |
| Pricing | `sidebar.pricing`, `pricing.preview`, `pricing.rules` |
| Tournament | `sidebar.tournament`, `sidebar.tournament-dashboard`, `sidebar.tournament-list`, `sidebar.tournament-matches` |
| Singletons | `sidebar.mobile`, `sidebar.reception`, `sidebar.sports-engine`, `sidebar.integration`, `sidebar.webhooks`, `sidebar.subscription-requests`, `sidebar.withdrawals-queue`, `queue.view`, `support.tickets.view`, `system_settings.view` |

### 4.2 Editor-only sections (in editor, **absent** from the sidebar) — 10 keys

| Group | Keys |
|-------|------|
| Tournaments | `sidebar.tournaments-admin` |
| Academies | `sidebar.academies-admin` |
| Accounting | `sidebar.accounting`, `sidebar.accounting-dashboard`, `sidebar.accounting-coa`, `sidebar.accounting-journal`, `sidebar.accounting-gl`, `sidebar.accounting-invoices`, `sidebar.accounting-periods`, `sidebar.accounting-tax` |

### 4.3 Shared-key drift — 2

| Key | Field | Registry (sidebar) | Editor |
|-----|-------|--------------------|--------|
| `sidebar.roles` | label | `Roles` | `All Roles` |
| `sidebar.finance` | path | `/admin/finance` | `/admin/withdrawal-requests` |

### 4.4 Icon style drift

- Editor assigns an icon to **every** node (51 non-top-level nodes with icons).
- Sidebar/registry gives icons only to top-level + the `countries` nested section (**1** non-top-level).
- Confirmed: the editor's GET `/sidebar/layout` response returns only flat ordered key lists — **no icons/labels** — so the editor is non-WYSIWYG today. This is why a naive "registry → editor" migration must not assume shared metadata.

## 5. Findings

| ID | Finding | Severity | Notes |
|----|---------|----------|-------|
| F1 | **Duplicate nav IDs in admin** — 5 keys appear both as a section and as its first child: `sidebar.organisations`, `sidebar.roles`, `sidebar.payment-methods`, `sidebar.countries`, `sidebar.security-dashboard`. | Medium | Faithful snapshot of production (`buildNavItems` uses `permissionKey` as de-facto id). Violates the spec's immutable-ID discipline (R5/R30). Decoupled from `permissionKey` in Phase 2-a — design note: `immutable-navigation-ids-design-note.md`. |
| F2 | **Editor is non-WYSIWYG** — persisted layout omits icons/labels; icons come from a hardcoded map at render. | Medium | Editor drift is invisible until you re-render; blocks reliable layout persistence. |
| F3 | **Coach nav has zero permission keys.** | Low | `permissionKey` kept optional; no invented keys. |
| F4 | **Player chat gate is a feature flag, not a permission.** | Low | Recorded as `featureFlag`; only flagged player item. |
| F5 | **Spec file was missing from worktree** — `docs/navigation/nav-spec-v1.0.md` referenced as frozen but never persisted. | Resolved | Restored 2026-08-07 from the session record (see §9). |

## 6. Verdict

**Phase 1 extension point achieved.** The registry is a faithful, verified transcription of all five shells' navigation. The parity gate locks equivalence for: translations (EN/strict/AR), every permission allowlist combination, feature-flag toggles, saved-layout reordering (root, section, stale, non-section), and every player gating combination.

All observed drift is **definition-only** — no functional divergence between the registry and what users see today. Phase 1 is safe to merge and Phase 2 (consumer migration) can proceed without any user-visible change.

## 7. Phase 2 sequencing (recommended, registry-first)

The frozen spec requires the registry to become the single definition source **before** consumers are migrated, and **before** any data backfill or IA change. Recommended order:

| Step | Work | Consumer impact | Gate |
|------|------|-----------------|------|
| **P2-a** | Decouple `id` from `permissionKey` (resolve F1) — assign immutable registry IDs; keep `permissionKey` as a separate field. | None | Registry-only refactor; parity gate must stay green |
| **P2-b** | Migrate sidebar consumers to resolvers: `AdminSidebar` → `resolveAdminNav`, `OrgSidebar` → `resolveOrgNav`, `BottomNav` → `resolvePlayerCoreTabs`/`resolvePlayerMoreItems`, coach/referee pages → `resolveCoachNav`/`resolveRefereeNav`. Delete legacy builders. | Zero (proven equivalent) | Parity gate re-run; full unit suite; UAT smoke |
| **P2-c** | **Data backfill** — migrate saved layouts keyed by `permissionKey` to immutable registry IDs (the `sidebar_layout` table, `parent_key` + `ordered_keys` rows; see `immutable-navigation-ids-design-note.md`). | Backward-compatible read of legacy keys | Backfill dry-run against copy; parity gate on migrated layout |
| **P2-d** | Migrate Workspace editor to the registry: replace `buildSections` with registry-derived sections (closing F2 — persist ids + metadata), reconcile §4.1/§4.2/§4.3 drift (decide the authoritative set), unify the 2 admin trees. | Editor becomes WYSIWYG | Editor parity contract tests updated to expect *identical* trees |
| **P2-e** | IA application (later phase, spec-driven): apply the new admin 15-category IA ("Coaching" umbrella, etc.) to `ADMIN_NAV` only. Parity gate flips from "equivalent to legacy" to "matches frozen spec expected tree". | Requires its own approval | New spec-based tree contract tests |

Constraints carried forward:
- No functional change may ship before its parity test is green.
- No DB schema change in Phase 2 unless explicitly approved (backfill is data-only).
- Player/Coach/Referee registries stay frozen on the CURRENT IA until their own approval.

## 8. Artifacts

| File | Purpose |
|------|---------|
| `frontend/src/navigation/types.ts` | `NavDefinition`, `ResolvedNavItem`, `NavLabel` (`t`/`lit`/`composite`), shell defs, `ShellKey` |
| `frontend/src/navigation/labels.ts` | `T`, `LIT`, `COMPOSITE`, `resolveLabel` |
| `frontend/src/navigation/admin.registry.ts` | `ADMIN_NAV` — 120 items (15 sections) |
| `frontend/src/navigation/org.registry.ts` | `ORG_NAV` — 23 items, `{orgId}` placeholders |
| `frontend/src/navigation/coach.registry.ts` | `COACH_NAV` — 6 items |
| `frontend/src/navigation/referee.registry.ts` | `REFEREE_NAV` — 6 items |
| `frontend/src/navigation/player.registry.ts` | `PLAYER_CORE_TABS` (3) + `PLAYER_MORE_ITEMS` (15) |
| `frontend/src/navigation/resolve.ts` | `resolveAdminNav`/`resolveOrgNav`/`resolveCoachNav`/`resolveRefereeNav`/`resolvePlayerCoreTabs`/`resolvePlayerMoreItems` |
| `frontend/src/navigation/index.ts` | Barrel |
| `frontend/src/navigation/parity/compare.ts` | serialization, tree flattening, diff tools |
| `frontend/src/navigation/parity/parity.test.ts` | 30-test parity gate |

**Consumer edits (ZERO behavior change, export-only for testability):**
- `AdminSidebar.tsx` → `export function buildNavItems`
- `SidebarLayoutPage.tsx` → `export function buildSections`
- `OrgSidebar.tsx` → `export function buildOrgNavItems`
- `BottomNav.tsx` → exported pure `buildPlayerCoreTabs`/`buildPlayerMoreItems`/`filterPlayerMoreItems`; `isSeller` is now `!!(user && user.isSeller)` (same value, type-safe)

## 9. Open item — spec file (resolved)

`docs/navigation/nav-spec-v1.0.md` (the frozen spec with the corrected Appendix note) was never persisted in the prior session — no `git log --all -- docs/navigation/*` commit ever contained it. **Resolved 2026-08-07:** the spec was restored from the session record into source control as part of this commit. It is the implementation contract for Phase 2. The F1 design note `immutable-navigation-ids-design-note.md` is the architecture clarification approving P2-a.
