# CourtZon -- Release Roadmap (post-P8.7.14)

| Field | Value |
|---|---|
| Purpose | Proposed workstreams derived from P8.7.14.5 -- P8.7.14.13 evidence |
| Authority | **Subordinate** to [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md). No phase reordering is proposed here. |
| Baseline | `HEAD = 7b9ca362696269edc43a9ddfc64072cc54645904` (two local, unpushed commits: `75f3c16d` booking fix, `7b9ca362` baseline docs); local backend `sha256:5ae6bc915713...94aa` deployed from a dirty build context; 213 working-tree entries |
| Owners / dates | **Not assigned.** This roadmap intentionally carries no delivery dates or owners. |
| Status vocabulary | `Open` / `Planned` / `Blocked` / `Completed` (only `Completed` with executed evidence) |
| Related | [Release record](./P8.7.14_RELEASE_RECORD.md) - [Issues](./OUTSTANDING_ISSUES.md) - [Debt](./TECHNICAL_DEBT.md) - [Governance](./DEPLOYMENT_GOVERNANCE.md) |

Priorities are **agent recommendations** based on observed impact and current evidence, not owner commitments.
Plan phase references indicate where the item would fit if accepted.

---

## 1. Booking Engine & Data Integrity

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority (rationale) | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-BK-01 | `bookings.user_id` and `bookings.resource_id` have no FK; deleting a user or resource leaves readable-but-orphaned bookings | Declared ownership policy per column (soft delete vs. `SET NULL` vs. `RESTRICT`), enforced by schema and tested | Requires owner decision and a migration; must never add `CASCADE` to booking history | **High** -- prevents silent orphaning that already caused a 5-day worker error loop | Open | `information_schema.referential_constraints`; [TD-02](./TECHNICAL_DEBT.md) |
| RM-BK-02 | 22 orphan bookings from 16 deleted users; 5 became notification failures after the fix | Read-only reconciliation report, then an authorized repair decision (back-fill, archive, or leave) | Depends on RM-BK-01 decision; no PII exposure | **Medium** -- no financial impact, narrow user-visible notification gap | Open | [OI-01](./OUTSTANDING_ISSUES.md) |
| RM-BK-03 | Auto-complete worker only reports batch totals; individual failure detail is capped at 10 ids | Keep the bounded reporting, add counters/metrics for alerting | None | **Low** -- current reporting is already correct and bounded | Planned | `booking-auto-complete.worker.ts:26-75` |

---

## 2. Notifications & Real-time

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-NT-01 | Missing/hard-deleted recipients surface as level-50 FK errors | Recipient pre-validation with a classified skip outcome; completion and socket emission unaffected | Notification platform governance; must not mask genuine insert failures | **Medium** -- removes systemic noise, improves delivery metrics | Open | [TD-01](./TECHNICAL_DEBT.md) |
| RM-NT-02 | 52 `tournament:*` templates rewritten on every boot | Content-hash no-op detection; audit only real changes | Requires deterministic template serialization | **Low** -- benign at current scale | Open | [OI-02](./OUTSTANDING_ISSUES.md) |
| RM-NT-03 | Socket emission correctness for booking events with null branch/resource | Keep current behaviour and add a regression test asserting room targeting with `branchId = null` | None | **Low** -- code already guards nulls | Planned | `realtime/application/socket-event-mapper.ts` (`mapBookingEvent`) |

---

## 3. Payments & Gateway Reliability

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-PY-01 | Payment-success path for reachable-but-orphaned bookings was untested before the fix | Add a mocked regression test covering `payment:succeeded` with a booking whose `branch_id IS NULL` | None (mocked) | **Medium** -- closes the exact regression vector the release fixed | Planned | `booking-payment.listener.ts` L236-310 (traced in P8.7.14.11) |
| RM-PY-02 | Gateway webhook/HMAC negative paths remain untested (plan Phase 5/7 finding) | Negative-path tests for forged/duplicate webhooks | Sandbox access for full verification | **High** -- plan already routes this to Phases 5 and 7 | Open | Plan section 13 (known findings) |

---

## 4. Accounting & Settlements

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-AC-01 | Completed-but-unpaid bookings could theoretically drift toward settlement eligibility | Keep the existing "fulfilled **and** AVAILABLE entitlement" rule and assert it in a unit test | Accounting owner review | **Medium** -- rule verified today but not regression-tested | Planned | `booking-settlement.service.ts` (`deriveEntitlementEligibility`); 0 entitlements for the five bookings |
| RM-AC-02 | `booking:completed` must never post ledger entries | Add a guard test asserting no accounting subscription for `booking:completed` | None | **Low** -- verified by inspection, cheap to lock in | Planned | `accounting-event.listener.ts` subscription list |
| RM-AC-03 | Settlement pipeline never executed end-to-end (pre-existing handover finding) | Sandbox/UAT settlement run with evidence | Requires authorized test data | **High** -- unchanged plan risk | Open | `docs/HANDOVER_CURRENT/26_KNOWN_ISSUES.md` (historical) |

---

