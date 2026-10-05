# 26 — KNOWN ISSUES

**Audit:** 2026-10-04 · Evidence-based only (code/DB/tests/logs). Prioritized.

Legend: P0=blocker for real users · P1=fix soon · P2=important · P3=low.

---

| Prio | Issue | Module | Evidence | Impact | Current workaround | Recommended fix |
|---|---|---|---|---|---|---|
| P0 | `payment_allocations` missing from `database/baseline/001_courtzon_v3.sql` | Database/Deploy | Baseline file (328 tables) vs live DB (330); table used by `payment.service.ts:1420`, `payment-allocation.repository.ts` | Fresh install (from baseline+seeds) breaks recurring-series payment bookkeeping | Manual apply of `178_payment_allocations.sql` | Re-export baseline from full migration chain |
| P0 | Real payments never exercised (Paymob sandbox) | Payments | `.env` PAYMOB_SANDBOX=true; 1080/1086 sandbox `paid` | No production confidence in gateway/refund | — | Gateway pilot + HMAC verification (U1) |
| P0 | Settlement pipeline never executed | Settlement | `settlements`=0, `settlement_entitlements`=0, `gateway_settlements`=0 | Settlement/clearing correctness unproven | — | End-to-end settlement UAT |
| P0 | Marketplace orders never completed | Marketplace | `orders`=0 | Checkout→stock→fulfilment→settlement unproven | — | Buy flow UAT (+settlement) |
| P1 | Membership G11.22 zero live data | Membership | `membership_plan_versions`=0, subscriptions=0, installments=0 | Billing model unproven in practice | — | Purchase-path UAT (24-MS-*; mas) |
| P1 | SMS/Push/WhatsApp providers are mock | Notifications | providers code; `.env.example` notes | Users told "delivered" without real send; compliance risk | Use in-app only | integrate real providers or mark channel unavailable |
| P1 | Frontend `/admin` gate = hardcoded role list | Frontend Auth | `App.tsx` ProtectedRoute/AdminRoute | Permissions-blind; accountant sees full admin; custom roles misfire | — | Permission-based guard + home resolver |
| P1 | Webhook (`/payments/webhook`) unauthenticated endpoint | Payments | `payment.routes.ts:7` | Forgery risk if HMAC missing/bad | — | Gateway HMAC verify (U1) |
| P1 | No CSRF protection found | Auth/Security | codebase search | Cookie-authenticated CSRF | SameSite reliance | CSRF token or SameSite=Strict review |
| P2 | `financial_journal_entries` dormant (0 rows) | Accounting | DB count | Report ambiguity; possible drift | Document | Remove or wire consistently |
| P2 | `gitCommit` unknown in backend image | DevOps | `/health/version` = "unknown" | No artifact traceability | — | Pass GIT_COMMIT in CI/build |
| P2 | `ledger_entries` has `membership` source rows (1,715) without subscriptions | Accounting | SQL counts | Unexplained historical rows | — | Lineage investigation (U18) |
| P2 | Concurrency locking unverified (slot/stock) | Booking/Marketplace | No FOR UPDATE found | Race double-book/oversell | — | FOR UPDATE + DB checks + race test |
| P2 | Org-subscription has no trial/grace/upgrade path | Subscriptions | schema+workers | Poor product | — | Define owner policy |
| P2 | `103b_coa_cleanup.sql` applied-but-orphaned | Migrations | history vs disk | Minor confusion | — | Note/clean in chain |
| P3 | Duplicated migration numbers (`002_*`×3, no 001/076) | Migrations | file list | Confusing chain | — | Future renumber migration |
| P3 | `users.id` INT vs BIGINT FK typing mismatch | DB | schema | Risk in large join casts | — | Align types in next big migration |
| P3 | i18n key registry file hand-edits clobbered | Frontend | boot sync | Translation edits lost | Edit registry source | Document generation |
| P3 | `courtzon_v3_baseline` DB stale on server (317 tables) | Infra | live query | Confusion in ops | — | Drop or refresh |
| P3 | Legacy V2 images/DB remain inline | Infra | docker images; XAMPP DB | Storage; confusion | — | Archive/deprecate |