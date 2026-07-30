# CourtZon v1.0 — Official Documentation Suite

---

## 1. Super Admin Manual

**Role:** Full platform access, system configuration, user management, financial oversight.

**Permissions:** All 801 permission keys. All 53 modules.

**Navigation:** Full sidebar + admin menu. Access to `/admin/*` routes.

**Daily Tasks:**
- Monitor system health (SystemHealthPage, `/admin/health`)
- Manage users and roles (UserListPage, RoleListPage, `/admin/users`)
- Review audit logs (AuditLogPage, `/audit-logs`)
- Handle approval requests (AdminApprovalsPage)
- Configure app settings (AppSettingsPage)
- Manage feature flags (FeatureFlagsPage)
- View analytics (AdminAnalyticsPage, BIDashboardPage)
- Monitor queues (QueueManagementPage)

---

## 2. Organization Admin Manual

**Role:** Manage a specific organization's branches, resources, staff, bookings, and finances.

**Permissions:** Org-scoped: branches, resources, bookings, staff, reports, marketplace, settings.

**Navigation:** Org sidebar after selecting organization.

**Daily Tasks:**
- Manage branches (BranchListPage, OrgBranchesPage)
- Manage resources/courts (ResourceListPage)
- Manage staff (OrgStaffPage, EmployeeListPage)
- View organization bookings (OrgBookingsPage)
- Manage schedules and working hours
- Configure org settings (OrgSettingsPage)
- View org reports (OrgReportsPage, OrgFinancePage)
- Manage marketplace products (OrgMarketplacePage)

---

## 3. Branch Manager Manual

**Role:** Day-to-day operations of a specific branch, including court management, scheduling, and customer service.

**Permissions:** Branch-scoped: resources, bookings, check-in, reports.

**Navigation:** Branch management sidebar.

**Daily Tasks:**
- View today's bookings
- Manage court availability
- Process check-ins
- Handle cancellations
- View branch reports
- Manage resource maintenance schedules
- Monitor branch performance

---

## 4. Receptionist Manual

**Role:** Front-desk operations: walk-in bookings, check-ins, payments, customer assistance.

**Permissions:** Bookings (view, create, cancel), check-in, payments (wallet view).

**Navigation:** Reception dashboard.

**Daily Tasks:**
- Create walk-in bookings for customers
- Process check-ins for arriving customers
- Accept payments (cash, card, wallet)
- Cancel or reschedule bookings
- Answer customer inquiries
- Print receipts

---

## 5. Coach Manual

**Role:** Manage coaching sessions, player relationships, availability, and revenue.

**Permissions:** Coach profile, sessions, availability, player management, reviews.

**Navigation:** Coach sidebar (or dashboard via `/coaches/*`).

**Daily Tasks:**
- Set availability (CoachAvailabilityPage)
- View upcoming sessions (CoachSessionsPage, TodaySessions)
- Manage session bookings (CoachBookingPage)
- Communicate with players
- Record session attendance
- View earnings (CoachRevenuePage)
- Update profile and credentials

---

## 6. Player Manual

**Role:** Book courts, join matches, manage wallet, shop marketplace, participate in tournaments.

**Permissions:** 12 modules: bookings, matches, wallet, marketplace, tournaments, academies, profile, notifications, favorites, coaches, community.

**Navigation:** BottomNav (mobile): Home, Bookings, Marketplace, More, Profile.

**Daily Tasks:**
- Browse available courts and book (BookingFormPage)
- View and manage bookings (MyBookingsPage)
- Join public matches (MatchListPage, MatchLobbyPage)
- Shop marketplace (MarketplacePage, CartPage, OrdersPage)
- Manage wallet (WalletPage — deposit, withdraw, transactions)
- Register for tournaments (TournamentListPage)
- Enroll in academies (AcademyListPage)
- View notifications (NotificationsPage)
- Update profile (ProfilePage)
- Manage favorites (FavoritesPage)

---

## 7. Accountant Manual

**Role:** Financial operations: invoices, payments, reconciliations, reports, settlements.

**Permissions:** Financial module: ledger, journal, reports, settlements, payments, reconciliation.

**Navigation:** Finance sidebar.