## 5. Security & Multi-Tenant Isolation

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-SEC-01 | Role/permission sync previously ran without target confirmation and across org-scoped roles | Keep the current confirmation gate + GLOBAL-only scope; add a test that an org-scoped role with a template slug is skipped | RBAC owner approval | **Medium** -- current image already correct, regression protection missing | Planned | `sync-role-permissions.mjs`; startup log (26 GLOBAL roles, org-scoped skipped) |
| RM-SEC-02 | DB traffic can silently fall back to plaintext when `DB_TLS_MODE` is unset in an unclassifiable environment | Keep fail-closed policy; document production requirement (`require` minimum) | Hostinger TLS certificate SAN (`verify-ca` blocked) | **High** before any production deploy | Open | `backend/scripts/db-tls.sh`; plan/records |
| RM-SEC-03 | Route-level authorization coverage for payments remains partial (plan Phase 5 finding) | Complete the authorization matrix for payment routes | Owner decision on permissions | **High** -- unchanged plan item | Open | Plan section 13 |

---

## 6. Database & Migrations

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-DB-01 | 22 unverifiable legacy checksums + 1 orphan history row + duplicate `filename` rows | Reconciliation annex with origin evidence; documented duplicate policy | No hash rewriting; owner approval for any index change | **Medium** -- auditability | Open | [OI-04](./OUTSTANDING_ISSUES.md) |
| RM-DB-02 | Migration runner consistency across images (missing `migrate.sh` in older image) | Build-time assertion that wrapper + shell engine + guard exist and agree | Image rebuild | **Medium** | Open | [TD-06](./TECHNICAL_DEBT.md) |
| RM-DB-03 | Static migration validation uses literal counts | Derive expectations from the runtime manifest | None | **Low** | Open | [TD-11](./TECHNICAL_DEBT.md) |

---

## 7. Testing & Quality Engineering

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-QA-01 | 12 backend unit failures from date dependence and working-tree drift | Fixed-clock fixtures; expectations derived from source of truth; green full suite | None | **High** -- a red suite hides real regressions | Open | [OI-03](./OUTSTANDING_ISSUES.md) |
| RM-QA-02 | Integration suite writes to the persistent dev database and needs Testcontainers | Explicit owner decision: guarded campaign cleanup or disposable DB | Plan Amendment A1 must be amended if isolation is chosen | **High** -- blocks trustworthy integration evidence | Open | [OI-09](./OUTSTANDING_ISSUES.md) |
| RM-QA-03 | Proxy contract expectations hard-coded | Single declarative source for nginx + Vite + test | None | **Low** | Open | [TD-10](./TECHNICAL_DEBT.md) |
| RM-QA-04 | Coverage thresholds at 3 % (plan Phase 7 finding) | Ratcheting thresholds on critical modules (booking, payments, accounting) | CI wiring | **Medium** -- unchanged plan item | Open | Plan section 13 |

---

## 8. DevOps, Docker & Disaster Recovery

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-DV-01 | Superseded image became unaddressable; only a 5-day-old rollback exists | Pre-deploy immutable tag, verified by ID, with a retention window and a restore drill | Registry/storage capacity | **Critical** -- without it, any bad deploy forces a functional regression | Open | [OI-05](./OUTSTANDING_ISSUES.md) |
| RM-DV-02 | `gitCommit = unknown` in the deployed image | `SOURCE_COMMIT` supplied for every build; asserted in `/health/version` | Build pipeline change | **Medium** -- traceability of what is running | Open | [OI-06](./OUTSTANDING_ISSUES.md) |
| RM-DV-03 | Booking fix committed (`75f3c16d`), but 213 other working-tree entries remain uncommitted and the deployed image was built from a **dirty build context**; the image is not reproducible from the current commits alone | Authorized, scoped commit of reviewed files; release record linked to commit; rebuild from a clean commit when Phase 9 authorizes it | User approval; staging only authorized paths | **High** -- reproducibility and audit | Open | [TD-13](./TECHNICAL_DEBT.md) |
| RM-DV-04 | Startup validator reports non-existent `courts`/`payments` every boot | Reconciled validator list with a unit test | None | **Low** | Open | [OI-07](./OUTSTANDING_ISSUES.md) |

---

## 9. Performance & Scalability

| ID | Problem / opportunity | Proposed outcome | Dependencies / risks | Suggested priority | Status | Evidence / source |
|---|---|---|---|---|---|---|
| RM-PF-01 | 52 template UPDATEs per boot and per-instance | No-op skip; measure boot write count | RM-NT-02 | **Low** | Open | Startup log evidence |
| RM-PF-02 | Worker runs every 5 minutes over all past-due confirmed bookings | Confirm index support for the candidate query and cap batch size if volume grows | Needs query plan measurement | **Low** -- current volume is 25 bookings | Open | `booking-auto-complete.worker.ts` candidate SQL |
| RM-PF-03 | Log noise at level 40/50 for benign conditions | Severity classification + counters (see TD-12) | Observability owner | **Medium** -- protects alert signal | Open | [TD-12](./TECHNICAL_DEBT.md) |

---

## Sequencing proposal (recommendation only)

1. **Stabilise the release signal** -- RM-QA-01, RM-DV-03, RM-DV-02 (get a green, reproducible, traceable baseline).
2. **Protect recovery** -- RM-DV-01 (immutable rollback), then a rollback rehearsal under authorization (plan P9-09).
3. **Close the data loop** -- RM-BK-01/RM-BK-02 (orphan policy + reconciliation), RM-NT-01 (recipient validation).
4. **Decide test isolation** -- RM-QA-02 before any integration/E2E campaign continues (plan Phase 6/7 gate).
5. **Production prerequisites** -- RM-SEC-02 (TLS policy), payment/webhook negative paths (RM-PY-02), settlement UAT
   (RM-AC-03), then plan Phase 9 acceptance and Phase 10 authorization.

None of the above implies a change to the approved ten-phase order; each item is mapped to the phase that already owns
that concern.
