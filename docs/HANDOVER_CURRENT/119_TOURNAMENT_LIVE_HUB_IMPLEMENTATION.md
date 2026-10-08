# Tournament Live Hub Implementation

> Step 3G implementation — polished Tournament-scoped **Live** experience inside Hub → Matches. Repository state: `f1f245ec` + this step.

## 1. Summary

The **Live** segment of `MatchesManager` is now a polished tournament-scoped operational view split into **Live Now** (in-progress) and **Starting Soon** (scheduled matches whose authoritative `start_time` is within the next 60 minutes and not in the past — presentation-only grouping, no invented state). All existing per-row actions remain (Details, View Result, Record Result, Accept Result, Start, Complete, Court, Referee, Schedule, Open Monitoring), each gated by the authoritative permissions from Steps 3E/3F. No backend, API, permission, DB, or realtime changes; the existing singleton socket + Step 3H invalidation is reused — a second Socket.IO client was **not** created.

## 2. Exact Files Changed

| File | Change |
|---|---|
| `frontend/src/components/tournaments/hub/MatchesManager.tsx` | Live Now / Starting Soon sections, empty states, section headers, View/Accept extended to Live, `isStartingSoon` helper |
| `frontend/src/i18n/translation-keys.registry.ts` | `live_now`, `starting_soon`, `no_live_now`, `no_starting_soon` keys |
| `frontend/src/components/tournaments/hub/__tests__/MatchesManager.spec.tsx` | 31 → 43 tests (Live suite + one updated segment-empty test) |
| `docs/HANDOVER_CURRENT/119_TOURNAMENT_LIVE_HUB_IMPLEMENTATION.md` | This document |

No backend/DB/realtime/Monitoring changes.

## 3. Live Segment Architecture

- Reuses the single canonical match fetch and the existing row/card renderer (no duplicate implementations).
- Live segment membership: `isInProgress(m)` (status or shared_status) OR `isStartingSoon(m)` (status `scheduled` with a valid `start_time` within `(now, now+60min]`).
- Rendering groups rows into **Live Now** (in-progress) first, then **Starting Soon**, greeting the first row of each group with a section heading; when a group is empty the matching empty state is shown (no fabricated "live" data).
- Stage/group context comes from the canonical API (`stage_name`, `stage_progression_format`, `group_name`).

## 4. Live / Starting Soon Behavior

- Live Now shows in-progress matches with score, status (text+badge), stage/group, schedule, court, referee.
- Starting Soon shows only scheduled matches with an authoritative near-future `start_time`; past/far-future scheduled matches are excluded (safe, no fabricated timing).
- Empty states: "No matches are currently live." / "No matches are starting soon."

## 5. Actions and Permissions

All existing actions, gated by the authoritative keys:
- Details → universal Drawer; View Result (results + live, shared record via existing `/matches/:id/result`) ; Record Result → `tournament.result.manage`/`org.tournaments.result.manage`; Accept Result → `matches.result.accept`; Start/Complete/Court/Referee → `tournament.manage`/`org.tournaments.manage`; Schedule → existing schedule route; Open Monitoring → existing shared workbench.
- No new permissions; lifecycle-state conditions unchanged (Start shows for `shared_status==='closed'`, Complete for in-progress/completed).

## 6. GSK Behavior

- Group stage: `stage_progression_format='round_robin'` with `group_name` chip.
- Knockout: `stage_progression_format='knockout'`, no group chip, stage label shown.
- No qualification/standings/progression/winners computed client-side — the backend remains authoritative and the Step 3H invalidation refreshes these queries.

## 7. Monitoring Link Behavior

"Open Monitoring"/"Live Monitoring" remains a contextual link to the shared Admin/Org workbench (`/admin/matches`, `/org/:orgId/matches`); the global Monitoring system is **not** embedded or duplicated.

## 8. Realtime Reuse

No new socket logic. The Hub reuse chain from Step 3H remains: events → allowlist → mapper → singleton client → `useRealtimeCacheUpdates` → `invalidateTournamentHub` → refetch of `['tournament-matches', id]` / org variants / bracket / standings. Same query keys, one client.

## 9. Mobile UX

Live uses the existing responsive stacked cards (no list-level horizontal scroll), 44px targets, text+badge status (not color-only), and the same a11yDialog patterns for modals. Section headings collapse naturally on small screens.

## 10. Accessibility

Semantic buttons with text labels, `aria-pressed` segments, visible focus, status conveyed by text plus badge, existing `Modal(a11yDialog)` for result flow, reduced-motion untouched.

## 11. Tests and Exact Results

`MatchesManager.spec.tsx`: **43/43** (existing 31 preserved, incl. updated generic segment-empty test; +12 Live tests: in-progress rendering + stage/group + knockout + score + status; starting-soon within window; past start excluded; no-live and no-starting-soon empty states; Start gated by `tournament.manage`; Start/Complete/Court/Referee hidden without manage; Complete called via existing API; Record Result hidden without result.manage; Accept gated by `matches.result.accept` calling canonical API; Open Monitoring link; no second Socket.IO client (source regression guard)). Full tournament frontend suite: **333 passed / 28 files**; `npm run build` green.

## 12. Build Result

`tsc -b + vite build` success (only standard warnings).

## 13. Docker Result

Frontend image rebuilt; `docker compose up -d` containers running/healthy.

## 14. Health Result

Frontend SPA HTTP 200; backend `/health` ok (db ok, redis ok); mysql/redis healthy.

## 15. Database Confirmation

**No database changes** — no migrations/schema/seeds; only the intended files changed.

## 16. Git Commit

`<commit-hash>` — "feat(tournaments): polish live matches hub".

## 17. Git Push

Pushed to `origin/master`.

## 18. Remaining Limitations

- "Starting Soon" is a presentation grouping using the authoritative `start_time` and the device clock (±60 min); it does not add server-side scheduling semantics.
- Schedule remains on the standalone page (entry point only); standalone `TournamentMatchesPage`/`TournamentSchedulePage`/Monitoring remain active during transition.
- Accept is shown for `pending_confirmation` in Live/Results where the role holds `matches.result.accept`; advanced dispute/correction stay in the shared module.

**Explicit confirmations:** Live is tournament-scoped · Global Monitoring remains shared · No duplicate Monitoring engine · No new API · No DB changes · No new permissions · No new realtime system · Existing realtime invalidation (Step 3H) is reused · Backend remains authoritative · GSK engine remains unchanged.