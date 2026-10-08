# Tournament Result Contract

> Step 3E — Result contract / API parity for the future Hub Results management view.
> Repository state: post `d14ea250` (Step 3C) + this step. **Frontend Results UI is NOT implemented here.**

## 1. Objective

Prepare the backend contract so Tournament Hub → Matches → Results can become a tournament-scoped management view WITHOUT creating a second result engine. The shared `match_result_records` module remains authoritative for the result lifecycle, approval, dispute, correction, withdrawal, history and audit. This step only verifies the existing canonical APIs carry everything the Hub needs, performs the smallest safe permission-gate correction, and documents the contract.

## 2. Existing Canonical Result APIs

| Operation | Method + Endpoint | Permission | Service | Consumers |
|---|---|---|---|---|
| Submission | `POST /matches/:id/result` | `matches.result.submit` | shared `match-result.service` | `MatchResultPage`, Hub/standalone modals (via `POST /admin/tournaments/matches/:matchId/result` → `recordSharedResult`) |
| Acceptance/approval | `POST /matches/:id/result/accept` | `matches.result.accept` | shared service | `MatchResultPage` |
|  | `POST /admin/match-results/:resultId/resolve` | `matches.result.manage` | shared service (`resolveDispute`) | `Admin/OrgMatchResultsPage` |
| Rejection | `resolve` with `approve:false` (no-result resolution) | `matches.result.manage` | shared service | Admin/Org Results |
| Dispute | `POST /matches/:id/result/dispute` | `matches.result.dispute` | shared service | `MatchResultPage` |
| Correction | `PUT /admin/match-results/:resultId/correct` | `matches.result.manage` | shared service (`correctResult`, ko-correction guard) | Admin/Org Results |
| Withdrawal | `POST /matches/:id/result/withdraw` | `matches.result.submit` | shared service | `MatchResultPage` |
| Replacement | `PUT /matches/:id/result` | `matches.result.manage` | shared service | `MatchResultPage` |
| History | `GET /me/results` | `matches.view` | shared service | `MatchResultHistoryPage` |
| Detail | `GET /matches/:id/result` | `matches.view` | shared service | `MatchResultPage`, lobby, Drawer (`resultRecord`) |
| List (admin) | `GET /admin/match-results?status=` | `matches.result.manage` | shared service | `AdminMatchResultsPage` |
| List (org) | `GET /org/:orgId/match-results?status=` | `org.matches.results.view` | shared service (`listForOrg`) | `OrgMatchResultsPage` |

Statuses (authoritative): `pending_confirmation | approved | disputed | withdrawn | no_result`; outcome: `completed | retired | walkover | forfeit | abandoned | no_result | disputed`.

## 3. Match-to-Result Relationship

- `tournament_matches.match_id` → shared `matches.id`; the shared match owns exactly one current result row in `match_result_records` keyed by `match_id` (a correction/replacement updates the same record; per-match history is preserved via `audit_logs` + notification audit trail).
- **Latest result** is resolved safely with a scalar subquery on `match_result_records` ordered `id DESC LIMIT 1` per `match_id` — this is already implemented in the canonical tournament match API (Step 3B, `fc0c1fa0`) and exposed as `result_id` + `result_status`.
- Withdrawn/disputed records: the scalar subquery picks the latest row regardless of state, so `result_status` reflects the actual current state (e.g. `disputed` or `no_result`); it never fabricates an “approved” for a withdrawn/disputed record.
- No database change; the relationship is read-only for this step.

## 4. Hub Result Requirements

The Hub Results segment needs (all already present in the Step 3B canonical match API or existing shared APIs):

- `match_id` (shared) + `result_id` + `result_status` — **present** on every row of `GET /admin/tournaments/:id/matches` (org mirror).
- score/result summary — `score_summary` (present); full record via existing `GET /matches/:id/result`.
- winner — `winner_id`/`winner_participant_id`/`score_summary` (present).
- submission state — `result_status` (present).
- timestamps — on the shared record (`submittedAt`/`updatedAt` etc.) via `GET /matches/:id/result`; not re-added to the match row.
- participant names + stage/group context — `player/participant*_name`, `stage_name`, `group_name`, `stage_progression_format` (present).
- permission-aware actions — the Hub already gates with `tournament.result.manage` / `org.tournaments.result.manage`.

