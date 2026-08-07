# Design Note — Immutable Navigation IDs vs Permission Keys (Finding F1)

**Status:** Architecture clarification (no code) — approved input for Phase 2-a
**Date:** 2026-08-07
**Spec ref:** `nav-spec-v1.0.md` R5, R26–R30
**Report ref:** `phase1-parity-report.md` §5 F1

---

## 1. What F1 is

The Phase 1 registry integrity census found **5 Navigation IDs duplicated within the admin shell**: `sidebar.organisations`, `sidebar.roles`, `sidebar.payment-methods`, `sidebar.countries`, `sidebar.security-dashboard`. Each appears twice — once as a **section** and once as that section's **landing-page child**.

Today the code has no separate Navigation ID. The RBAC **permissionKey** is used as the effective ID everywhere: access control, saved-layout persistence, and the Workspace editor's drag-and-drop identity.

## 2. Why this happened

### 2.1 The "section landing page" pattern

A section whose first child is the section's own page reuses the same `permissionKey` for both nodes. Examples (verified in `buildNavItems`, AdminSidebar.tsx):

| Section | Section key | Landing child | Child key (same) |
|---------|-------------|---------------|------------------|
| Organisations (line 26) | `sidebar.organisations` | "All Organisations" (line 28) | `sidebar.organisations` |
| Roles & Permissions (line 38) | `sidebar.roles` | "All Roles" (line 40) | `sidebar.roles` |
| Payments Config (line 163) | `sidebar.payment-methods` | "Payment Methods" (line 165) | `sidebar.payment-methods` |
| Localization (line 170) | `sidebar.countries` | "Countries" (line 172) | `sidebar.countries` |
| Security (line 204) | `sidebar.security-dashboard` | "Security Dashboard" (line 206) | `sidebar.security-dashboard` |

Both admin trees (sidebar `buildNavItems` and editor `buildSections`) independently repeat the pattern, so the duplication is structural, not a typo.

### 2.2 One key, three jobs

The `permissionKey` simultaneously serves as:

1. **RBAC gate** — `can(item.permissionKey)` filters leaves (AdminSidebar.tsx:227).
2. **Saved-layout key** — `sidebar_layout` rows are keyed by `parent_key` (permission key) and `ordered_keys` holds permission keys in display order (AdminSidebar.tsx:233–247; table comment: *"Array of permissionKeys in display order"*).
3. **Editor identity** — container keys and item IDs in the Workspace editor ARE permission keys (SidebarLayoutPage.tsx:337–339, 386–420); the save payload is `{ parentKey, orderedKeys }` of keys (lines 428–431).

A permission key is a **security primitive**. It was never designed to be a stable, structural identifier — but because the nav had no other identity field, it became one by accretion. The landing-page pattern then produced a 1-key → 2-nodes collision.

### 2.3 The collision is real in stored data

The seed rows in `database/seeds/001_baseline.sql` (user 1) prove the ambiguity is already persisted:

- Row 2: `parent_key='sidebar.organisations'`, `ordered_keys=["sidebar.organisations", "sidebar.branch-access", …]` — the section key appears as the container AND as its first child entry.
- Rows 4, 7, 8, 9: same pattern for `sidebar.roles`, `sidebar.security-dashboard`, `sidebar.payment-methods`, `sidebar.countries`.
- Row 3: `parent_key=''` (root) lists section keys (`sidebar.organisations`, `sidebar.roles`, `sidebar.marketplace`, …) in `ordered_keys`.
- Row 6: `parent_key='sidebar.finance'` contains `sidebar.commission-rules` — a key that no longer exists in the current definition. Stale keys are silently tolerated today.

## 3. Risks of keeping permissionKey as the Navigation ID

| # | Risk | Consequence |
|---|------|-------------|
| 1 | **Ambiguity** | A key means two different nodes. `leaf.find(i => i.permissionKey === k)` (AdminSidebar.tsx:235, 243) returns the first match — order-sensitive, silently mis-resolves, and unverifiable by review. |
| 2 | **RBAC / structural coupling** | Renaming, splitting, or merging a permission (a security refactor) orphans every saved layout that references it. A pure RBAC change can wipe a user's custom sidebar order. |
| 3 | **Blocks the IA phase (P2-e)** | The new admin IA (15 categories, "Coaching" umbrella) merges/renames sections. Every rename currently requires a full-table layout rewrite; with immutable IDs it is metadata-only. |
| 4 | **Round-trip ambiguity in the editor** | `ordered_keys` may contain a key equal to its own container's key. Load/save dedupe logic (SidebarLayoutPage.tsx:364–365) cannot tell "the section" from "the landing child" — structural corruption on save is possible. |
| 5 | **Root section ordering silently no-ops** | Sections aren't leaves, so root `ordered_keys` section entries never match `leaf.find` → dropped. Users believe they reordered sections; the app ignores it. |
| 6 | **No evolution metadata** | Keys are opaque strings with no versioning; there is no way to express "this key was renamed to X" except a full data rewrite. |
| 7 | **Editor non-WYSIWYG drift** | Because metadata is re-derived from hardcoded maps, key drift (`sidebar.finance` path, `sidebar.roles` label) produces two navs with no structural guarantee. |

## 4. Migration strategy (Phase 2-a)

Phase 2-a is **registry-only** — no consumer, no schema change, no backfill execution. It produces the identity layer:

### 4.1 Add `id` to `NavDefinition`

```ts
interface NavDefinition {
  id: string;            // NEW: immutable, unique within shell
  label: NavLabel;
  path: string;
  permissionKey?: string; // unchanged — RBAC only
  …
}
```

