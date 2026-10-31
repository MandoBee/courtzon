# Technical Debt Register -- P8.7.14 era

| Field | Value |
|---|---|
| Scope | Debt identified or re-confirmed while delivering P8.7.14 (2026-10-30 / 2026-10-31) |
| Baseline | `HEAD = 7b9ca362696269edc43a9ddfc64072cc54645904` (two local, unpushed commits: `75f3c16d` booking fix, `7b9ca362` baseline docs); working tree 213 entries |
| Relationship | Debt items explain *why* the issues in [`OUTSTANDING_ISSUES.md`](./OUTSTANDING_ISSUES.md) recur; roadmap items in [`ROADMAP.md`](./ROADMAP.md) are the proposed fixes |
| Historical register | `docs/HANDOVER_CURRENT/28_TECHNICAL_DEBT.md` (2026-10-04) is retained as a historical snapshot and is **not** superseded here |
| Status vocabulary | `Open` / `Planned` / `Blocked` / `Completed` |

Evidence labels: `[CONFIRMED]`, `[HYPOTHESIS]`, `[RECOMMENDATION]`, `[UNVERIFIED]`.
No item below was implemented as part of P8.7.14.

---

## TD-01 -- Notification recipient validation and failure classification

| | |
|---|---|
| Status | Open |
| Risk | Medium |
| Evidence | `backend/src/modules/notifications/application/dispatcher.service.ts` (`dispatchToUserV2`, `DispatchNotification`), `backend/src/modules/notifications/infrastructure/repositories/notification.repository.ts:68` |

- `[CONFIRMED]` The dispatcher inserts directly into `notifications` and relies on the `fk_notif_user` FK to reject
  unknown recipients; a missing user surfaces as a database error (`command.failed` + `Error handling event`), i.e. a
  **level-50 error for a data condition**, not a classified domain outcome.
- `[CONFIRMED]` Recipient failures are not distinguished from real delivery failures, so dashboards and alert rules
  cannot separate "recipient no longer exists" from "platform broken".
- `[RECOMMENDATION]` Pre-validate the recipient and emit a typed skip/`warn` outcome; keep `booking:completed` firing
  regardless. This removes noise without suppressing genuine failures.
- Related: [OI-01](./OUTSTANDING_ISSUES.md).

---

## TD-02 -- Booking / user / resource / branch referential integrity

| | |
|---|---|
| Status | Open |
| Risk | Medium-High (data durability vs. orphan growth) |
| Evidence | `information_schema.referential_constraints` for `bookings`: only `fk_booking_branch` and `fk_bookings_tax_rate` (`SET NULL`); no FK on `user_id` or `resource_id` |

- `[CONFIRMED]` `bookings.user_id` and `bookings.resource_id` are unconstrained. Deleting a user or a resource leaves
  bookings pointing at nothing, which is exactly the condition that made `findById()` return `null` before P8.7.14.5.
- `[CONFIRMED]` `branch_id` is `SET NULL` (deliberate soft reference per `AGENTS.md`); `resource_id` has no rule at all.
- `[CONFIRMED]` The LEFT JOIN fix restores **readability**; it does not prevent new orphans.
- `[RECOMMENDATION]` Decide per column: soft-delete users (keeping the row) and/or add `ON DELETE RESTRICT`/`SET NULL`
  with a documented archival path for resources. Never add `CASCADE` to booking history (financial/audit record).
- Related: [OI-01](./OUTSTANDING_ISSUES.md).

---

## TD-03 -- E2E cleanup safety and isolation

| | |
|---|---|
| Status | Open (governance decision required) |
| Risk | High for data integrity of the test database |
| Evidence | `backend/scripts/e2e-validation.mjs:441`, `backend/scripts/e2e-year-end-sim.mjs:178,489`, `backend/src/tests/helpers/integration-setup.ts`, `backend/vitest.integration.global-setup.ts`, plan Amendment A1 |

- `[CONFIRMED]` E2E scripts delete users directly (`DELETE FROM users ...`) without cleaning dependent booking rows,
  which is the most plausible source of the 22 orphan bookings (`[HYPOTHESIS]`, provenance unproven).
- `[CONFIRMED]` The integration `globalSetup` writes an accounting period into `courtzon_v3` and most integration
  specs run against that persistent database; the rest start Testcontainers.
- `[CONFIRMED]` Plan Amendment A1 forbids extra databases/containers and declares `courtzon_v3` data disposable,
  so "isolation" is currently policy-based, not technical.
