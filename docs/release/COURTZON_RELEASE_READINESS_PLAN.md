# CourtZon Release Readiness Plan (Canonical)

| Field | Value |
|---|---|
| Document | `docs/release/COURTZON_RELEASE_READINESS_PLAN.md` |
| Version | 1.0 |
| Adopted | 2026-10-26 |
| Owner | CourtZon technical auditor / release controller |
| Status | **ACTIVE — governing roadmap** |
| Live status | [`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md) |
| Baseline commit | `184aa6e0b96c93b278f909d63eb7f4a88d28b424` (local, unpushed) |
| Previous origin | `806177477cb687d90b37fe04c4184cbaeaf1d0a1` |

---

## Amendment A1 — Existing-database testing strategy (user-directed, 2026-10-26)

The user has explicitly decided, and reaffirmed, that CourtZon testing uses the existing local
`courtzon_v3` database only. This is a **user-directed plan amendment** (not an emergency deviation)
that replaces the previously proposed dedicated `courtzon_v3_e2e` isolation strategy.

- All E2E/integration testing targets `courtzon_v3` on the local Docker MySQL
  (`127.0.0.1:3307`) only.
- Existing data in `courtzon_v3` is declared disposable test data. It is **not** cleared per test or
  per suite; the full cleanup happens once, after the complete testing campaign, as a separately
  documented and explicitly authorized operation.
- No additional database, directory, container, or duplicate test environment may be created.
- Safety is achieved by: exact target validation (database name + loopback host + port) before any
  test connection; explicit destructive-cleanup authorization; deferred/centralized cleanup; and a
  documented final-cleanup procedure.
- Phase order and the 100-item checklist denominator are unchanged; only the conflicting environment
  items (P1-06…P1-10, P6-03, P7-01) are redefined.

---

## 1. Purpose and authority

This document is the **single governing roadmap** for bringing CourtZon to a verified, secure,
stable, production-ready state. Work proceeds through the ten phases below, in order, using the
acceptance criteria and evidence rules defined here.

- This plan **supersedes ad-hoc task ordering**. A task that is not mapped to a phase item must be
  logged, prioritized, and assigned before work begins.
- Existing roadmap/checklist documents remain valid as **historical or subsidiary references** but do
  not override this plan:
  - `MASTER_CHECKLIST.md` (tournament delivery groups, historical)
  - `PRODUCTION_CHECKLIST.md` / `docs/operations/deployment-checklist.md` (deployment checklists)
  - `docs/HANDOVER_CURRENT/36_PRODUCTION_ROADMAP.md` and `37_HANDOVER_CHECKLIST.md` (handover-era)
  - `docs/implementation-roadmap.md`, `docs/ENTERPRISE_ROADMAP.md`, `docs/RELEASE_PACKAGE.md`
  - `docs/release/release-manifest.md` (immutable V3.0.0 release record — do not modify)
- No duplicate competing release-readiness roadmap may be created. Amendments are made to this file
  and recorded in the progress file's audit trail.

## 2. Primary objective

Reach a **verified** release state through a controlled, evidence-based process:

1. Every phase acceptance criterion is satisfied with recorded evidence.
2. No critical security, data-integrity, or financial defect remains open.
3. Builds, tests, architecture checks, security gates, and real UI tests are trustworthy.
4. Local Docker verification is complete before any Git push or deployment decision.
5. Hosting/production deployment requires separate explicit user approval and is **never automatic**.

## 3. Roles and mutual review

| Role | Responsibility |
|---|---|
| User | Owns release authorization, production approval, and accepts residual risk. |
| Assistant (auditor/engineer) | Executes phases, challenges unsafe/incomplete work, records evidence, maintains progress. |
| Reviewer (both) | Cross-checks each other's decisions against this plan before advancing a phase. |

Any participant may stop work and request a plan review. Disagreement is resolved by evidence, not
convenience.

## 4. Non-negotiable rules

1. The ten phases remain in the agreed order except for a documented emergency.
2. A newly discovered issue must be logged, prioritized, and assigned to a phase. Critical security,
   data-integrity, financial, or release-blocking defects must be addressed before proceeding.
3. Do not claim a task passed without actual evidence.
4. A successful build is not proof that business behavior is correct.
5. Unit tests and mocks do not replace integration, Sandbox, or real UI testing.
6. Do not delete or truncate the current `courtzon_v3` database for test cleanup.
7. Do not make unnecessary database schema/data changes.
8. Do not suppress lint, security, architecture, or test failures merely to obtain a green report.
9. Do not perform broad dependency upgrades without compatibility review.
10. Do not commit, push, rebuild Docker, or deploy before the applicable phase and authorization
    requirements are satisfied.
11. When a test cannot run because of environment or external-service limitations, report it as
    **BLOCKED** or **NOT RUN** — never **PASS**.
12. Never expose credentials, tokens, payment secrets, or other sensitive data in reports or logs.
13. Before any material change, state the intended scope, expected impact, and relevant risks.
14. If a requested action conflicts with this roadmap, flag the conflict and propose the plan-aligned
    alternative instead of silently deviating.

## 5. Status model

| Status | Meaning |
|---|---|
| `TODO` | Not started. |
| `IN_PROGRESS` | Actively being worked on. |
| `BLOCKED` | Cannot proceed; reason recorded in the progress file. |
| `DONE` | Completed and supported by evidence. |
| `ACCEPTED_RISK` | Explicitly reviewed, documented, and accepted — never used to hide a critical unresolved defect. |

A phase is never marked complete until its acceptance criteria are met. A phase may show 100 % task
completion while still failing acceptance (e.g., evidence missing); in that case it remains
`IN_PROGRESS` until acceptance is recorded.

## 6. Progress metrics

Two independent metrics are maintained.

**A. Overall completion**
```
Overall % = (number of DONE checklist items / total applicable checklist items) × 100
```
The checklist is defined across all ten phases (100 items at adoption). Completion cannot be
inflated by creating fewer tasks or deleting unfinished ones. Scope changes must be recorded with
their effect on the denominator.

**B. Phase completion**
```
Phase % = (DONE checklist items in that phase / total checklist items in that phase) × 100
```

`ACCEPTED_RISK`, `BLOCKED`, and `IN_PROGRESS` never count as `DONE`.

Additionally reported separately (never mixed into completion %):
- Tests passed / run, by category (unit, integration, E2E, security, performance).
- Security findings: open, fixed, accepted risk.
- Critical blockers remaining.
- UI/E2E scenarios: passed / failed / blocked / not run.
- Build, type-check, lint, architecture, and CI status.

## 7. Mandatory progress tracking

After every meaningful implementation, audit, test run, dependency update, or repair:

1. Update `docs/release/COURTZON_RELEASE_PROGRESS.md`.
2. Record the exact operation and affected files/systems.
3. Record actual commands, results, failures, and evidence.
4. Update checklist statuses and percentages.
5. Record newly discovered issues and blockers.
6. State the current phase, next task, and whether phase acceptance is met.
7. Confirm no prohibited database, Docker, GitHub, or deployment action was performed.

## 8. Required response format (after every operation)

Responses are concise and in Arabic:

```
العملية: [what was done]
المرحلة الحالية: [phase number/name]
نسبة الإنجاز الكلية: [X%]
نسبة إنجاز المرحلة: [Y%]
الاختبارات: [actual results; PASS/FAIL/BLOCKED/NOT RUN]
المشكلات المفتوحة: [critical/high issues and blockers]
الملفات المتغيرة: [repository-relative paths]
الخطوة التالية: [one specific plan-aligned task]
الالتزام بالخطة: [COMPLIANT / DEVIATION PROPOSED / BLOCKED, with explanation]
```
If nothing was modified, say so explicitly.

## 9. Baseline snapshot (2026-10-26)

| Item | Value |
|---|---|
| Branch | `master` |
| Local HEAD | `184aa6e0b96c93b278f909d63eb7f4a88d28b424` |
| `origin/master` | `806177477cb687d90b37fe04c4184cbaeaf1d0a1` (local ahead 1, unpushed) |
| Working tree | clean at plan adoption |
| Runtime | Node `v22.14.0`, npm `11.7.0` |
| Docker | `courtzon-backend`, `courtzon-frontend`, `courtzon-redis`, `courtzon-mysql`, `courtzon-grafana`, `courtzon-prometheus` — all up, four healthy |
| Local DB | `courtzon_v3` on container `courtzon-mysql` (host `127.0.0.1:3307`) — the approved test database; its data is user-declared disposable and cleared only at campaign end (Amendment A1) |
| Redis | `127.0.0.1:6379` |
| Local backend | `NODE_ENV=production`, `RELAX_RATE_LIMIT=false`, `PAYMENT_GATEWAY_PROVIDER=paymob`, `PAYMOB_SANDBOX=true` |
| Tooling | Playwright 1.60 + Chromium installed; Vitest 4; three independent npm projects |

### 9.1 Rollback strategy (defined, not yet exercised)

- The release line is protected by commit `184aa6e0` (local) with the last known pushed state at
  `8061774`. No history rewrite, rebase, or force-push is permitted.
- Code rollback: revert the offending commit (new commit) rather than resetting shared history.
- Database under Amendment A1: existing data is disposable test data; restore-before-campaign is
  optional. The controlled, explicitly authorized final cleanup replaces pre-campaign restoration.
- Docker rollback: previous image tag / rebuild from the reverted commit (Phase 9 authorization).

## 10. Existing-database test-safety specification (binding for Phases 1, 6, 7)

Approved strategy (Amendment A1): all testing uses the existing `courtzon_v3` database only.
No new database, directory, container, or duplicate test environment may be created.

1. **Exact target pinning.** Every test-writing path must resolve to `courtzon_v3` on
   `127.0.0.1`/`localhost`/`::1` port `3307`. Any other database name, host, or port is refused
   before a connection is opened. Environment variables may supply credentials, but cannot silently
   change the approved target.
2. **No silent defaults.** Seed/test scripts default to the local Docker MySQL (port `3307`), never
   to another instance (e.g., host XAMPP on `3306`) or an unexpected database.
3. **Controlled writes.** Tests may create/delete only records produced by the current test. They must
   not run whole-table destructive cleanup during individual tests or between suites.
4. **Destructive cleanup is deferred and explicit.** The single full cleanup runs only after the
   complete testing campaign and requires: the exact approved database, a fixed confirmation token,
   a non-empty campaign identifier, and an explicit call. `TRUNCATE`/FK-disable is forbidden during
   routine tests.
5. **Documented final cleanup procedure** (executed once, after campaign and user approval):
   - Stop test traffic and confirm the target is `courtzon_v3` @ `127.0.0.1:3307`.
   - Invoke the guarded cleanup with the explicit authorization object, e.g.:
     ```ts
     import { cleanup } from './e2e/helpers/database';
     import { DESTRUCTIVE_CLEANUP_CONFIRMATION } from './e2e/helpers/cleanup-guard';

     await cleanup({
       database: 'courtzon_v3',
       campaign: 'cztest-<UTC timestamp>-<run id>',
       confirmation: DESTRUCTIVE_CLEANUP_CONFIRMATION,
     });
     ```
   - Verify FK checks are re-enabled and record the resulting row-count/state evidence.
6. **Run marker** `cztest-<UTC timestamp>-<6 hex>` remains recommended for test-created rows so
   targeted review/deletion is possible before the final wipe.
7. **External effects** (Paymob, SMTP, SMS/WhatsApp, push, webhooks) remain mocked or disabled for
   data-changing runs where possible; Sandbox use requires explicit confirmation.
8. **No premature deletion.** The existing destructive helper
   `e2e/helpers/database.ts::cleanup()` requires explicit authorization and is never called by tests.

## 11. The ten mandatory phases

Each item has an ID used by the progress file. Evidence must be recorded for every `DONE` item.

### Phase 1 — Baseline and Test Environment Safety

| ID | Task |
|---|---|
| P1-01 | Record Git baseline (branch, HEAD, origin, working tree). |
| P1-02 | Record Docker/container baseline (IDs, status, ports). |
| P1-03 | Record runtime/tooling baseline (Node, npm, browsers, package managers). |
| P1-04 | Define rollback strategy (code, database, Docker) and store it. |
| P1-05 | Inspect all test setup/cleanup scripts and their side effects. |
| P1-06 | Design the existing-database (`courtzon_v3`) safety model (§10, Amendment A1). |
| P1-07 | Verify every test-writing path explicitly targets `courtzon_v3` @ `127.0.0.1:3307`. |
| P1-08 | Eliminate silent defaults to other MySQL instances/databases in seed/test scripts. |
| P1-09 | Enforce explicit, deferred destructive-cleanup authorization (no per-test TRUNCATE). |
| P1-10 | Document the one-time final cleanup and prove no premature destructive path. |

**Acceptance:** every test-writing path is pinned to `courtzon_v3` @ localhost:3307; destructive
cleanup is deferred and requires explicit authorization; the final cleanup procedure is documented;
baseline recorded.

### Phase 2 — Security Audit and Dependency Compatibility

| ID | Task |
|---|---|
| P2-01 | Capture current `npm audit` inventory (backend, frontend, root). |
| P2-02 | Document advisories with severity, affected range, fix, and reachability. |
| P2-03 | Build a compatibility matrix for backend upgrades. |
| P2-04 | Upgrade backend vulnerable dependencies in small compatible groups. |
| P2-05 | Verify backend build and affected tests after upgrades. |
| P2-06 | Build a compatibility matrix for frontend upgrades. |
| P2-07 | Upgrade frontend vulnerable dependencies in small compatible groups. |
| P2-08 | Verify frontend build and affected tests after upgrades. |
| P2-09 | Review auth/session/RBAC/CORS/CSP/rate-limit/HMAC/proxy-trust/DB-privilege/secrets controls. |
| P2-10 | Re-run audit and record remaining accepted risks with rationale. |

**Acceptance:** relevant security findings fixed or explicitly documented; builds and affected tests pass.

### Phase 3 — Frontend Defect Remediation

| ID | Task |
|---|---|
| P3-01 | Inventory all `react-hooks/rules-of-hooks` findings with file/line. |
| P3-02 | Fix `OrgAccountingRecordsPage` conditional gate before hooks. |
| P3-03 | Fix the remaining conditional-gate pages and the mid-render gate in `MessagesPage`. |
| P3-04 | Refactor `useRealtimeCacheUpdates` hook calls inside loops. |
| P3-05 | Replace role-string admin route guards with permission checks. |
| P3-06 | Triage other react-hooks rules individually (set-state-in-effect, refs, purity, etc.). |
| P3-07 | Establish a lint baseline and a CI gate that prevents regressions. |
| P3-08 | Prepare an incremental TypeScript strictness plan with measured error counts. |
| P3-09 | Add regression tests for each fixed frontend defect. |
| P3-10 | Re-verify affected finance/settlement/messaging flows. |

**Acceptance:** critical frontend defects fixed, tests pass, remaining findings classified and tracked.

### Phase 4 — Backend and Business Rules Audit

| ID | Task |
|---|---|
| P4-01 | Collect and reconcile existing business-rule audits and tests. |
| P4-02 | Audit authentication, sessions, RBAC, tenant/club isolation. |
| P4-03 | Audit bookings: conflicts, cancellations, expiry, concurrency. |
| P4-04 | Audit Marketplace inventory, overselling prevention, stock restoration. |
| P4-05 | Audit subscriptions, notifications, reports, background jobs. |
| P4-06 | Audit event publication, Socket.IO, idempotency, race conditions. |
| P4-07 | Verify accounting consistency across Marketplace/bookings/cash/card/settlements. |
| P4-08 | Document rules and add tests for normal/failure/concurrency/boundary cases. |
| P4-09 | Confirm no invented tables or unnecessary schema changes. |
| P4-10 | Produce the phase evidence package (rules + test results). |

**Acceptance:** critical workflows have documented rules and tests for normal, failure, concurrency, and boundary scenarios.

### Phase 5 — Payments, Accounting, and Settlements

| ID | Task |
|---|---|
| P5-01 | Map the full payment lifecycle states and build the test matrix. |
| P5-02 | Add webhook HMAC positive and negative tests. |
| P5-03 | Test mock-gateway failure/timeout/expiry/retry/duplicate/idempotency paths. |
| P5-04 | Confirm Paymob Sandbox configuration is safe and usable. |
| P5-05 | Run Sandbox lifecycle tests when P5-04 is confirmed. |
| P5-06 | Verify booking-slot protection against duplicate bookings. |
| P5-07 | Verify no duplicate accounting postings (idempotency). |
| P5-08 | Verify stock restoration, refunds, and reconciliation. |
| P5-09 | Verify gateway clearing, fees, payable balances, settlements. |
| P5-10 | Record evidence clearly distinguishing Sandbox vs mocked tests. |

**Acceptance:** no unexplained duplicate bookings, duplicate postings, incorrect settlement balances, or unhandled critical payment states.

### Phase 6 — Real UI and End-to-End Testing

| ID | Task |
|---|---|
| P6-01 | Inventory Playwright setup and safe read-only suites. |
| P6-02 | Persist the traceable scenario matrix (role, setup, action, expected, cleanup). |
| P6-03 | Confirm the approved test-DB target and safety gates are in place (Amendment A1). |
| P6-04 | Execute auth/session/role/permission scenarios. |
| P6-05 | Execute clubs/courts/academies/bookings/cancellations/conflicts. |
| P6-06 | Execute marketplace/inventory/payments/subscriptions/accounting. |
| P6-07 | Execute notifications/reports/settlements/admin workflows. |
| P6-08 | Execute responsive and accessibility checks. |
| P6-09 | Execute realtime and simultaneous-booking scenarios. |
| P6-10 | Record fixes and successful regression reruns. |

**Acceptance:** traceable matrix with actual results, failure evidence, fixes, and regression reruns.

### Phase 7 — Tests, Architecture Tools, and CI Security Gates

| ID | Task |
|---|---|
| P7-01 | Ensure integration tests explicitly target the approved DB and cannot silently drift. |
| P7-02 | Repair unsafe/misleading test scripts and cleanup routines. |
| P7-03 | Fix architecture-validator false positives with regression tests, without hiding violations. |
| P7-04 | Make secret scanning able to fail the pipeline. |
| P7-05 | Make dependency and container scans able to fail the pipeline. |
| P7-06 | Add webhook/upload/header/CORS/brute-force/rate-limit tests. |
| P7-07 | Add essential E2E smoke tests to CI. |
| P7-08 | Measure coverage baseline and set incremental ratchet thresholds. |
| P7-09 | Verify every CI check actually executes (no silent no-ops). |
| P7-10 | Produce the phase evidence package. |

**Acceptance:** CI trustworthy, test isolation verified, security checks cannot silently pass.

### Phase 8 — Performance, Quality, and UX

| ID | Task |
|---|---|
| P8-01 | Measure bundle sizes and loading performance. |
| P8-02 | Reduce bundle size / add code splitting where justified. |
| P8-03 | Review query performance. |
| P8-04 | Review background jobs and realtime behavior. |
| P8-05 | Review production logging and sensitive-data exposure. |
| P8-06 | Run an accessibility audit. |
| P8-07 | Review responsive behavior. |
| P8-08 | Review error, loading, and empty states. |
| P8-09 | Record remaining technical debt with severity and rationale. |
| P8-10 | Re-measure and record verified improvements. |

**Acceptance:** performance/UX issues measured, critical problems resolved, remaining debt recorded.

### Phase 9 — Docker Rebuild and Operational Verification

| ID | Task |
|---|---|
| P9-01 | Gate: all prior phases accepted. |
| P9-02 | Rebuild required backend/frontend images. |
| P9-03 | Recreate local containers. |
| P9-04 | Verify health checks, logs, DB/Redis connectivity, services. |
| P9-05 | Run critical smoke/regression tests against the Docker-built app. |
| P9-06 | Confirm payment configuration cannot use a live gateway. |
| P9-07 | Verify persistent volumes and data are intact. |
| P9-08 | Run post-build E2E smoke. |
| P9-09 | Rehearse rollback (image and database). |
| P9-10 | Produce the phase evidence package. |

**Acceptance:** rebuilt local stack operates correctly and passes post-build tests.

### Phase 10 — GitHub and Final Release Readiness

| ID | Task |
|---|---|
| P10-01 | Review final diffs, secrets, generated files, and artifacts. |
| P10-02 | Ensure Git history/commits are clear and auditable. |
| P10-03 | Run final build, type-check, lint, architecture gates. |
| P10-04 | Run final security scan gates. |
| P10-05 | Run final E2E acceptance gates. |
| P10-06 | Sign off the dependency audit. |
| P10-07 | Produce release notes, limitations, and risk register. |
| P10-08 | Obtain explicit user authorization to push. |
| P10-09 | Push to GitHub only after authorization. |
| P10-10 | Produce the final release-readiness report. |

**Acceptance:** all gates verified; push authorized and performed; report delivered. Deployment to
Hostinger/production requires separate explicit approval.

## 12. Change control and emergency deviations

- Any deviation from phase order requires: reason, risk, impact, proposed adjustment, and user
  acknowledgement recorded in the progress audit trail **before** proceeding.
- Emergency hotfixes are logged as phase items and back-filled with tests/evidence.
- Scope changes update the checklist denominator explicitly and are announced in the next report.

## 13. Known open findings routed to phases (from prior audits)

| Finding | Severity | Phase |
|---|---|---|
| All tests write to `courtzon_v3` (user-approved, Amendment A1); safety depends on exact target pinning + deferred explicit cleanup | Accepted risk (user decision) | 1, 6, 7 |
| 35 high-severity vulnerable package entries (19 backend incl. Fastify/static/nodemailer/sharp/zod; 16 frontend incl. axios/tiptap/react-router) | High | 2 |
| Secrets scan is `|| true`; ESLint never runs in CI; audit gate high-only; Trivy outdated | High | 7 |
| Conditional hooks in 8 finance/settlement pages + `MessagesPage`; 25 loop-hook calls | High | 3 |
| Webhook HMAC, upload magic-byte, headers/CORS, brute-force, rate-limit behavior untested | High | 5, 7 |
| DB root user; `setup-db-users.sql` unused; `trustProxy: true` + IP rate limiting | High | 2 |
| E2E never runs in CI; Playwright installed but unwired | Medium | 6, 7 |
| Coverage thresholds 3 %; `test:coverage` not in CI | Medium | 7 |
| Bundle 1.32 MB (311 KB gzip); no axe tooling; 41 `console.log` | Medium/Low | 8 |
| 26 EventBus + 5 Notification validator warnings (likely false positives, no regression tests) | Low | 7 |
| `docs/production-hardening.md` missing (referenced by AGENTS.md) | Low | 8 |

## 14. Review checklist for this document

- [x] All ten phases present with scope and acceptance criteria.
- [x] All 14 non-negotiable rules preserved.
- [x] Progress-tracking rules and status model preserved.
- [x] Both completion metrics defined; checklist items enumerated (100).
- [x] Required Arabic response format captured.
- [x] Database/test-isolation prohibition and safe cleanup design explicit.
- [x] Amendment A1 recorded: existing `courtzon_v3` only, no new DB/directories, deferred explicit cleanup.
- [x] Deployment requires separate approval.
- [x] Existing roadmaps acknowledged without duplication or deletion.
- [x] Baseline snapshot recorded without secrets.
