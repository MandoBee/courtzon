# CourtZon Live — D-04 Identity Verification Preparation — 2026-11-19

> **LOCAL PREPARATION ONLY — D-04 NOT VERIFIED — NO LIVE EXECUTION AUTHORIZED**

| Field | Value |
|---|---|
| Document | `docs/release/D04_IDENTITY_VERIFICATION_PREPARATION_2026-11-19.md` |
| Status | **LOCAL PREPARATION ONLY — D-04 NOT VERIFIED — NO LIVE EXECUTION AUTHORIZED** |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local documentation and historical record review only |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Branch / expected HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` |
| Review method | Read-only inspection of existing local governance and historical records. **No Live access, browser navigation, authentication, database query, test or simulation was performed.** |
| Governing records | `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` (D-02…D-15); `LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md` §7; `COURTZON_RELEASE_PROGRESS.md` §33.7 and §38.2; `COURTZON_TEST_CONSTITUTION.md` §5.5 |

---

## 1. Purpose and authorization boundary

This document prepares an **owner-controlled identity verification procedure** for two previously nominated QA actor candidates. It records what local history establishes, what remains unknown, and the exact confirmations the owner must personally provide or perform.

This document is **not** an authorization record. It does **not** authorize:

- account access, authentication, session creation, or any production action;
- discovery, extraction, storage, inspection, or handling of passwords, OTPs, cookies, tokens, or secrets by OpenCode;
- database access, queries, SQL, migrations, seeds, or backups;
- creation, modification, or deletion of accounts, roles, permissions, or sessions;
- execution of any endpoint, scenario, test, or simulation;
- Docker operations, Git operations, deployment, or evidence-file/folder creation.

No actor was verified in the preparation of this document. No endpoint or scenario was executed. Approval of a preparation procedure is **not** approval of a future verification step: the owner may decide separately whether any such step will occur, and only in a separately authorized context. If any future method requires human authentication or OTP intervention, **OpenCode must stop and wait for the owner (D-05)**.

---

## 2. Historical evidence table

Historical facts are dated records only. They are **not** current facts and are never used to label a current attribute as verified.

### 2.1 Positive actor candidate — `TEST_SUPERADMIN` / user 126

| Item | Historical record |
|---|---|
| Historical identity / user ID | `TEST_SUPERADMIN`, **user_id 126**, email `test.superadmin01@courtzon.test` — `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` §6, line 30. |
| Historical roles | `player` + `super_admin`; global `super_admin` assigned via guarded `POST /user-roles` — same record §7, lines 45 and 51; §6 line 30. |
| Historical scope | **Global / Platform** — no `user_role_scopes` row; org 35 / branch 21 belong to other TEST users — same record §8, lines 53–57. |
| Historical permission indicators | `super_admin` is a platform-wide role; the readiness revision records that `super_admin` holds `*` and therefore cannot demonstrate omission in Quick Actions / Action Center filtering — `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` §4, line 135. No current permission enumeration was performed. |
| Historical evidence source and exact references | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` §1 line 11 (target and cleaned state), §2 line 14 (timestamp), §6 line 30, §7 lines 45/51, §8 lines 53–57, §18 line 110 (reserved `test.*@courtzon.test` email block), closing status block lines 117–138 (`RBAC: VERIFIED`, roles/scopes per identity). Corroborated in `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` D-02 line 67 and §4 lines 126–132. |
| Date of evidence | **2026-10-05 ~01:5x UTC** creation/verification — `48_TEST_IDENTITIES_CREATED.md` lines 3 and 14. |
| What the evidence does NOT establish | Current account availability; current active/inactive status; current role assignments; role expiry; current Global/Platform scope; current effective permissions; whether the same account is still usable. The record is a creation-time observation only. No current database or Live check supports any of these attributes. |

### 2.2 Negative actor candidate — `qa.acc@courtzon.test`

