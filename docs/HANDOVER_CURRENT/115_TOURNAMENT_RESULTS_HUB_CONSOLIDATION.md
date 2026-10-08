# Tournament Results Hub Consolidation

> Step 3F — tournament-scoped Results management inside the Tournament Hub. Frontend-only; the shared `match_result_records` module stays authoritative. Repository state: post `c3d488d9` (Step 3E) + this step.

## 1. Objective

Upgrade the existing Hub **Matches → Results** segment from a thin attention list into a tournament-scoped result-management view, **without** creating a second result engine. All lifecycle logic (submission, acceptance, dispute, correction, withdrawal, history, audit, progression) continues to run in the shared result module; the Hub calls existing canonical endpoints and reuses shared components.

## 2. Hub Results Architecture

- Same component (`MatchesManager`), same canonical match fetch — Results is a client-side segment over the loaded array.
- **Results** = matches that carry a shared result (`result_status != null`).
- Default sub-filter: **Needs Attention** (`pending_confirmation | disputed`); the user can switch to All Results / Approved / Disputed / Withdrawn / No Result.
- Rows are the existing responsive match cards (participants, score, status/result chips, stage/group, court, referee, schedule, actions).
- One fetch feeds every segment; no server-side filters added; no new queries per filter.

## 3. Result States

Authoritative statuses only (`pending_confirmation | approved | disputed | withdrawn | no_result`) rendered as text+color chips (`Badge`), never color-only. Sub-filters derive directly from `result_status`.

## 4. Result Actions

Per row, permission-gated via the authoritative keys:
- **Details** — universal `MatchDetailsDrawer`.
- **View Result** (result rows) — lazily fetches the shared record via the existing `GET /matches/:id/result` and hands it to the Drawer (`resultRecord`), reusing `ResultSummaryView`. No second summary implementation.
- **Record Result** — the existing modal (`DynamicResultForm` payload via `utils/tournamentResult`) → existing tournament/result API.
- **Accept Result** (`pending_confirmation`, `matches.result.accept`) — existing `POST /matches/:id/result/accept`.
- **Open Match Results** — contextual link into the shared Admin/Org Match Results (approval/dispute/correction/history stay there). No inline dispute/correction/withdrawal in the Hub (the shared `resolve` requires the full record + rules validation — deliberately left to the shared module).

## 5. Shared Result Module Reuse

Reused (no copies): `DynamicResultForm` payload builder (`utils/tournamentResult.ts`), `ResultSummaryView` (via Drawer `resultRecord`), `match-result.api` (`fetchMatchResult`, `acceptMatchResult`), the universal `MatchDetailsDrawer`, and `Badge`/`Button`/`Modal(a11yDialog)`. **No second result engine was created.**

## 6. Permissions

- Existing authoritative keys only; `tournaments.enter_scores` is NOT used in the admin/org tournament flow (aligned in Step 3E).
- `Record Result` → `tournament.result.manage` / `org.tournaments.result.manage`; `Accept Result` → `matches.result.accept`; shared module actions → `matches.result.manage` / `org.matches.results.view`. Backend remains authoritative; actions only surface when the current role holds the key.

## 7. Admin / Organization Scoping

Admin Hub = global tournament routes; Org Hub = org routes (org-scoped, `assertOrgOwnsTournament`) — the Results segment flows through the same scoped API (`tournamentApi`/`orgTournamentApi`). Org result submission routes via the org variant (`orgTournamentApi.recordResult(orgId, ...)`); shared Accept uses the same endpoint for both (server-validated). No arbitrary org/tournament combination accepted.

## 8. GSK Behavior

- Group-stage results: `stage_progression_format='round_robin'` + `group_name` shown.
- Knockout results: `stage_progression_format='knockout'`, no `group_name`.
- Progression/standings/qualification/knockout/completion are handled by the backend result→progression pipeline; the UI only invalidates/refetches after mutations.

## 9. Match Details Integration

The universal `MatchDetailsDrawer` remains the shared details surface. The Hub now passes a lazily-fetched `resultRecord` so the drawer's Result section (via `ResultSummaryView`) renders for tournament matches too — previously only the shared lobby did. Public/player behavior unchanged.

## 10. Legacy Result Surfaces

`AdminMatchResultsPage`, `OrgMatchResultsPage`, `MatchResultPage`, `MatchResultHistoryPage` and Matches Monitoring remain fully functional and reachable; the Hub adds contextual **Open Match Results** access. No route removed or redirected.

## 11. Accessibility / Mobile

Segments and sub-filters are `aria-pressed` buttons; actions are real buttons with text labels (no icon-only), ≥40-44px targets; rows stack on mobile (no list-level horizontal scroll); status conveyed by text + badge; result modal is an `a11yDialog` (lazy fetch via `fetchMatchResult`); no new animation (reduced-motion respected).

## 12. Tests

- `MatchesManager.spec.tsx` extended to **31 tests** (Results renders with status chips; default Needs-Attention; All/Approved/Disputed filters; stage/group context; View Result fetches shared record + hands it to the drawer; Accept calls the canonical shared API; Accept permission-gated; no inline dispute/correction; empty results; org-mode result submission; no extra fetch on accept).
- Existing tournament + shared result suites: **323 tests / 29 files green**; `npm run build` clean.

## 13. Build / Docker

Frontend rebuilt, container restarted; backend/mysql/redis healthy; SPA returns 200; no DB changes; only the intended files changed.

## 14. Database Impact

**No database change required.** The canonical match contract (`result_id`/`result_status`) plus shared `match_result_records` fully support this view.

## 15. Known Limitations

- Disputed approval/correction and full history remain in the shared module (by design — the Hub links to it; `resolve` needs the full record/rules).
- Accept is offered to roles holding `matches.result.accept`; org admins without that key use the shared module path.
- Realtime parity (result events already published; GSK generation gap) remains a later phase — the UI refreshes via query invalidation.

## 16. Next Step

Realtime parity phase + optional legacy standalone-page deprecation after Hub parity is proven. Global Admin/Org Results and player History remain shared surfaces.