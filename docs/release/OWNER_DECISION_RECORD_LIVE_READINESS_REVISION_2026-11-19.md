# CourtZon Live — Owner Decision Record — Revision 2026-11-19

> **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**
>
> This is a **separate revision document**. The original draft
> `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_DRAFT_2026-11-19.md` is preserved unchanged.
> Nothing in this revision signs, amends or replaces that original, and nothing here grants authorization to access Live.

| Field | Value |
|---|---|
| Document | `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` |
| Status | **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED** |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local, documentation-only preparation |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Branch / expected HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` (confirmed at preparation) |
| Source of decisions | Owner decisions **D-01…D-15 communicated in ChatGPT on 2026-11-19**; **D-16 pending final owner signature**. Label for each: *"Owner decision communicated in ChatGPT — 2026-11-19; pending final signature in D-16."* |
| Scope | Local-only documentation update recording the decisions for a **future** Live Read-Only UAT wave (UR-03 / UR-07). **No Live execution is authorized.** |
| Effect | **None.** No immediate Live access, no state change, no identity change, no deployment. D-01 is conditional on identity, authentication and §5.5 readiness; D-16 remains pending. |

---

## 1. Current status — recorded without change

| Item | Status (unchanged) |
|---|---|
| Phase 6 | **5/10** |
| Phase 7 | **10 %** |
| Overall completion | **56 %** |
| UR-03 | **BLOCKED** |
| UR-07 | **BLOCKED** |
| W1 Gate Out | **NOT MET** |
| Test Constitution §5.5 Transition Gate | **NOT PASSED** |

No percentage, phase, blocker or gate status is changed by this revision. No progress record or historical evidence was edited.

---

## 2. Independent authorization channels — preserved

**Approval of D-01 does not authorize immediate Live access.** It records approval in principle for a *future* read-only wave, conditional on completing identity, authentication and §5.5 readiness. D-16 (final owner signature) is pending, and §5.5 remains **NOT PASSED**.

| Channel | What it would permit | Current state | Gate |
|---|---|---|---|
| **A — Live read-only wave** | A future GET-only verification wave for UR-03 / UR-07 | **APPROVED IN PRINCIPLE (D-01) — NOT EXECUTABLE** — identity, authentication and §5.5 readiness incomplete; final signature pending | D-01 + D-04 verification + D-05 authentication + D-16 signature + §5.5 readiness |
| **B — Option A+ deployment to Live** | Deploying commit `f1fc4d60518b63e68834de42071982427913575c` to Live | **NOT AUTHORIZED (D-12)** | Separate explicit deployment decision required |
| **C — Write-enabled UAT / §5.5 transition** | Any write scenario, role/permission change, data mutation | **NOT AUTHORIZED (D-14)** — §5.5 gate **NOT PASSED** | Separate decision; never implied by D-01…D-15 |
| **D — Identity provisioning** | Account creation, role/permission assignment, password reset, suspension/deletion | **NOT AUTHORIZED** | Not granted by D-01…D-15 |

Rules in force:

- **D-01 does not authorize deployment** (Channel B), **identity provisioning** (Channel D), **role or permission changes**, or **write-enabled UAT** (Channel C).
- **D-12 explicitly withholds Option A+ deployment to Live**; a separate explicit decision is required.
- **D-14 explicitly withholds write-enabled UAT** and all account, role, permission or business-data mutations.
- There is **no implicit transition** from W1 read-only discovery to write-enabled testing (Constitution §5.3, §5.5).
- No current Live account availability, authentication method, OTP delivery, actor validity or owner signature is assumed. Owner decisions D-01…D-15 are **communicated but pending final signature in D-16**.

---

## 3. Owner decisions D-01 to D-15 — as communicated

> **Label for every entry in this section: "Owner decision communicated in ChatGPT — 2026-11-19; pending final signature in D-16."** No entry below is a signed project record.

| # | Decision | Recording state / remaining condition |
|---|---|---|
| **D-01** | **APPROVED** — A future Live Read-Only wave for UR-03 / UR-07, conditional on completing **identity, authentication, and §5.5 readiness**. No write access and no deployment. | Conditional approval only; **no immediate Live access**. Readiness not yet complete; §5.5 **NOT PASSED**. |
| **D-02** | **APPROVED** — Nominate `TEST_SUPERADMIN`, user ID **126**, as the **positive actor candidate**. | Nomination only; current availability **NOT VERIFIED**; D-04 verification pending. |
| **D-03** | **APPROVED** — Nominate `qa.acc@courtzon.test` as the **negative actor candidate**. | Nomination only; current availability **NOT VERIFIED**. |
| **D-04** | **APPROVED** — Future safe verification of user 126's **current availability, active roles, expiry status, and global platform scope**. **No credential or OTP discovery.** | Verification not performed in this task; method must be owner-controlled. |
| **D-05** | **APPROVED** — OpenCode performs **all permitted automated preparation and execution**. If **human authentication or OTP intervention** is required, **stop and request the owner's intervention**. Never discover, extract, store, or bypass credentials or OTP. | Execution remains gated by D-01 readiness, D-16 signature and §5.5; stop-and-ask rule governs any auth requirement. |
| **D-06** | **APPROVED** — Proposed **UR-03** scenarios: dashboard visibility; Quick Actions; Action Center; direct-navigation denial; unknown admin-route denial. Proposed **UR-07** scenario: multi-role badge verification for user 126. Use `qa.acc@courtzon.test` for negative access checks. **No writes or data changes.** | Scenarios approved as proposed; not executed; filtering limitation in §4.1 remains. |
| **D-07** | **APPROVED** — Scope is **Platform / Global only**. **No organisation or branch scope. No cross-tenant probing. No access to other organisations' business data.** | Scope frozen by decision; no org/branch IDs apply. |
| **D-08** | **APPROVED** — Data boundaries: **GET requests only**; no create, update, delete or other mutations; no unnecessary personal or financial data access; no bulk data downloads; only data strictly necessary for the approved scenarios may be inspected. **Exact allowed endpoint selection has been documented and APPROVED by the owner on 2026-11-19 (§3.2).** | Rules frozen. **Endpoint selection APPROVED by owner on 2026-11-19** — exact six-endpoint decision recorded in §3.2. E-02 evidence restricted to HTTP status and request ID; Response Body not retained. This is **not** authorization to execute any endpoint. |
| **D-09** | **APPROVED** — Evidence method: screenshots; accessibility snapshots; HTTP status classification; request IDs. Redact personal data, credentials, cookies, tokens and secrets. Store evidence in a dedicated project evidence folder. **Do not create that folder or any evidence files in this task.** | **Exact evidence storage path: PENDING FINAL CONFIRMATION** — no dedicated project evidence folder is established in existing local documentation. No folder or evidence file created. |
| **D-10** | **APPROVED** — Responsibility: **OpenCode** — technical preparation and execution of permitted tasks; **Project owner** — authorization, identity control and decisions; **ChatGPT** — review of reports and governance compliance. | No personal name invented. **Backup: PENDING** — not documented. |
| **D-11** | **APPROVED IN PRINCIPLE; EXECUTION WINDOW PENDING** — the execution window will be determined later, after readiness and §5.5 requirements are satisfied. | **Final UTC start/end and stop conditions still required before Live execution.** No times invented. |
| **D-12** | **NOT AUTHORIZED** — Option A+ deployment to Live is not authorized at this time. | A **separate explicit deployment decision** is required. |
| **D-13** | **APPROVED** — The **16 QA accounts remain unchanged** and are **not automatically authorized** for this or future testing. | Historic F-002 owner decision (2026-11-14) is preserved in `COURTZON_RELEASE_PROGRESS.md` §33.7.6. **F-002 remains OPEN**; not closed by this decision. |
| **D-14** | **NOT AUTHORIZED** — No write-enabled UAT. No account, role, permission or business-data mutations. | §5.5 remains **NOT PASSED**. |
| **D-15** | **APPROVED** — Explicitly exclude **payments, settlements, wallet mutations, refunds, bookings and booking mutations, and all financial and business mutations**. | Exclusion recorded; no such operation is in scope. |

### 3.1 D-16 — PENDING (owner final signature only)

| Field | State |
|---|---|
| Decision ID | **PENDING** |
| Effective date/time (UTC) | **PENDING** |
| Owner signature / initials | **PENDING** |
| Final owner confirmation | **PENDING** |

The document remains **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**. OpenCode does not sign on behalf of the owner. Owner approval of D-01…D-15 does **not** mean §5.5 has passed and does **not** approve immediate Live access.

### 3.2 D-08 / B-08 endpoint allowlist — OWNER APPROVED (2026-11-19)

The project owner explicitly approved the following **exact endpoint selection** for the future Live Read-Only wave (UR-03 / UR-07). This approval is recorded under **D-08 / B-08** and supersedes every earlier CONDITIONAL or PENDING endpoint suggestion in the allowlist proposal.

| # | Endpoint | Owner decision (2026-11-19) |
|---|---|---|
| E-01 | `GET /admin/dashboard` | **INCLUDE** |
| E-02 | `GET /admin/dashboard/trends` | **INCLUDE as an automatic request; record HTTP Status and Request ID only. Do not retain, store, copy into logs/evidence, or otherwise collect the Response Body.** The frontend issues this request automatically (`AdminDashboard.tsx:35–38`); the approval does **not** imply it can be suppressed. |
| E-03 | `GET /auth/me` | **EXCLUDE** |
| E-04 | `GET /my/permissions` | **EXCLUDE from this wave** |
| E-05 | `GET /my/scopes` | **EXCLUDE from this wave** |
| E-06 | `GET /users/:userId/roles` | **EXCLUDE** |

**Scope of this approval — explicitly distinguished:**

| Item | State |
|---|---|
| D-08 / B-08 endpoint selection | **APPROVED by owner (2026-11-19)** — the six decisions above are final for this wave. |
| E-02 Response Body | **PROHIBITED as evidence** — status and request ID only; no body retention, storage, logging, or collection. |
| Formal D-16 signature, Decision ID, effective UTC time | **PENDING** — no Decision ID, signature, initials, or timestamp is fabricated by this record. |
| Constitution §5.5 Transition Gate | **NOT PASSED** — approval of endpoint selection does not pass the gate or approve W1. |
| W1 Gate Out | **NOT MET** |
| Live endpoint execution / Live access | **NOT AUTHORIZED** — approval of the list is not approval to execute any endpoint or scenario. |
| Option A+ deployment / write-enabled UAT | **NOT AUTHORIZED (D-12 / D-14)** |

The owner's test-data confirmation for the test environment is recorded and is not re-opened. No scenario is executed and no gate is passed by this record.

---

## 4. Local-only actor readiness matrix

All entries are **historical documentation facts or explicit unknowns**. **No Live access, no login, no DB/SQL query and no current availability check was performed.** "NOT VERIFIED" is the only honest classification for current state.

| Attribute | `TEST_SUPERADMIN` / user 126 | `qa.acc@courtzon.test` | Dashboard-capable partial-permission actor |
|---|---|---|---|
| Historical documented roles | `player` + `super_admin` (`48_TEST_IDENTITIES_CREATED.md` §6–§8: global `super_admin` via guarded `POST /user-roles`, 2026-10-05) | `player` + `accountant`; **199 permissions**; `platform.admin=false` (`COURTZON_RELEASE_PROGRESS.md` §38.2, 2026-11-18 Live review) | **No such identity is documented** |
| Historical documented scope | **Global** — no `user_role_scopes` row; org 35 / branch 21 belong to other TEST users | Non-platform / accountant scope; denied `/admin/dashboard` in 2026-11-18 review | Would require platform-scope dashboard access **plus** missing individual action permissions |
| Multi-role documented? | **YES VERIFIED (historical)** — two roles documented and DB-verified at creation | **YES VERIFIED (historical)** — `player` + `accountant` | N/A — not documented |
| Current availability (account active, credentials valid, session possible) | **NOT VERIFIED** — historical creation only; no current evidence | **NOT VERIFIED** — historical review only; no current evidence | **NOT VERIFIED / DOES NOT EXIST IN RECORDS** |
| Role activity / expiry from local docs (`ur.is_active`, `ur.expires_at`, `r.is_active`, `r.deleted_at`) | **NOT VERIFIED** — creation-time DB verification only; current values unknown and intentionally not queried | **NOT VERIFIED** — not enumerated in records | **NOT VERIFIED** |
| Global platform scope established for current state? | **NOT VERIFIED** — D-04 verification not yet performed; historical global scope is not current proof | **NO** — `platform.admin=false` documented historically; current state NOT VERIFIED | N/A |
| UR-03 dashboard visibility (positive) | **SUITABLE CANDIDATE**, conditional on D-04 and authentication readiness | Not suitable — historically denied dashboard | Not required for positive case |
| UR-03 Quick Actions / Action Center filtering | **Positive-only**: `super_admin` holds `*` and sees every action; cannot demonstrate omission | **NOT OBSERVABLE** — 403 → `AdminDataErrorState` return before badge/actions render | **REQUIRED for a complete pair — MISSING / BLOCKED** |
| UR-03 direct-navigation denial / unknown admin route | Not a negative actor | **SUITABLE CANDIDATE** for negative checks, conditional on availability; `canAccessAdminPath` denies unmapped routes and accountant is on the admin deny-list | N/A |
| UR-07 multi-role badge | **SUITABLE CANDIDATE** — only documented multi-role super_admin; badge code renders all roles (`roles.join(' · ')`, `AdminDashboard.tsx:112–119`); unobservable while dashboard is denied | **NOT SUITABLE** — badge never renders on denied dashboard | N/A |
| Remaining blockers | D-04 verification; D-05 authentication method; evidence storage path (D-09); backup (D-10); final UTC window/stop conditions (D-11); D-16 signature. **D-08 GET endpoint selection APPROVED 2026-11-19 (§3.2) — no longer a blocker.** | Authentication method; evidence path (D-09); backup (D-10); UTC window/stop conditions (D-11); availability; D-16 signature. **D-08 endpoint selection approved — no longer a blocker.** | No documented actor; creating one is prohibited (Channel D NOT AUTHORIZED); filtering remains BLOCKED for Live |

### 4.1 Backend dashboard guard — hard constraint (source-verified, read-only)

`backend/src/modules/rbac/presentation/rbac.routes.ts:65–68`:

```ts
// Dashboard — super admin stats (accept both hyphen and underscore forms)
const dashboardGuard = requireRole(['super_admin', 'super-admin']);
app.get('/admin/dashboard', { preHandler: [dashboardGuard] }, ctrl.getDashboardStatsHandler);
app.get('/admin/dashboard/trends', { preHandler: [dashboardGuard] }, ctrl.getDashboardTrendsHandler);
```

`frontend/src/pages/admin/AdminDashboard.tsx:40–50` returns `AdminDataErrorState` on any dashboard/trends error **before** the role badge (line 114–119), Quick Actions (line 95–97) and Action Center (line 147–154) render.

`frontend/src/permissions/adminRoutePermissions.ts:153–160` denies unmapped paths (`required !== null && can(required)`); `super_admin` passes via `*`.

Consequences, stated explicitly:

1. **Quick Actions / Action Center filtering cannot be verified for a restricted actor on Live** with the available candidates: a restricted actor is rejected by the unchanged backend `requireRole(['super_admin','super-admin'])` and never reaches those components.
2. **The positive super_admin actor sees all actions** (permission `*`), so it cannot demonstrate that unauthorized actions are omitted.
3. Therefore UR-03 filtering evidence is **BLOCKED for Live** until a dashboard-capable partial-permission actor is approved and provisioned by the owner — **not** by weakening or bypassing the backend guard, and **not** by OpenCode creating an actor.
4. **Local automated tests are not Live evidence.** `COURTZON_RELEASE_PROGRESS.md` §40 records locally passing suites (164 affected frontend tests; 1 backend active-role regression; full frontend and backend suites) and §38.2 shows only the denial path observed on Live. Any locally testable assertion must be labelled `local-only, not Live evidence`.
5. No change to `requireRole(['super_admin','super-admin'])` is proposed or permitted.

---

## 5. §5.5 Transition Gate checklist — NOT PASSED

Source: `docs/release/COURTZON_TEST_CONSTITUTION.md` §5.5 (seven mandatory items). Statuses use VERIFIED / NOT VERIFIED / BLOCKED / OWNER DECISION REQUIRED. **The gate is not marked passed.**

| # | §5.5 requirement | Current evidence (local docs) | Status | Exact remaining action | Locally completable? |
|---|---|---|---|---|---|
| 1 | W1 output reviewed and **explicitly approved** | `W1_READONLY_DISCOVERY_REPORT_2026-11-14.md` §10: **NOT MET**; `COURTZON_RELEASE_PROGRESS.md` §33.5: **NOT MET**; 8 S2 open; F-002 open by owner decision. D-01 approves a *future wave*, not the W1 output. | **OWNER DECISION REQUIRED** | Record explicit written approval (who / when / scope) of the W1 output in the project record | **NO — owner** |
| 2 | Freeze **write-scenario list** | D-06 lists read-only scenarios only; **D-14 = NOT AUTHORIZED for write-enabled UAT**, so the write-scenario list is explicitly empty for this wave | **VERIFIED — empty list recorded (D-14)** | None for this wave; any future write scenario requires a new decision and a full §5.5 package | Documentation — already recorded |
| 3 | Freeze **target test accounts** | D-02 / D-03 nominate user 126 and `qa.acc@courtzon.test`; **D-04 verification approved but not yet performed**; availability of both actors **NOT VERIFIED** | **OWNER DECISION REQUIRED** | Complete owner-controlled D-04 verification, confirm both actors, then freeze named accounts | **NO — owner-controlled verification** |
| 4 | Freeze **target organisations / branches** | **D-07 APPROVED** — Platform / Global only; no organisation or branch scope; no cross-tenant probing; no access to other organisations' business data | **VERIFIED — scope frozen by D-07** | Record the frozen scope in the final gate record (D-16) | Documentation — already recorded |
| 5 | Freeze **data boundaries** (created / modified / untouched) | **D-08 APPROVED** — GET-only, no mutations, no unnecessary personal/financial data, no bulk downloads, only strictly necessary data. **Exact GET endpoint selection APPROVED by owner 2026-11-19 (§3.2)**: E-01 INCLUDE; E-02 automatic, status + request ID only, Response Body not retained; E-03/E-04/E-05/E-06 EXCLUDED. | **VERIFIED** — boundary rules and endpoint selection approved; E-02 body prohibition recorded | None for endpoint selection. §5.5 as a whole remains **NOT PASSED** (items 1, 3 and 7 remain open). | Documentation — completed for this item; no Live execution authorized |
| 6 | Freeze **expected side effects and rollback/containment** for each write scenario | **D-14 = no write scenarios**; Constitution §5.2 requires `N/A` for read-only side-effect/rollback fields; all §6 scenarios record `N/A` | **VERIFIED — `N/A` recorded (read-only)** | None for this wave; if a write scenario is later proposed, freeze expected side effects and rollback **before** execution | Documentation — already recorded |
| 7 | **Gate approval record** (who / when / scope) | No §5.5 approval entry exists; **D-16 pending** — decision ID, effective UTC time, signature and final confirmation all pending | **OWNER DECISION REQUIRED** | Owner completes D-16 and records the gate approval (who / when / scope) | **NO — owner** |

### 5.1 Information still needed to freeze the wave

| Item | State after D-01…D-15 | Remaining information | Can be completed locally? |
|---|---|---|---|
| Actors | D-02 / D-03 nominations recorded | D-04 owner-controlled verification of user 126; availability of both actors; no partial-permission actor documented | **NO** — owner-controlled verification / provisioning |
| Scenarios | D-06 approved UR-03 / UR-07 scenario list | Record final scenario IDs in the gate record; keep filtering limitation explicit | Documentation — already drafted |
| Scope | **D-07 frozen** — Platform / Global only, no org/branch scope, no cross-tenant probing | Record frozen scope in D-16 | Documentation — already recorded |
| Data boundaries | **D-08 rules frozen** and **endpoint selection APPROVED 2026-11-19 (§3.2)**: E-01 INCLUDE; E-02 automatic/status-only with no Response Body; E-03/E-04/E-05/E-06 EXCLUDED | No endpoint-selection decision remains; D-09 evidence path and the other items in this table remain pending | Documentation — endpoint selection completed; no execution authorized |
| Expected side effects | `N/A` recorded for all read-only scenarios (§5.2) | None for this wave; mandatory freeze before any future write scenario | Documentation — already recorded |
| Authentication / OTP | D-05 stop-and-ask rule recorded | Owner-controlled method; human intervention must be requested, never discovered | **NO — owner** |
| Evidence collection/storage | **D-09 method approved** (screenshots, a11y snapshots, HTTP status classification, request IDs, redaction) | **Exact evidence storage path: PENDING FINAL CONFIRMATION** — no dedicated folder established in local docs; no folder/file created in this task | **NO — owner confirmation** |
| Responsible person | **D-10 roles recorded** (OpenCode / owner / ChatGPT) | **Backup: PENDING** — no personal name invented | **NO — owner** |
| Execution window | **D-11 APPROVED IN PRINCIPLE** | Final **UTC start/end** and **stop conditions** required before Live execution | **NO — owner** |
| Payment / financial-mutation exclusions | **D-15 APPROVED** — payments, settlements, wallets, refunds, bookings and all financial/business mutations excluded | None for this wave | Documentation — already recorded |
| Rollback / containment | `N/A` for read-only (D-14) | Mandatory freeze if any future write scenario is proposed | Documentation — already recorded |
| Gate approval / signature | **D-16 PENDING** | Decision ID, effective UTC time, owner signature/initials and final confirmation | **NO — owner only** |

**§5.5 remains NOT PASSED. No gate approval is recorded.** Owner approval of D-01…D-15 **and of the D-08 endpoint selection** does not change this.

---

## 6. Proposed read-only scenario matrix — DOCUMENTATION ONLY, NOT EXECUTED

No scenario below has been run, and no scenario below is claimed as PASS. All are proposals pending D-16 final signature, D-04 verification, D-11 execution window and §5.5 readiness; **D-08 endpoint selection was approved by the owner on 2026-11-19 (§3.2), which grants no execution authorization**. **No Live access is authorized by this section.** All evidence collection, if ever authorized, must follow D-09 (screenshots, accessibility snapshots, HTTP status classification, request IDs, redaction of personal data/credentials/cookies/tokens/secrets) into a dedicated evidence folder whose exact path is pending final confirmation.

| ID | Actor candidate | Preconditions | Read-only action | Expected result | Evidence to collect | Stop conditions | Known limitations |
|---|---|---|---|---|---|---|---|
| UR-03-01 | User 126 (positive) | D-04 verification complete; owner-controlled auth; **D-16 final signature**; D-01 readiness satisfied | Navigate to `/admin/dashboard`; observe render | Dashboard renders (historically super_admin-only backend guard); role badge visible | Screenshot + a11y snapshot + HTTP status class + request ID (D-09); redaction applied | Any auth discovery; any write; 403/5xx contrary to expectation; OTP required → stop and ask owner | Current availability NOT VERIFIED; Option A+ deployment NOT AUTHORIZED (D-12), Live bundle state unverified |
| UR-03-02 | `qa.acc@courtzon.test` (negative) | Actor availability verified; owner-controlled auth; D-16 signature | Navigate to `/admin/dashboard` | `Access denied` / dashboard-data error surface; no dashboard content (historical §38.2 baseline) | Screenshot + a11y snapshot + 403 status class + request ID (D-09); no token/cookie capture | Any login/session created before approval; any data change | Historical denial only; current state NOT VERIFIED |
| UR-03-03 | User 126 (positive) | UR-03-01 renders | Inspect Quick Actions list | All actions visible for `*` permission actor | Screenshot + a11y snapshot of visible labels/links only (D-09) | N/A | **Cannot verify filtering** — positive actor has all permissions; no restricted dashboard-capable actor exists |
| UR-03-04 | User 126 (positive) | UR-03-01 renders | Inspect Action Center list | All cards visible for `*` actor | Screenshot + a11y snapshot of visible labels only (D-09) | N/A | Same limitation as UR-03-03; local unit tests are not Live evidence |
| UR-03-05 | `qa.acc@courtzon.test` (negative) | Actor availability verified; D-08 endpoint selection approved (2026-11-19, §3.2) | Direct-navigate to representative `/admin/*` paths (e.g. `/admin/users`, `/admin/roles`, unmapped path) | `Access denied`; no unauthorized data shown; unmapped path denied by fail-closed map | Screenshot + a11y snapshot per path + HTTP status class + request ID (D-09) | Any write; cross-tenant ID probing; credential discovery | Exact direct-navigation path list is a separate frontend-route item, not part of the approved GET endpoint allowlist (§3.2); current permission set NOT VERIFIED |
| UR-03-06 | `qa.acc@courtzon.test` (negative) | Actor availability verified; D-08 endpoint selection approved (2026-11-19, §3.2) | Direct-navigate to a non-existent `/admin/*` route | Denied surface, not a data page or redirect loop | Screenshot + a11y snapshot + status/route-map classification (D-09) | Same as UR-03-05 | Unmapped-route behavior depends on deployed bundle; deployment NOT AUTHORIZED (D-12) |
| UR-07-01 | User 126 (positive) | Dashboard renders (UR-03-01); multi-role assignments active/unexpired per D-04 | Observe header role badge on dashboard | All assigned roles shown, e.g. `player · super_admin`, not only the first role | Screenshot + a11y snapshot of badge text + request ID (D-09); no PII | Any guard bypass; any permission/role change; stop if auth intervention needed | Badge unobservable on denied dashboard (§38.2); current role activity/expiry NOT VERIFIED; D-04 not performed |

All scenarios above record **expected side effects: `N/A`** and **rollback/containment: `N/A`** (read-only by design, per Constitution §5.2). If any write scenario is added later, these fields must be frozen before execution and §5.5 must be passed.

---

## 7. Explicit prohibitions — in force until a signed decision exists

1. No Hostinger Live or production access, browser navigation, API call, health check, version probe or login attempt.
2. No session creation or refresh; no cookie, token, credential, password or OTP discovery, extraction, storage or bypass.
3. No database connection or query, including read-only SQL; no migration, seed, backup or restore.
4. No account creation/deletion/activation/suspension, password reset, role or permission assignment/modification.
5. No payment, wallet, booking, refund, settlement or other business/financial mutation.
6. No application code or configuration change; no edit to existing governance records or historical evidence; no edit to `opencode.json`.
7. No tests, no Docker build/restart/recreate/image change.
8. No Git commit, push, reset, checkout, stash, clean, or other history/working-tree operation.
9. No deployment or Coolify/Hostinger action (D-12: Option A+ deployment **NOT AUTHORIZED**).
10. No execution of any scenario in §6, and no implicit W1 → write-enabled transition (D-14).
11. No creation of an evidence folder or evidence files in this documentation task (D-09); exact storage path pending final confirmation.
12. No payments, settlements, wallet/refund/booking mutations or other financial/business mutations (D-15).

If human authentication or OTP intervention is required (D-05), **stop and request the owner's intervention**.

---

## 8. Sources inspected locally (read-only)

| Source | Use |
|---|---|
| Owner decisions D-01…D-15 communicated in ChatGPT on 2026-11-19; D-16 pending | Decisions recorded in §3; no signed project record is claimed |
| `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_DRAFT_2026-11-19.md` | Original draft — preserved unchanged |
| `docs/release/COURTZON_TEST_CONSTITUTION.md` §5.2, §5.3, §5.5, §6 | Gate requirements, read-only side-effect rule, role/scope rules |
| `docs/release/COURTZON_RELEASE_PROGRESS.md` §33.5, §33.6, §33.7.1, §33.7.6, §37.1, §38.1, §38.2, §40 | Statuses, W1 exit gate, QA-account decision, UR-03/UR-07 blockers, Option A+ scope and local verification |
| `docs/release/W1_READONLY_DISCOVERY_REPORT_2026-11-14.md` §10, Appendix A/B | W1 NOT MET, evidence method, tooling guardrails |
| `docs/release/E2E_SCENARIO_MATRIX.md` §3.4c | D4 actor set / historical Live read-only execution |
| `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` §3–§8 | TEST_* identities, roles and scopes; user 126 global scope |
| `backend/src/modules/rbac/presentation/rbac.routes.ts:65–68` | Backend dashboard guard — unchanged `requireRole(['super_admin','super-admin'])` |
| `frontend/src/pages/admin/AdminDashboard.tsx:23–50, 87–97, 112–119, 146–154` | Early error return, Quick Actions/Action Center gating, all-role badge |
| `frontend/src/components/dashboard/ActionCenter.tsx:33–37, 78–82` | `canAccess` + `can` filtering for both components |
| `frontend/src/permissions/adminRoutePermissions.ts:11–14, 126–161` | Fail-closed route map; `platform.admin` for `/admin` landing |

---

## 9. Preservation statement

This revision was prepared earlier as a standalone record. In this synchronization task, **exactly three authorized documents were edited**: this revision (D-08 §3, new §3.2, §4, §5 and §6), `LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md`, and `LIVE_READONLY_GET_ENDPOINT_ALLOWLIST_PROPOSAL_2026-11-19.md` — solely to record the owner's D-08 endpoint-selection approval. The original decision draft, `COURTZON_RELEASE_PROGRESS.md`, all historical governance/evidence records and all source files are unchanged. The pre-existing uncommitted `opencode.json` modification was preserved exactly as found. No Live access, login, session, credential/OTP discovery, DB query, test, endpoint execution, evidence folder/file, Docker operation, Git operation or deployment was created or performed. Owner decisions D-01…D-15 are recorded as communicated; the D-08 endpoint selection is **APPROVED**; D-16 remains **PENDING** and OpenCode has not signed on behalf of the owner.

---

**DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**
