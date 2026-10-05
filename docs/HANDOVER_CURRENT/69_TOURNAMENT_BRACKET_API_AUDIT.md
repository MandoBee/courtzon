# 69 — TOURNAMENT BRACKET & MATCH DETAILS — API/DATA AUDIT (READ-ONLY)

**Audited:** 2026-10-05 · **Target:** CURRENT repository + live Production (read-only) · Nothing modified, no business data created.

---

## 1. CURRENT FRONTEND FILES (verified paths)
| Concern | Existing file |
|---|---|
| Player tournament detail (tabs: overview/bracket/standings/players) | `frontend/src/pages/tournaments/TournamentDetailPage.tsx` (fetches `GET /tournaments/:id`; bracket tab renders Rounds grid at lines ~288–311 with player names, `score_summary`, `✓` winner; player’s own registration highlighted at lines 115/136 via `useAuthStore((s)=>s.user)` + `Number(p.player_id) === Number(user?.id)`) |
| Tournament list / create / public detail | `pages/tournaments/TournamentListPage.tsx` · `TournamentCreatePage.tsx` · `pages/player/PublicTournamentDetailPage.tsx` · `pages/player/PublicTournamentsPage.tsx` |
| Admin / org tournament detail & matches | `pages/admin/tournament/TournamentDetailPage.tsx` · `TournamentMatchesPage.tsx` (has result input modal, lines 66–91) · `pages/org/OrgTournamentDetailPage.tsx` |
| API services | `frontend/src/services/tournament.ts` — `tournamentApi.*` (admin/mgmt), `publicTournamentApi.getPublicBracket|getPublicStandings|getPublicMatches|getPublicParticipants` (hits `/tournaments/:id/...`), `orgTournamentApi.*` (org path), `bracketTypeApi` |
| Reusable UI primitives | `components/ui/Modal.tsx` · `components/ui/Skeleton.tsx` · `components/ui/Toast.tsx` · `components/branding/SiteLogo.tsx` |
| Sport/result display | `components/match-result/DynamicResultForm.tsx` · `components/match-result/ResultSummaryView.tsx` (reads `record.finalResult/rawResult`, winner win/draw/loss, venue/format/tournament context; i18n `matchResult.*`) |
| Date/currency utils | `utils/formatDate.ts` (`formatISODate`, `formatDateTime`) · `utils/currency.ts` (`formatPrice`) |
| User identity | `store/auth.store.ts` → `z.user.id` via `useAuthStore((s)=>s.user)` (used in TournamentDetailPage) |

## 2. CURRENT BACKEND FILES (verified paths)
- Routes: `backend/src/modules/tournaments/presentation/tournament.routes.ts` — player-facing **GET** endpoints: `/tournaments/:id` (169), `/tournaments/:id/bracket` (170), `/tournaments/:id/standings` (171), `/tournaments/:id/matches` (172), `/tournaments/:id/participants` (173) — all `requirePermission(['tournament.view'])`.
- Controllers: `tournament.controller.ts` — `getTournamentHandler` (140), `getBracketHandler` (421) → `tournamentService.getBracket(id)` → reply `{data}`, `getMatchesHandler` (427) → `getMatchesDetailed(id)`, `getStandingsHandler` (433), `getParticipantsHandler` (470).
- Services: `modules/tournaments/application/tournament.service.ts` (`getByIdDetailed`, `getBracket`, `getMatchesDetailed`), `participant-draw.service.ts`, standings via tournament standings service (live `tournament_standings` table).

## 3. READ-ONLY API CONTRACTS (captured live from Production, Tournament 5)
All return `{ data: ... }` (except `/tournaments/:id` returns the tournament object directly).

### GET /tournaments/:id — Tournament (object)
`id, public_id, name, status, tournament_type, price_type, entry_fee, currency_code, organisation_id, branch_id, venue_type …, sport_id, bracket_type_id, format, match_format_id, rule_set_id, max_participants, min_participants, registration_opens/closes, registration_payment_methods, commission_rate, start_date/end_date, daily_start/end_time, is_public, waitlist_enabled, rules (frozen text), prize_description, created_by…` (full shape matches the earlier `publish` response).

