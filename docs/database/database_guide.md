# Database Architecture Guide

## Overview

CourtZon uses **MySQL 8.0** as its primary database and **Redis 7** for caching, sessions, and job queues. The database schema follows a modular structure organized around business domains.

## Schema Overview

### Core Tables

#### Users & Authentication

| Table | Purpose |
|---|---|
| `users` | Core user accounts (players, coaches, admins, sellers) |
| `user_roles` | Role assignments (many-to-many) |
| `user_role_scopes` | Scoped role assignments (e.g., role within an organisation) |
| `user_sessions` | Active session tracking |
| `user_devices` | Device fingerprinting for security |
| `user_wallets` | Wallet balance per user |
| `wallet_transactions` | Wallet credit/debit history |
| `email_verification_tokens` | Email verification flow |
| `password_reset_tokens` | Password reset flow |
| `login_attempts` | Brute force detection |
| `brute_force_lockouts` | Account lockout tracking |

#### RBAC & Permissions

| Table | Purpose |
|---|---|
| `roles` | Role definitions (super_admin, org_admin, seller, player, etc.) |
| `permissions` | Flat permission keys (synced from frontend registry) |
| `permission_modules` | Module grouping for permissions |
| `role_permissions` | Many-to-many role ↔ permission mapping |
| `feature_flags` | Feature toggles gated by permission checks |

The RBAC system supports granular field-level permissions for form inputs, action-level permissions for buttons, and page-level access control. See `frontend/src/permissions/registry.ts` for the full list.

#### Organisations & Facilities

| Table | Purpose |
|---|---|
| `organisations` | Venues, academies, sports centres |
| `organisation_types` | Type definitions (court, academy, shop, etc.) |
| `organisation_type_attributes` | Dynamic attributes per type |
| `organisation_subscriptions` | Current subscription plan per org |
| `organisation_upgrade_requests` | Pending upgrade requests |
| `branches` | Physical locations of an organisation |
| `branch_amenity_assignments` | Amenities available at each branch |
| `branch_financial_details` | Financial/payout configuration per branch |

#### Courts & Resources

| Table | Purpose |
|---|---|
| `resource_types` | Types of bookable resources (court, hall, pitch, etc.) |
| `resource_type_attributes` | Dynamic attributes per resource type |
| `resources` | Individual bookable resources (Court A, Court B, etc.) |
| `resource_attribute_values` | Values for dynamic resource attributes |
| `amenities` | Available amenities (shower, parking, floodlights, etc.) |
| `court_amenities` | Many-to-many resource ↔ amenity |
| `cancellation_policies` | Cancellation rules per org/resource |

#### Bookings & Scheduling

| Table | Purpose |
|---|---|
| `bookings` | Core booking records |
| `booking_slots` | Time slots within a booking |
| `booking_participants` | Players in a group booking |
| `booking_invitations` | Invitations to join a booking |
| `booking_invitation_applications` | Applications for open slots |
| `cron_jobs` | Scheduled job configuration |
| `cron_job_runs` | Execution history |
| `scheduled_jobs` | BullMQ job records |
| `holidays` | Closed dates for branches |

#### Marketplace & Products

| Table | Purpose |
|---|---|
| `products` | Marketplace listings |
| `product_categories` | Category tree |
| `product_images` | Product image gallery |
| `product_variants` | Size/color/type variants |
| `brands` | Product brands |
| `tags` | Product/category tags |
| `cart_items` | Shopping cart |
| `orders` | Purchase orders |
| `order_items` | Line items within orders |
| `seller_shipping_rates` | Per-seller shipping config |
| `wishlist_items` | User wishlists |
| `ad_clicks` | Ad click tracking |
| `ad_impressions` | Ad impression tracking |

#### Payments & Financial

