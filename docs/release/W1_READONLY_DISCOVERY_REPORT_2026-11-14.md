# W1 — Read-Only Discovery Report (Live)

**Date:** 2026-11-14
**Environment:** Hostinger Live — frontend `https://www.courtzon.cloud`, API `https://api.courtzon.cloud`
**Deployed commit:** `313664d9b5600434cd8bbdb7a835b8a50a56aa6f` · buildTime `2026-11-13T07:37:19Z` · expectedMigration `210_refund_engine_head` · node `v22.23.5`
**Governing document:** CourtZon Test Constitution v0.5 (APPROVED 2026-11-14, commit `2771cfae…`)
**Mode:** READ-ONLY discovery. No write-enabled UAT started.
**Session:** Authenticated manually as `super_admin` in the dedicated Playwright profile.

---

## 0. Arabic Executive Summary (خلاصة تنفيذية)

- تم تنفيذ **W1 (استكشاف قراءة فقط)** على بيئة Live بحساب `super_admin`، دون أي عملية كتابة على بيانات الأعمال.
- تم فحص **119 صفحة** إدارية تغطي **100%** من مجموعات القائمة التسع (116 وجهة في القائمة + `/admin/profile` + إعادة توجيه `/admin/membership`).
- النتيجة: **90 صفحة سليمة**، **22 صفحة معطّلة كليًا**، **7 صفحات معطّلة جزئيًا**.
- **8 عيوب S2** (وظيفة أساسية لا تعمل) و**5 عيوب S3** و**3 ملاحظات S4**. لا يوجد S1 مؤكد.
- **أخطر نتيجة (W1‑F‑002):** حسابات اختبار QA نشطة في الإنتاج — بما فيها حسابات بأدوار إدارية عليا (Master Admin / Read Only Admin / Auditor / Accountant / Finance Manager). **قرار المالك (2026‑11‑14): الإبقاء على الحسابات الستة عشر كما هي ونشطة مؤقتًا لحين إنجاز مصفوفة اختبار الأدوار/الصلاحيات؛ التعرّض الأمني موثّق وF‑002 غير مُغلق.**
- **بوابة الخروج (Gate Out) غير مجتازة**: مصفوفة الأدوار، وعزل المستأجرين، وسيناريوهات Realtime (RT‑1…RT‑6) لم تُنفَّذ (تحتاج حسابات/كتابة/جلسة ثانية).
- **تأكيد عدم وجود تغيير على الإنتاج:** كل الطلبات كانت GET/تنقّل؛ لم تُجرَ أي كتابة على قاعدة البيانات أو Docker أو Git/النشر.

---

## 1. Auth Verification (Phase 1)

| Check | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Session established | Authenticated | Admin dashboard reachable | PASS | `/admin` renders, role badge `super_admin` |
| Identity | Current user | `GET /auth/me` → 200 | PASS | loaded on every page |
| Scopes | Scope list | `GET /my/scopes` → 200 | PASS | loaded on every page |
| Token maintenance | Session refresh | `POST /auth/refresh` → 200 (automatic) | PASS | observed per navigation |
| Session persistence | Survives navigation | Persisted across 119 page loads | PASS | no re-login required |
| Unauthenticated identity leak | No identity | `auth/me` null when unauthenticated (earlier) | PASS | Phase 1 pre-login |

> Note: the automatic `POST /auth/refresh` is framework session maintenance, not a business mutation. No business write endpoints were called.

---

## 2. Module Inventory & Coverage

**Discovered nav destinations:** ~116 links across 9 groups (Dashboard, People, Facilities, Coaching, Competitions, Commerce, Finance, Accounting, Platform) + footer (Profile, Back, theme, Logout).
**Pages inspected:** **119** distinct routes (superset of nav links; includes `/admin/profile` and the `/admin/membership` redirect).

| Status | Count |
|---|---|
| PASS (loads cleanly, all GETs 2xx) | 90 |
| FAIL — hard (page core data unavailable) | 22 |
| FAIL — partial (page loads, one or more widgets/endpoints fail) | 7 |
| **Total inspected** | **119** |

### Accessible vs inaccessible

- **Accessible (rendered):** all 119 routes rendered a page shell as `super_admin`; no route produced a frontend 403/redirect.
- **Inaccessible (data):** the 22 hard-fail pages render shells but their primary API returns 404/500 → empty/“—” data.
- **Note on method:** "module present in navigation but data endpoint broken" is distinguished from "explicit access-denied". **No explicit 401/403 access-denied responses were observed** for `super_admin`.

---

## 3. Per-Module Results

Legend: ✅ PASS · ❌ FAIL (hard) · ⚠️ FAIL (partial)

