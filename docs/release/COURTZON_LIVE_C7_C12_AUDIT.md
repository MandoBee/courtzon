# CourtZon Live — C7–C12 Inventory UAT Audit

| Field | Value |
|---|---|
| Document | `docs/release/COURTZON_LIVE_C7_C12_AUDIT.md` |
| Execution date | 2026-11-16 23:43–23:54 UTC |
| Target release | `19c685d239471e1ca1dc81e0513d6003b94465fe` |
| Addendum A19 date | 2026-11-17 |
| Addendum A19 release | `5742fb45b2576a9583596de9fb56a20b7b69575e` (later verification; the original C7–C12 target remains `19c685d2…`) |
| Environment | Hostinger VPS / Coolify — production |
| Frontend | `https://www.courtzon.cloud` |
| API | `https://api.courtzon.cloud` |
| Execution mode | Read-only Live UAT (no writes, no deploys, no config changes) |
| Scenario authority | `docs/release/E2E_SCENARIO_MATRIX.md` §3.3a (C7–C12) |
| Overall result | **INCOMPLETE — NOT ACCEPTED** for the **C7–C12 audit scope** (partial PASS; 4 scenarios BLOCKED/NOT EXECUTED). Addendum **A19** records a separate Scenario A result: **PASS 6/6**; Scenarios **B and C remain BLOCKED**. |

> All times are UTC. No credentials, cookies, authorization headers, tokens or
> personal data are reproduced in this document. Every Inventory API call listed
> was a `GET`; the only non-GET observed in the session was the application's own
> `POST /auth/refresh` (session maintenance, HTTP 200), not a business write. No
> `POST`/`PUT`/`DELETE` was issued against any business endpoint.

---

## 1. Production deployment identification

| Evidence | Value | Source |
|---|---|---|
| Deployed commit | `19c685d239471e1ca1dc81e0513d6003b94465fe` | `GET https://api.courtzon.cloud/health/version` |
| `gitCommitConsistent` | `true` | same |
| `gitCommitSource` | `image` | same |
| Build time | `2026-11-16T23:27:38Z` | same |
| `applicationVersion` | `1.0.0` | same |
| `expectedMigration` | `211_inventory_p1_permissions_grants` | same |
| `nodeVersion` | `v22.23.5` | same |
| `/health` | **200** | `GET https://api.courtzon.cloud/health` |
| `/health/ready` | **200** | `GET https://api.courtzon.cloud/health/ready` |
| Served frontend entry bundle | `assets/index-Mr2JQhh_.js` | `GET https://www.courtzon.cloud/` |

Deployment identity **matches the intended release commit** (`19c685d2`) and is
newer than the previously observed `591df819` build (`2026-11-16T04:46:45Z`).

**Not verifiable without Coolify access:** container IDs, image digests, service
topology per service (MySQL / Backend / Frontend / Prometheus / Grafana),
deployment logs, and which individual services were rebuilt for this commit.
Marked **UNKNOWN** (no Coolify UI/API credentials were available to this audit;
no Coolify action was attempted).

---

## 2. Frontend and Backend deployment status

| Layer | Status | Evidence |
|---|---|---|
| Backend | **Serving `19c685d2`**, healthy | `/health/version` (`gitCommit` + `buildTime`), `/health` 200, `/health/ready` 200 |
| Backend migration state | `expectedMigration = 211` (owner confirmed 211 `[up]` on the production database; **not re-run by this audit**) | `/health/version` + owner statement |
| Frontend | **Serving a bundle that contains the A1/A2/B1 implementation** | bundle marker inspection (below) |
| Frontend container health | Not directly observable (no Coolify access) → **UNKNOWN**; HTTP 200 and app renders | `GET https://www.courtzon.cloud/` |

### 2.1 Deployed-bundle verification (A1 / A2 / B1)

| Fix | Marker searched in served assets | Result |
|---|---|---|
| **A1** nav AND-gate | `requiresPermission` in `assets/index-Mr2JQhh_.js` | **FOUND** (16 occurrences) |
| **A1** route map | ``inventory: `platform.admin` `` in `assets/AdminLayout-By6pjT4J.js` | **FOUND** (1 occurrence) |
| **A2** allowlist text | `Your role does not include this Inventory permission` in `assets/InventoryOrgContext-Xa_r--I_.js` | **FOUND** |
| **A2** generic fallback | `You don't have permission to perform this action` in same chunk | **FOUND** |
| **B1** read-only transfers | `inventory.transfers.view` + `inventory.transfers.complete` in `assets/InventoryPage-BjtfTaps.js` | **FOUND** |

This proves the release artefacts are live; it does **not** substitute for
per-role behavioural verification (see C7/C10/C11).

---

## 3. Authentication status

| Item | Value |
|---|---|
| Session used | Super Admin (entered manually by the owner in the opened browser) |
| Role displayed in admin shell | `super_admin` |
| Credentials/OTP/tokens handled by this audit | **None** (never requested, read, recorded or stored) |
| Additional role sessions available | **None** — `org-admin`, `marketplace-manager`, `accountant`, `receptionist`, `auditor`, `read-only-admin` were not available |
| Session lifetime actions | No login/logout performed by the audit; no account or permission changes |

---

## 4. C7–C12 scenario results

