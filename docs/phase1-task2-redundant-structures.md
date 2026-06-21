# PHASE 1 — TASK 2: Redundant Structures

**Date:** 2026-06-05
**Source:** `database/courtzon_v2_05062026.sql` (157 tables)

---

## 1. Availability Systems (8 tables, massive overlap)

### Current Tables

| # | Table | Scope | Purpose | Lines of code referencing |
|---|-------|-------|---------|--------------------------|
| 1 | `operating_hours` | org/branch/resource | Weekly open/close times (polymorphic) | Active |
| 2 | `holidays` | org/branch/resource | Date-based holiday overrides (polymorphic) | Active |
| 3 | `resource_unavailability` | resource | Date/time-range blocks | No backend refs |
| 4 | `resource_maintenance` | resource | Maintenance periods (same concept) | Single repo |
| 5 | `branch_unavailability` | branch | Date/time-range blocks (identical to #3) | No backend refs |
| 6 | `resource_peak_hours` | resource | Peak pricing time windows | No backend refs |
| 7 | `coach_availability` | coach | Weekly recurring availability | No backend refs |
| 8 | `coach_availability_blackouts` | coach | Date-specific blackouts | No backend refs |

### Problem
Five different availability patterns (polymorphic operating_hours/holidays, resource_unavailability, branch_unavailability, resource_maintenance, coach_availability/blackouts) all model the same concept: **"entity X is available/unavailable during time range Y"** with slightly different column layouts.

### Recommendation
**Consolidate into a single unified availability system:**

```sql
CREATE TABLE `availability_slots` (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_type ENUM('branch','resource','coach') NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  slot_type ENUM('regular','holiday','blackout','maintenance','peak') NOT NULL,
  day_of_week TINYINT UNSIGNED NULL COMMENT 'NULL for date-specific',
  start_date DATE NULL,
  end_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  name VARCHAR(200) NULL COMMENT 'e.g. Ramadan, Annual maintenance',
  price_multiplier DECIMAL(5,2) NULL COMMENT 'For peak pricing',
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Merge path:**
- `operating_hours` → `availability_slots` (slot_type='regular')
- `holidays` → `availability_slots` (slot_type='holiday')
- `resource_unavailability` → `availability_slots` (slot_type='blackout', is_available=0)
- `resource_maintenance` → `availability_slots` (slot_type='maintenance', is_available=0)
- `branch_unavailability` → `availability_slots` (slot_type='blackout', is_available=0)
- `resource_peak_hours` → `availability_slots` (slot_type='peak', price_multiplier)
- `coach_availability` → `availability_slots` (slot_type='regular', subject_type='coach')
- `coach_availability_blackouts` → `availability_slots` (slot_type='blackout', subject_type='coach')

**Eliminates:** 7 tables → 1 table (save 7 tables)

---

## 2. Settings Systems (3 key-value stores)

| # | Table | Purpose | Rows |
|---|-------|---------|------|
| 1 | `system_settings` | Key-value, JSON values | 26 rows |
| 2 | `app_settings` | Key-value, JSON values (newer) | 479 rows |
| 3 | `feature_flags` | Structured settings with metadata | 1558 rows |

### Problem
`system_settings` and `app_settings` serve identical purpose. Both store key-value JSON pairs with timestamps. `feature_flags` is a specialized settings table that could be merged.

### Recommendation
- Migrate `system_settings` data into `app_settings`
- Drop `system_settings`
- Keep `feature_flags` separate (different UI/behaviour)

**Saves:** 1 table

---

## 3. Financial Systems (3 overlapping tables)

| # | Table | Rows | Status |
|---|-------|------|--------|
| 1 | `financial_journal_entries` | Active | Used by payment module |
| 2 | `transaction_entries` | 2 rows | Dead (replaced by #1) |
| 3 | `transactions` | 1 row | Dead (replaced by #1) |

### Recommendation
- Drop `transaction_entries` and `transactions` after verifying they have no foreign key dependencies
- `financial_journal_entries` is the single source of truth

**Saves:** 2 tables

---

## 4. Uploads/Media (4 tables)

| # | Table | Purpose | Status |
|---|-------|---------|--------|
| 1 | `uploads` | Generic entity uploads | Active (upload module) |
| 2 | `media_uploads` | Legacy media (polymorphic) | No backend refs |
| 3 | `cms_media` | CMS media library | Created in migration 022, no backend refs |
| 4 | `product_images` | Product images | Cascade only |

### Problem
Four upload systems evolved independently. `uploads` is the most complete with entity_type/entity_id/file_category, processing_status, dimensions.

### Recommendation
- Migrate `cms_media` and `media_uploads` into `uploads` using `entity_type` and `file_category` to differentiate
- Drop `product_images` — use `uploads` with `entity_type='product'` and `file_category='image'`

**Saves:** 3 tables

---

## 5. Tournament Duplicate

| # | Table | Rows | Status |
|---|-------|------|--------|
| 1 | `tournaments` | — | Active (full-featured) |
| 2 | `community_tournaments` | — | No backend refs |

### Recommendation
`community_tournaments` is a subset of `tournaments` with fewer columns. Drop `community_tournaments` — the `tournaments` table already has `tournament_type ENUM('platform','community')` to differentiate.

**Saves:** 1 table

---

## 6. Peak-Hour Pricing Duplicate

| # | Table | Rows | Status |
|---|-------|------|--------|
| 1 | `peak_hour_pricing` | — | Old (migration 001) |
| 2 | `resource_peak_hours` | — | New (migration 032) |

### Recommendation
`peak_hour_pricing` was replaced by `resource_peak_hours` in migration 032. Drop `peak_hour_pricing`.

**Saves:** 1 table

---

## 7. EAV Anti-Pattern (4 identical structures)

| # | Table | Purpose |
|---|-------|---------|
| 1 | `organisation_attribute_values` | Org dynamic attributes |
| 2 | `organisation_type_attributes` | Org attribute definitions |
| 3 | `resource_attribute_values` | Resource dynamic attributes |
| 4 | `resource_type_attributes` | Resource attribute definitions |

### Problem
Classic EAV anti-pattern. These are structurally identical — each has `{entity}_id`, `attribute_id`/`attribute_key`, `value`. Querying becomes complex, joins explode, and type safety is lost.

### Recommendation
- Replace with `JSON` columns on `organisations` and `resources`:
  - `organisations.custom_attributes JSON`
  - `resources.custom_attributes JSON`
- Migrate existing data into the JSON columns
- Drop all 4 EAV tables

**Saves:** 4 tables

---

## 8. Banks (2 redundant structures)

| # | Table | Rows | Status |
|---|-------|------|--------|
| 1 | `banks` | 11 | Active |
| 2 | `bank_branches` | 1 | Active |
| 3 | `bank_accounts` | — | Dead |

### Recommendation
`bank_accounts` is purely dead (no backend refs, replaced by `branch_financial_details` which embeds bank info directly). Drop `bank_accounts`.

**Saves:** 1 table

---

## 9. Notification System (5 tables, well-separated)

| # | Table | Status |
|---|-------|--------|
| 1 | `notifications` | Active |
| 2 | `notification_queue` | Active |
| 3 | `notification_categories` | Active |
| 4 | `notification_actions` | Active |
| 5 | `user_notification_preferences` | No backend refs |

### Recommendation
Notification system is well-designed. `user_notification_preferences` has no backend refs but is a planned feature (user per-category toggle). Keep all 5 — no redundancy.

**Action:** None needed.

---

## 10. Seller vs Organisation Profile Overlap

`organisations` has `name`, `logo_url`, `cover_url`, `description`, `email`, `phone`, `website`, `rating_avg`, `rating_count`, `is_verified`, `is_active`.
`seller_profiles` has `shop_name`, `shop_description`, `shop_logo_url`, `rating_avg`, `rating_count`, `is_subscribed`, `max_free_listings`, `total_listings`.

### Problem
~50% column overlap (shop name ↔ org name, shop logo ↔ org logo, rating fields). Seller profiles duplicate org information.

### Recommendation
- Merge `seller_profiles` fields into `organisations` table (the org *is* the seller shop)
- Move subscription/max_listings fields to a `seller_settings` or keep in org with prefix
- Add migration to backfill org columns from seller_profiles

**Saves:** 1 table

---

## Summary

| Area | Current Tables | Recommended Tables | Tables Saved |
|------|---------------|-------------------|--------------|
| Availability | 8 | 1 | 7 |
| Settings | 3 | 2 | 1 |
| Financial | 3 | 1 | 2 |
| Uploads/Media | 4 | 1 | 3 |
| Tournaments | 2 | 1 | 1 |
| Peak Pricing | 2 | 1 | 1 |
| EAV | 4 | 0 | 4 |
| Banks | 3 | 2 | 1 |
| Seller/Org | 2 | 1 | 1 |
| **Total** | **31** | **10** | **21** |

**Net reduction:** 21 tables removed (13.4% of current 157 tables)

### Priority Order for Merging

| Priority | Area | Complexity | Risk | Effort |
|----------|------|-----------|------|--------|
| P1 | Drop dead tables (peak_hour_pricing, community_tournaments, transaction_entries, transactions, bank_accounts) | Low | Low | 1 day |
| P2 | Merge settings (system_settings → app_settings) | Low | Low | 0.5 day |
| P3 | Merge uploads (media_uploads, cms_media, product_images → uploads) | Medium | Medium | 2 days |
| P4 | EAV → JSON migration | Medium | Medium | 3 days |
| P5 | Seller/Org merge | Medium | Medium | 2 days |
| P6 | Unified availability system | High | High | 5 days |