- `[RECOMMENDATION]` Choose one: guarded campaign-scoped cleanup (current policy) or a disposable database per run.
  Either way, E2E scripts must clean their own aggregates (users + bookings + payments) in dependency order.
- Related: [OI-09](./OUTSTANDING_ISSUES.md).

---

## TD-04 -- Startup template synchronization idempotency

| | |
|---|---|
| Status | Open |
| Risk | Low-Medium (write amplification, provenance loss) |
| Evidence | Startup logs `2026-10-30T22:35:53Z`; `notification_templates` read-only inspection (52 tournament rows updated, count 337 unchanged) |

- `[CONFIRMED]` The template synchronizer rewrites 52 existing `tournament:*` templates on every boot even though the
  content is unchanged, bumping `updated_at` each time.
- `[RECOMMENDATION]` Hash-based no-op detection (compare desired content vs stored version) and audit only real changes.
- Related: [OI-02](./OUTSTANDING_ISSUES.md).

---

## TD-05 -- Migration checksum evidence and history reconciliation

| | |
|---|---|
| Status | Open |
| Risk | Medium (auditability) |
| Evidence | Startup checksum report `2026-10-30T22:35:44Z`; `migration_history` DDL and contents |

- `[CONFIRMED]` 22 rows carry legacy/unverifiable hashes (`manual`, 4-hex labels, `hash_kind='unknown'`); one row
  (`103b_coa_cleanup.sql`) has no file on disk.
- `[CONFIRMED]` `migration_history` has no unique key on `filename`, and two migrations appear twice
  (`direction='up'` plus `direction='failed'`).
- `[CONFIRMED]` Drift and format checks otherwise pass (`CONTENT_DRIFT=0`, `LEGACY_FORMAT_MISMATCH=0`,
  `MISSING_HISTORY_ROW=0`).
- `[RECOMMENDATION]` Keep the recorded hashes immutable; produce a reconciliation annex listing each unverifiable row
  with its origin evidence, then decide on a duplicate policy and (optionally) a partial unique index.
- Related: [OI-04](./OUTSTANDING_ISSUES.md).

---

## TD-06 -- Migration runner operational safety

| | |
|---|---|
| Status | Open |
| Risk | Medium |
| Evidence | `backend/scripts/migrate.js`, `scripts/migrate.sh`, `backend/docker-entrypoint.sh` (both scripts modified in the working tree); rollback-image inspection |

- `[CONFIRMED]` The canonical runner now records failed attempts and uses advisory locking in the current image, but
  the older `rollback-p876` image ships a `migrate.js` wrapper whose `scripts/migrate.sh` target is **absent** from the
  image, so manual invocation inside that container would fail (the entrypoint does not call it).
- `[CONFIRMED]` `docker-entrypoint.sh` and `scripts/migrate.sh` currently differ from `HEAD` (uncommitted), so the
  container behaviour is not reproducible from the repository alone.
- `[CONFIRMED]` The "failed" rows recorded for 204/205 show that a failed attempt and a later successful attempt are
  both kept, which is useful but means "applied" checks must be direction-aware.
- `[RECOMMENDATION]` Make the runner self-consistent in every image (wrapper + shell engine + guard), assert their
  presence at build time, and keep direction-aware status semantics documented.

---

## TD-07 -- Build provenance (`SOURCE_COMMIT`)

| | |
|---|---|
| Status | Open |
| Risk | Low |
| Evidence | `/health/version` on the deployed container; image `git-commit.txt` = `unknown`; `docker-compose.yml` `SOURCE_COMMIT: ${SOURCE_COMMIT:-unknown}` |

- `[CONFIRMED]` Every backend image built locally reports `gitCommit: unknown`; only `build-time.txt` identifies it.
- `[RECOMMENDATION]` Always pass `SOURCE_COMMIT=$(git rev-parse HEAD)`; surface it in the release record and in
  `/health/version` assertions.
- Related: [OI-06](./OUTSTANDING_ISSUES.md).

---

## TD-08 -- Immutable rollback image retention

| | |
|---|---|
| Status | Open |
| Risk | High for recovery time objective |
| Evidence | P8.7.14.7 image inspection, P8.7.14.8 read-only rollback assessment |

- `[CONFIRMED]` Moving `latest` made the superseded image unaddressable (`0` dangling images, `No such image` by ID
  and digest). Only `rollback-p876` (5 days old) and `failed-p876` remain as older backend images.