| ID | Scenario | Result | Coverage note |
|---|---|---|---|
| C7 | Inventory navigation and sidebar permission gating | **PARTIAL PASS** | `super_admin` fully verified; the 6 non-platform roles **BLOCKED** (no sessions) |
| C8 | Inventory API authorization matrix across the seven roles | **PARTIAL PASS** | `super_admin` admin-surface verified (7 endpoints, 200); organisation-scoped endpoints **NOT EXECUTED** (no org membership for the session); 6 roles **BLOCKED** |
| C9 | Organization isolation | **PARTIAL — NOT EXECUTED (core)** | Unauthenticated control **PASS** (401); cross-organisation denial and non-existent-organisation control **NOT EXECUTED** (require a non-platform role session; no UI trigger exists for the platform-admin session) |
| C10 | Transfers read-only access and independent write-action permissions | **PARTIAL PASS** | `super_admin` tab/form/empty-state verified; per-row Complete/Cancel **NOT VERIFIED** (no pending transfer on Shop 1); view-only role separation **BLOCKED** |
| C11 | Auditor / read-only-admin UI–API authorization consistency | **BLOCKED** | No `auditor` / `read-only-admin` session available |
| C12 | Inventory write-operation denial and safety controls | **BLOCKED — PRODUCTION WRITE APPROVAL REQUIRED** | Denial verification would require `POST`/`PUT` attempts against production |

> No scenario is recorded as PASS where the expected result could not be
> observed end-to-end.

> **Post-remediation RBAC verification (2026-11-17): Scenario A — PASS (6/6).**
> The authenticated organisation-role denial checks are recorded in **A19**
> below, and are linked to the earlier blocked attempts (A14/A15/A18). The
> C7–C12 statuses in this table are **unchanged**.

---

## 5. Evidence for every executed test

### C7 — `super_admin` (executed)

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| C7-1 | Open `https://www.courtzon.cloud/admin` | Admin shell loads | Shell rendered, role badge `super_admin`, 9 domain groups | **PASS** |
| C7-2 | Expand **Facilities** | Inventory entry present | `Inventory ▶` present | **PASS** |
| C7-3 | Expand **Inventory** | 4 children | Stock Levels → `/admin/inventory/stock`; Warehouses → `/admin/inventory/warehouses`; Suppliers → `/admin/inventory/suppliers`; Purchase Orders → `/admin/inventory/purchase-orders` | **PASS** |
| C7-4 | Navigate `https://www.courtzon.cloud/admin/inventory` | Redirect to `/admin/inventory/stock` | Final URL `/admin/inventory/stock` (client-side redirect; document HTTP 200) | **PASS** |
| C7-5 | Open `/admin/inventory/stock`, select organisation `Shop 1` (id 25) | Page renders org selector + tabs + data | Heading **Stock Levels**, selector with 21 organisations, 4 tabs, 11 stock rows rendered | **PASS** |

Observed stock rows (Shop 1): `WLS-OG-B=90`, `ASC-WPS-38=6`, `ASC-WPS-39=8`,
`ASC-WPS-40=4`, `PUM-CS-L=15`, `HDP-PPR-L=8`, `PUM-CS-M=15`, `NKE-SB-N=3`,
`HDP-PPR-S=12`, `WLS-OG-W=60`, `NKE-SB-W=2`.

**C7 non-platform roles:** not executed — no sessions for `auditor`,
`read-only-admin`, `org-admin`, `marketplace-manager`, `accountant`,
`receptionist`. **BLOCKED.**

### C8 — `super_admin` admin surface (executed)

| # | Endpoint (GET) | Status | Body summary | Result |
|---|---|---|---|---|
| C8-1 | `/admin/inventory/organisations` | **200** | 21 organisations, `requiresExplicitSelection: true` | **PASS** |
| C8-2 | `/admin/inventory/stock?orgId=25&page=1&limit=20` | **200** | `total: 11`, `limit` honoured, rows scoped to org 25 | **PASS** |
| C8-3 | `/admin/inventory/warehouses?orgId=25&page=1&limit=20` | **200** | `{"data":[],"total":0}` | **PASS** |
| C8-4 | `/admin/inventory/suppliers?orgId=25&page=1&limit=20` | **200** | `{"data":[],"total":0}` | **PASS** |
| C8-5 | `/admin/inventory/purchase-orders?orgId=25&page=1&limit=20` | **200** | `{"data":[],"total":0}` | **PASS** |
| C8-6 | `/admin/inventory/stock/logs?orgId=25&page=1&limit=20` | **200** | `{"data":[],"total":0}` | **PASS** |
| C8-7 | `/admin/inventory/variants/search?orgId=25&q=WLS` | **200** | 2 variants (`WLS-OG-B` 90, `WLS-OG-W` 60) | **PASS** |

**Not executed:** organisation-scoped routes (`/org/25/inventory/*`) — the
`super_admin` session has no organisation membership; `/org/25/inventory`
redirects to `/admin` (verified). The remaining six roles were not testable.

### C9 — unauthenticated control (executed)

| # | Endpoint | Status | Body |
|---|---|---|---|
| C9-1 | `GET /org/25/inventory/access` (no cookies) | **401** | `AUTHENTICATION_ERROR` |
| C9-2 | `GET /admin/inventory/stock?orgId=25` (no cookies) | **401** | `AUTHENTICATION_ERROR` |
| C9-3 | `GET /admin/inventory/organisations` (no cookies) | **401** | `AUTHENTICATION_ERROR` |

Also observed: `https://www.courtzon.cloud/admin` and
`https://www.courtzon.cloud/admin/inventory/stock` redirect to `/login` when
unauthenticated.

