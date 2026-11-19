# CourtZon Live — D-04 Account Evidence Reconciliation — 2026-11-19

| Field | Value |
|---|---|
| Document | `docs/release/D04_ACCOUNT_EVIDENCE_RECONCILIATION_2026-11-19.md` |
| Status | **LOCAL EVIDENCE RECONCILIATION ONLY — D-04 NOT VERIFIED — NO LIVE EXECUTION AUTHORIZED** |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local repository documentation and source inspection |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Branch / expected HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` (recorded as expected; not re-checked because Git commands are prohibited in this task) |
| Method | Read-only inspection of existing local files. No route, endpoint, API request, scenario, database query, test, or authentication was performed. |
| Governing method | Owner Attestation approach previously approved for D-04 (`OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` D-04 `:69`, D-05 `:70`) |

---

## 1. Scope and restrictions

This document reconciles **historical** evidence for the two D-04 candidate accounts. It does **not** perform D-04 verification.

**Permitted in this task:** local file reading and searching.

**Not performed and not authorized:**

- Live website access, browser navigation, API requests, endpoint execution, or scenario execution.
- Database access, SQL, DB inspection, backups, or test databases.
- Login, authentication, session creation, OTP, or discovery/extraction/storage of credentials, cookies, tokens, or secrets.
- Account creation or modification; role or permission changes; password changes.
- Tests, simulations, Playwright, source-code changes, existing-document changes.
- Docker commands, image/container updates, Git commands, commits, pushes, branch changes, deployment, changes to `opencode.json`.

The owner has historically confirmed that OpenCode created most QA accounts under a shared test credential. That statement is recorded here **only as historical context**: no credential value was inspected, reproduced, tested, or included in this document, and it does not prove any account's current state.

### 1.1 D-08 / D-05 compliance

The approved D-08 GET allowlist is unchanged and was not exercised:

| ID | Endpoint | Status | Treatment in this task |
|---|---|---|---|
| E-01 | `GET /admin/dashboard` | INCLUDE | Not called. |
| E-02 | `GET /admin/dashboard/trends` | INCLUDE — automatic; HTTP Status + Request ID only | Not called; Response Body not retained, inspected, logged, or copied. |
| E-03 | `GET /auth/me` | EXCLUDE | Not used as a workaround. |
| E-04 | `GET /my/permissions` | EXCLUDE from this wave | Not used as a workaround. |
| E-05 | `GET /my/scopes` | EXCLUDE from this wave | Not used as a workaround. |
| E-06 | `GET /users/:userId/roles` | EXCLUDE | Not used as a workaround. |

Under D-05, OpenCode performs permitted technical preparation only. If any future step requires human authentication or OTP, **OpenCode must stop and request the owner's direct participation**; credentials, cookies, tokens, and secrets are never discovered, extracted, stored, or bypassed.

---

## 2. Evidence sources and exact references

All references are repository-relative paths with 1-based line numbers. "Proves" means the record directly states the attribute at that date; "suggests" means the record is indirect, partial, or about a differently identified account.

| # | Exact file path | Section / lines | Evidence | Date | Historical or current | Proves / suggests |
|---|---|---|---|---|---|---|
| S1 | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | §1 `:11`; §2 `:14` | Target `187.127.72.93:3307 / courtzon_v3`; creation executed ~01:5x UTC; cleaned state before creation | 2026-10-05 | Historical | Proves creation context and date, not current state. |
| S2 | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | §6 `:28-30` | `user_id 126`, `TEST_SUPERADMIN`, `test.superadmin01@courtzon.test`, roles `player` + `super_admin` | 2026-10-05 | Historical | Proves historical identity, email and role pair. |
| S3 | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | §7 `:44-51` | Global `super_admin` via guarded `POST /user-roles`; "Verified via DB: roles per user exactly as above; no unintended global role grants" | 2026-10-05 | Historical | Proves creation-time role assignment and DB verification; not current activity or expiry. |
| S4 | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | §8 `:53-57` | `TEST_SUPERADMIN: global (no scope)`; org 35 / branch 21 belong to other TEST users | 2026-10-05 | Historical | Proves historical global scope. |
| S5 | `docs/HANDOVER_CURRENT/47_TEST_IDENTITY_CREATION_BLUEPRINT.md` | §6 `:51`; §7 `:60` | Blueprint requirement: users created with `account_status active`; TEST_SUPERADMIN created first + assigned `super_admin` | 2026-10-05 (planning record) | Historical | Suggests status at creation (design requirement, not a quoted observed status value). |
| S6 | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | closing status block `:117-138` | `RBAC: VERIFIED`, per-identity roles/scopes; `REAL DATA: UNCHANGED` | 2026-10-05 | Historical | Proves creation-time verification, not current validity. |
| S7 | `docs/HANDOVER_CURRENT/86_TOURNAMENT_E2E_TEST_MAP.md` | `:87`, `:116` | `TEST_SUPERADMIN 126` used as Super Admin / admin role in tournament mapping | Historical (date not stated in those lines) | Historical | Suggests continued historical use; no status, expiry, or timestamp. |
| S8 | `docs/HANDOVER_CURRENT/49_TOURNAMENT_TEST_EXECUTION_PACK.md` | `:20`, `:26` | Identity map `TEST_SUPERADMIN 126`; all tests via `super_admin` | Historical (date not stated in those lines) | Historical | Suggests intended use; does not prove current state. |
| S9 | `docs/release/COURTZON_RELEASE_PROGRESS.md` | §38.2 `:5200-5208`, key row `:5207` | Live read-only review: `qa.acc@courtzon.test`, roles `player` + `accountant`, **199 permissions**, `platform.admin=false`, denied `/admin/dashboard` | 2026-11-18 | Historical | Proves the 2026-11-18 observation for that email; does not prove current values. |
| S10 | `docs/release/COURTZON_RELEASE_PROGRESS.md` | §33.7 `:4814-4820` | Read-only F-002 method: existing `super_admin` UI session and `/admin/users` list observation; no login as QA accounts, no DB, no credential inspection | 2026-11-14 | Historical | Proves method boundaries of that historical observation. |
| S11 | `docs/release/COURTZON_RELEASE_PROGRESS.md` | §33.7.1 `:4824-4837`, key row `:4832` | Page 1 of `/admin/users`: 16 QA-named accounts all shown `active`; `QA Accountant` — `Accountant, Player`, `active`, joined 2026-11-11. **No email reproduced.** | 2026-11-14 | Historical | Suggests an `active` accountant-named account; does **not** prove it is `qa.acc@courtzon.test`. |
| S12 | `docs/release/COURTZON_RELEASE_PROGRESS.md` | §33.7.3 `:4865` | "Organisation associations — UNKNOWN — the Users list has no organisation column"; total count and credentials unknown | 2026-11-14 | Historical | Proves scope of historical unknowns. |
| S13 | `docs/release/COURTZON_RELEASE_PROGRESS.md` | §33.7.6 `:4894-4913`, key lines `:4899-4902` | Owner decision: five privileged QA accounts **keep active**, no mutation, all 16 observed QA accounts unchanged | 2026-11-14 | Historical | Suggests status at that date; mapped to display labels, not to the nominated email. Not current proof. |
| S14 | `docs/release/E2E_SCENARIO_MATRIX.md` | §3.4c `:697-715`, key lines `:701`, `:707`, `:712` | Five dedicated QA accounts created 2026-11-11; `QA Accountant` = `player, accountant`, 403 on six finance endpoints; role grants verified via `/users/:id/roles` at that time. **No email reproduced.** | 2026-11-11 | Historical | Suggests creation and role pair for a display-named account; no mapping to `qa.acc@courtzon.test` and no expiry value. |
| S15 | `docs/release/COURTZON_LIVE_C7_C12_AUDIT.md` | `:310-322` | QA display names from Live `/admin/users` list, including `QA Accountant`; masked phones only; no passwords reproduced | 2026-11-17 (audit context) | Historical | Suggests display-name identity; no email or status value. |
| S16 | `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` | §3 `:67-70`, §4 `:122-138` | D-02/D-03 nominations; D-04 approved in principle, not performed; explicit "NOT VERIFIED" matrix for all current attributes | 2026-11-19 | Governance record (current status statement about verification, not account state) | Proves that D-04 is not verified and that history is not current proof. |
| S17 | `docs/release/LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md` | §7 `:203-213`, §8 `:226-227` | D-04 attributes and B-07 availability of `qa.acc@courtzon.test` = **NOT VERIFIED** | 2026-11-19 | Governance record | Proves current verification status, not account attributes. |
| S18 | `docs/release/D04_IDENTITY_VERIFICATION_PREPARATION_2026-11-19.md` | §2 `:39-61`; §7 `:154-160` | Historical evidence compiled for both actors; owner actions required; no current verification | 2026-11-19 | Governance record | Proves prior reconciliation state, not account attributes. |
| S19 | `docs/release/D04_OWNER_CONTROLLED_VERIFICATION_METHOD_2026-11-19.md` | §2-§4 `:45-137` | Source inspection: no approved method can verify any of the six attributes; no user ID documented for `qa.acc@courtzon.test` | 2026-11-19 | Governance record | Proves method gap, not account state. |
| S20 | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts` | `:272-285` | Role rows include `expires_at`, `is_active`, `organisation_id`; filter `ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW())` | Source code (no runtime date) | Source fact | Proves how active/unexpired roles are determined; not any account's values. |
| S21 | `backend/src/shared/middleware/org-access.ts` | `:10-24`, `:33-54` | Global/Platform expressed as `r.organisation_id IS NULL`; `platform.admin` evaluated as a permission key | Source code | Source fact | Proves definition only; no account value. |
| S22 | `database/baseline/001_courtzon_v3.sql` | `:6590-6605` | `user_roles.expires_at` exists and is nullable; `is_active` defaults to 1 | Baseline schema | Source fact | Proves capability only; no value for either actor. |
| S23 | repository-wide search of `docs/HANDOVER_CURRENT`, `e2e`, `backend/scripts` for `qa.acc` | — | **No creation record, user ID, or email-to-ID mapping found** for `qa.acc@courtzon.test` outside the 2026-11-18/19 release records | 2026-11-19 search | Search result | Proves absence of a documented identity mapping. |