### GET /tournaments/:id/matches → `{ data: [ Match ] }`  ← **richest node; feed of choice**
Per match: `id (tournament_match.id), tournament_id, competition_id, match_id (public), round, round_name ("Final"), match_number, bracket_position, player1_id, player2_id (USER ids), resource_id, referee_id, start_time, end_time (UTC ISO), status, progression_state, progression_meta {is_final, target_side, bracket_depth, target_bracket_position}, winner_id (user id), score_summary ("2-1"), participant1_id, participant2_id, winner_participant_id, loser_participant_id, final_position, bracket_depth, is_final, shared_status, format_snapshot {name, formatId, formatType, playersPerSide}, rule_snapshot {halves, extra_time, draw_allowed, score_structure:"goals"|"sets", penalty_shootout, match_duration_minutes}, booking_id, player1_name, player2_name, participant1_name, participant2_name, resource_name, referee_name`.

### GET /tournaments/:id/bracket → `{ data: [ BracketNode ] }`
Same core node shape as above (id/round/round_name/match_number/bracket_position/player1_id/player2_id/participant ids/status/score_summary/winner fields/progression_meta/is_final) but **without** the enriched `player1_name/player2_name/resource_name/referee_name/format_snapshot/rule_snapshot` joins (enrichment is only on `/matches`).

### GET /tournaments/:id/participants → `{ data: [ Participant ] }`
`id, tournament_id, competition_id, player_id (user id), team_id, seed_rank, seed, status, waiting_order, payment_status, player_name, eligibility_snapshot{members:[{userId, eligible, reasons}]}`.

### GET /tournaments/:id/standings → `{ data: [ ] }`
Empty until the tournament is finalized (schema fields available when populated: `rank_position, registration_id, wins/losses/draws/points, games_won/games_lost, sets_won/sets_lost` per `tournament_standings`).

## 4. EXISTING COMPONENTS WE CAN REUSE
- `components/ui/Modal.tsx` — for the Match Details drawer/modal.
- `components/match-result/ResultSummaryView.tsx` — ready-made result card (winner win/draw/loss, scoreSummary, venue/format context) for the expanded view; `DynamicResultForm` for admin entry (not needed for read UI).
- `components/tournaments/` — `EligibilitySummary`, `GeneratedRules`, `PrizeList`, `SponsorList`, `CompetitionManager` (reuse patterns/styling); **no dedicated `TournamentBracket` or `MatchCard` component exists yet** (bracket is inline in `TournamentDetailPage` lines 288–311).
- `components/booking/MatchErrorState.tsx` — reusable error states.
- `utils/formatDate.ts`, `utils/currency.ts`, `store/auth.store.ts` (user id), `services/tournament.ts` (extend with wrappers; `publicTournamentApi.*` already exists).

## 5. PLAYER-HIGHLIGHT DATA AVAILABLE
- **Yes.** Match nodes expose `player1_id`/`player2_id` (user ids); participants expose `player_id` + `player_name`. The frontend already obtains the logged-in user via `useAuthStore((s)=>s.user)` and compares `Number(p.player_id) === Number(user?.id)` (TournamentDetailPage lines 115/136) — same pattern powers "my match" highlighting in the new MatchCard. No new backend field required.

## 6. SPORT-SPECIFIC RESULT DATA AVAILABLE
- Backend provides **both** a display string and structured context:
  - `score_summary` (string) per match — e.g. `"2-1"` (football goals), `"6-4 6-3"` (tennis set-by-set string per existing tests).
  - `rule_snapshot.score_structure: "goals" | "sets"` + `format_snapshot.formatType ("team"|…)`, `halves`, `draw_allowed`, `penalty_shootout` → lets the UI know whether to expect goals vs sets without guessing.
  - Full structured result (per-set detail) is available from the shared Match Result records (`match_result_records.raw_result/final_result` with `SetsScoreSchema sets[]` / `GoalsScoreSchema`) — the `ResultSummaryView` already consumes `finalResult/rawResult`.