| Table | Purpose |
|---|---|
| `payment_gateway_config` | Gateway configuration (Paymob, Fawry, etc.) |
| `payment_methods` | Available payment methods |
| `payment_transactions` | Payment gateway transactions |
| `transactions` | Internal financial transactions |
| `transaction_entries` | Double-entry accounting entries |
| `commission_rules` | Commission rate configuration |
| `settlements` | Payout batch records |
| `settlement_items` | Individual payout line items |
| `financial_entries` | General ledger entries |
| `withdrawal_requests` | Manual withdrawal requests |
| `currencies` | Supported currencies |
| `exchange_rates` | Currency exchange rates |
| `platform_accounts` | Platform-level financial accounts |

#### Subscriptions & Plans

| Table | Purpose |
|---|---|
| `subscription_plans` | Available subscription tiers |
| `subscription_plan_rates` | Pricing per plan per duration |
| `subscription_plan_features` | Features included in each plan |
| `subscription_features` | Feature definitions |
| `organisation_subscriptions` | Active subscriptions |

#### CMS & Content

| Table | Purpose |
|---|---|
| `cms_pages` | CMS-managed pages |
| `cms_section_blocks` | Drag-and-drop page sections |
| `cms_blogs` | Blog posts |
| `languages` | Supported languages |
| `translations` | Key-value translation pairs |
| `translation_keys` | Translation key registry |

#### Design Tokens & Theming

| Table | Purpose |
|---|---|
| `design_tokens` | CSS variable tokens (colors, spacing, typography) |
| `design_token_versions` | Version history for design tokens |
| `design_theme_reset_baseline` | Theme reset snapshot |

#### Geography

| Table | Purpose |
|---|---|
| `countries` | Supported countries |
| `provinces` | Provinces/states (includes Egypt governorates with polygons) |
| `cities` | Cities within provinces |

#### Notifications

| Table | Purpose |
|---|---|
| `notifications` | User notification records |
| `notification_queue` | Outbound notification queue |
| `notification_categories` | Category definitions |
| `notification_actions` | Action types (email, SMS, in-app, push) |

#### Other

| Table | Purpose |
|---|---|
| `system_settings` | Global system configuration |
| `app_settings` | Application-level settings |
| `activity_logs` | User activity tracking |
| `audit_logs` | Security audit events |
| `media_uploads` | Media file registry |
| `uploads` | File upload tracking |
| `player_levels` | Skill level definitions |
| `player_profiles` | Extended player info |
| `player_sport_interests` | Sport preferences per player |
| `coach_sessions` | Coach-student session records |
| `coach_reviews` | Coach ratings and reviews |
| `academy_enrollments` | Academy program enrollment |
| `academy_sessions` | Academy class sessions |
| `academy_session_attendance` | Attendance tracking |
| `academy_evaluations` | Player skill evaluations |
| `tournament_bracket_types` | Tournament bracket formats |
| `tournament_registrations` | Team/player tournament entry |
| `tournament_matches` | Match scheduling |
| `tournament_match_scores` | Match results |
| `community_event_participants` | Community event RSVPs |
| `conversations` | Messaging conversations |
| `conversation_participants` | Conversation members |
| `messages` | Chat messages |
| `friend_requests` | Social connections |
| `user_follows` | Follow relationships |
| `contact_submissions` | Contact form entries |
| `sidebar_layout` | Dynamic sidebar menu configuration |
| `contact_submissions` | Visitor contact form submissions |

### Entity Relationships (Simplified)

```
users ──┬── user_roles ──── roles ──── role_permissions ──── permissions
         │
         ├── user_wallets ──── wallet_transactions
         ├── bookings ──── booking_slots ──── resources ──── resource_types
         │                  ├── booking_participants
         │                  └── booking_invitations
         ├── orders ──── order_items ──── products ──── product_categories
         ├── organisations ──── branches ──── resources
         │                      │
         │                      └── branch_amenity_assignments ──── amenities
         └── organisation_subscriptions ──── subscription_plans ──── subscription_plan_features
```

## Migration System

CourtZon uses a **baseline + incremental** migration strategy.