**Search note:** no local record was found that states a user ID for `qa.acc@courtzon.test`, an expiry value for either actor's role assignments, or a current (post-2026-11-19) observation of either account.

---

## 3. Six-attribute evidence matrix — `TEST_SUPERADMIN` / user 126

| Attribute | Evidence | Evidence date | Classification |
|---|---|---|---|
| Current account status | S5 `:51` blueprint requires `account_status active`; S1/S2 `:11,30` creation via API; no quoted observed status value for user 126 after creation. No current record. | 2026-10-05 | **HISTORICAL ONLY** (indirect design requirement; not an observed status value) |
| Current assigned roles | S2 `:30` `player` + `super_admin`; S3 `:45,51` global `super_admin` via guarded `POST /user-roles`, DB-verified at creation. No current enumeration. | 2026-10-05 | **HISTORICAL ONLY** |
| Role expiry | S22 `:6590-6605` confirms an `expires_at` column exists; S20 `:279-281` shows the unexpired filter; **no expiry value was recorded for user 126** in any local document. | No value recorded | **NOT VERIFIED** |
| Global/Platform scope | S4 `:56` "TEST_SUPERADMIN: global (no scope)"; S6 `:117-138` RBAC verified at creation. No current scope check. | 2026-10-05 | **HISTORICAL ONLY** |
| Effective `platform.admin` | No per-account value recorded for user 126. Role-level historical evidence only: `super_admin` is the platform role and holds `*` (`OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` §4 `:135`); `platform.admin` is a permission key (S21 `:33-54`), not a returned field. | 2026-11-19 (role-level statement) | **NOT VERIFIED** (no per-account value found; the historical `super_admin` role is role-level inference only, not proof of the effective `platform.admin` value — not claimed false or absent) |
| Current availability | S7/S8 `:116`/`:20,26` suggest historical intended use; S16 `:131` and S17 `:205-211` explicitly record availability **NOT VERIFIED**. | 2026-11-19 | **NOT VERIFIED** |