| Item | Historical record |
|---|---|
| Historical identity / user ID | `qa.acc@courtzon.test`. **No user ID is documented for this email** — current or historical ID: **NOT VERIFIED**. |
| Historical roles | `player` + `accountant` — `COURTZON_RELEASE_PROGRESS.md` §38.2, line 5207; corroborated in `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` §4 line 128. |
| Historical scope | Non-platform / accountant scope; `platform.admin=false`; historically denied `/admin/dashboard` — `COURTZON_RELEASE_PROGRESS.md` §38.2 line 5207; revision §4 lines 129 and 133. |
| Historical permission indicators | **199 permissions** and `platform.admin=false` at the 2026-11-18 Live review — `COURTZON_RELEASE_PROGRESS.md` §38.2 line 5207. Separately, `E2E_SCENARIO_MATRIX.md` §3.4c lines 701–707 records a "QA Accountant" (`player`, `accountant`) receiving `403` on finance endpoints in the 2026-11-11 Live run. **The email-to-display-name mapping is NOT VERIFIED**; these records are not assumed to describe the same account. |
| Historical evidence source and exact references | `COURTZON_RELEASE_PROGRESS.md` §38.2 lines 5200–5208 (UR-03 result and account attributes); §33.7.1 lines 4814–4837 (read-only F-002 investigation; "QA Accountant" display label, `active`, joined 2026-11-11 — line 4832, **no email reproduced**); `E2E_SCENARIO_MATRIX.md` §3.4c lines 697–715; `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` D-03 line 68 and §4 lines 126–136. |
| Date of evidence | **2026-11-18** Live read-only review (`COURTZON_RELEASE_PROGRESS.md` §38, line 5184); related QA-account investigation **2026-11-14** (§33.7, line 4814); QA Accountant creation/joined date **2026-11-11** (§33.7.1 line 4832; `E2E_SCENARIO_MATRIX.md` §3.4c line 701). |
| What the evidence does NOT establish | Current account availability; current status; current roles; current role expiry; current Global/Platform scope; current effective permissions or permission count; current denial behaviour. The 199-permission figure and `platform.admin=false` are dated observations, not current state. No user ID is established for this email. |

### 2.3 Distinction between historical and current facts

- **VERIFIED FROM HISTORICAL RECORD** applies only to the dated facts quoted above.
- No current attribute in §3 is labelled verified on the basis of a historical record.
- Historical creation-time DB verification (2026-10-05) and historical Live observations (2026-11-11 / 2026-11-14 / 2026-11-18) are **not** substitutes for a current D-04 verification.

---

## 3. Current verification matrix

Only the following classifications are used: **VERIFIED FROM HISTORICAL RECORD**, **NOT VERIFIED**, **OWNER ACTION REQUIRED**, **BLOCKED**. Current attributes are classified **NOT VERIFIED** or **OWNER ACTION REQUIRED** / **BLOCKED**; none is upgraded by history.

### 3.1 Positive actor candidate — `TEST_SUPERADMIN` / user 126

| Current attribute | Classification | Restriction / note |
|---|---|---|
| Current account availability | **NOT VERIFIED** | Owner-controlled confirmation required; no Live, login, or DB check performed here. |
| Current active / inactive status | **NOT VERIFIED** | Creation-time status is historical only. |
| Current role assignments | **NOT VERIFIED** | Historical `player` + `super_admin` is not current proof. |
| Role expiry | **NOT VERIFIED** | No current expiry observation exists in local records. |
| Current Global / Platform scope | **NOT VERIFIED** | Historical global scope (no scope row) is not current proof. |
| Current effective permission indicators | **NOT VERIFIED** | No current permission enumeration; E-03/E-04/E-05/E-06 are EXCLUDED from this wave. |
| Suitability for the intended positive scenarios (UR-03-01, UR-03-03, UR-03-04, UR-07-01) | **OWNER ACTION REQUIRED** | Remains a **historical positive candidate** only; suitability is conditional on D-04 confirmation and separate authorization. |

### 3.2 Negative actor candidate — `qa.acc@courtzon.test`

