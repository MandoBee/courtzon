# 49 — TOURNAMENT TEST EXECUTION PACK

**Prepared:** 2026-10-05 · **Target:** Production `187.127.72.93:3307 / courtzon_v3` (cleaned + restored + TEST identities created — see `48`)
**Mode:** ANALYSIS/PLAN ONLY — **no business data created, no code/DB/config change, nothing executed.**
Endpoints/services/tables below were extracted from the CURRENT code and live schema; behaviors not yet proven are explicitly marked **⏳ VERIFY-IN-TEST**.

> No real credentials appear in this document. TEST identities exist per `48` (TEST_SELLER = user **136**; user **135** is a spare player and is NOT used for seller tests).

---

## A. PRECONDITIONS

### A.1 Required data & identities (verified in `48`)
| Item | Value |
|---|---|
| TEST_ORG | id **35** (active+verified, org_type 1 sports-club, owner 127) |
| TEST_MAIN_BRANCH | id **21** |
| TEST_COURT_1 | `resources` id **6** (type 2 Padel, sport 19) |
| Subscription | org 35 → plan 3 (Freemium Club, active) — **commission is derived from this plan** (org-tournament `resolveCommissionRate`, `getOrgCommissionConfig`) |
| Identity map | TEST_SUPERADMIN 126 · TEST_ADMIN 127 · TEST_MANAGER 128 · TEST_RECEPTIONIST 129 · TEST_ACCOUNTANT 130 · TEST_COACH 131 · TEST_REFEREE 132 · TEST_PLAYER 133 · TEST_PLAYER2 134 · spare 135 · TEST_SELLER 136 |
| Master data (present) | sports (16) · sport_formats (3) · sport_rule_sets (3) · tournament_bracket_types (4) · tournament_age_categories (7) · payment_methods (6) |

### A.2 Actor per step & required permissions
| Actor | Needed permission keys (verified pattern) | Used for |
|---|---|---|
| TEST_SUPERADMIN (126) | all (super_admin) | escalation/negative tests, fixture approvals if needed |
| TEST_ADMIN (127) | org access to org 35 (org-admin scope) | create/publish/open-reg/close-reg/start/complete/cancel/archive; matches & draw mgmt; referee/court assignment; results acceptance |
| TEST_MANAGER (128) | branch-mgr + org scope 35 | schedule/auto-schedule, eligible courts |
| TEST_RECEPTIONIST (129) | receptionist (cash confirm) | confirming a **cash-paid** registration (FIXED price with cash method) |
| TEST_ACCOUNTANT (130) | accountant | tournament finances `/org/:orgId/tournaments/:id/finances` |
| TEST_REFEREE (132) | referee, `referee.assignments.*` | match referee identity; availability/assignments |
| TEST_COACH (131) | coach | (optional) coach tie-ins not used in tournament happy path |
| TEST_PLAYER / TEST_PLAYER2 (133/134) | player | registration + payment (free or sandbox card), match participants |

### A.3 Sport / format / rule-set / bracket
- `sport_id = 19` (court 6 is Padel) — **⏳ confirm 19 maps to a Padel format in `GET /sports/:sportId/formats`**.
- `match_format_id` from the sport's formats (`listSportFormatsCascade` — only non-internal formats surfaced); `rule_set_id` from `sport_rule_sets` (3). **⏳ verify which format/rule-set the sport exposes** at test time.
- `bracket_type_id` from tournament_bracket_types (4) — must equal a `knockout` or `round_robin` bracket (CreateTournamentSchema constrains `format` to `knockout|round_robin`; engine capability check).
- `venue_type = ORGANISATION_COURTS` with `branch_id=21`; `start_date` mandatory; `daily_start_time/end_time` within branch hours (asserted in `assertDailyWindowWithinBranchHours`).

### A.4 Setup / configuration before starting
- Use a **FREE** tournament (`price_type=FREE`) for the first happy path so no Paymob charge is involved; a second **FIXED** (cash + card) scenario for payment/entitlement/accounting coverage.
- All players to register are org-scope-independent (public players) — registration is self-service to org 35 tournament endpoint.
- Ensure feature flag `app.tournaments_enabled` is enabled (verified ON) and (for FIXED) `payment_methods` allows card/cash.