| Group | Pages | Result |
|---|---|---|
| **Dashboard** | `/admin`, `/admin/reports` | ✅✅ |
| **People** | users, roles, permissions, organisations, branch-access, organisation-types, membership, membership/plans | ✅×8 |
| | membership/campaigns, membership/rewards | ❌❌ (404) → **F‑008** |
| | crm/{dashboard,customers,segments,leads,campaigns,communications} | ❌×6 (500) → **F‑005** |
| | hr/{dashboard,employees,departments,leave,attendance,payroll} | ❌×6 (404) → **F‑006** |
| **Facilities** | reception | ⚠️ (bookings OK; withdrawals widget 500) → **F‑009** |
| | bookings, sports-engine, sports, amenities, community-events | ✅×5 |
| | inventory/{stock,warehouses,suppliers,purchase-orders} | ❌×4 (404) → **F‑007** |
| **Coaching** | academy/dashboard, programs, sessions, coaches | ✅×4 |
| | academy/{groups,enrollments,schedules,attendance} | ⚠️×4 (main 200; dropdown `limit>100` → 400) → **F‑013** |
| **Competitions** | league/dashboard, league/seasons, league/list | ✅×3 |
| | league/divisions | ❌ (`/admin/leagues/NaN/divisions` → 500) → **F‑014** |
| | tournament/dashboard, tournament/list, tournament/bracket-types, match-results, matches | ✅×5 |
| **Commerce** | marketplace/{sellers,products,orders,reviews}, approvals, product-categories, brands, tags | ✅×8 |
| | pricing/rules, pricing/preview, subscription, subscription/requests, unified-settlements, settlements/bookings, gateway-settlements, coupons, ads | ✅×9 |
| **Finance** | finance, finance/ledger, finance/reports, banks, bank-branches, financial-ops | ✅×6 |
| | withdrawals | ❌ (list 500; stats/assignees OK) → **F‑009** |
| **Accounting** | dashboard, accounts, journal, ledger, periods, tax-rates, mappings, templates, tax-report, reconciliation | ✅×10 |
| | invoices | ⚠️ (list 200; `/users?limit=200` → 404) → **F‑015** |
| **Platform** | security, sessions, failed-logins, uploads, system-health, audit-logs, feature-flags, system, membership, support/tickets, queues | ✅×11 |
| | notifications/{broadcast,analytics,dead-letters,config}, notification-types | ✅×5 |
| | templates | ❌ (500) → **F‑010** |
| | integration/api-keys, webhooks, mobile/dashboard | ✅×3 |
| | payment-methods, payment-gateways, countries, currencies, languages, translations, app-settings, design-tokens, cms, sidebar-layout | ✅×10 |
| | bi/dashboard | ❌ (500) → **F‑011** |
| | bi/observability | ⚠️ (web-vitals 200; client-errors 500) → **F‑012** |
| **Footer** | profile | ✅ |

---

## 4. RBAC / Organisation Context

- **Positive (super_admin):** full navigation and read access to all 9 groups; no route blocked. ✅
- **Negative / cross-role matrix:** **NOT RUN** — only one Super Admin session exists; other-role positive/negative paths require approved test accounts (out of read-only scope).
- **Tenant / org isolation:** **NOT RUN** — did not probe other organisations by guessing IDs (prohibited). Org-scoped surfaces observed (`/my/scopes`, `/organisations`) but isolation not verified.
- **Caveat:** Super Admin access is **not** proof that other roles or cross-org isolation work.

---

## 5. Responsive Results

| Viewport | Result | Notes |
|---|---|---|
| Desktop 1920×1080 | ✅ PASS | Full sidebar + full data table; all columns visible |
| Mobile 390×844 | ✅ PASS (with UX note) | Hamburger + collapsible off-canvas sidebar; table becomes horizontally scrollable; filter row clipped at 390px (requires horizontal scroll). No layout break, no console errors |
| Physical iPhone / Android | **NOT RUN** | No device/simulator test performed in W1 |

---

## 6. Realtime Observations

- Realtime client bundle loaded (`/assets/socket-*.js` → 200).
- **Connection indicator "Connected"** observed on `/admin/users` → client transport established. ✅ (connection only)
- **RT-1…RT-6 (room scoping, event correctness, live UI refresh, tenant isolation, reconnect, idempotency): NOT RUN** — require a state change or a second session, i.e. write-enabled UAT.
- **Realtime dimension is therefore NOT complete** per Constitution §4.6 / §9.2.

---

## 7. Findings (updated)