**Not executed:** cross-organisation denial with a *non-platform* role, the
`403 Organisation not found` control, and the UI denial surface for another
organisation — these require a second role session (BLOCKED) or an
organisation-scoped endpoint trigger that the platform-admin session does not
provide.

### C10 — `super_admin` transfer tab (executed)

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| C10-1 | Open the **Transfer Stock** tab | Tab visible | Tab visible and active | **PASS** |
| C10-2 | Observe creation form | Form visible for a write-capable role | `Transfer Stock Between Warehouses` form + submit present (`super_admin` holds `inventory.stock.manage` / `inventory.transfers.create`) | **PASS** |
| C10-3 | Observe pending list | Pending list rendered | `GET /admin/stock-transfers?orgId=25&status=pending` → **200** `{"data":[]}` | **PASS** |
| C10-4 | Observe empty state | `No pending transfers`, no row actions | `No pending transfers` shown; no row action buttons exist (no rows) | **PASS** |
| C10-5 | Per-row **Complete** / **Cancel** visibility | Visible per capability | **Not observable** — Shop 1 has no pending transfer, and creating one is a production write (prohibited) | **NOT VERIFIED** |

**Not executed:** permission separation for `transfers.view`-only,
`transfers.create`, `transfers.complete`, `transfers.cancel` roles (no
sessions), and the error/retry path (would require forcing a failed request).

### C11 — auditor / read-only-admin (blocked)

Not executed. No session exists for `auditor` or `read-only-admin`; creating
sessions or changing roles is prohibited. Deployed-bundle evidence (A1 nav gate,
A1 route map, A2 allowlist) is recorded in §2.1 but is **not** accepted as a
substitute for UI/API behaviour under those roles.

### C12 — write denial (blocked)

Not executed. Verifying `403` on
`POST …/stock/adjust`, `POST …/stock/transfer`,
`POST …/stock-transfers/:id/complete|cancel`, and warehouse/supplier/PO
mutations requires issuing production `POST`/`PUT` requests. This audit used
**GET only**. **BLOCKED — PRODUCTION WRITE APPROVAL REQUIRED.**

Read-only observation: the write controls are visible only because the session
is `super_admin` (positive control); no write was attempted.

---

## 6. Failures and root-cause analysis

**Confirmed defects: none.**

No unexpected `4xx/5xx` responses were observed for the executed requests, no
frontend console errors were raised for the Inventory screens
(`console: 0 errors` in the session summary), and every executed expectation
matched the documented behaviour.

**Observations (not defects of this release):**

| # | Observation | Classification | Detail |
|---|---|---|---|
| O1 | Production organisation selector lists test artefacts (`TEST_ORG`, `TEST_SHOP`, `CZ QA Shop 20261031`, `CZ QA Club 20261031`) alongside real shops | Data hygiene (pre-existing) | Visible to platform admins only; affects clarity, not authorisation |
| O2 | `variants/search` matches SKU/variant name only (`q=WLS` → 2 rows; product-name queries return none) | Behavioural limitation (documented in the local UAT) | Same behaviour as the local build; not a regression |
| O3 | `/org/25/inventory` redirects a `super_admin` to `/admin` | Expected design (platform admins are not organisation members) | Prevents organisation-scoped verification with this session only |

---

## 7. Blocked scenarios and reasons

| ID | Blocked part | Reason | Required to unblock |
|---|---|---|---|
| C7 | 6 non-platform roles | No `auditor` / `read-only-admin` / `org-admin` / `marketplace-manager` / `accountant` / `receptionist` sessions | Owner-supplied credentials for existing production accounts (entered manually) or an approved read-only impersonation mechanism |
| C8 | Organisation-scoped matrix, 6 roles | Same as C7 + `super_admin` has no organisation membership | Same as C7 |
| C9 | Cross-organisation denial (`403`), non-existent org control, UI denial surface | Requires a non-platform role session; the platform-admin session bypasses scope | Same as C7 |
| C10 | View-only role separation; per-row Complete/Cancel visibility; error/retry | Requires those role sessions and an organisation with ≥1 **pending** transfer | Role sessions + owner approval to use an existing pending transfer (or to create a test transfer) |
| C11 | Entire scenario | Requires `auditor` and `read-only-admin` sessions | Same as C7 |
| C12 | Entire scenario | Requires production write attempts (denied-path) | Explicit written approval for a controlled denial-test window, or acceptance of code/unit evidence instead |

---

## 8. Production risks

| # | Risk | Severity | Note |
|---|---|---|---|
| R1 | **Role-level authorisation unverified in production** — the core of A1/A2/B1 (hiding Inventory from `auditor`/`read-only-admin`, accurate 403 text, read-only transfers) has only been proven by deployed-bundle inspection, not by live role behaviour | **High** | The remediation's purpose is role behaviour; without those sessions the release cannot be declared accepted |
| R2 | **C12 write-denial unverified** | Medium | Backend guards are unit-tested, but production denial was not exercised |
| R3 | **No Coolify-level deployment evidence** (service rebuild scope, image digests, logs) | Medium | A commit-consistent backend is proven; per-service rebuild status is not |
| R4 | **Production test-data presence** (QA shops/orgs in the admin selector) | Low | Pre-existing data hygiene |
| R5 | **Pending-transfer path never exercised in production** | Low | Row-level Complete/Cancel remain unproven on Live |
| R6 | Migration 211 confirmed `[up]` by the owner but not re-verified by this audit (no DB access permitted) | Low | Treated as owner-verified |

