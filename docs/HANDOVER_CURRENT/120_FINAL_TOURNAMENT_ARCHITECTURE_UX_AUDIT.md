# Final Tournament Architecture & UX Audit

> Read-only final architecture/UX audit of the CourtZon Tournament module.
> Repository state: HEAD `40557e54` (after Bracket CRUD, canonical Match API, Hub/Results/Live/Realtime parity).
> No files other than this document were created or modified.

## 1. Executive Summary

The Tournament module is now architecturally coherent: one canonical creation wizard, one Hub with tabs (Overview/Participants/Competition/Matches/Standings/Finances/Settings), a canonical tournament match API, consolidated Hub **Matches (All/Upcoming/Live/Completed/Results)** with the **Live** operational view and **Results** reusing the shared result engine, realtime parity for Hub queries, and a Bracket Types management surface backed by an authoritative engine-capability registry. GSK is executable end-to-end; Double Elimination and Swiss are honestly represented as unavailable.

Remaining issues are **minor gaps and cleanup**, not blockers: the Creation Wizard still derives its format cards from the *active-only* bracket-types endpoint (not yet aligned with the enriched management list), the player-facing consumer detail page still uses the stale `tournaments.enter_scores` gate, a few standalone screens (legacy `TournamentMatchesPage`/`TournamentSchedulePage`) remain as transition fallbacks, and tournament accounting recognition/commission posting is intentionally outside the module.

**Classification: B — Production Ready with Minor Gaps.**

## 2. Current Routes (Full Inventory)

| Route | Page | Role | Canonical/Legacy | Duplicate/Overlap | Decision | Reason |
|---|---|---|---|---|---|---|
| `/tournaments` | `pages/tournaments/TournamentListPage.tsx` (nav target, App 471) | Player | Legacy consumer | overlaps player + public lists | **Deprecate→redirect** later | superseded by `/my/tournaments` + `/tournaments/public` |
| `/tournaments/:id` | `pages/tournaments/TournamentDetailPage.tsx` (667) | Player | Legacy consumer | duplicates Hub/player screens; stale `tournaments.enter_scores` gate (372/390) | **Deprecate→redirect** later | player flows now via `/my/tournaments`, public via `/tournaments/public/:id` |
| `/tournaments/public` | `PublicTournamentsPage` (638) | Public | Canonical (anonymous) | — | Keep | discovery |
| `/tournaments/public/:id` | `PublicTournamentDetailPage` (639) | Public | Canonical | — | Keep | public GSK read model |
| `/my/tournaments` | `pages/player/TournamentsPage.tsx` (693) | Player | Canonical | — | Keep | player registrations |
| `/matches`, `/matches/:id`, `/matches/:id/result`, `/my/match-results` | shared session/history pages (650-653) | Player/Referee | Shared | — | Keep | session/result flows |
| `/referee/assignments`, `/referee/matches` (720-721) | Referee pages | Referee | Shared | — | Keep | referee officiation |
| `/admin/tournaments` | `TournamentAdminPage` (779) | Admin | **Legacy list** | duplicates `/admin/tournament/list` | **Deprecate→redirect** later | superseded by workbench |
| `/admin/tournament/dashboard` (780) | `TournamentDashboardPage` | Admin | Canonical | — | Keep | |
| `/admin/tournament/list` (781) + `/list/new` (782) | `TournamentListPage` + wizard | Admin | Canonical | — | Keep | new create + list |
| `/admin/tournament/list/:id` (783) | **Hub** `TournamentDetailPage` | Admin | **Canonical** | supersedes participants/draw/schedule/matches/auth sub-views | Keep | primary management surface |
| `/admin/tournament/list/:id/participants` (785) | `TournamentParticipantsPage` | Admin | Canonical (also Hub tab embed) | Hub embeds it (line 514) | Keep | leaf route as well as tab |
| `/admin/tournament/list/:id/draw` (786) | `TournamentDrawPage` | Admin | Canonical (Hub Competition tab embed) | — | Keep | |
| `/admin/tournament/list/:id/schedule` (787) | `TournamentSchedulePage` | Admin | Standalone but unique scheduling | Hub links to it | Keep (later embed) | scheduling not yet in Hub |
| `/admin/tournament/matches` (788) | `TournamentMatchesPage` | Admin | **Legacy standalone** | duplicates Hub Matches | **Deprecate→redirect** after parity | Hub is canonical |
| `/admin/tournament/bracket-types` (789) | `TournamentBracketTypesPage` | Admin | Canonical | — | Keep | bracket management |
| `/admin/matches` (791) | `AdminMatchesPage` | Admin | **Shared global monitoring** | NOT a Hub duplicate | **Keep (global)** | cross-session operations |
| `/admin/match-results` (790) | `AdminMatchResultsPage` | Admin | **Shared global result queue** | NOT a Hub duplicate | Keep (global) | dispute/correct/history |
| `/org/:orgId/tournaments` (917) + `/new` (918) | Org list + wizard | Org | Canonical | — | Keep | org-scoped |
| `/org/:orgId/tournaments/:id` (919) | Hub (org mode) | Org | Canonical | same component as admin | Keep | org mirror |
| `/org/:orgId/tournaments/:id/schedule` (922) | `TournamentSchedulePage` | Org | Standalone | links from Hub | Keep (later embed) | |
| `/org/:orgId/tournaments/:id/participants` (920) `/draw` (921) | leaf pages | Org | Canonical tabs | Hub embeds | Keep | |
| `/org/:orgId/matches` (884) | `OrgMatchesPage` | Org | Shared monitoring (org) | NOT a Hub duplicate | Keep (global) | |
| `/org/:orgId/match-results` (885) | `OrgMatchResultsPage` | Org | Shared queue (org) | — | Keep (global) | |

