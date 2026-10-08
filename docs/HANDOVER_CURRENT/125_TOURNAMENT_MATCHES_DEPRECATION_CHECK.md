# 125 — `/admin/tournament/matches` deprecation check (READ-ONLY)

**Step 5E** of the Tournament Architecture/Navigation Cleanup — verification for the
legacy `/admin/tournament/matches` deprecation recommended by audit 123.
Branch: `master` · HEAD: `5ce934d8` · Date: 2026-10-08
**Scope:** read-only. No source/route/DB/tests changed; nothing committed or pushed.

---

## 1. Cross-tournament picker

Source: `frontend/src/pages/admin/tournament/TournamentMatchesPage.tsx` (verified lines 1–320).

**What it does**
- Loads a flat tournament dropdown from `tournamentApi.getTournaments({ limit: 100 })`
  (`GET /admin/tournaments`) — lines 43–46, 106–113.
- Until a tournament is selected (`tournamentFilter`), it shows only a hint and **no
  matches** (lines 116–118) — the page is empty by design.
- On selection it calls `tournamentApi.getMatches(tournamentId)`
  (`GET /admin/tournaments/:id/matches`) — the **same canonical endpoint** the Hub uses —
  and renders a table of that tournament's matches (lines 51–60, 120–235).

**Who can use it**
- Any authenticated admin with the page gate `admin-tournaments.view` (wraps the whole
  screen, line 102). Row actions additionally require `tournament.manage` (start/complete/
  court/referee) and `tournament.result.manage` (record result). Same permission set as the Hub.

**What data it loads**
- `GET /admin/tournaments` (simple list for the dropdown) + `GET /admin/tournaments/:id/matches`
  for the selected tournament (canonical detailed rows: participants, court, referee, status,
  shared_status, score_summary, rule_snapshot).

**What actions become possible after selecting another tournament**
- Switching the dropdown re-points `getMatches` at that tournament: Details (MatchDetailsDrawer),
  Assign Court (raw **resource-id input**), Assign Referee (raw **referee-id input**), Start,
  Complete, Record Result (legacy modal). Nothing else.
- There is **no persistence** beyond the local `useState` — the picker is pure navigation.

**Unavailable in the picker (verified absent)**
- No accept-result, no view-result, no result statuses/filters, no Live segmentation, no
  monitoring link, no stage/group context, no stage filter, no schedule link, no export, no bulk ops.

**Does it provide functionality unavailable in Hub → Matches?**
- **No row-level functionality is unique.** Every action (details, court, referee, start,
  complete, record result) exists identically in `MatchesManager` (see §2).
- The only unique capability is the **cross-tournament aggregating picker** — i.e., selecting
  any tournament from one global screen. Hub Matches is per-tournament by design.

**Could the Hub safely replace it without backend changes?**
- **Yes for per-tournament work.** The Hub consumes the same canonical endpoint and reuses the
  same six APIs (`startMatch`, `completeMatch`, `assignCourt`, `assignReferee`,
  `recordResult` + shared result endpoint), plus **more** (accept/view/monitoring/filters —
  all on the same endpoints). No backend change needed.
- The *picker convenience itself* (no tournament id in the URL, global dropdown) has **no Hub
  equivalent** — a global aggregator would be a new screen/API (out of scope). Replacing the
  workflow is: Tournament List → open a tournament → Hub → Matches (2 clicks).

---

## 2. Parity verification — legacy page vs Hub `MatchesManager`

Reference: `frontend/src/components/tournaments/hub/MatchesManager.tsx` (verified lines 1–634).

