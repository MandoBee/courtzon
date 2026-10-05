# 52 — TOURNAMENT REGISTRATION GATE (H2: Publish / Open Registration)

**Executed:** 2026-10-05 ~22:44 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3` · **Tournament ID 4** (`TEST_TOURNAMENT_T001`) · Actor: TEST_ADMIN (user 127 / org 35)
**Scope:** H2 only (registration gate setup). No player registration, no draw/scheduling/matches/results, no cleanup, no schema/migration/config change.

---

## 1. Code-derived endpoints & RBAC (verified, not assumed)
| Step | Method / Path | Guard (permission) | Passes for TEST_ADMIN? |
|---|---|---|---|
| publish | `POST /org/:orgId/tournaments/:id/publish` | `requireOrgScopedPermission('org.tournaments.publish')` | ✅ (owner-first org-scope check: TEST_ADMIN is owner of org 35) |
| open registration | `POST /org/:orgId/tournaments/:id/open-reg` | `requireOrgScopedPermission('org.tournaments.update')` | ✅ |

## 2. Request/Response actually executed (credentials redacted)
- `POST https://api.courtzon.cloud/org/35/tournaments/4/publish` — body `{}` → **HTTP 200**; `status: "published"`.
- `POST https://api.courtzon.cloud/org/35/tournaments/4/open-reg` — body `{}` → **HTTP 200**; `status: "registration_open"`.
- Response also re-confirms: org 35, branch 21, FREE / EGP, commission 20.00, knockout / bracket 1, sport 19, draw_seed assigned, registration_payment_methods [cash, card].

## 3. State transitions
| Item | Before | After |
|---|---|---|
| tournament 4 status | draft | **registration_open** (via published) |
| organisation_id | 35 | 35 |
| price_type / entry_fee | FREE / 0.00 | FREE / 0.00 |

## 4. DB verification (direct, read-only)
| Check | Actual |
|---|---|
| registrations / participants | 0 / 0 (no new rows) |
| payment_transactions / invoices | 0 / 0 |
| ledger_entries / financial_entitlements | 0 / 0 |
| notifications | 18 (UNCHANGED — no in-app row created by publish/open-reg) |
| real users (non-TEST) | 28 (unchanged) |
| real organisations (≠35/36) | 17 (unchanged) |
| permissions / migration_history | 971 / 201 (unchanged) |

## 5. Notification / realtime observation
- **In-app:** no new `notifications` row was created by publish/open-reg (count still 18). The notification engine may consume `tournament:registration-open` on the event bus, but no in-app delivery row was observed at this step.
- **Realtime:** no client sessions exist to observe live socket delivery; no observable server-side room/event row. OBSERVED (nothing generated at DB level; a client with an open socket would be the next verification point during T-REG).

## 6. Verdict
```
H2 (Publish / Open Registration): PASS

Endpoint+method actually used:
  POST /org/35/tournaments/4/publish   (HTTP 200 → published)
  POST /org/35/tournaments/4/open-reg  (HTTP 200 → registration_open)

Before: draft
After : registration_open (org 35, FREE)

DB impact: tournaments.status changed draft→registration_open (+draw_seed set); no registrations/participants/payments/invoices/ledger/entitlements; real data unchanged.
Notification/realtime: no new in-app notification row (count 18, unchanged); socket delivery not observable without a live client.
```

**Stopped after H2.** No player registered; no draw/scheduling/matches/results executed; no cleanup; tournament 4 is now in the state required by the real player route `POST /tournaments/4/register` (per T-REG-01 next step). Awaiting your instruction.
## Re-confirmation (read-only, second handover pass)

**Timestamp:** 2026-10-05 ~22:5x UTC — read-only reconfirmation of the H2 goal state.
| Check | Value |
|---|---|
| tournament id / org / price_type | 4 / 35 / FREE (status registration_open) |
| registrations / participants | 0 / 0 |
| payments / invoices / ledger / entitlements | 0 / 0 / 0 / 0 |
| notifications | 18 (unchanged) |
| real users / real orgs / permissions / migrations | 28 / 17 / 971 / 201 (unchanged) |

H2 was executed in the previous pass; Tournament 4 already satisfies the precondition for the player route `POST /tournaments/4/register`. No redundant re-execution performed.