**Canonical tournament surfaces:** Hub admin + org (`/admin/tournament/list/:id`, `/org/:orgId/tournaments/:id`), Bracket Types, Creation Wizard. **Legacy to deprecate later:** `/tournaments` (+ `/:id`), `/admin/tournaments`, `/admin/tournament/matches`. **Shared to keep:** Monitoring (admin/org), Match Results (admin/org), session pages, referee surfaces, player history.

## 3. Tournament Hub Audit

- **Reachable & functional:** Overview (general/rules/prizes/sponsors), Participants (registrations + embedded Participants page), Competition (categories/groups/qualification/draw/bracket/knockout; GSK managers), **Matches** (All/Upcoming/Live/Completed/Results with the full action set), Standings, Finances (read-only, permission-gated), Settings (rename + lifecycle), awards via contextual route.
- **Consolidation loss check:** no standalone-only *management* function remains for matches except scheduling (Hub links to `TournamentSchedulePage` — documented) and the legacy standalone `TournamentMatchesPage` action duplicates (superseded; deprecate).
- **Dead/misleading buttons:** none found in the Hub; lifecycle primary/secondary actions are state- and permission-aware.
- **GSK:** Competition tab hosts groups/qualification/knockout; Matches tab shows group/knockout stages; standings tab per group.
- **Mobile:** tabs + stacked match cards + `a11yDialog`; Hub is mobile-first.
- **Realtime:** Step 3H wired — Hub refetches on match/result/progression/GSK/completed events via `invalidateTournamentHub` (admin + org keys).

## 4. Bracket Types Management Audit

- List (enriched with `engine_capability`, `creation_available`, `referenced_count`), filters (All/Active/Inactive/Ready/Planned/Unsupported + search), metrics, GSK registry row (no fake id, no toggle), Read-only detail (GET-by-id with usage split), Create/Edit/Delete with backend guards (duplicate/canonical/in-use), activate/deactivate backend-safe.
- **Source-of-truth:** UI consumes the enriched admin list; engine capability never re-derived client-side. GSK registry entry is clear.
- **Honesty:** DE/Swiss show Planned/Unavailable + "Engine not available yet" — never Active-looking or activatable.
- **Gap (documented):** the Creation Wizard still reads the *active-only* reference endpoint (`/org/:orgId/tournaments/bracket-types`) not the enriched management payload — recommended alignment (future step).

