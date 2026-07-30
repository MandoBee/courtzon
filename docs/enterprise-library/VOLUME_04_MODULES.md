# CourtZon Enterprise Platform — Volume 04: Modules Reference

## Module Directory: `backend/src/modules/` (53 modules)

| # | Module | Files | Routes | Purpose | Status |
|---|--------|-------|--------|---------|--------|
| 1 | academy | 14 | 38 | Academy programs, groups, enrollments, attendance | ✅ |
| 2 | accounting | 3 | 23 | Chart of accounts, general ledger, invoices, tax | ✅ |
| 3 | activities | 7 | 5 | Coach session activities, attendance | ✅ |
| 4 | admin | 8 | 10 | System settings, feature flags, health, cache, queues | ✅ |
| 5 | amenities | 5 | 3 | Branch amenities CRUD | ✅ |
| 6 | approvals | 4 | 3 | Marketplace seller upgrade approvals | ✅ |
| 7 | app-settings | 6 | 5 | Branding, PWA icons, site configuration | ✅ |
| 8 | audit-log | 9 | 1 | Audit trail recording and querying | ✅ |
| 9 | auth | 12 | 17 | Login, register, profile, sessions, password reset | ✅ |
| 10 | banks | 5 | 5 | Bank CRUD | ✅ |
| 11 | bi | 3 | 6 | Executive dashboard, KPI snapshots, CSV export | ✅ |
| 12 | booking | 41 | 18 | Court booking, matchmaking, check-in, cancellation | ✅ |
| 13 | brute-force | 2 | 0 | Login attempt tracking (internal) | ✅ |
| 14 | cities | 5 | 4 | City reference data | ✅ |
| 15 | cms | 6 | 6 | Content pages, blogs, contact form | ✅ |
| 16 | coaches | 4 | 1 | Coach session state machine (internal) | ✅ |
| 17 | community | 5 | 35+ | Follow, friends, events, chat, groups | ✅ |
| 18 | countries | 5 | 5 | Country reference data | ✅ |
| 19 | coupon | 6 | 2 | Coupon validation, CRUD | ✅ |
| 20 | crm | 3 | 18 | Customer 360, segments, leads, campaigns | ✅ |
| 21 | currencies | 5 | 5 | Currency reference data | ✅ |
| 22 | design-tokens | 5 | 5 | Theme/appearance design tokens | ✅ |
| 23 | financial | 23 | 10 | Ledger, settlements, withdrawals, commissions | ✅ |
| 24 | geo | 3 | 2 | IP-based geolocation, currency detection | ✅ |
| 25 | hr | 3 | 52 | Employees, leave, attendance, payroll | ✅ |
| 26 | integration | 5 | 11 | API keys, API gateway (/api/v1/) | ✅ |
| 27 | languages | 5 | 5 | Language reference data | ✅ |
| 28 | leagues | 19 | 42 | Seasons, leagues, divisions, fixtures, standings | ✅ |
| 29 | marketplace | 26 | 70 | Products, cart, orders, reviews, shipping, seller | ✅ |
| 30 | match | 31 | 9 | Public matchmaking, join/withdraw, applicants | ✅ |
| 31 | membership | 11 | 14 | Plans, benefits, assignments, loyalty | ✅ |
| 32 | mobile | 3 | 13 | Push tokens, app versions, remote config | ✅ |
| 33 | notifications | 61 | 48 | In-app, push, email, SMS, broadcast, templates | ✅ |
| 34 | organisations | 24 | 85 | Orgs, branches, resources, sports, staff | ✅ |
| 35 | payment | 14 | 13 | Paymob gateway, webhooks, reconciliation | ✅ |
| 36 | player-experience | 7 | 12 | Player dashboard, search, favorites, devices | ✅ |
| 37 | pricing | 9 | 10 | Pricing rules, formulas, calculations | ✅ |
| 38 | provinces | 5 | 4 | Province reference data | ✅ |
| 39 | rbac | 12 | 42 | Roles, permissions, users, UI registry | ✅ |
| 40 | realtime | 11 | 0 | Socket.IO gateway (event-driven) | ✅ |
| 41 | reference-data | 1 | 0 | Shared reference data types | ✅ |
| 42 | reports | 4 | 30 | Financial, booking, user, org reports | ✅ |
| 43 | scheduling | 15 | 3 | Coach+court search, availability, booking | ✅ |
| 44 | security | 10 | 13 | Sessions, failed logins, upload security | ✅ |
| 45 | settlement | 11 | 9 | Marketplace settlement lifecycle | ✅ |
| 46 | sidebar-layout | 4 | 3 | Sidebar item reordering | ✅ |
| 47 | sports-engine | 5 | 8 | ELO rankings, recommendations, analytics | ✅ |
| 48 | support | 3 | 9 | Support tickets, messages, assignment | ✅ |
| 49 | time | 13 | 0 | Time engine, slot generation (internal) | ✅ |
| 50 | tournaments | 9 | 31 | Tournaments, brackets, standings | ✅ |
| 51 | translations | 7 | 6 | Translation key management, locale packs | ✅ |
| 52 | upload | 12 | 8 | File upload, image processing, validation | ✅ |
| 53 | wallet | 17 | 4 | Balance, deposit, withdraw, transactions | ✅ |

## Evidence

All module directories verified at `C:\Users\mniaz\Desktop\CourtZon-V2\backend\src\modules\`. File counts from `Get-ChildItem -Recurse -File`.
