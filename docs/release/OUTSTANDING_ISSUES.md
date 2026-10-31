# CourtZon -- Outstanding Issues Register (P8.7.14 era)

| Field | Value |
|---|---|
| Scope | Issues discovered or re-confirmed during P8.7.14.5 -- P8.7.14.13 (2026-10-30 / 2026-10-31) |
| Baseline | `HEAD = 7b9ca362696269edc43a9ddfc64072cc54645904` (two local, unpushed commits: `75f3c16d` booking fix, `7b9ca362` baseline docs); working tree 213 entries; backend image `sha256:5ae6bc915713...94aa` |
| Authority | Subordinate to [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md); release record in [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md) |
| Status vocabulary | `Open` / `Planned` / `Blocked` / `Completed` (only `Completed` with executed evidence) |
| Historical registers | `docs/HANDOVER_CURRENT/26_KNOWN_ISSUES.md` (2026-10-04 snapshot) and `docs/HANDOVER_CURRENT/28_TECHNICAL_DEBT.md` remain **historical references** and are not superseded by this file |

Evidence labels: `[CONFIRMED]` observed with recorded output; `[HYPOTHESIS]` consistent with evidence but unproven;
`[RECOMMENDATION]` proposal only; `[UNVERIFIED]` not established.

Priorities below are **agent recommendations** for sequencing, not owner decisions.

---

## OI-01 -- W1: orphan booking user references

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Data integrity (referential), notification side effect |
| Suggested priority | **Medium** (no financial or completion impact; user-visible notification loss for a narrow record set) |
| Owner | Not assigned (requires owner decision) |
| Source | P8.7.14.11 Phase A; `/health` session logs of container `aeb9e434fb61...` |

### Confirmed facts

- `[CONFIRMED]` `bookings` has **no foreign key on `user_id`**. `information_schema.referential_constraints` for
  `bookings` returned only `fk_booking_branch` (-> `branches`, `ON DELETE SET NULL`) and `fk_bookings_tax_rate`
  (-> `tax_rates`, `ON DELETE SET NULL`).
- `[CONFIRMED]` 22 booking rows reference a `user_id` with no matching `users` row: 16 distinct missing user ids,
  5 rows with `branch_id IS NULL`, all rows have a `resource_id`; `booking_date` range 2026-09-03 .. 2026-10-30;
  distribution `private_match` 17 (`pending` 3, `checked_in` 1, `cancelled` 8, `completed` 4, `no_show` 1) and
  `academy` 5 (`completed`).
- `[CONFIRMED]` The five newly completed Academy bookings (`41458`, `41459`, `41460`, `58348`, `58928`) each produced one
  `DispatchNotification` command failure and one `notification-engine` handler failure -- **10 level-50 lines total**,
  all timestamped `22:40:00Z`.
- `[CONFIRMED]` Failure text: `Cannot add or update a child row: a foreign key constraint fails
  (courtzon_v3.notifications, CONSTRAINT fk_notif_user ... user_id -> users.id)`.
- `[CONFIRMED]` Booking completion was unaffected: the five rows moved to `completed`, the worker reported
  `failed:0`, `notifications` stayed at 3,036 rows (no partial/failed rows persisted).
- `[CONFIRMED]` No notification retry loop: the error count stayed at 10 and the last error timestamp did not advance.
- `[CONFIRMED]` No record was repaired, deleted, or back-filled during the release.

### Evidence-based hypothesis (not proven)

- `[HYPOTHESIS]` The orphans are test/E2E residue. Supporting evidence, not proof:
  - `backend/scripts/e2e-validation.mjs:441` performs `DELETE FROM users WHERE email = ?`;
  - `backend/scripts/e2e-year-end-sim.mjs:178, 489` perform `DELETE FROM users WHERE id IN (...)` / `... WHERE id = ?`;
  - no `database/**/*.sql` file references any of the sampled missing user ids;
  - because `bookings.user_id` has no FK, deleting a user leaves its bookings intact.
  - No audit row or log links these deletions to a specific run, so provenance is **not proven**.

### Impact

- Recipient-facing `booking:completed` notifications are silently not created for these bookings (level-50 log noise).
- No ledger, settlement, entitlement, or booking-state impact; no user data corruption.
- No PII is exposed by these findings; deleted users have no profile rows.

### Recommendation (`[RECOMMENDATION]`)

1. Validate the recipient before dispatch and treat a missing/hard-deleted recipient as a **non-error**: skip with a
   `warn` (`recipient_missing`) instead of letting the FK raise.