| ID | Severity | Area | Finding | Evidence | Fix class |
|---|---|---|---|---|---|
| **W1‑F‑001** | S3 | Platform/Security | `GET /metrics` reachable unauthenticated (route templates only; no PII observed). Confirmed again — admin System‑Health page itself calls `/metrics` → 200. | `backend/src/infrastructure/metrics/metrics.ts` L60–69; `PUBLIC_PREFIXES` includes `/metrics` | code/config |
| **W1‑F‑002** | **S2** (potential S1) — **OPEN** | People/Auth | **Active QA/test accounts on Live**, incl. privileged roles: `Master Admin`, `Read Only Admin`, `Auditor`, `Accountant`, `Finance Manager`, plus `CZ QA …` player accounts — all `active` (16 observed on page 1). **Owner decision 2026‑11‑14: retain all 16 unchanged/active pending the authorization matrix; exposure documented and visible; NOT resolved.** | `/admin/users` desktop render; full list paginated | Owner decision recorded; write-enabled remediation deferred |
| **W1‑F‑003** | S4 | Platform | `/health/version` over-discloses build metadata (commit/buildTime/migration) | earlier Phase 1 | code |
| **W1‑F‑004** | S4 | Public/Auth | Raw i18n key `landing.nav.faq` rendered in login-page footer instead of "FAQ" | `/login` footer, link `/faq` | i18n |
| **W1‑F‑005** | **S2** | CRM | **Entire CRM module 500**: `/admin/crm/{dashboard,customers,segments,leads,campaigns,communications}` → `SYSTEM_INTERNAL_ERROR` | requestIds `1c2b6375…`, `7635cbfe…` | code (backend) |
| **W1‑F‑006** | **S2** | HR | **Entire HR module 404**: `/admin/hr/{dashboard,employees,departments,leave,attendance,payroll}` → `Route … not found` | 404 bodies | code (routes missing) |
| **W1‑F‑007** | **S2** | Inventory | **Entire Inventory module 404**: `/admin/inventory/{stock,warehouses,suppliers,purchase-orders}` | 404 bodies | code (routes missing) |
| **W1‑F‑008** | **S2** | Membership | `membership/campaigns` → 404, `membership/rewards` → 404 (only `plans` works) | 404 bodies | code (routes missing) |
| **W1‑F‑009** | **S2** | Finance | `GET /admin/withdrawals` list → 500 (stats + assignable-admins 200); also breaks the Reception page widget | requestId `c41da019…` | code (backend) |
| **W1‑F‑010** | **S2** | Notifications | `GET /admin/templates` → 500 (notification template management unusable) | requestId `336ebbb8…` | code (backend) |
| **W1‑F‑011** | **S2** | BI | `GET /bi/dashboard` → 500 | requestId `2b773dcf…` | code (backend) |
| **W1‑F‑012** | S3 | BI | `GET /bi/client-errors?limit=60` → 500 (web-vitals 200) | requestId `d744ecb3…` | code (backend) |
| **W1‑F‑013** | S3 | Academy | Frontend requests `limit=200/500`; backend validates `limit ≤ 100` → 400 on program/group/session dropdowns (groups, enrollments, schedules, attendance) | `{"path":["limit"],"message":"Too big: expected number to be <=100"}` | code (frontend) |
| **W1‑F‑014** | S3 | League | Divisions page calls `GET /admin/leagues/NaN/divisions` → 500 (no league selected) | requestId `bda05a8f…` | code (frontend) |
| **W1‑F‑015** | S3 | Accounting | Invoices page calls `GET /users?limit=200` → 404 (wrong path; should be `/admin/users`) | `{"message":"Route GET:/users?limit=200 not found"}` | code (frontend) |
| **W1‑O‑001** | S4 | Commerce | Brands page loads logos from third-party `placehold.co` (external requests; privacy/CSP/availability consideration) | screenshot/network | data/asset |

**Severity tally:** S1 = 0 · S2 = 8 · S3 = 5 · S4 = 3 (incl. 1 observation).

**Owner disposition (2026‑11‑14):** W1‑F‑002 is **retained and remains OPEN** — all 16 QA accounts stay
active/unchanged pending the authorization test matrix (recorded in `COURTZON_RELEASE_PROGRESS.md` §33.7.6).
Not resolved.

---

## 8. Blockers & NOT RUN

**Blockers (require write-enabled remediation / owner decisions):**
1. **W1‑F‑002** — privileged QA accounts on Live. **Owner decision (2026‑11‑14): retain all 16 accounts active and unchanged pending the authorization test matrix; no suspension/deletion/re-role/password reset.** The exposure remains documented and **F‑002 stays OPEN (not resolved)**. No production change was made.
2. **All 22 hard-fail pages + 7 partial** — fixes require code changes and a Live redeploy (write-enabled). Blocked in read-only W1; recorded.
3. **W1‑F‑001** `/metrics` — needs code/config change + separate Live-deployment approval.

**NOT RUN (explicit):**
- Role × scenario matrix (positive + negative) for any non‑`super_admin` role.
- Cross-tenant / cross-org isolation scenarios.
- Realtime RT‑1…RT‑6.
- Any write scenario (create/update/delete/approve/refund/etc.).
- Physical iPhone & Android device verification.
- Credential-strength test on QA accounts (explicitly out of scope; would be an auth attempt).

