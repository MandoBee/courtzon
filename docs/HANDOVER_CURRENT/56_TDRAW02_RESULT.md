# 56 — T-DRAW-02 RESULT (Draw Approve + Lock — Tournament 4 / Draw 1)

**Executed:** 2026-10-05 ~23:2x UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · Competition 4 · Draw 1**
**Scope:** T-DRAW-02 ONLY (approve → lock). No matches/scheduling/referee/results/cleanup.

---

## 1. Real API extracted from code
| Step | Method / Path | Guard |
|---|---|---|
| APPROVE | `POST /org/:orgId/tournaments/:id/draw/approve` | `requireOrgScopedPermission('org.tournaments.manage')` (owner passes) |
| LOCK | `POST /org/:orgId/tournaments/:id/draw/lock` | `requireOrgScopedPermission('org.tournaments.manage')` |

## 2. APPROVE (actual)
Request: `POST https://api.courtzon.cloud/org/35/tournaments/4/draw/approve` — body `{}`
Response: **HTTP 200** → draw status **approved**, is_current 1, validation valid, entries unchanged (2).

## 3. LOCK (actual)
Request: `POST https://api.courtzon.cloud/org/35/tournaments/4/draw/lock` — body `{}`
Response: **HTTP 200** → draw status **locked**, is_current 1, validation valid, entries unchanged (2).

## 4. DB verification (direct)
| Check | Actual | Status |
|---|---|---|
| draw 1 row | status `locked` · validation `valid` · is_current **1** · draw_seed 1791155711725 (unchanged) | ✅ |
| entries | **2** (participant 3 → pos 0 · participant 4 → pos 1; seed_number null — no explicit seeds changed) | ✅ |
| duplicates (draw/position) | 0 | ✅ |
| matches | **0** (never generated — `/matches/generate` not executed) | ✅ |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 (FREE) | ✅ |
| notifications | 18 (unchanged — OBSERVED; bus events emitted, no in-app row) | OBSERVED |
| audit_logs | 3 rows: `TOURNAMENT.DRAW_GENERATED` → `DRAW_APPROVED` → `DRAW_LOCKED` (entity 1) | ✅ |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) | ✅ |

## 5. Verdict
```
T-DRAW-02: PASS

APPROVE: HTTP 200 (status approved)
LOCK:    HTTP 200 (status locked)
Draw 1: locked · is_current 1 · entries 2 (pos 0 ← participant 3, pos 1 ← participant 4) · no duplicates
Matches: 0 · Financial: 0/0/0/0 · Real data unchanged
```

**Stopped after T-DRAW-02.** `/matches/generate`, scheduling, referee assignment, start/results, and cleanup NOT executed. Awaiting your instruction.