---

## B. HAPPY PATH (end-to-end scenario plan)

Steps reference REAL endpoints (verified paths). Expected DB impact per step is detailed in section E.

| # | Actor | Action (endpoint) | Expected result | Realtime/notif |
|---|---|---|---|---|
| H1 | TEST_ADMIN (127) | `POST /org/35/tournaments` — name TEST_TRAVEL_01, sport 19, bracket (knockout), branch 21, venue ORGANISATION_COURTS, price_type FREE, max_participants 4, min 2, start_date + schedule windows | 2xx; `tournaments` row (status draft), commission snapshot from plan | `tournament:created` ⏳ |
| H2 | TEST_ADMIN | `POST /org/35/tournaments/:id/publish` then `open-reg` | status published → registration_open | `tournament:registration-open` |
| H3 | TEST_PLAYER (133) | `POST /org/35/tournaments/:id/register` | registration `registered`/`confirmed` (FREE → no payment) with `uk_player_competition` uniqueness | `tournament:registration-paid`? ⏳ confirm event name for FREE |
| H4 | TEST_PLAYER2 (134) | same register | confirmed | — |
| H5 | TEST_ADMIN | `GET .../registrations`, then `.../participants` (auto-seeded) | participants created (individuals), status active | `tournament:match-created`? ⏳ on bracket |
| H6 | TEST_ADMIN | `POST .../draw` or `.../generate-groups` (knockout → draw) then `.../draw/approve`/`lock`; `POST .../matches/generate` | tournament_draws/draw_entries + tournament_matches created; `match_format_id`/rule-set frozen | `tournament:bracket-generated` ⏳ |
| H7 | TEST_ADMIN | `GET .../matches/eligible-courts`; `POST .../matches/:matchId/schedule` (court 6) | matches scheduled (start_time set; resource assigned) | `tournament:match-scheduled` ⏳ |
| H8 | TEST_ADMIN | `POST .../matches/:matchId/referee` {refereeId=132} | referee assigned; `tournament_matches.referee_id`; referee sees assignment | `referee` notification ⏳ |
| H9 | TEST_ADMIN | `POST .../matches/:matchId/start` | match status in_progress | `tournament:match-progressed` ⏳ |
| H10 | winner actor (player or admin) | `POST /matches/:matchId/result` (score); then `POST .../result/accept` | result accepted/finalized; participant_members/matches advanced | `match:result-approved` |
| H11 | TEST_ADMIN | `POST .../matches/:matchId/complete` (both matches); final `POST /org/35/tournaments/:id/complete` | standings computed; placements; tournament completed | `tournament:completed` |
| H12 | — | observe `GET .../standings`, `/org/35/tournaments/:id/finances` | `tournament_standings` rows; finances report shows fee=0/commission=0 for FREE | — |

(If FIXED scenario: H3/H4 use card (Paymob sandbox) or cash; confirmation via `registrations/:regId/confirm` (receptionist) or payment webhook; then expect entitlements/ledger — section F.)

---

## C. NEGATIVE TESTS (each with actor + expected status + DB)