2. Run a **separate, explicitly authorized** orphan-data investigation (read-only first) before any repair; decide
   between back-filling users, archiving the bookings, or adding an FK.
3. Do not add `ON DELETE CASCADE` to `bookings.user_id` -- historical booking records must survive user deletion
   (see `AGENTS.md` historical-data policy).

---

## OI-02 -- W2: `tournament:*` notification template refresh on startup

| Field | Value |
|---|---|
| Status | **Open** (behaviour accepted for now, no defect proven) |
| Class | Write amplification / startup idempotency |
| Suggested priority | **Low** |
| Source | Startup logs at `2026-10-30T22:35:53Z`; read-only `notification_templates` inspection |

### Confirmed facts

- `[CONFIRMED]` 52 rows in `notification_templates` were written on backend startup: `category_slug = 'tournament'`,
  `event_name` values such as `tournament:created`, `tournament:starting-soon`, `tournament:match-scheduled`,
  `tournament:result`, `tournament:registration-open`, `tournament:registration-closed` (en and ar locales).
- `[CONFIRMED]` Total template count was 337 before and after; `created_at` for these rows was not touched
  (`0` rows created after the deploy timestamp) => **UPDATE, not INSERT**.
- `[CONFIRMED]` This is pre-existing behaviour, already recorded for P8.7.11 in
  `COURTZON_RELEASE_PROGRESS.md` section 20.1 ("52 `tournament:*` templates refreshed (existing startup behaviour)").
- `[CONFIRMED]` No notification count change (3,036) and no error lines related to template refresh.

### Impact

- 52 row updates per backend start; benign at current scale, but it obscures template `updated_at` provenance and
  creates unnecessary InnoDB write traffic / replication churn in larger deployments.

### Recommendation (`[RECOMMENDATION]`)

Compare the desired template content hash with the stored `version`/content and skip the UPDATE when identical; record
an audit line only on actual change. Do not disable the refresh until the comparison exists.

---

## OI-03 -- Backend unit test failures (12 across six suites)

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Test determinism / working-tree drift |
| Suggested priority | **Medium** (masks real regressions in the full-suite signal) |
| Source | P8.7.14.12 `npm test` in `backend/` |

### Confirmed facts

- `[CONFIRMED]` Result: 354 files (348 passed / 6 failed), 4,475 tests (4,463 passed / 12 failed), 77.83 s.
- `[CONFIRMED]` Failing suites and observed assertions:

| Suite | Failures | Assertion |
|---|---|---|
| `src/modules/organisations/__tests__/view-assignments-status.spec.ts` | 3 | period `18/08 -> 18/09` resolves `expired`, expected `active` |
| `src/modules/organisations/__tests__/current-subscription-resolution.spec.ts` | 2 | expired historical row chosen instead of the active period |
| `src/infrastructure/migrations/__tests__/migration-guard.spec.ts` | 3 | `expected -1 to be greater than 3993` / `16015`; missing `Stamping migration_history ...` text |
| `src/tests/proxy-contract.spec.ts` | 2 | `Active API prefixes missing from Nginx routing: /broken, /demo, /protected` (and the Vite equivalent) |
| `src/infrastructure/migrations/__tests__/static-validation.spec.ts` | 1 | `expected 212 to be 210` |
| `src/modules/membership/__tests__/membership-p2.spec.ts` | 1 | GRACE-window eligibility expected `true`, received `false` |

- `[CONFIRMED]` None of the six suites references booking code (`0` occurrences of "booking" in each file).
- `[CONFIRMED]` `backend/docker-entrypoint.sh` and `scripts/migrate.sh` are **modified in the working tree** (109 and 707
  changed lines respectively) and `static-validation.spec.ts` is untracked -- all pre-existing 216-entry state.
- `[CONFIRMED]` The P8.7.14.5-focused suite passed 31/31 in the same session.

### Assessment

- `[HYPOTHESIS]` All 12 failures are pre-existing/environmental: four are calendar-dependent (period end dates already
  passed on 2026-10-31), two suites assert content of working-tree files that are themselves modified, one asserts a
  migration count that no longer matches the tree, and one asserts route prefixes that drifted from `nginx.conf`/Vite.
- `[UNVERIFIED]` Definitive proof requires reverting the uncommitted changes or pinning a fixed clock; both were out of
  scope for a read-only unit-test task.

### Recommendation (`[RECOMMENDATION]`)

Inject a fixed "now" in subscription/membership specs; derive expected values from the same source the code uses
(Nginx/Vite config, manifest) rather than hard-coded lists; make migration-guard assertions structural rather than
byte offsets. Do not "fix" by loosening assertions.