## 5. Creation Wizard Audit

- 8 steps with field-level + step-level validation (name required, max participants, schedule window, min<=max, eligibility age categories, payment methods when fee>0, GSK config validity), single react-hook-form state, admin + org shared component (org-picker in admin mode).
- Format step: SE/RR executable cards from active bracket types; DE/Swiss planned cards (reveal-only); GSK card → SE substrate + `gsk_config` validated. `format = group_stage_knockout` only when valid config.
- **Payload** submits snake_case to `POST /org/:orgId/tournaments`; server derives commission/currency/type/rules.
- **Fake controls:** none — every control maps to a persisted field. Stale comment noted (`TournamentCreatePage` header text about GSK as "engine preparation") — cosmetic.
- **Gap:** wizard format availability derived from the active-only endpoint (not the registry-level list), and `getBracketTypes` returns raw active rows; alignment with the enriched management list still outstanding.

## 6. Format Engine Audit

| Format | UI availability | Backend create | Engine | Progression/Completion | Honest? |
|---|---|---|---|---|---|
| Single Elimination | Hub/wizard | ✅ | ✅ | ✅ auto-complete + placements | ✅ |
| Double Elimination | Planned (unavailable) | ❌ rejected | ❌ | — | ✅ |
| Round Robin | Hub/wizard | ✅ | ✅ | ✅ operator-complete (unresolved guard) | ✅ |
| Swiss System | Planned (unavailable) | ❌ rejected | ❌ | — | ✅ |
| Group Stage + Knockout | Hub/wizard + public | ✅ (SE substrate + `gsk_config`) | ✅ | ✅ groups→standings→qualify→knockout→final→complete | ✅ |

GSK verified: balanced deterministic group distribution (`planGroupMemberCounts`/`assignGroupsDeterministic`), per-group round-robin shared matches, standings rules, top-N + best-third selection with deterministic comparator, qualification ordering (seed/points/rank), knockout starting round + byes, automatic/manual seeding (constraint-aware, rejects unsatisfiable), progression and completion through the real processor (integration-tested via `handleProgressionEvent`). **Play-ins still unsupported** (explicitly rejected; not exposed in wizard). Public/player/admin/org GSK views all present. Realtime for generation now published+handled (Step 3H).

## 7. Match Architecture Audit

- Uses the canonical `GET /admin/tournaments/:id/matches` (+org) directly; segments are pure client-side filters over one fetch.
- Actions authoritative: Start/Complete (`tournament.manage`), Court/Referee (same; court picker via eligible-courts, referee numeric-id — no referee-list API), Record Result (`tournament.result.manage`/org), Accept Result (`matches.result.accept`), Details (universal drawer), View Result (shared record), Schedule (link to schedule page), Open Monitoring (shared monitor).
- Only standalone-only functions: **scheduling/generation UI** lives in `TournamentSchedulePage` (Hub links to it); legacy `TournamentMatchesPage` retains an exact duplicate of Hub management actions — deprecate after parity.
- BYE rows render safely (TBD/Bye), no fabricated progression.

## 8. Live / Realtime Audit

Full chain verified (Step 3H): engine/service → `eventBusV2.emit` → publisher allowlist (incl. newly added GSK generation events) → privacy-slim mapper → rooms (org/branch/admin/creator/user; player only for safe public set) → frontend singleton → `useRealtimeCacheUpdates` → `invalidateTournamentHub` → refetch of admin + org Hub keys and `['tournament', id, matches|bracket|standings]`. Reconnect reconcile now also heals Hub roots. **Remaining stale scenarios:** none for persons connected via rooms, except viewers *not* in an org/branch/user room (pre-existing room-membership constraint) and browser tabs only after the event refetch completes. GSK group/knockout generation now reach the Hub.

## 9. Results Audit

