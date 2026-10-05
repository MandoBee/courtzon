# 08 — COMPLETE MODULE INVENTORY

**Audit:** 2026-10-04 · Every module below is verified to exist in current code and/or DB. Status per module.

Legend: ✅ IMPLEMENTED(live data or verified flow) · 🟡 PARTIAL(code complete, low/no live data) · ⏳ NOT IMPLEMENTED · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Authentication & Users
- **Purpose:** register/login/session/refresh/profile.
- **Frontend:** `pages/auth/*`, Register pages, ProfilePage.
- **Backend:** `modules/auth/*` (4 register handlers, login, refresh, logout, me, profile, reset, reactivation).
- **DB:** `users`, `user_sessions`, `user_devices`, `push_tokens`, `login_attempts`, `password_reset_tokens`, `api_keys`.
- **Status:** ✅. 74 users live. ⚠️ `/admin` guard role-list (see 07). ⏳ phone OTP/2FA not implemented.

## 2. Organisations / Clubs / Branches
- **Purpose:** tenancy, org lifecycle, branch+resource management.
- **Frontend:** `pages/admin/organisations/*`, `pages/org/*`, OrgStorefront.
- **Backend:** `organisation.routes.ts` (86 endpoints — largest surface), `org-portal.routes.ts` (76), `branches`.
- **DB:** `organisations`, `branches`, `organisation_*`, `branch_*`, `user_organisations`, `user_branches`.
- **Status:** ✅ (66 orgs, 60 branches live). ⚠️ 86-route surface deserves permission sweep.

## 3. Memberships (legacy + G11.22)
- **Purpose (legacy):** plan benefits + `user_memberships`.
- **Purpose (G11.22 P1–P3):** versioned plans, snapshot subscriptions, installments, entitlements.
- **Frontend:** `pages/membership/*` (dashboard, storefront, my subscriptions), `pages/org/memberships/*`.
- **Backend:** `membership.routes.ts`, `membership-p1.routes.ts` (24 endpoints), services (plan-version, subscription, installment, renewal, cancel/refund, lifecycle, eligibility), listeners (P1 finalize on `payment:succeeded`), workers (expiry/overdue/reminders).
- **DB:** legacy (`membership_plans`, `membership_benefits`, `memberships`, `user_memberships`, `membership_history`) + new (`organisation_membership_settings`, `membership_plan_versions`, `membership_plan_components`, `membership_plan_branches`, `membership_subscriptions`, `membership_subscription_components`, `membership_plan_installment_templates`, `membership_installments`).
- **Status:** 🟡 Code complete; **0 live subscriptions/installments/versions → never exercised**.
- **Known gaps:** grace/installment UX only code; no seeded version; purchase path needs UAT.

## 4. Sports / Courts / Resources
- **Purpose:** sport catalog, courts, slots, pricing.
- **Frontend:** ResourceListPage, BookingForm, admin resources.
- **Backend:** `modules/sports-engine/*`, `scheduling/*`, `pricing/*`.
- **DB:** `resources`, `resource_types`, `resource_time_slots`, `resource_maintenance`, `resource_peak_hours`, `peak_hour_pricing`, `pricing_rules`, `pricing_seasons`, `amenities`, `sports`, `sport_formats`, `sport_positions`, `sport_rule_sets`.
- **Status:** ✅ (booking live). 

## 5. Bookings + Recurring Series
- **Purpose:** court booking lifecycle incl. matchmaking + recurring weekly series.
- **Frontend:** browse branches → resources → booking form → confirmation → MyBookings; match pages.
- **Backend:** `booking.routes.ts` (27), `booking.service.ts` (40+ methods), recurring series service, payment listeners, workers (cancel_expired, auto-complete, settlement-eligibility, saga_repair).
- **DB:** `bookings`, `booking_slots`, `booking_cancellations`, `booking_players`, `booking_participants`, `booking_invitations`, `booking_matchmaking_requests`, `booking_settlements`, `booking_series`.
- **Status:** ✅ (25 bookings live). Deep audit → `09_BOOKING_ENGINE.md`.

## 6. Scheduling / Time Engine
- **Purpose:** timezones, DST-safe scheduling, sagas.
- **Backend:** `scheduling-engine.ts`, `modules/scheduling/*`, `time` module, `getLocalBusinessDate` util.
- **DB:** scheduling tables + `bookings.start_at_utc/end_at_utc`.
- **Status:** ✅ core; DST cron is UTC-by-design (comment BE-6).

