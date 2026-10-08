# 128 — Final Tournament Navigation Residue Audit (READ-ONLY)

- **Audit type:** READ-ONLY residue / consolidation audit
- **Scope:** Tournament navigation consolidation (Steps 5A–5H)
- **Git HEAD:** `87bf0da4dca7d27483935798a99bd10f0a15bb9f`
- **Working tree:** clean
- **Date:** 2026-10-09
- **Author:** Agent (automated audit)
- **Changes made by this audit:** NONE (no source, tests, DB, Docker, or Git changes)

---

## 1. Executive Summary

The Tournament navigation consolidation is **functionally complete**. The canonical
Tournament surface is the shared Admin/Org Tournament Hub, bracket-types management,
and the creation wizard. The legacy list route (`/admin/tournaments`) and legacy
matches route (`/admin/tournament/matches`) are both **soft-redirected** to the Hub
list, and the legacy `TournamentMatchesPage.tsx` was deleted in Step 5G. There are
**no dead links, no broken imports, no duplicate routed surfaces, and no runtime
permission gaps** in the consolidated navigation.

What remains is **cosmetic residue only**: one orphaned legacy page component, stale
`componentPath` metadata pointing at it, orphaned translation keys, dead seed rows
(permissions + Arabic locale strings), and stale comments/documentation. None of these
are reachable or executed at runtime.

**Verdict: B — Minor cleanup required. No P0 or P1 findings.**

---

## 2. Current Canonical Architecture

| Surface | Canonical route | Component | Mode |
|---------|-----------------|-----------|------|
| Admin Tournament Hub list | `/admin/tournament/list` | `pages/admin/tournament/TournamentListPage.tsx` | `admin` |
| Admin Tournament Hub detail | `/admin/tournament/list/:id` | `pages/admin/tournament/TournamentDetailPage.tsx` | `admin` |
| Admin create wizard | `/admin/tournament/list/new` | `pages/tournaments/TournamentCreatePage.tsx` | `admin` |
| Admin participants | `/admin/tournament/list/:id/participants` | `TournamentParticipantsPage` | `admin` |
| Admin draw | `/admin/tournament/list/:id/draw` | `TournamentDrawPage` | `admin` |
| Admin schedule | `/admin/tournament/list/:id/schedule` | `TournamentSchedulePage` | `admin` |
| Admin awards | `/admin/tournament/list/:id/awards` | `TournamentAwardsPage` | — |
| Admin bracket types | `/admin/tournament/bracket-types` | `TournamentBracketTypesPage` | — |
| Admin dashboard | `/admin/tournament/dashboard` | `TournamentDashboardPage` | — |
| Org Tournaments list | `/org/:orgId/tournaments` | `OrgTournamentsPage` (wrapper) | `org` |
| Org Tournament detail | `/org/:orgId/tournaments/:id` | `OrgTournamentDetailPage` (wrapper) | `org` |
| Org create wizard | `/org/:orgId/tournaments/new` | `OrgTournamentCreatePage` | `org` |
| Match Results (shared) | `/admin/match-results`, `/org/:orgId/match-results` | shared results surface | — |
| Matches Monitoring (shared) | `/admin/matches`, `/org/:orgId/matches` | shared monitoring | — |

**Redirects (legacy → canonical):**

| Legacy route | Behaviour | App.tsx |
|--------------|-----------|---------|
| `/admin/tournaments` | `<Navigate to="/admin/tournament/list" replace />` | line 777 |
| `/admin/tournament/matches` | `<Navigate to="/admin/tournament/list" replace />` | line 786 |

`TournamentSchedulePage` is **intentionally standalone** (it is a scheduling grid, not a
Hub tab) and is correctly kept out of the consolidation.

---

## 3. Route Inventory (Tournament-related)

### 3.1 Admin (`App.tsx` 777–787)
- `tournaments` → **redirect** to `/admin/tournament/list`
- `tournament/dashboard` → `TournamentDashboardPage`
- `tournament/list` → `TournamentListAdminPage` (`mode="admin"`)
- `tournament/list/new` → `TournamentCreatePage` (`mode="admin"`)
- `tournament/list/:id` → `TournamentDetailAdminPage` (`mode="admin"`)
- `tournament/list/:id/awards` → `TournamentAwardsPage`
- `tournament/list/:id/participants` → `TournamentParticipantsPage` (`mode="admin"`)
- `tournament/list/:id/draw` → `TournamentDrawPage` (`mode="admin"`)
- `tournament/list/:id/schedule` → `TournamentSchedulePage` (`mode="admin"`)
- `tournament/matches` → **redirect** to `/admin/tournament/list`
- `tournament/bracket-types` → `TournamentBracketTypesPage`