- Hub Results = sub-filtered view over `result_status` (Needs Attention default; All/Approved/Disputed/Withdrawn/No Result) reusing the shared `match_result_records` engine.
- Reuses `DynamicResultForm` payload builder (`utils/tournamentResult`), `ResultSummaryView` (via Drawer `resultRecord`), canonical result APIs, and the universal Drawer.
- Actions: Record Result, Accept Result (pending + `matches.result.accept`), View Result, Open Match Results. Dispute/correction/history intentionally remain in the shared module (backend `resolve` needs the full record + rules — correct split, not duplicated).
- Decision confirmed: global Admin/Org result queues stay shared; Hub is the tournament entry point.

## 10. Monitoring Audit

- Separation correct: Hub **Live** = tournament-scoped operational view (live/starting-soon + actions + details); global Admin/Org Monitoring = all-session status workbench (open→void, applicants, pending-result/`resultEntryOpen` signals, cross-kinds). No important monitoring function lost; no duplication.
- "Open Monitoring"/"Live Monitoring" contextual links to the shared surfaces work.

## 11. RBAC / Security Audit

- Hub/bracket/wizard/result gates use authoritative keys (`tournament.*`, `org.tournaments.*`, `matches.result.*`, `matches.admin.view`, `org.matches.*`). No IDOR found on org routes (tenant checks: `assertOrgOwnsTournament`, org match-results ownership); admin registration guarded by org-scope.
- **Mismatches (P1/P2, unmodified):** (a) player-facing consumer detail "Enter Score" still gates with stale `tournaments.enter_scores` while backend result routes use `tournament.result.manage`/org or `matches.result.submit`; (b) `tournaments.enter_scores` remains registered in the permission registry (legacy). Both documented; Hub flow uses the correct key.
- No over-broad permissions observed beyond existing shared `matches.view`/`matches.admin.view` model; no action visible that the backend rejects on the canonical surfaces.

## 12. Public / Player Experience Audit

- Public detail includes GSK read model (groups/standings/stages/knockout via the public projection `getPublicTournament`), matches, participants, standings, qualifier hints — intentionally private organizer fields excluded (correct).
- Player hub: bracket/drawer highlight current user; `my/tournaments` list; GSK player panel shows groups/knockout/qualification read-only.
- Gaps are intentional privacy boundaries, not defects.

## 13. Mobile UX Audit

- Good: Hub tabs, stacked match cards, bottom-sheet modal (`variant=auto`), 44px targets, no list-level horizontal scroll in Hub.
- Issues (P2/P3): a few dense tables remain (`participants`, `standings`, bracket-types) with `overflow-x-auto` (acceptable); standalone `TournamentMatchesPage` uses tiny inline court/referee ID inputs and small text buttons (legacy — to deprecate); bracket scrolls horizontally on very deep brackets (acceptable for print-friendly bracket).

## 14. Accessibility Audit

- Solid base: `a11yDialog` modals (role/aria-modal/focus trap/Escape/focus return), `aria-pressed` segments, semantic buttons, text+badge status, reduced-motion CSS, labelled inputs. Minor: some inline textual buttons in legacy standalone screens are small; bracket components use non-button semantics guarded by real buttons; no automated axe runs seen — recommend an a11y sweep as part of the backlog.

## 15. Dead / Duplicate / Misleading UI

| Item | Class |
|---|---|
| `tournaments.enter_scores` stale gates/registry (player consumer) | **P1** (functional mismatch) |
| Stale comments: create-page header ("engine preparation" incl. GSK), bracket doc comments | P2 |
| Legacy `/tournaments` + `/tournaments/:id` consumer screens vs player/public | P2 (deprecate) |
| Legacy `/admin/tournaments` list vs workbench | P2 (deprecate) |
| Legacy standalone `TournamentMatchesPage` duplicate of Hub | P1→P2 (deprecate after parity) |
| Wizard not aligned with enriched bracket-type management list | P2 |
| Inline numeric court/referee assignment on legacy screens (standalone) | P2 |
| No dead buttons found on canonical surfaces | — |

No P0 dead/misleading controls.

## 16. Accounting / Payment Impact