---

## 9. Recommended remediation steps

1. **Provide read-only role sessions** (owner-entered credentials) for
   `auditor`, `read-only-admin`, `org-admin`, `marketplace-manager`,
   `accountant`, `receptionist` — this unlocks C7 (remaining 6 roles), C8 (full
   matrix), C9 (cross-org denial), C10 (capability separation) and C11.
2. **Choose one of two paths for C10's row actions:**
   - use an existing organisation that already has a pending transfer, read-only; or
   - approve a single controlled test transfer on a dedicated QA organisation
     (write approval) and delete/void it under the standard change process.
3. **C12 decision:** either approve a controlled denial-test window (expect
   `403`, zero state change) or formally accept code + unit-test evidence and
   record the residual risk.
4. **Coolify evidence:** capture (read-only) the deployment record, service
   image digests and build logs for `19c685d2` and attach to this document.
5. Do **not** mark P6-06 `DONE` or claim the Inventory module passed until C7,
   C8, C9, C10, C11 and C12 each have executed evidence.

---

## 10. Final acceptance assessment

| Criterion | Status |
|---|---|
| Intended release is live (`19c685d2`) | **PASS** |
| Backend health / readiness | **PASS** |
| Deployed frontend contains A1 / A2 / B1 | **PASS** (artefact-level) |
| C7 navigation gating (all 7 roles) | **PARTIAL** — 1 of 7 roles executed |
| C8 API matrix (all 7 roles) | **PARTIAL** — platform-admin surface only |
| C9 organisation isolation | **PARTIAL** — unauthenticated control only |
| C10 transfers read/write separation | **PARTIAL** — platform-admin tab only |
| C11 auditor/read-only consistency | **BLOCKED** |
| C12 write-denial controls | **BLOCKED** |

### **Assessment: NOT ACCEPTED — INCOMPLETE**

The release is **deployed and healthy**, and the A1/A2/B1 code is verifiably
present in the served bundles. However, the Inventory UAT scenarios that define
acceptance (C7–C12) were executed only for the `super_admin` surface, with four
scenarios still **BLOCKED** or **NOT EXECUTED** for role-level behaviour and
write-denial. The Inventory module **cannot** be declared passed.

**No production business writes, deployments, restarts, migrations, permission
changes or configuration changes were performed during this audit.** The only
non-GET request observed was the application's own `POST /auth/refresh` (session
maintenance), triggered by the application after the owner's manual sign-in.

---

# ADDENDUM — 2026-11-17 00:00–00:47 UTC (role-by-role completion attempt)

> This addendum **preserves every result above** and appends the second execution
> phase (post-deployment of `19c685d2`, multi-role attempts). Nothing in the
> original sections was removed or rewritten.

## A11. Deployed release re-confirmed

| Evidence | Value |
|---|---|
| `/health/version` | `gitCommit: 19c685d239471e1ca1dc81e0513d6003b94465fe`, `gitCommitConsistent: true`, `buildTime: 2026-11-16T23:27:38Z`, `expectedMigration: 211_…` |
| Frontend entry bundle | `assets/index-Mr2JQhh_.js` |
| A1 in bundle | `requiresPermission` (16 occurrences) + `inventory: platform.admin` route map in `AdminLayout-By6pjT4J.js` |
| A2 in bundle | allowlist sentence + generic fallback in `InventoryOrgContext-Xa_r--I_.js` |
| B1 in bundle | `inventory.transfers.view` / `.complete` in `InventoryPage-BjtfTaps.js` |
| `/health`, `/health/ready` | **200**, **200** |

## A12. Sessions obtained (existing accounts only; no accounts created)

| Role | Account (display name) | Login result | Roles observed |
|---|---|---|---|
| super_admin | owner's account (owner-entered) | 200 | `super_admin` |
| auditor | **QA Auditor** | 200 | Auditor, Player |
| read-only-admin | **QA Read Only** | 200 | Read Only Admin, Player |
| accountant | **QA Accountant** | 200 | Accountant, Player |
| org-admin | — | **NOT AVAILABLE** | no account exists; provisioning blocked (A14) |
| marketplace-manager | — | **NOT AVAILABLE** | no account exists; provisioning blocked (A14) |
| receptionist | — | **NOT AVAILABLE** | no account exists; provisioning blocked (A14) |

Existing QA accounts were identified from the Live `/admin/users` list (display
names, masked phones): `QA Auditor`, `QA Read Only`, `QA Accountant`,
`QA Finance Manager`, `QA Master Admin`. No account was created, modified or
deleted. Passwords are never reproduced in this document.

## A13. Executed results (Live, read-only UI)

