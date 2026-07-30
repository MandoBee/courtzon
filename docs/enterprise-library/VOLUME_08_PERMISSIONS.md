# CourtZon Enterprise Platform — Volume 08: Permissions Reference

## Permission Architecture

CourtZon uses a centralized permission registry. Every permission is:
1. **Defined** in `frontend/src/permissions/registry.ts` as a `UIElement` entry
2. **Synced** to the `permissions` database table via `node backend/scripts/sync-ui-registry.js`
3. **Assigned** to roles via `role_permissions` table
4. **Enforced** on the backend via `requirePermission([...])` middleware
5. **Gated** on the frontend via `<Can permission="key">` component

**Evidence:** `backend/src/shared/middleware/auth.middleware.ts:50-70` implements `requirePermission`. `frontend/src/permissions/Can.tsx` implements `<Can>`.

## Permission Naming Convention

```
{module}.{action}
{module}.{entity}.{action}
{module}.{entity}.{field-name}
```

**Examples:**
```
booking.create           — Create bookings
booking.view              — View bookings  
booking.cancel            — Cancel bookings
booking.matchmaking       — Matchmaking operations
academy.enroll            — Enroll in academy programs
tournament.manage         — Manage tournaments (groups, fixtures, bracket)
league.result.manage      — Manage league match results
```

## Complete Permission Registry (250+ permissions)

### Identity & Auth
| Permission | Type | Component |
|-----------|------|-----------|
| `users.view` | page | UserListPage |
| `users.create` | button | Create user |
| `users.edit` | button | Edit user |
| `users.edit.first-name` | field | First name field |
| `users.edit.email` | field | Email field |
| `users.delete` | action | Delete user |
| `users.assign-role` | action | Assign role |
| `users.change-password` | action | Change password |

### Booking
| Permission | Type | Component |
|-----------|------|-----------|
| `bookings.create` | action | Create booking |
| `bookings.create.date` | field | Date field |
| `bookings.create.start-time` | field | Start time field |
| `bookings.create.notes` | field | Notes field |
| `bookings.view` | page | My bookings |
| `bookings.cancel` | button | Cancel booking |
| `bookings.check-in` | button | Check in |
| `bookings.matchmaking` | action | Matchmaking |
| `admin.bookings.update-status` | action | Admin status update |
| `org.bookings.manage` | action | Org booking manage |

### Marketplace
| Permission | Type | Component |
|-----------|------|-----------|
| `marketplace.sell` | action | Sell on marketplace |
| `marketplace.moderate` | action | Admin moderation |
| `marketplace.seller.settlements` | action | View settlements |
| `marketplace.seller.request-settlement` | action | Request settlement |

### Academy
| Permission | Type | Component |
|-----------|------|-----------|
| `academy.view` | page | Academy programs |
| `academy.create` | button | Create program |
| `academy.update` | button | Update program |
| `academy.delete` | button | Archive program |
| `academy.publish` | button | Publish program |
| `academy.enroll` | button | Enroll player |
| `academy.manage` | action | Manage groups |
| `academy.dashboard.view` | page | Academy dashboard |
| `academy.self_enroll` | action | Self-enroll |
| `attendance.manage` | action | Manage attendance |

### Tournament
| Permission | Type | Component |
|-----------|------|-----------|
| `tournament.view` | page | Tournament list |
| `tournament.create` | button | Create tournament |
| `tournament.update` | button | Update tournament |
| `tournament.delete` | button | Archive tournament |
| `tournament.publish` | button | Publish tournament |
| `tournament.register` | button | Register player |
| `tournament.manage` | action | Generate groups/fixtures |
| `tournament.result.manage` | action | Record results |
| `tournament.dashboard.view` | page | Tournament dashboard |

### League & Season
| Permission | Type | Component |
|-----------|------|-----------|
| `season.view` | page | Season list |
| `season.create` | button | Create season |
| `season.update` | button | Update season |
| `season.delete` | button | Archive season |
| `season.publish` | button | Publish season |
| `league.view` | page | League list |
| `league.create` | button | Create league |
| `league.update` | button | Update league |
| `league.delete` | button | Archive league |
| `league.manage` | action | Manage divisions/fixtures |
| `league.result.manage` | action | Record results |
| `league.dashboard.view` | page | League dashboard |
| `league.self_register` | action | Self-register team |

### Finance
| Permission | Type | Component |
|-----------|------|-----------|
| `financial.view` | page | Financial admin |
| `financial.withdraw` | action | Withdraw wallet |
| `financial.process_payouts` | action | Process payouts |
| `financial.reconcile` | action | Financial reconciliation |

### Accounting
| Permission | Type | Component |
|-----------|------|-----------|
| `accounting.coa.view` | page | Chart of accounts |
| `accounting.coa.manage` | button | Manage accounts |
| `accounting.periods.view` | page | Accounting periods |
| `accounting.periods.manage` | button | Manage periods |
| `accounting.gl.view` | page | General ledger |
| `accounting.journal.view` | page | Journal entries |
| `accounting.journal.create` | button | Create journal |
| `accounting.invoices.view` | page | Invoices |
| `accounting.invoices.manage` | button | Manage invoices |
| `accounting.tax.view` | page | Tax rates |
| `accounting.tax.manage` | button | Manage tax rates |