- Registration payments: cash (offline `payment_transactions`, tournament reference, idempotent) and card via shared `PaymentService.charge`; payment listener marks `paid`; refund API with draw-lock cutoff + gateway refund/settlement detach; prize awards with org funding, wallet credit + ledger; full-only clawback.
- **Accounting recognition:** tournament revenue/commission is intentionally **not** posted to the ledger (shared accounting engine skips the `tournament` reference type); finances screens are a read-model. This is a deliberate scoping decision, **not** a production blocker, but should be a product decision for recognition/compliance.

## 17. Database Audit

**No database change required.** The current schema (tournament tables, canonical match read joins, `match_result_records`, realtime tables) fully supports the implemented and pending-consolidation features. Conservatively: none needed even for deprecating legacy screens or aligning the wizard.

## 18. Test Coverage Audit

Strong: backend unit/integration (tournament lifecycle, GSK contract+lifecycle through the real processor, bracket CRUD, canonical match contract, results/disputes/correction, realtime mapper/publisher), frontend (Creation wizard, Hub, MatchesManager `43`, Bracket Types CRUD, GSK player/public, drawer a11y, realtime hub hook). Gaps: no Admin/OrgMatchesPage spec; no `MatchResultPage`/History specs; no creation-wizard alignment tests; no axe/a11y automated sweep; no e2e (Playwright) tournament flows.

## 19. Production Readiness

**B — Production Ready with Minor Gaps** (supported by evidence above): all three formats executable, GSK end-to-end verified through the production processor, RBAC/RBAC parity on canonical surfaces, realtime parity implemented, no DB changes needed, and only minor functional/UX cleanups (stale player gate, legacy-screen deprecation, wizard alignment) remain.

## 20. Final Backlog

| Priority | Issue | Impact | Affected files/routes | Solution | DB? | Scope |
|---|---|---|---|---|---|---|
| P0 | (none blocking) | — | — | — | no | — |
| P1 | Replace stale `tournaments.enter_scores` gate on player consumer detail with authoritative session/result key | player Record/Enter Score hidden or 403 | `pages/tournaments/TournamentDetailPage.tsx` | align to `matches.result.submit`/staff key; clean registry | no | Small |
| P1 | Ensure disabled/deprecated notice on legacy `TournamentMatchesPage` until deprecation | confused users | route + page | banner + (later) redirect | no | Small |
| P2 | Align Creation Wizard format cards with the enriched bracket-type management list (incl. GSK/registry) | single source of truth | `TournamentCreatePage.tsx`, services | consume enriched list | no | Medium |
| P2 | Deprecate/redirect `/tournaments` + `/tournaments/:id` and `/admin/tournaments` (+ `/admin/tournament/matches`) | redundant surfaces | App routes | redirects after parity | no | Small |
| P2 | Move scheduling UI into Hub (or keep link prominently) | scheduling only via standalone page | `TournamentSchedulePage`, Hub Matches | embed later; keep link now | no | Medium |
| P2 | Replace inline numeric referee/court inputs on legacy screens; add referee-list source | UX/data-entry errors | standalone page, assignment flow | add picker/endpoint later | no | Medium |
| P2 | Stale comments/titles cleanup | correctness of docs | create page, hub | edit text | no | Small |
| P3 | Accounting recognition decision (post tournament revenue/commission) | compliance/reporting | accounting engine | product decision | maybe (later) | Large |
| P3 | Referee-list endpoint + picker everywhere | staff assignment UX | referee module | new read API (later step) | no | Medium |
| P3 | A11y automated sweep (axe) on all tournament screens | a11y confidence | frontend | CI + fixes | no | Medium |
| P3 | E2E Playwright tournament journeys (Hub/Results/Live/bracket/types) | regression safety | `e2e/` | add tests | no | Large |

## 21. Final Architecture