### 3.2 Org (`App.tsx` 915–920)
- `tournaments` → `OrgTournamentsPage`
- `tournaments/new` → `OrgTournamentCreatePage`
- `tournaments/:id` → `OrgTournamentDetailPage`
- `tournaments/:id/participants` → `TournamentParticipantsPage` (`mode="org"`)
- `tournaments/:id/draw` → `TournamentDrawPage` (`mode="org"`)
- `tournaments/:id/schedule` → `TournamentSchedulePage` (`mode="org"`)

### 3.3 Player / Public
- `/tournaments` (664), `/tournaments/:id` (665), `/tournaments/:id/team` (666)
- `/my/tournaments` (691)
- `/tournaments/public` (636), `/tournaments/public/:id` (637)

No orphaned route entries were found.

---

## 4. Navigation Audit

| Registry | Tournament entry | Path | Permission | Status |
|----------|------------------|------|-----------|--------|
| `admin.registry.ts` | `nav.admin.tournament` group | `/admin/tournament/dashboard` | `sidebar.tournament` | Canonical |
| `admin.registry.ts` | `nav.admin.tournament-dashboard` | `/admin/tournament/dashboard` | `sidebar.tournament-dashboard` | Canonical |
| `admin.registry.ts` | `nav.admin.tournament-list` | `/admin/tournament/list` | `sidebar.tournament-list` | Canonical |
| `admin.registry.ts` | `nav.admin.tournament-bracket-types` | `/admin/tournament/bracket-types` | `tournament.bracket-types.view` | Canonical |
| `admin.registry.ts` | `nav.admin.match-results` | `/admin/match-results` | `matches.result.manage` | Shared |
| `admin.registry.ts` | `nav.admin.matches` | `/admin/matches` | `matches.admin.view` | Shared |
| `org.registry.ts` | `nav.org.tournaments` | `/org/{orgId}/tournaments` | `org.sidebar.tournaments` | Canonical |

The legacy **Matches** entry in the admin sidebar **has been removed** (no
`nav.admin.tournament-matches` node). No navigation registry entry points at the
removed `/admin/tournament/matches` route or at `/admin/tournaments`.

**Frozen legacy fixture** `navigation/parity/legacy/workspace-nav.ts:46` still contains
`{ path: '/admin/tournaments', permissionKey: 'sidebar.tournaments-admin' }`. This is a
**frozen historical fixture**, not live navigation (finding F-10).

---

## 5. Component / Lazy Import Audit

- `TournamentMatchesPage` — **deleted** (Step 5G). No remaining imports or lazy
  references anywhere in `frontend/src`, `backend/`, or `e2e/`.
- `TournamentMatchesAdminPage` — not present.
- `TournamentAdminPage` (`pages/admin/tournaments/TournamentAdminPage.tsx`) —
  **ORPHANED**. Not imported by `App.tsx` or any component; the only remaining
  references are its own file, the UI permission registry `componentPath` metadata
  (F-02), and three one-off codegen scripts (F-09).
- `OrgTournamentsPage.tsx` / `OrgTournamentDetailPage.tsx` — thin wrappers around the
  shared admin components; **not duplicates**.
- `TournamentSchedulePage.tsx` — standalone by design; imported once per mode.
- All `lazy()` imports in `App.tsx` (lines 79–82, 142–149) resolve to existing files.

**Conclusion:** one dead component remains (`TournamentAdminPage.tsx`). No broken lazy
imports, no duplicate routed surfaces.

---

## 6. Permission Audit

| Permission key | Registry | Runtime reference | DB (seed 001) | Status |
|----------------|----------|-------------------|---------------|--------|
| `admin-tournaments.view` | line 449 | **none** (orphaned page only) | present | Orphaned metadata |
| `tournaments.edit` | line 450 | **none** | present | Orphaned metadata |
| `tournaments.delete` | line 451 | **none** | present | Orphaned metadata |
| `tournaments.enter_scores` | line 728 | **none** | present | Orphaned (prior P1, now unused) |
| `sidebar.tournament-matches` | removed from code | **none** | row id 22004 | DB residue |
| `sidebar.tournaments-admin` | line 604 | frozen fixture only | present | Legacy/admin-scope residue |
| `tournament.result.manage` | line 747 | `MatchesManager.tsx` | present | **Live** |
| `tournament.bracket-types.view` | line 496 | nav + page | present | **Live** |
| `org.*` tournament keys | lines 135, 145–157 | org pages/nav | present | **Live** |