| Current attribute | Classification | Restriction / note |
|---|---|---|
| Current account availability | **NOT VERIFIED** | Tracked as B-07 in the readiness checklist; owner-controlled confirmation required. |
| Current active / inactive status | **NOT VERIFIED** | 2026-11-14 active observation is historical only. |
| Current role assignments | **NOT VERIFIED** | Historical `player` + `accountant` is not current proof. |
| Role expiry | **NOT VERIFIED** | No expiry record exists for this email. |
| Current Global / Platform scope | **NOT VERIFIED** | Historical `platform.admin=false` is not current proof. |
| Current effective permission indicators | **NOT VERIFIED** | Historical 199-permission count is not current proof; no current enumeration. |
| Actor identity / user ID | **NOT VERIFIED** | No user ID is documented for this email. |
| Suitability for the intended negative scenarios (UR-03-02, UR-03-05, UR-03-06) | **OWNER ACTION REQUIRED** | Remains a **historical negative candidate** only; suitable in principle, conditional on D-04 confirmation and separate authorization. |
| Suitability for positive dashboard scenarios | **BLOCKED** | Historically denied `/admin/dashboard`; no documented dashboard-capable partial-permission actor exists. |

---

## 4. Owner-controlled verification procedure (proposal only)

The following procedure is a **proposal for the owner**, not an instruction that has been executed and not an authorization to execute anything.

1. **Owner retains full control.** All credentials, OTPs, cookies, tokens, and secrets remain exclusively with the project owner. OpenCode does not request, receive, discover, extract, store, inspect, transmit, or handle them.
2. **No session is created in this task.** OpenCode performs no login, no authentication, no browser navigation to Live, and no session creation. The owner alone decides whether to use an existing authorized session or any other method in a **separately authorized step**.
3. **No data-plane or admin-plane mutation.** The procedure must not create, modify, or delete accounts, roles, permissions, or sessions, and must not reset passwords or change account status.
4. **No database access.** No SQL, query, migration, seed, backup, or direct database inspection is part of this procedure. Historical DB verification remains historical only.
5. **No use of excluded endpoints in this wave.** E-03 (`/auth/me`), E-04 (`/my/permissions`), E-05 (`/my/scopes`), and E-06 (`/users/:userId/roles`) are **EXCLUDED** by the owner's D-08 decision. Any future use of a different endpoint set requires a new, explicit decision.
6. **Minimum non-secret confirmation.** The owner may confirm the items in §5 from the owner's own authorized access and provide only the non-secret statements listed there. OpenCode records the owner's statements as owner-supplied attestations; it does not independently verify them in this task.
7. **Stop-and-wait rule (D-05).** If any future step requires human authentication, OTP entry, credential entry, or session creation by a person, **OpenCode stops and requests the owner's intervention**. No workaround, bypass, or automated secret handling is permitted.
8. **Separate authorization for any future step.** D-04 verification against Live is not authorized by this document. A future step would require the then-applicable readiness conditions, including D-16 signature, D-11 window, §5.5 passage, and the owner's explicit decision. None of those is recorded here as complete.

---

## 5. Evidence requirements (minimum, non-secret)

The minimum evidence required to close D-04 is an owner-supplied, non-secret confirmation of:

| # | Required confirmation | Actor 126 | `qa.acc@courtzon.test` |
|---|---|---|---|
| 1 | Actor identity confirmation | Confirm the account is `TEST_SUPERADMIN`, user ID **126**. | Confirm the account identity and, if available, its user ID. |
| 2 | Current active role names | State the currently assigned role names. | State the currently assigned role names. |
| 3 | Expiry state | State whether any role assignment is expired or unexpired. | State whether any role assignment is expired or unexpired. |
| 4 | Global / Platform scope confirmation | Confirm whether scope is Global / Platform with no organisation or branch scope. | Confirm whether the actor is non-platform and that `platform.admin` is false or true at the time of confirmation. |
| 5 | Current account availability confirmation | Confirm the account is currently active and usable. | Confirm the account is currently active and usable. |

Constraints:

- Do **not** collect credentials, OTPs, cookies, tokens, secrets, password hashes, or full personal profile data.
- Do **not** collect unnecessary account information, other users' records, or cross-organisation data (D-07).
- Do **not** create an evidence directory or any evidence file; D-09's exact storage path remains **PENDING**.
- Owner-supplied statements are recorded as such; OpenCode does not present them as independently verified in this task.

---

## 6. Suitability and limitations