| # | Role | Action | Expected | Actual | Result |
|---|---|---|---|---|---|
| A13-1 | auditor | `/admin` → **Facilities** | Inventory hidden | Facilities listed Reception, All Bookings, Sports Engine, Sports, Amenities, Community Events — **no Inventory** | **PASS** |
| A13-2 | auditor | Direct `/admin/inventory` | Access denied | **Access denied** surface shown; URL stays `/admin/inventory` | **PASS** |
| A13-3 | auditor | Direct `/admin/inventory/stock` | Access denied | **Access denied** surface shown | **PASS** |
| A13-4 | auditor | `/org/25/inventory` | No organisation access | Redirected to `/admin`; no organisation data rendered | **PASS** |
| A13-5 | auditor | Network capture on the three URLs above | No `/admin/inventory/*` request | **Zero inventory requests** (no 403 storm) | **PASS** |
| A13-6 | read-only-admin | `/admin` → **Facilities** | Inventory hidden | No Inventory entry (six other Facilities modules listed) | **PASS** |
| A13-7 | read-only-admin | `/admin/inventory/stock` | Access denied | **Access denied** surface | **PASS** |
| A13-8 | read-only-admin | `/org/25/inventory` | No organisation access | Redirected to `/admin` | **PASS** |
| A13-9 | read-only-admin | Network capture | No inventory requests | Zero inventory requests | **PASS** |
| A13-10 | accountant | `/admin` sidebar | No admin Inventory surface | Sidebar shows Dashboard / Commerce / Finance only — **no Facilities, no Inventory** | **PASS** |
| A13-11 | accountant | `/admin/inventory/stock` | Access denied | **Access denied** surface | **PASS** |
| A13-12 | accountant | `/org/25/inventory` | No organisation access | Redirected to `/admin` | **PASS** |
| A13-13 | accountant | Network capture | No inventory requests | Zero inventory requests | **PASS** |

Re-run of the local authorisation suites for C12 evidence:

```
backend: inventory-admin-authorization + inventory-org-access
       + inventory-routes-contracts + inventory-security
Test Files  4 passed (4) · Tests 127 passed (127)
```

## A14. Provisioning attempt and exact blocker

The owner authorised creating dedicated `QA TEST - …` accounts, but **no supported
UI path exists** to grant them organisation-scoped roles on Live:

1. `/admin/users` supports **edit/delete only** — no create action
   (`frontend/src/pages/admin/users/UserListPage.tsx`); account creation requires
   public self-registration.
2. The admin user-edit **"Roles & Orgs"** tab can assign either a **global role
   with no organisation scope** ("No Organization") or an **existing organisation
   role clone**. For both `Shop 1` (id 25) and `CZ QA Shop 20261031` (id 38) the
   only available clone is **`Shop Admin (shop-admin)`**.
3. Organisation-scoped staff provisioning requires `POST /org/:orgId/staff`,
   guarded by `checkOrgManage()` which allows only the **organisation owner**,
   **super_admin**, or a role holding **`org.staff.manage`** scoped to that
   organisation (`backend/src/app.ts:348-374`). `org.staff.manage` is granted only
   by the `org-admin` template (`ORG_ADMIN_EXPLICIT_KEYS`).
4. `super_admin` cannot reach the organisation portal — `/org/38/staff` and
   `/org/25/staff` redirect to `/admin` (client-side org portal guard), so the
   platform-admin exemption cannot be exercised through the UI.
5. The Shop 1 seed owner (`01610101011`, a `*.mseed@test.local` seed account) was
   attempted **twice** with the documented seed password and the owner-agreed
   test password; both returned `Invalid credentials` (2 attempts remaining).
   **No further attempts were made** to avoid lockout.
6. The organisation **staff page** offers only `org-admin`, `branch-mgr`,
   `resource-mgr`, `shop-admin`, `coach`, `accountant`
   (`OrgStaffPage.tsx:11-18`) — it cannot create `marketplace-manager` or
   `receptionist` staff roles even with an owner session.

**Exact missing prerequisite:** either (a) credentials for the owner of the
stock-bearing test shop (`Shop 1`, owner display name "Shop One Owner"), or
(b) an owner/org-admin session that can add members through
`/org/25/staff`, or (c) an explicit owner-run membership insertion for the QA
accounts (direct SQL is currently prohibited).

Organisation stock observation: `CZ QA Shop 20261031` = **0** variants,
`CZ QA Club 20261031` = **0** variants; `Shop 1` = **11** variants
(`TEST/MARKETPLACE-SEED …`, i.e. test data).

## A15. Revised scenario status

| ID | Original status (§4) | Status after addendum | Reason |
|---|---|---|---|
| C7 | PARTIAL PASS | **PARTIAL PASS (4 of 7 roles)** | super_admin, auditor, read-only-admin, accountant verified; org-admin / marketplace-manager / receptionist **BLOCKED** (A14) |
| C8 | PARTIAL PASS | **PARTIAL PASS** | super_admin admin-surface verified (7 endpoints, 200). Organisation-scoped matrix unreachable for every other role (no membership; super_admin has none). 6 roles **BLOCKED/NOT EXECUTED** |
| C9 | PARTIAL — NOT EXECUTED (core) | **PARTIAL** | Unauthenticated 401 **PASS**; UI denial for auditor/read-only/accountant on `/org/25/inventory` → redirect with no data **PASS**; API-level cross-organisation `403` message (A2) **NOT EXERCISED** (no role with org A access) |
| C10 | PARTIAL PASS | **PARTIAL PASS** | super_admin tab/form/empty state + `GET …/stock-transfers` 200 verified; read-only separation and row actions **BLOCKED** (requires an org-scoped role and a pending transfer) |
| C11 | BLOCKED | **PASS (auditor, read-only-admin)** | Both roles: no menu entry, Access denied on direct URLs, zero inventory XHR, org URL redirect. A2 on-screen 403 text **NOT EXERCISED** (no reachable 403 surface) |
| C12 | BLOCKED | **BLOCKED** | No production write/POST was issued; local authorisation suites **127/127 PASS** used as evidence |

## A16. Risks from this phase