No row above is **VERIFIED**. Historical creation-time DB verification (S3, S6) is not a current state check.

---

## 4. Six-attribute evidence matrix — `qa.acc@courtzon.test`

| Attribute | Evidence | Evidence date | Classification |
|---|---|---|---|
| Current account status | S9 `:5207` records the account and attributes but not a status field; S11 `:4832` shows `QA Accountant` `active` and S13 `:4899-4902` records "keep active", **without email**; S23 confirms no email-to-ID mapping. No current record. | 2026-11-14 / 2026-11-18 | **HISTORICAL ONLY** (indirect: display-name mapping not established) |
| Current assigned roles | S9 `:5207` `player` + `accountant`; S14 `:707,712` `QA Accountant` = `player, accountant` with role grants verified at that time. No current enumeration. | 2026-11-18 / 2026-11-11 | **HISTORICAL ONLY** |
| Role expiry | No expiry value recorded for this account in any local document; S22 only confirms the column exists. | No value recorded | **NOT VERIFIED** |
| Global/Platform scope | S9 `:5207` `platform.admin=false`, non-platform; denied `/admin/dashboard`. No current scope check. | 2026-11-18 | **HISTORICAL ONLY** |
| Effective `platform.admin` | S9 `:5207` explicitly records `platform.admin=false` for this email at the Live review. No current value. | 2026-11-18 | **HISTORICAL ONLY** |
| Current availability | S17 §8 `:227` (B-07) and S16 `:131` record availability **NOT VERIFIED**; historical `active` indications (S11/S13) are dated and not mapped to this email by any local record. | 2026-11-19 | **NOT VERIFIED** |

