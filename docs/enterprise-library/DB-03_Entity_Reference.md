# CourtZon Database — Complete Entity Reference

> Generated from `database/baseline/001_courtzon_v3.sql` and `database/migrations/*.sql`

---

## COMPLETE DATABASE INVENTORY

### Part 1: Global Overview

| Metric | Value |
|---|---|
| Database Name | `courtzon_v3` (implied; no explicit USE statement in dump) |
| Total CREATE TABLE statements | 163 (baseline) + ~157 (migrations, many overlapping) |
| Total CREATE VIEW statements | 0 |
| Total CREATE TRIGGER statements | 4 |
| Total CREATE EVENT statements | 2 |
| Total CREATE PROCEDURE statements | 0 |
| Total CREATE FUNCTION statements | 0 |
| Total ALTER TABLE statements | 0 (all schema changes in migrations) |
| Total INSERT statements (seed data) | 0 in baseline (seed is in `database/seeds/001_baseline.sql`) |

#### Storage Engines

| Engine | Count |
|---|---|
| InnoDB | 163 |

#### Character Sets

| Charset | Count |
|---|---|
| utf8mb4 | 163 |

#### Collations

| Collation | Count |
|---|---|
| utf8mb4_unicode_ci | 161 |
| utf8mb4_general_ci | 2 |

#### Objects in Baseline

| Object Type | Count | Details |
|---|---|---|
| CREATE TABLE | 163 | See Part 2 below |
| CREATE TRIGGER | 4 | `trg_order_after_insert`, `trg_order_status_change`, `trg_audit_org_update`, `trg_audit_user_update` |
| CREATE EVENT | 2 | `ev_cleanup_expired_sessions`, `ev_process_notification_queue` |
| CREATE VIEW | 0 | — |
| CREATE PROCEDURE | 0 | — |
| CREATE FUNCTION | 0 | — |
| ALTER TABLE | 0 | — |
| INSERT (seed) | 0 | Seed data in `database/seeds/001_baseline.sql` |

---
## Part 2: Every Table — Full Schema

### academies

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 6 | `description` | TEXT | NULL | NULL |  |  |
| 7 | `image_url` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 9 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_org` | BTREE | `organisation_id` | No |
| `fk_acad_branch` | BTREE | `branch_id` | No |
| `fk_acad_sport` | BTREE | `sport_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_acad_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_acad_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |
| `fk_acad_sport` | `sport_id` | `sports` | `id` | SET NULL | NO ACTION |

---

### academy_curriculums

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `academy_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `description` | TEXT | NULL | NULL |  |  |
| 5 | `level_required` | INT(10) UNSIGNED | NULL | NULL |  | Min player level |
| 6 | `duration_weeks` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `price` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 8 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 9 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_academy` | BTREE | `academy_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cur_acad` | `academy_id` | `academies` | `id` | CASCADE | NO ACTION |

---

### academy_enrollments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `academy_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `curriculum_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `status` | ENUM('ACTIVE','COMPLETED','DROPPED','WAITLISTED') | NOT NULL | 'active' |  |  |
| | ENUM: `active`, `completed`, `dropped`, `waitlisted` | | | | | |
| 6 | `enrolled_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `completed_at` | TIMESTAMP | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_player_acad` | BTREE | `academy_id`, `player_id` | Yes |
| `idx_academy` | BTREE | `academy_id` | No |
| `idx_player` | BTREE | `player_id` | No |
| `fk_enroll_cur` | BTREE | `curriculum_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_enroll_acad` | `academy_id` | `academies` | `id` | CASCADE | NO ACTION |
| `fk_enroll_cur` | `curriculum_id` | `academy_curriculums` | `id` | SET NULL | NO ACTION |
| `fk_enroll_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |

---

### academy_evaluations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `academy_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `evaluator_id` | INT(10) UNSIGNED | NOT NULL |  |  | Coach who evaluated |
| 5 | `skill_scores` | LONGTEXT | NULL |  |  | {skill_name: score} |
| 6 | `overall_score` | DECIMAL(5,2) | NULL | NULL |  |  |
| 7 | `notes` | TEXT | NULL | NULL |  |  |
| 8 | `recommended_level_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_player` | BTREE | `player_id` | No |
| `fk_eval_acad` | BTREE | `academy_id` | No |
| `fk_eval_evaluator` | BTREE | `evaluator_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_eval_acad` | `academy_id` | `academies` | `id` | CASCADE | NO ACTION |
| `fk_eval_evaluator` | `evaluator_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_eval_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |

---

### academy_session_attendance

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `session_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `status` | ENUM('PRESENT','ABSENT','EXCUSED') | NOT NULL | 'present' |  |  |
| | ENUM: `present`, `absent`, `excused` | | | | | |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_attendance` | BTREE | `session_id`, `player_id` | Yes |
| `fk_att_player` | BTREE | `player_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_att_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_att_sess` | `session_id` | `academy_sessions` | `id` | CASCADE | NO ACTION |

---

### academy_sessions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `academy_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `curriculum_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `coach_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `resource_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `title` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `description` | TEXT | NULL | NULL |  |  |
| 8 | `start_time` | DATETIME | NOT NULL |  |  |  |
| 9 | `end_time` | DATETIME | NOT NULL |  |  |  |
| 10 | `max_participants` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_academy` | BTREE | `academy_id` | No |
| `idx_coach` | BTREE | `coach_id` | No |
| `idx_dates` | BTREE | `start_time`, `end_time` | No |
| `fk_sess_cur` | BTREE | `curriculum_id` | No |
| `fk_sess_resource` | BTREE | `resource_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_sess_acad` | `academy_id` | `academies` | `id` | CASCADE | NO ACTION |
| `fk_sess_coach` | `coach_id` | `users` | `id` | SET NULL | NO ACTION |
| `fk_sess_cur` | `curriculum_id` | `academy_curriculums` | `id` | SET NULL | NO ACTION |
| `fk_sess_resource` | `resource_id` | `resources` | `id` | SET NULL | NO ACTION |

---

### activity_logs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `activity_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `description` | VARCHAR(500) | NULL | NULL |  |  |
| 5 | `metadata` | LONGTEXT | NULL | NULL |  |  |
| 6 | `ip_address` | VARCHAR(45) | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_type` | BTREE | `activity_type` | No |
| `idx_created` | BTREE | `created_at` | No |
| `idx_activities_feed` | BTREE | `user_id`, `created_at` | No |

---

### ad_campaigns

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL = platform-wide ads |
| 4 | `placement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `start_date` | DATETIME | NOT NULL |  |  |  |
| 6 | `end_date` | DATETIME | NOT NULL |  |  |  |
| 7 | `daily_budget` | DECIMAL(12,2) | NULL | NULL |  |  |
| 8 | `total_budget` | DECIMAL(12,2) | NULL | NULL |  |  |
| 9 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 10 | `status` | ENUM('DRAFT','ACTIVE','PAUSED','ENDED','CANCELLED') | NOT NULL | 'draft' |  |  |
| | ENUM: `draft`, `active`, `paused`, `ended`, `cancelled` | | | | | |
| 11 | `max_impressions` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 12 | `max_clicks` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 13 | `created_by` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 15 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_placement` | BTREE | `placement_id` | No |
| `idx_status` | BTREE | `status` | No |
| `idx_dates` | BTREE | `start_date`, `end_date` | No |
| `fk_camp_org` | BTREE | `organisation_id` | No |
| `fk_camp_creator` | BTREE | `created_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_camp_creator` | `created_by` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_camp_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_camp_placement` | `placement_id` | `ad_placements` | `id` | NO ACTION | NO ACTION |

---

### ad_clicks

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `impression_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `campaign_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `creative_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `user_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `clicked_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `cost` | DECIMAL(12,8) | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_impression` | BTREE | `impression_id` | No |
| `idx_campaign` | BTREE | `campaign_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_click_camp` | `campaign_id` | `ad_campaigns` | `id` | CASCADE | NO ACTION |
| `fk_click_imp` | `impression_id` | `ad_impressions` | `id` | CASCADE | NO ACTION |

---

### ad_creatives

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `campaign_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `image_url` | VARCHAR(500) | NOT NULL |  |  |  |
| 4 | `click_url` | VARCHAR(500) | NULL | NULL |  |  |
| 5 | `alt_text` | VARCHAR(255) | NULL | NULL |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_campaign` | BTREE | `campaign_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_creative_camp` | `campaign_id` | `ad_campaigns` | `id` | CASCADE | NO ACTION |

---

### ad_impressions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `campaign_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `creative_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `user_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `placement_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 6 | `ip_address` | VARCHAR(45) | NULL | NULL |  |  |
| 7 | `user_agent` | TEXT | NULL | NULL |  |  |
| 8 | `served_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `cost` | DECIMAL(12,8) | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_campaign` | BTREE | `campaign_id` | No |
| `idx_creative` | BTREE | `creative_id` | No |
| `idx_user` | BTREE | `user_id` | No |
| `idx_served` | BTREE | `served_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_imp_camp` | `campaign_id` | `ad_campaigns` | `id` | CASCADE | NO ACTION |

---

### ad_placements

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `placement_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `description` | VARCHAR(500) | NULL | NULL |  |  |
| 5 | `dimensions` | VARCHAR(50) | NULL | NULL |  |  |
| 6 | `max_ads` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `placement_key` | BTREE | `placement_key` | Yes |

---

### ad_pricing

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `placement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `pricing_model` | ENUM('CPM','CPC','FLAT') | NOT NULL |  |  |  |
| | ENUM: `cpm`, `cpc`, `flat` | | | | | |
| 4 | `price` | DECIMAL(12,6) | NOT NULL |  |  |  |
| 5 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `valid_from` | DATE | NULL | NULL |  |  |
| 8 | `valid_until` | DATE | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_placement` | BTREE | `placement_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_price_placement` | `placement_id` | `ad_placements` | `id` | CASCADE | NO ACTION |

---

### ad_targeting_rules

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `campaign_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `countries` | LONGTEXT | NULL | NULL |  | Array of country ISO codes |
| 4 | `sports` | LONGTEXT | NULL | NULL |  | Array of sport IDs |
| 5 | `player_levels` | LONGTEXT | NULL | NULL |  | Array of level IDs |
| 6 | `age_min` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 7 | `age_max` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 8 | `gender` | ENUM('MALE','FEMALE','ALL') | NULL | 'all' |  |  |
| | ENUM: `male`, `female`, `all` | | | | | |
| 9 | `user_types` | LONGTEXT | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `campaign_id` | BTREE | `campaign_id` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_target_camp` | `campaign_id` | `ad_campaigns` | `id` | CASCADE | NO ACTION |

---

### amenities

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name_en` | VARCHAR(200) | NOT NULL |  |  |  |
| 3 | `name_ar` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `icon` | VARCHAR(100) | NULL | NULL |  | CSS class or SVG ref |
| 5 | `category` | ENUM('FACILITIES','EQUIPMENT','ACCESSIBILITY','CONVENIENCE','SERVICES') | NOT NULL | 'facilities' |  |  |
| | ENUM: `facilities`, `equipment`, `accessibility`, `convenience`, `services` | | | | | |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_category` | BTREE | `category` | No |
| `idx_active` | BTREE | `is_active` | No |

---

### announcement_comments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `announcement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `parent_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `content` | TEXT | NOT NULL |  |  |  |
| 6 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_announcement` | BTREE | `announcement_id` | No |
| `fk_comment_user` | BTREE | `user_id` | No |
| `fk_comment_parent` | BTREE | `parent_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_comment_announce` | `announcement_id` | `announcements` | `id` | CASCADE | NO ACTION |
| `fk_comment_parent` | `parent_id` | `announcement_comments` | `id` | SET NULL | NO ACTION |
| `fk_comment_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### announcement_likes

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `announcement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_like` | BTREE | `announcement_id`, `user_id` | Yes |
| `fk_like_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_like_announce` | `announcement_id` | `announcements` | `id` | CASCADE | NO ACTION |
| `fk_like_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### announcements

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `content` | TEXT | NOT NULL |  |  |  |
| 5 | `images` | LONGTEXT | NULL | NULL |  |  |
| 6 | `is_pinned` | TINYINT(1) | NOT NULL | 0 |  |  |
| 7 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_org` | BTREE | `organisation_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_announce_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_announce_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### app_settings

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `setting_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `value` | LONGTEXT | NULL |  |  |  |
| 4 | `updated_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `setting_key` | BTREE | `setting_key` | Yes |
| `fk_app_settings_user` | BTREE | `updated_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_app_settings_user` | `updated_by` | `users` | `id` | SET NULL | NO ACTION |

---

### audit_logs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `actor_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL for system actions |
| 3 | `action` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `entity_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `entity_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `before_state` | LONGTEXT | NULL | NULL |  |  |
| 7 | `after_state` | LONGTEXT | NULL | NULL |  |  |
| 8 | `reason` | VARCHAR(500) | NULL | NULL |  | Required for destructive actions |
| 9 | `ip_address` | VARCHAR(45) | NULL | NULL |  |  |
| 10 | `user_agent` | TEXT | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_actor` | BTREE | `actor_id` | No |
| `idx_entity` | BTREE | `entity_type`, `entity_id` | No |
| `idx_action` | BTREE | `action` | No |
| `idx_created` | BTREE | `created_at` | No |
| `idx_audit_entity` | BTREE | `entity_type`, `entity_id`, `created_at` | No |
| `idx_audit_logs_entity_action_created` | BTREE | `entity_type`, `action`, `created_at` | No |

---

### bank_branches

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `bank_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `address` | VARCHAR(500) | NULL | NULL |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_bb_bank` | BTREE | `bank_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_bb_bank` | `bank_id` | `banks` | `id` | CASCADE | NO ACTION |

---

### banks

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `country_id` | SMALLINT(5) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `swift` | VARCHAR(20) | NULL | NULL |  |  |
| 5 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_banks_country` | BTREE | `country_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_banks_country` | `country_id` | `countries` | `id` | NO ACTION | NO ACTION |

---

### booking_cancellations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `booking_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `cancelled_by` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `reason` | VARCHAR(500) | NOT NULL |  |  |  |
| 5 | `refund_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 6 | `refund_status` | ENUM('PENDING','PROCESSED','SKIPPED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `processed`, `skipped` | | | | | |
| 7 | `processed_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `booking_id` | BTREE | `booking_id` | Yes |
| `idx_booking` | BTREE | `booking_id` | No |

---

### booking_intents

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `organisation_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 5 | `resource_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 6 | `booking_type` | ENUM('PUBLIC_MATCH','PRIVATE_MATCH','ACADEMY','CLINIC','COACH_SESSION') | NOT NULL | 'private_match' |  |  |
| | ENUM: `public_match`, `private_match`, `academy`, `clinic`, `coach_session` | | | | | |
| 7 | `booking_date` | DATE | NOT NULL |  |  |  |
| 8 | `business_date` | DATE | NOT NULL |  |  | The Business Day this intent belongs to. Resolved by OperatingHoursEngine. |
| 9 | `start_time` | TIME | NOT NULL |  |  |  |
| 10 | `end_time` | TIME | NOT NULL |  |  |  |
| 11 | `start_at_utc` | TIMESTAMP | NOT NULL |  |  | Absolute start time in UTC. |
| 12 | `end_at_utc` | TIMESTAMP | NOT NULL |  |  | Absolute end time in UTC. |
| 13 | `total_amount` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 14 | `commission_amount` | DECIMAL(12,2) | NULL | 0.00 |  |  |
| 15 | `club_amount` | DECIMAL(12,2) | NULL | 0.00 |  |  |
| 16 | `payment_method` | VARCHAR(50) | NULL | NULL |  |  |
| 17 | `notes` | TEXT | NULL | NULL |  |  |
| 18 | `matchmaking` | LONGTEXT | NULL | NULL |  |  |
| 19 | `participants` | LONGTEXT | NULL | NULL |  |  |
| 20 | `expires_at` | TIMESTAMP | NOT NULL |  |  |  |
| 21 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_expires` | BTREE | `expires_at` | No |
| `idx_booking_intents_user` | BTREE | `user_id` | No |
| `idx_booking_intents_resource_date` | BTREE | `resource_id`, `booking_date` | No |
| `idx_booking_intents_start_at_utc` | BTREE | `start_at_utc` | No |
| `idx_booking_intents_business_date` | BTREE | `business_date` | No |

---

### booking_invitations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `booking_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `invited_user_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 4 | `email` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `status` | ENUM('PENDING','ACCEPTED','DECLINED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `accepted`, `declined` | | | | | |
| 6 | `token` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `responded_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `token` | BTREE | `token` | Yes |
| `idx_booking` | BTREE | `booking_id` | No |

---

### booking_matchmaking_requests

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `booking_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `min_age` | INT(11) | NULL | NULL |  |  |
| 4 | `max_age` | INT(11) | NULL | NULL |  |  |
| 5 | `target_gender` | ENUM('MALE','FEMALE','ANY') | NULL | 'any' |  |  |
| | ENUM: `male`, `female`, `any` | | | | | |
| 6 | `target_level_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `max_players` | INT(11) | NOT NULL | 2 |  |  |
| 8 | `deadline` | DATETIME | NULL | NULL |  |  |
| 9 | `auto_apply` | TINYINT(1) | NOT NULL | 0 |  |  |
| 10 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `booking_id` | BTREE | `booking_id` | Yes |
| `idx_booking` | BTREE | `booking_id` | No |
| `idx_active` | BTREE | `is_active` | No |
| `target_level_id` | BTREE | `target_level_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `booking_matchmaking_requests_ibfk_1` | `booking_id` | `bookings` | `id` | CASCADE | NO ACTION |
| `booking_matchmaking_requests_ibfk_2` | `target_level_id` | `player_levels` | `id` | SET NULL | NO ACTION |

---

### booking_participants

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `booking_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 4 | `full_name` | VARCHAR(150) | NULL | NULL |  |  |
| 5 | `email` | VARCHAR(255) | NULL | NULL |  |  |
| 6 | `phone` | VARCHAR(25) | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_booking` | BTREE | `booking_id` | No |

---

### booking_slots

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `booking_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `resource_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `booking_date` | DATE | NOT NULL |  |  |  |
| 5 | `slot_start` | TIME | NOT NULL |  |  |  |
| 6 | `slot_end` | TIME | NOT NULL |  |  |  |
| 7 | `is_available` | TINYINT(1) | NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_slot` | BTREE | `resource_id`, `booking_date`, `slot_start` | Yes |
| `idx_booking` | BTREE | `booking_id` | No |

---