| # | Risk | Severity | Note |
|---|---|---|---|
| A16-1 | Three required roles remain untestable due to missing org-owner credentials | **High** | Blocks C8/C9/C10 coverage; not a product defect |
| A16-2 | Two failed logins on the Shop 1 seed owner (2 attempts remaining) | Medium | Do not retry without the correct credential |
| A16-3 | A2 on-screen 403 text still has no Live role-level evidence | Medium | Route gating (A1) prevents any 403 from being displayed to these roles; only bundle + unit tests cover it |
| A16-4 | `shop-admin` clone exists for the test shops but carries no `inventory.*` grants | Low | Confirms inventory is org-admin/MM/accountant/receptionist territory |

## A17. Final assessment (supersedes §10 only for status, not for evidence)

| Criterion | Status |
|---|---|
| Release `19c685d2` live and healthy | **PASS** |
| A1/A2/B1 present in served bundles | **PASS** (artefact level) |
| C7 — 7-role gating | **PARTIAL (4/7 roles)** |
| C8 — API matrix | **PARTIAL (platform-admin surface only)** |
| C9 — organisation isolation | **PARTIAL (unauthenticated + UI denial; API 403 not exercised)** |
| C10 — transfers read/write separation | **PARTIAL (platform-admin only)** |
| C11 — auditor / read-only consistency | **PASS** |
| C12 — write-denial | **BLOCKED** (local 127/127 evidence) |

### **Assessment: NOT ACCEPTED — INCOMPLETE**

Verified on Live: A1 hides and blocks the Inventory surface for `auditor`,
`read-only-admin` and `accountant` with **zero** inventory API calls, and the
organisation URL leaks nothing. Remaining gaps are **role provisioning**
(org-admin / marketplace-manager / receptionist) and **write-denial** evidence.
No production business writes were performed in this phase; no deployments,
restarts, migrations, permission or configuration changes were made.

---

## A18 — Organization Role Provisioning Investigation (2026-11-17, read-only)

### A18.1 Root cause

| # | Finding | Evidence |
|---|---|---|
| 1 | The only role-assignment UI is **Admin → Users → Edit → “Roles & Orgs”**; it lists **existing organisation role clones only** for a selected organisation | `frontend/src/pages/admin/users/UserEditModal.tsx:178-183` (`orgRoleOptions`), `:521-587` |
| 2 | On the Live test shops the **only** available clone is `Shop Admin (shop-admin)` — verified in the browser for `Shop 1` (id 25) and `CZ QA Shop 20261031` (id 38) | Live UI inspection, `getAssignableOrgRole` allowlist below |
| 3 | Organisation staff provisioning is `POST /org/:orgId/staff`, guarded by `checkOrgManage()` | `backend/src/modules/organisations/presentation/org-portal.routes.ts:33`; `backend/src/app.ts:348-374` |
| 4 | `checkOrgManage()` allows **organisation owner**, **super_admin**, or a role holding **`org.staff.manage` scoped to the organisation** | `backend/src/app.ts:348-374`; `org.staff.manage` is granted only via `ORG_ADMIN_EXPLICIT_KEYS` (`role-permission-templates.ts`) |
| 5 | The backend restricts org staff roles to **six slugs**: `org-admin`, `shop-admin`, `branch-mgr`, `resource-mgr`, `coach`, `accountant` | `backend/src/modules/organisations/infrastructure/repositories/org-portal.repository.ts:157` (`ASSIGNABLE_ORG_ROLE_SLUGS`), enforced at `:212` |
| 6 | `marketplace-manager` **and `receptionist` are NOT in that allowlist** ⇒ they cannot be cloned/assigned as organisation staff, by API or UI | same allowlist; staff UI mirrors it (`frontend/src/pages/org/OrgStaffPage.tsx:11-18`) |
| 7 | `super_admin` passes `checkOrgManage()` at the **API** level but cannot reach the org portal in the browser: `OrgRoute` requires `user.organisations.length > 0`, and the platform admin has none ⇒ redirect | `frontend/src/App.tsx:363-370`; observed Live (`/org/25/staff`, `/org/38/staff` → `/admin`) |
| 8 | `POST /user-roles` (super_admin only) **does** accept `scopes` and persists them via `setUserRoleScope` | `backend/src/modules/rbac/presentation/rbac.dto.ts:13-19`; `rbac.service.ts:279-285`; `rbac.repository.ts:307` |
| 9 | But `checkPermission()` **ignores `user_role_scopes`** — permissions are unioned across every active role | `backend/src/app.ts:266-283`; contrast with the stricter `hasOrganisationPermission()` in `rbac.repository.ts` |
| 10 | Therefore assigning the **global** `marketplace-manager` role (even with an org scope) would also grant its **platform** permissions (`marketplace.` pattern includes `marketplace.admin.*`, platform sidebar keys) | `role-permission-templates.ts:534-548` (`MARKETPLACE_MANAGER_PATTERNS`) |

**Root cause:** the architecture supports organisation membership only through
**org-role clones**, and the clone/assignment surface is limited to six role
slugs that exclude two of the three roles required by the Inventory UAT. The
generic “global role + organisation scope” path exists in the API but the UI
does not expose it, and using it directly would over-grant platform permissions
because permission checks are scope-blind.

### A18.2 Is the role model itself complete?

