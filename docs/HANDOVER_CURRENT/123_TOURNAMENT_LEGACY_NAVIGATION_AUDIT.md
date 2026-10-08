# 123 — Tournament Legacy Navigation Audit (READ-ONLY)

**Step 5C** of the Tournament Architecture/Navigation Cleanup.
Commit: `89ec5098` (current HEAD) · Branch: `master` · Date: 2026-10-08
**Scope:** read-only audit. No source changes, no commits, no pushes.

---

## 1. Routes audited

All routes below were inspected in `frontend/src/App.tsx` and their page components.
Frontend route definitions at `App.tsx` lines 636–922; imports at lines 79–96, 142–151, 250–252.

| Route | Component (file) | Evidence |
|---|---|---|
| `/tournaments` | `pages/tournaments/TournamentListPage.tsx` | App.tsx:666 |
| `/tournaments/:id` | `pages/tournaments/TournamentDetailPage.tsx` (player detail) | App.tsx:667 |
| `/tournaments/:id/team` | `PlayerTeamPage` | App.tsx:668 |
| `/tournaments/public` | `pages/player/PublicTournamentsPage.tsx` | App.tsx:638 (top-level, no auth) |
| `/tournaments/public/:id` | `pages/player/PublicTournamentDetailPage.tsx` | App.tsx:639 |
| `/my/tournaments` | `pages/player/TournamentsPage.tsx` | App.tsx:693 |
| `/admin/tournaments` | `pages/admin/tournaments/TournamentAdminPage.tsx` | App.tsx:779 |
| `/admin/tournament/dashboard` | `pages/admin/tournament/TournamentDashboardPage.tsx` | App.tsx:780 |
| `/admin/tournament/list` | `pages/admin/tournament/TournamentListPage.tsx` (`mode="admin"`) | App.tsx:781 |
| `/admin/tournament/list/new` | `pages/tournaments/TournamentCreatePage.tsx` (`mode="admin"` — shared wizard) | App.tsx:782 |
| `/admin/tournament/list/:id` | `pages/admin/tournament/TournamentDetailPage.tsx` (`mode="admin"` — Tournament Hub) | App.tsx:783 |
| `/admin/tournament/list/:id/awards` | `pages/admin/tournaments/TournamentAwardsPage.tsx` | App.tsx:784 |
| `/admin/tournament/list/:id/participants` | `TournamentParticipantsPage mode="admin"` | App.tsx:785 |
| `/admin/tournament/list/:id/draw` | `TournamentDrawPage mode="admin"` | App.tsx:786 |
| `/admin/tournament/list/:id/schedule` | `TournamentSchedulePage mode="admin"` | App.tsx:787 |
| `/admin/tournament/matches` | `pages/admin/tournament/TournamentMatchesPage.tsx` | App.tsx:788 |
| `/admin/tournament/bracket-types` | `TournamentBracketTypesPage` | App.tsx:789 |
| `/admin/match-results` | `pages/admin/match-results/AdminMatchResultsPage.tsx` | App.tsx:790 |
| `/admin/matches` | `pages/admin/Matches/AdminMatchesPage.tsx` | App.tsx:791 |
| `/org/:orgId/tournaments` | `pages/org/OrgTournamentsPage.tsx` → shared `TournamentListPage mode="org"` | App.tsx:917 |
| `/org/:orgId/tournaments/new` | `OrgTournamentCreatePage` → shared wizard | App.tsx:918 |
| `/org/:orgId/tournaments/:id` | `OrgTournamentDetailPage` → shared Hub `mode="org"` | App.tsx:919 |
| `/org/:orgId/tournaments/:id/participants` | `TournamentParticipantsPage mode="org"` | App.tsx:920 |
| `/org/:orgId/tournaments/:id/draw` | `TournamentDrawPage mode="org"` | App.tsx:921 |
| `/org/:orgId/tournaments/:id/schedule` | `TournamentSchedulePage mode="org"` | App.tsx:922 |

**Related consumer surfaces (inspected, not legacy):** `/matches`, `/matches/:id`,
`/matches/:id/result` (`MatchResultPage`), `/my/match-results`, player `/matches`
(MatchLobbyPage), referee surfaces — all remain outside this audit's redirect scope.

**No route aliases/redirects exist** for tournament paths anywhere: `frontend/nginx.conf`
contains only favicon/assets/SPA fallback + `/admin/` SPA rewrite (lines 54–130); no
tournament-specific redirects. The only UI redirects are unrelated (`/admin/ui-permissions`,
`/admin/settlements`, `/org/{orgId}/accounting`, etc.).