### bookings

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NULL | NULL |  |  |
| 3 | `user_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `organisation_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 5 | `resource_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 6 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  | Denormalized from resource for branch-level accounting |
| 7 | `booking_type` | ENUM('PUBLIC_MATCH','PRIVATE_MATCH','ACADEMY','CLINIC','COACH_SESSION') | NOT NULL |  |  |  |
| | ENUM: `public_match`, `private_match`, `academy`, `clinic`, `coach_session` | | | | | |
| 8 | `visibility` | ENUM('PUBLIC','PRIVATE') | NULL | 'public' |  |  |
| | ENUM: `public`, `private` | | | | | |
| 9 | `start_at_utc` | TIMESTAMP | NOT NULL |  |  | Absolute start time in UTC. Source of truth for all time operations. |
| 10 | `end_at_utc` | TIMESTAMP | NOT NULL |  |  | Absolute end time in UTC. Source of truth for all time operations. |
| 11 | `booking_date` | DATE | NOT NULL |  |  |  |
| 12 | `business_date` | DATE | NOT NULL |  |  | The Business Day this booking belongs to. Resolved by OperatingHoursEngine. |
| 13 | `start_time` | TIME | NOT NULL |  |  |  |
| 14 | `end_time` | TIME | NOT NULL |  |  |  |
| 15 | `total_amount` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 16 | `commission_rate` | DECIMAL(5,2) | NULL | 0.00 |  |  |
| 17 | `commission_amount` | DECIMAL(12,2) | NULL | 0.00 |  |  |
| 18 | `net_amount` | DECIMAL(12,2) | NULL | 0.00 |  |  |
| 19 | `plan_name` | VARCHAR(100) | NULL | NULL |  |  |
| 20 | `club_amount` | DECIMAL(12,2) | NULL | 0.00 |  |  |
| 21 | `payment_status` | ENUM('PENDING','PAID','REFUNDED','PARTIALLY_REFUNDED','FAILED','PENALTY') | NULL | 'pending' |  |  |
| | ENUM: `pending`, `paid`, `refunded`, `partially_refunded`, `failed`, `penalty` | | | | | |
| 22 | `payment_method` | VARCHAR(50) | NULL | NULL |  |  |
| 23 | `booking_status` | ENUM('PENDING','PENDING_PAYMENT','CONFIRMED','CANCELLED','COMPLETED','EXPIRED','CHECKED_IN','NO_SHOW') | NULL | 'pending' |  |  |
| | ENUM: `pending`, `pending_payment`, `confirmed`, `cancelled`, `completed`, `expired`, `checked_in`, `no_show` | | | | | |
| 24 | `cancellation_policy_snapshot` | LONGTEXT | NULL | NULL |  |  |
| 25 | `notes` | TEXT | NULL | NULL |  |  |
| 26 | `expires_at` | DATETIME | NULL | NULL |  |  |
| 27 | `version` | INT(11) | NULL | 1 |  |  |
| 28 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 29 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_date` | BTREE | `booking_date` | No |
| `idx_status` | BTREE | `booking_status`, `payment_status` | No |
| `idx_organisation` | BTREE | `organisation_id` | No |
| `idx_resource` | BTREE | `resource_id` | No |
| `idx_branch` | BTREE | `branch_id` | No |
| `idx_bookings_org_resource` | BTREE | `organisation_id`, `resource_id`, `booking_date`, `booking_status` | No |
| `idx_bookings_start_at_utc` | BTREE | `start_at_utc` | No |
| `idx_bookings_business_date` | BTREE | `business_date` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_booking_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |

---

### branch_amenity_assignments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `branch_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `amenity_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `value` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_branch_amenity` | BTREE | `branch_id`, `amenity_id` | Yes |
| `idx_amenity` | BTREE | `amenity_id` | No |
| `idx_branch` | BTREE | `branch_id` | No |

---

### branch_financial_details

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `branch_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `bank_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `bank_branch_id` | INT(10) UNSIGNED | NULL | NULL |  | Bank institution branch (bank_branches.id) |
| 5 | `bank_name` | VARCHAR(200) | NULL | NULL |  |  |
| 6 | `bank_account_name` | VARCHAR(200) | NULL | NULL |  |  |
| 7 | `bank_account_number` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `iban` | VARCHAR(50) | NULL | NULL |  |  |
| 9 | `swift` | VARCHAR(20) | NULL | NULL |  |  |
| 10 | `billing_address` | TEXT | NULL | NULL |  |  |
| 11 | `billing_email` | VARCHAR(255) | NULL | NULL |  |  |
| 12 | `payout_schedule` | ENUM('DAILY','WEEKLY','BIWEEKLY','MONTHLY') | NULL | 'monthly' |  |  |
| | ENUM: `daily`, `weekly`, `biweekly`, `monthly` | | | | | |
| 13 | `currency_id` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 15 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_bfd_branch` | BTREE | `branch_id` | Yes |
| `idx_bfd_bank` | BTREE | `bank_id` | No |
| `idx_bfd_bank_branch` | BTREE | `bank_branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_bfd_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |

---

### branch_player_access

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `branch_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `status` | ENUM('PENDING','APPROVED','REJECTED','BANNED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `approved`, `rejected`, `banned` | | | | | |
| 5 | `reviewed_by` | INT(10) UNSIGNED | NULL | NULL |  | Manager who reviewed |
| 6 | `review_note` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `reviewed_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_player_branch` | BTREE | `player_id`, `branch_id` | Yes |
| `fk_access_branch` | BTREE | `branch_id` | No |
| `fk_access_reviewer` | BTREE | `reviewed_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_access_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |
| `fk_access_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_access_reviewer` | `reviewed_by` | `users` | `id` | SET NULL | NO ACTION |

---

### branch_unavailability

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `branch_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `start_date` | DATE | NOT NULL |  |  |  |
| 4 | `end_date` | DATE | NULL | NULL |  |  |
| 5 | `start_time` | TIME | NULL | NULL |  |  |
| 6 | `end_time` | TIME | NULL | NULL |  |  |
| 7 | `reason` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_branch_date` | BTREE | `branch_id`, `start_date`, `end_date` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_unavail_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |

---

### branches

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 5 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 6 | `description` | TEXT | NULL | NULL |  |  |
| 7 | `email` | VARCHAR(255) | NULL | NULL |  |  |
| 8 | `phone` | VARCHAR(25) | NULL | NULL |  |  |
| 9 | `address_line1` | VARCHAR(255) | NULL | NULL |  |  |
| 10 | `address_line2` | VARCHAR(255) | NULL | NULL |  |  |
| 11 | `city` | VARCHAR(100) | NULL | NULL |  |  |
| 12 | `state` | VARCHAR(100) | NULL | NULL |  |  |
| 13 | `country_id` | SMALLINT(5) UNSIGNED | NULL | NULL |  |  |
| 14 | `postal_code` | VARCHAR(20) | NULL | NULL |  |  |
| 15 | `latitude` | DECIMAL(10,7) | NULL | NULL |  |  |
| 16 | `longitude` | DECIMAL(10,7) | NULL | NULL |  |  |
| 17 | `access_type` | ENUM('OPEN','RESTRICTED','INVITE_ONLY') | NOT NULL | 'open' |  |  |
| | ENUM: `open`, `restricted`, `invite_only` | | | | | |
| 18 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 19 | `rating_avg` | DECIMAL(3,2) | NOT NULL | 0.00 |  |  |
| 20 | `rating_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 21 | `images` | LONGTEXT | NULL | NULL |  | Gallery photos array |
| 22 | `currency_id` | TINYINT(3) UNSIGNED | NULL | NULL |  | Override org currency |
| 23 | `timezone` | VARCHAR(50) | NULL | NULL |  | Override org timezone |
| 24 | `opening_time` | TIME | NULL | '08:00:00' |  | Daily operating hours start |
| 25 | `closing_time` | TIME | NULL | '22:00:00' |  | Daily operating hours end |
| 26 | `version` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 27 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 28 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 29 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `idx_org` | BTREE | `organisation_id` | No |
| `idx_active` | BTREE | `is_active` | No |
| `idx_location` | BTREE | `latitude`, `longitude` | No |
| `fk_branch_currency` | BTREE | `currency_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_branch_currency` | `currency_id` | `currencies` | `id` | SET NULL | NO ACTION |
| `fk_branch_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### brands

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 3 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `description` | TEXT | NULL | NULL |  |  |
| 5 | `logo_url` | VARCHAR(500) | NULL | NULL |  |  |
| 6 | `website` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `country` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 9 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### cancellation_policies

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `organisation_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 4 | `cancellation_window_minutes` | INT(11) | NOT NULL |  |  |  |
| 5 | `refund_percent` | DECIMAL(5,2) | NOT NULL |  |  |  |
| 6 | `is_active` | TINYINT(1) | NULL | 1 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_organisation` | BTREE | `organisation_id` | No |
| `idx_branch` | BTREE | `branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cp_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |

---

### cart_items

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `variant_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `quantity` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 6 | `reserved_until` | TIMESTAMP | NULL | NULL |  | Inventory hold expiry |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_user_product_cart` | BTREE | `user_id`, `product_id`, `variant_id` | Yes |
| `idx_reserved` | BTREE | `reserved_until` | No |
| `fk_cart_product` | BTREE | `product_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cart_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_cart_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### cities

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `province_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(120) | NOT NULL |  |  |  |
| 4 | `slug` | VARCHAR(120) | NULL | NULL |  |  |
| 5 | `native_name` | VARCHAR(120) | NULL | NULL |  |  |
| 6 | `type` | ENUM('CITY','DISTRICT','TOWN','VILLAGE','NEIGHBORHOOD') | NULL | NULL |  |  |
| | ENUM: `city`, `district`, `town`, `village`, `neighborhood` | | | | | |
| 7 | `navigation_polygon` | LONGTEXT | NULL | NULL |  |  |
| 8 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 9 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_cities_slug` | BTREE | `province_id`, `slug` | Yes |
| `idx_cities_province` | BTREE | `province_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_city_province` | `province_id` | `provinces` | `id` | CASCADE | NO ACTION |

---

### cms_blogs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 3 | `title` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `excerpt` | TEXT | NULL | NULL |  |  |
| 5 | `content` | LONGTEXT | NULL | NULL |  |  |
| 6 | `cover_image` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `author_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 8 | `is_published` | TINYINT(1) | NOT NULL | 0 |  |  |
| 9 | `published_at` | TIMESTAMP | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |
| `idx_author` | BTREE | `author_id` | No |
| `idx_published` | BTREE | `is_published`, `published_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_blog_author` | `author_id` | `users` | `id` | SET NULL | NO ACTION |

---

### cms_contact_submission_attachments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `submission_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `upload_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `sort_order` | TINYINT(3) UNSIGNED | NOT NULL | 0 |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_contact_attach_upload` | BTREE | `upload_id` | No |
| `idx_contact_attach_submission` | BTREE | `submission_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_contact_attach_submission` | `submission_id` | `cms_contact_submissions` | `id` | CASCADE | NO ACTION |
| `fk_contact_attach_upload` | `upload_id` | `uploads` | `id` | CASCADE | NO ACTION |

---

### cms_contact_submissions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 3 | `email` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `country_id` | SMALLINT(5) UNSIGNED | NULL | NULL |  |  |
| 5 | `phone` | VARCHAR(50) | NULL | NULL |  |  |
| 6 | `subject` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `subject_other` | VARCHAR(255) | NULL | NULL |  |  |
| 8 | `message` | TEXT | NOT NULL |  |  |  |
| 9 | `referral_source` | VARCHAR(100) | NULL | NULL |  |  |
| 10 | `referral_other` | VARCHAR(255) | NULL | NULL |  |  |
| 11 | `is_read` | TINYINT(1) | NOT NULL | 0 |  |  |
| 12 | `email_sent_at` | TIMESTAMP | NULL | NULL |  |  |
| 13 | `email_error` | TEXT | NULL | NULL |  |  |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_contact_country` | BTREE | `country_id` | No |

---

### cms_media

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `filename` | VARCHAR(255) | NOT NULL |  |  | Stored filename (uuid-based) |
| 3 | `original_name` | VARCHAR(255) | NOT NULL |  |  | Original uploaded filename |
| 4 | `mime_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `size_bytes` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 6 | `width` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `height` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 8 | `media_type` | VARCHAR(50) | NOT NULL | 'image' |  |  |
| 9 | `category` | VARCHAR(100) | NULL | NULL |  |  |
| 10 | `alt_text` | VARCHAR(500) | NULL | NULL |  |  |
| 11 | `url` | VARCHAR(500) | NOT NULL |  |  |  |
| 12 | `thumbnail_url` | VARCHAR(500) | NULL | NULL |  |  |
| 13 | `medium_url` | VARCHAR(500) | NULL | NULL |  |  |
| 14 | `uploaded_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 15 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_media_type` | BTREE | `media_type` | No |
| `idx_category` | BTREE | `category` | No |
| `fk_media_uploader` | BTREE | `uploaded_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_media_uploader` | `uploaded_by` | `users` | `id` | SET NULL | NO ACTION |

---

### cms_pages

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 3 | `title` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `content` | LONGTEXT | NULL | NULL |  |  |
| 5 | `meta_title` | VARCHAR(255) | NULL | NULL |  |  |
| 6 | `meta_description` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `is_homepage` | TINYINT(1) | NOT NULL | 0 |  |  |
| 8 | `page_template` | VARCHAR(50) | NULL | NULL |  |  |
| 9 | `sort_order` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 10 | `is_published` | TINYINT(1) | NOT NULL | 0 |  |  |
| 11 | `published_at` | TIMESTAMP | NULL | NULL |  |  |
| 12 | `created_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 14 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### cms_section_blocks

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `page_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `block_type` | VARCHAR(50) | NOT NULL |  |  |  |
| 4 | `block_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `title` | VARCHAR(255) | NULL | NULL |  |  |
| 6 | `subtitle` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `content` | LONGTEXT | NULL | NULL |  | JSON: block-specific configuration fields |
| 8 | `style_config` | LONGTEXT | NULL | NULL |  |  |
| 9 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 10 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_page_order` | BTREE | `page_id`, `sort_order` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_block_page` | `page_id` | `cms_pages` | `id` | CASCADE | NO ACTION |

---

### cms_sections

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `page_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `section_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `title` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `content` | LONGTEXT | NULL | NULL |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_page_section` | BTREE | `page_id`, `section_key` | Yes |
| `idx_page` | BTREE | `page_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_section_page` | `page_id` | `cms_pages` | `id` | CASCADE | NO ACTION |

---

### coach_availability

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_general_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coach_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `day_of_week` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 5 | `start_time` | TIME | NOT NULL |  |  |  |
| 6 | `end_time` | TIME | NOT NULL |  |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_coach_avail_coach` | BTREE | `coach_id`, `day_of_week` | No |
| `idx_coach_avail_branch` | BTREE | `branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_coach_avail_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |
| `fk_coach_avail_coach` | `coach_id` | `coach_profiles` | `id` | CASCADE | NO ACTION |

---

### coach_availability_blackouts

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_general_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coach_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `blackout_date` | DATE | NOT NULL |  |  |  |
| 4 | `reason` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_coach_blackout` | BTREE | `coach_id`, `blackout_date` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_coach_blackout_coach` | `coach_id` | `coach_profiles` | `id` | CASCADE | NO ACTION |

---

### coach_org_agreements

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coach_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `coach_split_pct` | DECIMAL(5,2) | NOT NULL |  |  | Coach % after platform commission |
| 5 | `org_split_pct` | DECIMAL(5,2) | NOT NULL |  |  | Org % after platform commission |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `status` | ENUM('PENDING','ACCEPTED','REJECTED') | NOT NULL | 'accepted' |  |  |
| | ENUM: `pending`, `accepted`, `rejected` | | | | | |
| 8 | `initiated_by` | ENUM('COACH','ORG') | NOT NULL | 'coach' |  |  |
| | ENUM: `coach`, `org` | | | | | |
| 9 | `invited_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_coach_org` | BTREE | `coach_id`, `organisation_id` | Yes |
| `fk_agr_org` | BTREE | `organisation_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_agr_coach` | `coach_id` | `coach_profiles` | `id` | CASCADE | NO ACTION |
| `fk_agr_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### coach_profiles

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `bio` | TEXT | NULL | NULL |  |  |
| 4 | `experience_years` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 5 | `certifications` | LONGTEXT | NULL | NULL |  |  |
| 6 | `sports` | LONGTEXT | NULL | NULL |  | Array of sport_ids they coach |
| 7 | `hourly_rate` | DECIMAL(12,2) | NULL | NULL |  |  |
| 8 | `currency_code` | CHAR(3) | NULL | NULL |  |  |
| 9 | `rating_avg` | DECIMAL(3,2) | NOT NULL | 0.00 |  |  |
| 10 | `rating_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 11 | `is_available` | TINYINT(1) | NOT NULL | 1 |  |  |
| 12 | `is_verified` | TINYINT(1) | NOT NULL | 0 |  |  |
| 13 | `status` | ENUM('NONE','PENDING','APPROVED','REJECTED') | NOT NULL | 'none' |  |  |
| | ENUM: `none`, `pending`, `approved`, `rejected` | | | | | |
| 14 | `rejected_reason` | VARCHAR(500) | NULL | NULL |  |  |
| 15 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 16 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 17 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 18 | `session_durations` | LONGTEXT | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `user_id` | BTREE | `user_id` | Yes |
| `idx_coach_profiles_status` | BTREE | `status` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_coach_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### coach_reviews

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coach_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `session_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `rating` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 6 | `review_text` | TEXT | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_review` | BTREE | `coach_id`, `player_id`, `session_id` | Yes |
| `idx_coach` | BTREE | `coach_id` | No |
| `fk_cr_player` | BTREE | `player_id` | No |
| `fk_cr_session` | BTREE | `session_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cr_coach` | `coach_id` | `coach_profiles` | `id` | CASCADE | NO ACTION |
| `fk_cr_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_cr_session` | `session_id` | `coach_sessions` | `id` | SET NULL | NO ACTION |

---

### coach_sessions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coach_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL = independent session |
| 4 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `resource_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `booking_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 7 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 8 | `start_time` | DATETIME | NOT NULL |  |  |  |
| 9 | `end_time` | DATETIME | NOT NULL |  |  |  |
| 10 | `price` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 11 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 12 | `platform_commission_pct` | DECIMAL(5,2) | NOT NULL |  |  |  |
| 13 | `coach_earnings` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 14 | `org_earnings` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 15 | `status` | ENUM('PENDING_COURT','PENDING_ACCEPTANCE','SCHEDULED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW') | NOT NULL | 'pending_court' |  |  |
| | ENUM: `pending_court`, `pending_acceptance`, `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show` | | | | | |
| 16 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 17 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_coach` | BTREE | `coach_id` | No |
| `idx_player` | BTREE | `player_id` | No |
| `idx_dates` | BTREE | `start_time`, `end_time` | No |
| `fk_cs_org` | BTREE | `organisation_id` | No |
| `fk_cs_branch` | BTREE | `branch_id` | No |
| `fk_cs_resource` | BTREE | `resource_id` | No |
| `idx_cs_booking` | BTREE | `booking_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cs_booking` | `booking_id` | `bookings` | `id` | SET NULL | NO ACTION |
| `fk_cs_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_cs_coach` | `coach_id` | `coach_profiles` | `id` | CASCADE | NO ACTION |
| `fk_cs_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_cs_player` | `player_id` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_cs_resource` | `resource_id` | `resources` | `id` | SET NULL | NO ACTION |

---

### commission_rules

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `rule_name` | VARCHAR(255) | NULL | NULL |  |  |
| 3 | `rule_type` | ENUM('PERCENTAGE','FIXED') | NOT NULL |  |  |  |
| | ENUM: `percentage`, `fixed` | | | | | |
| 4 | `amount` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 5 | `applicable_entity` | VARCHAR(100) | NULL | NULL |  |  |
| 6 | `is_active` | TINYINT(1) | NULL | 1 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