No row above is **VERIFIED**. The 199-permission figure and `platform.admin=false` are dated observations, not current state. No user ID is documented for this email.

---

## 5. Historical facts versus current verified facts

### 5.1 Historical facts (established by records)

- User **126** was created as `TEST_SUPERADMIN` with email `test.superadmin01@courtzon.test`, roles `player` + `super_admin`, global scope and no scope row, on **2026-10-05** (S1–S4, S6).
- A Live read-only review on **2026-11-18** recorded `qa.acc@courtzon.test` with `player` + `accountant`, 199 permissions, `platform.admin=false`, and denial of `/admin/dashboard` (S9).
- A **2026-11-14** owner decision retained the 16 observed QA accounts unchanged and the five privileged QA accounts active (S13).
- A **2026-11-11** Live D4 run created five dedicated QA accounts including a display-named `QA Accountant` with `player` + `accountant` (S14).

### 5.2 Current verified facts

**None.** No current account attribute for either candidate is verified. The only current facts established are governance facts: D-04 **NOT VERIFIED** (S16 `:69`, S17 `:203-211`), B-07 **NOT VERIFIED** (S17 `:227`), and the documented absence of an approved method for any of the six attributes (S19 §2–§4).

### 5.3 Why history cannot be promoted

- Role assignments can be revoked, re-granted, or expire; `expires_at` and `is_active` values were never recorded for either actor (S20, S22).
- Account status can change; the 2026-11-14 "keep active" decision is an instruction recorded at that date, not a current observation.
- `platform.admin` is evaluated from a permission key at request time (S21), not stored as a displayed account field; a 2026-11-18 boolean is not current.
- The `qa.acc@courtzon.test` email is never mapped to a user ID or to the `QA Accountant` display label in any local record (S11 `:4865`, S23). Treating them as the same account would be an inference, not evidence.
- No excluded endpoint (E-03, E-04, E-05, E-06) was used to fill these gaps, and no database or Live check was performed.

---

## 6. Missing evidence and blockers

| # | Missing evidence | Blocker / reason |
|---|---|---|
| M1 | User ID for `qa.acc@courtzon.test` | No local record; would require an unapproved lookup or owner attestation. |
| M2 | Email-to-`QA Accountant` mapping | Not recorded; display-name records omit email (S11, S14, S15). |
| M3 | Current `account_status` for both actors | Historical values only; no current observation under an approved method. |
| M4 | Current active role names for both actors | Historical role pairs only; no current enumeration. |
| M5 | `expires_at` / `is_active` per role assignment | No value recorded for either actor; exposed only by endpoints outside the allowlist. |
| M6 | Current Global/Platform scope | Historical scope only; `/my/scopes` (E-05) is excluded and returns organisation rows only. |
| M7 | Current effective `platform.admin` | No endpoint returns a boolean; `/auth/me` (E-03) and `/my/permissions` (E-04) are excluded. |
| M8 | Current availability / usability | Requires owner-controlled confirmation; authentication is outside OpenCode's boundary (D-05). |
| M9 | Owner Attestation values | Not yet supplied for either actor. |

