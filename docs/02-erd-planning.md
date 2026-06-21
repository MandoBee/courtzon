# ERD PLANNING — ENTITY RELATIONSHIPS & DATA MODEL

## Conventions
- All tables use `bigint(20) UNSIGNED AUTO_INCREMENT` as primary key
- Public-facing IDs use `char(36)` UUIDs (stored as `public_id`)
- Soft deletes via `deleted_at` timestamp where applicable
- Optimistic locking via `version` integer on high-contention tables
- JSON columns for flexible attribute storage (validated via CHECK constraint)
- All timestamps: `created_at` DEFAULT current_timestamp(), `updated_at` ON UPDATE current_timestamp()

## Core Entity Relationship Diagram (Textual)

```
users (1) ──< user_roles >── roles (1)
  │                                │
  ├──< user_sessions               │
  ├──< user_wallets (1:1)          │
  ├──< devices                     │
  ├──< email_verification_tokens   │
  ├──< password_reset_tokens       │
  ├──< notification_preferences    │
  │                                │
  └──┐                             │
      │                    role_permissions ──< permissions
      │                             │
      │                    organizations (fka clubs)
      │                        │
      │                        ├──< branches
      │                        ├──< operating_hours
      │                        ├──< staff (user_id, role)
      │                        ├──< reviews
      │                        ├──< cancellation_policies
      │                        ├──< subscription_plans
      │                        └──< commission_rules
      │
      ├──< booking_participants
      ├──< booking_invitations
      ├──< tournament_registrations
      ├──< coach_sessions
      ├──< academy_enrollments
      ├──< community_events
      ├──< conversations/messages
      └──< user_followers (self-referential)
```

## Key Table Clusters

### Booking Cluster
```
bookings
  ├── booking_slots (1:N) — UNIQUE(court_id, date, slot_start) for concurrency
  ├── booking_participants (1:N) — UNIQUE(booking_id, user_id)
  ├── booking_invitations (1:N)
  ├── booking_cancellations (1:1)
  └── qr_codes (1:1)
```

### Financial Cluster
```
user_wallets (1:1 per user)
  └── wallet_transactions (1:N) — trigger auto-updates balance

payment_transactions — links to booking, references gateway

commission_rules → commission_transactions → bookings/orders

settlements
  └── settlement_items → bookings/registrations

organizations
  └── subscription_invoices → subscriptions → subscription_plans
```

### Tournament Cluster
```
tournaments
  ├── tournament_registrations (1:N) — UNIQUE(tournament_id, user_id)
  └── tournament_matches (1:N) — player_one_id, player_two_id, winner_user_id
```

### Marketplace Cluster
```
seller_profiles
  └── products → product_categories
        └── cart_items → orders → order_items → status_history
              └── product_reviews
```

### Advertising Cluster
```
ad_placements
  └── ad_campaigns → ad_creatives
        └── ad_targeting
              ├── ad_impressions (1:N)
              └── ad_clicks (1:N)
```

## Index Strategy
- All foreign keys indexed
- Composite indexes for frequent queries:
  - `bookings`: idx_bookings_date, idx_bookings_status
  - `booking_slots`: idx_court_date, uq_court_slot
  - `activity_logs`: idx_activity_entity (entity_type, entity_id)
  - `audit_logs`: idx_audit_entity (entity_type, entity_id)
  - `media_uploads`: idx_media_relation (related_model_type, related_model_id)
  - `sync_events`: idx_sync_events_processed, idx_sync_events_entity
  - `users`: idx_users_email, idx_users_phone, idx_users_status

## Concurrency Protection
- **Booking Slots**: UNIQUE(court_id, booking_date, slot_start) catches duplicate slot assignment at DB level
- **Redis Locks**: Acquired per slot before transaction, released in finally block
- **Wallets**: `version` column for optimistic locking; trigger-based balance updates

## Multi-Tenancy Strategy
- **Isolation Level**: Database-per-tenant (true multi-tenancy)
- **Current State**: Row-level RBAC scoping via `organization_id` foreign keys
- **Migration Path**: Separate databases with tenant routing middleware