| # | Test | Actor | Expected |
|---|---|---|---|
| N1 | Duplicate registration (same player, same tournament/competition) | TEST_PLAYER | rejected (UNIQUE `tournament_registrations(tournament_id,competition_id,player_id)`) |
| N2 | Unauthenticated register | anonymous | 401 |
| N3 | Register by user with no `player` role (e.g. TEST_ACCOUNTANT) | 130 | 403/validation |
| N4 | Unauthorized org modification (create/update tournament on org NOT scoped to actor) | TEST_SELLER 136 (shop org) | 403 (org access guard) |
| N5 | Update/publish another org's tournament | TEST_PLAYER | 403 |
| N6 | Invalid player (deleted/non-existent id) at registration | — | 4xx |
| N7 | Assign non-referee user as referee | TEST_ADMIN w/ user 133 | 4xx (`assignReferee` validates referee role/referees row) ⏳ |
| N8 | Invalid result (score out of format rules; missing sets) | any with submit perm | 4xx validation |
| N9 | Duplicate result submit for same match | winner + admin | second write rejected or idempotent (⏳ verify replace vs duplicate path) |
| N10 | Result modification after finalization | admin `PUT /matches/:id/result` after accept | blocked (state machine) or requires `correct`/admin path ⏳ |
| N11 | Concurrent result submission (two sessions same match) | player + admin | exactly one accepted; no double standings (⏳ verify lock) |
| N12 | Missing required data (no start_date; branch excluded from window; no bracket) | admin | 4xx validation / `assertDailyWindowWithinBranchHours` |
| N13 | Registration after `close-reg`/after deadline | player | 4xx |
| N14 | Cancel tournament (in_progress) vs draft-only cancel; cancel with registrations | admin | business-rule guard ⏳ |
| N15 | Delete tournament while participants/matches exist | admin | blocked (RESTRICT FK) |
| N16 | RBAC: `org:start` without org-admin/branch-mgr scope; `matches.result.manage` absent | player on org route | 403 |
| N17 | Referee disputes/withdraws after accept; admin resolve dispute | referee/admin | transition rules ⏳ |
| N18 | ORGANIZATION access: shop-org admin (136) tries org 35 tournament endpoints | 136 | 403 |

---

## D. REALTIME TESTS
- Use two browser sessions (TEST_ADMIN + TEST_PLAYER) with Socket.IO connected (`/socket.io/`), plus a third session DISCONNECTED then reconnected.
- **Event to observe (⏳ verify exact topics):** registration, bracket-generated, match scheduled/started, result accepted, tournament completed; notification engine in-app delivery (`notification_delivery`) and unread-badge increments.
- Verify **no-refresh UI updates** via `RealtimeCacheUpdater` invalidation (tournament queries), and unread counts.
- Verify **reconnect**: disconnected client re-joins and receives state (or refetch) — note earlier finding: room re-join on reconnect is **⏳ unverified** (see `15_REALTIME_SOCKETIO.md`).
- Verify admin screens reflect registration count/participant list changes live.

---

## E. DATABASE VERIFICATION (per stage — extracted tables)

| Stage | Tables expected to CHANGE / grow | Must stay 0/unchanged | Must NEVER change |
|---|---|---|---|
| Create | `tournaments` (1 row) · `tournament_competitions` ⏳ (default competition) | bookings/orders/payments/ledger | migration_history · users(real) · organisations(real) · permissions · chart_of_accounts |
| Register (FREE) | `tournament_registrations` (+2) · `tournament_participants` (+2) · `tournament_participant_members` ⏳ · `waiting_list` (0) | payments/ledger/entitlements = 0 | same protection set |
| Bracket/draw | `tournament_draws` · `tournament_draw_entries` · `tournament_matches` (+ n) | standings empty until results | — |
| Schedule/referee | `tournament_matches` (start_time, resource_id, referee_id) | — | — |
| Results/standings | `tournament_match_results` · `tournament_match_scores` · `tournament_standings` · `tournament_placements` · `player_ratings`/`player_rating_history`/`elo_ratings` (rating service) | — | — |
| Complete | `tournaments.status=completed` · placements/prizes (`tournament_prize_awards` if prize configured) | — | — |
| Notifications | `notifications`/`notification_delivery` (in-app) | — | — |
| FIXED-payment scenario | `payment_transactions` · `financial_entitlements` (tournament source) · `ledger_entries`/`general_ledger` (tournament source_type) · `settlements` later | wallet untouched (unless wallet pay) | — |

Protected invariants during every stage: real users/orgs/branches/resources/profiles unchanged; `migration_history` 201; permissions 971; global roles 24; KEEP/REVIEW tables from plan 40 unchanged.

---