Additional governance blockers remain: D-16 **PENDING**, D-09 evidence path **PENDING**, backup person **PENDING**, D-11 window **PENDING**, W1 Gate Out **NOT MET**, §5.5 **NOT PASSED**, UR-03/UR-07 **BLOCKED**, Option A+ and write-enabled UAT **NOT AUTHORIZED**.

---

## 7. Can either account currently be considered verified?

**No.**

- `TEST_SUPERADMIN` / user 126 remains a **historical positive candidate** (D-02). All six current attributes are either HISTORICAL ONLY or NOT VERIFIED; none is VERIFIED.
- `qa.acc@courtzon.test` remains a **historical negative candidate** (D-03). Its identity is not tied to a documented user ID, and none of its six current attributes is VERIFIED.
- D-04 therefore remains **NOT VERIFIED**, consistent with S16 and S17. No promotion to verified is made by this reconciliation.

---

## 8. Recommended next owner-controlled step

1. **Continue with the approved Owner Attestation method.** The owner supplies, from their own authorized access and without sending any secret, the five minimum non-secret statements prepared in `D04_IDENTITY_VERIFICATION_PREPARATION_2026-11-19.md` §5 for each actor: identity (including the missing user ID for `qa.acc@courtzon.test`), current active role names, expiry state, Global/Platform scope, and current availability.
2. **No endpoint workaround.** Do not use E-03, E-04, E-05, or E-06, and do not use direct database access, manual SQL, hidden APIs, or browser developer-tools extraction.
3. **Authentication boundary.** The owner enters credentials and OTPs personally if any future method requires them. If authentication or OTP is required, **OpenCode stops and requests the owner's direct participation (D-05)**. No secret, cookie, token, OTP, or screenshot containing a secret is sent to OpenCode.
4. **Separate authorization.** Any Live verification, additional endpoint, or evidence-storage step requires its own explicit decision (D-08 amendment where applicable), plus D-16, D-11, D-09 path, §5.5, and W1 gates.
5. **Record only what is attested.** After owner attestation, mark as VERIFIED only the attributes explicitly covered; leave every other attribute NOT VERIFIED. Do not mark D-04 complete until sufficient evidence exists.

---

## 9. Governance states — unchanged

| Item | State |
|---|---|
| Overall completion | **56%** |
| Phase 6 | **5/10** |
| Phase 7 | **10%** |
| UR-03 | **BLOCKED** |
| UR-07 | **BLOCKED** |
| W1 Gate | **NOT MET** |
| Constitution §5.5 | **NOT PASSED** |
| D-16 | **PENDING** |
| D-04 | **NOT VERIFIED** until sufficient evidence exists |
| D-08 | **APPROVED** (allowlist unchanged) |
| D-09 evidence path | **PENDING** |
| Backup person | **PENDING** |
| D-11 | **PENDING** |
| Option A+ Live deployment | **NOT AUTHORIZED** |
| Write-enabled UAT | **NOT AUTHORIZED** |

No evidence, user ID, date, signature, approval, or current account state was invented.

---

## 10. Confirmation of no execution or prohibited operation

**Confirmed:** this task performed local documentation and source inspection only. **No Live execution occurred and no prohibited operation occurred.** Specifically: no browser navigation, API request, endpoint call, scenario, login, authentication, session, OTP, credential/cookie/token handling, database access or SQL, account or role or permission change, test or simulation, source-code change, existing-document change, Docker command, Git command, deployment, `opencode.json` change, backup, or test database was performed. Exactly one new Markdown document was created and no existing file was modified.

**STOP.** Neither account was verified; no further action was executed.