### Architecture

Two parallel migration systems exist:

1. **Node.js script** (`backend/scripts/migrate.js`) — canonical, cross-platform
   - Schema files: `database/schema/*.sql` (numbered, e.g., `001_courtzon_v3.sql`, `042_add_something.sql`)
   - Tracking via `migration_history` table in the database
2. **Bash script** (`scripts/migrate.sh`) — Linux/Mac/WSL
   - Baseline: `database/baseline/001_courtzon_v3.sql`
   - Incremental migrations: `database/migrations/*.sql`
   - Tracking via `migration_history` table

Use the Node.js script (`node backend/scripts/migrate.js`) — it's the recommended option and cross-platform.

### How to Create a New Migration

1. Create a `.sql` file in `database/migrations/` (for bash) or `database/schema/` (for Node.js):

   File naming: `<number>_<description>.sql` (e.g., `043_add_coupon_usage_limit.sql`)

2. Structure the file with `-- UP` and `-- DOWN` sections:

   ```sql
   -- UP:
   ALTER TABLE coupons ADD COLUMN usage_limit INT DEFAULT NULL AFTER max_uses;
   ALTER TABLE coupons ADD COLUMN times_used INT DEFAULT 0 AFTER usage_limit;

   -- DOWN:
   ALTER TABLE coupons DROP COLUMN times_used;
   ALTER TABLE coupons DROP COLUMN usage_limit;
   ```

3. Add the migration to the `backend/scripts/migrate.js` migration list (if using the Node.js script, see `migrate.js` for the migration ordering).

4. Run the migration:

   ```bash
   node backend/scripts/migrate.js
   ```

5. Verify:

   ```bash
   node backend/scripts/migrate.js --status   # (bash script)
   ```

### Bash Script Usage

```bash
# Apply pending migrations
./scripts/migrate.sh

# Fresh apply (drop + recreate DB)
./scripts/migrate.sh --fresh

# Migration status
./scripts/migrate.sh --status

# Rollback
./scripts/migrate.sh --rollback 043_add_coupon_usage_limit.sql
```

## Seed System

### Baseline Snapshot

The canonical seed is the **baseline snapshot** at `database/seed/003_baseline_snapshot.sql`. It contains INSERT IGNORE statements for all reference and configuration data.

**What's included:**
- Countries, provinces, cities, currencies, languages
- Sports, amenities, player levels
- Roles, permissions, role_permissions
- CMS pages, blog posts, section blocks
- Subscription plans, features, rates
- Design tokens and theme data
- Admin users, app settings, system settings
- Brands, product categories
- Feature flags, notification config
- Organisation types and attributes

**What's excluded (volatile data):**
Bookings, orders, payments, sessions, audit logs, notifications, messages, tournament data, wallet transactions, cart items, withdrawals, etc.

See `database/seed/baseline-manifest.json` for the complete table list and row counts.

### Refresh Baseline

After making admin/config changes in the UI:

```bash
node backend/scripts/export-baseline-seed.mjs
# Preview:
node backend/scripts/export-baseline-seed.mjs --dry-run
```

Commit both `003_baseline_snapshot.sql` and `baseline-manifest.json`.

## RBAC / Permissions Tables

The permissions system is the single source of truth for UI access control.

### Table Structure

```
permission_modules ──── permissions ──── role_permissions ──── roles
     │                      │                                    │
module_slug            permission_key                        role_name
element_type            element_type
(element_label)
```

### Permission Key Format

Permission keys follow a flat naming convention:

```
{module}.{entity}.{action}
{module}.{entity}.{field-name}
```

Examples: `users.edit`, `users.edit.first-name`, `organisations.create`, `bookings.create.start-date`, `marketplace.products.publish`, `admin.ui-permissions.manage`, `reports.settlements.view`.

### Element Types

