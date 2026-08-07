# CourtZon Navigation — Cleanup Register

**Status:** ACTIVE GOVERNANCE (approved 2026-08-07)
**Owner:** Platform Engineering
**Blueprint:** `docs/navigation/migration-blueprint.md`
**Tracker:** `docs/navigation/implementation-progress.md`

The Navigation Platform is **not considered complete** until all **Mandatory** items below are resolved.

Every item records: Description, Why it exists, Risk, Priority, Proposed solution, Target phase.

| Priority | Meaning |
|----------|---------|
| **Mandatory** | Blocks the Navigation Platform completion declaration. |
| High | Must be resolved before the platform is considered production-complete. |
| Medium | Should be resolved; does not block individual consumer migrations. |
| Low | Nice-to-have; tracked for completeness. |

---

## NC-001 — Label-keyed navigation state (openMenus)

- **Status:** Open
- **Priority:** **Mandatory**
- **Discovered:** Phase 2-a (Consumer 1 review)
- **Description:** `AdminSidebar.tsx` keys collapsible-section open state by the **resolved label**: `openMenus[item.label]`. This violates the Navigation Identity Rule — state must be keyed by immutable Navigation IDs.
- **Why it exists:** Legacy implementation predates the Navigation Registry; labels were the only available identity at the time. The migration preserved behavior (parity first) and did not change state keying.
- **Risk:** A locale change or translation edit re-resolves labels and silently breaks which menu is open. Two nodes resolving to the same label would share toggle state. Violates the permanent immutable-id rule.
- **Proposed solution:** Key `openMenus` by `item.id` (resolved items now expose `id`). Behavior-neutral change; no parity impact (state is UI-internal).
- **Target phase:** Navigation Cleanup milestone (before platform completion declaration). Must not be introduced during any consumer migration.

---

## NC-002 — Path-keyed React keys

- **Status:** Open
- **Priority:** Low
- **Discovered:** Phase 2-a (Consumer 1 review)
- **Description:** `AdminSidebar`/`OrgSidebar` render `key={item.path}` for links and section wrappers. Keys are path-based rather than id-based.
- **Why it exists:** Legacy pattern; paths were unique per list level.
- **Risk:** Low today (paths are unique within each rendered list). Becomes a real collision risk if IA changes ever allow duplicate paths at the same level.
- **Proposed solution:** Switch render keys to `item.id` when the surrounding markup is touched (e.g. during the NC-001 cleanup or an IA phase). Do not change during consumer migrations.
- **Target phase:** Navigation Cleanup milestone.

---

## NC-003 — Workspace editor identity still legacy/DnD-keyed

- **Status:** Open
- **Priority:** High
- **Discovered:** Phase 1 (drift report); scope: Phase 2-f
- **Description:** `SidebarLayoutPage.tsx` (`buildSections` + drag-and-drop) still operates on **legacy permission keys**, producing the documented drift (66 sidebar-only keys absent from the editor, 10 editor-only keys, label/path/icon drift). It has not been migrated to the registry.
- **Why it exists:** The editor predates the registry; reconciling it is the largest consumer (Phase 2-f, Workspace).
- **Risk:** Users can persist layouts referencing keys that no longer exist or that conflict with immutable ids; drift grows with every new admin page.
- **Proposed solution:** Migrate the editor as Consumer 6 (Phase 2-f): frozen fixture → registry consumer (`nav.workspace.*` / shared admin definitions) → parity (editor drift contract) → legacy removal. Reconcile drift per spec R32/R33 in a later IA phase.
- **Target phase:** Phase 2-f (Consumer 6).

---

## NC-004 — Admin saved-layout rows keyed by legacy keys remain in DB

- **Status:** Open
- **Priority:** Medium
- **Discovered:** Phase 2-a (Consumer 1 review)
- **Description:** Production `sidebar_layout` rows are stored with legacy permission keys (`sidebar.*`). The resolver accepts them via aliasing, so nothing is broken, but the DB does not yet reflect immutable ids.
- **Why it exists:** Backward compatibility mandate — no data migration without explicit approval.
- **Risk:** If a future IA phase renames a node's permissionKey, old rows referencing that key silently lose ordering for that node (alias map no longer resolves it). Aliasing hides this.
- **Proposed solution:** After the Workspace editor (2-f) writes ids, run an approved one-time backfill rewriting `sidebar_layout.ordered_keys` to `nav.admin.*` ids using `ADMIN_LEGACY_KEY_TO_ID`. Requires explicit approval (data migration).
- **Target phase:** Post Phase 2-f, pending approval.

---

## Addendum Log

| Date | Item | Change |
|------|------|--------|
| 2026-08-07 | — | Register created from Phase 2-a review. |