---

## 2. Route × component × role table

| Route | Component | Role / Permission | Primary Purpose | Current Users / Callers | Unique Functionality | Hub Equivalent | Duplicate Level | **Recommended Action** | Risk |
|---|---|---|---|---|---|---|---|---|---|
| `/tournaments` | `TournamentListPage` | Player (Navbar App.tsx:471, BottomNav More `nav.player.tournaments` perm `tournaments.view`, Dashboard quick-action + "view all") | Player tournament discovery | Navbar, BottomNav, `DashboardPage`, `PlayerTournamentsPage` empty-state link | Discovery grid (limit 50), fee/format/status cards | None (admin Hub is organizer-only) | None | **KEEP** | Low |
| `/tournaments/:id` | `TournamentDetailPage` (player) | Player (`tournaments.view` implied; register `tournaments.registration.*`; enter-score `matches.result.submit`) | Player-facing detail: register, brackets, standings, results, refunds | `TournamentListPage`, `PlayerTournamentsPage`, direct links | Registration modal (eligibility/competitions/payment methods), refund request, player team, Enter Score | Admin Hub is organizer-only — **not an equivalent** | None | **KEEP** | Low |
| `/tournaments/public` | `PublicTournamentsPage` | Anonymous (no auth; is_public=1) | Public discovery | Top-level route (guests + users) | Anonymous list | None | None | **KEEP** | Low |
| `/tournaments/public/:id` | `PublicTournamentDetailPage` | Anonymous | Public read-only detail (incl. GSK Groups/Qualification/Knockout) | Public list | Read-only public read-model, no organizer actions | None (deliberately safer than Hub) | None | **KEEP** | Low |
| `/my/tournaments` | `PlayerTournamentsPage` | Player (`player.tournaments.register`; cancel `tournaments.registration.cancel`) | Player's registered tournaments | BottomNav More `nav.player.my_tournaments`, dashboard `GET /my/tournaments` | **Cancel registration + refund**, draw-lock awareness | None | None | **KEEP** | Low |
| `/admin/tournaments` | `TournamentAdminPage` | Admin (`admin-tournaments.view` implied; actions `tournaments.edit`/`tournaments.delete`; API `tournament.view/update/delete`) | Legacy admin list: status filter, inline edit, archive | **NO live callers** — not in `admin.registry.ts`; only App.tsx:779 + tests | organisation/sport columns + edit/archive | `TournamentListPage (admin)` is a **strict superset** (adds search, lifecycle state actions, detail navigation, create) | **High — duplicate of `/admin/tournament/list`** | **REDIRECT → `/admin/tournament/list`** | Low |
| `/admin/tournament/dashboard` | `TournamentDashboardPage` | Admin (`admin-tournaments.view`; API `tournament.dashboard.view`) | Global KPI overview | Sidebar `nav.admin.tournament-dashboard` (`sidebar.tournament-dashboard`) | Aggregate KPIs (runners, registrations, scheduled/completed) | No KPI aggregate in Hub | None | **KEEP** | Low |
| `/admin/tournament/list` | `TournamentListPage` (shared admin/org) | Admin `admin-tournaments.view` / org `org.tournaments.view` (+ create/update/delete) | Canonical tournament list (admin workbench) + org list | Sidebar `nav.admin.tournament-list`; org overview (`OrgTournamentsPage` wrapper); `backTo` from Hub | Search, status filter, lifecycle actions per status, edit, archive, create, detail rows | N/A (list level) | — | **KEEP** | Low |
| `/admin/tournament/list/new` | `TournamentCreatePage` (shared wizard) | Admin `tournaments.create` / org `org.tournaments.create` | Creation wizard (Step 5B-aligned) | Sidebar create button, org `+ New` button | Full wizard (formats from authoritative backend) | N/A | — | **KEEP** | Low |
| `/admin/tournament/list/:id` | `TournamentDetailPage` (shared Hub) | Admin `admin-tournaments.view` / org `org.tournaments.view`; sections gated (`perms.update`, `financial.reconcile`, etc.) | **Tournament Hub** — canonical management surface | Sidebar list rows, org rows, create-success redirect | Overview/Participants/Competition (categories–groups–qualification–draw–knockout/bracket)/Matches (All–Upcoming–Live–Completed–Results)/Standings/Finances/Settings + lifecycle + KPIs + print | N/A (this IS the Hub) | — | **KEEP** | Low |
| `/admin/tournament/list/:id/{participants,draw,awards}` | `TournamentParticipantsPage` / `TournamentDrawPage` / `TournamentAwardsPage` (shared admin/org) | `tournament.manage` / `tournament.view` / `tournaments.awards.*` | Hub sub-workflows | Hub internal + cross-links (Draw↔Schedule↔Participants) | Participants mgmt, draw generate/approve/lock/move, awards grant/refund | Part of Hub | None | **KEEP** | Low |
| `/admin/tournament/list/:id/schedule` | `TournamentSchedulePage` (shared admin/org) | `tournament.manage` / `org.tournaments.manage` | **Match generation + scheduling + court reservation** | Hub Matches tab "Matches & Schedule" button (TournamentDetailPage.tsx:684/700); Draw page | `generateMatches` (locked draw), `autoSchedule`, per-match `scheduleMatch` + court reserve (shared booking, non-financial), `releaseMatchCourt`, eligible-courts panel | **NOT in Hub** — Hub Matches has court assign/referee/start/complete/result but no generation/auto-schedule/reservation | **Unique** | **KEEP AS SHARED UTILITY** (dedicated operational tool) | Low |
| `/admin/tournament/matches` | `TournamentMatchesPage` | Admin `admin-tournaments.view`; actions `tournament.manage`/`tournament.result.manage` | Legacy cross-tournament match table | Sidebar `nav.admin.tournament-matches` (`sidebar.tournament-matches`) | **Cross-tournament picker** (select any tournament's matches); per-row actions | Hub Matches covers every row action per-tournament (start/complete/assign court/assign referee/record result, MatchDetailsDrawer, Results, Monitoring) | **High — actions duplicated by Hub Matches** | **DEPRECATE** → later REDIRECT to Hub | Low (deprecation window needed) |
| `/admin/tournament/bracket-types` | `TournamentBracketTypesPage` | Admin `tournament.bracket-types.view` (+ manage) | Authoritative bracket capabilities CRUD (Step 1/2B) | Sidebar `naw.admin.tournament-bracket-types` | Capability CRUD + registry GSK | None | — | **KEEP** | Low |
| `/admin/match-results` | `AdminMatchResultsPage` (+ org mirror `/org/:orgId/match-results`) | Admin `matches.result.manage` / org | Global result monitoring/approval | Sidebar `nav.admin.match-results`; Hub Results "Open Match Results" link | Global result statuses/approvals | Hub links to it (no duplication) | — | **KEEP** | Low |
| `/admin/matches` | `AdminMatchesPage` (+ org mirror) | Admin `matches.admin.view` / org | Global read-only match monitoring | Sidebar `nav.admin.matches`; Hub Matches "Live" monitoring link | Cross-module match status feed (open→void) | Hub links to it | — | **KEEP** | Low |
| `/org/:orgId/tournaments(/:id;/new)` | Wrappers → shared list/Hub/wizard | `org.tournaments.view/create/update/delete`, `org.tournaments.manage` | Tenant-scoped org surfaces | Org sidebar `nav.org.tournaments` (`org.sidebar.tournaments`) | Row-level org tenancy via `/org/:orgId/tournaments*` APIs | Same Hub (org mode) | None | **KEEP** | Low |

---

## 3. Tournament list pages — comparison

| Route | Kind | Component | Duplicate? | Verdict |
|---|---|---|---|---|
| `/tournaments` | **Player discovery** (authenticated, AppLayout) | `TournamentListPage` | No | **KEEP** — required by CI mobile check (AppLayout wrap), Navbar, BottomNav, Dashboards |
| `/tournaments/public` | Anonymous discovery | `PublicTournamentsPage` | No (different audience/data: is_public=1) | **KEEP** |
| `/my/tournaments` | **Player-owned / registered** | `PlayerTournamentsPage` | No (unique cancel/refund) | **KEEP** |
| `/admin/tournaments` | Admin global list (old) | `TournamentAdminPage` | **Yes — duplicate of `/admin/tournament/list`** | **REDIRECT** → `/admin/tournament/list` |
| `/admin/tournament/list` | Admin global list (current) | `TournamentListPage mode="admin"` | — canonical | **KEEP** |
| `/org/:orgId/tournaments` | Org list | `OrgTournamentsPage` → shared list `mode="org"` | No (tenant-scoped variant of the canonical list — by design) | **KEEP** |

**`/admin/tournaments` vs `/admin/tournament/list`** — they are **true duplicates** (same
data source `GET /admin/tournaments`, same edit/archive actions). `TournamentAdminPage`
is an **older, smaller screen**: no search, no lifecycle state actions (publish/open/close/
start/complete/cancel), no navigation into the Hub, no create button, and no live caller
in `navigation/admin.registry.ts` (the sidebar points to `/admin/tournament/list`). The
only fields it shows that the new list omits are `organisation` and `sport` columns —
cosmetic; arguably worth porting later. Verdict: **deprecate the screen, redirect URL**.

---

## 4. Tournament detail comparison

`/admin/tournament/list/:id` is THE shared **Tournament Hub** (`TournamentDetailPage
mode="admin"`, `HubTab` seven tabs + Competition sub-tabs; lifecycle primary/secondary
actions; KPIs; phase indicator; print bracket). The org mirror
`/org/:orgId/tournaments/:id` is the same shared component in `mode="org"` via
`OrgTournamentDetailPage`. **There is no other admin detail route.** `/admin/tournament/
list/:id` therefore IS the Hub equivalent — no legacy admin detail remains to redirect.

> Note: the **player** `/tournaments/:id` is a different surface (player registration/
> refund/enter-score/teams). It is NOT an admin Hub successor and must NOT be redirected
> to the Hub.

If aliases to the Hub are ever needed, the safe strategy is a `<Navigate replace>` at the
`/admin/tournament/list/:id` path pattern (no query params). Nothing requires that today.

---

## 5. `TournamentMatchesPage` vs Hub → Matches

Verified (source `TournamentMatchesPage.tsx` lines 1–320 vs Hub `MatchesManager`):

| Function | Legacy page | Hub → Matches | Notes |
|---|---|---|---|
| Read whole tournament match set | Yes (after picker) | Yes (All segment) | Canonical `GET /admin/tournaments/:id/matches` (org mirror) |
| Cross-tournament picker | **Yes — only place with this** | No | Unique convenience only |
| Start / Complete match | Yes (`tournament.manage`) | Yes (`MatchesManager` test 5/6: shared_status closed→start) | Duplicate |
| Court assignment | Yes — **raw resource-id input** | Yes — **picker** | Hub is UX-superior |
| Referee assignment | Yes — **raw referee-id input** | Yes — picker | Hub is UX-superior |
| Record result | Yes — legacy modal (outcome/walkover/forfeit/retired/abandoned + sets/goals) | Yes — shared `DynamicResultForm` + `ResultSummaryView` | Hub reuses shared contract (`POST /admin/tournaments/matches/:matchId/result`) |
| Details | Yes (MatchDetailsDrawer) | Yes (MatchDetailsDrawer) | Same component |
| Segments (All/Upcoming/Live/Completed/Results) | No | Yes | Hub-only |
| Live Now / Starting Soon | No | Yes | Hub-only |
| Monitoring link | No | Yes (→ `/admin/matches`) | Hub-only |
| Export/print / bulk ops / filters | No | No | Neither has these |
| Scheduling/generation/reservation | No | No | Only → Schedule page (item 6) |

**Unique legacy functionality:** the cross-tournament tournament selector only. All row
actions are available in Hub Matches. → **DEPRECATE** (keep route + sidebar during a
transition release), then redirect to the Hub (see §13).

---

## 6. `TournamentSchedulePage` — dedicated operational tool → KEEP

Verified (source lines 1–252). Unique functionality **not available** anywhere in
Hub → Matches:

1. **Generate Matches from Locked Draw** — `generateMatches` (`POST /admin/tournaments/:id/matches/generate`, org mirror), disabled until draw is locked.
2. **Auto Schedule** — `autoSchedule` (`POST .../matches/auto-schedule`).
3. **Per-match Schedule + Reserve court** — `scheduleMatch` (`POST .../matches/:matchId/schedule`, body `{date,start_time,end_time,resource_id}`), booking-system conflict-checked, **non-financial**.
4. **Release court reservation** — `releaseMatchCourt` (`POST .../matches/:matchId/release-court`).
5. **Eligible Courts** panel + per-match booking/reservation state.

The Hub's Matches tab does NOT implement generation, auto-scheduling, reservation, or
release; it only assigns an *already-scheduled* court/referee. The Hub deliberately links
out to this screen ("Matches & Schedule" button). **Classification: KEEP as shared
operational utility** (admin + org). No redirect. (A later "embed schedule into Hub" effort
is an enhancement, not a cleanup requirement — and any embed must keep the booking
conflict-check semantics.)

---

## 7. Navigation links — full inventory (before any redirect)

**Sport of evidence — frontend callers of each audited route:**

| Route | Callers |
|---|---|
| `/tournaments` | `App.tsx:471` (top Navbar, `nav.tournaments`), BottomNav More `nav.player.tournaments` (`player.registry.ts:14`), `DashboardPage` QuickAction + "view all" (lines 108/180), `PlayerTournamentsPage` empty-state "Browse" (line 68), `TournamentDetailPage` "← Back to Tournaments" (line 201), tests (`TournamentListPage.spec`, `TournamentDetailPage.spec`, `GskPlayerPublic.spec`, `TournamentCreatePage.spec`) |
| `/tournaments/:id` | All list pages, `PlayerTournamentsPage` (line 120), create-success redirect (`TournamentCreatePage.tsx:193` → admin variant), tests |
| `/tournaments/public(/:id)` | Only top-level public routes + `PublicTournamentsPage` cards |
| `/my/tournaments` | BottomNav More `nav.player.my_tournaments` (`player.registry.ts:26`); API `GET /my/tournaments` (list + player Dashboard) |
| `/admin/tournaments` | **No caller** except the route itself (App.tsx:779). Not in `navigation/admin.registry.ts`, not in Navbar/sidebar, not referenced by any page/button. Tests reference it only for the API path assertion (`TournamentCreatePage.spec:570`). |
| `/admin/tournament/dashboard` | Sidebar `nav.admin.tournament-dashboard` (admin.registry.ts:172) + parity legacy copy (parity/legacy/admin-sidebar.ts:73) |
| `/admin/tournament/list` | Sidebar `nav.admin.tournament-list` (admin.registry.ts:173), Hub `backTo` (TournamentDetailPage.tsx:366), create page comment |
| `/admin/tournament/list/:id( + /participants,/draw,/schedule,/awards)` | Sidebar rows → list -> Hub; Hub internal cross-navigation; participants↔draw↔schedule buttons; awardsPath `TournamentDetailPage.tsx:367` |
| `/admin/tournament/matches` | Sidebar `nav.admin.tournament-matches` (admin.registry.ts:174) + parity legacy copy (admin-sidebar.ts:75). **No other callers.** |
| `/org/:orgId/tournaments(/:id;/new;/{participants,draw,schedule})` | Org sidebar `nav.org.tournaments` (org.registry.ts:48), Hub/participants/draw/schedule cross-nav, create success redirect |
| `/admin/match-results` / `/admin/matches` | Sidebar entries (admin.registry.ts:178–179); Hub Matches → Monitoring (TournamentDetailPage.tsx:702) and Results links |

**Debug-free assertions:** `navigation/parity/parity.test.ts` asserts the admin
competition section ids (line 187) and the org sidebar keys (line 141); `legacy/admin-sidebar.ts`
is a parity copy — any sidebar removal must update both + the parity spec. `scripts/ci-validate.js`
section 1 requires `/tournaments` inside `AppLayout` — the consumer route is permanent.

---

## 8. Dead routes / dead buttons

- **`/admin/tournaments` — dead navigation entry.** No sidebar item, no button, no link.
  Reachable only by URL. Its inline edit/archive replicate (subset of) the current list.
- **No dead buttons found for `/admin/tournament/matches`** in pages — it is reachable
  only via the sidebar item `nav.admin.tournament-matches`.
- **No stray links to legacy screens** from Hub, player pages, or dashboards (the Hub
  correctly points to Schedule, Monitoring, and Results — all keep).
- Mobile "More" sheet still exposes both `/tournaments` and `/my/tournaments` — both live,
  both keep.

---

## 9. Data / API dependencies

| Page | APIs it uses | Unique API data | Replaced by canonical Hub APIs? | Removing page loses backend capability? |
|---|---|---|---|---|
| `/admin/tournaments` | `GET/PUT /admin/tournaments(/:id)`, `POST .../archive` (`tournamentApi.*`) | none unique | Yes — `/admin/tournament/list` uses same API | No |
| `/admin/tournament/list` | same as above + lifecycle `publish/open-reg/close-reg/start/complete/cancel` + org mirror | — canonical | — | No (keep) |
| `/admin/tournament/matches` | `GET /admin/tournaments/:id/matches`, `PUT .../matches/:matchId/{court,referee}`, `POST .../matches/:matchId/{start,complete,result}`, `GET /admin/tournaments` (simple list) | none unique (all in Hub) | Yes — Hub Matches uses same endpoints | No |
| `/admin/tournament/list/:id/schedule` | `GET .../matches`, `GET .../matches/eligible-courts`, `POST .../matches/generate`, `POST .../matches/auto-schedule`, `POST .../matches/:matchId/schedule`, `POST .../matches/:matchId/release-court` (+ org mirrors) | **Unique — generation/auto-schedule/reservation/release** | No — Hub has no equivalents | **Yes, if removed** → therefore KEEP |
| `/admin/tournament/dashboard` | `GET /admin/tournaments/dashboard` | unique KPI aggregate | No | Keep (unique API) |
| Player pages | `GET /tournaments`, `GET /tournaments/:id`, `GET /my/tournaments`, `GET /tournaments/public*`, register/cancel/refund endpoints | player/registration surfaces | N/A (different audience) | Keep |

All tournament endpoints remain required by both the Hub and the shared operational tool;
**no backend change is triggered by navigation cleanup.**

---

## 10. RBAC / security verification

- Proposed redirect `/admin/tournaments → /admin/tournament/list`: both are admin-global
  on the same API; permission sets overlap (`tournaments.edit/delete`, `admin-tournaments.view`).
  Preserved: admin access, `tournament.manage`, `tournament.view`. No org involvement → no
  cross-org risk.
- Proposed deprecation/redirect of `/admin/tournament/matches → Hub`: Hub Matches uses the
  same row-level action permissions (`tournament.manage`, `tournament.result.manage`) and
  the same `admin-tournaments.view` page gate; Hub sections additionally re-gate each pane.
  Defense-in-depth preserved (Step 3E / RBAC-by-default).
- Org routes (`/org/:orgId/tournaments*`) remain untouched; org tenancy derives `orgId` from
  the path and the backend resolves the actor's org membership — no change, no cross-org risk.
- No new permissions required for any redirect (redirects target routes with equal-or-stricter
  gates). **No permission modifications.**

---

## 11. Mobile / UX

The legacy admin screens (`/admin/tournaments`, `/admin/tournament/matches`,
`/admin/tournament/list/:id/schedule`) are desktop-first tables with inline raw-ID inputs;
the **Hub is responsive** (BottomNav-safe, card/picker UX, monitors via /admin/matches and
share result views). No legacy page provides a materially better mobile experience than the
Hub. Player-facing `/tournaments`, `/tournaments/:id`, `/my/tournaments`, and
`/tournaments/public(/:id)` are already AppLayout-abiding mobile surfaces. No redesign
recommended in this step.

---

## 12. Final navigation target (validated against the repository)

```
PLAYER (AppLayout)
  /tournaments              → tournament discovery           [KEEP]
  /tournaments/:id          → detail · register · enter score[KEEP]
  /tournaments/:id/team     → player team view               [KEEP]
  /my/tournaments           → my registrations · cancel      [KEEP]
  /tournaments/public(/:id) → anonymous discovery/detail     [KEEP]

ORGANIZER / ADMIN
  /admin/tournament/dashboard            → KPIs                          [KEEP]
  /admin/tournament/list                 → canonical list (admin)        [KEEP]
  /admin/tournament/list/:id             → Tournament HUB                [KEEP]
      ├ overview · participants · competition (categories/groups/
      │   qualification/draw/knockout-bracket) · matches (All–Upcoming–
      │   Live–Completed–Results) · standings · finances · settings
      └ sub-screens: participants · draw · schedule (unique ops tool) · awards
  /admin/tournament/bracket-types        → authoritative capabilities    [KEEP]
  /admin/tournament/matches              → transition → REDIRECT later    [DEPRECATE]
  /admin/tournaments                     → REDIRECT → /admin/tournament/list

ORG tenant mirrors (same shared components, orgId-scoped): identical structure.

GLOBAL OPERATIONS (shared)
  /admin/matches · /org/{orgId}/matches          (monitoring)
  /admin/match-results · /org/{orgId}/match-results
  /matches · /matches/:id · /matches/:id/result (player/referee surfaces)
```

This corrects the audit-example: the player surfaces and the Schedule operational tool are
**retained by evidence**, not collapsed into the Hub.

---

## 13. Redirect safety

| Old route | Target | Preserved functionality | Required params | Permission implications | Risk | Implement now? | Deprecation period |
|---|---|---|---|---|---|---|---|
| `/admin/tournaments` | `/admin/tournament/list` | Full list capabilities (superset: search/lifecycle/detail/create) except organisation/sport table columns | none | Equal-or-stricter page gate (`admin-tournaments.view`); same action keys | Low — no live callers; only stale bookmarks | **Yes — safe now** | 0–1 release overlap (recommend 1 for bookmarks) |
| `/admin/tournament/matches` | `/admin/tournament/list` (user picks tournament → Hub Matches tab) | All per-match actions via Hub Matches; cross-tournament picker is the only loss | none | Same `admin-tournaments.view` + `tournament.manage`/`tournament.result.manage` on actions | Low; must first remove the sidebar entry in `admin.registry.ts` + parity copy + `parity.test.ts` expectations | Not yet — after sidebar removal + a release of parity soak | **Recommended: 1 release** after Hub-soak, then redirect |

No redirect targets any org or player route; no cross-org risk.

---

## 14. Database

**No DB changes required.** Navigation cleanup touches only frontend routes/components and
(none here) API wiring. All tables, rows, permissions, and registry entries referenced by
these screens remain exactly as-is. (Expected answer per scope: **NO** — confirmed.)

---

## 15. Test coverage that MUST be updated if redirects/deprecations are implemented

| Route/change | Affected tests |
|---|---|
| Add redirect `/admin/tournaments` | No direct render test exists for `TournamentAdminPage`; `tournament-bracket-*`/`TournamentCreatePage.spec` assert API URLs only (not the UI route). A new redirect should get a small routing test. |
| Remove/deprecate `/admin/tournament/matches` (sidebar) | `navigation/parity/parity.test.ts` admin competition `children` id assertion (line ~187); `navigation/parity/legacy/admin-sidebar.ts` must stay in sync. No page-level spec exists for `TournamentMatchesPage`. |
| Any change to `/tournaments` / `/tournaments/:id` | `TournamentListPage.spec.tsx`, `TournamentDetailPage.spec.tsx`, `GskPlayerPublic.spec.tsx`, `TournamentCreatePage.spec.tsx` (post-create navigation), `TournamentBracket.universal.spec.tsx`, plus CI `scripts/ci-validate.js` mobile-route check (requires `/tournaments` in AppLayout). |
| Any change to `/admin/tournament/list/:id/schedule` | No dedicated spec; `TournamentDrawPage.spec.tsx`/`TournamentParticipantsPage.spec.tsx` assert the draw↔schedule navigation buttons; `TournamentHub.spec.tsx`/`GskHub.spec.tsx` cover the Hub matches/schedule entry. |
| Any change to `/my/tournaments` or public routes | No dedicated specs today (untested surfaces) — add coverage if touched. |

Do not modify tests now (read-only step).

---

## 16. Final recommendation — prioritized cleanup plan

**: `P1 — safe, zero-risk, no-deprecation-window`
- `/admin/tournaments` → **REDIRECT** to `/admin/tournament/list` (add `<Route path="/admin/tournaments" element={<Navigate to="/admin/tournament/list" replace />} />`). Reason: no live callers; strict superset target; removes a second source of truth. Dependencies: none. Risk: low. Order: **first**.

**: `P2 — after one parity release`
- `/admin/tournament/matches` → **DEPRECATE**: remove the `nav.admin.tournament-matches` sidebar entry from `admin.registry.ts` (and parity copy + parity test), keep the route dormant for one release, then **REDIRECT** to `/admin/tournament/list` (choose tournament → Hub Matches). Reason: every action now exists in Hub Matches; only the cross-tournament picker is lost. Dependencies: Hub-served match parity (already proven by 112/116/120 audits + `MatchesManager.spec` 43 tests). Risk: low.

**: `P3 — later enhancements (not cleanup)`
- `/tournaments` player list: add search/status filters/pagination (improvement; route already permanent via CI AppLayout check).
- Optionally port `organisation`/`sport` columns from the old admin list into `/admin/tournament/list`.
- Optionally embed Schedule into the Hub **after** confirming booking conflict semantics — currently Schedule remains the dedicated operational tool by evidence.
- Keep: `/tournaments/public(/:id)`, `/my/tournaments`, `/admin/tournament/dashboard`, `/admin/match-results`, `/admin/matches`, bracket-types, all Hub sub-screens.

Suggested implementation order: **P1 → P2** (deprecation window) → P3 optional.

---

## 17. Explicit questions — answers

1. **Is `/admin/tournaments` a duplicate of `/admin/tournament/list`?**
   **Yes.** Same API/data; `TournamentAdminPage` is a smaller superset-follower with no live callers. → REDIRECT.
2. **Is `/admin/tournament/list/:id` now equivalent to Tournament Hub?**
   **Yes** — it IS the shared Hub (`TournamentDetailPage` admin mode, 7 tabs + competition sub-tabs). The org mirror `/org/:orgId/tournaments/:id` is the same Hub. No other admin detail route exists.
3. **Should `TournamentMatchesPage` be redirected to Hub → Matches?**
   **Yes — after a deprecation period.** All row actions exist in Hub Matches; only the cross-tournament picker would be lost. Redirect to `/admin/tournament/list`.
4. **Should `TournamentSchedulePage` remain standalone?**
   **Yes.** Generation, auto-schedule, court reservation (shared booking), and release are **unique** and absent from Hub Matches. KEEP as dedicated operational tool (admin + org).
5. **Which Tournament routes must remain permanently?**
   `/tournaments`, `/tournaments/:id` (player), `/tournaments/public(/:id)`, `/my/tournaments`, `/admin/tournament/list`, `/admin/tournament/list/new`, `/admin/tournament/list/:id` (Hub) + `participants/draw/schedule/awards`, `/admin/tournament/bracket-types`, `/admin/tournament/dashboard`, `/admin/matches`, `/admin/match-results`, all `/org/:orgId/tournaments*` mirrors.
6. **Which routes can safely redirect?**
   `/admin/tournaments` → `/admin/tournament/list` (now). `/admin/tournament/matches` → `/admin/tournament/list` (after deprecation window).
7. **Which routes need a deprecation period?**
   `/admin/tournament/matches` (1 release, because it still has a live sidebar entry). `/admin/tournaments` technically needs none (no contributors) — recommend 1 release for stale bookmarks.
8. **Are there dead navigation links?**
   `/admin/tournaments` has **no** navigation links (dead route reachable only by URL). No other dead links found.
9. **Are there unique functions hidden in legacy screens?**
   One real one: **Schedule** (generate/auto-schedule/reserve/release). `TournamentMatchesPage`'s only unique facet is the cross-tournament picker. `/admin/tournaments` has none.
10. **Is any backend/API work required?**
    **No.** All endpoints stay; Hub + Schedule already consume the canonical API and the `POST /admin/tournaments` creative route is already gone.
11. **Is any DB work required?**
    **No.**
12. **What is the safest first cleanup change?**
    **P1:** add the `/admin/tournaments → /admin/tournament/list` redirect (plus a routing test). It is additive, permission-preserving, kills a dead duplicate, and touches no other surface.

---

## Appendix — evidence trail (files read)

- Routes/imports: `frontend/src/App.tsx` (636–922), nginx.conf (54–130).
- Pages: `pages/admin/tournaments/TournamentAdminPage.tsx`, `TournamentDashboardPage.tsx`,
  `TournamentListPage.tsx`, `TournamentDetailPage.tsx` (Hub), `TournamentMatchesPage.tsx`,
  `TournamentSchedulePage.tsx`, `pages/tournaments/TournamentListPage.tsx`,
  `TournamentDetailPage.tsx`, `pages/player/TournamentsPage.tsx`,
  `PublicTournamentsPage.tsx`, `PublicTournamentDetailPage.tsx`, `pages/org/OrgTournamentsPage.tsx`,
  `OrgTournamentDetailPage.tsx`, `pages/admin/Matches/AdminMatchesPage.tsx`.
- Navigation: `navigation/admin.registry.ts` (165–179), `navigation/org.registry.ts` (42–49),
  `navigation/player.registry.ts` (14, 26), `components/layout/BottomNav.tsx`,
  `navigation/parity/parity.test.ts`, `navigation/parity/legacy/admin-sidebar.ts`.
- Prior audits corroborating: `docs/HANDOVER_CURRENT/110`, `112`, `113`, `116`, `120`,
  `122` (all READ-ONLY context, not re-implemented here).