- **No runtime permission gap** exists on any canonical route or action.
- The orphaned keys exist only as registry metadata + seed rows; no `<Can>` / `can()`
  usage resolves them, and no backend route requires them.
- `tournaments.enter_scores` was previously rated P1 (functional mismatch) by audit 120.
  Because Step 5G removed its only (stale) consumer and the canonical Hub now gates on
  `tournament.result.manage`, it is **downgraded to P2 residue** here.

---

## 7. Translation Audit

**Runtime-orphaned keys (no live component references):**

| Key | Registry | Seed AR (007) | Notes |
|-----|----------|---------------|-------|
| `tournaments.admin.title` | line 1848 | line 8 | Only the orphaned page used it |
| `admin.tournament.matches` | line 1533 | — (EN only in registry) | Legacy matches page title |

**Step 5G-removed-key AR residue in `database/seeds/007_tournament_translations.sql`:**

| Key | AR seed line |
|-----|--------------|
| `tournaments.matches.title` | 47 |
| `tournaments.select_tournament` | 48 |
| `tournaments.select_tournament_hint` | 49 |
| `tournaments.match.player1` | 59 |
| `tournaments.match.player2` | 60 |
| `tournaments.match.score` | 64 |

`tournaments.tab.matches` and `tournaments.dashboard.*_matches` remain **live** and are
**not** in scope for removal. No duplicate translation sources were found.

---

## 8. Parity / Snapshot Audit

- `frontend/src/navigation/parity/parity.test.ts` still enumerates tournament keys
  including stale ones (`admin-tournaments.view`, `tournament.view`, `tournaments.edit`,
  `tournaments.delete`) inside fixture arrays (lines 1233–1247). These are **test
  fixtures**, not production navigation (F-11).
- `navigation/parity/legacy/workspace-nav.ts:46` frozen fixture still lists
  `/admin/tournaments` (F-10).
- `navigation/parity/legacy/admin-sidebar.ts:71–75` mirrors the canonical admin nav and
  is consistent (no matches entry).
- Known **pre-existing** parity failures (7) are org-sidebar / player-nav **locale
  drifts**, unrelated to tournaments. This audit did not change them.
- No executable snapshot generator regressed as a result of the navigation
  consolidation.

---

## 9. Dead Link Audit

- No live navigation item, route, `<Link>`, or `navigate()` call targets
  `/admin/tournament/matches` or the legacy `/admin/tournaments` list page.
- `/admin/tournaments` and `/admin/tournament/matches` are guarded by explicit
  `<Navigate replace />` redirects, so even direct entry cannot 404.
- The only remaining references to legacy paths are:
  - frozen parity fixture `workspace-nav.ts:46` (F-10),
  - stale documentation (F-06),
  - backend API base strings `/admin/tournaments/...` (these are API endpoints, **not**
    routes — they are correct and in use by `services/tournament.ts`).

**No dead links reachable by a user.**

---

## 10. Duplicate Surface Audit

- Only **one** Tournament detail surface exists per context (admin Hub / org Hub), both
  rendering the same shared `TournamentDetailPage` via `mode` prop.
- `OrgTournamentsPage` / `OrgTournamentDetailPage` are wrappers, not parallel
  implementations.
- No duplicate list surface remains: legacy `TournamentAdminPage` is orphaned and
  unrouted.
- Creation is single-sourced through `TournamentCreatePage` (`mode="admin"|"org"`).
- No duplicate permission or translation source was found.

---

## 11. GSK / Format Audit

- `ENGINE_EXECUTABLE_FORMATS = ['knockout', 'round_robin', 'group_stage_knockout']`
  (`tournament-aggregate.ts:14`).
- `ENGINE_PLANNED_FORMATS = []` (line 22).
- Therefore `group_stage_knockout` is **executable**, and the engine returns
  `status: 'ready'` for it (line 67).
- **Stale comments contradict this** (finding F-07):
  - `tournament.dto.ts:335–339` claims `ENGINE_EXECUTABLE_FORMATS still excludes
    group_stage_knockout` — no longer true.
  - `knockout-transition.service.ts:45–47` repeats the same outdated rationale.