- Every node gets an `id`.
- Where the current key is unambiguous, `id` derives from it (e.g. `sidebar.dashboard` → `nav.admin.dashboard`). Derivation keeps the diff reviewable.
- For the 5 collided keys, section and landing child get **different** ids (e.g. section `nav.admin.organisations`, child `nav.admin.organisations.landing`). The shared `permissionKey` is untouched (both nodes keep gating on `sidebar.organisations`).
- The registry gains a computed `LEGACY_KEY_TO_ID` map and an `ID_TO_KEY` map — the single source of truth for translation.

### 4.2 Decouple logic

- Resolvers continue to produce the same `ResolvedNavItem` for consumers (parity gate must stay green through the whole step).
- Layout logic (saved-layout reordering, editor identity) is rewritten to key off `id`; `permissionKey` is consulted only by `can()`.

### 4.3 Backfill (P2-c, separate approval, data-only)

A one-time, deterministic rewrite of `sidebar_layout`:

1. Load every row; resolve each `parent_key` and each `ordered_keys` entry through `LEGACY_KEY_TO_ID`.
2. The 5 ambiguous keys resolve **by position**: a key equal to the row's `parent_key` (the container) means the landing child; a key at root level (`parent_key=''`) that equals a section's key means the section itself.
3. Unknown/stale keys (e.g. `sidebar.commission-rules`) are left untouched or dropped exactly as today's code silently drops them — behavior preserved.
4. Dry-run against a copy first; write is a set of `UPDATE` statements; reversible by re-running the reverse map.

**No schema change:** `parent_key varchar(100)` and `ordered_keys` JSON array already fit string IDs. The `uq_user_parent` unique constraint still holds (ids are unique per parent). `sidebar_layout` never gets an FK to the registry — it stays a loose, versioned reference.

## 5. How immutable IDs coexist with permission keys

| Concern | Navigation ID (`id`) | Permission Key (`permissionKey`) |
|---------|----------------------|----------------------------------|
| Role | Structural identity | Authorization |
| Used by | layout persistence, DnD, editor refs, parity, future Assigned Layouts | `can()` / `<Can>` only |
| Uniqueness | Required, unique per shell (R5) | Optional; may be shared by many nodes |
| Mutability | Immutable (R30) | Evolving (RBAC refactors) |
| A node with no key? | Always has an id | Coach shell: no key — allowed (R22) |

Invariants:

- **I1.** `id` never changes; a node may be renamed/moved/flagged without touching its id.
- **I2.** One node → exactly one `id`; one `permissionKey` → many nodes allowed.
- **I3.** Revoking a permission hides a node; its `id` remains valid (visibility ≠ identity).
- **I4.** A renamed/merged concept gets a new id and, during the transition, a legacy alias so old rows still resolve.
- **I5.** The registry is the authoritative `id ↔ permissionKey` mapping; nothing outside the registry may interpret either.

## 6. Why existing saved layouts remain compatible

1. **Phase 2-a changes nothing that reads layouts.** The sidebar still reads `permissionKey`-keyed rows byte-for-byte today; consumers migrate only in P2-b after parity.
2. **Backfill is a pure key translation.** Every stored key maps 1:1 to an id via the registry (position-sensitive only for the 5 collisions — deterministic, verified by the parity harness's flattening semantics). Tree structure and ordering are preserved.
3. **Alias tolerance.** The resolver keeps a legacy `permissionKey → id` alias map, so any row that predates backfill (or that backfill deliberately skips) resolves identically. Old and new rows can coexist.
4. **Same storage format.** `parent_key` + `ordered_keys` JSON array is unchanged — only the key values change. No migration of data types, no new table, no FK churn.
5. **Parity proves it.** The same `firstDiff()` comparison that locked Phase 1 equivalence is re-run after P2-b/P2-c, so a user with a saved layout sees the same sidebar before and after (verified by the existing saved-layout parity cases, which already cover root/section/stale-key reorders).

## 7. Open decisions to confirm at P2-a kickoff

1. ID namespace/format: derive from existing keys (`nav.admin.…`) vs fully opaque UUIDs. Recommendation: derived, for reviewability.
2. Whether the 5 landing-page children keep their own ids forever, or the IA phase removes them (they may be redundant once sections are nav links). Recommendation: keep ids now; IA phase decides.
3. Whether to expose a `legacyKey` alias column/map in the registry permanently or only during transition. Recommendation: permanent map, read-only, for forensics.

---

## 8. Business Domain Container IDs (IA Migration — 2026-08-07)

The Business Architecture Constitution defines 8 top-level Business Domains. Each domain is a structural container in the Navigation Registry. The following IDs are **immutable platform contracts**:

| Domain | Immutable ID |
|--------|-------------|
| Dashboard | `nav.admin.domain.dashboard` |
| People | `nav.admin.domain.people` |
| Facilities | `nav.admin.domain.facilities` |
| Coaching | `nav.admin.domain.coaching` |
| Competitions | `nav.admin.domain.competitions` |
| Commerce | `nav.admin.domain.commerce` |
| Finance | `nav.admin.domain.finance` |
| Platform | `nav.admin.domain.platform` |

**Rules:**

- These IDs are Platform Contracts. They follow the same immutability rules as all other Navigation IDs (ADR-008).
- They must never be renamed, repurposed, or removed.
- They participate in Registry versioning identically to every other `nav.admin.*` ID.
- Domain container IDs carry no `permissionKey` — domain visibility is determined by child module visibility, not by RBAC on the domain container itself.
- Domain container IDs carry no `requiredFlag` — domain visibility is child-driven.
- If a future Business Architecture change splits, merges, or renames a domain, the old ID is deprecated (never removed) and a new ID is introduced, following ADR-008's immutability contract.