---

## OI-04 -- Migration history integrity (legacy hashes and orphan row)

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Auditability / migration provenance |
| Suggested priority | **Medium** (integrity evidence, no runtime failure observed) |
| Source | Startup checksum report `2026-10-30T22:35:44Z`; read-only `migration_history` inspection |

### Confirmed facts

- `[CONFIRMED]` Latest audit: `212 applied file(s) checked, CONTENT_DRIFT=0, LEGACY_FORMAT_MISMATCH=0,
  UNVERIFIABLE_LEGACY_HASH=22, ORPHAN_HISTORY_ROW=1, MISSING_HISTORY_ROW=0`.
- `[CONFIRMED]` `103b_coa_cleanup.sql` is recorded in `migration_history` but has no corresponding file on disk.
- `[CONFIRMED]` `migration_history` has **no UNIQUE constraint on `filename`** (only `KEY idx_mh_filename_id`), and
  `204_convergence_idx_status_enddate.sql` / `205_tournaments_max_events_check.sql` each appear twice -- once as
  `direction='up'`, once as `direction='failed'`.
- `[CONFIRMED]` The 22 unverifiable rows use legacy hash formats (`manual`, short 4-hex values such as `091`, `GROUP2`,
  or full hashes captured with `hash_kind='unknown'`).
- `[CONFIRMED]` Total rows 215 before and after the deployment; no new migration executed.

### Risk

- Duplicate `filename` rows make "is this migration applied?" checks count-sensitive; today every consumer uses
  `COUNT(*) > 0`, but a future strict equality check would misreport.
- Legacy hashes cannot be verified, so a future content edit to an old migration file would be undetectable.

### Recommendation (`[RECOMMENDATION]`)

Preserve historical checksums exactly as recorded -- never rewrite or invent hashes. Add a reconciliation report that
lists the 22 unverifiable rows and the orphan row with evidence of when/why they were recorded, then decide (owner
decision) whether to introduce a partial unique index on `(filename)` with a documented duplicate policy.

---

## OI-05 -- Rollback image retention

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Deployment / disaster recovery |
| Suggested priority | **High** for the next deployment window |
| Source | P8.7.14.7 (build), P8.7.14.8 (read-only rollback assessment), P8.7.14.10 (deploy) |

### Confirmed facts

- `[CONFIRMED]` The previously running image `sha256:02b2184fee94681968231b5550d9aa5ccc31e828de3c7ff79ed472bc9f8dc1e4`
  became **unaddressable** (by ID and by repo digest) after `latest` moved; `docker image ls --filter dangling=true`
  reported 0 images. The running container continued unaffected until it was intentionally recreated.
- `[CONFIRMED]` `courtzon-backend:rollback-p876` =
  `sha256:4ebd04ed797049888e2eb50dee91486b8efb248fa00383e906a9200c02ecb95f` (628 MB, created
  `2026-10-25T09:28:26Z`, baked `expected-migration = 203_convergence_indexes`).
- `[CONFIRMED]` That rollback image **lacks** `db-tls.sh`/`db-tls.js`, `scripts/migrate.sh`, and the
  confirmation-gated/global-scoped permission sync present in the current image; its `scripts/migrate.js` wrapper
  references a `migrate.sh` that does not exist in the image.
- `[CONFIRMED]` The database is at migration 205 and all 210 rollback-image migration filenames are already recorded,
  so a rollback would apply **0** migrations and only additive permission upserts.

### Risk

- The only older backend image available is a 5-day-old snapshot that also regresses TLS enforcement and the canonical
  migration runner. A rollback is therefore a **functional** rollback, not a like-for-like revert.

### Recommendation (`[RECOMMENDATION]`)

Before every tag move, copy the current image to an immutable, dated tag (for example
`courtzon-backend:predeploy-<UTC date>-<short sha>`), verify it exists by ID, and only then build/deploy. See
[DEPLOYMENT_GOVERNANCE.md](./DEPLOYMENT_GOVERNANCE.md).

---

## OI-06 -- Build provenance (`gitCommit = unknown`)

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Traceability / release engineering |
| Suggested priority | **Low** |
| Source | `/health/version` on the deployed container; image layer `git-commit.txt` |

### Confirmed facts

- `[CONFIRMED]` `/health/version` returns `gitCommit: "unknown"`, `imageGitCommit: "unknown"`,
  `gitCommitConsistent: false`, `gitCommitMismatch: false`.
- `[CONFIRMED]` The image contains `git-commit.txt` = `unknown`; compose passes `SOURCE_COMMIT=${SOURCE_COMMIT:-unknown}`
  and no value was supplied at build time.