- These comments are **non-executable** and cause no runtime effect, but they misstate
  the GSK contract for future readers.

---

## 12. Documentation / Comment Audit

**Stale documentation (F-06):**
- `docs/enterprise-library/TECH-UX-03_Navigation_Architecture.md:193` still documents a
  `Matches` nav entry at `/admin/tournament/matches` with
  `sidebar.tournament-matches`.
- `docs/enterprise-library/TECH-UX-04_Screen_Flows.md:650–699` documents
  `TournamentDashboardPage (/admin/tournaments)`, the legacy list/detail paths, and a
  `TournamentMatchesPage (/admin/tournaments/:id/matches)` that no longer exists;
  line 749 lists `TournamentAdminPage.tsx` as a source file.

**Stale source comments (F-07/F-08):**
- `backend/.../tournament.dto.ts:335–339` — GSK non-executable claim.
- `backend/.../knockout-transition.service.ts:45–47` — same claim.
- `frontend/.../tournament/TournamentDetailPage.tsx:154–155` — comment references the
  stale frontend-only `tournaments.enter_scores` gate.

---

## 13. Database Residue

Read-only inspection of seeds (no DB changes performed):

| Item | Location | Type | Impact |
|------|----------|------|--------|
| `sidebar.tournament-matches` | `database/seeds/001_baseline.sql` | permission row (id 22004) | dead permission |
| `admin-tournaments.view` | `database/seeds/001_baseline.sql` | permission row | dead permission |
| `tournaments.edit` | `database/seeds/001_baseline.sql` | permission row | dead permission |
| `tournaments.delete` | `database/seeds/001_baseline.sql` | permission row | dead permission |
| `tournaments.enter_scores` | `database/seeds/001_baseline.sql` | permission row | dead permission |
| `sidebar.tournaments-admin` | `database/seeds/001_baseline.sql` | permission row + `sidebar_layout` id 3 | admin-scope legacy key |
| AR rows for 5G-removed keys | `database/seeds/007_tournament_translations.sql` (lines 47–64) | translation rows | dead translations |

No schema/table changes are required. This is **data-cleanup only** and is deferred per
the read-only constraint (recommended as a separate follow-up task).

---

## 14. Findings by Severity

### P0 — Critical
**None.**

### P1 — High
**None.**

### P2 — Minor (residue, non-functional, should be cleaned)

| ID | Finding | Location |
|----|---------|----------|
| F-01 | Orphaned legacy page `TournamentAdminPage.tsx` (not routed, not imported) | `frontend/src/pages/admin/tournaments/TournamentAdminPage.tsx` |
| F-02 | Stale `componentPath` metadata on 3 registry entries pointing at the orphaned page | `frontend/src/permissions/registry.ts:449–451` |
| F-03 | Orphaned runtime translation keys `tournaments.admin.title`, `admin.tournament.matches` | `translation-keys.registry.ts:1533,1848` |
| F-04 | Dead permission rows (`sidebar.tournament-matches`, `admin-tournaments.view`, `tournaments.edit`, `tournaments.delete`, `tournaments.enter_scores`) | `database/seeds/001_baseline.sql` |
| F-05 | Stale AR locale rows for Step 5G-removed keys | `database/seeds/007_tournament_translations.sql:47–64` |
| F-06 | Stale enterprise documentation (legacy routes / removed page) | `TECH-UX-03:193`, `TECH-UX-04:650–699,749` |

### P3 — Informational / cosmetic

| ID | Finding | Location |
|----|---------|----------|
| F-07 | Stale GSK comments contradicting `ENGINE_EXECUTABLE_FORMATS` | `tournament.dto.ts:335–339`, `knockout-transition.service.ts:45–47` |
| F-08 | Stale `tournaments.enter_scores` comment | `TournamentDetailPage.tsx:154–155` |
| F-09 | One-off codegen scripts reference orphaned `TournamentAdminPage.tsx` | `frontend/scripts/*.mjs` (3 files) |
| F-10 | Frozen legacy parity fixture still lists `/admin/tournaments` | `navigation/parity/legacy/workspace-nav.ts:46` |
| F-11 | Parity test fixture enumerates stale tournament keys | `navigation/parity/parity.test.ts:1233–1247` |

**Totals: P0 = 0, P1 = 0, P2 = 6, P3 = 5.**

---

## 15. Explicit Answers to the 16 Audit Questions

1. **Is the legacy `/admin/tournaments` route removed?** Yes — soft-redirected to
   `/admin/tournament/list` (`App.tsx:777`).