### CRM
| Permission | Type | Component |
|-----------|------|-----------|
| `crm.dashboard.view` | page | CRM dashboard |
| `crm.customers.view` | page | Customer list |
| `crm.segments.view` | page | Segments |
| `crm.segments.manage` | button | Manage segments |
| `crm.leads.view` | page | Leads |
| `crm.leads.manage` | button | Manage leads |
| `crm.campaigns.view` | page | Campaigns |
| `crm.campaigns.manage` | button | Manage campaigns |
| `crm.communications.view` | page | Communication log |

### HR & Payroll
| Permission | Type | Component |
|-----------|------|-----------|
| `hr.dashboard.view` | page | HR dashboard |
| `hr.employees.view` | page | Employee list |
| `hr.employees.manage` | button | Manage employees |
| `hr.departments.view` | page | Departments |
| `hr.departments.manage` | button | Manage departments |
| `hr.leave.view` | page | Leave management |
| `hr.leave.manage` | button | Manage leave |
| `hr.attendance.view` | page | Attendance |
| `hr.payroll.view` | page | Payroll |
| `hr.payroll.manage` | button | Manage payroll |

### Player Experience
| Permission | Type | Component |
|-----------|------|-----------|
| `player.dashboard.view` | page | Player dashboard |
| `player.search` | page | Player search |
| `player.profile.view` | page | Public profile |
| `player.favorites.manage` | page | Favorites |
| `player.statistics.view` | page | Statistics |
| `player.achievements.view` | page | Achievements |
| `player.qr.view` | page | QR profile |
| `player.devices.manage` | page | Device management |
| `player.wallet.view` | page | Wallet |
| `player.payments.view` | page | Payments |
| `player.rank.history` | page | Rank history |
| `player.tournaments.register` | action | Tournament registration |

### Organization (Org-scoped)
| Permission | Type | Component |
|-----------|------|-----------|
| `org.dashboard.view` | page | Org dashboard |
| `org.sidebar.dashboard` | tab | Dashboard sidebar |
| `org.sidebar.marketplace` | tab | Marketplace sidebar |
| `org.sidebar.orders` | tab | Orders sidebar |
| `org.sidebar.bookings` | tab | Bookings sidebar |
| `org.sidebar.staff` | tab | Staff sidebar |
| `org.sidebar.members` | tab | Members sidebar |
| `org.sidebar.coaches` | tab | Coaches sidebar |
| `org.sidebar.finance` | tab | Finance sidebar |
| `org.sidebar.subscription` | tab | Subscription sidebar |
| `org.sidebar.settings` | tab | Settings sidebar |
| `org.staff.manage` | page | Manage staff |
| `org.members.manage` | page | Manage members |
| `org.coaches.manage` | page | Manage coaches |
| `org.bookings.manage` | page | Manage bookings |
| `org.branches.manage` | page | Manage branches |
| `org.resources.manage` | page | Manage resources |
| `org.marketplace.manage` | page | Manage marketplace |
| `org.settings.edit` | page | Edit settings |
| `org.announcements.manage` | action | Announcements |
| `org.documents.manage` | action | Documents |
| `org.gallery.manage` | action | Gallery |

### System & Admin
| Permission | Type | Component |
|-----------|------|-----------|
| `system_settings.view` | page | System settings |
| `system_settings.update` | button | Update settings |
| `feature_flags.view` | page | Feature flags |
| `feature_flags.update` | button | Update flags |
| `system_health.view` | page | System health |
| `cache.manage` | action | Cache management |
| `queue.view` | page | Queue status |
| `queue.manage` | action | Queue management |
| `audit.view` | page | Audit log |
| `settlements.*` | action | Settlement operations |

### Integration
| Permission | Type | Component |
|-----------|------|-----------|
| `integration.api-keys.view` | page | API keys |
| `integration.api-keys.manage` | button | Manage keys |

### Mobile
| Permission | Type | Component |
|-----------|------|-----------|
| `mobile.dashboard.view` | page | Mobile dashboard |
| `mobile.versions.view` | page | App versions |
| `mobile.versions.manage` | button | Manage versions |
| `mobile.config.view` | page | Remote config |
| `mobile.config.manage` | button | Manage config |
| `mobile.push.view` | page | Push log |

### BI
| Permission | Type | Component |
|-----------|------|-----------|
| `bi.dashboard.view` | page | BI dashboard |
| `bi.kpi.view` | page | KPI snapshots |
| `bi.export` | action | Export reports |
| `bi.observability.view` | page | Observability |

### Sports Engine
| Permission | Type | Component |
|-----------|------|-----------|
| `sports-engine.view` | page | Rankings, analytics |
| `sports-engine.manage` | button | Calculate ELO |

## Permission Gaps (Identified)

| Module | Missing Permissions | Priority |
|--------|-------------------|----------|
| **notifications** | 25 admin routes lack ANY permission guard | **CRITICAL** |
| **marketplace** | 43 browse routes use authMiddleware only | Medium |
| **wallet** | 3 self-service routes use authMiddleware only | Medium |
| **payment** | 5 self-service routes use authMiddleware only | Medium |

**Evidence:** See `VOLUME_02_ROUTE_AUDIT.md` for full analysis with source line numbers.