- `page` — Full page access
- `section` — Section/panel visibility
- `tab` — Tab visibility
- `button` — Action button visibility
- `action` — Internal action (API call)
- `field` — Form field visibility

### Role Templates

Role-to-permission assignments are defined in `backend/scripts/role-permission-templates.mjs`. The `super_admin` role automatically receives all permissions.

### Syncing Permissions

```bash
# Sync UI registry (new permission keys from code)
node backend/scripts/sync-ui-registry.js

# Apply role permission templates
node backend/scripts/sync-role-permissions.mjs

# Prune grants outside template (not for super_admin)
node backend/scripts/sync-role-permissions.mjs --prune
```

### Permission Counts (current baseline)

| Metric | Count |
|---|---|
| Permission modules | 30 |
| Total permissions | 555 |
| Role-permission assignments | 1,144 |
| Roles | 17 |

## Key Indexes & Performance Considerations

### Critical Indexes

The following indexes are crucial for performance (created by schema baseline):

- `bookings`: `(resource_id, start_time)`, `(user_id, status)`, `(organisation_id)`
- `booking_slots`: `(booking_id)`, `(resource_id, date)`
- `orders`: `(user_id, status)`, `(organisation_id)`
- `order_items`: `(order_id)`, `(product_id)`
- `products`: `(category_id)`, `(organisation_id)`, `(status)`
- `notifications`: `(user_id, read)`, `(created_at)`
- `audit_logs`: `(user_id)`, `(created_at)`, `(entity_type, entity_id)`
- `role_permissions`: `(role_id)`, `(permission_id)`, unique on `(role_id, permission_id)`
- `user_roles`: `(user_id)`, `(role_id)`, unique on `(user_id, role_id)`
- `payment_transactions`: `(booking_id)`, `(status)`, `(created_at)`
- `transactions`: `(wallet_id)`, `(type)`, `(created_at)`

### Performance Tips

- **Query optimization:** Use `EXPLAIN` on slow queries. Most queries filter by `organisation_id`, `user_id`, or `status` — ensure these are indexed.
- **Connection pooling:** The backend uses `mysql2/promise` with a connection pool configured in `backend/src/database/mysql.ts`.
- **N+1 prevention:** Backend uses eager loading and batch loading patterns. Audit logs and notifications are paginated.
- **Full-text search:** MySQL full-text indexes are used on `products.name`, `organisations.name`, and `cms_pages.title`.
- **Soft deletes:** Most entities use soft deletes via `deleted_at` columns. The baseline reset uses `DROP DATABASE`, not soft-delete cascades. See `docs/data-cascade.md` for cascade rules.
- **Read replicas:** For reporting-heavy deployments, configure read replicas and route `GET` queries to the replica (requires code changes to the DB layer).

### Migrations Performance

- Migrations run within transactions where possible (InnoDB DDL can be transactional in MySQL 8.0 for some operations).
- Large data migrations should use batch processing to avoid lock contention.
- The baseline snapshot uses `INSERT IGNORE` for idempotency.

## Database Users & Permissions

Four database users are defined in `database/scripts/setup-db-users.sql`:

| User | Privileges | Purpose |
|---|---|---|
| `courtzon_app` | Full DML + DDL on app DB | Application runtime user |
| `courtzon_migrator` | Schema change permissions | Migration script execution |
| `courtzon_backup` | SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER | Database backups |
| `courtzon_readonly` | SELECT, SHOW VIEW | Monitoring, reporting, analytics |

All users require SSL (`REQUIRE SSL`). Set strong passwords after creation:

```bash
mysql -u root -p < database/scripts/setup-db-users.sql
# Then ALTER USER for passwords
```

## MySQL Server Configuration

The Docker MySQL container starts with:

- Character set: `utf8mb4`
- Collation: `utf8mb4_unicode_ci`
- Authentication plugin: `mysql_native_password` (for compatibility)
- Exposed port: `3307` (default host port, configurable)

A custom my.cnf is at `database/my.cnf` for additional tuning.