| Role | Exists as global role | Has permission template | Org-assignable (clone) | Inventory policy grants |
|---|---|---|---|---|
| `org-admin` | ✅ | ✅ | ✅ | ✅ (15 keys) |
| `marketplace-manager` | ✅ | ✅ | ❌ | ✅ (9 keys) |
| `receptionist` | ✅ | ✅ | ❌ | ✅ (3 keys) |

The **roles and their permission sets exist**; only the **org-membership
provisioning** for two of them is missing. This is a **product limitation in the
provisioning surface**, not a missing role definition.

### A18.3 Documented QA provisioning workflow

`docs/HANDOVER_CURRENT/47_TEST_IDENTITY_CREATION_BLUEPRINT.md` (2026-10-05)
defines an API-first TEST_* blueprint:

- `TEST_ADMIN` = org-admin (cloned for TEST_ORG)
- `TEST_RECEPTIONIST` = **receptionist** (TEST_ORG) — *documented, but not achievable today*
- `TEST_ACCOUNTANT` = accountant
- Cloning via `cloneRoleForOrg` + `assignRole` + `setUserRoleScope`; **no marketplace-manager identity is defined anywhere in the blueprint**.

The blueprint predates the `ASSIGNABLE_ORG_ROLE_SLUGS` allowlist (introduced in
`1daca9fb`) and is therefore **stale for receptionist**; there is no documented
workflow for `marketplace-manager`.

### A18.4 QA organisations (Live, read-only)

| Organisation | Id | Observed inventory | Suitability |
|---|---|---|---|
| `CZ QA Shop 20261031` | 38 | **0** variants; only `shop-admin` clone | QA-named, isolated — **safe**, needs inventory seeding for C10 |
| `CZ QA Club 20261031` | 37 | **0** variants | QA-named — safe |
| `TEST_ORG` / `TEST_SHOP` | 35 / 36 | not inventoried in this phase | Test-named; treat as QA |
| `Shop 1` | 25 | **11** variants (`TEST/MARKETPLACE-SEED …`) | Stock-bearing **test** shop (seed data); owner is a `*.mseed@test.local` seed account |

No genuine customer organisation was inspected or touched.

### A18.5 Supported provisioning options (evaluated in order)

| # | Method | org-admin | marketplace-manager | receptionist | Verdict |
|---|---|---|---|---|---|
| 1 | Admin UI “Roles & Orgs” | ❌ no clone on test shops | ❌ | ❌ | insufficient |
| 2 | Org staff UI (owner/org-admin session) | ✅ | ❌ allowlist | ❌ allowlist | insufficient |
| 2b | Admin API `POST /org/:orgId/staff` (super_admin allowed) | ✅ | ❌ allowlist | ❌ allowlist | partial |
| 2c | Admin API `POST /user-roles` + `scopes` | ✅ | ⚠️ yes, but grants **global** permissions | ⚠️ same | unsafe for MM; evaluate for receptionist |
| 2d | Admin API `POST /roles` (org clone) + `PUT /roles/:id/permissions` + `/user-roles` | possible | possible (manual permission set) | possible (manual) | high effort, error-prone |
| 3 | Documented QA blueprint (47) | ✅ | ❌ not defined | ⚠️ documented but blocked by allowlist | stale |
| 4 | Direct SQL | proposal only | proposal only | proposal only | last resort |

### A18.6 Recommended solution