---

## 9. No-Production-Change Confirmation

- **Business API methods used:** `GET` only.
- **Navigation:** same-origin route changes only; no form submits; no operational buttons; no dialogs; no uploads.
- **Automatic framework call:** `POST /auth/refresh` (session maintenance) — no business data touched.
- **No** SQL, no DB access, no seeds, no migrations.
- **No** Docker build/restart, no Git commit/push, no deployment.
- **Repository state:** working tree shows only the pre-existing ` M opencode.json` (approved Playwright MCP config). Temporary evidence screenshots were created and **deleted**; no new repo files at time of sweep.
- **Sensitive-data handling:** no cookies/tokens/passwords/session storage exported or reproduced; QA account phone numbers were **not** copied into this report.

---

## 10. W1 Exit Gate Status

**Status: ❌ NOT MET**

| §9.2 Exit criterion | State |
|---|---|
| All wave scenarios executed or explicitly BLOCKED/NOT RUN | ⚠️ partially (read-only portion done; write/realtime NOT RUN) |
| Role matrix complete for applied elements | ❌ NOT RUN |
| Realtime dimension (RT‑1…RT‑6) evidenced | ❌ NOT RUN |
| Stop conditions resolved/classified | ✅ none triggered (no S1 confirmed) |
| Actual side effects == expected side effects | ✅ (no writes performed) |
| No unauthorized write/state change | ✅ confirmed |
| All S1/S2 closed or ACCEPTED_RISK | ❌ **8 S2 open** — **F‑002 explicitly retained/open by Owner decision (2026‑11‑14)**, not closed |
| Evidence retained & traceable | ✅ (requestIds + per-page captures) |
| Progress file updated | ✅ recorded as §33 in `COURTZON_RELEASE_PROGRESS.md` (2026‑11‑14) |

**Transition Gate (§5.5) to write-enabled UAT: NOT PASSED.** Write-enabled UAT must not begin without:
1. Explicit written approval of this W1 output.
2. Frozen write-scenario list, test accounts, orgs/branches, data boundaries, and rollback plans.
3. A recorded gate-approval entry (who/when/scope).

**Recommended next actions (in order):**
1. Triage the 8 S2 findings — decide fix-vs-accept for each (F‑002 first).
2. Persistence is **complete and verified** — this report is recorded in `COURTZON_RELEASE_PROGRESS.md` §33 (F‑002 Owner decision in §33.7.6). The next action is review and triage of the eight open S2 findings.
3. Once S2s are addressed, schedule a second read-only pass to re-verify, then form the §5.5 transition package.

---

## Appendix A — Evidence index (request IDs, no PII)

| Ref | Endpoint | Result | requestId |
|---|---|---|---|
| CRM dashboard | `/admin/crm/dashboard` | 500 | `1c2b6375-58d3-4a6b-83c0-0b4d57dbfcbb` |
| CRM communications | `/admin/crm/communications` | 500 | `7635cbfe-cd7d-4259-b673-cc4513822385` |
| Withdrawals | `/admin/withdrawals` | 500 | `c41da019-6d8d-4053-a7ee-7061aa28e9c3` |
| Notification Templates | `/admin/templates` | 500 | `336ebbb8-1d57-4a4d-b11f-cfb348840f49` |
| BI dashboard | `/bi/dashboard` | 500 | `2b773dcf-99fe-401b-a1ca-61476bfea276` |
| BI client-errors | `/bi/client-errors` | 500 | `d744ecb3-86ea-4449-9a01-6eaeffacf8b7` |
| League divisions | `/admin/leagues/NaN/divisions` | 500 | `bda05a8f-e174-4f54-855f-a07477e578b4` |
| Academy limit | `/admin/academy/programs?limit=200` | 400 | `531da1ea-26da-4a30-86a0-daafaf7c2395` |
| HR | `/admin/hr/*` | 404 | `Route … not found` |
| Inventory | `/admin/inventory/*` | 404 | `Route … not found` |
| Membership | `/admin/membership/{campaigns,rewards}` | 404 | `Route … not found` |

## Appendix B — Tooling / safety guardrails in force

- Playwright MCP pinned `@playwright/mcp@0.0.85`, dedicated persistent profile `C:\Users\mniaz\.playwright-mcp\courtzon-live`.
- Denied tools (enforced via `permissions` + `policies`, verified by catalog absence): `browser_run_code_unsafe`, `browser_file_upload`, `browser_drop`, `browser_evaluate`.
- Allowed interaction limited to navigation, snapshots, screenshots, console/network inspection, resize, media emulation, and navigation-only clicks.