## F. ACCOUNTING (verified vs expected — ⏳ where unproven)
- **Tournament create:** NO accounting event (pure configuration entity; no ledger/entitlement writes). **State: no accounting impact.**
- **Registration (FREE):** NO accounting posting. **State: no accounting impact.**
- **Registration (FIXED fee, paid):** payment → `payment_transactions` (reference_type `tournament`) → `financial_entitlements` (entitlement_type `ORGANIZATION_ADJUSTMENT` per live data pattern, status PENDING → AVAILABLE via `tournament_entitlement_activation` worker — CARD after gateway settlement, CASH after draw lock) → `ledger_entries` (source_type `tournament`). **⏳ exact DEBIT/CREDIT account codes to be asserted during test (CoA is preserved; query `ledger_entries` immediately after).**
- **Prize payout:** `tournament-prize-award` listener → prize awards + wallet/ledger consequences (if prizes configured). ⏳ verify.
- **Settlement:** postponed phase (unified settlement — separate test).
- If no real fee is charged (FREE path), explicitly expect **zero ledger/entitlement rows** — verify after H-path.

---

## G. PRODUCTION vs LOCAL (environment mapping)
| Test group | Local possible | Production/Sandbox required | Reason |
|---|---|---|---|
| Create/register (FREE)/RBAC/draw/schedule/referee/result/standings | **LOCAL POSSIBLE** | — | no external dependency |
| FIXED fee CARD payment | local (sandbox Paymob) | **PRODUCTION/SANDBOX** for real webhook path | Paymob + `/payments/webhook` |
| FIXED fee CASH confirm | **LOCAL POSSIBLE** | — | receptionist confirm |
| Entitlement activation timing | **LOCAL POSSIBLE** (worker runs) | same logic in prod | — |
| Realtime two-window | **LOCAL POSSIBLE** | — | Socket.IO |
| Notification delivery (in-app) | **LOCAL POSSIBLE** | — | — |
| Webhook late/duplicate | — | **PRODUCTION/SANDBOX REQUIRED** | external gateway behavior |
| Scheduled workers (match deadlines, reminder) | **LOCAL POSSIBLE** | — | cron runs in-process |
| Accounting assertions | **LOCAL POSSIBLE** | — | read ledger |

---

## H. EXPECTED RESULTS PER TEST CASE (template rows)
| TEST ID | Actor | Action | Expected HTTP/UI | Expected DB | Realtime/Notif | Accounting | PASS criteria | FAIL criteria |
|---|---|---|---|---|---|---|---|---|
| T-CREATE-01 | 127 | create FREE tournament | 2xx; appears in org list | `tournaments` 1 row | `tournament:created` ⏳ | none | row+status correct; no ledger | error / ledger row |
| T-REG-01 | 133/134 | register | 2xx each | +2 registrations+participants | reg notification ⏳ | none (FREE) | 2 records; unique guard | duplicate/imposter |
| T-DRAW-01 | 127 | draw+approve+lock+generate matches | 2xx | draws+matches created | bracket notif ⏳ | none | matches = expected bracket count | mismatch/missing |
| T-SCHED-01 | 128 | schedule auto | 2xx | matches start_time+resource | notif ⏳ | none | all matches scheduled | court conflict |
| T-REF-01 | 127 | assign referee 132 | 2xx | referee_id set | referee notif ⏳ | none | assignment visible | 4xx if invalid referee |
| T-STA-01 | 127 | start match | 2xx | status in_progress | match progressed ⏳ | none | status correct | — |
| T-RES-01 | winner/127 | submit+accept result | 2xx | results+scores+advance | result approved | none (FREE) | standings updated; double-submit blocked | dup/orphan |
| T-RTG-01 | — | after results | — | player_ratings/history/elo rows | — | none | ratings derived from results | stale/missing ratings |
| T-CMP-01 | 127 | complete tournament | 2xx | status completed; placements | completed notif | none (FREE) | final standings/placements | not finalized |
| T-FIN-01 | 130 | GET finances | 2xx report | — | — | FREE: all zeros | report shows 0 fee/commission | nonzero unexpected |
| T-NEG-01..18 | various | negative set C | 3xx/4xx | no business rows | no notif | none | rejected + no DB change | created/500 |

(PASS/FAIL criteria per row are explicit above; the same table is used as the live checklist during execution.)

