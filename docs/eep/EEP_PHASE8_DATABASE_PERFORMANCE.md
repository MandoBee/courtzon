# EEP Phase 8: Database Performance & Index Review

## Current Indexes (from Baseline)

The baseline schema `001_courtzon_v3.sql` defines indexes on all primary/foreign keys and common query columns. Core tables like `bookings`, `payment_transactions`, `user_wallets`, and `notifications` have properly defined indexes.

## Analysis by Hot Path

### Booking Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| bookings | PK, idx_user, idx_resource, idx_date, uk_slot | Good — covers user lookups, resource availability, date range |
| booking_slots | PK, idx_resource_date | Good — but missing composite for (resource_id, date, slot_start) lookup |
| booking_invitations | PK, idx_booking, idx_user | Good |

**Recommendation:** Add composite index on `booking_slots(resource_id, booking_date, slot_start)` for slot availability checks — already partially covered by `uk_slot`.

### Payment Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| payment_transactions | PK, idx_user, idx_gateway_ref, idx_status, idx_reference | **Excellent** — all query patterns covered |

### Wallet Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| user_wallets | PK, FK_user | Adequate — primarily PK lookups with FOR UPDATE |
| wallet_transactions | PK, idx_user, idx_wallet | Good |

### Notification Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| notifications | PK, idx_user, idx_read, idx_created | Good |
| notification_delivery | PK, idx_notification | Adequate |

### Marketplace Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| products | PK, idx_seller, idx_category, idx_status | Good |
| orders | PK, idx_user, idx_seller, idx_status | Good |
| order_items | PK, idx_order | Adequate |

### Tournament Queries
| Table | Current Indexes | Coverage |
|-------|----------------|----------|
| tournaments | PK, idx_creator, idx_org, idx_sport, idx_status, idx_format, idx_is_public | **Good** — all 13 tournament tables have proper indexes |
| tournament_matches | PK, idx_tournament, idx_player1, idx_player2, idx_group, idx_referee, idx_bracket | **Excellent** |

## Unused / Duplicate Indexes

No unused or duplicate indexes detected in the baseline or migrations.

## Missing Indexes

| Table | Column Pattern | Query Type | Impact | Priority |
|-------|---------------|------------|--------|----------|
| booking_slots | (resource_id, date, start_time) | Slot availability check | **High** — most frequent query | P0 |
| notifications | (user_id, created_at DESC) | User notification list | Medium | P1 |
| products | (seller_id, status, created_at) | Seller product listing | Medium | P1 |

## Join Performance (from query analysis)

The most complex queries are:
1. `getAllBookings` — joins across bookings, users, resources, branches, orgs (5+ tables)
2. `getSellerOrders` — joins orders, order_items, products, users (4+ tables)
3. `reconciliationService` — joins payment_transactions, wallets, orders (3+ tables)

All join columns are indexed (FK columns). No table scans expected for normal query patterns.

## Lock Contention

**Wallet balance updates** — `SELECT ... FOR UPDATE` followed by `UPDATE ... WHERE version = ?` in `wallet.repository.ts`. This is the highest contention point. The optimistic version locking (`WHERE version = ?`) ensures minimal lock duration.

**Booking slot booking** — Redis distributed locks prevent DB-level contention. The UNIQUE constraint is a backstop, not a primary lock.

## Estimated Performance Gains

| Index | Estimated Gain | Risk |
|-------|---------------|------|
| booking_slots composite index | 50-80% faster slot lookups | Low |
| notifications user+date index | 30-50% faster notification list | Low |
| products seller+status+date | 20-40% faster seller dashboard | Low |

**Phase 8 Complete.** 3 recommended index additions. No blocking issues. Ready for Phase 9.