- **Conclusion:** the backend already provides sport-specific data; the frontend should interpret using `rule_snapshot.score_structure` + `format_snapshot` + `score_summary`, and use the result record for detailed set scores (tennis best‑of‑3) — no backend guesswork required.

## 7. RECOMMENDED UI ARCHITECTURE
- **Single data feed:** use `GET /tournaments/:id/matches` as the bracket+match source (it already carries names/snapshots/resource/referee/times), plus `/tournaments/:id/participants` for seeding panel and `/tournaments/:id` for header. `/bracket` may be used for a pure structural view when only bracket geometry is needed.
- **Rendering by type:** SE (knockout) → visual columns QF→SF→Final (group by `round`/`round_name`, cards positioned by `bracket_position`); DE → Winners/Losers/Final sections (position from `progression_meta`/`bracket_depth`); RR/Swiss/League → tables/round views (existing standings + groups), not a knockout tree.
- **Components:** NEW `TournamentBracket` (pure display, no business logic), `MatchCard` (compact: players/score/status/court/referee/time), `MatchDetailsDrawer` (bottom-sheet on mobile / Modal on desktop, reuse `ResultSummaryView` for result), optional `TournamentPrintView` (print-only, same feed). Player highlight inside `MatchCard` via `useAuthStore` id vs `player1_id/player2_id`.
- **Mobile:** bracket grid collapses to 1 column; drawer is full-height bottom sheet; respect `cz-pb-safe` inside AppLayout consumer pages.
- **Printing:** append `@media print` rules (hide nav/bottom bars; `.print-bracket` container renders only the bracket grid + header + legend). Cleanest: a dedicated `TournamentPrintView` component fed by the same `/matches` data (no business-logic duplication).

## 8. EXACT FILES FOR THE NEXT STEP (implementation)
- NEW: `frontend/src/components/tournaments/TournamentBracket.tsx`
- NEW: `frontend/src/components/tournaments/MatchCard.tsx`
- NEW: `frontend/src/components/tournaments/MatchDetailsDrawer.tsx` (+ optional `TournamentPrintView.tsx`)
- MODIFY: `frontend/src/pages/tournaments/TournamentDetailPage.tsx` (bracket tab → use `TournamentBracket`; match tap → drawer; player highlight)
- MODIFY (reuse/parity): `frontend/src/pages/admin/tournament/TournamentDetailPage.tsx` and `TournamentMatchesPage.tsx`, `frontend/src/pages/org/OrgTournamentDetailPage.tsx` (swap inline bracket/list for the shared components)
- MODIFY: `frontend/src/services/tournament.ts` (add typed wrappers e.g. `getTournamentDetail`, `getPublicMatches` returning `{data}`; slice + format helpers)
- MODIFY: `frontend/src/index.css` (print styles + bracket/drawer utility classes), and register any new i18n keys in the translation registry (en/ar).
- REUSE (no change): `components/ui/Modal`, `components/match-result/ResultSummaryView`, `store/auth.store`, `utils/formatDate/currency`.

## 9. BLOCKERS / MISSING BACKEND DATA
- **None blocking.** Observations to note during implementation:
  1. `GET /tournaments/:id/bracket` nodes lack the enriched joins (`player_names`, `resource_name`, `referee_name`, `format_snapshot`, `rule_snapshot`) — the UI should read `/matches` (enriched) rather than `/bracket`, or a small backend enhancement (adding joins to `getBracket`) could be requested later.
  2. `score_summary` is a display string; per-set numeric detail lives in Match Result records — the drawer should fetch/accept the result record for tennis set-scores (reuse `ResultSummaryView`).
  3. Standings are only populated after tournament finalize (empty until then) — the standings tab must render an empty state accordingly.
  4. All five read endpoints require authentication + `tournament.view` (public detail uses the separate `/tournaments/public/*` routes), so the bracket UI lives inside authenticated pages.

---

**Audit complete — READ-ONLY, nothing modified, no business data touched (Tournaments 4 and 5 untouched). Next step (implementation) requires your approval.**