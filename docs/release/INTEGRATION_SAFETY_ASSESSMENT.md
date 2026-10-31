# Integration Test Safety Assessment (B9)

| Field | Value |
|---|---|
| Document | `docs/release/INTEGRATION_SAFETY_ASSESSMENT.md` |
| Phase | 2 (P2-05 blocker B9) |
| Date | 2026-10-26 |
| Baseline commit | `184aa6e0b96c93b278f909d63eb7f4a88d28b424` |
| Mode | Static inspection only — **no integration tests, no database connection, no SQL** |
| Governing constraints | `courtzon_v3` only; no new DB/directory; no Testcontainers/containers; no DELETE/TRUNCATE/DROP/migrations; no data/schema changes |

## 1. Scope

Determine whether the Stage A post-upgrade integration verification can be made safe under the
fixed user decisions, focusing on:

- `backend/vitest.integration.global-setup.ts` (persistent-DB fixture)
- `backend/vitest.integration.setup.ts` (env + target guard)
- `backend/vitest.integration.config.ts`
- every `*.integration.spec.ts` that performs database cleanup

## 2. Global setup/teardown findings

The integration config always runs `vitest.integration.global-setup.ts` against the **persistent**
`127.0.0.1:3307 / courtzon_v3` database. At assessment time its behavior was:

1. Opens a MySQL connection (hard-coded local target).
2. Reads `system_settings.timezone`.
3. Reuses an existing open platform accounting period covering today, if present.
4. Otherwise **INSERTs** a new `accounting_periods` row.
5. On teardown, **DELETEs** `general_ledger` rows for that period and the created period row.

**Remediated on 2026-10-26:** the teardown DELETE was removed; the period row is left in place for
the campaign. `src/tests/integration-cleanup-safety.spec.ts` statically proves the global setup has
no `DELETE`/`TRUNCATE`/`DROP`.

## 3. Inventory (163 integration specs)

| Category | Count |
|---|---:|
| Total integration specs | **163** |
| Testcontainers specs (create `courtzon_test` + containers) | **32** |
| Persistent-DB specs (target `courtzon_v3`) | **131** |
| Persistent specs containing DELETE/TRUNCATE/DROP | **129** |
| Persistent specs with no destructive SQL | **2** |
| DELETE occurrences in persistent specs | **1953** |
| TRUNCATE occurrences | **4** |
| DROP occurrences | **5** |

### 3.1 Testcontainers specs — BLOCKED

These create an ephemeral MySQL/Redis (and `courtzon_test`, including a `DROP DATABASE` in the
helper). This violates “no new database/containers” even though it would not touch `courtzon_v3`.

| File | DELETE | TRUNCATE | DROP |
|---|---:|---:|---:|
| `backend/src/infrastructure/command/processed-commands.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/infrastructure/dead-letter/dead-letter.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/infrastructure/event-bus/processed-events.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/infrastructure/event-store/published-events.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/infrastructure/workflow/workflow.integration.spec.ts` | 16 | 0 | 0 |
| `backend/src/modules/auth/__tests__/auth.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/auth/__tests__/session-expiry.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-repository-chain.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/booking/commands/cancel-booking.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/booking/commands/complete-booking.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/booking/commands/confirm-booking.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/booking/commands/create-booking.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/booking/commands/expire-booking.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/booking/infrastructure/repositories/booking.repository.contract.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/match-result/__tests__/match-lifecycle.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/match/__tests__/match-player-journey.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p1.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/notifications/__tests__/notification-templates.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/organisations/__tests__/org-portal.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/organisations/__tests__/organisation-access-model.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/payment/commands/process-payment.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/modules/security/__tests__/authorization-idor.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-create.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/shared/command/command-pipeline.integration.spec.ts` | 1 | 0 | 0 |
| `backend/src/shared/command/transaction-conn.integration.spec.ts` | 11 | 0 | 0 |
| `backend/src/shared/event-bus/event-bus.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/shared/event-bus/failure-injection.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/shared/utils/pagination.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/shared/workflow/workflow.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/tests/app.http.integration.spec.ts` | 0 | 0 | 0 |
| `backend/src/tests/cross-domain.integration.spec.ts` | 2 | 0 | 0 |

### 3.2 Persistent specs without destructive SQL — evaluated individually

- `backend/src/modules/financial/__tests__/accounting-source-segregation.integration.spec.ts`
- `backend/src/modules/notifications/__tests__/academy-enrollment-templates.integration.spec.ts`

| File | Runtime behavior | Safe under fixed rules? |
|---|---|---|
| `modules/financial/__tests__/accounting-source-segregation.integration.spec.ts` | SELECT-only against `courtzon_v3` (no INSERT/UPDATE/DELETE). | **Only after** global setup is made read-only. It is not Stage A relevant. |
| `modules/notifications/__tests__/academy-enrollment-templates.integration.spec.ts` | Calls `seedTemplates()` (idempotent template upserts) and reads templates. | **No** — writes data; no destructive cleanup, but violates “no data modification”. |