2. **Is the legacy `/admin/tournament/matches` route removed?** Yes — soft-redirected to
   `/admin/tournament/list` (`App.tsx:786`).
3. **Was the legacy matches page deleted?** Yes — `TournamentMatchesPage.tsx` removed;
   no imports remain.
4. **Is there a single canonical detail surface?** Yes — shared `TournamentDetailPage`
   in `admin`/`org` modes.
5. **Are bracket types still reachable?** Yes — `/admin/tournament/bracket-types`,
   gated by `tournament.bracket-types.view`.
6. **Is the creation wizard still wired?** Yes — `tournament/list/new` (admin) and
   `org/.../new` (org).
7. **Is `TournamentSchedulePage` intentionally standalone?** Yes — kept out of the Hub
   by design.
8. **Any remaining legacy-page imports?** No broken imports; `TournamentAdminPage.tsx`
   is orphaned but not imported.
9. **Any dead links in navigation?** No — no live nav targets removed routes.
10. **Any runtime permission gaps on canonical routes/actions?** No.
11. **Any orphaned permissions?** Yes — 5 dead permission rows/keys (F-02/F-04).
12. **Any orphaned translation keys?** Yes — 2 runtime + 6 AR locale rows (F-03/F-05).
13. **Is GSK executable?** Yes — `group_stage_knockout` is in
    `ENGINE_EXECUTABLE_FORMATS`; only the comments are stale (F-07).
14. **Any duplicate tournament surface?** No — org pages are wrappers over the shared
    Hub.
15. **Are parity/snapshot fixtures consistent with live nav?** Mostly — two frozen
    fixtures/tests still list legacy entries (F-10/F-11), which is expected for frozen
    fixtures.
16. **Any DB/seed residue from removed surfaces?** Yes — permission rows + AR
    translation rows (F-04/F-05); data-cleanup only.

---

## 16. TOP 10 Remaining Actions

1. Delete the orphaned `frontend/src/pages/admin/tournaments/TournamentAdminPage.tsx`.
2. Remove/fix the three stale `componentPath` values in `permissions/registry.ts`
   (`admin-tournaments.view`, `tournaments.edit`, `tournaments.delete`).
3. Remove orphaned permission keys `admin-tournaments.view`, `tournaments.edit`,
   `tournaments.delete`, `tournaments.enter_scores`, and `sidebar.tournaments-admin`
   (code + seed) once confirmed unused.
4. Remove the dead `sidebar.tournament-matches` permission row (id 22004) from seed 001.
5. Remove orphaned translation keys `tournaments.admin.title` and
   `admin.tournament.matches` from the registry.
6. Remove stale AR locale rows in `seeds/007_tournament_translations.sql`
   (`matches.title`, `select_tournament`, `select_tournament_hint`, `match.player1/2`,
   `match.score`).
7. Correct the stale GSK comments in `tournament.dto.ts` and
   `knockout-transition.service.ts` to reflect executable GSK.
8. Update stale `TECH-UX-03` / `TECH-UX-04` documentation to the canonical Hub routes.
9. Remove the stale `tournaments.enter_scores` comment in
   `TournamentDetailPage.tsx`.
10. Refresh or annotate the frozen legacy parity fixtures (`workspace-nav.ts`,
    `parity.test.ts`) so future audits do not re-flag them.

*(All actions are cleanup-only; none changes runtime behaviour.)*

---

## 17. Final Verdict

**Verdict: B — Minor cleanup required.**

- The Tournament navigation consolidation is **functionally complete and correct**.
- **0 P0**, **0 P1**: no broken routes, no dead links, no runtime permission gaps, no
  duplicate surfaces, no regressions.
- **6 P2** and **5 P3** findings, all **cosmetic residue** (orphaned component, stale
  metadata/comments/docs, dead seed rows).
- No source, test, DB, Docker, or Git state was modified by this audit.

---

## 18. Audit Attestation

- **Audit file:** `docs/HANDOVER_CURRENT/128_FINAL_TOURNAMENT_NAVIGATION_RESIDUE_AUDIT.md`
- **Git HEAD at audit:** `87bf0da4dca7d27483935798a99bd10f0a15bb9f`
- **Working tree:** clean (this document is the only new artifact)
- **Findings:** P0 = 0, P1 = 0, P2 = 6, P3 = 5
- **Source changes:** none
- **Database changes:** none
- **Docker changes:** none
- **Commit/push:** none