## 7. Academies
- **Purpose:** program/enrollment/session/attendance/evaluation.
- **Frontend:** `pages/player/academy/*`, `pages/admin/academy/*`, `pages/coaches/CoachAcademySessionsPage`.
- **Backend:** `academy.routes.ts` (77 endpoints), services, `academy-hold-expiry.worker.ts`, entitlement-academy listener.
- **DB:** `academies`, `academy_*` (programs, curriculums, groups, schedules, group_sessions, sessions, enrollments, enrollment_payments, attendance, evaluations, categories).
- **Status:** 🟡 Code complete + seed programs; **0 `academies` rows live** → enroll/pay flow untested.

## 8. Coaches / Private Training
- **Purpose:** coach profiles, availability, org agreements, sessions, reviews.
- **Frontend:** `/coach` layout, CoachDirectory, CoachProfile, /coaches/*.
- **Backend:** `coaches/index.js` (routes kept in `modules/coaches`), coach-session lifecycle.
- **DB:** `coach_profiles`, `coach_org_agreements`, `coach_availability`(+blackouts), `coach_service_locations`, `coach_reviews`, `coach_sessions`, `coach_session_events`, `coaches`.
- **Status:** 🟡 Code complete; **0 coach_profiles live** → booking/settlement coach flows untested.

## 9. Matches & Results
- **Purpose:** match invitations, results, auto-approval, ELO.
- **Frontend:** MatchList, MatchLobby, MatchResult pages, admin/org match pages, referee pages.
- **Backend:** `match.routes.ts`, `org-match.routes.ts`, `match-result/*`, `match-lifecycle.worker.ts`, `match_result_deadlines`.
- **DB:** `matches`, `match_participants`, `match_result_records`, `match_result_participants`, `match_sessions`, `public_match_details`, `player_match_requests`, `match_result_*`.
- **Status:** ✅ implemented.

## 10. Tournaments
- **Purpose:** create/discover/register/pay/brackets/matches/standings/prizes/teams.
- **Frontend:** `pages/tournaments/*`, `pages/admin/tournament*`, `pages/org/OrgTournaments*`, `pages/player/TournamentsPage/PublicTournaments*`.
- **Backend:** `tournament.routes.ts` (80 endpoints!), `org-tournament.routes.ts`, `public-tournament.routes.ts`, services + `tournament-entitlement-activation.worker.ts`, `tournament-payment.listener`, prize listener, progression listener.
- **DB:** `tournaments` + 20+ tournament_* tables.
- **Status:** ✅ (3 tournaments, 15 pending entitlement adjustments live). Deep audit: see 08 module details in `09`/`19`/`24`.

## 11. Leagues
- 🟡 Implemented (42 endpoints in `league.routes.ts`); zero live leagues observed in counts (no query run) — treat as low-data.

## 12. Marketplace
- **Purpose:** products, variants, cart, checkout, orders, complaints, inventory.
- **Frontend:** `pages/marketplace/*`, admin marketplace pages, SellerDashboard.
- **Backend:** `marketplace.routes.ts` (71), `marketplace-complaint.routes.ts` (14), `inventory.routes.ts` (21), admin-categories/brand/tag.
- **DB:** products, variants, cart_items, orders, order_items, complaints, warehouses, inventory_logs, seller_profiles, coupons, wishlist.
- **Status:** 🟡 Catalogue live (58 products), **orders 0** → checkout/settlement path untested. Deep audit: `12_MARKETPLACE.md`.

## 13. Payments / Refunds
- **Purpose:** wallet/card/cash charging, webhooks, recovery, expiry, refunds.
- **Backend:** `payment.routes.ts` (13), `payment.service.ts`, `wallet.app`/`withdrawal`, `booking/payment-allocation`, `recurring-payment`.
- **DB:** `payment_transactions`, `payment_allocations`, `gateway_settlements`, `withdrawal_requests`, `invoices`.
- **Status:** ✅ sandbox (1,086 tx paid). Real gateway unverified. Deep: `10_PAYMENT_SYSTEM.md`, `11_ACCOUNTING_SYSTEM.md`.

## 14. Subscriptions (Org billing)
- **Purpose:** org→subscription_plans, expire/remind workers.
- **Backend:** subscription-lifecycle workers (expire_subscriptions, send_subscription_reminders), org subscription routes + admin UI.
- **Status:** 🟡 implemented; 1 `subscription` reference_type payment live; ⏳ no trial/grace; accounting flow partially seeded.

## 15. Wallets
- **Purpose:** balances, deposits, withdrawals (multi-state).
- **Frontend:** `/my/wallet`, WithdrawalPage, admin WithdrawalQueue.
- **Backend:** `wallet.routes.ts` (6), wallet.service (getMyWallet, deposit, withdraw, transactions), withdrawal.service, wallet-payment listener.
- **Status:** ✅ (254 wallets, 409 tx). Withdrawal lifecycle multi-state implemented.

## 16. Accounting / Ledger / Entitlements
- **Purpose:** CoA, general ledger, entitlements, settlements.
- **Backend:** `accounting.routes.ts` (67!), `ledger.routes.ts`, `transaction.routes.ts`, `financial-admin.routes.ts`, `financial-entitlement.routes.ts`, `accounting.repositories`, `entitlement-*` listeners, replay workers.
- **DB:** chart_of_accounts, ledger_entries, general_ledger, financial_journal_entries (empty), financial_entitlements, transactions/transaction_entries, marketplace_ledger_entries, year_close*.
- **Status:** ✅ booking accounting live; 🟡 settlement path 0; ❌ `financial_journal_entries` unused → decision required.

## 17. Gateway Clearing / Settlement
- **Backend:** `gateway-settlement.routes.ts`, backfilling from `gateway_settlements`; UI pages GatewaySettlementPage.
- **Status:** ⏳ tables/UI present, **0 rows** → clearing pipeline unproven. Deep: `10`/`11`.

## 18. Unified Settlement
- **Purpose:** org settlements from entitlements.
- **Backend:** `unified-settlement.routes.ts` (7 endpoints), `settlement.routes.ts`.
- **Status:** ⏳ code+UI, **0 settlements** → highest-risk area. 

## 19. Notifications
- **Purpose:** platform notifications (all channels).
- **Backend:** `notification.routes.ts` (61!), `notification-type.routes.ts`, `template-management.routes.ts`, `communication-preference.routes.ts`, engine + providers.
- **Status:** ✅ engine + in-app/email; ⏳ push/SMS mock.

## 20. Push / Webhooks
- Push: ⏳ mock (FCM/APNs stubs). Webhooks: ✅ provider + delivery; payment webhook unverified HMAC.

## 21. Realtime / Socket.IO
- ✅ rooms + publisher + health.
- 2 rooms design verified; stale-UI caveats in `15_REALTIME_SOCKETIO.md`.

## 22. Reports / Dashboard
- `reports.routes.ts` (28), `bi.routes.ts` (6), `modules/reports/*`, admin reports/dashboards, HR/CRM BI pages.
- Status: ✅ implemented; ⏳ data flows (CRM/HR/BI) have zero live data.

## 23. Admin / Security
- ✅ `admin.routes.ts` (26), `security.routes.ts` (13), security dashboard, sessions, failed logins, system health, role audit; audit-log module.

## 24. Settings / Config / Appearance
- ✅ app-settings (1 route file listed; module), design-tokens, sidebar-layout, feature-flags, translations (17), time zones.

## 25. Files / Images
- ✅ upload.routes.ts (12), upload.service hardening, static `/uploads/`.

## 26. Other discovered modules
- CMS (37 routes), Community (54), HR (52), CRM (20), Activities (34), Approvals (3+), Reference data (countries/provinces/cities/currencies/languages/amenities/banks), Integration (11, apiGateway), Mobile (13), Support (10), Brute-force, Security, Coupon, Geo, Reference-data, Player-experience, Profiling, Sidebar-layout — all ✅ wired; many with zero/none live data.

## 27. Cross-cutting known issues (evidence-based)
- Weak evidence coverage for money paths (orders/settlements/membership) — see `26_KNOWN_ISSUES.md`.
- Two ledger systems (`ledger_entries` vs `financial_journal_entries`).
- Orphan `academies`/`coach_profiles`/`seller_profiles` (0 rows).
- Route-surface imbalance: `organisation`/`tournament`/`academy`/`accounting` are the largest — most complex to audit.