1. **No-code, immediate (for UAT only):** the owner (or an engineer using the
   owner's super_admin session) calls the **existing** admin API
   `POST /org/:orgId/staff` for `org-admin`/`accountant`
   (`{ email, roleSlug }`) — audited, filtered clone, org scope.
   This covers `org-admin` and `accountant` safely.
2. **Code change (recommended, for MM/receptionist):** add
   `marketplace-manager` and `receptionist` to `ASSIGNABLE_ORG_ROLE_SLUGS`
   (`org-portal.repository.ts:157`) and to the staff UI list
   (`OrgStaffPage.tsx:11-18`) **if** they are intended organisation roles.
   The existing `cloneRoleForOrg` path already filters platform permissions via
   `canOrgRoleReceivePermission`, writes `user_role_scopes`, and records
   `ORG_STAFF.ADD` — so this is the safest and most consistent fix.
3. **Alternative UI fix:** expose “global role + organisation scope” in the admin
   Roles & Orgs screen. Not recommended while `checkPermission()` remains
   scope-blind, because it would grant platform permissions globally.
4. **Do not** use the global-role-with-scope path for `marketplace-manager`
   during UAT without accepting the platform-permission exposure.

### A18.7 SQL proposal (NOT executed — approval required)

Only if no supported path is approved:

| Item | Detail |
|---|---|
| Tables | `roles` (org clone), `role_permissions` (filtered subset), `user_roles`, `user_role_scopes` |
| Intended org | `CZ QA Shop 20261031` (id 38) or `Shop 1` (id 25, stock-bearing) |
| Intended roles | `marketplace-manager`, `receptionist` (cloned with `organisation_id = <org>`) |
| Permission filter | must replicate `canOrgRoleReceivePermission(roleSlug, key)` — never copy platform keys |
| Expected scope | `user_role_scopes(scope_type='organisation', scope_id=<org>)` only |
| Rollback | delete the `user_role_scopes` rows, then `user_roles` rows for the QA users/roles, then the cloned `role_permissions`/`roles` rows |
| Risks | bypasses `ORG_STAFF.ADD` audit and validation, does not emit `user.role.changed`, drift risk if the template changes |

### A18.8 Exact blockers

1. No supported UI or API to assign **marketplace-manager / receptionist** as
   organisation staff (allowlist).
2. `super_admin` cannot use the org staff screen (client-side org guard).
3. No org-owner credentials are available for the stock-bearing test shop
   (`01610101011` seed owner rejected two documented passwords; **2 attempts
   remaining — do not retry**).
4. Global-role assignment is over-privileged because permission checks ignore
   scopes.

### A18.9 Is a code change necessary?

| Goal | Code change? |
|---|---|
| Run C7/C8/C9/C10 for **org-admin** today | **No** — API `POST /org/25/staff` with a super_admin session suffices |
| Run the same for **marketplace-manager / receptionist** via a supported flow | **Yes** — extend `ASSIGNABLE_ORG_ROLE_SLUGS` (+ staff UI list), or add a scoped-global assignment UI |
| Full Inventory UAT acceptance (C8/C10 across all roles) | **Yes**, unless the owner accepts a one-time SQL clone or the over-privileged global-scope assignment |

---

## A19 — Post-remediation RBAC verification (Scenario A) — 2026-11-17

**Environment:** Hostinger Live · commit `5742fb45b2576a9583596de9fb56a20b7b69575e` (`/health/version`: `gitCommitConsistent=true`, `buildTime 2026-11-17T06:45:58Z`) · database `courtzon_v3` (MySQL 8.0.46).

**Test identity (existing QA account — no account was created):**

| Field | Value |
|---|---|
| User ID | **127** |
| QA identity | TEST_ADMIN (`docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md`) |
| Role | `org-admin` |
| Role ID | **1116** |
| Organisation ID | **35** (`TEST_ORG`) |

### A19.1 Method and provenance

- The six requests were **executed by the project owner manually**, in Chrome DevTools Console, on `https://www.courtzon.cloud` while authenticated as User 127. **OpenCode did not execute them** (its environment has no in-page JavaScript execution).
- Request shape: same-origin relative URLs · `fetch(..., { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, redirect: 'follow', cache: 'no-store' })`.
- Only status, response URL, `Content-Type` and timestamp were read; **no response body was read or recorded**, and no cookie/token/localStorage value was accessed.
- Every response URL matched the requested same-origin path; **no redirect occurred**.
- This is the authenticated organisation-role check that was **BLOCKED** in A14/A15 (no org-role session). A18 **investigated** the provisioning problem and recommended options; it did **not** create or provision this account. The TEST_ADMIN identity used here was already documented in `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` (2026-10-05). No account was created for this verification.

### A19.2 Results — 6/6 authenticated GET checks

| ID | Method | Route | Expected | Actual | `Content-Type` | Timestamp (UTC) |
|---|---|---|---|---|---|---|
| A1 | GET | `/marketplace/admin/products` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:52.240Z |
| A2 | GET | `/admin/marketplace/complaints` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:52.603Z |
| A3 | GET | `/marketplace/admin/orders` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:52.744Z |
| A4 | GET | `/marketplace/admin/sellers` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:52.862Z |
| A5 | GET | `/marketplace/admin/upgrade-requests` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:52.969Z |
| A6 | GET | `/marketplace/admin/reviews` | 403 | **403** | `application/json; charset=utf-8` | 2026-11-17T20:49:53.100Z |

**Result: PASS — 6/6 authenticated HTTP authorization checks.**

Why 403 is the correct outcome: the three keys are platform-only (`org-permission-policy.ts`), the 44 organisation-role grants were removed on 2026-11-17 (see A19.3), and every route is guarded only by `requirePermission(['marketplace.moderate'])` or `requirePermission(['marketplace.complaints.approve'])` with no organisation-scoped alternative.

### A19.3 Remediation context (executed before this verification, owner-authorised)

- 44 `role_permissions` rows removed: `marketplace.moderate` (216) and `marketplace.player.activate` (22646) from the 22 organisation roles (12 `org-admin`, 10 `shop-admin`, 21 organisations).
- Post-remediation counts: `role_permissions` 7,726 → **7,682**; organisation-role links for the two keys **0**; global counts `marketplace.moderate` **5**, `marketplace.player.activate` **6**, `marketplace.complaints.approve` **4**; global role 14 unchanged (**73** permissions, **3** keys).
- The policy code (`PLATFORM_ONLY_PREFIXES` entries at `org-permission-policy.ts:151/152/157`, rejection before `ORG_ASSIGNABLE_PATTERNS`) prevents re-granting or cloning these keys to organisation roles.

### A19.4 Status and limits

| Item | Status |
|---|---|
| Scenario A (organisation-role denial) | **PASS — 6/6 for `org-admin` / organisation 35** |
| Scenario B (global Marketplace Manager) | **BLOCKED (unchanged)** — no active user holds global role 14; no account was created |
| Scenario C (Inventory organisation isolation) | **BLOCKED (unchanged)** — no organisation role holds any `inventory.*` permission; no account was created |
| C7–C12 Inventory UAT | **Unchanged** (see §4 and A15) |
| Full security verification programme | **NOT complete** — only Scenario A is proven |

**Remaining gap:** only the `org-admin` role (role 1116) was exercised; `shop-admin` (role 1117) and C8/C9/C10 remain not executed. No PASS is claimed for those.

### A19.5 Safety confirmation

No database write, no account/role/membership/scope change, no business mutation, no payment call, no code edit, no deployment/restart. The requests were read-only GETs; no response body was read.