**Daily Tasks:**
- View chart of accounts (ChartOfAccountsPage)
- Review journal entries (JournalEntryPage)
- Run trial balance
- View general ledger (GeneralLedgerPage, LedgerViewerPage)
- Process settlements (SettlementListPage)
- Manage withdrawal requests (WithdrawalRequestsPage)
- View financial reports (FinanceDashboardPage)
- Run payment reconciliation

---

## 8. Tournament Manager Manual

**Role:** Create and manage tournaments, brackets, matches, standings, and player registrations.

**Permissions:** Tournament module: create, update, delete, publish, manage registrations, manage results.

**Navigation:** Tournament management sidebar.

**Daily Tasks:**
- Create tournaments (TournamentCreatePage)
- Manage registrations
- Generate brackets
- Schedule matches
- Record match results
- Update standings
- Manage participants
- Publish tournament updates

---

## 9. Academy Manager Manual

**Role:** Manage academy programs, enrollments, groups, coaches, attendance, and curriculum.

**Permissions:** Academy module: programs, enrollments, groups, coaches, attendance, evaluations.

**Navigation:** Academy management sidebar.

**Daily Tasks:**
- Manage programs (AcademyProgramsPage)
- Handle enrollments (AcademyEnrollmentsPage)
- Manage groups (AcademyGroupsPage)
- Assign coaches
- Record attendance
- Manage curriculum
- View academy dashboard (AcademyDashboardPage)
- Evaluate players

---

## 10. Marketplace Manager Manual

**Role:** Manage marketplace products, categories, brands, seller approvals, orders, and shipping.

**Permissions:** Marketplace moderate, seller management, product categories, brands, tags.

**Navigation:** Marketplace admin sidebar.

**Daily Tasks:**
- Moderate products
- Manage categories (ProductCategoriesPage)
- Manage brands (BrandsPage)
- Approve seller upgrades
- Process seller settlements
- Manage shipping rates
- View marketplace analytics
- Handle seller disputes

---

## Operations Manual

### System Administrator Guide
- **Health Monitoring:** `GET /health`, `GET /health/live`, `GET /health/ready`
- **Metrics:** `GET /metrics` (Prometheus format, requires METRICS_TOKEN)
- **Queues:** BullMQ dashboard (monitor job counts, failures, retries)
- **Logs:** `docker compose logs backend` (structured JSON logging)
- **Migrations:** `node backend/scripts/migrate.js [--status] [--fresh]`
- **Permission Sync:** `node backend/scripts/sync-ui-registry.js` + `sync-role-permissions.mjs`

### Deployment Guide
1. `git pull origin master`
2. `docker compose build backend frontend`
3. `docker compose up -d`
4. `node backend/scripts/migrate.js`
5. Verify: `curl http://localhost:3000/health`

### Backup & Restore
- **Backup:** `bash scripts/backup.sh` or `node backend/scripts/backup.js`
- **Restore:** `bash scripts/restore.sh <file>` or `node backend/scripts/restore.js <file>`
- **Emergency Repair:** `node backend/scripts/emergency-repair.js`

### Upgrade Guide
- Migrations are additive only
- `node backend/scripts/migrate.js --status` to check pending
- `node backend/scripts/migrate.js` to apply

### Troubleshooting Guide
| Symptom | Check | Fix |
|---------|-------|-----|
| Backend 503 | `docker compose ps` | `docker compose restart backend` |
| Database connection failure | `docker compose logs mysql` | `docker compose restart mysql` |
| Redis connection failure | `docker compose logs redis` | `docker compose restart redis` |
| Migration failure | `node backend/scripts/migrate.js --status` | Apply pending manually |
| Permission issues | `sync-ui-registry.js` + `sync-role-permissions.mjs` | Re-sync permissions |

### Monitoring Guide
- **Prometheus:** `http://host:9090/targets` — check all targets are UP
- **Grafana:** `http://host:3001` — pre-configured dashboards
- **Alert Rules:** 6 rules configured (BackendDown, HighErrorRate, HighLatency, ElevatedErrors, NotificationDeliveryFailure, RedisUnavailable)

### Disaster Recovery Guide
| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Backend crash | <30s | Docker auto-restart |
| MySQL crash | <60s | Docker restart, persistent volume |
| Redis crash | <30s | Docker restart, AOF recovery |
| Full data loss | <15min | `migrate.js --fresh --seed` + baseline |
| Corrupt data | <30min | Point-in-time restore from backup |
| Failed deployment | <10min | Git revert + rebuild |