- **User 126 remains a historical positive candidate** (D-02): `player` + `super_admin`, global scope, recorded 2026-10-05. It is **NOT VERIFIED** as a current actor.
- **`qa.acc@courtzon.test` remains a historical negative candidate** (D-03): `player` + `accountant`, 199 permissions, `platform.admin=false`, historically denied `/admin/dashboard` on 2026-11-18. It is **NOT VERIFIED** as a current actor, and no user ID is documented for it.
- **Neither actor can be treated as verified current** because no current availability, status, role, expiry, scope, or permission check was performed, and historical records are not current proof.
- **A historical role or permission count is not current proof**: roles can be revoked or re-granted, assignments can expire, accounts can be suspended, and permission catalogues can change across deployments. The 2026-10-05 creation-time DB verification and the 2026-11-11/14/18 Live observations are dated facts only.
- **Positive filtering scenarios remain BLOCKED**: the only documented dashboard-capable actor (`super_admin`) holds `*`, so omission of Quick Actions / Action Center cannot be demonstrated; no dashboard-capable partial-permission actor is documented.
- **No actor provisioning or permission change is permitted.** Creating an actor, assigning roles, granting permissions, resetting a password, or changing account status is out of scope (D-14, and Channel D provisioning is not authorized). A missing actor is reported as **BLOCKED**, not manufactured.
- **No endpoint or scenario has been executed** and no gate has passed in the preparation of this document.

---

## 7. Outstanding owner actions

Concise checklist of exact confirmations the owner must provide or perform. No item below has been completed in this task.

- [ ] **OA-1** Confirm whether `TEST_SUPERADMIN` / user ID **126** is currently active and usable.
- [ ] **OA-2** State user 126's current active role names and whether any assignment is expired.
- [ ] **OA-3** Confirm user 126's current scope is Global / Platform with no organisation or branch scope.
- [ ] **OA-4** Confirm whether `qa.acc@courtzon.test` is currently active and usable, and provide its user ID if known.
- [ ] **OA-5** State the current active role names and expiry state for `qa.acc@courtzon.test`.
- [ ] **OA-6** Confirm the current scope / `platform.admin` state for `qa.acc@courtzon.test`.
- [ ] **OA-7** Decide whether any future D-04 verification step will occur at all, and in which separately authorized context. If human authentication or OTP is required, accept that OpenCode will **stop and wait** (D-05).
- [ ] **OA-8** Supply the still-pending governance items when applicable: D-16 Decision ID, effective UTC time, signature/initials and final confirmation; D-09 evidence path; backup person (D-10); D-11 execution window. None is invented by this document.

---

## 8. Preserved decisions and unchanged governance state

The following decisions and states are **preserved exactly**; this document only prepares a procedure and does not re-open, grant, or change any of them.

| Item | Preserved state |
|---|---|
| D-02 / D-03 | User 126 positive candidate; `qa.acc@courtzon.test` negative candidate. Nominations only. |
| D-04 | Future safe verification approved in principle; **NOT VERIFIED / not performed**. |
| D-05 | Stop and request owner intervention when human authentication or OTP is required. |
| D-07 | Platform / Global scope only; no organisation/branch scope; no cross-tenant probing. |
| D-08 endpoint selection | E-01 INCLUDE; E-02 automatic, HTTP Status + Request ID only, **no Response Body retention or collection**; E-03 EXCLUDE; E-04 and E-05 EXCLUDE from this wave; E-06 EXCLUDE. |
| D-09 | Evidence method approved in principle; exact path **PENDING**; no evidence folder or file created. |
| D-10 / D-11 | Responsibility split as recorded; backup person **PENDING**; execution window **PENDING**. |
| D-12 / D-14 / D-15 | Option A+ Live deployment **NOT AUTHORIZED**; write-enabled UAT **NOT AUTHORIZED**; financial/business mutations excluded. |
| Overall completion | **56%** |
| Phase 6 / Phase 7 | **5/10** / **10%** |
| UR-03 / UR-07 | **BLOCKED** / **BLOCKED** |
| W1 Gate Out | **NOT MET** |
| Constitution §5.5 | **NOT PASSED** |
| D-16 | **PENDING** — no Decision ID, signature, initials, or effective UTC timestamp invented. |

---

**STOP.** No account was verified, no endpoint was called, no scenario was executed, and no Live or database action was performed in the preparation of this document.