```
Admin / Organizer
  ├─ Creation Wizard (admin picks owning org; org mode forced)
  ├─ Bracket Types (management + registry entry for GSK)
  └─ Tournament Hub  /admin/tournament/list/:id  (+ org mirror)
       Overview | Participants | Competition | Matches | Standings | Finances | Settings
        └─ Matches: All | Upcoming | Live (Live Now/Starting Soon) | Completed | Results
           ├─ actions: Details/View Result/Record/Accept/Start/Complete/Court/Referee/Schedule
           └─ contextual links → Match Results / Monitoring (shared)
  ├─ (Shared) Admin Matches + Admin Match Results   ← global operations
Player
  ├─ Discover: /tournaments/public(/id) · Register: /my/tournaments + detail
  ├─ Session: /matches/:id (+ result), /my/match-results
  └─ Player tournament/GSK views (groups/knockout/standings, read-only)
Public
  └─ /tournaments/public(/id) — GSK read model (is_public=1)
Global Operations (shared, unchanged)
  Admin/Org Monitoring (`/admin`/`/org/.../matches`)
  Admin/Org Match Results (`/admin`/`/org/.../match-results`)
  Referee assignments/session officiation
```

## 22. Final Explicit Verdict

1. **Is Tournament Hub the canonical organizer/admin surface?** Yes — one Hub (admin + org mirrored) replaces the standalone participants/draw/matches/… screens; only scheduling remains as a separate page (linked).
2. **Is Matches canonical?** Yes — consolidated Matches (segments + full actions) over the canonical API; the legacy `TournamentMatchesPage` is a superseded duplicate slated for deprecation.
3. **Is Live canonical?** Yes — Live is the tournament-scoped operational view (Live Now/Starting Soon + actions + Open Monitoring); global Monitoring stays shared (a different, broader operational tool).
4. **Is Results correctly integrated?** Yes — Hub Results reuses `match_result_records`, `DynamicResultForm`, `ResultSummaryView`, the Drawer and canonical APIs; is the entry point, not an engine duplicate (dispute/correction/history remain shared).
5. **Is Global Monitoring preserved?** Yes — Admin/Org workbenches + results queues + session/referee surfaces are fully intact.
6. **Is GSK executable end-to-end?** Yes — verified creation → groups → RR → standings → qualification → knockout (seeding/byes) → final → completion/winner through the production progression processor; play-ins remain unsupported (honest).
7. **Are DE/Swiss honest?** Yes — Planned/Unavailable, rejected at create, no activation (registry + UI).
8. **Dead/misleading controls?** None on canonical surfaces; stale player `tournaments.enter_scores` gate (P1) and stale comments (P2) remain.
9. **Duplicate screens to redirect later?** `/tournaments`(+`/:id`), `/admin/tournaments`, `/admin/tournament/matches` (and standalone schedule after an embed).
10. **Remaining RBAC issues?** Only the stale player-facing `enter_scores` gate; no security/IDOR gaps on canonical surfaces.
11. **Remaining realtime issues?** None in the Hub path (Step 3H complete + reconnect reconcile); optional later polish for room-membership coverage.
12. **Remaining mobile/a11y issues?** Minor (dense legacy tables, small legacy inline controls, no automated a11y sweep) — no blockers on the Hub.
13. **DB change required?** No.
14. **Accounting a production blocker?** No — intentionally not posted to the ledger; product decision recommended.
15. **TOP 10 remaining actions:** (1) fix player `enter_scores` gate; (2) deprecate legacy consumer/admin-list/standalone-matches routes; (3) align Creation Wizard format cards with the enriched Bracket Types list; (4) surface scheduling inside the Hub (or a more prominent link); (5) replace inline numeric court/referee inputs + add a referee list; (6) stale-comment/registry cleanup; (7) accounting recognition product decision; (8) automated a11y sweep; (9) E2E tournament journeys; (10) final UAT on mobile (Android/iPhone) for Live/Results/bracket.
16. **What should NOT be changed (current architecture is correct):** the Hub-tab structure, the canonical match endpoint + additive contract, the shared `match_result_records` engine being left authoritative (no in-Hub dispute/correction engine), global Monitoring staying separate (no embedding), Bracket Types backend-authoritative capability + CRUD guards, GSK composite (no DB row) treatment, realtime via `useRealtimeCacheUpdates` (one client), and the "invalidation-only" frontend rule.

---
*End of final audit. Read-only — no source, DB, migrations, tests, routes, or permissions were changed; nothing committed or pushed.*