| Function | Legacy `TournamentMatchesPage` | Hub `MatchesManager` | Mark |
|---|---|---|---|
| Tournament selection (global picker) | Yes (dropdown, `GET /admin/tournaments`) | No (scoped by route `:id`) | **LEGACY ONLY** |
| Match listing (one fetch per tournament) | Yes (`getMatches`) | Yes (canonical prop: All segment) | **BOTH** |
| Segments — All / Upcoming / Live / Completed / Results | No | Yes (client-side over one fetch) | **HUB ONLY** |
| Live Now / Starting Soon grouping | No | Yes (presentation-only, 60-min window) | **HUB ONLY** |
| Filters — status | No (no status filter) | Yes (segments) | **HUB ONLY** |
| Filters — stage | No | Yes (stage dropdown from `stage_name`) | **HUB ONLY** |
| Filters — result state (attention/approved/disputed/withdrawn/no_result/all) | No | Yes | **HUB ONLY** |
| Start match | Yes (`shared_status==='closed'`) | Yes (same) | **BOTH** |
| Complete match | Yes | Yes | **BOTH** |
| Schedule / "Matches & Schedule" nav | No | Yes (button → Schedule page via `onSchedule`) | **HUB ONLY** |
| Court assignment | Yes (raw resource-id input) | Yes (picker from eligible-courts endpoint) | **BOTH** |
| Referee assignment | Yes (raw referee-id input) | Yes (referee-id input) | **BOTH** |
| Record result | Yes (legacy modal, shared API) | Yes (same modal flow, shared API) | **BOTH** |
| Accept result | No | Yes (`acceptMatchResult`, `matches.result.accept`) | **HUB ONLY** |
| Details (MatchDetailsDrawer) | Yes | Yes | **BOTH** |
| View result (ResultSummaryView drawer) | No | Yes (lazy `fetchMatchResult` → drawer) | **HUB ONLY** |
| Monitoring link (global match monitor) | No | Yes (Live segment → `/admin/matches`) | **HUB ONLY** |
| Results link (global results monitor) | No | Yes (Results segment → `/admin/match-results`) | **HUB ONLY** |
| Stage / group context (chips) | Round only | Round + Stage + Group + Final | **HUB ONLY** |
| Status display | match status + shared_status raw label | status badge + result_status badge + Live indicator | **BOTH** (Hub richer) |
| Result state display | No | Yes (`result_status` badges etc.) | **HUB ONLY** |
| Empty / error / retry states | Basic | Full (retry + schedule CTA) | **HUB ONLY** |

**Conclusion of parity:** every *meaningful, actionable* function of the legacy page exists in
the Hub — and the Hub adds accept/view-results/monitoring/filters/stage-group context. The only
**LEGACY ONLY** item is the cross-tournament selection dropdown.

---

## 3. Route callers — `/admin/tournament/matches`

Repository-wide occurrences classified:

| Occurrence | Type |
|---|---|
| `frontend/src/App.tsx:788` — `<Route path="tournament/matches" element={<TournamentMatchesAdminPage />} />` | Runtime route registration |
| `frontend/src/navigation/admin.registry.ts:174` — `{ id: 'nav.admin.tournament-matches', path: '/admin/tournament/matches', permissionKey: 'sidebar.tournament-matches' }` | **Sidebar / runtime navigation** (admin sidebar) |
| `frontend/src/navigation/parity/legacy/admin-sidebar.ts:75` — same entry (legacy parity copy) | Test fixture (parity gate) |
| `audit_tournament_matches.md:174` (repo root) | Historical audit doc |
| `docs/enterprise-library/TECH-UX-03_Navigation_Architecture.md:193` | Documentation (navigation reference) |
| `docs/HANDOVER_CURRENT/86_TOURNAMENT_E2E_TEST_MAP.md:47,199` | Test map planning doc (E2E suite is currently empty per AGENTS.md) |
| `docs/HANDOVER_CURRENT/97/110/113/116/120/123/124*.md` | Archival/handover docs (all recommending deprecation) |
| Backend (`tournament.routes.ts` etc.) | **None** — backend uses the API namespace `/admin/tournaments*`; no `{UI} /admin/tournament/matches` |

**No redirect exists**, no other runtime navigation, **no dead references** outside the
sidebar + parity copy + docs. There are **no page-level tests** for `TournamentMatchesPage`
(no spec file exists).

---

## 4. Sidebar entry

- **Exact entry:** `nav.admin.tournament-matches` in `frontend/src/navigation/admin.registry.ts`
  (tournament group children, label `T('admin.sidebar.tournament_matches')`, permission key
  `sidebar.tournament-matches`), mirrored by the parity legacy copy at
  `frontend/src/navigation/parity/legacy/admin-sidebar.ts:75` and asserted by
  `frontend/src/navigation/parity/parity.test.ts` (admin competition children ids, ~line 187).
- **Safest canonical destination if the item is repointed:** `/admin/tournament/list` (the
  workbench list). It is global (no tournament id needed), permission-equivalent
  (`admin-tournaments.view` + `sidebar.tournament-list`), and one click from the Hub →
  Matches of any tournament. A single tournament-scoped URL (`/admin/tournament/list/:id`) is
  **not** a valid global replacement (no id at this level).