- `[CONFIRMED]` `rollback-p876` lacks the TLS policy, canonical migration runner, and confirmation-gated permission
  sync that the current image has.
- `[RECOMMENDATION]` Adopt pre-deploy immutable tagging plus a documented retention window and a periodic restore drill.
- Related: [OI-05](./OUTSTANDING_ISSUES.md).

---

## TD-09 -- Backend test determinism (fixed clocks, fixture dates)

| | |
|---|---|
| Status | Open |
| Risk | Medium (false failures hide regressions) |
| Evidence | P8.7.14.12 results; failing suites `view-assignments-status`, `current-subscription-resolution`, `membership-p2` |

- `[CONFIRMED]` Four failing assertions compare subscription/membership period boundaries against the real current
  date (periods `18/08 -> 18/09` are simply expired by 2026-10-31).
- `[RECOMMENDATION]` Inject a clock (`vi.setSystemTime` or a time provider) and build fixture windows relative to the
  injected "now"; assert both an in-window and an out-of-window case.
- Related: [OI-03](./OUTSTANDING_ISSUES.md).

---

## TD-10 -- Proxy contract tests synchronized with Nginx/Vite routes

| | |
|---|---|
| Status | Open |
| Risk | Low-Medium |
| Evidence | `backend/src/tests/proxy-contract.spec.ts` failure: `/broken`, `/demo`, `/protected` missing from `frontend/nginx.conf` and Vite proxy |

- `[CONFIRMED]` The test derives active API prefixes from route registrations and compares them to hard-coded proxy
  configuration; test-only/demo prefixes now differ, producing two failures.
- `[RECOMMENDATION]` Exclude explicitly test-only routers at the source (or mark them in the registry), and generate the
  expected proxy list from a single declarative source used by both nginx and Vite.

---

## TD-11 -- Static migration validation synchronized with manifests

| | |
|---|---|
| Status | Open |
| Risk | Low-Medium |
| Evidence | `backend/src/infrastructure/migrations/__tests__/static-validation.spec.ts` failure `expected 212 to be 210` |

- `[CONFIRMED]` The static validator compares a manifest count with the migration chain; the working tree has since
  gained migrations/untracked artefacts, so the hard-coded expectation drifted.
- `[RECOMMENDATION]` Compute expectations from the same manifest the runtime uses (single source of truth) instead of
  literal counts; keep a separate assertion for "no file beyond the manifest".

---

## TD-12 -- Observability and alert noise reduction

| | |
|---|---|
| Status | Open |
| Risk | Medium (alert fatigue) |
| Evidence | 10 level-50 notification errors for a data condition; per-boot level-40 `missing courts, payments`; repeated CLI deprecation lines; 52 template updates logged as writes |

- `[CONFIRMED]` Three different classes of benign/known condition are emitted at warning/error severity on every boot
  or every worker cycle, while the stack is healthy.
- `[RECOMMENDATION]` Classify outcomes (skip vs. retryable vs. fatal), reserve level 50 for actionable failures, and add
  metric counters (`notification_skipped_recipient_missing`, `template_sync_noop_total`,
  `migration_history_unverifiable_total`) so alerts can target counts rather than log text.
- Related: [OI-01](./OUTSTANDING_ISSUES.md),
  [OI-02](./OUTSTANDING_ISSUES.md),
  [OI-07](./OUTSTANDING_ISSUES.md).

---

## TD-13 -- Uncommitted working-tree dependence

| | |
|---|---|
| Status | Open |
| Risk | High for reproducibility |
| Evidence | Working tree **213** entries at `HEAD 7b9ca362`; the five P8.7.14.5 files are **committed in `75f3c16d`**; `docker-entrypoint.sh` and `scripts/migrate.sh` remain modified/uncommitted |

- `[CONFIRMED]` The deployed image was built from a working tree that contained numerous unrelated uncommitted
  changes (the five P8.7.14.5 files were still uncommitted at build time), so the running container cannot be
  reproduced from the two current commits alone (`75f3c16d`, `7b9ca362`); conversely, reverting/cleaning the tree
  would change runtime behaviour.
- `[RECOMMENDATION]` Keep the "no reset/stash/clean" rule, and schedule an explicit, authorized commit operation that
  stages only reviewed files (see [DEPLOYMENT_GOVERNANCE.md](./DEPLOYMENT_GOVERNANCE.md)).

---

## Change log

| Date | Change |
|---|---|
| 2026-10-31 | Register created from P8.7.14 evidence. No debt item implemented. |