---

### community_event_participants

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `event_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `status` | ENUM('GOING','MAYBE','DECLINED') | NOT NULL | 'going' |  |  |
| | ENUM: `going`, `maybe`, `declined` | | | | | |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_event_user` | BTREE | `event_id`, `user_id` | Yes |
| `fk_cep_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cep_event` | `event_id` | `community_events` | `id` | CASCADE | NO ACTION |
| `fk_cep_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### community_events

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `creator_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `resource_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `title` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `description` | TEXT | NULL | NULL |  |  |
| 8 | `event_type` | ENUM('MATCH','TRAINING','SOCIAL','TOURNAMENT','OTHER') | NOT NULL | 'other' |  |  |
| | ENUM: `match`, `training`, `social`, `tournament`, `other` | | | | | |
| 9 | `start_time` | DATETIME | NOT NULL |  |  |  |
| 10 | `end_time` | DATETIME | NOT NULL |  |  |  |
| 11 | `max_participants` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 12 | `is_public` | TINYINT(1) | NOT NULL | 1 |  |  |
| 13 | `status` | ENUM('ACTIVE','CANCELLED','COMPLETED') | NOT NULL | 'active' |  |  |
| | ENUM: `active`, `cancelled`, `completed` | | | | | |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 15 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_creator` | BTREE | `creator_id` | No |
| `idx_dates` | BTREE | `start_time`, `end_time` | No |
| `fk_event_org` | BTREE | `organisation_id` | No |
| `fk_event_branch` | BTREE | `branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_event_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_event_creator` | `creator_id` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_event_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |

---

### community_tournaments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `creator_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `description` | TEXT | NULL | NULL |  |  |
| 8 | `bracket_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 9 | `max_participants` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 10 | `entry_fee` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 11 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 12 | `start_date` | DATE | NOT NULL |  |  |  |
| 13 | `end_date` | DATE | NULL | NULL |  |  |
| 14 | `status` | ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') | NOT NULL | 'open' |  |  |
| | ENUM: `open`, `in_progress`, `completed`, `cancelled` | | | | | |
| 15 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 16 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_ct_creator` | BTREE | `creator_id` | No |
| `fk_ct_org` | BTREE | `organisation_id` | No |
| `fk_ct_branch` | BTREE | `branch_id` | No |
| `fk_ct_sport` | BTREE | `sport_id` | No |
| `fk_ct_bracket` | BTREE | `bracket_type_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_ct_bracket` | `bracket_type_id` | `tournament_bracket_types` | `id` | NO ACTION | NO ACTION |
| `fk_ct_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_ct_creator` | `creator_id` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_ct_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_ct_sport` | `sport_id` | `sports` | `id` | SET NULL | NO ACTION |

---

### conversation_participants

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `conversation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `last_read_at` | TIMESTAMP | NULL | NULL |  |  |
| 5 | `is_muted` | TINYINT(1) | NOT NULL | 0 |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_convo_user` | BTREE | `conversation_id`, `user_id` | Yes |
| `fk_cp_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cp_convo` | `conversation_id` | `conversations` | `id` | CASCADE | NO ACTION |
| `fk_cp_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### conversations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `conversation_type` | ENUM('DIRECT','GROUP') | NOT NULL | 'direct' |  |  |
| | ENUM: `direct`, `group` | | | | | |
| 3 | `name` | VARCHAR(255) | NULL | NULL |  | For group chats |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 5 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

---

### countries

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | SMALLINT(5) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `iso_code` | CHAR(2) | NOT NULL |  |  |  |
| 3 | `iso_code_3` | CHAR(3) | NOT NULL |  |  |  |
| 4 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `slug` | VARCHAR(120) | NULL | NULL |  |  |
| 6 | `native_name` | VARCHAR(100) | NULL | NULL |  |  |
| 7 | `phone_code` | VARCHAR(10) | NOT NULL |  |  |  |
| 8 | `phone_max_length` | TINYINT(3) UNSIGNED | NOT NULL | 15 |  |  |
| 9 | `phone_min_length` | TINYINT(3) UNSIGNED | NOT NULL | 7 |  |  |
| 10 | `default_locale` | VARCHAR(5) | NOT NULL | 'en' |  |  |
| 11 | `default_currency` | CHAR(3) | NULL | NULL |  |  |
| 12 | `currency_symbol` | VARCHAR(10) | NULL | NULL |  | Currency symbol (e.g. $, ╬ô├╢┬úΓö£ΓöéΓö£├╢Γö£├ºΓö£┬ú╬ô├╢┬╝Γö¼Γò¥) |
| 13 | `currency_decimal_places` | TINYINT(3) UNSIGNED | NULL | 2 |  | Decimal places for the currency |
| 14 | `currency_name` | VARCHAR(50) | NULL | NULL |  | Full currency name |
| 15 | `flag_emoji` | VARCHAR(10) | NULL | NULL |  |  |
| 16 | `navigation_polygon` | LONGTEXT | NULL | NULL |  |  |
| 17 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 18 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 19 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `iso_code` | BTREE | `iso_code` | Yes |
| `iso_code_3` | BTREE | `iso_code_3` | Yes |
| `uq_countries_slug` | BTREE | `slug` | Yes |
| `fk_country_currency` | BTREE | `default_currency` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_country_currency` | `default_currency` | `currencies` | `code` | SET NULL | NO ACTION |

---

### coupon_assignments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coupon_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `entity_type` | ENUM('ORGANISATION','BRANCH','RESOURCE') | NOT NULL |  |  |  |
| | ENUM: `organisation`, `branch`, `resource` | | | | | |
| 4 | `entity_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_coupon_entity` | BTREE | `coupon_id`, `entity_type`, `entity_id` | Yes |
| `idx_ca_entity` | BTREE | `entity_type`, `entity_id` | No |
| `idx_ca_active` | BTREE | `is_active` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_ca_coupon` | `coupon_id` | `coupons` | `id` | CASCADE | NO ACTION |

---

### coupon_usage

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `coupon_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `order_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `used_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_coupon` | BTREE | `coupon_id` | No |
| `idx_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cu_coupon` | `coupon_id` | `coupons` | `id` | CASCADE | NO ACTION |
| `fk_cu_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### coupons

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `code` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `discount_type` | ENUM('PERCENTAGE','FIXED') | NOT NULL |  |  |  |
| | ENUM: `percentage`, `fixed` | | | | | |
| 4 | `discount_value` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 5 | `activity_type` | VARCHAR(100) | NULL | NULL |  |  |
| 6 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `min_order_amount` | DECIMAL(12,2) | NULL | NULL |  |  |
| 8 | `max_uses` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 9 | `max_uses_per_user` | INT(10) UNSIGNED | NULL | 1 |  |  |
| 10 | `starts_at` | TIMESTAMP | NULL | NULL |  |  |
| 11 | `expires_at` | TIMESTAMP | NULL | NULL |  |  |
| 12 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `code` | BTREE | `code` | Yes |
| `idx_code` | BTREE | `code` | No |
| `idx_active` | BTREE | `is_active`, `expires_at` | No |
| `idx_coupon_activity` | BTREE | `activity_type` | No |
| `idx_coupon_sport` | BTREE | `sport_id` | No |

---

### cron_jobs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `job_name` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `handler` | VARCHAR(255) | NOT NULL |  |  | Service/method to call |
| 4 | `cron_expression` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `last_run_at` | TIMESTAMP | NULL | NULL |  |  |
| 7 | `last_error` | TEXT | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `job_name` | BTREE | `job_name` | Yes |

---

### currencies

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | TINYINT(3) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `code` | CHAR(3) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(50) | NOT NULL |  |  |  |
| 4 | `symbol` | VARCHAR(10) | NOT NULL |  |  |  |
| 5 | `decimal_places` | TINYINT(3) UNSIGNED | NOT NULL | 2 |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `code` | BTREE | `code` | Yes |

---

### design_theme_reset_baseline

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | TINYINT(3) UNSIGNED | NOT NULL | 1 |  |  |
| 2 | `label` | VARCHAR(120) | NULL | NULL |  |  |
| 3 | `snapshot` | LONGTEXT | NULL |  |  |  |
| 4 | `saved_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `saved_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE

---

### design_token_versions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `label` | VARCHAR(120) | NULL | NULL |  |  |
| 3 | `snapshot` | LONGTEXT | NULL |  |  | Flat map { token_key: value } of the published theme at this point |
| 4 | `published_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `published_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_dtv_published_at` | BTREE | `published_at` | No |

---

### design_tokens

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `token_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `token_type` | ENUM('COLOR','SIZE','RADIUS','FONT','SHADOW','SPACING','OTHER') | NOT NULL |  |  |  |
| | ENUM: `color`, `size`, `radius`, `font`, `shadow`, `spacing`, `other` | | | | | |
| 4 | `default_value` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `current_value` | VARCHAR(100) | NULL | NULL |  | Overridden by super admin; NULL = use default |
| 6 | `category` | VARCHAR(50) | NULL | 'general' |  |  |
| 7 | `description` | VARCHAR(255) | NULL | NULL |  |  |
| 8 | `updated_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 10 | `draft_value` | VARCHAR(255) | NULL | NULL |  |  |
| 11 | `is_published` | TINYINT(1) | NOT NULL | 1 |  |  |
| 12 | `role_editable` | TINYINT(1) | NOT NULL | 0 |  |  |
| 13 | `current_value_dark` | VARCHAR(255) | NULL | NULL |  |  |
| 14 | `draft_value_dark` | VARCHAR(255) | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `token_key` | BTREE | `token_key` | Yes |

---

### email_verification_tokens

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `token` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `expires_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 5 | `is_used` | TINYINT(1) | NOT NULL | 0 |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `token` | BTREE | `token` | Yes |
| `idx_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_email_ver_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### exchange_rates

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `from_currency` | CHAR(3) | NOT NULL |  |  |  |
| 3 | `to_currency` | CHAR(3) | NOT NULL |  |  |  |
| 4 | `rate` | DECIMAL(18,8) | NOT NULL |  |  |  |
| 5 | `recorded_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `source` | VARCHAR(50) | NULL | 'manual' |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_rate` | BTREE | `from_currency`, `to_currency`, `recorded_at` | Yes |

---

### feature_flags

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `flag_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `label` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `description` | TEXT | NULL | NULL |  |  |
| 5 | `module` | VARCHAR(50) | NOT NULL | 'general' |  |  |
| 6 | `is_enabled` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `is_system` | TINYINT(1) | NOT NULL | 0 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NULL | NULL ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `flag_key` | BTREE | `flag_key` | Yes |

---

### financial_journal_entries

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `entry_type` | VARCHAR(100) | NULL | NULL |  |  |
| 3 | `reference_type` | VARCHAR(100) | NULL | NULL |  |  |
| 4 | `reference_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 5 | `debit_account` | VARCHAR(100) | NULL | NULL |  |  |
| 6 | `credit_account` | VARCHAR(100) | NULL | NULL |  |  |
| 7 | `amount` | DECIMAL(14,2) | NULL | NULL |  |  |
| 8 | `description` | TEXT | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_reference` | BTREE | `reference_type`, `reference_id` | No |

---

### holidays

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `owner_type` | ENUM('ORGANISATION','BRANCH','RESOURCE') | NOT NULL |  |  |  |
| | ENUM: `organisation`, `branch`, `resource` | | | | | |
| 3 | `owner_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 5 | `date_from` | DATE | NOT NULL |  |  |  |
| 6 | `date_to` | DATE | NOT NULL |  |  |  |
| 7 | `is_recurring` | TINYINT(1) | NOT NULL | 0 |  | Recurring yearly (e.g. holidays) |
| 8 | `is_open_modified` | TINYINT(1) | NOT NULL | 0 |  | TRUE if hours differ on these days |
| 9 | `open_time` | TIME | NULL | NULL |  | Modified hours if is_open_modified |
| 10 | `close_time` | TIME | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_holiday_owner` | BTREE | `owner_type`, `owner_id` | No |
| `idx_holiday_dates` | BTREE | `date_from`, `date_to` | No |

---

### inventory_logs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `variant_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `movement_type` | ENUM('IN','OUT','ADJUSTMENT','RESERVATION','RELEASE','RETURN') | NOT NULL |  |  |  |
| | ENUM: `in`, `out`, `adjustment`, `reservation`, `release`, `return` | | | | | |
| 4 | `quantity` | INT(11) | NOT NULL |  |  |  |
| 5 | `stock_before` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 6 | `stock_after` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `reason` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `reference_type` | VARCHAR(50) | NULL | NULL |  |  |
| 9 | `reference_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 10 | `created_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_il_variant` | BTREE | `variant_id` | No |
| `idx_il_created` | BTREE | `created_at` | No |
| `idx_il_reference` | BTREE | `reference_type`, `reference_id` | No |
| `fk_il_user` | BTREE | `created_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_il_user` | `created_by` | `users` | `id` | SET NULL | NO ACTION |
| `fk_il_variant` | `variant_id` | `product_variants` | `id` | CASCADE | NO ACTION |

---

### languages

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | SMALLINT(5) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `code` | VARCHAR(5) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(50) | NOT NULL |  |  |  |
| 4 | `native_name` | VARCHAR(50) | NOT NULL |  |  |  |
| 5 | `is_rtl` | TINYINT(1) | NOT NULL | 0 |  |  |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `code` | BTREE | `code` | Yes |

---

### marketplace_ledger_entries

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `order_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `order_item_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 6 | `entry_type` | ENUM('INVENTORY_DEDUCTION','DUE_TO_COLLECT','DUE_TO_TRANSFER','DUE_TO_COURTZON','REVERSAL','REFUND') | NOT NULL |  |  |  |
| | ENUM: `inventory_deduction`, `due_to_collect`, `due_to_transfer`, `due_to_courtzon`, `reversal`, `refund` | | | | | |
| 7 | `payment_method` | ENUM('COD','ONLINE') | NULL | NULL |  |  |
| | ENUM: `cod`, `online` | | | | | |
| 8 | `amount` | DECIMAL(14,2) | NOT NULL | 0.00 |  |  |
| 9 | `currency_code` | CHAR(3) | NOT NULL | 'EGP' |  |  |
| 10 | `description` | TEXT | NULL | NULL |  |  |
| 11 | `metadata` | LONGTEXT | NULL | NULL |  |  |
| 12 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_mle_order` | BTREE | `order_id` | No |
| `idx_mle_branch` | BTREE | `branch_id` | No |
| `idx_mle_org` | BTREE | `organisation_id` | No |
| `idx_mle_type` | BTREE | `entry_type` | No |
| `idx_mle_org_type_amount` | BTREE | `organisation_id`, `entry_type`, `amount` | No |
| `idx_mle_org_created` | BTREE | `organisation_id`, `created_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_mle_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |
| `fk_mle_order` | `order_id` | `orders` | `id` | CASCADE | NO ACTION |
| `fk_mle_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### media_uploads

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `owner_type` | VARCHAR(50) | NOT NULL |  |  | entity type |
| 3 | `owner_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `file_url` | VARCHAR(500) | NOT NULL |  |  |  |
| 5 | `file_type` | VARCHAR(50) | NOT NULL |  |  | mime type |
| 6 | `file_size` | INT(10) UNSIGNED | NOT NULL |  |  | bytes |
| 7 | `file_name` | VARCHAR(255) | NULL | NULL |  |  |
| 8 | `alt_text` | VARCHAR(255) | NULL | NULL |  |  |
| 9 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 10 | `uploaded_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_owner` | BTREE | `owner_type`, `owner_id` | No |
| `idx_uploader` | BTREE | `uploaded_by` | No |

---

### messages

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `conversation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `sender_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `message_type` | ENUM('TEXT','IMAGE','FILE','SYSTEM') | NOT NULL | 'text' |  |  |
| | ENUM: `text`, `image`, `file`, `system` | | | | | |
| 5 | `content` | TEXT | NOT NULL |  |  |  |
| 6 | `metadata` | LONGTEXT | NULL | NULL |  |  |
| 7 | `is_edited` | TINYINT(1) | NOT NULL | 0 |  |  |
| 8 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_conversation` | BTREE | `conversation_id` | No |
| `idx_sender` | BTREE | `sender_id` | No |
| `idx_created` | BTREE | `created_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_msg_convo` | `conversation_id` | `conversations` | `id` | CASCADE | NO ACTION |
| `fk_msg_sender` | `sender_id` | `users` | `id` | CASCADE | NO ACTION |

---

### migration_history

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(11) | NOT NULL |  | Yes |  |
| 2 | `filename` | VARCHAR(255) | NOT NULL |  |  |  |
| 3 | `hash` | VARCHAR(64) | NOT NULL |  |  |  |
| 4 | `applied_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 5 | `execution_ms` | INT(11) | NULL | 0 |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_filename` | BTREE | `filename` | Yes |

---

### notification_actions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `action_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `route_pattern` | VARCHAR(255) | NULL | NULL |  | Frontend route with params placeholder |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `action_key` | BTREE | `action_key` | Yes |

---

### notification_categories

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 3 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 4 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### notification_queue

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `notification_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 4 | `channel` | ENUM('PUSH','EMAIL','SMS','IN_APP') | NOT NULL |  |  |  |
| | ENUM: `push`, `email`, `sms`, `in_app` | | | | | |
| 5 | `status` | ENUM('PENDING','SENT','FAILED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `sent`, `failed` | | | | | |
| 6 | `retry_count` | TINYINT(3) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `max_retries` | TINYINT(3) UNSIGNED | NOT NULL | 3 |  |  |
| 8 | `error_message` | TEXT | NULL | NULL |  |  |
| 9 | `scheduled_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `sent_at` | TIMESTAMP | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_status` | BTREE | `status`, `scheduled_at` | No |
| `fk_queue_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_queue_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### notifications

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `category_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `action_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `action_payload` | LONGTEXT | NULL | NULL |  | Params for the action route |
| 6 | `title` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `body` | TEXT | NULL | NULL |  |  |
| 8 | `icon` | VARCHAR(100) | NULL | NULL |  |  |
| 9 | `is_read` | TINYINT(1) | NOT NULL | 0 |  |  |
| 10 | `is_pushed` | TINYINT(1) | NOT NULL | 0 |  |  |
| 11 | `read_at` | TIMESTAMP | NULL | NULL |  |  |
| 12 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user_read` | BTREE | `user_id`, `is_read` | No |
| `idx_created` | BTREE | `created_at` | No |
| `fk_notif_category` | BTREE | `category_id` | No |
| `fk_notif_action` | BTREE | `action_id` | No |
| `idx_notifications_push` | BTREE | `user_id`, `is_pushed`, `created_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_notif_action` | `action_id` | `notification_actions` | `id` | SET NULL | NO ACTION |
| `fk_notif_category` | `category_id` | `notification_categories` | `id` | SET NULL | NO ACTION |
| `fk_notif_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### operating_hours

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `owner_type` | ENUM('ORGANISATION','BRANCH','RESOURCE') | NOT NULL |  |  |  |
| | ENUM: `organisation`, `branch`, `resource` | | | | | |
| 3 | `owner_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `day_of_week` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 5 | `is_open` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `open_time` | TIME | NULL | NULL |  |  |
| 7 | `close_time` | TIME | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_hours` | BTREE | `owner_type`, `owner_id`, `day_of_week` | Yes |
| `idx_hours_owner` | BTREE | `owner_type`, `owner_id` | No |