- **Not changed here** (read-only).

---

## 5. Redirect safety

**Question:** can `/admin/tournament/matches` redirect *directly* to a specific Hub route?

**No — not to a specific tournament Hub route.** Reasons:

1. The legacy route is **global / cross-tournament** (no tournament id in the URL); the Hub
   route `/admin/tournament/list/:id` **requires** an id (its Matches tab is per-tournament).
   A parameterless redirect cannot pick a tournament — it would need to invent one (unsafe)
   or target `/admin/tournament/list` (losing the picker convenience).
2. If redirected to `/admin/tournament/list`, **no functionality is lost at the data/API
   level** (all endpoints stay; Hub covers every action). What is lost is the *one-click*
   cross-tournament dropdown — the user instead picks a tournament from the list, then opens
   Hub → Matches.
3. Preserving the picker would require a new global aggregator screen or backend change —
   explicitly out of scope and unnecessary given the 2-click replacement.

**Safest redirect target (when executed later):** `/admin/tournament/list` (global, safe,
permission-equivalent). **Direct-to-Hub redirect is not viable** for this route.

---

## 6. Recommendation — final verdict

**A. Is cross-tournament selection the only unique functionality?**
**Yes.** Verified line-by-line: every row action (Details, Court, Referee, Start, Complete,
Record Result) is **BOTH**; the Hub additionally has Accept/View Result, Results, Monitoring,
segments, stage/group context, and result filters. The dropdown (LEGACY ONLY) is the sole
unique capability.

**B. Can it be safely replaced by Hub Matches?**
**Yes** for all per-tournament work — same canonical data endpoint, same six action APIs,
Hub is a superset. The picker workflow is replaced by List → tournament → Hub → Matches.

**C. Can `/admin/tournament/matches` be redirected without losing functionality?**
**Yes — to `/admin/tournament/list`** (no backend/DB/API change; no action lost). The
cross-tournament *picker convenience* cannot be preserved by a parameterless redirect, and it
**cannot** be redirected directly to a specific Hub route (no tournament id exists at the
global level). Dissatisfied users of the picker fall back to the 2-click List → Hub path.

**D. Should the sidebar be changed first?**
**Yes.** Remove `nav.admin.tournament-matches` from `admin.registry.ts` **together with** the
parity copy `legacy/admin-sidebar.ts` and the `parity.test.ts` competition-children assertion
(they must stay in sync) — and keep the route itself dormant. This stops surfacing the legacy
screen while preserving direct URLs for a window.

**E. Should a deprecation window remain?**
**Yes — 1 release.** After the sidebar removal lands, keep the route working for stale
bookmarks/internal links, then (next release) redirect `/admin/tournament/matches` →
`/admin/tournament/list`. No window is needed for permission reasons (guards unchanged), only
for link/UX continuity.

**F. Is backend/API work required?**
**No.** All polling + action endpoints are already canonical and unchanged (`GET
/admin/tournaments/:id/matches`, start/complete/court/referee/result, eligible-courts). The
legacy page is a pure frontend consumer.

**G. Is DB work required?**
**No.** No schema/migrations/data. (The `sidebar.tournament-matches` permission key can stay
registered; registry cleanup is optional and separately tracked.)

**H. What is the safest implementation order?**
1. **Release N:** remove the sidebar entry (`admin.registry.ts` + `legacy/admin-sidebar.ts` +
   `parity.test.ts` expectations updated together) — route stays registered and functional.
2. **Release N window:** deprecation soak (1 release); route still reachable by URL.
3. **Release N+1:** change route to `<Navigate to="/admin/tournament/list" replace />`.
4. **Later cleanup:** delete `TournamentMatchesPage.tsx`, its App.tsx lazy import, and the now
   unused route; optionally sweep the historical doc references (do not alter archives).

---

## Evidence trail (read this step)

- `frontend/src/pages/admin/tournament/TournamentMatchesPage.tsx` (full read) — picker + actions.
- `frontend/src/components/tournaments/hub/MatchesManager.tsx` (full read) — parity reference.
- `frontend/src/navigation/admin.registry.ts:165-179`, `parity/legacy/admin-sidebar.ts:71-76`,
  `parity/parity.test.ts` (competition children).
- Repository grep for `/admin/tournament/matches` (classified in §3).
- Consolidated with `docs/HANDOVER_CURRENT/110/113/116/120/123` recommendations (read-only context).