- `[CONFIRMED]` `build-time.txt` is correct (`2026-10-30T21:59:51Z`), so only the commit stamp is missing.

### Impact

- An operator cannot prove which commit produced a running container; rollback and audit comparisons rely on
  build time and manual notes.

### Recommendation (`[RECOMMENDATION]`)

Pass `SOURCE_COMMIT=$(git rev-parse HEAD)` at build time for local and CI builds, and record it in the release record.

---

## OI-07 -- Stale startup-validator table list

| Field | Value |
|---|---|
| Status | **Open** |
| Class | Observability noise / documentation drift |
| Suggested priority | **Low** |
| Source | Level-40 startup log line on the deployed container (2026-10-30) |

### Confirmed facts

- `[CONFIRMED]` Every boot logs: `Non-critical tables missing: courts, payments. Run migrations to create them.`
  (module `startup-validator`, level 40), while `/health/database` reports `330 tables` and the stack is healthy.
- `[CONFIRMED]` `REQUIRED_TABLES` in `backend/src/infrastructure/startup/startup-validator.ts` still lists `courts` and
  `payments`.
- `[HYPOTHESIS]` The current schema uses `resources` and `payment_transactions` instead; the validator list predates
  that naming. Not verified in this task because SQL execution was out of scope.

### Impact

- False alarm on every boot; contributes to alert fatigue and could hide a genuine missing-table warning.

### Recommendation (`[RECOMMENDATION]`)

Reconcile `REQUIRED_TABLES` with the baseline schema and assert the list in a unit test (no DB required) so drift is
caught at build time.

---

## OI-08 -- MySQL/MariaDB CLI deprecation warnings

| Field | Value |
|---|---|
| Status | **Open** (cosmetic) |
| Class | Maintenance |
| Suggested priority | **Low** |
| Source | Entrypoint output on the deployed container, 2026-10-30 |

### Confirmed facts

- `[CONFIRMED]` Startup prints repeated `/usr/bin/mysql: Deprecated program name. It will be removed in a future
  release, use '/usr/bin/mariadb' instead`.
- `[CONFIRMED]` Startup and migrations still succeed (`No new migrations to apply`, healthy stack).

### Recommendation (`[RECOMMENDATION]`)

Switch the CLI invocations in `docker-entrypoint.sh` / `scripts/migrate.sh` to `mariadb`, keeping the same TLS flag
mapping, in a dedicated change with tests. Do not bundle it with a functional release.

---

## OI-09 -- Integration test isolation vs Amendment A1

| Field | Value |
|---|---|
| Status | **Open** (governance conflict, not a defect) |
| Class | Test safety / release governance |
| Suggested priority | **High** before any integration run |
| Source | P8.7.14.6 and P8.7.14.11 Phase A inspections |

### Confirmed facts

- `[CONFIRMED]` `backend/vitest.integration.config.ts` registers
  `globalSetup: ./vitest.integration.global-setup.ts`, which hard-codes `127.0.0.1:3307/courtzon_v3` (credentials are
  embedded in that test-only file and are deliberately not repeated here) and INSERTs (or reuses) a platform accounting
  period for the current business date.
- `[CONFIRMED]` Most integration specs target that persistent database; the Testcontainers helpers in
  `backend/src/tests/helpers/integration-setup.ts` start an ephemeral `mysql:8.0` + Redis pair for the remainder.
- `[CONFIRMED]` `COURTZON_RELEASE_READINESS_PLAN.md` **Amendment A1** explicitly mandates that testing uses the existing
  `courtzon_v3` database only and forbids creating additional databases/containers.
- `[CONFIRMED]` Stated plan risk: "All tests write to `courtzon_v3` (user-approved, Amendment A1); safety depends on
  exact target pinning + deferred explicit cleanup".

### Assessment

- `[CONFIRMED]` The recommendation recorded in P8.7.14.11/12 ("never run integration/E2E against the persistent
  development database") **conflicts** with Amendment A1. Resolving this requires a documented, user-approved plan
  amendment -- it must not be changed silently by this documentation set.

### Recommendation (`[RECOMMENDATION]`)

Ask the owner to choose: (a) keep Amendment A1 and require the guarded, explicitly authorized cleanup path, or
(b) authorize a disposable isolated database for integration runs. Until decided, integration execution stays
`BLOCKED` and must not be represented as passed.

---

## Change log for this register

| Date | Change |
|---|---|
| 2026-10-31 | Created from P8.7.14.5 -- P8.7.14.13 evidence. No status marked `Completed` in this release. |