---

### order_items

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `order_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `variant_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `seller_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 6 | `quantity` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 7 | `unit_price` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 8 | `total_price` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 9 | `commission_rate` | DECIMAL(5,2) | NOT NULL | 0.00 |  |  |
| 10 | `commission_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `settlement_status` | ENUM('PENDING','SETTLED','IN_DISPUTE') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `settled`, `in_dispute` | | | | | |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_order` | BTREE | `order_id` | No |
| `idx_seller` | BTREE | `seller_id` | No |
| `fk_oi_product` | BTREE | `product_id` | No |
| `idx_order_items_seller_created` | BTREE | `seller_id`, `created_at` | No |
| `idx_order_items_seller_settlement` | BTREE | `seller_id`, `settlement_status` | No |
| `idx_order_items_seller_order_settlement` | BTREE | `seller_id`, `order_id`, `settlement_status` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_oi_order` | `order_id` | `orders` | `id` | CASCADE | NO ACTION |
| `fk_oi_org` | `seller_id` | `organisations` | `id` | NO ACTION | NO ACTION |
| `fk_oi_product` | `product_id` | `products` | `id` | NO ACTION | NO ACTION |

---

### order_status_history

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `order_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `from_status` | VARCHAR(50) | NULL | NULL |  |  |
| 4 | `to_status` | VARCHAR(50) | NOT NULL |  |  |  |
| 5 | `changed_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `changed_by_role` | VARCHAR(50) | NULL | NULL |  |  |
| 7 | `note` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_order` | BTREE | `order_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_hist_order` | `order_id` | `orders` | `id` | CASCADE | NO ACTION |

---

### orders

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  |  |
| 3 | `buyer_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `status` | ENUM('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` | | | | | |
| 5 | `payment_status` | ENUM('UNPAID','PAID','REFUNDED','PARTIAL_REFUND') | NOT NULL | 'unpaid' |  |  |
| | ENUM: `unpaid`, `paid`, `refunded`, `partial_refund` | | | | | |
| 6 | `subtotal` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 7 | `shipping_cost` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 8 | `estimated_delivery_date` | DATE | NULL | NULL |  |  |
| 9 | `commission_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Platform commission |
| 10 | `courtzon_commission` | DECIMAL(12,2) | NOT NULL | 0.00 |  | CourtZon commission due on this order (same as commission_amount) |
| 11 | `org_product_share` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Org revenue from products = subtotal - discount - commission |
| 12 | `org_shipping_share` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Org revenue from shipping = shipping_cost |
| 13 | `coupon_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 14 | `discount_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 15 | `tax_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 16 | `total` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 17 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 18 | `payment_method` | VARCHAR(50) | NULL | NULL |  |  |
| 19 | `cash_holder` | ENUM('ORG','COURTZON') | NULL | NULL |  | Who collects/collected the cash: org (COD) or courtzon (online/wallet) |
| | ENUM: `org`, `courtzon` | | | | | |
| 20 | `cash_collection_status` | ENUM('EXPECTED_FROM_CUSTOMER','UNDER_COLLECTION','HELD_BY_ORG','HELD_BY_COURTZON') | NULL | NULL |  | Current status of the cash collection lifecycle |
| | ENUM: `expected_from_customer`, `under_collection`, `held_by_org`, `held_by_courtzon` | | | | | |
| 21 | `settlement_status` | ENUM('PENDING','SETTLED') | NOT NULL | 'pending' |  | Settlement status between CourtZon and the organisation |
| | ENUM: `pending`, `settled` | | | | | |
| 22 | `shipping_address` | LONGTEXT | NULL | NULL |  |  |
| 23 | `shipping_carrier` | VARCHAR(100) | NULL | NULL |  |  |
| 24 | `tracking_number` | VARCHAR(255) | NULL | NULL |  |  |
| 25 | `notes` | TEXT | NULL | NULL |  |  |
| 26 | `paid_at` | TIMESTAMP | NULL | NULL |  |  |
| 27 | `cancelled_at` | TIMESTAMP | NULL | NULL |  |  |
| 28 | `cancellation_reason` | VARCHAR(500) | NULL | NULL |  |  |
| 29 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 30 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 31 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 32 | `courtzon_fee` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `idx_buyer` | BTREE | `buyer_id` | No |
| `idx_status` | BTREE | `status`, `payment_status` | No |
| `idx_orders_buyer_created` | BTREE | `buyer_id`, `created_at` | No |
| `idx_orders_settlement_status` | BTREE | `settlement_status`, `status`, `payment_status` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_order_buyer` | `buyer_id` | `users` | `id` | NO ACTION | NO ACTION |

---

### organisation_attribute_values

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `attribute_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `value` | TEXT | NOT NULL |  |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_org_attr` | BTREE | `organisation_id`, `attribute_id` | Yes |
| `fk_eav_attrdef` | BTREE | `attribute_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_eav_attrdef` | `attribute_id` | `organisation_type_attributes` | `id` | CASCADE | NO ACTION |
| `fk_eav_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### organisation_subscriptions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `plan_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `billing_cycle` | ENUM('MONTHLY','YEARLY') | NOT NULL | 'monthly' |  |  |
| | ENUM: `monthly`, `yearly` | | | | | |
| 5 | `start_date` | DATE | NULL | NULL |  |  |
| 6 | `end_date` | DATE | NULL | NULL |  |  |
| 7 | `subscription_status` | ENUM('ACTIVE','EXPIRED','CANCELLED','PENDING') | NOT NULL | 'pending' |  |  |
| | ENUM: `active`, `expired`, `cancelled`, `pending` | | | | | |
| 8 | `auto_renew` | TINYINT(1) | NULL | 1 |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_organisation` | BTREE | `organisation_id` | No |
| `idx_plan` | BTREE | `plan_id` | No |
| `idx_status` | BTREE | `subscription_status` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_os_organisation` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |
| `fk_os_plan` | `plan_id` | `subscription_plans` | `id` | CASCADE | NO ACTION |

---

### organisation_type_attributes

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `org_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `attribute_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `attribute_type` | ENUM('TEXT','NUMBER','BOOLEAN','SELECT','MULTISELECT','DATE','IMAGE') | NOT NULL |  |  |  |
| | ENUM: `text`, `number`, `boolean`, `select`, `multiselect`, `date`, `image` | | | | | |
| 5 | `options` | LONGTEXT | NULL | NULL |  |  |
| 6 | `is_required` | TINYINT(1) | NOT NULL | 0 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_attr` | BTREE | `org_type_id`, `attribute_key` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_attr_orgtype` | `org_type_id` | `organisation_types` | `id` | CASCADE | NO ACTION |

---

### organisation_types

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(100) | NULL | NULL |  | Display name |
| 4 | `description` | TEXT | NULL | NULL |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### organisation_upgrade_requests

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `registration_type` | ENUM('PLAYER','SELLER','ORGANIZATION','UPGRADE') | NOT NULL | 'upgrade' |  |  |
| | ENUM: `player`, `seller`, `organization`, `upgrade` | | | | | |
| 4 | `requested_by` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `requested_org_type_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `requested_plan_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 7 | `chosen_payment_method` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `status` | ENUM('PENDING','APPROVED','REJECTED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `approved`, `rejected` | | | | | |
| 9 | `notes` | TEXT | NULL | NULL |  |  |
| 10 | `metadata` | LONGTEXT | NULL | NULL |  | Additional registration data (payment_method, shop_name, etc.) |
| 11 | `approved_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 12 | `approved_at` | TIMESTAMP | NULL | NULL |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 14 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_org` | BTREE | `organisation_id` | No |
| `idx_status` | BTREE | `status` | No |
| `fk_upr_user` | BTREE | `requested_by` | No |
| `fk_upr_plan` | BTREE | `requested_plan_id` | No |
| `fk_upr_admin` | BTREE | `approved_by` | No |
| `idx_registration_type` | BTREE | `registration_type` | No |
| `fk_upr_orgtype` | BTREE | `requested_org_type_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_upr_admin` | `approved_by` | `users` | `id` | SET NULL | NO ACTION |
| `fk_upr_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |
| `fk_upr_orgtype` | `requested_org_type_id` | `organisation_types` | `id` | SET NULL | NO ACTION |
| `fk_upr_plan` | `requested_plan_id` | `subscription_plans` | `id` | SET NULL | NO ACTION |
| `fk_upr_user` | `requested_by` | `users` | `id` | NO ACTION | NO ACTION |

---

### organisations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  |  |
| 3 | `org_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `owner_id` | INT(10) UNSIGNED | NOT NULL |  |  | Super admin or org owner |
| 5 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 6 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 7 | `description` | TEXT | NULL | NULL |  |  |
| 8 | `logo_url` | VARCHAR(500) | NULL | NULL |  |  |
| 9 | `cover_url` | VARCHAR(500) | NULL | NULL |  |  |
| 10 | `documents` | LONGTEXT | NULL | NULL |  |  |
| 11 | `email` | VARCHAR(255) | NULL | NULL |  |  |
| 12 | `phone` | VARCHAR(25) | NULL | NULL |  |  |
| 13 | `website` | VARCHAR(255) | NULL | NULL |  |  |
| 14 | `country_id` | SMALLINT(5) UNSIGNED | NULL | NULL |  |  |
| 15 | `tax_id` | VARCHAR(100) | NULL | NULL |  | Tax/VAT registration number |
| 16 | `tax_id_type` | VARCHAR(50) | NULL | NULL |  |  |
| 17 | `cr_number` | VARCHAR(100) | NULL | NULL |  |  |
| 18 | `cancellation_policy_level` | ENUM('ORGANISATION','BRANCH') | NOT NULL | 'organisation' |  |  |
| | ENUM: `organisation`, `branch` | | | | | |
| 19 | `cancellation_before_hours` | INT(11) | NOT NULL | 24 |  |  |
| 20 | `cancellation_fee_percentage` | DECIMAL(5,2) | NOT NULL | 0.00 |  |  |
| 21 | `cancellation_fee_fixed` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 22 | `is_verified` | TINYINT(1) | NOT NULL | 0 |  |  |
| 23 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 24 | `rating_avg` | DECIMAL(3,2) | NOT NULL | 0.00 |  |  |
| 25 | `rating_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 26 | `version` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 27 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 28 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 29 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `slug` | BTREE | `slug` | Yes |
| `idx_orgtype` | BTREE | `org_type_id` | No |
| `idx_owner` | BTREE | `owner_id` | No |
| `idx_active` | BTREE | `is_active` | No |
| `idx_org_country` | BTREE | `country_id` | No |
| `idx_organisations_owner` | BTREE | `owner_id`, `is_active` | No |
| `idx_organisations_country` | BTREE | `country_id`, `is_active` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_org_country` | `country_id` | `countries` | `id` | NO ACTION | NO ACTION |
| `fk_org_owner` | `owner_id` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_org_type` | `org_type_id` | `organisation_types` | `id` | NO ACTION | NO ACTION |

---

### password_reset_tokens

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `token` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `expires_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 5 | `used_at` | TIMESTAMP | NULL | NULL |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_token` | BTREE | `token` | No |
| `idx_user` | BTREE | `user_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_reset_token_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### payment_gateway_config

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `payment_method_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `gateway_provider` | VARCHAR(50) | NOT NULL | 'paymob' |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `config` | LONGTEXT | NULL |  |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_gateway_org` | BTREE | `organisation_id`, `gateway_provider` | No |
| `fk_gateway_payment_method` | BTREE | `payment_method_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_gateway_payment_method` | `payment_method_id` | `payment_methods` | `id` | CASCADE | NO ACTION |
| `payment_gateway_config_ibfk_1` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### payment_methods

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `icon` | VARCHAR(50) | NULL | NULL |  | emoji or icon class |
| 5 | `description` | TEXT | NULL | NULL |  |  |
| 6 | `processing_fee_pct` | DECIMAL(5,2) | NOT NULL | 0.00 |  | percentage fee |
| 7 | `processing_fee_fixed` | DECIMAL(12,2) | NOT NULL | 0.00 |  | fixed fee amount |
| 8 | `requires_approval` | TINYINT(1) | NOT NULL | 0 |  | admin must approve org before use |
| 9 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 10 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### payment_transactions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `booking_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 4 | `order_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 5 | `reference_type` | VARCHAR(50) | NULL | NULL |  |  |
| 6 | `payment_method` | ENUM('WALLET','CASH','CARD','BANK_TRANSFER','ONLINE') | NOT NULL |  |  |  |
| | ENUM: `wallet`, `cash`, `card`, `bank_transfer`, `online` | | | | | |
| 7 | `gateway_provider` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `gateway_reference` | VARCHAR(255) | NULL | NULL |  |  |
| 9 | `amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 10 | `currency` | CHAR(3) | NOT NULL | 'EGP' |  |  |
| 11 | `payment_status` | ENUM('PENDING','PAID','FAILED','REFUNDED') | NULL | 'pending' |  |  |
| | ENUM: `pending`, `paid`, `failed`, `refunded` | | | | | |
| 12 | `gateway_response` | LONGTEXT | NULL | NULL |  |  |
| 13 | `paid_at` | TIMESTAMP | NULL | NULL |  |  |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 15 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_gateway_reference` | BTREE | `gateway_reference(255` | Yes |
| `idx_user` | BTREE | `user_id` | No |
| `idx_booking` | BTREE | `booking_id` | No |
| `idx_status` | BTREE | `payment_status` | No |
| `idx_order` | BTREE | `order_id` | No |

---

### peak_hour_pricing

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `day_of_week` | TINYINT(3) UNSIGNED | NOT NULL |  |  | 1=Monday .. 7=Sunday |
| 4 | `start_time` | TIME | NOT NULL |  |  |  |
| 5 | `end_time` | TIME | NOT NULL |  |  |  |
| 6 | `price_multiplier` | DECIMAL(5,2) | NOT NULL | 1.00 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_resource_day` | BTREE | `resource_id`, `day_of_week` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_peak_resource` | `resource_id` | `resources` | `id` | CASCADE | NO ACTION |

---

### permission_modules

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 3 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 4 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### permissions

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `module_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `permission_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `description` | VARCHAR(500) | NULL | NULL |  | What this permission allows |
| 5 | `is_system` | TINYINT(1) | NOT NULL | 0 |  | System permissions cannot be deleted |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `element_type` | ENUM('BUTTON','TAB','PAGE','SECTION','ACTION','FIELD') | NULL | NULL |  |  |
| | ENUM: `button`, `tab`, `page`, `section`, `action`, `field` | | | | | |
| 8 | `element_label` | VARCHAR(255) | NULL | NULL |  | Human-readable label for admin UI |
| 9 | `is_ui_element` | TINYINT(1) | NOT NULL | 0 |  | Whether this permission gates a UI element |
| 10 | `component_path` | VARCHAR(255) | NULL | NULL |  | Optional reference to component file path |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `permission_key` | BTREE | `permission_key` | Yes |
| `fk_perm_module` | BTREE | `module_id` | No |
| `idx_ui_element` | BTREE | `is_ui_element` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_perm_module` | `module_id` | `permission_modules` | `id` | CASCADE | NO ACTION |

---

### platform_accounts

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `account_type` | ENUM('FLOAT','COMMISSION','REFUND_HOLD','PAYOUT') | NOT NULL |  |  |  |
| | ENUM: `float`, `commission`, `refund_hold`, `payout` | | | | | |
| 3 | `currency_id` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 4 | `description` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_account` | BTREE | `account_type`, `currency_id` | Yes |
| `fk_platform_currency` | BTREE | `currency_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_platform_currency` | `currency_id` | `currencies` | `id` | NO ACTION | NO ACTION |

---

### player_levels

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `level_order` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 4 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

---

### player_profiles

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `main_sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `main_level_id` | INT(10) UNSIGNED | NULL | NULL |  | Set at registration; non-editable by player |
| 5 | `is_coach` | TINYINT(1) | NOT NULL | 0 |  |  |
| 6 | `coach_status` | ENUM('NONE','PENDING','APPROVED','REJECTED') | NOT NULL | 'none' |  |  |
| | ENUM: `none`, `pending`, `approved`, `rejected` | | | | | |
| 7 | `coach_rejected_reason` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `is_seller` | TINYINT(1) | NOT NULL | 0 |  |  |
| 9 | `bio` | TEXT | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `user_id` | BTREE | `user_id` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_player_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### player_ratings

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `rater_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `rated_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `booking_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 5 | `rating` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 6 | `review_text` | TEXT | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_rating` | BTREE | `rater_id`, `rated_id`, `booking_id` | Yes |
| `idx_rated` | BTREE | `rated_id` | No |
| `fk_pr_booking` | BTREE | `booking_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_pr_booking` | `booking_id` | `bookings` | `id` | SET NULL | NO ACTION |
| `fk_pr_rated` | `rated_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_pr_rater` | `rater_id` | `users` | `id` | CASCADE | NO ACTION |

---

### player_sport_interests

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 2 | `sport_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `user_id`, `sport_id`
- Type: BTREE

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_psi_sport` | BTREE | `sport_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_psi_sport` | `sport_id` | `sports` | `id` | CASCADE | NO ACTION |
| `fk_psi_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### product_categories

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `parent_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 4 | `slug` | VARCHAR(200) | NOT NULL |  |  |  |
| 5 | `description` | TEXT | NULL | NULL |  |  |
| 6 | `image_url` | VARCHAR(500) | NULL | NULL |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_parent` | BTREE | `parent_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_cat_parent` | `parent_id` | `product_categories` | `id` | SET NULL | NO ACTION |

---

### product_images

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `variant_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `media_url` | VARCHAR(500) | NOT NULL |  |  |  |
| 5 | `alt_text` | VARCHAR(255) | NULL | NULL |  |  |
| 6 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 7 | `is_primary` | TINYINT(1) | NOT NULL | 0 |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_pi_product` | BTREE | `product_id` | No |
| `idx_pi_variant` | BTREE | `variant_id` | No |
| `idx_pi_primary` | BTREE | `product_id`, `is_primary` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_pi_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_pi_variant` | `variant_id` | `product_variants` | `id` | SET NULL | NO ACTION |

---

### product_reviews

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `rating` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 5 | `review_text` | TEXT | NULL | NULL |  |  |
| 6 | `is_verified_purchase` | TINYINT(1) | NOT NULL | 0 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_user_product` | BTREE | `user_id`, `product_id` | Yes |
| `idx_product` | BTREE | `product_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_rev_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_rev_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### product_specifications

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `spec_name` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `spec_value` | VARCHAR(500) | NOT NULL |  |  |  |
| 5 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_ps_product` | BTREE | `product_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_ps_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |

---

### product_tags

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 2 | `tag_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |

**Primary Key**

- Columns: `product_id`, `tag_id`
- Type: BTREE

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_pt_tag` | BTREE | `tag_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_pt_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_pt_tag` | `tag_id` | `tags` | `id` | CASCADE | NO ACTION |

---

### product_variants

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `sku` | VARCHAR(100) | NULL | NULL |  |  |
| 4 | `barcode` | VARCHAR(50) | NULL | NULL |  |  |
| 5 | `variant_name` | VARCHAR(200) | NOT NULL |  |  |  |
| 6 | `variant_type` | VARCHAR(100) | NULL | NULL |  |  |
| 7 | `price_adjustment` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 8 | `compare_price` | DECIMAL(12,2) | NULL | NULL |  |  |
| 9 | `quantity` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 10 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 11 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 12 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 14 | `variant_color` | VARCHAR(7) | NULL | NULL |  | Hex color code for color variant type |
| 15 | `variant_image_url` | VARCHAR(500) | NULL | NULL |  |  |
| 16 | `is_default` | TINYINT(1) | NOT NULL | 0 |  |  |
| 17 | `weight` | DECIMAL(10,2) | NULL | NULL |  | Weight in kg |
| 18 | `dimensions` | VARCHAR(100) | NULL | NULL |  | LxWxH in cm |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_product` | BTREE | `product_id` | No |
| `idx_var_sku` | BTREE | `sku` | No |
| `idx_var_barcode` | BTREE | `barcode` | No |
| `idx_var_default` | BTREE | `is_default` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_var_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |

---

### products

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `seller_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `seller_user_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `seller_type` | ENUM('ORG','PLAYER') | NOT NULL | 'org' |  |  |
| | ENUM: `org`, `player` | | | | | |
| 5 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `category_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 7 | `brand_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 8 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 9 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 10 | `name_ar` | VARCHAR(255) | NULL | NULL |  |  |
| 11 | `description` | TEXT | NULL | NULL |  |  |
| 12 | `short_description_en` | TEXT | NULL | NULL |  |  |
| 13 | `short_description_ar` | TEXT | NULL | NULL |  |  |
| 14 | `description_ar` | TEXT | NULL | NULL |  |  |
| 15 | `price` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 16 | `discounted_price` | DECIMAL(12,2) | NULL | NULL |  | Discounted/sale price for discount display |
| 17 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 18 | `gender` | ENUM('MALE','FEMALE','UNISEX') | NULL | 'unisex' |  |  |
| | ENUM: `male`, `female`, `unisex` | | | | | |
| 19 | `age_group` | ENUM('ADULT','YOUTH','JUNIOR','TODDLER') | NULL | 'adult' |  |  |
| | ENUM: `adult`, `youth`, `junior`, `toddler` | | | | | |
| 20 | `skill_level` | ENUM('BEGINNER','INTERMEDIATE','PROFESSIONAL','ELITE') | NULL | NULL |  |  |
| | ENUM: `beginner`, `intermediate`, `professional`, `elite` | | | | | |
| 21 | `material` | VARCHAR(255) | NULL | NULL |  |  |
| 22 | `rating_avg` | DECIMAL(3,2) | NOT NULL | 0.00 |  |  |
| 23 | `rating_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 24 | `view_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 25 | `sales_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 26 | `quantity` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 27 | `reserved_quantity` | INT(10) UNSIGNED | NOT NULL | 0 |  | Items in active carts |
| 28 | `is_digital` | TINYINT(1) | NOT NULL | 0 |  |  |
| 29 | `digital_download_url` | VARCHAR(500) | NULL | NULL |  |  |
| 30 | `video_url` | VARCHAR(500) | NULL | NULL |  |  |
| 31 | `status` | ENUM('DRAFT','PENDING','ACTIVE','SOLD','ARCHIVED','OUT_OF_STOCK') | NOT NULL | 'draft' |  |  |
| | ENUM: `draft`, `pending`, `active`, `sold`, `archived`, `out_of_stock` | | | | | |
| 32 | `condition_status` | ENUM('NEW','LIKE_NEW','GOOD','FAIR','USED') | NULL | NULL |  |  |
| | ENUM: `new`, `like_new`, `good`, `fair`, `used` | | | | | |
| 33 | `images` | LONGTEXT | NULL | NULL |  |  |
| 34 | `metadata` | LONGTEXT | NULL | NULL |  |  |
| 35 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 36 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 37 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 38 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_seller` | BTREE | `seller_id` | No |
| `idx_category` | BTREE | `category_id` | No |
| `idx_status` | BTREE | `status` | No |
| `idx_price` | BTREE | `price` | No |
| `idx_prod_sport` | BTREE | `sport_id` | No |
| `idx_products_seller_active` | BTREE | `seller_id`, `is_active`, `category_id` | No |
| `idx_products_seller_price` | BTREE | `seller_id`, `is_active`, `price` | No |
| `idx_prod_brand` | BTREE | `brand_id` | No |
| `idx_prod_rating` | BTREE | `rating_avg` | No |
| `idx_prod_gender` | BTREE | `gender` | No |
| `idx_prod_age` | BTREE | `age_group` | No |
| `idx_prod_skill` | BTREE | `skill_level` | No |
| `idx_seller_user` | BTREE | `seller_user_id` | No |
| `idx_product_branch` | BTREE | `branch_id` | No |
| `ft_prod_search` | FULLTEXT | `name`, `name_ar`, `description`, `description_ar` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_prod_brand` | `brand_id` | `brands` | `id` | SET NULL | NO ACTION |
| `fk_prod_category` | `category_id` | `product_categories` | `id` | NO ACTION | NO ACTION |
| `fk_prod_org` | `seller_id` | `organisations` | `id` | CASCADE | NO ACTION |
| `fk_prod_sport` | `sport_id` | `sports` | `id` | SET NULL | NO ACTION |
| `fk_prod_user` | `seller_user_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_product_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |

---

### provinces

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `country_id` | SMALLINT(5) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(120) | NOT NULL |  |  |  |
| 4 | `slug` | VARCHAR(120) | NULL | NULL |  |  |
| 5 | `native_name` | VARCHAR(120) | NULL | NULL |  |  |
| 6 | `code` | VARCHAR(10) | NULL | NULL |  |  |
| 7 | `type` | ENUM('PROVINCE','STATE','GOVERNORATE','REGION','EMIRATE','COUNTY') | NOT NULL | 'province' |  |  |
| | ENUM: `province`, `state`, `governorate`, `region`, `emirate`, `county` | | | | | |
| 8 | `navigation_polygon` | LONGTEXT | NULL | NULL |  |  |
| 9 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 10 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_provinces_slug` | BTREE | `country_id`, `slug` | Yes |
| `idx_provinces_country` | BTREE | `country_id` | No |
| `idx_provinces_code` | BTREE | `code` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_province_country` | `country_id` | `countries` | `id` | CASCADE | NO ACTION |

---

### related_products

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 2 | `related_product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `relation_type` | ENUM('CROSS_SELL','UP_SELL','ACCESSORY','SIMILAR') | NOT NULL | 'similar' |  |  |
| | ENUM: `cross_sell`, `up_sell`, `accessory`, `similar` | | | | | |
| 4 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |

**Primary Key**

- Columns: `product_id`, `related_product_id`, `relation_type`
- Type: BTREE

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_rp_related` | BTREE | `related_product_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_rp_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_rp_related` | `related_product_id` | `products` | `id` | CASCADE | NO ACTION |

---

### resource_attribute_values

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `attribute_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `value` | TEXT | NOT NULL |  |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_res_attr` | BTREE | `resource_id`, `attribute_id` | Yes |
| `fk_res_eav_attr` | BTREE | `attribute_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_res_eav_attr` | `attribute_id` | `resource_type_attributes` | `id` | CASCADE | NO ACTION |
| `fk_res_eav_res` | `resource_id` | `resources` | `id` | CASCADE | NO ACTION |

---

### resource_maintenance

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `reason` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `date_from` | DATETIME | NOT NULL |  |  |  |
| 5 | `date_to` | DATETIME | NOT NULL |  |  |  |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `created_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_resource` | BTREE | `resource_id` | No |
| `idx_dates` | BTREE | `date_from`, `date_to` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_maint_resource` | `resource_id` | `resources` | `id` | CASCADE | NO ACTION |

---

### resource_peak_hours

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `day_of_week` | TINYINT(3) UNSIGNED | NOT NULL |  |  | 0=Sunday...6=Saturday |
| 4 | `has_peak` | TINYINT(1) | NOT NULL | 0 |  |  |
| 5 | `start_time` | TIME | NULL | NULL |  |  |
| 6 | `end_time` | TIME | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_peak_hours_resource_day` | BTREE | `resource_id`, `day_of_week` | Yes |
| `idx_peak_hours_resource` | BTREE | `resource_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_peak_hours_resource` | `resource_id` | `resources` | `id` | CASCADE | NO ACTION |

---

### resource_type_attributes

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `attribute_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `attribute_type` | ENUM('TEXT','NUMBER','BOOLEAN','SELECT','MULTISELECT','DATE','IMAGE') | NOT NULL |  |  |  |
| | ENUM: `text`, `number`, `boolean`, `select`, `multiselect`, `date`, `image` | | | | | |
| 5 | `options` | LONGTEXT | NULL | NULL |  |  |
| 6 | `is_required` | TINYINT(1) | NOT NULL | 0 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_resattr_def` | BTREE | `resource_type_id`, `attribute_key` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_resattr_type` | `resource_type_id` | `resource_types` | `id` | CASCADE | NO ACTION |

---

### resource_types

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `has_slots` | TINYINT(1) | NOT NULL | 1 |  | FALSE for appointment-based |
| 5 | `default_slot_duration` | INT(10) UNSIGNED | NOT NULL | 30 |  | Default slot length in minutes |
| 6 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### resource_unavailability

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `resource_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `start_date` | DATE | NOT NULL |  |  |  |
| 4 | `end_date` | DATE | NULL | NULL |  |  |
| 5 | `start_time` | TIME | NULL | NULL |  |  |
| 6 | `end_time` | TIME | NULL | NULL |  |  |
| 7 | `reason` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_resource_date` | BTREE | `resource_id`, `start_date`, `end_date` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_unavail_resource` | `resource_id` | `resources` | `id` | CASCADE | NO ACTION |

---

### resources

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `resource_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL for non-sport resources (pool, jacuzzi) |
| 6 | `name` | VARCHAR(200) | NOT NULL |  |  |  |
| 7 | `description` | TEXT | NULL | NULL |  |  |
| 8 | `capacity` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 9 | `hourly_price` | DECIMAL(12,2) | NULL | NULL |  |  |
| 10 | `pricing_type` | ENUM('PER_HOUR','FIXED') | NOT NULL | 'per_hour' |  |  |
| | ENUM: `per_hour`, `fixed` | | | | | |
| 11 | `peak_hour_value` | DECIMAL(12,2) | NULL | NULL |  |  |
| 12 | `images` | LONGTEXT | NULL | NULL |  |  |
| 13 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 14 | `slot_duration` | INT(10) UNSIGNED | NULL | NULL |  | Override resource type default (minutes) |
| 15 | `max_bookings_per_slot` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 16 | `opening_time` | TIME | NULL | NULL |  |  |
| 17 | `closing_time` | TIME | NULL | NULL |  |  |
| 18 | `version` | INT(10) UNSIGNED | NOT NULL | 1 |  |  |
| 19 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 20 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 21 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `idx_branch` | BTREE | `branch_id` | No |
| `idx_type` | BTREE | `resource_type_id` | No |
| `idx_sport` | BTREE | `sport_id` | No |
| `idx_active` | BTREE | `is_active`, `branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_res_branch` | `branch_id` | `branches` | `id` | CASCADE | NO ACTION |
| `fk_res_sport` | `sport_id` | `sports` | `id` | SET NULL | NO ACTION |
| `fk_res_type` | `resource_type_id` | `resource_types` | `id` | NO ACTION | NO ACTION |

---

### revert_logs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `super_admin_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `audit_log_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  | The original action being reverted |
| 4 | `reason` | VARCHAR(500) | NOT NULL |  |  |  |
| 5 | `reverted_state` | LONGTEXT | NULL | NULL |  | Snapshot after revert |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_revert_admin` | BTREE | `super_admin_id` | No |
| `fk_revert_audit` | BTREE | `audit_log_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_revert_admin` | `super_admin_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_revert_audit` | `audit_log_id` | `audit_logs` | `id` | CASCADE | NO ACTION |

---

### role_permissions

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `role_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `permission_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_role_perm` | BTREE | `role_id`, `permission_id` | Yes |
| `fk_rp_perm` | BTREE | `permission_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_rp_perm` | `permission_id` | `permissions` | `id` | CASCADE | NO ACTION |
| `fk_rp_role` | `role_id` | `roles` | `id` | CASCADE | NO ACTION |

---

### role_theme_overrides

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `role_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 2 | `token_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `value` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `role_id`, `token_key`
- Type: BTREE

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_rto_role` | BTREE | `role_id` | No |

---

### roles

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 3 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `slug` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `description` | VARCHAR(500) | NULL | NULL |  |  |
| 6 | `is_system` | TINYINT(1) | NOT NULL | 0 |  | System roles (Super Admin, Player) |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 8 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 11 | `org_id_normalized` | INT(10) UNSIGNED | NULL |  |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_role_org_slug` | BTREE | `org_id_normalized`, `slug` | Yes |
| `idx_org_role` | BTREE | `organisation_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_role_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### scheduled_jobs

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `job_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `payload` | LONGTEXT | NULL |  |  |  |
| 4 | `priority` | TINYINT(3) UNSIGNED | NOT NULL | 0 |  |  |
| 5 | `status` | ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `running`, `completed`, `failed`, `cancelled` | | | | | |
| 6 | `scheduled_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 7 | `started_at` | TIMESTAMP | NULL | NULL |  |  |
| 8 | `completed_at` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `error_message` | TEXT | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_status` | BTREE | `status` | No |
| `idx_scheduled` | BTREE | `scheduled_at` | No |

---

### seller_profiles

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  | Link to organisations table (org_type=seller) |
| 4 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  | Auto-created branch for seller accounting |
| 5 | `shop_name` | VARCHAR(200) | NULL | NULL |  |  |
| 6 | `shop_description` | TEXT | NULL | NULL |  |  |
| 7 | `shop_logo_url` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `is_subscribed` | TINYINT(1) | NOT NULL | 0 |  |  |
| 9 | `subscription_expires_at` | TIMESTAMP | NULL | NULL |  |  |
| 10 | `max_free_listings` | INT(10) UNSIGNED | NOT NULL | 5 |  |  |
| 11 | `total_listings` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 12 | `rating_avg` | DECIMAL(3,2) | NOT NULL | 0.00 |  |  |
| 13 | `rating_count` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 14 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 15 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 16 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 17 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_seller_user` | BTREE | `user_id` | Yes |
| `idx_seller_org` | BTREE | `organisation_id` | No |
| `idx_seller_branch` | BTREE | `branch_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_seller_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_seller_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_seller_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### seller_shipping_rates

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `seller_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `province_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `city_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `price` | DECIMAL(14,2) | NOT NULL | 0.00 |  |  |
| 6 | `estimated_days` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_seller` | BTREE | `seller_id` | No |
| `idx_province` | BTREE | `province_id` | No |
| `idx_city` | BTREE | `city_id` | No |
| `idx_seller_province` | BTREE | `seller_id`, `province_id`, `city_id` | No |

---

### settlement_items_v1

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `settlement_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  | Branch that earned this settlement item |
| 4 | `booking_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 5 | `order_id` | INT(10) UNSIGNED | NULL | NULL |  | Marketplace order reference for settlement items |
| 6 | `tournament_registration_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 7 | `gross_amount` | DECIMAL(12,2) | NULL | NULL |  |  |
| 8 | `commission_amount` | DECIMAL(12,2) | NULL | NULL |  |  |
| 9 | `net_amount` | DECIMAL(12,2) | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_settlement` | BTREE | `settlement_id` | No |
| `idx_branch` | BTREE | `branch_id` | No |
| `idx_si_order` | BTREE | `order_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_si_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |

---

### settlement_orders

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `settlement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `order_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `products_price` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Products subtotal before shipping |
| 5 | `shipping_price` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Shipping cost for this order |
| 6 | `gross_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  | products_price + shipping_price |
| 7 | `courtzon_fee` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Fee on gross_amount |
| 8 | `organization_net` | DECIMAL(12,2) | NOT NULL | 0.00 |  | gross_amount - courtzon_fee |
| 9 | `payment_method` | VARCHAR(50) | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_so_settlement` | BTREE | `settlement_id` | No |
| `idx_so_order` | BTREE | `order_id` | No |
| `idx_settlement_orders_unique` | BTREE | `settlement_id`, `order_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_so_order` | `order_id` | `orders` | `id` | CASCADE | NO ACTION |
| `fk_so_settlement` | `settlement_id` | `settlements` | `id` | CASCADE | NO ACTION |

---

### settlement_transfers

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `settlement_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `transfer_direction` | ENUM('COURTZON_TO_ORG','ORG_TO_COURTZON') | NOT NULL |  |  |  |
| | ENUM: `courtzon_to_org`, `org_to_courtzon` | | | | | |
| 4 | `amount` | DECIMAL(12,2) | NOT NULL |  |  |  |
| 5 | `bank_account_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `bank_account_snapshot` | LONGTEXT | NULL | NULL |  |  |
| 7 | `transfer_reference` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `transfer_date` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `transfer_status` | ENUM('PENDING','COMPLETED','FAILED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `completed`, `failed` | | | | | |
| 10 | `failure_reason` | TEXT | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_tf_settlement` | BTREE | `settlement_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_tf_settlement` | `settlement_id` | `settlements` | `id` | CASCADE | NO ACTION |

---

### settlements

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL = org-wide settlement |
| 4 | `settlement_status` | ENUM('REQUESTED','CALCULATING','PENDING_APPROVAL','APPROVED','PAID','COMPLETED','REJECTED','CANCELLED') | NOT NULL | 'requested' |  |  |
| | ENUM: `requested`, `calculating`, `pending_approval`, `approved`, `paid`, `completed`, `rejected`, `cancelled` | | | | | |
| 5 | `requested_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `requested_by_role` | VARCHAR(50) | NULL | NULL |  |  |
| 7 | `settlement_period_start` | DATE | NULL | NULL |  |  |
| 8 | `settlement_period_end` | DATE | NULL | NULL |  |  |
| 9 | `gross_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Products + Shipping total across all included orders |
| 10 | `shipping_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Total shipping cost of included orders |
| 11 | `courtzon_fee` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Total CourtZon fee = sum(fee on (products+shipping)) |
| 12 | `organization_net` | DECIMAL(12,2) | NOT NULL | 0.00 |  | gross_amount - courtzon_fee = org keeps |
| 13 | `cod_fee_total` | DECIMAL(12,2) | NOT NULL | 0.00 |  | CourtZon fee total from COD orders |
| 14 | `online_net_total` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Organization net total from online orders |
| 15 | `settlement_direction` | ENUM('COURTZON_TO_ORG','ORG_TO_COURTZON') | NULL | NULL |  | Who pays whom after netting |
| | ENUM: `courtzon_to_org`, `org_to_courtzon` | | | | | |
| 16 | `final_amount` | DECIMAL(12,2) | NOT NULL | 0.00 |  | Net transfer amount after netting |
| 17 | `settlement_type` | VARCHAR(50) | NULL | NULL |  |  |
| 18 | `commission_amount` | DECIMAL(14,2) | NOT NULL | 0.00 |  |  |
| 19 | `net_amount` | DECIMAL(14,2) | NOT NULL | 0.00 |  |  |
| 20 | `processed_at` | TIMESTAMP | NULL | NULL |  |  |
| 21 | `bank_account_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 22 | `bank_account_snapshot` | LONGTEXT | NULL | NULL |  |  |
| 23 | `requested_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 24 | `calculating_started_at` | TIMESTAMP | NULL | NULL |  |  |
| 25 | `calculating_completed_at` | TIMESTAMP | NULL | NULL |  |  |
| 26 | `approved_at` | TIMESTAMP | NULL | NULL |  |  |
| 27 | `paid_at` | TIMESTAMP | NULL | NULL |  |  |
| 28 | `completed_at` | TIMESTAMP | NULL | NULL |  |  |
| 29 | `rejected_at` | TIMESTAMP | NULL | NULL |  |  |
| 30 | `rejected_reason` | TEXT | NULL | NULL |  |  |
| 31 | `notes` | TEXT | NULL | NULL |  |  |
| 32 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 33 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_stl_org` | BTREE | `organisation_id` | No |
| `idx_stl_branch` | BTREE | `branch_id` | No |
| `idx_stl_status` | BTREE | `settlement_status` | No |
| `idx_stl_requested_by` | BTREE | `requested_by` | No |
| `idx_settlements_org_status_requested` | BTREE | `organisation_id`, `settlement_status`, `requested_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_stl_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_stl_org` | `organisation_id` | `organisations` | `id` | CASCADE | NO ACTION |

---

### settlements_v1

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `organisation_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `settlement_type` | ENUM('ORG_TO_COURTZON','COURTZON_TO_ORG') | NOT NULL |  |  |  |
| | ENUM: `org_to_courtzon`, `courtzon_to_org` | | | | | |
| 4 | `gross_amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 5 | `commission_amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 6 | `net_amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 7 | `settlement_status` | ENUM('PENDING','PROCESSING','COMPLETED','FAILED') | NULL | 'pending' |  |  |
| | ENUM: `pending`, `processing`, `completed`, `failed` | | | | | |
| 8 | `settlement_period_start` | DATE | NULL | NULL |  |  |
| 9 | `settlement_period_end` | DATE | NULL | NULL |  |  |
| 10 | `processed_at` | TIMESTAMP | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `notes` | TEXT | NULL | NULL |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_status` | BTREE | `settlement_status` | No |
| `idx_organisation` | BTREE | `organisation_id` | No |
| `idx_settlements_org` | BTREE | `organisation_id`, `settlement_period_end` | No |

---

### sidebar_layout

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `parent_key` | VARCHAR(100) | NOT NULL | '' |  |  |
| 4 | `ordered_keys` | LONGTEXT | NULL |  |  | Array of permissionKeys in display order |
| 5 | `created_at` | DATETIME | NOT NULL | current_timestamp() |  |  |
| 6 | `updated_at` | DATETIME | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_user_parent` | BTREE | `user_id`, `parent_key` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `sidebar_layout_ibfk_1` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### sport_positions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `sport_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 5 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `fk_pos_sport` | BTREE | `sport_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_pos_sport` | `sport_id` | `sports` | `id` | CASCADE | NO ACTION |

---

### sports

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `slug` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `icon` | VARCHAR(100) | NULL | NULL |  |  |
| 5 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `show_in_marketplace` | TINYINT(1) | NOT NULL | 1 |  |  |
| 7 | `sort_order` | SMALLINT(5) UNSIGNED | NOT NULL | 0 |  |  |
| 8 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 9 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 10 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### subscription_features

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `feature_key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `label` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `value_type` | ENUM('NUMERIC','BOOLEAN','TIER','TEXT') | NOT NULL | 'boolean' |  |  |
| | ENUM: `numeric`, `boolean`, `tier`, `text` | | | | | |
| 5 | `unit` | VARCHAR(50) | NULL | NULL |  | Used by getPlanNumericLimit() joins |
| 6 | `sort_order` | INT(11) | NOT NULL | 0 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `feature_key` | BTREE | `feature_key` | Yes |

---

### subscription_plan_features

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `plan_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `feature_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `value` | VARCHAR(255) | NOT NULL |  |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_plan_feature` | BTREE | `plan_id`, `feature_id` | Yes |
| `feature_id` | BTREE | `feature_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `subscription_plan_features_ibfk_1` | `plan_id` | `subscription_plans` | `id` | CASCADE | NO ACTION |
| `subscription_plan_features_ibfk_2` | `feature_id` | `subscription_features` | `id` | CASCADE | NO ACTION |

---

### subscription_plan_rates

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `plan_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `applicable_entity` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `rate_type` | ENUM('PERCENTAGE','FIXED') | NOT NULL | 'percentage' |  |  |
| | ENUM: `percentage`, `fixed` | | | | | |
| 5 | `amount` | DECIMAL(5,2) | NOT NULL |  |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uq_plan_entity` | BTREE | `plan_id`, `applicable_entity` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_spr_plan` | `plan_id` | `subscription_plans` | `id` | CASCADE | NO ACTION |

---

### subscription_plans

**Table Metadata**

| Property | Value |
|---|---|
| Engine |  |
| Character Set |  |
| Collation | (default) |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `plan_name` | VARCHAR(255) | NOT NULL |  |  |  |
| 3 | `price_monthly` | DECIMAL(12,2) | NULL | NULL |  |  |
| 4 | `price_yearly` | DECIMAL(12,2) | NULL | NULL |  |  |
| 5 | `is_unlimited` | TINYINT(1) | NOT NULL | 0 |  |  |
| 6 | `features` | LONGTEXT | NULL | NULL |  |  |
| 7 | `applicable_org_types` | LONGTEXT | NULL | NULL |  |  |
| 8 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 9 | `is_internal` | TINYINT(1) | NOT NULL | 0 |  | Admin-assignment only; excluded from public catalog |
| 10 | `sort_order` | INT(10) UNSIGNED | NOT NULL | 0 |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

---

### system_settings

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `key` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `value` | LONGTEXT | NULL |  |  |  |
| 4 | `description` | VARCHAR(500) | NULL | NULL |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `key` | BTREE | `key` | Yes |

---

### tags

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `slug` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### tournament_bracket_types

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `name` | VARCHAR(100) | NOT NULL |  |  |  |
| 3 | `slug` | VARCHAR(50) | NOT NULL |  |  |  |
| 4 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 5 | `config_schema` | LONGTEXT | NULL | NULL |  | JSON Schema for bracket-specific config |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `slug` | BTREE | `slug` | Yes |

---

### tournament_match_scores

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `match_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `set_number` | TINYINT(3) UNSIGNED | NOT NULL |  |  |  |
| 4 | `player1_score` | VARCHAR(20) | NULL | NULL |  |  |
| 5 | `player2_score` | VARCHAR(20) | NULL | NULL |  |  |
| 6 | `entered_by` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_match` | BTREE | `match_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_score_match` | `match_id` | `tournament_matches` | `id` | CASCADE | NO ACTION |

---

### tournament_matches

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `tournament_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `round` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `match_number` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `player1_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `player2_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 7 | `resource_id` | INT(10) UNSIGNED | NULL | NULL |  | Linked resource allocation |
| 8 | `start_time` | DATETIME | NULL | NULL |  |  |
| 9 | `end_time` | DATETIME | NULL | NULL |  |  |
| 10 | `status` | ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','WALKOVER','CANCELLED') | NOT NULL | 'scheduled' |  |  |
| | ENUM: `scheduled`, `in_progress`, `completed`, `walkover`, `cancelled` | | | | | |
| 11 | `winner_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 12 | `score_summary` | VARCHAR(500) | NULL | NULL |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 14 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_tournament` | BTREE | `tournament_id` | No |
| `idx_player1` | BTREE | `player1_id` | No |
| `idx_player2` | BTREE | `player2_id` | No |
| `idx_status` | BTREE | `status` | No |
| `fk_match_resource` | BTREE | `resource_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_match_player1` | `player1_id` | `users` | `id` | SET NULL | NO ACTION |
| `fk_match_player2` | `player2_id` | `users` | `id` | SET NULL | NO ACTION |
| `fk_match_resource` | `resource_id` | `resources` | `id` | SET NULL | NO ACTION |
| `fk_match_tourn` | `tournament_id` | `tournaments` | `id` | CASCADE | NO ACTION |

---

### tournament_registrations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `tournament_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `player_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `seed_rank` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `payment_status` | ENUM('UNPAID','PAID','REFUNDED') | NOT NULL | 'unpaid' |  |  |
| | ENUM: `unpaid`, `paid`, `refunded` | | | | | |
| 6 | `status` | ENUM('REGISTERED','CONFIRMED','WITHDRAWN','DISQUALIFIED') | NOT NULL | 'registered' |  |  |
| | ENUM: `registered`, `confirmed`, `withdrawn`, `disqualified` | | | | | |
| 7 | `registered_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_player_tourn` | BTREE | `tournament_id`, `player_id` | Yes |
| `idx_tournament` | BTREE | `tournament_id` | No |
| `idx_player` | BTREE | `player_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_reg_player` | `player_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_reg_tourn` | `tournament_id` | `tournaments` | `id` | CASCADE | NO ACTION |

---

### tournaments

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  |  |
| 3 | `creator_id` | INT(10) UNSIGNED | NOT NULL |  |  | Any role can create |
| 4 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  | NULL = community tournament |
| 5 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `bracket_type_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 7 | `sport_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 8 | `name` | VARCHAR(255) | NOT NULL |  |  |  |
| 9 | `description` | TEXT | NULL | NULL |  |  |
| 10 | `tournament_type` | ENUM('PLATFORM','COMMUNITY') | NOT NULL | 'platform' |  |  |
| | ENUM: `platform`, `community` | | | | | |
| 11 | `max_participants` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 12 | `min_participants` | INT(10) UNSIGNED | NOT NULL | 2 |  |  |
| 13 | `entry_fee` | DECIMAL(12,2) | NOT NULL | 0.00 |  |  |
| 14 | `currency_code` | CHAR(3) | NOT NULL |  |  |  |
| 15 | `commission_rate` | DECIMAL(5,2) | NOT NULL | 0.00 |  | Platform commission % on entry fees |
| 16 | `prize_description` | TEXT | NULL | NULL |  |  |
| 17 | `status` | ENUM('DRAFT','OPEN','IN_PROGRESS','COMPLETED','CANCELLED') | NOT NULL | 'draft' |  |  |
| | ENUM: `draft`, `open`, `in_progress`, `completed`, `cancelled` | | | | | |
| 18 | `registration_opens` | TIMESTAMP | NULL | NULL |  |  |
| 19 | `registration_closes` | TIMESTAMP | NULL | NULL |  |  |
| 20 | `start_date` | DATE | NOT NULL |  |  |  |
| 21 | `end_date` | DATE | NULL | NULL |  |  |
| 22 | `rules` | TEXT | NULL | NULL |  |  |
| 23 | `is_featured` | TINYINT(1) | NOT NULL | 0 |  |  |
| 24 | `image_url` | VARCHAR(500) | NULL | NULL |  |  |
| 25 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 26 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 27 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `idx_creator` | BTREE | `creator_id` | No |
| `idx_org` | BTREE | `organisation_id` | No |
| `idx_sport` | BTREE | `sport_id` | No |
| `idx_status` | BTREE | `status` | No |
| `idx_dates` | BTREE | `start_date`, `end_date` | No |
| `fk_tourn_branch` | BTREE | `branch_id` | No |
| `fk_tourn_bracket` | BTREE | `bracket_type_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_tourn_bracket` | `bracket_type_id` | `tournament_bracket_types` | `id` | NO ACTION | NO ACTION |
| `fk_tourn_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_tourn_creator` | `creator_id` | `users` | `id` | NO ACTION | NO ACTION |
| `fk_tourn_org` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_tourn_sport` | `sport_id` | `sports` | `id` | SET NULL | NO ACTION |

---

### transaction_entries

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `transaction_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `side` | ENUM('DEBIT','CREDIT') | NOT NULL |  |  |  |
| | ENUM: `debit`, `credit` | | | | | |
| 4 | `entity_type` | ENUM('USER_WALLET','PLATFORM_ACCOUNT','BRANCH') | NOT NULL |  |  |  |
| | ENUM: `user_wallet`, `platform_account`, `branch` | | | | | |
| 5 | `entity_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 6 | `amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 7 | `currency_id` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 8 | `branch_id` | INT(10) UNSIGNED | NULL | NULL |  | Branch when entity is a branch (accounting unit) |
| 9 | `organisation_id` | INT(10) UNSIGNED | NULL | NULL |  | Denormalized from branch for dashboard speed |
| 10 | `description` | TEXT | NULL | NULL |  |  |
| 11 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_transaction` | BTREE | `transaction_id` | No |
| `idx_entity` | BTREE | `entity_type`, `entity_id` | No |
| `idx_branch` | BTREE | `branch_id` | No |
| `idx_organisation` | BTREE | `organisation_id` | No |
| `idx_created` | BTREE | `created_at` | No |
| `fk_entry_currency` | BTREE | `currency_id` | No |
| `idx_txn_entries_branch_created` | BTREE | `branch_id`, `created_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_entry_branch` | `branch_id` | `branches` | `id` | SET NULL | NO ACTION |
| `fk_entry_currency` | `currency_id` | `currencies` | `id` | NO ACTION | NO ACTION |
| `fk_entry_organisation` | `organisation_id` | `organisations` | `id` | SET NULL | NO ACTION |
| `fk_entry_txn` | `transaction_id` | `transactions` | `id` | CASCADE | NO ACTION |

---

### transactions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NULL | NULL |  |  |
| 3 | `type` | ENUM('BOOKING_PAYMENT','WALLET_TOPUP','REFUND','PAYOUT','MARKETPLACE_ORDER','WITHDRAWAL') | NOT NULL |  |  |  |
| | ENUM: `booking_payment`, `wallet_topup`, `refund`, `payout`, `marketplace_order`, `withdrawal` | | | | | |
| 4 | `source_type` | ENUM('BOOKING','ACADEMY','MARKETPLACE','ADMIN','WALLET') | NULL | NULL |  |  |
| | ENUM: `booking`, `academy`, `marketplace`, `admin`, `wallet` | | | | | |
| 5 | `source_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 6 | `currency_id` | TINYINT(3) UNSIGNED | NULL | NULL |  |  |
| 7 | `total_amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 8 | `status` | ENUM('PENDING','COMPLETED','REVERSED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `completed`, `reversed` | | | | | |
| 9 | `metadata` | LONGTEXT | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_type` | BTREE | `type` | No |
| `idx_source` | BTREE | `source_type`, `source_id` | No |
| `idx_status` | BTREE | `status` | No |
| `fk_txn_currency` | BTREE | `currency_id` | No |
| `idx_transactions_type_status` | BTREE | `type`, `status`, `created_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_txn_currency` | `currency_id` | `currencies` | `id` | NO ACTION | NO ACTION |

---

### translation_keys

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `key` | VARCHAR(500) | NOT NULL |  |  |  |
| 3 | `default_value` | TEXT | NOT NULL |  |  |  |
| 4 | `module_slug` | VARCHAR(100) | NOT NULL |  |  |  |
| 5 | `element_type` | VARCHAR(50) | NOT NULL | 'label' |  |  |
| 6 | `element_label` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `component_path` | VARCHAR(500) | NULL | NULL |  |  |
| 8 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 9 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_translation_key` | BTREE | `key(191` | Yes |
| `idx_module` | BTREE | `module_slug` | No |

---

### translations

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `key` | VARCHAR(500) | NOT NULL |  |  | Dot-notation key (e.g. auth.login.title) |
| 3 | `locale` | VARCHAR(5) | NOT NULL |  |  |  |
| 4 | `value` | TEXT | NOT NULL |  |  |  |
| 5 | `is_auto` | TINYINT(1) | NOT NULL | 0 |  | TRUE if machine-translated |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_translation` | BTREE | `locale`, `key(191` | Yes |
| `idx_key` | BTREE | `key(191` | No |

---

### uploads

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NULL | NULL |  |  |
| 3 | `entity_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 4 | `entity_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `file_category` | VARCHAR(50) | NULL | NULL |  |  |
| 6 | `original_name` | VARCHAR(500) | NOT NULL |  |  |  |
| 7 | `mime_type` | VARCHAR(100) | NOT NULL |  |  |  |
| 8 | `file_path` | VARCHAR(500) | NOT NULL |  |  | Path relative to storage root |
| 9 | `file_size` | INT(10) UNSIGNED | NULL | NULL |  | Bytes |
| 10 | `width` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 11 | `height` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 12 | `processing_status` | ENUM('PENDING','PROCESSING','READY','FAILED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `processing`, `ready`, `failed` | | | | | |
| 13 | `error_message` | TEXT | NULL | NULL |  |  |
| 14 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_entity` | BTREE | `entity_type`, `entity_id` | No |
| `idx_status` | BTREE | `processing_status` | No |
| `idx_created` | BTREE | `created_at` | No |

---

### user_addresses

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `label` | VARCHAR(100) | NULL | NULL |  |  |
| 4 | `full_name` | VARCHAR(200) | NOT NULL |  |  |  |
| 5 | `phone` | VARCHAR(50) | NOT NULL |  |  |  |
| 6 | `street_address` | TEXT | NOT NULL |  |  |  |
| 7 | `city` | VARCHAR(200) | NOT NULL |  |  |  |
| 8 | `state` | VARCHAR(200) | NULL | NULL |  |  |
| 9 | `province_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 10 | `city_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 11 | `postal_code` | VARCHAR(20) | NULL | NULL |  |  |
| 12 | `country` | VARCHAR(100) | NOT NULL | 'Egypt' |  |  |
| 13 | `address_type` | ENUM('SHIPPING','BILLING','BOTH') | NOT NULL | 'both' |  |  |
| | ENUM: `shipping`, `billing`, `both` | | | | | |
| 14 | `is_default` | TINYINT(1) | NOT NULL | 0 |  |  |
| 15 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 16 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_province` | BTREE | `province_id` | No |
| `idx_city` | BTREE | `city_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_addr_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_devices

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `device_fingerprint` | VARCHAR(255) | NOT NULL |  |  |  |
| 4 | `device_name` | VARCHAR(255) | NULL | NULL |  |  |
| 5 | `device_type` | ENUM('MOBILE','TABLET','DESKTOP','OTHER') | NULL | NULL |  |  |
| | ENUM: `mobile`, `tablet`, `desktop`, `other` | | | | | |
| 6 | `os` | VARCHAR(100) | NULL | NULL |  |  |
| 7 | `browser` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `ip_address` | VARCHAR(45) | NOT NULL |  |  |  |
| 9 | `user_agent` | TEXT | NULL | NULL |  |  |
| 10 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |
| 11 | `last_seen_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 12 | `first_seen_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 13 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_fingerprint` | BTREE | `device_fingerprint` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_device_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_follows

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `follower_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `following_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_follow` | BTREE | `follower_id`, `following_id` | Yes |
| `idx_following` | BTREE | `following_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_follow_follower` | `follower_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_follow_following` | `following_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_friends

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `requester_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `addressee_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `status` | ENUM('PENDING','ACCEPTED','BLOCKED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `accepted`, `blocked` | | | | | |
| 5 | `responded_at` | TIMESTAMP | NULL | NULL |  |  |
| 6 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 7 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_friendship` | BTREE | `requester_id`, `addressee_id` | Yes |
| `idx_addressee` | BTREE | `addressee_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_friend_addr` | `addressee_id` | `users` | `id` | CASCADE | NO ACTION |
| `fk_friend_req` | `requester_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_notification_preferences

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `category_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `is_allowed` | TINYINT(1) | NOT NULL | 1 |  |  |
| 5 | `push_enabled` | TINYINT(1) | NOT NULL | 1 |  |  |
| 6 | `email_enabled` | TINYINT(1) | NOT NULL | 0 |  |  |
| 7 | `sms_enabled` | TINYINT(1) | NOT NULL | 0 |  |  |
| 8 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_user_cat` | BTREE | `user_id`, `category_id` | Yes |
| `fk_pref_cat` | BTREE | `category_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_pref_cat` | `category_id` | `notification_categories` | `id` | CASCADE | NO ACTION |
| `fk_pref_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_role_scopes

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_role_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `scope_type` | ENUM('ORGANISATION','BRANCH','RESOURCE') | NOT NULL |  |  |  |
| | ENUM: `organisation`, `branch`, `resource` | | | | | |
| 4 | `scope_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 5 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_scope` | BTREE | `user_role_id`, `scope_type`, `scope_id` | Yes |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_scope_userrole` | `user_role_id` | `user_roles` | `id` | CASCADE | NO ACTION |

---

### user_roles

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `role_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `assigned_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 5 | `assigned_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 6 | `expires_at` | TIMESTAMP | NULL | NULL |  |  |
| 7 | `is_active` | TINYINT(1) | NOT NULL | 1 |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_user_role` | BTREE | `user_id`, `role_id` | Yes |
| `fk_ur_role` | BTREE | `role_id` | No |
| `fk_ur_assigner` | BTREE | `assigned_by` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_ur_assigner` | `assigned_by` | `users` | `id` | SET NULL | NO ACTION |
| `fk_ur_role` | `role_id` | `roles` | `id` | CASCADE | NO ACTION |
| `fk_ur_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_sessions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `device_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 4 | `refresh_token_hash` | VARCHAR(255) | NOT NULL |  |  |  |
| 5 | `ip_address` | VARCHAR(45) | NOT NULL |  |  |  |
| 6 | `ip_country` | VARCHAR(100) | NULL | NULL |  |  |
| 7 | `user_agent` | TEXT | NULL | NULL |  |  |
| 8 | `expires_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |
| 9 | `refresh_token_expires_at` | TIMESTAMP | NULL | NULL |  |  |
| 10 | `last_activity_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 11 | `is_revoked` | TINYINT(1) | NOT NULL | 0 |  |  |
| 12 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 13 | `session_token_hash` | CHAR(64) | NOT NULL | '' |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_user` | BTREE | `user_id` | No |
| `idx_expires` | BTREE | `expires_at` | No |
| `fk_session_device` | BTREE | `device_id` | No |
| `idx_sessions_active` | BTREE | `user_id`, `is_revoked`, `expires_at` | No |
| `idx_sessions_cleanup` | BTREE | `expires_at`, `is_revoked` | No |
| `idx_sessions_token_hash` | BTREE | `session_token_hash` | No |
| `idx_user_sessions_refresh_expires` | BTREE | `user_id`, `refresh_token_expires_at` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_session_device` | `device_id` | `user_devices` | `id` | SET NULL | NO ACTION |
| `fk_session_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### user_wallets

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 3 | `balance` | DECIMAL(14,2) | NULL | 0.00 |  |  |
| 4 | `currency_code` | VARCHAR(10) | NULL | 'EGP' |  |  |
| 5 | `is_locked` | TINYINT(1) | NULL | 0 |  |  |
| 6 | `version` | INT(11) | NULL | 1 |  |  |
| 7 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_wallet_user` | BTREE | `user_id` | Yes |

---

### users

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NOT NULL |  |  | UUID for external references |
| 3 | `country_id` | SMALLINT(5) UNSIGNED | NOT NULL |  |  |  |
| 4 | `phone_number` | VARCHAR(20) | NOT NULL |  |  |  |
| 5 | `full_phone` | VARCHAR(25) | NOT NULL |  |  | country_code + phone_number (E.164) |
| 6 | `email` | VARCHAR(255) | NOT NULL |  |  |  |
| 7 | `password_hash` | VARCHAR(255) | NOT NULL |  |  |  |
| 8 | `full_name` | VARCHAR(150) | NOT NULL |  |  |  |
| 9 | `avatar_url` | VARCHAR(500) | NULL | NULL |  |  |
| 10 | `gender` | ENUM('MALE','FEMALE') | NOT NULL |  |  |  |
| | ENUM: `male`, `female` | | | | | |
| 11 | `birth_date` | DATE | NULL | NULL |  |  |
| 12 | `language_id` | SMALLINT(5) UNSIGNED | NULL | NULL |  |  |
| 13 | `timezone` | VARCHAR(50) | NULL | 'UTC' |  |  |
| 14 | `dark_mode` | ENUM('LIGHT','DARK','SYSTEM') | NOT NULL | 'system' |  |  |
| | ENUM: `light`, `dark`, `system` | | | | | |
| 15 | `account_status` | ENUM('ACTIVE','SUSPENDED','BANNED','DELETED') | NOT NULL | 'active' |  |  |
| | ENUM: `active`, `suspended`, `banned`, `deleted` | | | | | |
| 16 | `last_login_at` | TIMESTAMP | NULL | NULL |  |  |
| 17 | `last_login_ip` | VARCHAR(45) | NULL | NULL |  |  |
| 18 | `is_phone_verified` | TINYINT(1) | NOT NULL | 1 |  | Auto-verified on signup |
| 19 | `is_email_verified` | TINYINT(1) | NOT NULL | 0 |  |  |
| 20 | `is_public` | TINYINT(1) | NOT NULL | 1 |  |  |
| 21 | `has_seen_welcome` | TINYINT(1) | NOT NULL | 0 |  |  |
| 22 | `has_activated_selling` | TINYINT(1) | NOT NULL | 0 |  |  |
| 23 | `version` | INT(10) UNSIGNED | NOT NULL | 1 |  | Optimistic locking |
| 24 | `deleted_at` | TIMESTAMP | NULL | NULL |  |  |
| 25 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |
| 26 | `updated_at` | TIMESTAMP | NOT NULL | current_timestamp() ON UPDATE current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `public_id` | BTREE | `public_id` | Yes |
| `full_phone` | BTREE | `full_phone` | Yes |
| `email` | BTREE | `email` | Yes |
| `idx_country` | BTREE | `country_id` | No |
| `idx_status` | BTREE | `account_status` | No |
| `idx_full_phone` | BTREE | `full_phone` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_user_country` | `country_id` | `countries` | `id` | NO ACTION | NO ACTION |

---

### wallet_transactions

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | BIGINT(20) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `public_id` | CHAR(36) | NULL | NULL |  |  |
| 3 | `wallet_id` | BIGINT(20) UNSIGNED | NOT NULL |  |  |  |
| 4 | `transaction_type` | ENUM('DEPOSIT','WITHDRAWAL','PAYMENT','REFUND','COMMISSION','SETTLEMENT','DUE','PENALTY') | NOT NULL |  |  |  |
| | ENUM: `deposit`, `withdrawal`, `payment`, `refund`, `commission`, `settlement`, `due`, `penalty` | | | | | |
| 5 | `amount` | DECIMAL(14,2) | NOT NULL |  |  |  |
| 6 | `direction` | ENUM('CREDIT','DEBIT') | NOT NULL |  |  |  |
| | ENUM: `credit`, `debit` | | | | | |
| 7 | `reference_type` | VARCHAR(100) | NULL | NULL |  |  |
| 8 | `reference_id` | BIGINT(20) UNSIGNED | NULL | NULL |  |  |
| 9 | `description` | TEXT | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `idx_wallet` | BTREE | `wallet_id` | No |
| `idx_reference` | BTREE | `reference_type`, `reference_id` | No |
| `idx_wallet_txn_wallet_created` | BTREE | `wallet_id`, `created_at` | No |
| `idx_wallet_txn_type_created` | BTREE | `wallet_id`, `transaction_type`, `created_at` | No |

---

### wishlist_items

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `product_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `uk_user_product_wish` | BTREE | `user_id`, `product_id` | Yes |
| `idx_user` | BTREE | `user_id` | No |
| `fk_wish_product` | BTREE | `product_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_wish_product` | `product_id` | `products` | `id` | CASCADE | NO ACTION |
| `fk_wish_user` | `user_id` | `users` | `id` | CASCADE | NO ACTION |

---

### withdrawal_requests

**Table Metadata**

| Property | Value |
|---|---|
| Engine | InnoDB |
| Character Set | utf8mb4 |
| Collation | utf8mb4_unicode_ci |

**Columns**

| # | Column | Type | Nullable | Default | Auto Inc | Comment |
|   | ENUM Values | | | | | |
|---|---|---|---|---|---|---|
| 1 | `id` | INT(10) UNSIGNED | NOT NULL |  | Yes |  |
| 2 | `user_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 3 | `wallet_id` | INT(10) UNSIGNED | NOT NULL |  |  |  |
| 4 | `amount` | DECIMAL(10,2) | NOT NULL |  |  |  |
| 5 | `branch_financial_details_id` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 6 | `status` | ENUM('PENDING','APPROVED','REJECTED','COMPLETED','CANCELLED') | NOT NULL | 'pending' |  |  |
| | ENUM: `pending`, `approved`, `rejected`, `completed`, `cancelled` | | | | | |
| 7 | `admin_notes` | TEXT | NULL | NULL |  |  |
| 8 | `reviewed_by` | INT(10) UNSIGNED | NULL | NULL |  |  |
| 9 | `reviewed_at` | TIMESTAMP | NULL | NULL |  |  |
| 10 | `created_at` | TIMESTAMP | NOT NULL | current_timestamp() |  |  |

**Primary Key**

- Columns: `id`
- Type: BTREE
- AUTO_INCREMENT on: `id`

**Indexes**

| Index Name | Type | Columns | Unique |
|---|---|---|---|
| `reviewed_by` | BTREE | `reviewed_by` | No |
| `idx_withdrawal_user` | BTREE | `user_id` | No |
| `idx_withdrawal_status` | BTREE | `status` | No |
| `fk_wr_branch_financial` | BTREE | `branch_financial_details_id` | No |

**Foreign Keys**

| Constraint | Local Columns | Referenced Table | Referenced Columns | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|
| `fk_wr_branch_financial` | `branch_financial_details_id` | `branch_financial_details` | `id` | SET NULL | NO ACTION |
| `withdrawal_requests_ibfk_1` | `user_id` | `users` | `id` | CASCADE | NO ACTION |
| `withdrawal_requests_ibfk_3` | `reviewed_by` | `users` | `id` | SET NULL | NO ACTION |

---

## Part 3: Object Inventory

### Triggers (from Baseline)

| Trigger Name | Event | Table | Description |
|---|---|---|---|
| `trg_order_after_insert` | AFTER INSERT | `orders` | Inserts audit log on order creation |
| `trg_order_status_change` | AFTER UPDATE | `orders` | Inserts audit log on order status change |
| `trg_audit_org_update` | AFTER UPDATE | `organisations` | Inserts audit log on org update |
| `trg_audit_user_update` | AFTER UPDATE | `users` | Inserts audit log on user soft-delete |

### Events (from Baseline)

| Event Name | Schedule | Description |
|---|---|---|
| `ev_cleanup_expired_sessions` | EVERY 1 DAY | Marks expired user sessions as revoked |
| `ev_process_notification_queue` | EVERY 1 MINUTE | Processes pending notification queue |

### Views
- None in baseline.

### Stored Procedures / Functions
- None

### Seed Data INSERT Statements
- 0 INSERT statements in baseline. Seed data is in `database/seeds/001_baseline.sql`

---
## Migration Files — New Tables

The following migration files add CREATE TABLE statements for tables not in the baseline:

### 013_notifications_enterprise.sql

- `notification_templates`
- `notification_delivery`
- `notification_digest_windows`
- `notification_rate_limits`
- `notification_analytics`
- `notification_dead_letter_queue`

### 014_notification_broadcasts.sql

- `notification_broadcasts`

### 015_notification_enterprise_platform.sql

- `notification_providers`
- `user_devices` ⚠️ Also exists in baseline
- `user_quiet_hours`
- `user_channel_preferences`
- `notification_template_versions`
- `notification_webhooks`
- `notification_audit_trail`
- `notification_feature_flags`
- `notification_ab_tests`
- `notification_ab_results`
- `notification_cleanup_policies`
- `notification_replay_log`

### 016_monitoring_alerts.sql

- `notification_alerts`
- `client_error_reports`
- `web_vitals_metrics`

### 017_create_matches.sql

- `matches`

### 017_notification_types.sql

- `notification_types`

### 018_create_public_match_details.sql

- `public_match_details`

### 019_create_invitations.sql

- `invitations`

### 019_system_settings.sql

- `system_settings` ⚠️ Also exists in baseline
- `application_settings_history`

### 020_create_join_requests.sql

- `join_requests`

### 020_membership_foundation.sql

- `membership_plans`
- `membership_benefits`
- `user_memberships`
- `membership_history`

### 021_create_match_participants.sql

- `match_participants`

### 022_create_match_sessions.sql

- `match_sessions`

### 023_create_waiting_list.sql

- `waiting_list`

### 027_chat_groups_pins_unread.sql

- `group_invitations`

### 033_coach_collaboration_flow.sql

- `coach_session_events`

### 039_event_bus_processed_events.sql

- `processed_events`

### 040_workflow_tables.sql

- `workflow_instances`
- `workflow_steps`
- `workflow_events`

### 042_processed_commands.sql

- `processed_commands`

### 043_dead_letter.sql

- `dead_letter_entries`

### 044_published_events.sql

- `published_events`

### 045_outbox_cursors.sql

- `outbox_cursors`

### 046_workflow_event_subscriptions.sql

- `workflow_event_subscriptions`

### 047_workflow_definitions.sql

- `workflow_definitions`

### 048_workflow_branch_instances.sql

- `workflow_branch_instances`

### 053_pricing_engine.sql

- `pricing_rules`
- `pricing_seasons`

### 054_financial_engine.sql

- `ledger_entries`
- `settlement_batches`

### 055_membership_loyalty.sql

- `membership_plans`
- `memberships`
- `loyalty_points`
- `loyalty_campaigns`
- `reward_catalog`
- `reward_claims`

### 056_tournaments.sql

- `tournaments` ⚠️ Also exists in baseline
- `tournament_participants`
- `tournament_matches` ⚠️ Also exists in baseline
- `elo_ratings`

### 060_create_user_organisations_user_branches.sql

- `user_organisations`
- `user_branches`

### 061_academy_training.sql

- `academy_programs`
- `academy_groups`
- `academy_enrollments` ⚠️ Also exists in baseline
- `academy_group_sessions`
- `academy_attendance`

### 062_tournament_competition.sql

- `tournament_groups`
- `tournament_group_members`
- `tournament_match_players`
- `tournament_match_results`
- `tournament_standings`

### 063_league_season_ranking.sql

- `seasons`
- `leagues`
- `league_divisions`
- `league_teams`
- `league_matches`
- `league_results`
- `league_standings`
- `player_statistics`
- `team_statistics`

### 065_org_announcements.sql

- `org_announcements`

### 066_support_tickets.sql

- `support_tickets`
- `support_ticket_messages`

### 067_marketplace_inventory.sql

- `warehouses`
- `suppliers`
- `purchase_orders`
- `purchase_order_items`
- `stock_transfers`

### 068_finance_accounting.sql

- `chart_of_accounts`
- `accounting_periods`
- `general_ledger`
- `invoices`
- `invoice_items`
- `tax_rates`

### 069_crm_marketing.sql

- `customer_segments`
- `segment_members`
- `leads`
- `marketing_campaigns`
- `communication_log`

### 070_hr_payroll.sql

- `departments`
- `positions`
- `employees`
- `employment_contracts`
- `leave_types`
- `leave_requests`
- `leave_balances`
- `staff_attendance`
- `payroll_components`
- `payroll_runs`
- `payroll_entries`

### 071_business_intelligence.sql

- `kpi_snapshots`

### 072_integration_platform.sql

- `api_keys`

### 073_mobile_platform.sql

- `push_tokens`
- `app_versions`
- `app_settings` ⚠️ Also exists in baseline
- `push_log`

#### Notes on overlapping table names
- `user_devices` — baseline + migration `015_notification_enterprise_platform.sql`
- `membership_plans` — `020_membership_foundation.sql` + `055_membership_loyalty.sql`
- `system_settings` — baseline + `019_system_settings.sql`
- `tournaments` — baseline + `056_tournaments.sql`
- `tournament_matches` — baseline + `056_tournaments.sql`
- `academy_enrollments` — baseline + `061_academy_training.sql`
- `app_settings` — baseline + `073_mobile_platform.sql`

---
## Part 4: Relationship Map

### Classification Legend

- **Root Entity**: No FK dependencies on other business tables
- **Reference/Lookup**: Small table, few/no FKs, provides enumerated values
- **Junction Table**: Composite PK linking two entities
- **Child Entity**: Has FKs to other tables, owned by parent(s)

### Table Relationship Map

#### academies

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations`, `sports` |
| Child Tables | `academy_curriculums`, `academy_enrollments`, `academy_evaluations`, `academy_sessions` |
| Column Count | 11 |
| FK Count | 3 |
| Index Count | 4 |

#### academy_curriculums

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `academies` |
| Child Tables | `academy_enrollments`, `academy_sessions` |
| Column Count | 10 |
| FK Count | 1 |
| Index Count | 2 |

#### academy_enrollments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `academies`, `academy_curriculums`, `users` |
| Column Count | 7 |
| FK Count | 3 |
| Index Count | 5 |

#### academy_evaluations

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `academies`, `users` |
| Column Count | 9 |
| FK Count | 3 |
| Index Count | 4 |

#### academy_session_attendance

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `academy_sessions`, `users` |
| Column Count | 5 |
| FK Count | 2 |
| Index Count | 3 |

#### academy_sessions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `academies`, `academy_curriculums`, `resources`, `users` |
| Child Tables | `academy_session_attendance` |
| Column Count | 11 |
| FK Count | 4 |
| Index Count | 6 |

#### activity_logs

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 5 |

#### ad_campaigns

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_placements`, `organisations`, `users` |
| Child Tables | `ad_clicks`, `ad_creatives`, `ad_impressions`, `ad_targeting_rules` |
| Column Count | 15 |
| FK Count | 3 |
| Index Count | 6 |

#### ad_clicks

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_campaigns`, `ad_impressions` |
| Column Count | 7 |
| FK Count | 2 |
| Index Count | 3 |

#### ad_creatives

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_campaigns` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 2 |

#### ad_impressions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_campaigns` |
| Child Tables | `ad_clicks` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 5 |

#### ad_placements

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `ad_campaigns`, `ad_pricing` |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 2 |

#### ad_pricing

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_placements` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### ad_targeting_rules

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `ad_campaigns` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 2 |

#### amenities

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 3 |

#### announcement_comments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `announcement_comments`, `announcements`, `users` |
| Child Tables | `announcement_comments` |
| Column Count | 7 |
| FK Count | 3 |
| Index Count | 4 |

#### announcement_likes

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `announcements`, `users` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 3 |

#### announcements

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisations`, `users` |
| Child Tables | `announcement_comments`, `announcement_likes` |
| Column Count | 9 |
| FK Count | 2 |
| Index Count | 3 |

#### app_settings

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 3 |

#### audit_logs

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `revert_logs` |
| Column Count | 11 |
| FK Count | 0 |
| Index Count | 7 |

#### bank_branches

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `banks` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 2 |

#### banks

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `countries` |
| Child Tables | `bank_branches` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### booking_cancellations

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 3 |

#### booking_intents

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 21 |
| FK Count | 0 |
| Index Count | 6 |

#### booking_invitations

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 3 |

#### booking_matchmaking_requests

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `bookings`, `player_levels` |
| Column Count | 12 |
| FK Count | 2 |
| Index Count | 5 |

#### booking_participants

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 2 |

#### booking_slots

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 3 |

#### bookings

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches` |
| Child Tables | `booking_matchmaking_requests`, `coach_sessions`, `player_ratings` |
| Column Count | 29 |
| FK Count | 1 |
| Index Count | 10 |

#### branch_amenity_assignments

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 4 |

#### branch_financial_details

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches` |
| Child Tables | `withdrawal_requests` |
| Column Count | 15 |
| FK Count | 1 |
| Index Count | 4 |

#### branch_player_access

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `users` |
| Column Count | 9 |
| FK Count | 3 |
| Index Count | 4 |

#### branch_unavailability

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### branches

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `currencies`, `organisations` |
| Child Tables | `academies`, `bookings`, `branch_financial_details`, `branch_player_access`, `branch_unavailability`, `cancellation_policies`, `coach_availability`, `coach_sessions`, `community_events`, `community_tournaments`, `marketplace_ledger_entries`, `products`, `resources`, `seller_profiles`, `settlement_items_v1`, `settlements`, `tournaments`, `transaction_entries` |
| Column Count | 29 |
| FK Count | 2 |
| Index Count | 6 |

#### brands

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `products` |
| Column Count | 11 |
| FK Count | 0 |
| Index Count | 2 |

#### cancellation_policies

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `branches` |
| Column Count | 7 |
| FK Count | 1 |
| Index Count | 3 |

#### cart_items

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products`, `users` |
| Column Count | 8 |
| FK Count | 2 |
| Index Count | 4 |

#### cities

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `provinces` |
| Column Count | 10 |
| FK Count | 1 |
| Index Count | 3 |

#### cms_blogs

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 4 |

#### cms_contact_submission_attachments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `cms_contact_submissions`, `uploads` |
| Column Count | 5 |
| FK Count | 2 |
| Index Count | 3 |

#### cms_contact_submissions

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `cms_contact_submission_attachments` |
| Column Count | 14 |
| FK Count | 0 |
| Index Count | 2 |

#### cms_media

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 15 |
| FK Count | 1 |
| Index Count | 4 |

#### cms_pages

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `cms_section_blocks`, `cms_sections` |
| Column Count | 14 |
| FK Count | 0 |
| Index Count | 2 |

#### cms_section_blocks

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `cms_pages` |
| Column Count | 12 |
| FK Count | 1 |
| Index Count | 2 |

#### cms_sections

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `cms_pages` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 3 |

#### coach_availability

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `coach_profiles` |
| Column Count | 8 |
| FK Count | 2 |
| Index Count | 3 |

#### coach_availability_blackouts

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `coach_profiles` |
| Column Count | 5 |
| FK Count | 1 |
| Index Count | 2 |

#### coach_org_agreements

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `coach_profiles`, `organisations` |
| Column Count | 11 |
| FK Count | 2 |
| Index Count | 3 |

#### coach_profiles

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Child Tables | `coach_availability`, `coach_availability_blackouts`, `coach_org_agreements`, `coach_reviews`, `coach_sessions` |
| Column Count | 18 |
| FK Count | 1 |
| Index Count | 3 |

#### coach_reviews

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `coach_profiles`, `coach_sessions`, `users` |
| Column Count | 7 |
| FK Count | 3 |
| Index Count | 5 |

#### coach_sessions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `bookings`, `branches`, `coach_profiles`, `organisations`, `resources`, `users` |
| Child Tables | `coach_reviews` |
| Column Count | 17 |
| FK Count | 6 |
| Index Count | 8 |

#### commission_rules

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 1 |

#### community_event_participants

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `community_events`, `users` |
| Column Count | 5 |
| FK Count | 2 |
| Index Count | 3 |

#### community_events

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations`, `users` |
| Child Tables | `community_event_participants` |
| Column Count | 15 |
| FK Count | 3 |
| Index Count | 5 |

#### community_tournaments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations`, `sports`, `tournament_bracket_types`, `users` |
| Column Count | 16 |
| FK Count | 5 |
| Index Count | 6 |

#### conversation_participants

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `conversations`, `users` |
| Column Count | 6 |
| FK Count | 2 |
| Index Count | 3 |

#### conversations

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `conversation_participants`, `messages` |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 1 |

#### countries

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `currencies` |
| Child Tables | `banks`, `organisations`, `provinces`, `users` |
| Column Count | 19 |
| FK Count | 1 |
| Index Count | 5 |

#### coupon_assignments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `coupons` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 4 |

#### coupon_usage

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `coupons`, `users` |
| Column Count | 5 |
| FK Count | 2 |
| Index Count | 3 |

#### coupons

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `coupon_assignments`, `coupon_usage` |
| Column Count | 13 |
| FK Count | 0 |
| Index Count | 6 |

#### cron_jobs

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 2 |

#### currencies

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `branches`, `countries`, `platform_accounts`, `transaction_entries`, `transactions` |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 2 |

#### design_theme_reset_baseline

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 1 |

#### design_token_versions

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 2 |

#### design_tokens

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 14 |
| FK Count | 0 |
| Index Count | 2 |

#### email_verification_tokens

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 3 |

#### exchange_rates

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Column Count | 6 |
| FK Count | 0 |
| Index Count | 2 |

#### feature_flags

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 2 |

#### financial_journal_entries

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 2 |

#### holidays

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Column Count | 11 |
| FK Count | 0 |
| Index Count | 3 |

#### inventory_logs

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `product_variants`, `users` |
| Column Count | 11 |
| FK Count | 2 |
| Index Count | 5 |

#### languages

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Column Count | 8 |
| FK Count | 0 |
| Index Count | 2 |

#### marketplace_ledger_entries

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `orders`, `organisations` |
| Column Count | 12 |
| FK Count | 3 |
| Index Count | 7 |

#### media_uploads

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 11 |
| FK Count | 0 |
| Index Count | 3 |

#### messages

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `conversations`, `users` |
| Column Count | 9 |
| FK Count | 2 |
| Index Count | 4 |

#### migration_history

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 2 |

#### notification_actions

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `notifications` |
| Column Count | 4 |
| FK Count | 0 |
| Index Count | 2 |

#### notification_categories

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `notifications`, `user_notification_preferences` |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 2 |

#### notification_queue

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 3 |

#### notifications

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `notification_actions`, `notification_categories`, `users` |
| Column Count | 12 |
| FK Count | 3 |
| Index Count | 6 |

#### operating_hours

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 3 |

#### order_items

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `orders`, `organisations`, `products` |
| Column Count | 12 |
| FK Count | 3 |
| Index Count | 7 |

#### order_status_history

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `orders` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 2 |

#### orders

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Child Tables | `marketplace_ledger_entries`, `order_items`, `order_status_history`, `settlement_orders` |
| Column Count | 32 |
| FK Count | 1 |
| Index Count | 6 |

#### organisation_attribute_values

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisation_type_attributes`, `organisations` |
| Column Count | 6 |
| FK Count | 2 |
| Index Count | 3 |

#### organisation_subscriptions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisations`, `subscription_plans` |
| Column Count | 10 |
| FK Count | 2 |
| Index Count | 4 |

#### organisation_type_attributes

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisation_types` |
| Child Tables | `organisation_attribute_values` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### organisation_types

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `organisation_type_attributes`, `organisation_upgrade_requests`, `organisations` |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 2 |

#### organisation_upgrade_requests

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisation_types`, `organisations`, `subscription_plans`, `users` |
| Column Count | 14 |
| FK Count | 5 |
| Index Count | 8 |

#### organisations

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `countries`, `organisation_types`, `users` |
| Child Tables | `academies`, `ad_campaigns`, `announcements`, `branches`, `coach_org_agreements`, `coach_sessions`, `community_events`, `community_tournaments`, `marketplace_ledger_entries`, `order_items`, `organisation_attribute_values`, `organisation_subscriptions`, `organisation_upgrade_requests`, `payment_gateway_config`, `products`, `roles`, `seller_profiles`, `settlements`, `tournaments`, `transaction_entries` |
| Column Count | 29 |
| FK Count | 3 |
| Index Count | 9 |

#### password_reset_tokens

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 3 |

#### payment_gateway_config

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `organisations`, `payment_methods` |
| Column Count | 8 |
| FK Count | 2 |
| Index Count | 3 |

#### payment_methods

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `payment_gateway_config` |
| Column Count | 12 |
| FK Count | 0 |
| Index Count | 2 |

#### payment_transactions

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 15 |
| FK Count | 0 |
| Index Count | 6 |

#### peak_hour_pricing

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resources` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 2 |

#### permission_modules

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `permissions` |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 2 |

#### permissions

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `permission_modules` |
| Child Tables | `role_permissions` |
| Column Count | 10 |
| FK Count | 1 |
| Index Count | 4 |

#### platform_accounts

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `currencies` |
| Column Count | 5 |
| FK Count | 1 |
| Index Count | 3 |

#### player_levels

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `booking_matchmaking_requests` |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 1 |

#### player_profiles

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 2 |

#### player_ratings

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `bookings`, `users` |
| Column Count | 7 |
| FK Count | 3 |
| Index Count | 4 |

#### player_sport_interests

| Property | Value |
|---|---|
| Classification | Junction |
| Parent Tables | `sports`, `users` |
| Column Count | 3 |
| FK Count | 2 |
| Index Count | 2 |

#### product_categories

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `product_categories` |
| Child Tables | `product_categories`, `products` |
| Column Count | 10 |
| FK Count | 1 |
| Index Count | 2 |

#### product_images

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `product_variants`, `products` |
| Column Count | 8 |
| FK Count | 2 |
| Index Count | 4 |

#### product_reviews

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products`, `users` |
| Column Count | 7 |
| FK Count | 2 |
| Index Count | 3 |

#### product_specifications

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products` |
| Column Count | 5 |
| FK Count | 1 |
| Index Count | 2 |

#### product_tags

| Property | Value |
|---|---|
| Classification | Junction |
| Parent Tables | `products`, `tags` |
| Column Count | 2 |
| FK Count | 2 |
| Index Count | 2 |

#### product_variants

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products` |
| Child Tables | `inventory_logs`, `product_images` |
| Column Count | 18 |
| FK Count | 1 |
| Index Count | 5 |

#### products

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `brands`, `organisations`, `product_categories`, `sports`, `users` |
| Child Tables | `cart_items`, `order_items`, `product_images`, `product_reviews`, `product_specifications`, `product_tags`, `product_variants`, `related_products`, `wishlist_items` |
| Column Count | 38 |
| FK Count | 6 |
| Index Count | 16 |

#### provinces

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `countries` |
| Child Tables | `cities` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 4 |

#### related_products

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 2 |

#### resource_attribute_values

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resource_type_attributes`, `resources` |
| Column Count | 6 |
| FK Count | 2 |
| Index Count | 3 |

#### resource_maintenance

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resources` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 3 |

#### resource_peak_hours

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resources` |
| Column Count | 8 |
| FK Count | 1 |
| Index Count | 3 |

#### resource_type_attributes

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resource_types` |
| Child Tables | `resource_attribute_values` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### resource_types

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `resource_type_attributes`, `resources` |
| Column Count | 10 |
| FK Count | 0 |
| Index Count | 2 |

#### resource_unavailability

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resources` |
| Column Count | 9 |
| FK Count | 1 |
| Index Count | 2 |

#### resources

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `resource_types`, `sports` |
| Child Tables | `academy_sessions`, `coach_sessions`, `peak_hour_pricing`, `resource_attribute_values`, `resource_maintenance`, `resource_peak_hours`, `resource_unavailability`, `tournament_matches` |
| Column Count | 21 |
| FK Count | 3 |
| Index Count | 6 |

#### revert_logs

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `audit_logs`, `users` |
| Column Count | 6 |
| FK Count | 2 |
| Index Count | 3 |

#### role_permissions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `permissions`, `roles` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 3 |

#### role_theme_overrides

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 4 |
| FK Count | 0 |
| Index Count | 2 |

#### roles

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `organisations` |
| Child Tables | `role_permissions`, `user_roles` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 3 |

#### scheduled_jobs

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 10 |
| FK Count | 0 |
| Index Count | 3 |

#### seller_profiles

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations`, `users` |
| Column Count | 17 |
| FK Count | 3 |
| Index Count | 4 |

#### seller_shipping_rates

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 5 |

#### settlement_items_v1

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches` |
| Column Count | 10 |
| FK Count | 1 |
| Index Count | 4 |

#### settlement_orders

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `orders`, `settlements` |
| Column Count | 10 |
| FK Count | 2 |
| Index Count | 4 |

#### settlement_transfers

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `settlements` |
| Column Count | 12 |
| FK Count | 1 |
| Index Count | 2 |

#### settlements

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations` |
| Child Tables | `settlement_orders`, `settlement_transfers` |
| Column Count | 33 |
| FK Count | 2 |
| Index Count | 6 |

#### settlements_v1

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 12 |
| FK Count | 0 |
| Index Count | 4 |

#### sidebar_layout

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 2 |

#### sport_positions

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Parent Tables | `sports` |
| Column Count | 7 |
| FK Count | 1 |
| Index Count | 2 |

#### sports

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `academies`, `community_tournaments`, `player_sport_interests`, `products`, `resources`, `sport_positions`, `tournaments` |
| Column Count | 10 |
| FK Count | 0 |
| Index Count | 2 |

#### subscription_features

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `subscription_plan_features` |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 2 |

#### subscription_plan_features

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `subscription_features`, `subscription_plans` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 3 |

#### subscription_plan_rates

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `subscription_plans` |
| Column Count | 6 |
| FK Count | 1 |
| Index Count | 2 |

#### subscription_plans

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `organisation_subscriptions`, `organisation_upgrade_requests`, `subscription_plan_features`, `subscription_plan_rates` |
| Column Count | 11 |
| FK Count | 0 |
| Index Count | 1 |

#### system_settings

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 6 |
| FK Count | 0 |
| Index Count | 2 |

#### tags

| Property | Value |
|---|---|
| Classification | Reference/Lookup |
| Child Tables | `product_tags` |
| Column Count | 5 |
| FK Count | 0 |
| Index Count | 2 |

#### tournament_bracket_types

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `community_tournaments`, `tournaments` |
| Column Count | 6 |
| FK Count | 0 |
| Index Count | 2 |

#### tournament_match_scores

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `tournament_matches` |
| Column Count | 7 |
| FK Count | 1 |
| Index Count | 2 |

#### tournament_matches

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `resources`, `tournaments`, `users` |
| Child Tables | `tournament_match_scores` |
| Column Count | 14 |
| FK Count | 4 |
| Index Count | 6 |

#### tournament_registrations

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `tournaments`, `users` |
| Column Count | 7 |
| FK Count | 2 |
| Index Count | 4 |

#### tournaments

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `organisations`, `sports`, `tournament_bracket_types`, `users` |
| Child Tables | `tournament_matches`, `tournament_registrations` |
| Column Count | 27 |
| FK Count | 5 |
| Index Count | 9 |

#### transaction_entries

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branches`, `currencies`, `organisations`, `transactions` |
| Column Count | 11 |
| FK Count | 4 |
| Index Count | 8 |

#### transactions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `currencies` |
| Child Tables | `transaction_entries` |
| Column Count | 11 |
| FK Count | 1 |
| Index Count | 6 |

#### translation_keys

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 9 |
| FK Count | 0 |
| Index Count | 3 |

#### translations

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 3 |

#### uploads

| Property | Value |
|---|---|
| Classification | Root Entity |
| Child Tables | `cms_contact_submission_attachments` |
| Column Count | 14 |
| FK Count | 0 |
| Index Count | 4 |

#### user_addresses

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 16 |
| FK Count | 1 |
| Index Count | 4 |

#### user_devices

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Child Tables | `user_sessions` |
| Column Count | 13 |
| FK Count | 1 |
| Index Count | 3 |

#### user_follows

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 3 |

#### user_friends

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `users` |
| Column Count | 7 |
| FK Count | 2 |
| Index Count | 3 |

#### user_notification_preferences

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `notification_categories`, `users` |
| Column Count | 8 |
| FK Count | 2 |
| Index Count | 3 |

#### user_role_scopes

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `user_roles` |
| Column Count | 5 |
| FK Count | 1 |
| Index Count | 2 |

#### user_roles

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `roles`, `users` |
| Child Tables | `user_role_scopes` |
| Column Count | 7 |
| FK Count | 3 |
| Index Count | 4 |

#### user_sessions

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `user_devices`, `users` |
| Column Count | 13 |
| FK Count | 2 |
| Index Count | 8 |

#### user_wallets

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 7 |
| FK Count | 0 |
| Index Count | 2 |

#### users

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `countries` |
| Child Tables | `academy_enrollments`, `academy_evaluations`, `academy_session_attendance`, `academy_sessions`, `ad_campaigns`, `announcement_comments`, `announcement_likes`, `announcements`, `app_settings`, `branch_player_access`, `cart_items`, `cms_blogs`, `cms_media`, `coach_profiles`, `coach_reviews`, `coach_sessions`, `community_event_participants`, `community_events`, `community_tournaments`, `conversation_participants`, `coupon_usage`, `email_verification_tokens`, `inventory_logs`, `messages`, `notification_queue`, `notifications`, `orders`, `organisation_upgrade_requests`, `organisations`, `password_reset_tokens`, `player_profiles`, `player_ratings`, `player_sport_interests`, `product_reviews`, `products`, `revert_logs`, `seller_profiles`, `sidebar_layout`, `tournament_matches`, `tournament_registrations`, `tournaments`, `user_addresses`, `user_devices`, `user_follows`, `user_friends`, `user_notification_preferences`, `user_roles`, `user_sessions`, `wishlist_items`, `withdrawal_requests` |
| Column Count | 26 |
| FK Count | 1 |
| Index Count | 7 |

#### wallet_transactions

| Property | Value |
|---|---|
| Classification | Root Entity |
| Column Count | 10 |
| FK Count | 0 |
| Index Count | 5 |

#### wishlist_items

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `products`, `users` |
| Column Count | 4 |
| FK Count | 2 |
| Index Count | 4 |

#### withdrawal_requests

| Property | Value |
|---|---|
| Classification | Child Entity |
| Parent Tables | `branch_financial_details`, `users` |
| Column Count | 10 |
| FK Count | 3 |
| Index Count | 5 |