---

## I. CLEANUP (design only — NOT executed now)
- Delete **only** tournament-test records identified by `tournaments.id` (TEST tournament ids) using the plan-40 children-first FK order: `tournament_match_scores → tournament_match_results → tournament_standings → tournament_matches → tournament_draw_entries → tournament_draws → tournament_placements → tournament_prize_awards → tournament_participant_members → tournament_participants → tournament_registrations → waiting_list rows(if any) → competition rows → tournament row`. Also related payment/entitlement/ledger/notification rows referencing those ids.
- Preserve: TEST identities (126–136), TEST_ORG(35)/branch(21)/court(6), TEST_SHOP(36), all KEEP configuration/master data, and ALL real data.
- IF paid path was used: refund/clear payment_transactions + entitlements + ledger rows for the TEST tournament ids (same FK order).
- Re-run the post-cleanup validations used in `45` (CLEAR=0 for derived business tables; KEEP/REVIEW unchanged; migration 201).

---

## J. RISK RANKING
| Priority | Test | Why |
|---|---|---|
| **P0** | T-REG-01 uniqueness/impostor · T-NEG-01/02/04/05/16 RBAC & org-isolation | data-integrity + tenancy — cheapest high-value discovery |
| **P0** | T-RES-01 double-submit/result-finalization (N9–N11) | core state machine; protection of standings/ratings |
| **P0** | T-FIN-01 accounting zero-assertions on FREE path | catches hidden postings early |
| **P1** | T-DRAW-01/T-SCHED-01 bracket & court scheduling | medium complexity, deterministic |
| **P1** | FIXED-fee card/cash + entitlement activation (F) | requires sandbox webhook; medium |
| **P1** | Realtime two-window + notifications + unread | UX-critical, often breaks |
| **P2** | T-RTG-01 ratings/ELO · prize award · refund/dispute negative | downstream; lower immediate risk |
| **P2** | Completed-state archival/cancel/deletion negative | edge state machine |

---

## K. EXECUTION ORDER (recommended; stops after failures)
1. FREE tournament create + publish/open (T-CREATE-01) — prove creation + no-accounting invariant.
2. FREE register ×2 (+ N1 duplicate, N2/N3 auth/RBAC, N4/N5 org isolation) — identity + tenancy + uniqueness (P0).
3. Draw/bracket/groups + matches (P1) — biggest engine surface.
4. Schedule + court eligibility + referee assignment (incl. N7 invalid referee).
5. Match start → result submit → accept (incl. N8–N11 result negatives) + standings + ratings (P0 core).
6. Complete + placements + finances assertions (FREE: all zeros) + N13–N18.
7. FIXED scenario: cash confirm (receptionist) + card (sandbox) → entitlements → ledger assertions (P1, needs sandbox webhook).
8. Realtime two-window + notifications + reconnect (D) + prize/refund/dispute (P2).
9. Cleanup (I) then run the `45`-style Post-cleanup validation.

Priority rationale: steps 1–6 expose architecture/business-logic defects (tenancy, state machine, absence of hidden accounting) before consuming the remaining scenarios; paid/webhook (7) and realtime (8) are independent follow-ups; cleanup (9) is last, and only after all assertions pass.

---

```
TOURNAMENT TEST PACK:
READY
```

**Why READY:** all preconditions are in place and verified (TEST identities/ORG/branch/court 6, subscription plan 3 active, master data 16 sports / 3 formats / 3 rule-sets / 4 bracket types, feature flags ON), and the pack is built exclusively on endpoints/services/tables extracted from the current code (org-tournament, match-result, participant-draw, rating, tournament-finances) and the live schema. Items explicitly flagged **⏳ VERIFY-IN-TEST** (bracket format mapping, exact socket topics, event names, accounting DEBIT/CREDIT amounts, result-finalization locks, reconnect room re-join) are deliberate verification points, not assumptions — the first execution of steps B/C will turn them from "expected" into "proven".

**NOT executed:** nothing was created; no code/DB/config changed. Awaiting approval to begin execution (recommended to start with K-order steps 1–6).