**Conclusion: the existing APIs are SUFFICIENT. No new tournament-specific result API is required.**

## 5. Result Submission

Unchanged shared lifecycle: submit → `match_result_records` row with `submission_status='pending_confirmation'`; the match completes only when the result resolves; status transitions are guarded by the shared service; events emitted (`match:result-submitted` etc.); progression triggered on approval by `tournament-progression.listener` (`handleProgressionEvent`). The Hub must (and will) call the existing endpoints.

## 6. Result Acceptance

Canonical acceptance = `POST /matches/:id/result/accept` (`matches.result.accept`, participant/opponent) or admin/org `resolve` (`matches.result.manage`). Approval is NOT moved into a Hub backend; the future Hub UI may invoke these existing endpoints.

## 7. Dispute and Correction

Per the audit: dispute/correction/withdrawal management stays in the shared module (Admin/Org Match Results, `MatchResultPage`). No tournament-scoped dispute/correction endpoints are introduced. The Hub Results segment only returns enough context (`result_id`, `match_id`, `result_status`) to provide a contextual link into the shared module.

## 8. DynamicResultForm Contract

`components/match-result/DynamicResultForm.tsx` needs: current rules (`rulesSnapshot`/`GET /sports/:sportId/formats`), existing `rawResult`, participants, score structure, and submission mode (submit/replace/correct). The Hub can reuse it directly with data already available via the canonical match row (`rule_snapshot`, `match_id`) plus the shared record (`GET /matches/:id/result`). No rewrite.

## 9. Permissions

No backend permission changed. Frontend correction performed in this step (Hub only):
- **Before:** bracket-tab “Record Result” gated by frontend-only `tournaments.enter_scores` (stale; not a backend key).
- **After:** gated by the authoritative `tournament.result.manage` / `org.tournaments.result.manage` (same keys `MatchesManager` already uses; no new permission, no weakened backend).

The player-facing consumer page “Enter Score” still uses `tournaments.enter_scores` — out of scope (that flow targets the shared player submission surface) and documented as a remaining limitation.

## 10. Organization Scoping

- Admin = global; Org = `org.matches.results.view` list + org-scoped `matches.result.manage` actions; server restricts org lists to `bookings.organisation_id = orgId` and verifies tenant ownership on actions.
- Tournament org context reuses `assertOrgOwnsTournament` on every org tournament route (including the canonical matches endpoint). The Hub result flow stays tenant-scoped; no endpoint accepts arbitrary org/tournament combinations.

## 11. Data Exposure

The Hub contract exposes only what its role needs: `result_id`, `result_status`, `score_summary`, winner info, participant names, stage/group context. Staff-only metadata (submitter/approver identity, dispute/resolution notes, deadlines, rating/evidence internals) is NOT added to the tournament match row; it stays on the staff-only shared record/audit surfaces. No private fields added.

## 12. API Compatibility

Additive-only: this step adds **no** new response fields, renames, removals, envelope changes, or semantic changes. Public/player contracts untouched.

## 13. Database Impact

**No database change required.** The existing schema (`match_result_records`, `match_result_participants`, `match_sessions`, `tournament_matches`, audit tables) fully supports the Hub Results architecture.

## 14. Tests

No new backend API → no new backend endpoint tests required. Demonstrated sufficiency by running the existing suites:
- Tournament canonical match contract tests (Step 3B) — prove `result_id`/`result_status` are on the match rows.
- Match-result module suite — proves the shared lifecycle is unchanged.
- Frontend Hub suite — proves the aligned permission gate does not break Hub behavior.
- Full backend unit suite — no regressions.

## 15. Known Limitations

- The player-facing consumer tournament page still uses the stale `tournaments.enter_scores` key (different flow/RBAC target) — documented for the UI integration step.
- The Hub Results segment remains a thin attention list (Steps A/B of the plan will add management actions reusing the shared endpoints).
- Realtime parity (result events already published; GSK generation events still gapped) is a later phase.
- Subscription-mode detail is still only via the shared `GET /matches/:id/result`.

## 16. Next Step

Step 3F (UI integration): build the tournament-scoped Hub Results management view that reuses `DynamicResultForm` + the existing shared result endpoints, keep the shared module for dispute/correction/history, and align remaining stale gates. This step explicitly does NOT implement that UI.