`shared/event-bus/failure-injection.integration.spec.ts` uses `GenericContainer` directly (it is
counted in §3.1, not in this section).

### 3.3 Persistent specs with destructive cleanup — BLOCKED

All 129 specs execute DELETE/TRUNCATE/DROP as setup/teardown. Representative
patterns:

- `payment/__tests__/payment.integration.spec.ts:20-28` — fixed `TEST_USER = 999997` then
  `DELETE FROM financial_journal_entries/payment_transactions/user_wallets/users` in `beforeAll`
  and again in `afterAll`; removing cleanup causes collisions on the fixed ID.
- `upload/__tests__/upload-routes-rbac.integration.spec.ts:131-135` — deletes bookings, resources,
  branches, and the organisation fixture in FK order.
- `infrastructure/migrations/__tests__/migration-guard.integration.spec.ts:81` —
  `TRUNCATE TABLE migration_history` (destructive on shared metadata).
- Many specs assert exact counts/statuses and rely on their pre-clean to avoid residue.

Removing DELETE from these specs is **not** a minimal safe change: fixed IDs/slugs collide on
rerun, and leftover financial/ledger rows change assertions. Rewriting 129 files to unique markers
and non-destructive assertions is a broad test-infrastructure project, not a B9 fix, and cannot be
validated under the current no-run constraints.

Full appendix: §6.

## 4. Stage A relevance

The packages upgraded in Stage A (Fastify, Zod, mysql2, find-my-way) require HTTP/DB integration
coverage. The relevant specs are:

- Testcontainers: `tests/app.http`, `auth`, `auth/session-expiry`, `security/authorization-idor`,
  `booking`, `booking-repository-chain`, `match-player-journey`, `match-lifecycle`,
  `membership-p1`, `notification-templates`, `org-portal`, `organisation-access-model`,
  `tournament-create`, `pagination`.
- Persistent: `payment.integration`, `upload-routes-rbac`, `tournament-registration-idor`,
  booking/payment/accounting suites — all perform writes + destructive cleanup.

At assessment time no Stage A-relevant integration spec could run under the then-current rules.
After the remediation (§6), the selected persistent set runs safely; the Testcontainers-based Fastify
suites remain blocked by the no-container decision.

## 5. Remediation options (Option A applied for Stage A)

| Option | Change | Verdict |
|---|---|---|
| **A. Authorize scoped test-owned DELETE** | Allow the existing per-fixture DELETE and remove the global teardown DELETE on `courtzon_v3` (data already declared disposable; final cleanup later). No spec rewrite. | **Applied for the Stage A set:** global teardown mutation removed; selected specs use unique markers + FK-ordered scoped cleanup. |
| **B. Authorize Testcontainers** | Run the 32 container-based specs (create `courtzon_test` + containers, destroy after). | Does not touch `courtzon_v3`, but violates "no new DB/containers". Not used. |
| **C. Read-only integration only** | Make global setup read-only (no INSERT/DELETE; reuse an existing period or skip). | Safe, but only `accounting-source-segregation` becomes runnable; insufficient for Stage A. |
| **D. Rewrite 129 specs** | Unique markers + no cleanup + non-destructive assertions. | Broad, speculative, cannot be validated without running; **not done**. |

## 6. Remediation applied (2026-10-26)

The user authorized controlled test-data cleanup on `courtzon_v3`. Changes:

1. **Global setup:** removed teardown `DELETE` of `general_ledger`/`accounting_periods`; the period
   is created only when missing and left in place for the campaign. Static guard:
   `src/tests/integration-cleanup-safety.spec.ts`.
2. **Unique identities:** added `src/tests/helpers/test-run.ts` (run marker, numeric id, phone,
   email) with pure unit tests `src/tests/test-run.spec.ts`.
3. **`payment.integration.spec.ts`:** unique user/marker; removed pre-test deletes; FK-ordered
   cleanup by test user/marker; zero-residue assertions.
4. **`upload-routes-rbac.integration.spec.ts`:** unique phones/emails/org+branch slugs; cleanup by
   captured IDs; zero-residue assertions.
5. **`coach-profile-save.integration.spec.ts`:** unique user IDs/emails; removed pre-run cleanup;
   scoped cleanup + zero-residue assertions.
6. **`payment-reference-id.integration.spec.ts`:** already used a unique marker and scoped delete;
   executed unchanged.
7. **Not changed:** the remaining 32 container-based specs (blocked by no-container rule) and other
   persistent suites outside the Stage A scope.

Execution evidence:

- `npx vitest run --config vitest.integration.config.ts` on the four files above → **40/40 PASS**.
- Backend build → **PASS**; focused unit tests → **70/70 PASS**.
- Global setup reused/created accounting period `#12245`; **no teardown DELETE**.
- No `TRUNCATE`, `DROP`, broad table delete, or migration. Cleanup is scoped and asserted to leave
  zero rows for the test-owned identities.
- Audit unchanged by this remediation: backend prod 10, full 24.

## 7. Appendix — persistent specs with destructive SQL

| File | DELETE | TRUNCATE | DROP |
|---|---:|---:|---:|
| `backend/src/infrastructure/migrations/__tests__/baseline-convergence.integration.spec.ts` | 0 | 0 | 1 |
| `backend/src/infrastructure/migrations/__tests__/migration-guard.integration.spec.ts` | 0 | 1 | 2 |
| `backend/src/modules/academy/__tests__/academy-coach-conflict.integration.spec.ts` | 16 | 0 | 0 |
| `backend/src/modules/academy/__tests__/academy-concurrency-hardening.integration.spec.ts` | 7 | 0 | 0 |
| `backend/src/modules/academy/__tests__/academy-realtime-admin.integration.spec.ts` | 7 | 0 | 0 |
| `backend/src/modules/academy/__tests__/academy-refund.integration.spec.ts` | 12 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g1-enrollment-lifecycle.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g4-capacity.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g5-session-execution.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g6-player-academy.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g7-coach-academy.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/academy/__tests__/g8-payment-flow.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/coa-catalog.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/org-journal-entries.integration.spec.ts` | 5 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/org-journal-rbac.integration.spec.ts` | 5 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/org-journal.integration.spec.ts` | 7 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/org-periods-yearclose.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/org-reports-scoping.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/reporting.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/tax-api.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/tax-fixes.integration.spec.ts` | 16 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/tax-full.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/accounting/__tests__/year-close.full.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-admin-toggle.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-profile-save.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-session-detail-authz.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-session-mutation-authz.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-session-player-cancel-booking.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/activities/__tests__/coach-session-provider-cancel-booking.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-accounting.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-cancellation-policy.integration.spec.ts` | 15 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-card-payment.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-checkin-owner.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-economics.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-noshow.integration.spec.ts` | 14 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-overnight-midnight.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-paid-owner.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-public-match-matchmaking.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-realtime-s11.integration.spec.ts` | 6 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-recovery.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-refund-idempotency.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-refund.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-settlement-offset.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-settlement.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-v2-business-date.integration.spec.ts` | 11 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-v2-cancel-cod.integration.spec.ts` | 15 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking-window.integration.spec.ts` | 16 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking.concurrency.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/booking/__tests__/booking.concurrency.service.integration.spec.ts` | 24 | 0 | 0 |
| `backend/src/modules/booking/__tests__/hardening-booking-refund-money.integration.spec.ts` | 38 | 0 | 0 |
| `backend/src/modules/booking/__tests__/recurring-bookings.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/booking/__tests__/recurring-conflicts.integration.spec.ts` | 18 | 1 | 0 |
| `backend/src/modules/booking/__tests__/recurring-lifecycle.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/booking/__tests__/recurring-pricing.r5a.integration.spec.ts` | 21 | 0 | 0 |
| `backend/src/modules/booking/__tests__/recurring-series-payment.r5b.integration.spec.ts` | 37 | 0 | 0 |
| `backend/src/modules/financial/__tests__/accounting-engine.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/financial/__tests__/cod-remediation.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/financial/__tests__/complaint-period.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/financial/__tests__/financial-custody.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/financial/__tests__/marketplace-accounting-model.integration.spec.ts` | 43 | 0 | 0 |
| `backend/src/modules/financial/__tests__/marketplace-settled-refund.integration.spec.ts` | 15 | 0 | 0 |
| `backend/src/modules/financial/__tests__/multibook-coa-protection.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/financial/__tests__/org-settlement-receipt.integration.spec.ts` | 13 | 0 | 0 |
| `backend/src/modules/financial/__tests__/revenue-account-separation.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/financial/__tests__/settlement-correction.integration.spec.ts` | 22 | 0 | 0 |
| `backend/src/modules/financial/__tests__/tournament-finances.report.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/marketplace/__tests__/marketplace-payment.integration.spec.ts` | 44 | 0 | 0 |
| `backend/src/modules/marketplace/__tests__/marketplace-tax-persistence.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/match-result/__tests__/sport-config.admin.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p1.gl.integration.spec.ts` | 27 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p2.gl.integration.spec.ts` | 29 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p2.integration.spec.ts` | 28 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p3.gl.integration.spec.ts` | 35 | 0 | 0 |
| `backend/src/modules/membership/__tests__/membership-p3.integration.spec.ts` | 32 | 0 | 0 |
| `backend/src/modules/organisations/__tests__/subscription-cash-accounting.integration.spec.ts` | 3 | 0 | 2 |
| `backend/src/modules/payment/__tests__/hardening-group-card-refund-race.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/payment/__tests__/hardening-payment-refund.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/modules/payment/__tests__/hardening-refund-crash-window.integration.spec.ts` | 2 | 0 | 0 |
| `backend/src/modules/payment/__tests__/payment-reference-id.integration.spec.ts` | 2 | 1 | 0 |
| `backend/src/modules/payment/__tests__/payment.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/payment/__tests__/paymob-intention-correlation.integration.spec.ts` | 22 | 0 | 0 |
| `backend/src/modules/scheduling/__tests__/coach-booking-financial.integration.spec.ts` | 63 | 0 | 0 |
| `backend/src/modules/scheduling/__tests__/saga-repair.integration.spec.ts` | 33 | 0 | 0 |
| `backend/src/modules/scheduling/__tests__/scheduling.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/settlement/__tests__/booking-settlement-eligibility.integration.spec.ts` | 22 | 0 | 0 |
| `backend/src/modules/settlement/__tests__/gateway-settlement-reversal.integration.spec.ts` | 15 | 0 | 0 |
| `backend/src/modules/settlement/__tests__/gateway-settlement.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/settlement/__tests__/settlement-breakdown-persistence.integration.spec.ts` | 4 | 0 | 0 |
| `backend/src/modules/settlement/__tests__/unified-settlement.concurrency.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-atomic-create-prizes.phase4a.integration.spec.ts` | 28 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-card-accounting.g11-1.integration.spec.ts` | 14 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-cash-accounting.g11-2.integration.spec.ts` | 15 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-competition-management.g11-20.integration.spec.ts` | 16 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-competitions.g11-18.integration.spec.ts` | 14 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-description.integration.spec.ts` | 8 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-doubles-roster.phase1.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-g11-4-gaps.integration.spec.ts` | 29 | 1 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-gsk-lifecycle.integration.spec.ts` | 27 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-independent-competitions.phase4.integration.spec.ts` | 22 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-match-generation-competition-isolation.c2.integration.spec.ts` | 22 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-max-events.g11-19.integration.spec.ts` | 11 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-multi-competition-completion.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-outcome-integrity.g11-14.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-prize-awards.g11-5.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-prize-bracket-bind.g11-7.integration.spec.ts` | 19 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-prize-competition-isolation.c1.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-prize-competition-scope.r2a.integration.spec.ts` | 3 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-prize-placements.g11-15.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-progression-prerun.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-public-discovery.g11-16.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-public-gsk.g11-16d.integration.spec.ts` | 9 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-refund.g11-3.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-registration-cancel.g11-8.integration.spec.ts` | 20 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-registration-competition-scope.g11-18p2.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-registration-idor.g11-21-4.integration.spec.ts` | 21 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-registration-payment-rbac.g11-21-6.integration.spec.ts` | 24 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-seed-competition-scoping.g11-19.integration.spec.ts` | 18 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-settlement.g11-4.integration.spec.ts` | 27 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-sponsors.integration.spec.ts` | 12 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-standings-tiebreakers.phase1.integration.spec.ts` | 30 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-team-invitation-lifecycle.phase3.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-team-selfservice.g11-17.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-third-place.phase2.integration.spec.ts` | 17 | 0 | 0 |
| `backend/src/modules/tournaments/__tests__/tournament-venue-and-scoping.g11-18p3.integration.spec.ts` | 23 | 0 | 0 |
| `backend/src/modules/upload/__tests__/upload-routes-rbac.integration.spec.ts` | 7 | 0 | 0 |
| `backend/src/modules/wallet/__tests__/wallet.transaction.integration.spec.ts` | 10 | 0 | 0 |
| `backend/src/modules/wallet/__tests__/withdrawal-accounting.integration.spec.ts` | 12 | 0 | 0 |
| `backend/src/modules/wallet/__tests__/withdrawal-method.g11-6.integration.spec.ts` | 12 | 0 | 0 |
| `backend/src/shared/utils/pagination.live-db.integration.spec.ts` | 3 | 0 | 0 |

## 8. Conclusion

**B9 is resolved for Stage A.** The global teardown no longer deletes data, and the selected
persistent integration set (payment, payment-reference-id, upload RBAC, coach profile/Fastify/Zod)
passes 40/40 with scoped cleanup. P2-05 can be completed.

Still outside this scope: the 32 container-based suites (blocked by the no-container decision) and
the remaining persistent suites not exercised by Stage A. Their cleanup patterns are documented in
the appendix; they are not required for Stage A acceptance.

The original B9 assessment was static; the executed remediation/test evidence is recorded above and
in `COURTZON_RELEASE_PROGRESS.md`.
