# PHASE 1 — TASK 1: Unused Tables

**Date:** 2026-06-05
**Source:** Database dump `courtzon_v2_05062026.sql` (157 tables)

---

## Tables with NO backend code references (42)

| # | Table | Safe to Archive? | Safe to Delete? | Notes |
|---|-------|-----------------|-----------------|-------|
| 1 | `ad_pricing` | Yes | No | Part of ads module (foundation only, no active consumers) |
| 2 | `ad_targeting_rules` | Yes | No | Part of ads module |
| 3 | `announcement_comments` | Yes | Yes | Dead feature — no frontend or backend references |
| 4 | `announcement_likes` | Yes | Yes | Dead feature |
| 5 | `announcements` | Yes | Yes | Dead feature |
| 6 | `bank_accounts` | Yes | No | Replaced by `bank_branches` in migration 034 |
| 7 | `commission_rules` | Yes | No | Referenced only in `commission-entities.ts` helper |
| 8 | `community_tournaments` | Yes | Yes | Dead — never migrated to tournaments module |
| 9 | `cron_jobs` | Yes | Yes | Dead — replaced by BullMQ workers |
| 10 | `design_theme_reset_baseline` | Yes | No | Part of appearance studio theme engine |
| 11 | `design_token_versions` | Yes | Yes | Version history table, no consumer in code |
| 12 | `email_verification_tokens` | Yes | No | Legacy — unused in auth flow |
| 13 | `exchange_rates` | Yes | Yes | No consumer in code |
| 14 | `inventory_logs` | Yes | Yes | Marketplace inventory feature, never wired |
| 15 | `login_attempts` | Yes | No | Replaced by brute-force module (Redis-based) |
| 16 | `media_uploads` | Yes | No | CMS media module needs wiring |
| 17 | `organisation_subscriptions` | Yes | No | Plans migration in progress |
| 18 | `organisation_upgrade_requests` | Yes | Yes | Dead feature — never wired |
| 19 | `payment_methods` | Yes | No | Static reference data, no active API |
| 20 | `peak_hour_pricing` | Yes | Yes | Replaced by `resource_peak_hours` in migration 032 |
| 21 | `platform_accounts` | Yes | Yes | Dead — replaced by `payment_gateway_config` |
| 22 | `player_ratings` | Yes | Yes | No consumer in code |
| 23 | `product_images` | Yes | No | Used by cascade delete, not by app logic |
| 24 | `product_specifications` | Yes | Yes | Marketplace, never wired |
| 25 | `product_tags` | Yes | Yes | Marketplace, never wired |
| 26 | `resource_peak_hours` | Yes | No | Migrated from `peak_hour_pricing` |
| 27 | `resource_unavailability` | Yes | No | Maps to maintenance scheduling |
| 28 | `revert_logs` | Yes | Yes | Dead — migration audit only |
| 29 | `role_theme_overrides` | Yes | No | Theme engine per-role overrides |
| 30 | `scheduled_jobs` | Yes | Yes | Replaced by BullMQ workers |
| 31 | `seller_profiles` | No | No | Cascade dependency only (`shared/cascade/user.cascade.ts`) |
| 32 | `sport_positions` | No | No | Cascade dependency only (`shared/cascade/sport.cascade.ts`) |
| 33 | `tags` | Yes | Yes | Marketplace, never wired |
| 34 | `transaction_entries` | Yes | Yes | Dead — replaced by `financial_journal_entries` |
| 35 | `user_addresses` | Yes | No | Marketplace feature, partially wired |
| 36 | `user_devices` | No | No | Session/device fingerprinting (auth + security modules) |
| 37 | `user_follows` | No | No | Community module |
| 38 | `user_friends` | Yes | Yes | Dead social feature |
| 39 | `user_notification_preferences` | Yes | No | Needs notification module wiring |
| 40 | `user_role_scopes` | No | No | Multi-tenant RBAC scoping |
| 41 | `user_roles` | No | No | Core RBAC |
| 42 | `wishlist_items` | Yes | No | Marketplace feature, partially wired |

---

## Summary

| Category | Count | Tables |
|----------|-------|--------|
| **Safe to delete** | 17 | `announcement_comments`, `announcement_likes`, `announcements`, `community_tournaments`, `cron_jobs`, `design_token_versions`, `exchange_rates`, `inventory_logs`, `organisation_upgrade_requests`, `peak_hour_pricing`, `platform_accounts`, `player_ratings`, `product_specifications`, `product_tags`, `revert_logs`, `scheduled_jobs`, `tags`, `transaction_entries`, `user_friends` |
| **Safe to archive** | 24 | `ad_pricing`, `ad_targeting_rules`, `bank_accounts`, `commission_rules`, `design_theme_reset_baseline`, `email_verification_tokens`, `login_attempts`, `media_uploads`, `organisation_subscriptions`, `payment_methods`, `product_images`, `resource_peak_hours`, `resource_unavailability`, `role_theme_overrides`, `seller_profiles`, `sport_positions`, `user_addresses`, `user_notification_preferences`, `wishlist_items` |
| **Active (false positives – cascade/indirect refs)** | 6 | `seller_profiles`, `sport_positions`, `user_devices`, `user_follows`, `user_role_scopes`, `user_roles` |

---

## Migration Gap

The `_schema_dump.sql` at project root is **stale** — it has 122 tables vs. the actual running DB at `database/courtzon_v2_05062026.sql` which has 157. The root dump was taken before migrations 020+ were applied and should be replaced.
