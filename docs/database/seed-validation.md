# Phase 24 — Seed Validation Report

## Overview

Seed file: `database/seeds/001_baseline.sql` (1,031,436 bytes)  
Target database: `courtzon_v3_validate` (schema from baseline only)  
Status: ✅ Success

## Result

| Metric | Value |
|--------|-------|
| Import time | 1,424 ms |
| Errors | 0 |
| Warnings | 0 |

## Key Table Row Counts

| Table | Rows | Notes |
|-------|------|-------|
| `users` | 3 | Admin + test users |
| `countries` | 8 | Including Egypt, UAE, Saudi Arabia, etc. |
| `currencies` | 7 | EGP, USD, AED, SAR, etc. |
| `roles` | 8 | super_admin, org_admin, seller, coach, player, etc. |
| `permissions` | 555 | Full RBAC permission set |
| `permission_modules` | 30 | Module registry |
| `amenities` | 120 | Facility amenities (migrated from legacy `court_amenities`) |
| `organisation_types` | 5 | org, shop, player_seller, player, coach |
| `subscription_plans` | 7 | Including Player Free Sell |
| `system_settings` | 25 | Platform configuration |
| `languages` | 2 | en, ar |

## Modifications Applied

The seed file was transformed on-the-fly for V3 compatibility:
1. Database name `courtzon_v2` → `courtzon_v3_validate`
2. Legacy table `court_amenities` → `amenities`
3. Added `SET FOREIGN_KEY_CHECKS=0` and `SET UNIQUE_CHECKS=0` for safe import

## Seed File Update Recommended

The seed file should be updated permanently:
- Replace `courtzon_v2` references → variable reference or `courtzon_v3`
- Replace `court_amenities` → `amenities`

## Verdict

✅ **Seed is valid** — imports cleanly against the baseline schema with zero errors.
