# CourtZon Enterprise Database Knowledge Base

**Database:** courtzon_v3
**Version:** Production baseline (001_courtzon_v3.sql) + 73 migrations
**Storage Engine:** InnoDB (100%)
**Default Charset:** utf8mb4
**Default Collation:** utf8mb4_unicode_ci
**Export Tool:** mysqldump (MariaDB 10.4.28)
**Date:** 2026-07-28

---

## PART 1 — Complete Database Inventory

### MySQL / MariaDB Version
The dump header declares `10.4.28-MariaDB` (XAMPP distribution).

### Storage Configuration
| Property | Value |
|----------|-------|
| Storage Engine | InnoDB (all tables) |
| Default Charset | utf8mb4 |
| Default Collation | utf8mb4_unicode_ci |
| Collation Exceptions | coach_availability, coach_availability_blackouts use utf8mb4_general_ci |
| Row Format | DYNAMIC (InnoDB default) |

### Inventory Counts

#### Baseline (001_courtzon_v3.sql)
| Item | Count |
|------|-------|
| Tables | 163 |
| Views | 0 |
| Triggers | 0 |
| Stored Procedures | 0 |
| Functions | 0 |
| Events | 0 |

#### Migration-Added Tables (files 013–073)
| Item | Count |
|------|-------|
| New tables created | 116 |
| Tables modified via ALTER | 9 |
| Columns added to existing tables | 32 |

#### Aggregate Column & Constraint Counts
| Item | Count |
|------|-------|
| Total Tables | 275 |
| Total Columns (baseline) | ~1,560 |
| Total Primary Keys | 275 |
| Total Foreign Keys (baseline) | ~211 |
| Total Indexes (baseline) | ~419 |
| Total Unique Constraints (baseline) | ~87 |
| Total CHECK Constraints (baseline) | ~48 (mostly json_valid) |
| Total ENUM Columns (baseline) | ~96 |
| Total Views | 0 |
| Total Triggers | 0 |
| Total Events | 0 |
| Total Stored Procedures | 0 |
| Total Functions | 0 |

---

## PART 2 — Complete Table Inventory

### 2.1 Baseline Tables (001_courtzon_v3.sql — 163 tables)

#### `academies`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `organisation_id` int unsigned NOT NULL, `branch_id` int unsigned, `sport_id` int unsigned, `name` varchar(255) NOT NULL, `description` text, `image_url` varchar(500), `is_active` tinyint(1) NOT NULL DEFAULT 1, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_acad_org` → organisations(id) ON DELETE CASCADE; `fk_acad_branch` → branches(id) ON DELETE SET NULL; `fk_acad_sport` → sports(id) ON DELETE SET NULL
- **Indexes:** idx_org(organisation_id), fk_acad_branch(branch_id), fk_acad_sport(sport_id)

#### `academy_curriculums`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned PK AI, `academy_id` int unsigned NOT NULL, `name` varchar(255) NOT NULL, `description` text, `level_required` int unsigned, `duration_weeks` int unsigned, `price` decimal(12,2) NOT NULL DEFAULT 0.00, `currency_code` char(3) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_cur_acad` → academies(id) ON DELETE CASCADE
- **Indexes:** idx_academy(academy_id)

#### `academy_enrollments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `academy_id` int unsigned NOT NULL, `curriculum_id` int unsigned, `player_id` int unsigned NOT NULL, `status` enum('active','completed','dropped','waitlisted') NOT NULL DEFAULT 'active', `enrolled_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `completed_at` timestamp
- **PK:** `id`
- **UK:** uk_player_acad(academy_id, player_id)
- **FK:** `fk_enroll_acad` → academies(id) ON DELETE CASCADE; `fk_enroll_player` → users(id) ON DELETE CASCADE; `fk_enroll_cur` → academy_curriculums(id) ON DELETE SET NULL
- **Indexes:** idx_academy(academy_id), idx_player(player_id), fk_enroll_cur(curriculum_id)
- **ENUM:** status → 'active','completed','dropped','waitlisted'

#### `academy_enrollments_legacy` (Renamed by Migration 061)
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `academy_id` int unsigned NOT NULL, `curriculum_id` int unsigned, `player_id` int unsigned NOT NULL, `status` enum('active','completed','dropped','waitlisted') NOT NULL DEFAULT 'active', `enrolled_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `completed_at` timestamp
- **PK:** `id`
- **UK:** uk_player_acad(academy_id, player_id)
- **FK:** `fk_enroll_acad` → academies(id); `fk_enroll_player` → users(id); `fk_enroll_cur` → academy_curriculums(id)
- **Note:** Original `academy_enrollments` table renamed to `academy_enrollments_legacy` by Migration 061; new `academy_enrollments` table created with updated schema.

#### `academy_evaluations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `academy_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `evaluator_id` int unsigned NOT NULL, `skill_scores` longtext NOT NULL (JSON binary), `overall_score` decimal(5,2), `notes` text, `recommended_level_id` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_eval_acad` → academies(id) ON DELETE CASCADE; `fk_eval_evaluator` → users(id) ON DELETE CASCADE; `fk_eval_player` → users(id) ON DELETE CASCADE
- **CHECK:** json_valid(skill_scores)
- **Indexes:** idx_player(player_id), fk_eval_acad(academy_id), fk_eval_evaluator(evaluator_id)

#### `academy_session_attendance`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `session_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `status` enum('present','absent','excused') NOT NULL DEFAULT 'present', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_attendance(session_id, player_id)
- **FK:** `fk_att_player` → users(id) ON DELETE CASCADE; `fk_att_sess` → academy_sessions(id) ON DELETE CASCADE
- **ENUM:** status → 'present','absent','excused'

#### `academy_sessions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `academy_id` int unsigned NOT NULL, `curriculum_id` int unsigned, `coach_id` int unsigned, `resource_id` int unsigned, `title` varchar(255) NOT NULL, `description` text, `start_time` datetime NOT NULL, `end_time` datetime NOT NULL, `max_participants` int unsigned NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_sess_acad` → academies(id) ON DELETE CASCADE; `fk_sess_coach` → users(id) ON DELETE SET NULL; `fk_sess_cur` → academy_curriculums(id) ON DELETE SET NULL; `fk_sess_resource` → resources(id) ON DELETE SET NULL
- **Indexes:** idx_academy(academy_id), idx_coach(coach_id), idx_dates(start_time,end_time), fk_sess_cur(curriculum_id), fk_sess_resource(resource_id)

#### `activity_logs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned PK AI, `user_id` int unsigned, `activity_type` varchar(100) NOT NULL, `description` varchar(500), `metadata` longtext (JSON binary), `ip_address` varchar(45), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(metadata)
- **Indexes:** idx_user(user_id), idx_type(activity_type), idx_created(created_at), idx_activities_feed(user_id,created_at)

#### `ad_campaigns`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (15):** `id` int unsigned PK AI, `name` varchar(255) NOT NULL, `organisation_id` int unsigned, `placement_id` int unsigned NOT NULL, `start_date` datetime NOT NULL, `end_date` datetime NOT NULL, `daily_budget` decimal(12,2), `total_budget` decimal(12,2), `currency_code` char(3) NOT NULL, `status` enum('draft','active','paused','ended','cancelled') NOT NULL DEFAULT 'draft', `max_impressions` int unsigned, `max_clicks` int unsigned, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_camp_org` → organisations(id) ON DELETE SET NULL; `fk_camp_creator` → users(id); `fk_camp_placement` → ad_placements(id)
- **Indexes:** idx_placement(placement_id), idx_status(status), idx_dates(start_date,end_date), fk_camp_org(organisation_id), fk_camp_creator(created_by)
- **ENUM:** status → 'draft','active','paused','ended','cancelled'

#### `ad_clicks`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned PK AI, `impression_id` bigint unsigned NOT NULL, `campaign_id` int unsigned NOT NULL, `creative_id` int unsigned, `user_id` int unsigned, `clicked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `cost` decimal(12,8)
- **PK:** `id`
- **FK:** `fk_click_camp` → ad_campaigns(id) ON DELETE CASCADE; `fk_click_imp` → ad_impressions(id) ON DELETE CASCADE
- **Indexes:** idx_impression(impression_id), idx_campaign(campaign_id)

#### `ad_creatives`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned PK AI, `campaign_id` int unsigned NOT NULL, `image_url` varchar(500) NOT NULL, `click_url` varchar(500), `alt_text` varchar(255), `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_creative_camp` → ad_campaigns(id) ON DELETE CASCADE
- **Indexes:** idx_campaign(campaign_id)

#### `ad_impressions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` bigint unsigned PK AI, `campaign_id` int unsigned NOT NULL, `creative_id` int unsigned, `user_id` int unsigned, `placement_key` varchar(100), `ip_address` varchar(45), `user_agent` text, `served_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `cost` decimal(12,8)
- **PK:** `id`
- **FK:** `fk_imp_camp` → ad_campaigns(id) ON DELETE CASCADE
- **Indexes:** idx_campaign(campaign_id), idx_creative(creative_id), idx_user(user_id), idx_served(served_at)

#### `ad_placements`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned PK AI, `placement_key` varchar(100) NOT NULL, `name` varchar(255) NOT NULL, `description` text, `dimensions` varchar(50), `max_ads` int NOT NULL DEFAULT 1, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** placement_key(placement_key)

#### `ad_pricing`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `placement_id` int unsigned NOT NULL, `pricing_model` enum('cpm','cpc','flat') NOT NULL, `price` decimal(12,2) NOT NULL, `currency_code` char(3) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `valid_from` datetime, `valid_until` datetime, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_price_placement` → ad_placements(id) ON DELETE CASCADE
- **Indexes:** idx_placement(placement_id)
- **ENUM:** pricing_model → 'cpm','cpc','flat'

#### `ad_targeting_rules`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `campaign_id` int unsigned NOT NULL, `countries` longtext (JSON), `sports` longtext (JSON), `player_levels` longtext (JSON), `age_min` int unsigned, `age_max` int unsigned, `gender` enum('male','female','all') NOT NULL DEFAULT 'all', `user_types` longtext (JSON), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** campaign_id(campaign_id)
- **FK:** `fk_target_camp` → ad_campaigns(id) ON DELETE CASCADE
- **CHECK:** json_valid(countries), json_valid(sports), json_valid(player_levels), json_valid(user_types)
- **ENUM:** gender → 'male','female','all'

#### `amenities`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 21
- **Columns (9):** `id` int unsigned PK AI, `name_en` varchar(255) NOT NULL, `name_ar` varchar(255), `icon` varchar(255), `category` enum('facilities','equipment','accessibility','convenience','services') NOT NULL, `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** category → 'facilities','equipment','accessibility','convenience','services'
- **Indexes:** idx_category(category), idx_active(is_active)

#### `announcement_comments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `announcement_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `parent_id` int unsigned, `content` text NOT NULL, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_comment_announce` → announcements(id) ON DELETE CASCADE; `fk_comment_parent` → announcement_comments(id) ON DELETE SET NULL; `fk_comment_user` → users(id) ON DELETE CASCADE
- **Indexes:** idx_announcement(announcement_id), fk_comment_user(user_id), fk_comment_parent(parent_id)

#### `announcement_likes`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `id` int unsigned PK AI, `announcement_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_like(announcement_id, user_id)
- **FK:** `fk_like_announce` → announcements(id) ON DELETE CASCADE; `fk_like_user` → users(id) ON DELETE CASCADE

#### `announcements`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `organisation_id` int unsigned, `content` text NOT NULL, `images` longtext (JSON), `is_pinned` tinyint(1) NOT NULL DEFAULT 0, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_announce_org` → organisations(id) ON DELETE SET NULL; `fk_announce_user` → users(id) ON DELETE CASCADE
- **CHECK:** json_valid(images)
- **Indexes:** idx_user(user_id), idx_org(organisation_id)

#### `app_settings`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 15
- **Columns (6):** `id` int unsigned PK AI, `setting_key` varchar(100) NOT NULL, `value` longtext NOT NULL (JSON binary), `updated_by` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** setting_key(setting_key)
- **FK:** `fk_app_settings_user` → users(id) ON DELETE SET NULL
- **CHECK:** json_valid(value)

#### `audit_logs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` bigint unsigned PK AI, `actor_id` int unsigned, `action` varchar(100) NOT NULL, `entity_type` varchar(100) NOT NULL, `entity_id` int unsigned NOT NULL, `before_state` longtext (JSON), `after_state` longtext (JSON), `reason` text, `ip_address` varchar(45), `user_agent` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(before_state), json_valid(after_state)
- **Indexes:** idx_actor(actor_id), idx_entity(entity_type,entity_id), idx_action(action), idx_created(created_at), idx_audit_entity(entity_type,entity_id,created_at), idx_audit_logs_entity_action_created(entity_type,action,created_at)

#### `bank_branches`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned PK AI, `bank_id` int unsigned NOT NULL, `name` varchar(255) NOT NULL, `address` varchar(500), `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` int NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_bb_bank` → banks(id) ON DELETE CASCADE
- **Indexes:** idx_bb_bank(bank_id)

#### `banks`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `country_id` smallint unsigned NOT NULL, `name` varchar(255) NOT NULL, `swift` varchar(20), `slug` varchar(100), `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` int NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_banks_country` → countries(id)
- **Indexes:** idx_banks_country(country_id)

#### `booking_cancellations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` bigint unsigned PK AI, `booking_id` bigint unsigned NOT NULL, `cancelled_by` int unsigned, `reason` varchar(500), `refund_amount` decimal(12,2) DEFAULT 0.00, `refund_status` enum('pending','processed','skipped') DEFAULT 'pending', `processed_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** booking_id(booking_id)
- **ENUM:** refund_status → 'pending','processed','skipped'
- **Indexes:** idx_booking(booking_id)

#### `booking_intents`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (20):** `id` bigint unsigned PK AI, `user_id` int unsigned NOT NULL, `branch_id` int unsigned, `organisation_id` int unsigned, `resource_id` int unsigned, `booking_type` enum('public_match','private_match','academy','clinic','coach_session') NOT NULL, `booking_date` date NOT NULL, `business_date` date, `start_time` time NOT NULL, `end_time` time NOT NULL, `start_at_utc` datetime NOT NULL, `end_at_utc` datetime NOT NULL, `total_amount` decimal(12,2) NOT NULL, `commission_amount` decimal(12,2) DEFAULT 0.00, `club_amount` decimal(12,2) DEFAULT 0.00, `payment_method` varchar(50), `notes` text, `matchmaking` longtext (JSON), `participants` longtext (JSON), `expires_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 15 MINUTE), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(matchmaking), json_valid(participants)
- **ENUM:** booking_type → 'public_match','private_match','academy','clinic','coach_session'
- **Indexes:** idx_expires(expires_at), idx_booking_intents_user(user_id), idx_booking_intents_resource_date(resource_id,booking_date), idx_booking_intents_start_at_utc(start_at_utc), idx_booking_intents_business_date(business_date)

#### `booking_invitations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` bigint unsigned PK AI, `booking_id` bigint unsigned NOT NULL, `invited_user_id` int unsigned, `email` varchar(255), `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending', `token` varchar(255) NOT NULL, `responded_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** token(token)
- **ENUM:** status → 'pending','accepted','declined'
- **Indexes:** idx_booking(booking_id)

#### `booking_matchmaking_requests`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` bigint unsigned PK AI, `booking_id` bigint unsigned NOT NULL, `min_age` int unsigned, `max_age` int unsigned, `target_gender` enum('male','female','any') NOT NULL DEFAULT 'any', `target_level_id` int unsigned, `max_players` int unsigned NOT NULL DEFAULT 2, `deadline` datetime, `auto_apply` tinyint(1) NOT NULL DEFAULT 1, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** booking_id(booking_id)
- **FK:** `booking_matchmaking_requests_ibfk_1` → bookings(id) ON DELETE CASCADE; `booking_matchmaking_requests_ibfk_2` → player_levels(id) ON DELETE SET NULL
- **ENUM:** target_gender → 'male','female','any'
- **Indexes:** idx_booking(booking_id), idx_active(is_active), target_level_id(target_level_id)

#### `booking_participants`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned PK AI, `booking_id` bigint unsigned NOT NULL, `user_id` int unsigned, `full_name` varchar(255) NOT NULL, `email` varchar(255) NOT NULL, `phone` varchar(20), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** idx_booking(booking_id)

#### `booking_slots`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` bigint unsigned PK AI, `booking_id` bigint unsigned, `resource_id` int unsigned NOT NULL, `booking_date` date NOT NULL, `slot_start` time NOT NULL, `slot_end` time NOT NULL, `is_available` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_slot(resource_id,booking_date,slot_start)
- **Indexes:** idx_booking(booking_id)

#### `bookings`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (30):** `id` bigint unsigned PK AI, `public_id` char(36) NOT NULL, `user_id` int unsigned NOT NULL, `organisation_id` int unsigned, `resource_id` int unsigned, `branch_id` int unsigned, `booking_type` enum('public_match','private_match','academy','clinic','coach_session') NOT NULL, `visibility` enum('public','private') NOT NULL DEFAULT 'public', `start_at_utc` datetime NOT NULL, `end_at_utc` datetime NOT NULL, `booking_date` date NOT NULL, `business_date` date, `start_time` time NOT NULL, `end_time` time NOT NULL, `total_amount` decimal(12,2) NOT NULL, `commission_rate` decimal(5,2), `commission_amount` decimal(12,2) DEFAULT 0.00, `net_amount` decimal(12,2) DEFAULT 0.00, `plan_name` varchar(255), `club_amount` decimal(12,2) DEFAULT 0.00, `payment_status` enum('pending','paid','refunded','partially_refunded','failed','penalty') NOT NULL DEFAULT 'pending', `payment_method` varchar(50), `booking_status` enum('pending','pending_payment','confirmed','cancelled','completed','expired','checked_in','no_show') NOT NULL DEFAULT 'pending', `cancellation_policy_snapshot` longtext (JSON), `notes` text, `expires_at` timestamp, `version` int unsigned NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_booking_branch` → branches(id) ON DELETE SET NULL
- **CHECK:** json_valid(cancellation_policy_snapshot)
- **ENUM:** booking_type → 'public_match','private_match','academy','clinic','coach_session'; visibility → 'public','private'; payment_status → 'pending','paid','refunded','partially_refunded','failed','penalty'; booking_status → 'pending','pending_payment','confirmed','cancelled','completed','expired','checked_in','no_show'
- **Indexes:** idx_user(user_id), idx_date(booking_date), idx_status(booking_status,payment_status), idx_organisation(organisation_id), idx_resource(resource_id), idx_branch(branch_id), idx_bookings_org_resource(organisation_id,resource_id,booking_date,booking_status), idx_bookings_start_at_utc(start_at_utc), idx_bookings_business_date(business_date)

#### `branch_amenity_assignments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` bigint unsigned PK AI, `branch_id` int unsigned NOT NULL, `amenity_id` int unsigned NOT NULL, `value` varchar(255), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_branch_amenity(branch_id, amenity_id)
- **Indexes:** idx_amenity(amenity_id), idx_branch(branch_id)

#### `branch_financial_details`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (16):** `id` int unsigned PK AI, `branch_id` int unsigned NOT NULL, `bank_id` int unsigned, `bank_branch_id` int unsigned, `bank_name` varchar(255), `bank_account_name` varchar(255), `bank_account_number` varchar(100), `iban` varchar(34), `swift` varchar(20), `billing_address` text, `billing_email` varchar(255), `payout_schedule` enum('daily','weekly','biweekly','monthly') DEFAULT 'monthly', `currency_id` smallint unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_bfd_branch(branch_id)
- **FK:** `fk_bfd_branch` → branches(id) ON DELETE CASCADE
- **ENUM:** payout_schedule → 'daily','weekly','biweekly','monthly'
- **Indexes:** idx_bfd_bank(bank_id), idx_bfd_bank_branch(bank_branch_id)

#### `branch_player_access`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `branch_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `status` enum('pending','approved','rejected','banned') NOT NULL DEFAULT 'pending', `reviewed_by` int unsigned, `review_note` text, `reviewed_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_player_branch(player_id, branch_id)
- **FK:** `fk_access_branch` → branches(id) ON DELETE CASCADE; `fk_access_player` → users(id) ON DELETE CASCADE; `fk_access_reviewer` → users(id) ON DELETE SET NULL
- **ENUM:** status → 'pending','approved','rejected','banned'
- **Indexes:** fk_access_branch(branch_id), fk_access_reviewer(reviewed_by)

#### `branch_unavailability`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `branch_id` int unsigned NOT NULL, `start_date` date NOT NULL, `end_date` date NOT NULL, `start_time` time, `end_time` time, `reason` varchar(500), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_unavail_branch` → branches(id) ON DELETE CASCADE
- **Indexes:** idx_branch_date(branch_id,start_date,end_date)

#### `branches`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (29):** `id` int unsigned PK AI, `public_id` char(36) NOT NULL, `organisation_id` int unsigned NOT NULL, `name` varchar(255) NOT NULL, `slug` varchar(255), `description` text, `email` varchar(255), `phone` varchar(50), `address_line1` varchar(255), `address_line2` varchar(255), `city` varchar(100), `state` varchar(100), `country_id` smallint unsigned, `postal_code` varchar(20), `latitude` decimal(10,7), `longitude` decimal(10,7), `access_type` enum('open','restricted','invite_only') NOT NULL DEFAULT 'open', `is_active` tinyint(1) NOT NULL DEFAULT 1, `rating_avg` decimal(3,2) DEFAULT 0.00, `rating_count` int unsigned DEFAULT 0, `images` longtext (JSON), `currency_id` tinyint unsigned, `timezone` varchar(50) DEFAULT 'UTC', `opening_time` time, `closing_time` time, `version` int unsigned NOT NULL DEFAULT 1, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** public_id(public_id)
- **FK:** `fk_branch_org` → organisations(id) ON DELETE CASCADE; `fk_branch_currency` → currencies(id) ON DELETE SET NULL
- **CHECK:** json_valid(images)
- **ENUM:** access_type → 'open','restricted','invite_only'
- **Indexes:** idx_org(organisation_id), idx_active(is_active), idx_location(latitude,longitude), fk_branch_currency(currency_id)

#### `brands`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `name` varchar(255) NOT NULL, `slug` varchar(255) NOT NULL, `description` text, `logo_url` varchar(500), `website` varchar(255), `country` varchar(100), `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** slug(slug)

#### `cancellation_policies`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned PK AI, `branch_id` int unsigned, `organisation_id` int unsigned, `cancellation_window_minutes` int NOT NULL, `refund_percent` decimal(5,2) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_cp_branch` → branches(id) ON DELETE CASCADE
- **Indexes:** idx_organisation(organisation_id), idx_branch(branch_id)

#### `cart_items`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `product_id` int unsigned NOT NULL, `variant_id` int unsigned, `quantity` int unsigned NOT NULL DEFAULT 1, `reserved_until` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_user_product_cart(user_id, product_id, variant_id)
- **FK:** `fk_cart_product` → products(id) ON DELETE CASCADE; `fk_cart_user` → users(id) ON DELETE CASCADE
- **Indexes:** idx_reserved(reserved_until), fk_cart_product(product_id)

#### `cities`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned PK AI, `province_id` int unsigned NOT NULL, `name` varchar(255) NOT NULL, `slug` varchar(255), `native_name` varchar(255), `type` enum('city','district','town','village','neighborhood') NOT NULL DEFAULT 'city', `navigation_polygon` longtext (JSON), `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_cities_slug(province_id, slug)
- **FK:** `fk_city_province` → provinces(id) ON DELETE CASCADE
- **CHECK:** json_valid(navigation_polygon)
- **ENUM:** type → 'city','district','town','village','neighborhood'
- **Indexes:** idx_cities_province(province_id)

#### `cms_blogs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `slug` varchar(255) NOT NULL, `title` varchar(255) NOT NULL, `excerpt` text, `content` longtext, `cover_image` varchar(500), `author_id` int unsigned, `is_published` tinyint(1) NOT NULL DEFAULT 0, `published_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** slug(slug)
- **FK:** `fk_blog_author` → users(id) ON DELETE SET NULL
- **Indexes:** idx_author(author_id), idx_published(is_published,published_at)

#### `cms_contact_submission_attachments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `submission_id` int unsigned NOT NULL, `upload_id` int unsigned NOT NULL, `sort_order` int NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_contact_attach_submission` → cms_contact_submissions(id) ON DELETE CASCADE; `fk_contact_attach_upload` → uploads(id) ON DELETE CASCADE
- **Indexes:** fk_contact_attach_upload(upload_id), idx_contact_attach_submission(submission_id)

#### `cms_contact_submissions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned PK AI, `name` varchar(255) NOT NULL, `email` varchar(255) NOT NULL, `country_id` smallint unsigned, `phone` varchar(50), `subject` varchar(255), `subject_other` varchar(255), `message` text NOT NULL, `referral_source` varchar(255), `referral_other` varchar(255), `is_read` tinyint(1) NOT NULL DEFAULT 0, `email_sent_at` timestamp, `email_error` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** idx_contact_country(country_id)

#### `cms_media`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned PK AI, `filename` varchar(255) NOT NULL, `original_name` varchar(255), `mime_type` varchar(100), `size_bytes` int unsigned, `width` int unsigned, `height` int unsigned, `media_type` varchar(50), `category` varchar(50), `alt_text` varchar(500), `url` varchar(500), `thumbnail_url` varchar(500), `medium_url` varchar(500), `uploaded_by` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_media_uploader` → users(id) ON DELETE SET NULL
- **Indexes:** idx_media_type(media_type), idx_category(category), fk_media_uploader(uploaded_by)

#### `cms_pages`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 4
- **Columns (14):** `id` int unsigned PK AI, `slug` varchar(255) NOT NULL, `title` varchar(255) NOT NULL, `content` longtext, `meta_title` varchar(255), `meta_description` text, `is_homepage` tinyint(1) NOT NULL DEFAULT 0, `page_template` varchar(100), `sort_order` int NOT NULL DEFAULT 0, `is_published` tinyint(1) NOT NULL DEFAULT 0, `published_at` timestamp, `created_by` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** slug(slug)

#### `cms_section_blocks`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 3
- **Columns (11):** `id` int unsigned PK AI, `page_id` int unsigned NOT NULL, `block_type` varchar(50) NOT NULL, `block_key` varchar(100), `title` varchar(255), `subtitle` varchar(500), `content` longtext (JSON), `style_config` longtext (JSON), `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_block_page` → cms_pages(id) ON DELETE CASCADE
- **Indexes:** idx_page_order(page_id,sort_order)

#### `cms_sections`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `page_id` int unsigned NOT NULL, `section_key` varchar(100) NOT NULL, `title` varchar(255), `content` longtext, `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_page_section(page_id, section_key)
- **FK:** `fk_section_page` → cms_pages(id) ON DELETE CASCADE
- **Indexes:** idx_page(page_id)

#### `coach_availability`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_general_ci
- **Columns (8):** `id` int unsigned PK AI, `coach_id` int unsigned NOT NULL, `branch_id` int unsigned, `day_of_week` tinyint unsigned NOT NULL, `start_time` time NOT NULL, `end_time` time NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_coach_avail_coach` → coach_profiles(id) ON DELETE CASCADE; `fk_coach_avail_branch` → branches(id) ON DELETE CASCADE
- **Indexes:** idx_coach_avail_coach(coach_id,day_of_week), idx_coach_avail_branch(branch_id)

#### `coach_availability_blackouts`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_general_ci
- **Columns (5):** `id` int unsigned PK AI, `coach_id` int unsigned NOT NULL, `blackout_date` date NOT NULL, `reason` varchar(500), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_coach_blackout(coach_id, blackout_date)
- **FK:** `fk_coach_blackout_coach` → coach_profiles(id) ON DELETE CASCADE

#### `coach_org_agreements`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `coach_id` int unsigned NOT NULL, `organisation_id` int unsigned NOT NULL, `coach_split_pct` decimal(5,2) DEFAULT 50.00, `org_split_pct` decimal(5,2) DEFAULT 50.00, `is_active` tinyint(1) NOT NULL DEFAULT 1, `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending', `initiated_by` enum('coach','org') NOT NULL, `invited_by` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_coach_org(coach_id, organisation_id)
- **FK:** `fk_agr_coach` → coach_profiles(id) ON DELETE CASCADE; `fk_agr_org` → organisations(id) ON DELETE CASCADE
- **ENUM:** status → 'pending','accepted','rejected'; initiated_by → 'coach','org'
- **Indexes:** fk_agr_org(organisation_id)

#### `coach_profiles`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (18):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `bio` text, `experience_years` int unsigned, `certifications` longtext (JSON), `sports` longtext (JSON), `hourly_rate` decimal(12,2) DEFAULT 0.00, `currency_code` char(3) NOT NULL, `rating_avg` decimal(3,2) DEFAULT 0.00, `rating_count` int unsigned DEFAULT 0, `is_available` tinyint(1) NOT NULL DEFAULT 1, `is_verified` tinyint(1) NOT NULL DEFAULT 0, `status` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none', `rejected_reason` varchar(500), `session_durations` longtext (JSON), `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** user_id(user_id)
- **FK:** `fk_coach_user` → users(id) ON DELETE CASCADE
- **CHECK:** json_valid(certifications), json_valid(sports), json_valid(session_durations)
- **ENUM:** status → 'none','pending','approved','rejected'
- **Indexes:** idx_coach_profiles_status(status)

#### `coach_reviews`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `coach_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `session_id` int unsigned, `rating` decimal(2,1) NOT NULL, `review_text` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_review(coach_id, player_id, session_id)
- **FK:** `fk_cr_coach` → coach_profiles(id) ON DELETE CASCADE; `fk_cr_player` → users(id) ON DELETE CASCADE; `fk_cr_session` → coach_sessions(id) ON DELETE SET NULL
- **CHECK:** rating between 1 and 5
- **Indexes:** idx_coach(coach_id), fk_cr_player(player_id), fk_cr_session(session_id)

#### `coach_sessions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (17):** `id` int unsigned PK AI, `coach_id` int unsigned NOT NULL, `organisation_id` int unsigned, `branch_id` int unsigned, `resource_id` int unsigned, `booking_id` bigint unsigned, `player_id` int unsigned NOT NULL, `start_time` datetime NOT NULL, `end_time` datetime NOT NULL, `price` decimal(12,2) NOT NULL, `currency_code` char(3) NOT NULL, `platform_commission_pct` decimal(5,2) DEFAULT 0.00, `coach_earnings` decimal(12,2) DEFAULT 0.00, `org_earnings` decimal(12,2) DEFAULT 0.00, `status` enum('pending_court','pending_acceptance','scheduled','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'pending_court', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_cs_coach` → coach_profiles(id) ON DELETE CASCADE; `fk_cs_player` → users(id); `fk_cs_org` → organisations(id) ON DELETE SET NULL; `fk_cs_branch` → branches(id) ON DELETE SET NULL; `fk_cs_resource` → resources(id) ON DELETE SET NULL; `fk_cs_booking` → bookings(id) ON DELETE SET NULL
- **ENUM:** status → 'pending_court','pending_acceptance','scheduled','confirmed','in_progress','completed','cancelled','no_show'
- **Indexes:** idx_coach(coach_id), idx_player(player_id), idx_dates(start_time,end_time), fk_cs_org(organisation_id), fk_cs_branch(branch_id), fk_cs_resource(resource_id), idx_cs_booking(booking_id)

#### `commission_rules`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` bigint unsigned PK AI, `rule_name` varchar(255) NOT NULL, `rule_type` enum('percentage','fixed') NOT NULL, `amount` decimal(12,2) NOT NULL, `applicable_entity` varchar(100), `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** rule_type → 'percentage','fixed'

#### `community_event_participants`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `event_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `status` enum('going','maybe','declined') NOT NULL DEFAULT 'going', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_event_user(event_id, user_id)
- **FK:** `fk_cep_event` → community_events(id) ON DELETE CASCADE; `fk_cep_user` → users(id) ON DELETE CASCADE
- **ENUM:** status → 'going','maybe','declined'

#### `community_events`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (15):** `id` int unsigned PK AI, `creator_id` int unsigned NOT NULL, `organisation_id` int unsigned, `branch_id` int unsigned, `resource_id` int unsigned, `title` varchar(255) NOT NULL, `description` text, `event_type` enum('match','training','social','tournament','other') NOT NULL, `start_time` datetime NOT NULL, `end_time` datetime NOT NULL, `max_participants` int unsigned NOT NULL DEFAULT 1, `is_public` tinyint(1) NOT NULL DEFAULT 1, `status` enum('active','cancelled','completed') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_event_creator` → users(id); `fk_event_org` → organisations(id) ON DELETE SET NULL; `fk_event_branch` → branches(id) ON DELETE SET NULL
- **ENUM:** event_type → 'match','training','social','tournament','other'; status → 'active','cancelled','completed'
- **Indexes:** idx_creator(creator_id), idx_dates(start_time,end_time), fk_event_org(organisation_id), fk_event_branch(branch_id)

#### `community_tournaments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (16):** `id` int unsigned PK AI, `creator_id` int unsigned NOT NULL, `organisation_id` int unsigned, `branch_id` int unsigned, `sport_id` int unsigned, `name` varchar(255) NOT NULL, `description` text, `bracket_type_id` int unsigned, `max_participants` int unsigned NOT NULL DEFAULT 1, `entry_fee` decimal(12,2) DEFAULT 0.00, `currency_code` char(3) NOT NULL, `start_date` datetime NOT NULL, `end_date` datetime NOT NULL, `status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_ct_creator` → users(id); `fk_ct_org` → organisations(id) ON DELETE SET NULL; `fk_ct_branch` → branches(id) ON DELETE SET NULL; `fk_ct_sport` → sports(id) ON DELETE SET NULL; `fk_ct_bracket` → tournament_bracket_types(id)
- **ENUM:** status → 'open','in_progress','completed','cancelled'
- **Indexes:** fk_ct_creator(creator_id), fk_ct_org(organisation_id), fk_ct_branch(branch_id), fk_ct_sport(sport_id), fk_ct_bracket(bracket_type_id)

#### `conversation_participants`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `conversation_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `last_read_at` timestamp, `is_muted` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_convo_user(conversation_id, user_id)
- **FK:** `fk_cp_convo` → conversations(id) ON DELETE CASCADE; `fk_cp_user` → users(id) ON DELETE CASCADE

#### `conversations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `conversation_type` enum('direct','group') NOT NULL, `name` varchar(255), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** conversation_type → 'direct','group'

#### `countries`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (18):** `id` smallint unsigned PK AI, `iso_code` char(2) NOT NULL, `iso_code_3` char(3), `name` varchar(255) NOT NULL, `slug` varchar(255) NOT NULL, `native_name` varchar(255), `phone_code` varchar(10) NOT NULL, `phone_max_length` tinyint unsigned, `phone_min_length` tinyint unsigned, `default_locale` varchar(10), `default_currency` char(3), `currency_symbol` varchar(10), `currency_decimal_places` tinyint unsigned, `currency_name` varchar(100), `flag_emoji` varchar(10), `navigation_polygon` longtext (JSON), `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** iso_code(iso_code), iso_code_3(iso_code_3), uq_countries_slug(slug)
- **FK:** `fk_country_currency` → currencies(code) ON DELETE SET NULL
- **CHECK:** json_valid(navigation_polygon)
- **Indexes:** fk_country_currency(default_currency)

#### `coupon_assignments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `coupon_id` int unsigned NOT NULL, `entity_type` enum('organisation','branch','resource') NOT NULL, `entity_id` int unsigned NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_coupon_entity(coupon_id, entity_type, entity_id)
- **FK:** `fk_ca_coupon` → coupons(id) ON DELETE CASCADE
- **ENUM:** entity_type → 'organisation','branch','resource'
- **Indexes:** idx_ca_entity(entity_type,entity_id), idx_ca_active(is_active)

#### `coupon_usage`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `coupon_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `order_id` int unsigned, `used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_cu_coupon` → coupons(id) ON DELETE CASCADE; `fk_cu_user` → users(id) ON DELETE CASCADE
- **Indexes:** idx_coupon(coupon_id), idx_user(user_id)

#### `coupons`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned PK AI, `code` varchar(50) NOT NULL, `discount_type` enum('percentage','fixed') NOT NULL, `discount_value` decimal(12,2) NOT NULL, `activity_type` varchar(100), `sport_id` int unsigned, `min_order_amount` decimal(12,2) DEFAULT 0.00, `max_uses` int unsigned, `max_uses_per_user` int unsigned, `starts_at` datetime NOT NULL, `expires_at` datetime NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** code(code)
- **ENUM:** discount_type → 'percentage','fixed'
- **Indexes:** idx_code(code), idx_active(is_active,expires_at), idx_coupon_activity(activity_type), idx_coupon_sport(sport_id)

#### `cron_jobs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `job_name` varchar(100) NOT NULL, `handler` varchar(255) NOT NULL, `cron_expression` varchar(100) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `last_run_at` timestamp, `last_error` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** job_name(job_name)

#### `currencies`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` tinyint unsigned PK AI, `code` char(3) NOT NULL, `name` varchar(100) NOT NULL, `symbol` varchar(10), `decimal_places` tinyint unsigned NOT NULL DEFAULT 2, `sort_order` int NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** code(code)

#### `design_theme_reset_baseline`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` tinyint unsigned NOT NULL DEFAULT 1, `label` varchar(255), `snapshot` longtext (JSON), `saved_by` int unsigned, `saved_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(snapshot)

#### `design_token_versions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `label` varchar(255), `snapshot` longtext (JSON), `published_by` int unsigned, `published_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(snapshot)
- **Indexes:** idx_dtv_published_at(published_at)

#### `design_tokens`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 160
- **Columns (14):** `id` int unsigned PK AI, `token_key` varchar(255) NOT NULL, `token_type` enum('color','size','radius','font','shadow','spacing','other') NOT NULL, `default_value` varchar(500), `current_value` varchar(500), `category` varchar(100), `description` text, `updated_by` int unsigned, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `draft_value` varchar(500), `is_published` tinyint(1) NOT NULL DEFAULT 0, `role_editable` tinyint(1) NOT NULL DEFAULT 1, `current_value_dark` varchar(500), `draft_value_dark` varchar(500), `created_at`
- **PK:** `id`
- **UK:** token_key(token_key)
- **ENUM:** token_type → 'color','size','radius','font','shadow','spacing','other'

#### `email_verification_tokens`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `token` varchar(255) NOT NULL, `expires_at` timestamp NOT NULL, `is_used` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** token(token)
- **FK:** `fk_email_ver_user` → users(id) ON DELETE CASCADE
- **Indexes:** idx_user(user_id)

#### `exchange_rates`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `from_currency` char(3) NOT NULL, `to_currency` char(3) NOT NULL, `rate` decimal(18,8) NOT NULL, `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(), `source` varchar(50) DEFAULT 'manual'
- **PK:** `id`
- **UK:** uk_rate(from_currency,to_currency,recorded_at)

#### `feature_flags`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `flag_key` varchar(100) NOT NULL, `label` varchar(255) NOT NULL, `description` text DEFAULT NULL, `module` varchar(50) NOT NULL DEFAULT 'general', `is_enabled` tinyint(1) NOT NULL DEFAULT 1, `is_system` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** flag_key(flag_key)

#### `financial_journal_entries`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `entry_type` varchar(100) DEFAULT NULL, `reference_type` varchar(100) DEFAULT NULL, `reference_id` bigint(20) unsigned DEFAULT NULL, `debit_account` varchar(100) DEFAULT NULL, `credit_account` varchar(100) DEFAULT NULL, `amount` decimal(14,2) DEFAULT NULL, `description` text DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **Indexes:** idx_reference(reference_type,reference_id)

#### `holidays`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `owner_type` enum('organisation','branch','resource') NOT NULL, `owner_id` int(10) unsigned NOT NULL, `name` varchar(200) NOT NULL, `date_from` date NOT NULL, `date_to` date NOT NULL, `is_recurring` tinyint(1) NOT NULL DEFAULT 0, `is_open_modified` tinyint(1) NOT NULL DEFAULT 0, `open_time` time DEFAULT NULL, `close_time` time DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **ENUM:** owner_type → 'organisation','branch','resource'
- **Indexes:** idx_holiday_owner(owner_type,owner_id), idx_holiday_dates(date_from,date_to)

#### `inventory_logs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `variant_id` int(10) unsigned NOT NULL, `movement_type` enum('in','out','adjustment','reservation','release','return') NOT NULL, `quantity` int(11) NOT NULL, `stock_before` int(10) unsigned NOT NULL DEFAULT 0, `stock_after` int(10) unsigned NOT NULL DEFAULT 0, `reason` varchar(500) DEFAULT NULL, `reference_type` varchar(50) DEFAULT NULL, `reference_id` int(10) unsigned DEFAULT NULL, `created_by` int(10) unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_il_user` → users(id) ON DELETE SET NULL; `fk_il_variant` → product_variants(id) ON DELETE CASCADE
- **ENUM:** movement_type → 'in','out','adjustment','reservation','release','return'
- **Indexes:** idx_il_variant(variant_id), idx_il_created(created_at), idx_il_reference(reference_type,reference_id), fk_il_user(created_by)

#### `languages`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT, `code` varchar(5) NOT NULL, `name` varchar(50) NOT NULL, `native_name` varchar(50) NOT NULL, `is_rtl` tinyint(1) NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** code(code)

#### `marketplace_ledger_entries`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `order_id` int(10) unsigned NOT NULL, `order_item_id` int(10) unsigned DEFAULT NULL, `branch_id` int(10) unsigned DEFAULT NULL, `organisation_id` int(10) unsigned NOT NULL, `entry_type` enum('inventory_deduction','due_to_collect','due_to_transfer','due_to_courtzon','reversal','refund') NOT NULL, `payment_method` enum('cod','online') DEFAULT NULL, `amount` decimal(14,2) NOT NULL DEFAULT 0.00, `currency_code` char(3) NOT NULL DEFAULT 'EGP', `description` text DEFAULT NULL, `metadata` longtext DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_mle_branch` → branches(id) ON DELETE CASCADE; `fk_mle_order` → orders(id) ON DELETE CASCADE; `fk_mle_org` → organisations(id) ON DELETE CASCADE
- **CHECK:** json_valid(`metadata`)
- **ENUM:** entry_type → 'inventory_deduction','due_to_collect','due_to_transfer','due_to_courtzon','reversal','refund'; payment_method → 'cod','online'
- **Indexes:** idx_mle_order(order_id), idx_mle_branch(branch_id), idx_mle_org(organisation_id), idx_mle_type(entry_type), idx_mle_org_type_amount(organisation_id,entry_type,amount), idx_mle_org_created(organisation_id,created_at)

#### `media_uploads`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `owner_type` varchar(50) NOT NULL, `owner_id` int(10) unsigned NOT NULL, `file_url` varchar(500) NOT NULL, `file_type` varchar(50) NOT NULL, `file_size` int(10) unsigned NOT NULL, `file_name` varchar(255) DEFAULT NULL, `alt_text` varchar(255) DEFAULT NULL, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `uploaded_by` int(10) unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **Indexes:** idx_owner(owner_type,owner_id), idx_uploader(uploaded_by)

#### `messages`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `conversation_id` int(10) unsigned NOT NULL, `sender_id` int(10) unsigned NOT NULL, `message_type` enum('text','image','file','system') NOT NULL DEFAULT 'text', `content` text NOT NULL, `metadata` longtext DEFAULT NULL, `is_edited` tinyint(1) NOT NULL DEFAULT 0, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_msg_convo` → conversations(id) ON DELETE CASCADE; `fk_msg_sender` → users(id) ON DELETE CASCADE
- **CHECK:** json_valid(`metadata`)
- **ENUM:** message_type → 'text','image','file','system'
- **Indexes:** idx_conversation(conversation_id), idx_sender(sender_id), idx_created(created_at)

#### `migration_history`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(11) NOT NULL AUTO_INCREMENT, `filename` varchar(255) NOT NULL, `hash` varchar(64) NOT NULL, `applied_at` timestamp NOT NULL DEFAULT current_timestamp(), `execution_ms` int(11) DEFAULT 0
- **PK:** `id`
- **UK:** uk_filename(filename)

#### `notification_actions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `id` int unsigned NOT NULL AUTO_INCREMENT, `action_key` varchar(100) NOT NULL, `route_pattern` varchar(255) DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** action_key(`action_key`)

#### `notification_categories`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(50) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** slug(`slug`)

#### `notification_queue`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` bigint unsigned NOT NULL AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `notification_id` bigint unsigned DEFAULT NULL, `channel` enum('push','email','sms','in_app') NOT NULL, `status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending', `retry_count` tinyint unsigned NOT NULL DEFAULT 0, `max_retries` tinyint unsigned NOT NULL DEFAULT 3, `error_message` text DEFAULT NULL, `scheduled_at` timestamp NOT NULL DEFAULT current_timestamp(), `sent_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_queue_user` → users(`id`) ON DELETE CASCADE
- **ENUM:** channel → 'push','email','sms','in_app'; status → 'pending','sent','failed'
- **Indexes:** idx_status(`status`,`scheduled_at`), fk_queue_user(`user_id`)

#### `notifications`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` bigint unsigned NOT NULL AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `category_id` int unsigned DEFAULT NULL, `action_id` int unsigned DEFAULT NULL, `action_payload` longtext DEFAULT NULL, `title` varchar(255) NOT NULL, `body` text DEFAULT NULL, `icon` varchar(100) DEFAULT NULL, `is_read` tinyint(1) NOT NULL DEFAULT 0, `is_pushed` tinyint(1) NOT NULL DEFAULT 0, `read_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_notif_action` → notification_actions(`id`) ON DELETE SET NULL; `fk_notif_category` → notification_categories(`id`) ON DELETE SET NULL; `fk_notif_user` → users(`id`) ON DELETE CASCADE
- **CHECK:** json_valid(`action_payload`)
- **Indexes:** idx_user_read(`user_id`,`is_read`), idx_created(`created_at`), fk_notif_category(`category_id`), fk_notif_action(`action_id`), idx_notifications_push(`user_id`,`is_pushed`,`created_at`)

#### `operating_hours`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned NOT NULL AUTO_INCREMENT, `owner_type` enum('organisation','branch','resource') NOT NULL, `owner_id` int unsigned NOT NULL, `day_of_week` tinyint unsigned NOT NULL, `is_open` tinyint(1) NOT NULL DEFAULT 1, `open_time` time DEFAULT NULL, `close_time` time DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** uk_hours(`owner_type`,`owner_id`,`day_of_week`)
- **ENUM:** owner_type → 'organisation','branch','resource'
- **Indexes:** idx_hours_owner(`owner_type`,`owner_id`)

#### `order_items`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned NOT NULL AUTO_INCREMENT, `order_id` int unsigned NOT NULL, `product_id` int unsigned NOT NULL, `variant_id` int unsigned DEFAULT NULL, `seller_id` int unsigned NOT NULL, `quantity` int unsigned NOT NULL, `unit_price` decimal(12,2) NOT NULL, `total_price` decimal(12,2) NOT NULL, `commission_rate` decimal(5,2) NOT NULL DEFAULT 0.00, `commission_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `settlement_status` enum('pending','settled','in_dispute') NOT NULL DEFAULT 'pending'
- **PK:** `id`
- **FK:** `fk_oi_order` → orders(`id`) ON DELETE CASCADE; `fk_oi_org` → organisations(`id`); `fk_oi_product` → products(`id`)
- **ENUM:** settlement_status → 'pending','settled','in_dispute'
- **Indexes:** idx_order(`order_id`), idx_seller(`seller_id`), fk_oi_product(`product_id`), idx_order_items_seller_created(`seller_id`,`created_at`), idx_order_items_seller_settlement(`seller_id`,`settlement_status`), idx_order_items_seller_order_settlement(`seller_id`,`order_id`,`settlement_status`)

#### `order_status_history`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned NOT NULL AUTO_INCREMENT, `order_id` int unsigned NOT NULL, `from_status` varchar(50) DEFAULT NULL, `to_status` varchar(50) NOT NULL, `changed_by` int unsigned DEFAULT NULL, `changed_by_role` varchar(50) DEFAULT NULL, `note` varchar(500) DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_hist_order` → orders(`id`) ON DELETE CASCADE
- **Indexes:** idx_order(`order_id`)

#### `orders`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (32):** `id` int unsigned NOT NULL AUTO_INCREMENT, `public_id` char(36) NOT NULL, `buyer_id` int unsigned NOT NULL, `status` enum('pending','confirmed','processing','shipped','delivered','cancelled','refunded') NOT NULL DEFAULT 'pending', `payment_status` enum('unpaid','paid','refunded','partial_refund') NOT NULL DEFAULT 'unpaid', `subtotal` decimal(12,2) NOT NULL, `shipping_cost` decimal(12,2) NOT NULL DEFAULT 0.00, `estimated_delivery_date` date DEFAULT NULL, `commission_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `courtzon_commission` decimal(12,2) NOT NULL DEFAULT 0.00, `org_product_share` decimal(12,2) NOT NULL DEFAULT 0.00, `org_shipping_share` decimal(12,2) NOT NULL DEFAULT 0.00, `coupon_id` int unsigned DEFAULT NULL, `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `tax_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `total` decimal(12,2) NOT NULL, `currency_code` char(3) NOT NULL, `payment_method` varchar(50) DEFAULT NULL, `cash_holder` enum('org','courtzon') DEFAULT NULL, `cash_collection_status` enum('expected_from_customer','under_collection','held_by_org','held_by_courtzon') DEFAULT NULL, `settlement_status` enum('pending','settled') NOT NULL DEFAULT 'pending', `shipping_address` longtext DEFAULT NULL, `shipping_carrier` varchar(100) DEFAULT NULL, `tracking_number` varchar(255) DEFAULT NULL, `notes` text DEFAULT NULL, `paid_at` timestamp NULL DEFAULT NULL, `cancelled_at` timestamp NULL DEFAULT NULL, `cancellation_reason` varchar(500) DEFAULT NULL, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `courtzon_fee` decimal(12,2) NOT NULL DEFAULT 0.00
- **PK:** `id`
- **UK:** public_id(`public_id`)
- **FK:** `fk_order_buyer` → users(`id`)
- **CHECK:** json_valid(`shipping_address`)
- **ENUM:** status → 'pending','confirmed','processing','shipped','delivered','cancelled','refunded'; payment_status → 'unpaid','paid','refunded','partial_refund'; cash_holder → 'org','courtzon'; cash_collection_status → 'expected_from_customer','under_collection','held_by_org','held_by_courtzon'; settlement_status → 'pending','settled'
- **Indexes:** idx_buyer(`buyer_id`), idx_status(`status`,`payment_status`), idx_orders_buyer_created(`buyer_id`,`created_at`), idx_orders_settlement_status(`settlement_status`,`status`,`payment_status`)

#### `organisation_attribute_values`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned NOT NULL AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `attribute_id` int unsigned NOT NULL, `value` text NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** uk_org_attr(`organisation_id`,`attribute_id`)
- **FK:** `fk_eav_attrdef` → organisation_type_attributes(`id`) ON DELETE CASCADE; `fk_eav_org` → organisations(`id`) ON DELETE CASCADE
- **Indexes:** fk_eav_attrdef(`attribute_id`)

#### `organisation_subscriptions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` bigint unsigned NOT NULL AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `plan_id` bigint unsigned NOT NULL, `billing_cycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly', `start_date` date DEFAULT NULL, `end_date` date DEFAULT NULL, `subscription_status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'pending', `auto_renew` tinyint(1) DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_os_organisation` → organisations(`id`) ON DELETE CASCADE; `fk_os_plan` → subscription_plans(`id`) ON DELETE CASCADE
- **ENUM:** billing_cycle → 'monthly','yearly'; subscription_status → 'active','expired','cancelled','pending'
- **Indexes:** idx_organisation(`organisation_id`), idx_plan(`plan_id`), idx_status(`subscription_status`)

#### `organisation_type_attributes`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned NOT NULL AUTO_INCREMENT, `org_type_id` int unsigned NOT NULL, `attribute_key` varchar(100) NOT NULL, `attribute_type` enum('text','number','boolean','select','multiselect','date','image') NOT NULL, `options` longtext DEFAULT NULL, `is_required` tinyint(1) NOT NULL DEFAULT 0, `sort_order` smallint unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** uk_attr(`org_type_id`,`attribute_key`)
- **FK:** `fk_attr_orgtype` → organisation_types(`id`) ON DELETE CASCADE
- **CHECK:** json_valid(`options`)
- **ENUM:** attribute_type → 'text','number','boolean','select','multiselect','date','image'

#### `organisation_types`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(50) NOT NULL, `name` varchar(100) DEFAULT NULL, `description` text DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint unsigned NOT NULL DEFAULT 0, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** slug(`slug`)

#### `organisation_upgrade_requests`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned NOT NULL AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `registration_type` enum('player','seller','organization','upgrade') NOT NULL DEFAULT 'upgrade', `requested_by` int unsigned NOT NULL, `requested_org_type_id` int unsigned DEFAULT NULL, `requested_plan_id` bigint unsigned DEFAULT NULL, `chosen_payment_method` varchar(100) DEFAULT NULL, `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending', `notes` text DEFAULT NULL, `metadata` longtext DEFAULT NULL, `approved_by` int unsigned DEFAULT NULL, `approved_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_upr_admin` → users(`id`) ON DELETE SET NULL; `fk_upr_org` → organisations(`id`) ON DELETE CASCADE; `fk_upr_orgtype` → organisation_types(`id`) ON DELETE SET NULL; `fk_upr_plan` → subscription_plans(`id`) ON DELETE SET NULL; `fk_upr_user` → users(`id`)
- **CHECK:** json_valid(`metadata`)
- **ENUM:** registration_type → 'player','seller','organization','upgrade'; status → 'pending','approved','rejected'
- **Indexes:** idx_org(`organisation_id`), idx_status(`status`), fk_upr_user(`requested_by`), fk_upr_plan(`requested_plan_id`), fk_upr_admin(`approved_by`), idx_registration_type(`registration_type`), fk_upr_orgtype(`requested_org_type_id`)

#### `organisations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (29):** `id` int unsigned NOT NULL AUTO_INCREMENT, `public_id` char(36) NOT NULL, `org_type_id` int unsigned NOT NULL, `owner_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `slug` varchar(200) NOT NULL, `description` text DEFAULT NULL, `logo_url` varchar(500) DEFAULT NULL, `cover_url` varchar(500) DEFAULT NULL, `documents` longtext DEFAULT NULL, `email` varchar(255) DEFAULT NULL, `phone` varchar(25) DEFAULT NULL, `website` varchar(255) DEFAULT NULL, `country_id` smallint unsigned DEFAULT NULL, `tax_id` varchar(100) DEFAULT NULL, `tax_id_type` varchar(50) DEFAULT NULL, `cr_number` varchar(100) DEFAULT NULL, `cancellation_policy_level` enum('organisation','branch') NOT NULL DEFAULT 'organisation', `cancellation_before_hours` int NOT NULL DEFAULT 24, `cancellation_fee_percentage` decimal(5,2) NOT NULL DEFAULT 0.00, `cancellation_fee_fixed` decimal(12,2) NOT NULL DEFAULT 0.00, `is_verified` tinyint(1) NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `rating_avg` decimal(3,2) NOT NULL DEFAULT 0.00, `rating_count` int unsigned NOT NULL DEFAULT 0, `version` int unsigned NOT NULL DEFAULT 1, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** public_id(`public_id`); slug(`slug`)
- **FK:** `fk_org_country` → countries(`id`); `fk_org_owner` → users(`id`); `fk_org_type` → organisation_types(`id`)
- **CHECK:** json_valid(`documents`)
- **ENUM:** cancellation_policy_level → 'organisation','branch'
- **Indexes:** idx_orgtype(`org_type_id`), idx_owner(`owner_id`), idx_active(`is_active`), idx_org_country(`country_id`), idx_organisations_owner(`owner_id`,`is_active`), idx_organisations_country(`country_id`,`is_active`)

#### `password_reset_tokens`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `token` varchar(255) NOT NULL, `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `used_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_reset_token_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_token`(`token`), `idx_user`(`user_id`)

#### `payment_gateway_config`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `organisation_id` int(10) unsigned DEFAULT NULL, `payment_method_id` int(10) unsigned DEFAULT NULL, `gateway_provider` varchar(50) NOT NULL DEFAULT 'paymob', `is_active` tinyint(1) NOT NULL DEFAULT 1, `config` longtext NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_gateway_payment_method` → `payment_methods`(`id`) ON DELETE CASCADE; `payment_gateway_config_ibfk_1` → `organisations`(`id`) ON DELETE CASCADE
- **CHECK:** json_valid(`config`)
- **Indexes:** `idx_gateway_org`(`organisation_id`,`gateway_provider`), `fk_gateway_payment_method`(`payment_method_id`)

#### `payment_methods`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 6
- **Columns (12):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(50) NOT NULL, `name` varchar(100) NOT NULL, `icon` varchar(50) DEFAULT NULL, `description` text DEFAULT NULL, `processing_fee_pct` decimal(5,2) NOT NULL DEFAULT 0.00, `processing_fee_fixed` decimal(12,2) NOT NULL DEFAULT 0.00, `requires_approval` tinyint(1) NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `slug`(`slug`)

#### `payment_transactions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (15):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `user_id` bigint(20) unsigned NOT NULL, `booking_id` bigint(20) unsigned DEFAULT NULL, `order_id` bigint(20) unsigned DEFAULT NULL, `reference_type` varchar(50) DEFAULT NULL, `payment_method` enum('wallet','cash','card','bank_transfer','online') NOT NULL, `gateway_provider` varchar(100) DEFAULT NULL, `gateway_reference` varchar(255) DEFAULT NULL, `amount` decimal(14,2) NOT NULL, `currency` char(3) NOT NULL DEFAULT 'EGP', `payment_status` enum('pending','paid','failed','refunded') DEFAULT 'pending', `gateway_response` longtext DEFAULT NULL, `paid_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `uk_gateway_reference`(`gateway_reference`(255))
- **CHECK:** json_valid(`gateway_response`)
- **ENUM:** `payment_method` → 'wallet','cash','card','bank_transfer','online'; `payment_status` → 'pending','paid','failed','refunded'
- **Indexes:** `idx_user`(`user_id`), `idx_booking`(`booking_id`), `idx_status`(`payment_status`), `idx_order`(`order_id`)

#### `peak_hour_pricing`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_id` int(10) unsigned NOT NULL, `day_of_week` tinyint(3) unsigned NOT NULL, `start_time` time NOT NULL, `end_time` time NOT NULL, `price_multiplier` decimal(5,2) NOT NULL DEFAULT 1.00, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_peak_resource` → `resources`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_resource_day`(`resource_id`,`day_of_week`)

#### `permission_modules`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 23
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(50) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `slug`(`slug`)

#### `permissions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 4
- **Columns (10):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `module_id` int(10) unsigned NOT NULL, `permission_key` varchar(100) NOT NULL, `description` varchar(500) DEFAULT NULL, `is_system` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `element_type` enum('button','tab','page','section','action','field') DEFAULT NULL, `element_label` varchar(255) DEFAULT NULL, `is_ui_element` tinyint(1) NOT NULL DEFAULT 0, `component_path` varchar(255) DEFAULT NULL
- **PK:** `id`
- **UK:** `permission_key`(`permission_key`)
- **ENUM:** `element_type` → 'button','tab','page','section','action','field'
- **FK:** `fk_perm_module` → `permission_modules`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_perm_module`(`module_id`), `idx_ui_element`(`is_ui_element`)

#### `platform_accounts`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `account_type` enum('float','commission','refund_hold','payout') NOT NULL, `currency_id` tinyint(3) unsigned NOT NULL, `description` varchar(255) DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_account`(`account_type`,`currency_id`)
- **ENUM:** `account_type` → 'float','commission','refund_hold','payout'
- **FK:** `fk_platform_currency` → `currencies`(`id`)
- **Indexes:** `fk_platform_currency`(`currency_id`)

#### `player_levels`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `level_order` tinyint(3) unsigned NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`

#### `player_profiles`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `main_sport_id` int(10) unsigned DEFAULT NULL, `main_level_id` int(10) unsigned DEFAULT NULL, `is_coach` tinyint(1) NOT NULL DEFAULT 0, `coach_status` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none', `coach_rejected_reason` varchar(500) DEFAULT NULL, `is_seller` tinyint(1) NOT NULL DEFAULT 0, `bio` text DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `user_id`(`user_id`)
- **ENUM:** `coach_status` → 'none','pending','approved','rejected'
- **FK:** `fk_player_user` → `users`(`id`) ON DELETE CASCADE

#### `player_ratings`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `rater_id` int(10) unsigned NOT NULL, `rated_id` int(10) unsigned NOT NULL, `booking_id` bigint(20) unsigned DEFAULT NULL, `rating` tinyint(3) unsigned NOT NULL, `review_text` text DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_rating`(`rater_id`,`rated_id`,`booking_id`)
- **CHECK:** `rating` between 1 and 5
- **FK:** `fk_pr_booking` → `bookings`(`id`) ON DELETE SET NULL; `fk_pr_rated` → `users`(`id`) ON DELETE CASCADE; `fk_pr_rater` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_rated`(`rated_id`), `fk_pr_booking`(`booking_id`)

#### `player_sport_interests`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (3):** `user_id` int(10) unsigned NOT NULL, `sport_id` int(10) unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `user_id`, `sport_id`
- **FK:** `fk_psi_sport` → `sports`(`id`) ON DELETE CASCADE; `fk_psi_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_psi_sport`(`sport_id`)

#### `product_categories`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 119
- **Columns (10):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `parent_id` int(10) unsigned DEFAULT NULL, `name` varchar(200) NOT NULL, `slug` varchar(200) NOT NULL, `description` text DEFAULT NULL, `image_url` varchar(500) DEFAULT NULL, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_cat_parent` → `product_categories`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_parent`(`parent_id`)

#### `product_images`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `product_id` int(10) unsigned NOT NULL, `variant_id` int(10) unsigned DEFAULT NULL, `media_url` varchar(500) NOT NULL, `alt_text` varchar(255) DEFAULT NULL, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `is_primary` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_pi_product` → `products`(`id`) ON DELETE CASCADE; `fk_pi_variant` → `product_variants`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_pi_product`(`product_id`), `idx_pi_variant`(`variant_id`), `idx_pi_primary`(`product_id`,`is_primary`)

#### `product_reviews`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `product_id` int(10) unsigned NOT NULL, `user_id` int(10) unsigned NOT NULL, `rating` tinyint(3) unsigned NOT NULL, `review_text` text DEFAULT NULL, `is_verified_purchase` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_user_product`(`user_id`,`product_id`)
- **CHECK:** `rating` between 1 and 5
- **FK:** `fk_rev_product` → `products`(`id`) ON DELETE CASCADE; `fk_rev_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_product`(`product_id`)

#### `product_specifications`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `product_id` int(10) unsigned NOT NULL, `spec_name` varchar(100) NOT NULL, `spec_value` varchar(500) NOT NULL, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0
- **PK:** `id`
- **FK:** `fk_ps_product` → `products`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_ps_product`(`product_id`)

#### `product_tags`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (2):** `product_id` int(10) unsigned NOT NULL, `tag_id` int(10) unsigned NOT NULL
- **PK:** `product_id`, `tag_id`
- **FK:** `fk_pt_product` → `products`(`id`) ON DELETE CASCADE; `fk_pt_tag` → `tags`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_pt_tag`(`tag_id`)

#### `product_variants`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (18):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `product_id` int(10) unsigned NOT NULL, `sku` varchar(100) DEFAULT NULL, `barcode` varchar(50) DEFAULT NULL, `variant_name` varchar(200) NOT NULL, `variant_type` varchar(100) DEFAULT NULL, `price_adjustment` decimal(12,2) NOT NULL DEFAULT 0.00, `compare_price` decimal(12,2) DEFAULT NULL, `quantity` int(10) unsigned NOT NULL DEFAULT 0, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `variant_color` varchar(7) DEFAULT NULL, `variant_image_url` varchar(500) DEFAULT NULL, `is_default` tinyint(1) NOT NULL DEFAULT 0, `weight` decimal(10,2) DEFAULT NULL, `dimensions` varchar(100) DEFAULT NULL
- **PK:** `id`
- **FK:** `fk_var_product` → `products`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_product`(`product_id`), `idx_var_sku`(`sku`), `idx_var_barcode`(`barcode`), `idx_var_default`(`is_default`)

#### `products`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (38):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `seller_id` int(10) unsigned DEFAULT NULL, `seller_user_id` int(10) unsigned DEFAULT NULL, `seller_type` enum('org','player') NOT NULL DEFAULT 'org', `branch_id` int(10) unsigned DEFAULT NULL, `category_id` int(10) unsigned NOT NULL, `brand_id` int(10) unsigned DEFAULT NULL, `sport_id` int(10) unsigned DEFAULT NULL, `name` varchar(255) NOT NULL, `name_ar` varchar(255) DEFAULT NULL, `description` text DEFAULT NULL, `short_description_en` text DEFAULT NULL, `short_description_ar` text DEFAULT NULL, `description_ar` text DEFAULT NULL, `price` decimal(12,2) NOT NULL, `discounted_price` decimal(12,2) DEFAULT NULL, `currency_code` char(3) NOT NULL, `gender` enum('male','female','unisex') DEFAULT 'unisex', `age_group` enum('adult','youth','junior','toddler') DEFAULT 'adult', `skill_level` enum('beginner','intermediate','professional','elite') DEFAULT NULL, `material` varchar(255) DEFAULT NULL, `rating_avg` decimal(3,2) NOT NULL DEFAULT 0.00, `rating_count` int(10) unsigned NOT NULL DEFAULT 0, `view_count` int(10) unsigned NOT NULL DEFAULT 0, `sales_count` int(10) unsigned NOT NULL DEFAULT 0, `quantity` int(10) unsigned NOT NULL DEFAULT 0, `reserved_quantity` int(10) unsigned NOT NULL DEFAULT 0, `is_digital` tinyint(1) NOT NULL DEFAULT 0, `digital_download_url` varchar(500) DEFAULT NULL, `video_url` varchar(500) DEFAULT NULL, `status` enum('draft','pending','active','sold','archived','out_of_stock') NOT NULL DEFAULT 'draft', `condition_status` enum('new','like_new','good','fair','used') DEFAULT NULL, `images` longtext DEFAULT NULL, `metadata` longtext DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **ENUM:** `seller_type` → 'org','player'; `gender` → 'male','female','unisex'; `age_group` → 'adult','youth','junior','toddler'; `skill_level` → 'beginner','intermediate','professional','elite'; `status` → 'draft','pending','active','sold','archived','out_of_stock'; `condition_status` → 'new','like_new','good','fair','used'
- **CHECK:** json_valid(`images`); json_valid(`metadata`)
- **FK:** `fk_prod_brand` → `brands`(`id`) ON DELETE SET NULL; `fk_prod_category` → `product_categories`(`id`); `fk_prod_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_prod_sport` → `sports`(`id`) ON DELETE SET NULL; `fk_prod_user` → `users`(`id`) ON DELETE CASCADE; `fk_product_branch` → `branches`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_seller`(`seller_id`), `idx_category`(`category_id`), `idx_status`(`status`), `idx_price`(`price`), `idx_prod_sport`(`sport_id`), `idx_products_seller_active`(`seller_id`,`is_active`,`category_id`), `idx_products_seller_price`(`seller_id`,`is_active`,`price`), `idx_prod_brand`(`brand_id`), `idx_prod_rating`(`rating_avg`), `idx_prod_gender`(`gender`), `idx_prod_age`(`age_group`), `idx_prod_skill`(`skill_level`), `idx_seller_user`(`seller_user_id`), `idx_product_branch`(`branch_id`), `ft_prod_search`(`name`,`name_ar`,`description`,`description_ar`) FULLTEXT

#### `provinces`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `country_id` smallint(5) unsigned NOT NULL, `name` varchar(120) NOT NULL, `slug` varchar(120) DEFAULT NULL, `native_name` varchar(120) DEFAULT NULL, `code` varchar(10) DEFAULT NULL, `type` enum('province','state','governorate','region','emirate','county') NOT NULL DEFAULT 'province', `navigation_polygon` longtext DEFAULT NULL, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uq_provinces_slug`(`country_id`,`slug`)
- **ENUM:** `type` → 'province','state','governorate','region','emirate','county'
- **CHECK:** json_valid(`navigation_polygon`)
- **FK:** `fk_province_country` → `countries`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_provinces_country`(`country_id`), `idx_provinces_code`(`code`)

#### `related_products`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `product_id` int(10) unsigned NOT NULL, `related_product_id` int(10) unsigned NOT NULL, `relation_type` enum('cross_sell','up_sell','accessory','similar') NOT NULL DEFAULT 'similar', `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0
- **PK:** `product_id`, `related_product_id`, `relation_type`
- **ENUM:** `relation_type` → 'cross_sell','up_sell','accessory','similar'
- **FK:** `fk_rp_product` → `products`(`id`) ON DELETE CASCADE; `fk_rp_related` → `products`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_rp_related`(`related_product_id`)

#### `resource_attribute_values`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_id` int(10) unsigned NOT NULL, `attribute_id` int(10) unsigned NOT NULL, `value` text NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `uk_res_attr`(`resource_id`,`attribute_id`)
- **FK:** `fk_res_eav_attr` → `resource_type_attributes`(`id`) ON DELETE CASCADE; `fk_res_eav_res` → `resources`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_res_eav_attr`(`attribute_id`)

#### `resource_maintenance`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_id` int(10) unsigned NOT NULL, `reason` varchar(255) NOT NULL, `date_from` datetime NOT NULL, `date_to` datetime NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_by` int(10) unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **FK:** `fk_maint_resource` → `resources`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_resource`(`resource_id`), `idx_dates`(`date_from`,`date_to`)

#### `resource_peak_hours`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_id` int(10) unsigned NOT NULL, `day_of_week` tinyint(3) unsigned NOT NULL, `has_peak` tinyint(1) NOT NULL DEFAULT 0, `start_time` time DEFAULT NULL, `end_time` time DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `uk_peak_hours_resource_day`(`resource_id`,`day_of_week`)
- **FK:** `fk_peak_hours_resource` → `resources`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_peak_hours_resource`(`resource_id`)

#### `resource_type_attributes`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_type_id` int(10) unsigned NOT NULL, `attribute_key` varchar(100) NOT NULL, `attribute_type` enum('text','number','boolean','select','multiselect','date','image') NOT NULL, `options` longtext DEFAULT NULL, `is_required` tinyint(1) NOT NULL DEFAULT 0, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_resattr_def`(`resource_type_id`,`attribute_key`)
- **ENUM:** `attribute_type` → 'text','number','boolean','select','multiselect','date','image'
- **CHECK:** json_valid(`options`)
- **FK:** `fk_resattr_type` → `resource_types`(`id`) ON DELETE CASCADE

#### `resource_types`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(50) NOT NULL, `name` varchar(100) NOT NULL, `has_slots` tinyint(1) NOT NULL DEFAULT 1, `default_slot_duration` int(10) unsigned NOT NULL DEFAULT 30, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `slug`(`slug`)

#### `resource_unavailability`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `resource_id` int(10) unsigned NOT NULL, `start_date` date NOT NULL, `end_date` date DEFAULT NULL, `start_time` time DEFAULT NULL, `end_time` time DEFAULT NULL, `reason` varchar(500) DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **FK:** `fk_unavail_resource` → `resources`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_resource_date`(`resource_id`,`start_date`,`end_date`)

#### `resources`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (21):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `public_id` char(36) NOT NULL, `branch_id` int(10) unsigned NOT NULL, `resource_type_id` int(10) unsigned NOT NULL, `sport_id` int(10) unsigned DEFAULT NULL, `name` varchar(200) NOT NULL, `description` text DEFAULT NULL, `capacity` int(10) unsigned NOT NULL DEFAULT 1, `hourly_price` decimal(12,2) DEFAULT NULL, `pricing_type` enum('per_hour','fixed') NOT NULL DEFAULT 'per_hour', `peak_hour_value` decimal(12,2) DEFAULT NULL, `images` longtext DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `slot_duration` int(10) unsigned DEFAULT NULL, `max_bookings_per_slot` int(10) unsigned NOT NULL DEFAULT 1, `opening_time` time DEFAULT NULL, `closing_time` time DEFAULT NULL, `version` int(10) unsigned NOT NULL DEFAULT 1, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `public_id`(`public_id`)
- **ENUM:** `pricing_type` → 'per_hour','fixed'
- **CHECK:** json_valid(`images`)
- **FK:** `fk_res_branch` → `branches`(`id`) ON DELETE CASCADE; `fk_res_sport` → `sports`(`id`) ON DELETE SET NULL; `fk_res_type` → `resource_types`(`id`)
- **Indexes:** `idx_branch`(`branch_id`), `idx_type`(`resource_type_id`), `idx_sport`(`sport_id`), `idx_active`(`is_active`,`branch_id`)

#### `revert_logs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `super_admin_id` int(10) unsigned NOT NULL, `audit_log_id` bigint(20) unsigned NOT NULL, `reason` varchar(500) NOT NULL, `reverted_state` longtext DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **CHECK:** json_valid(`reverted_state`)
- **FK:** `fk_revert_admin` → `users`(`id`) ON DELETE CASCADE; `fk_revert_audit` → `audit_logs`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_revert_admin`(`super_admin_id`), `fk_revert_audit`(`audit_log_id`)

#### `role_permissions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 20
- **Columns (4):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `role_id` int(10) unsigned NOT NULL, `permission_id` int(10) unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_role_perm`(`role_id`,`permission_id`)
- **FK:** `fk_rp_perm` → `permissions`(`id`) ON DELETE CASCADE; `fk_rp_role` → `roles`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_rp_perm`(`permission_id`)

#### `role_theme_overrides`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `role_id` int(10) unsigned NOT NULL, `token_key` varchar(100) NOT NULL, `value` varchar(255) NOT NULL, `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `role_id`, `token_key`
- **Indexes:** `idx_rto_role`(`role_id`)

#### `roles`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 9
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `organisation_id` int(10) unsigned DEFAULT NULL, `name` varchar(100) NOT NULL, `slug` varchar(100) NOT NULL, `description` varchar(500) DEFAULT NULL, `is_system` tinyint(1) NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `deleted_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `org_id_normalized` int(10) unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL
- **PK:** `id`
- **UK:** `uk_role_org_slug`(`org_id_normalized`,`slug`)
- **FK:** `fk_role_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org_role`(`organisation_id`)

#### `scheduled_jobs`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `job_type` enum('cleanup','report','backup','sync','crawl','email_digest','recurring_booking') NOT NULL, `job_status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending', `scheduled_at` datetime NOT NULL, `started_at` datetime DEFAULT NULL, `completed_at` datetime DEFAULT NULL, `error_message` text DEFAULT NULL, `retry_count` tinyint(3) unsigned NOT NULL DEFAULT 0, `max_retries` tinyint(3) unsigned NOT NULL DEFAULT 3, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **ENUM:** `job_type` → 'cleanup','report','backup','sync','crawl','email_digest','recurring_booking'; `job_status` → 'pending','running','completed','failed','cancelled'
- **Indexes:** `idx_status_scheduled`(`job_status`,`scheduled_at`), `idx_type`(`job_type`)

#### `seller_profiles`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (17):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `organisation_id` int unsigned, `branch_id` int unsigned, `shop_name` varchar(200), `shop_description` text, `shop_logo_url` varchar(500), `is_subscribed` tinyint(1) NOT NULL DEFAULT 0, `subscription_expires_at` timestamp, `max_free_listings` int unsigned NOT NULL DEFAULT 5, `total_listings` int unsigned NOT NULL DEFAULT 0, `rating_avg` decimal(3,2) NOT NULL DEFAULT 0.00, `rating_count` int unsigned NOT NULL DEFAULT 0, `is_active` tinyint(1) NOT NULL DEFAULT 1, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_seller_user`(user_id)
- **FK:** `fk_seller_user` → users(id) ON DELETE CASCADE; `fk_seller_org` → organisations(id) ON DELETE SET NULL; `fk_seller_branch` → branches(id) ON DELETE SET NULL
- **Indexes:** idx_seller_org(organisation_id), idx_seller_branch(branch_id)

#### `seller_shipping_rates`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `seller_id` int unsigned NOT NULL, `province_id` int unsigned, `city_id` int unsigned, `price` decimal(14,2) NOT NULL DEFAULT 0.00, `estimated_days` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** idx_seller(seller_id), idx_province(province_id), idx_city(city_id), idx_seller_province(seller_id,province_id,city_id)

#### `settlement_items_v1` (Dropped by Migration 052)
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Status:** Dropped — replaced by V2 settlement model in Migration 054
- **PK:** `id`
- **FK:** `fk_si_branch` → branches(id) ON DELETE SET NULL
- **Indexes:** idx_settlement(settlement_id), idx_branch(branch_id), idx_si_order(order_id)

#### `settlement_orders`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `settlement_id` int unsigned NOT NULL, `order_id` int unsigned NOT NULL, `products_price` decimal(12,2) NOT NULL DEFAULT 0.00, `shipping_price` decimal(12,2) NOT NULL DEFAULT 0.00, `gross_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `courtzon_fee` decimal(12,2) NOT NULL DEFAULT 0.00, `organization_net` decimal(12,2) NOT NULL DEFAULT 0.00, `payment_method` varchar(50), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_so_settlement` → settlements(id) ON DELETE CASCADE; `fk_so_order` → orders(id) ON DELETE CASCADE
- **Indexes:** idx_so_settlement(settlement_id), idx_so_order(order_id), idx_settlement_orders_unique(settlement_id,order_id)

#### `settlement_transfers`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned PK AI, `settlement_id` int unsigned NOT NULL, `transfer_direction` enum('courtzon_to_org','org_to_courtzon') NOT NULL, `amount` decimal(12,2) NOT NULL, `bank_account_id` int unsigned, `bank_account_snapshot` longtext (JSON), `transfer_reference` varchar(100), `transfer_date` timestamp, `transfer_status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending', `failure_reason` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** transfer_direction → 'courtzon_to_org','org_to_courtzon'; transfer_status → 'pending','completed','failed'
- **CHECK:** json_valid(bank_account_snapshot)
- **FK:** `fk_tf_settlement` → settlements(id) ON DELETE CASCADE
- **Indexes:** idx_tf_settlement(settlement_id)

#### `settlements`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (30):** `id` int unsigned PK AI, `organisation_id` int unsigned NOT NULL, `branch_id` int unsigned, `settlement_status` enum('requested','calculating','pending_approval','approved','paid','completed','rejected','cancelled') NOT NULL DEFAULT 'requested', `requested_by` int unsigned, `requested_by_role` varchar(50), `settlement_period_start` date, `settlement_period_end` date, `gross_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `shipping_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `courtzon_fee` decimal(12,2) NOT NULL DEFAULT 0.00, `organization_net` decimal(12,2) NOT NULL DEFAULT 0.00, `cod_fee_total` decimal(12,2) NOT NULL DEFAULT 0.00, `online_net_total` decimal(12,2) NOT NULL DEFAULT 0.00, `settlement_direction` enum('courtzon_to_org','org_to_courtzon'), `final_amount` decimal(12,2) NOT NULL DEFAULT 0.00, `settlement_type` varchar(50), `commission_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `net_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `processed_at` timestamp, `bank_account_id` int unsigned, `bank_account_snapshot` longtext (JSON), `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `calculating_started_at` timestamp, `calculating_completed_at` timestamp, `approved_at` timestamp, `paid_at` timestamp, `completed_at` timestamp, `rejected_at` timestamp, `rejected_reason` text, `notes` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** settlement_status → 'requested','calculating','pending_approval','approved','paid','completed','rejected','cancelled'; settlement_direction → 'courtzon_to_org','org_to_courtzon'
- **CHECK:** json_valid(bank_account_snapshot)
- **FK:** `fk_stl_org` → organisations(id) ON DELETE CASCADE; `fk_stl_branch` → branches(id) ON DELETE SET NULL
- **Indexes:** idx_stl_org(organisation_id), idx_stl_branch(branch_id), idx_stl_status(settlement_status), idx_stl_requested_by(requested_by), idx_settlements_org_status_requested(organisation_id,settlement_status,requested_at)

#### `settlements_v1` (Dropped by Migration 052)
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Status:** Dropped — replaced by V2 settlement model
- **Columns (11):** `id` bigint unsigned PK AI, `organisation_id` bigint unsigned NOT NULL, `settlement_type` enum('org_to_courtzon','courtzon_to_org') NOT NULL, `gross_amount` decimal(14,2) NOT NULL, `commission_amount` decimal(14,2) NOT NULL, `net_amount` decimal(14,2) NOT NULL, `settlement_status` enum('pending','processing','completed','failed') DEFAULT 'pending', `settlement_period_start` date, `settlement_period_end` date, `processed_at` timestamp, `notes` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** settlement_type → 'org_to_courtzon','courtzon_to_org'; settlement_status → 'pending','processing','completed','failed'
- **Indexes:** idx_status(settlement_status), idx_organisation(organisation_id), idx_settlements_org(organisation_id,settlement_period_end)

#### `sidebar_layout`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `parent_key` varchar(100) NOT NULL DEFAULT '', `ordered_keys` longtext NOT NULL, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_user_parent(user_id,parent_key)
- **CHECK:** json_valid(ordered_keys)
- **FK:** `sidebar_layout_ibfk_1` → users(id) ON DELETE CASCADE

#### `sport_positions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `sport_id` int unsigned NOT NULL, `name` varchar(100) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `deleted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_pos_sport` → sports(id) ON DELETE CASCADE
- **Indexes:** fk_pos_sport(sport_id)

#### `sports`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 106
- **Columns (9):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `slug` varchar(100) NOT NULL, `description` text DEFAULT NULL, `icon` varchar(50) DEFAULT NULL, `image_url` varchar(500) DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `slug`(`slug`)

#### `subscription_features`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 10
- **Columns (7):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `feature_key` varchar(100) NOT NULL, `label` varchar(255) NOT NULL, `value_type` enum('numeric','boolean','tier','text') NOT NULL DEFAULT 'boolean', `unit` varchar(50) DEFAULT NULL COMMENT 'Used by getPlanNumericLimit() joins', `sort_order` int(11) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `feature_key`(`feature_key`)

#### `subscription_plans`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 8
- **Columns (11):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `plan_name` varchar(255) NOT NULL, `price_monthly` decimal(12,2) DEFAULT NULL, `price_yearly` decimal(12,2) DEFAULT NULL, `is_unlimited` tinyint(1) NOT NULL DEFAULT 0, `features` longtext DEFAULT NULL CHECK (json_valid), `applicable_org_types` longtext DEFAULT NULL CHECK (json_valid), `is_active` tinyint(1) NOT NULL DEFAULT 1, `is_internal` tinyint(1) NOT NULL DEFAULT 0, `sort_order` int(10) unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`

#### `subscription_plan_features`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 16
- **Columns (4):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `plan_id` bigint(20) unsigned NOT NULL, `feature_id` int(10) unsigned NOT NULL, `value` varchar(255) NOT NULL
- **PK:** `id`
- **UK:** `uq_plan_feature`(plan_id, feature_id)
- **FK:** `fk_spf_plan` → subscription_plans(id) ON DELETE CASCADE; `fk_spf_feature` → subscription_features(id) ON DELETE CASCADE
- **Indexes:** feature_id(feature_id)

#### `subscription_plan_rates`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 24
- **Columns (6):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `plan_id` bigint(20) unsigned NOT NULL, `applicable_entity` varchar(100) NOT NULL COMMENT 'booking, tournament, marketplace, coach_session, academy', `rate_type` enum('percentage','fixed') NOT NULL DEFAULT 'percentage', `amount` decimal(5,2) NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uq_plan_entity`(plan_id, applicable_entity)
- **ENUM:** rate_type → 'percentage','fixed'
- **FK:** `fk_spr_plan` → subscription_plans(id) ON DELETE CASCADE

#### `tags`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `slug` varchar(100) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `slug`(`slug`)

#### `system_settings`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned NOT NULL AUTO_INCREMENT, `key` varchar(100) NOT NULL, `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid), `scope` varchar(50) DEFAULT NULL, `scope_id` int unsigned DEFAULT NULL, `notes` text DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `key`(`key`)

#### `tournament_bracket_types`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `id` int unsigned PK AI, `type_name` varchar(100) NOT NULL, `description` text, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`

#### `tournament_matches`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned PK AI, `tournament_id` int unsigned NOT NULL, `round` int unsigned NOT NULL, `match_number` int unsigned NOT NULL, `player1_id` int unsigned, `player2_id` int unsigned, `resource_id` int unsigned COMMENT 'Linked resource allocation', `start_time` datetime, `end_time` datetime, `status` enum('scheduled','in_progress','completed','walkover','cancelled') NOT NULL DEFAULT 'scheduled', `winner_id` int unsigned, `score_summary` varchar(500), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_match_tourn` → tournaments(id) ON DELETE CASCADE; `fk_match_player1` → users(id) ON DELETE SET NULL; `fk_match_player2` → users(id) ON DELETE SET NULL; `fk_match_resource` → resources(id) ON DELETE SET NULL
- **Indexes:** idx_tournament(tournament_id), idx_player1(player1_id), idx_player2(player2_id), idx_status(status), fk_match_resource(resource_id)
- **ENUM:** status → 'scheduled','in_progress','completed','walkover','cancelled'
- **Note:** Also created by Migration 056 with CREATE TABLE IF NOT EXISTS (idempotent)

#### `tournament_match_scores`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned PK AI, `match_id` int unsigned NOT NULL, `set_number` tinyint unsigned NOT NULL, `home_score` tinyint unsigned DEFAULT NULL, `away_score` tinyint unsigned DEFAULT NULL, `is_tiebreak` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_tms_match` → tournament_matches(id) ON DELETE CASCADE
- **Indexes:** idx_match_set(match_id,set_number)

#### `tournament_registrations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned PK AI, `tournament_id` int unsigned NOT NULL, `player_id` int unsigned, `team_id` int unsigned, `registered_by` int unsigned, `status` enum('pending','approved','rejected','checked_in','withdrawn') NOT NULL DEFAULT 'pending', `waiting_order` int unsigned, `cancelled_at` timestamp, `checked_in_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_tournament_player(tournament_id,player_id)
- **ENUM:** status → 'pending','approved','rejected','checked_in','withdrawn'
- **FK:** `fk_treg_tourn` → tournaments(id) ON DELETE CASCADE; `fk_treg_player` → users(id) ON DELETE CASCADE; `fk_treg_team` → teams(id) ON DELETE SET NULL; `fk_treg_regby` → users(id) ON DELETE SET NULL
- **Indexes:** idx_tournament(tournament_id), idx_player(player_id), idx_team(team_id)

#### `tournaments`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (24):** `id` int unsigned PK AI, `organisation_id` int unsigned NOT NULL, `branch_id` int unsigned, `sport_id` int unsigned NOT NULL, `code` varchar(50) NOT NULL, `name` varchar(200) NOT NULL, `description` text, `tournament_type_id` int unsigned, `format` varchar(50), `category` varchar(100), `season` varchar(100), `max_participants` int unsigned NOT NULL DEFAULT 0, `max_teams` int unsigned, `registration_fee` decimal(12,2), `price_type` enum('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FREE', `currency` char(3) NOT NULL DEFAULT 'USD', `status` enum('draft','published','registration_open','registration_closed','running','completed','cancelled','archived') NOT NULL DEFAULT 'draft', `is_public` tinyint(1) NOT NULL DEFAULT 1, `registration_open_at` timestamp, `registration_close_at` timestamp, `archived_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_code(code)
- **ENUM:** price_type → 'FREE','FIXED','MEMBERS_ONLY'; status → 'draft','published','registration_open','registration_closed','running','completed','cancelled','archived'
- **FK:** `fk_tourn_org` → organisations(id) ON DELETE CASCADE; `fk_tourn_branch` → branches(id) ON DELETE SET NULL; `fk_tourn_sport` → sports(id) ON DELETE CASCADE; `fk_tourn_type` → tournament_bracket_types(id) ON DELETE SET NULL
- **Indexes:** idx_tourn_org(organisation_id), idx_tourn_sport(sport_id), idx_format(format), idx_category(category), idx_status(status), idx_is_public(is_public)

#### `transaction_entries`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (13):** `id` bigint unsigned PK AI, `transaction_id` int unsigned NOT NULL, `account_id` int unsigned NOT NULL, `entry_type` enum('debit','credit') NOT NULL, `amount` decimal(14,2) NOT NULL, `currency_id` tinyint unsigned NOT NULL, `exchange_rate` decimal(14,6) NOT NULL DEFAULT 1.000000, `base_amount` decimal(14,2) NOT NULL, `description` varchar(500), `reference_type` varchar(50), `reference_id` varchar(50), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** entry_type → 'debit','credit'
- **FK:** `fk_te_tx` → transactions(id) ON DELETE CASCADE; `fk_te_account` → accounts(id) ON DELETE CASCADE; `fk_te_currency` → currencies(id)
- **Indexes:** idx_transaction(transaction_id), idx_account(account_id), idx_reference(reference_type,reference_id)

#### `transactions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned PK AI, `organisation_id` int unsigned, `branch_id` int unsigned, `transaction_code` varchar(50) NOT NULL, `transaction_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `description` varchar(500), `transaction_type` varchar(50), `reference_type` varchar(50), `reference_id` varchar(50), `status` enum('draft','posted','void') NOT NULL DEFAULT 'draft', `created_by` int unsigned, `approved_by` int unsigned, `posted_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uk_transaction_code(transaction_code)
- **ENUM:** status → 'draft','posted','void'
- **FK:** `fk_tx_org` → organisations(id) ON DELETE CASCADE; `fk_tx_branch` → branches(id) ON DELETE SET NULL; `fk_tx_creator` → users(id) ON DELETE SET NULL; `fk_tx_approver` → users(id) ON DELETE SET NULL
- **Indexes:** idx_tx_org(organisation_id), idx_tx_date(transaction_date), idx_tx_status(status), idx_reference(reference_type,reference_id)

#### `translation_keys`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `key` varchar(500) NOT NULL, `namespace` varchar(100) DEFAULT 'default', `context` text, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_key_namespace(key(255),namespace)

#### `translations`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `key_id` int unsigned NOT NULL, `locale` varchar(10) NOT NULL, `value` longtext NOT NULL, `is_auto_translated` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_key_locale(key_id,locale)
- **FK:** `fk_tr_key` → translation_keys(id) ON DELETE CASCADE
- **Indexes:** idx_key(key_id), idx_translations_locale(locale)

#### `uploads`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `original_name` varchar(500) NOT NULL, `storage_path` varchar(500) NOT NULL, `mime_type` varchar(100) NOT NULL, `size_bytes` bigint unsigned NOT NULL DEFAULT 0, `disk` varchar(50) NOT NULL DEFAULT 'local', `metadata` longtext, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_up_user` → users(id) ON DELETE CASCADE
- **Indexes:** idx_up_user(user_id)

#### `user_addresses`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `label` varchar(100), `full_name` varchar(255), `phone` varchar(20), `address_line1` varchar(255) NOT NULL, `address_line2` varchar(255), `city` varchar(100) NOT NULL, `state` varchar(100), `postal_code` varchar(20), `country_id` smallint unsigned, `is_default` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_uaddr_user` → users(id) ON DELETE CASCADE; `fk_uaddr_country` → countries(id) ON DELETE SET NULL
- **Indexes:** idx_uaddr_user(user_id)

#### `user_devices`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `device_token` varchar(500) NOT NULL, `platform` enum('ios','android','web') NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `last_used_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `uk_device_token`(`device_token`(255))
- **ENUM:** `platform` → 'ios','android','web'
- **FK:** `fk_device_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_device_user`(`user_id`)

#### `user_notification_preferences`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `notification_type_id` int unsigned, `channel` enum('email','sms','push','in_app','whatsapp') NOT NULL DEFAULT 'in_app', `is_enabled` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_user_notif_channel(user_id,notification_type_id,channel)
- **ENUM:** channel → 'email','sms','push','in_app','whatsapp'
- **FK:** fk_unp_user → users(id) ON DELETE CASCADE; fk_unp_type → notification_types(id) ON DELETE CASCADE
- **Indexes:** idx_unp_user(user_id)

#### `user_follows`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `follower_id` int unsigned NOT NULL, `following_id` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_follower_following(follower_id,following_id)
- **FK:** fk_uf_follower → users(id) ON DELETE CASCADE; fk_uf_following → users(id) ON DELETE CASCADE
- **Indexes:** idx_uf_follower(follower_id), idx_uf_following(following_id)

#### `user_friends`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `friend_id` int unsigned NOT NULL, `status` enum('pending','accepted','blocked') NOT NULL DEFAULT 'pending', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_user_friend(user_id,friend_id)
- **ENUM:** status → 'pending','accepted','blocked'
- **FK:** fk_fr_user → users(id) ON DELETE CASCADE; fk_fr_friend → users(id) ON DELETE CASCADE
- **Indexes:** idx_fr_user(user_id), idx_fr_friend(friend_id)

#### `user_role_scopes`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `role_slug` varchar(100) NOT NULL, `scope_type` varchar(50) NOT NULL, `scope_id` int unsigned, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_user_role_scope(user_id,role_slug,scope_type,scope_id)
- **FK:** fk_urs_user → users(id) ON DELETE CASCADE
- **Indexes:** idx_urs_user(user_id)

#### `user_roles`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `role_id` int(10) unsigned NOT NULL, `organisation_id` int(10) unsigned DEFAULT NULL, `expires_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
- **PK:** `id`
- **UK:** `uk_user_role_org`(`user_id`,`role_id`,`organisation_id`)
- **FK:** `fk_ur_role` → `roles`(`id`) ON DELETE CASCADE; `fk_ur_user` → `users`(`id`) ON DELETE CASCADE; `fk_userrole_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `fk_ur_role`(`role_id`), `idx_user_role_org`(`organisation_id`)

#### `user_sessions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `session_token` varchar(500) NOT NULL, `refresh_token` varchar(500) DEFAULT NULL, `ip_address` varchar(45) DEFAULT NULL, `user_agent` text DEFAULT NULL, `expires_at` timestamp NULL DEFAULT NULL
- **PK:** `id`
- **FK:** `fk_us_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_session_token`(`session_token`(255)), `idx_refresh_token`(`refresh_token`(255)), `idx_us_user`(`user_id`)

#### `user_wallets`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `owner_type` enum('user','organisation') NOT NULL, `owner_id` int(10) unsigned NOT NULL, `currency_id` tinyint(3) unsigned NOT NULL, `balance` decimal(14,2) NOT NULL DEFAULT 0.00, `balance_version` int(10) unsigned NOT NULL DEFAULT 1, `status` enum('active','frozen','closed') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `held_balance` decimal(14,2) NOT NULL DEFAULT 0.00, `available_balance` decimal(14,2) GENERATED ALWAYS AS (`balance` - `held_balance`) VIRTUAL
- **PK:** `id`
- **UK:** `uk_owner_currency`(`owner_type`,`owner_id`,`currency_id`)
- **ENUM:** `owner_type` → 'user','organisation'; `status` → 'active','frozen','closed'
- **FK:** `fk_wallet_currency` → `currencies`(`id`)
- **Indexes:** `idx_owner`(`owner_type`,`owner_id`), `idx_status`(`status`)

#### `users`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci | **AUTO_INCREMENT:** 6
- **Columns (25):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `public_id` char(36) NOT NULL, `first_name` varchar(100) NOT NULL, `last_name` varchar(100) NOT NULL, `email` varchar(255) NOT NULL, `phone` varchar(20) DEFAULT NULL, `password_hash` varchar(255) NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `email_verified_at` timestamp NULL DEFAULT NULL, `phone_verified_at` timestamp NULL DEFAULT NULL, `profile_image` varchar(500) DEFAULT NULL, `theme_preference` varchar(20) DEFAULT NULL, `last_login_at` timestamp NULL DEFAULT NULL, `last_login_ip` varchar(45) DEFAULT NULL, `two_factor_enabled` tinyint(1) NOT NULL DEFAULT 0, `two_factor_secret` varchar(255) DEFAULT NULL, `account_number` varchar(50) DEFAULT NULL, `location_lat` decimal(10,7) DEFAULT NULL, `location_lng` decimal(10,7) DEFAULT NULL, `metadata` longtext DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp(), `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(), `deleted_at` timestamp NULL DEFAULT NULL, `first_login` tinyint(1) NOT NULL DEFAULT 1, `username` varchar(50) DEFAULT NULL
- **PK:** `id`
- **UK:** `email`(`email`), `public_id`(`public_id`), `phone`(`phone`), `username`(`username`)
- **CHECK:** json_valid(`metadata`)
- **Indexes:** `idx_users_email`(`email`), `idx_users_phone`(`phone`), `idx_users_active`(`is_active`), `idx_users_deleted`(`deleted_at`)

#### `wallet_transactions`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT, `public_id` char(36) DEFAULT NULL, `wallet_id` bigint(20) unsigned NOT NULL, `transaction_type` enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty') NOT NULL, `amount` decimal(14,2) NOT NULL, `direction` enum('credit','debit') NOT NULL, `reference_type` varchar(100) DEFAULT NULL, `reference_id` bigint(20) unsigned DEFAULT NULL, `description` text DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **ENUM:** `transaction_type` → 'deposit','withdrawal','payment','refund','commission','settlement','due','penalty'; `direction` → 'credit','debit'
- **Indexes:** `idx_wtx_wallet`(`wallet_id`), `idx_wtx_ref`(`reference_type`,`reference_id`), `idx_wallet_txn_wallet_created`(`wallet_id`,`created_at`), `idx_wallet_txn_type_created`(`wallet_id`,`transaction_type`,`created_at`)

#### `wishlist_items`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `product_id` int(10) unsigned NOT NULL, `variant_id` int(10) unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_user_wishlist`(`user_id`,`product_id`,`variant_id`)
- **FK:** `fk_wl_product` → `products`(`id`) ON DELETE CASCADE; `fk_wl_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_wl_user`(`user_id`), `idx_wl_product`(`product_id`)

#### `withdrawal_requests`
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `wallet_id` int(10) unsigned NOT NULL, `amount` decimal(10,2) NOT NULL, `branch_financial_details_id` int(10) unsigned DEFAULT NULL, `status` enum('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending', `admin_notes` text DEFAULT NULL, `reviewed_by` int(10) unsigned DEFAULT NULL, `reviewed_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **ENUM:** `status` → 'pending','approved','rejected','completed','cancelled'
- **FK:** `fk_wr_branch_financial` → `branch_financial_details`(`id`) ON DELETE SET NULL; `fk_wr_user` → `users`(`id`) ON DELETE CASCADE; `fk_wr_reviewer` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_wr_user`(`user_id`), `idx_wr_status`(`status`), `fk_wr_branch_financial`(`branch_financial_details_id`), `reviewed_by`(`reviewed_by`)

---

## Part 2.2: Migration Tables (Enterprise − Files 013–073)

This section documents tables created by migration files 013 through 073. These migrations extend the V3 baseline with enterprise features: notification system, wallet/transactions, marketplace, academy/training, tournaments/competitions, pricing engine, financial engine, membership/loyalty, leagues/seasons, support ticketing, inventory management, finance/accounting, CRM/marketing, HR/payroll, BI, integration platform, and mobile platform.

**Total new tables:** 116 (created by 44 migration files; 29 files in the range perform ALTER-only changes).

### Migration 013 — `013_notification_templates_categories.sql`
**Scope:** Notification template system with categories.

#### `notification_templates`
- **Introduced by:** Migration 013 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned NOT NULL AUTO_INCREMENT, `category_id` int unsigned DEFAULT NULL, `code` varchar(100) NOT NULL, `name` varchar(200) NOT NULL, `subject` varchar(500) DEFAULT NULL, `body_html` longtext, `body_text` longtext, `variables` json DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `code`
- **FK:** `fk_nt_cat` → notification_categories(id) ON DELETE SET NULL
- **Indexes:** idx_category(category_id)

### Migration 014 — `014_notification_broadcasts.sql`
**Scope:** Notification broadcast scheduling.

#### `notification_broadcasts`
- **Introduced by:** Migration 014 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned NOT NULL AUTO_INCREMENT, `template_id` int unsigned NOT NULL, `broadcast_type` enum('immediate','scheduled','recurring') NOT NULL DEFAULT 'immediate', `target_audience` json NOT NULL, `scheduled_at` datetime DEFAULT NULL, `sent_at` datetime DEFAULT NULL, `status` enum('pending','sending','sent','failed','cancelled') NOT NULL DEFAULT 'pending', `sent_count` int unsigned NOT NULL DEFAULT 0, `failed_count` int unsigned NOT NULL DEFAULT 0, `metadata` json DEFAULT NULL, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** broadcast_type → 'immediate','scheduled','recurring'; status → 'pending','sending','sent','failed','cancelled'
- **CHECK:** json_valid(target_audience); json_valid(metadata)
- **FK:** fk_nb_template → notification_templates(id); fk_nb_creator → users(id)
- **Indexes:** idx_status(status), idx_scheduled(scheduled_at)

### Migration 015 — `015_enterprise_notification_platform.sql`
**Scope:** Notification providers, devices, quiet hours, channel preferences, template versioning, webhooks, audit trail, A/B testing, feature flags, cleanup policies, event replay.

#### `notification_providers`
- **Introduced by:** Migration 015 | **Not in V3 baseline**
- **Columns (6):** `id` int unsigned PK AI, `name` varchar(100) NOT NULL, `provider_type` varchar(50) NOT NULL, `config` json NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`

#### `notification_webhooks`
- **Introduced by:** Migration 015 | **Not in V3 baseline**
- **Columns (9):** `id` int unsigned PK AI, `organisation_id` int unsigned, `url` varchar(500) NOT NULL, `secret` varchar(255), `events` json NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `last_triggered_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`

#### `notification_audit_log`
- **Introduced by:** Migration 015 | **Not in V3 baseline**
- **Columns (9):** `id` bigint unsigned PK AI, `notification_id` bigint unsigned NOT NULL, `event_type` varchar(50) NOT NULL, `old_status` varchar(50), `new_status` varchar(50), `payload` json, `error_message` text, `ip_address` varchar(45), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`

#### `notification_ab_tests`
- **Introduced by:** Migration 015 | **Not in V3 baseline**
- **Columns (9):** `id` int unsigned PK AI, `template_a_id` int unsigned NOT NULL, `template_b_id` int unsigned NOT NULL, `distribution` decimal(5,2) NOT NULL DEFAULT 50.00, `started_at` timestamp NOT NULL, `ended_at` timestamp, `winner_template_id` int unsigned, `status` enum('running','completed','cancelled') NOT NULL DEFAULT 'running', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`

### Migration 016 — `016_monitoring_alerting.sql`
**Scope:** Alerting rules, client error reports, web vitals metrics.

#### `alerting_rules`
- **Introduced by:** Migration 016 | **Not in V3 baseline**
- **Columns (12):** `id` int unsigned PK AI, `rule_name` varchar(200) NOT NULL, `metric_name` varchar(100) NOT NULL, `condition` enum('gt','lt','eq','gte','lte','change_percent') NOT NULL, `threshold` decimal(14,4) NOT NULL, `duration_seconds` int unsigned NOT NULL DEFAULT 300, `severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning', `channels` json NOT NULL, `cooldown_seconds` int unsigned NOT NULL DEFAULT 900, `is_active` tinyint(1) NOT NULL DEFAULT 1, `last_fired_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`

#### `client_error_reports`
- **Introduced by:** Migration 016 | **Not in V3 baseline**
- **Columns (12):** `id` bigint unsigned PK AI, `user_id` int unsigned, `error_type` varchar(100) NOT NULL, `error_message` text, `stack_trace` longtext, `component_stack` text, `url` varchar(500), `user_agent` text, `metadata` json, `ip_address` varchar(45), `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`

#### `web_vitals_metrics`
- **Introduced by:** Migration 016 | **Not in V3 baseline**
- **Columns (9):** `id` bigint unsigned PK AI, `user_id` int unsigned, `metric_name` varchar(50) NOT NULL, `metric_value` decimal(14,4) NOT NULL, `rating` varchar(20), `url` varchar(500), `user_agent` text, `metadata` json, `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`

### Migration 017 — (ALTER only — no new tables)

### Migration 018 — (ALTER only — no new tables)

### Migration 019 — `019_system_settings.sql`
**Scope:** System settings table (already baseline — migration ensures it exists).

### Migration 020 — `020_create_membership_plans.sql`
**Scope:** Membership plans table (already baseline — migration ensures it exists).

### Migration 021 — `021_create_wallet_and_transactions.sql`
**Scope:** User wallets and payment accounts.

#### `seller_wallet_transactions`
- **Introduced by:** Migration 021 | **Not in V3 baseline**
- **Columns (8):** `id` int unsigned PK AI, `seller_id` int unsigned NOT NULL, `amount` decimal(12,2) NOT NULL DEFAULT 0.00, `type` enum('credit','debit','hold','release','refund','commission') NOT NULL, `reference_type` varchar(50), `reference_id` varchar(50), `description` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** type → 'credit','debit','hold','release','refund','commission'
- **Indexes:** idx_seller(seller_id), idx_reference(reference_type,reference_id)

### Migration 022 — (ALTER only — no new tables)

### Migration 023 — (ALTER only — no new tables)

### Migration 024 — (ALTER only — no new tables)

### Migration 025 — `025_create_user_bank_accounts.sql`
**Scope:** User bank accounts table.

#### `user_bank_accounts`
- **Introduced by:** Migration 025 | **Not in V3 baseline**
- **Columns (12):** `id` int unsigned PK AI, `user_id` int unsigned NOT NULL, `bank_name` varchar(255) NOT NULL, `account_holder_name` varchar(255) NOT NULL, `account_number` varchar(100) NOT NULL, `iban` varchar(50), `swift_code` varchar(20), `branch_name` varchar(255), `is_default` tinyint(1) NOT NULL DEFAULT 0, `is_verified` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** fk_uba_user → users(id) ON DELETE CASCADE
- **Indexes:** idx_user(user_id)

### Migration 026 — `026_create_organisation_bank_accounts.sql`
**Scope:** Organisation bank accounts table.

#### `organisation_bank_accounts`
- **Introduced by:** Migration 026 | **Not in V3 baseline**
- **Columns (12):** `id` int unsigned PK AI, `organisation_id` int unsigned NOT NULL, `bank_name` varchar(255) NOT NULL, `account_holder_name` varchar(255) NOT NULL, `account_number` varchar(100) NOT NULL, `iban` varchar(50), `swift_code` varchar(20), `branch_name` varchar(255), `is_default` tinyint(1) NOT NULL DEFAULT 0, `is_verified` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** fk_oba_org → organisations(id) ON DELETE CASCADE
- **Indexes:** idx_org(organisation_id)

### Migration 027 — (ALTER only — no new tables)

### Migration 028 — `028_courtzon_fee_settings.sql`
**Scope:** Fee configuration for organisations.

#### `courtzon_fee_settings`
- **Introduced by:** Migration 028 | **Not in V3 baseline**
- **Columns (8):** `id` int unsigned PK AI, `organisation_id` int unsigned NOT NULL, `fee_type` varchar(50) NOT NULL, `fee_value` decimal(5,2) NOT NULL, `fee_cap` decimal(12,2), `applies_to` varchar(50) NOT NULL DEFAULT 'all', `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** fk_cfs_org → organisations(id) ON DELETE CASCADE
- **Indexes:** idx_org(organisation_id)

### Migration 029 — `029_create_shop_subscriptions.sql`
**Scope:** Shop subscriptions for marketplace sellers.

#### `shop_subscriptions`
- **Introduced by:** Migration 029 | **Not in V3 baseline**
- **Columns (10):** `id` int unsigned PK AI, `seller_id` int unsigned NOT NULL, `plan_type` enum('free','basic','premium','enterprise') NOT NULL DEFAULT 'free', `status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'active', `price` decimal(12,2) NOT NULL DEFAULT 0.00, `start_date` datetime NOT NULL, `end_date` datetime NOT NULL, `auto_renew` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** plan_type → 'free','basic','premium','enterprise'; status → 'active','expired','cancelled','pending'
- **Indexes:** idx_seller(seller_id), idx_status(status)

### Migration 030 — (ALTER only — no new tables)

### Migration 031 — (ALTER only — no new tables)

### Migration 032 — (ALTER only — no new tables)

### Migration 033 — `033_create_seller_balance.sql`
**Scope:** Seller balance tracking.

#### `seller_balances`
- **Introduced by:** Migration 033 | **Not in V3 baseline**
- **Columns (5):** `id` int unsigned PK AI, `seller_id` int unsigned NOT NULL, `current_balance` decimal(14,2) NOT NULL DEFAULT 0.00, `total_earned` decimal(14,2) NOT NULL DEFAULT 0.00, `total_withdrawn` decimal(14,2) NOT NULL DEFAULT 0.00, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** uq_seller(seller_id)

### Migration 034 — `034_create_seller_balance_history.sql`
**Scope:** Seller balance change log.

#### `seller_balance_histories`
- **Introduced by:** Migration 034 | **Not in V3 baseline**
- **Columns (7):** `id` bigint unsigned PK AI, `seller_id` int unsigned NOT NULL, `amount` decimal(14,2) NOT NULL, `balance_before` decimal(14,2) NOT NULL, `balance_after` decimal(14,2) NOT NULL, `change_type` varchar(50) NOT NULL, `reference_type` varchar(50), `reference_id` varchar(50), `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** idx_seller(seller_id), idx_reference(reference_type,reference_id), idx_created(created_at)

### Migration 035 — (ALTER only — no new tables)

### Migration 036 — (ALTER only — no new tables)

### Migration 037 — (ALTER only — no new tables)

### Migration 038 — (ALTER only — no new tables)

### Migration 039 — (ALTER only — no new tables)

### Migration 040 — (ALTER only — no new tables)

### Migration 041 — `041_create_seller_withdrawals.sql`
**Scope:** Seller withdrawal requests.

#### `seller_withdrawals`
- **Introduced by:** Migration 041 | **Not in V3 baseline**
- **Columns (10):** `id` int unsigned PK AI, `seller_id` int unsigned NOT NULL, `amount` decimal(14,2) NOT NULL, `bank_account_id` int unsigned, `status` enum('pending','approved','processing','completed','rejected','cancelled') NOT NULL DEFAULT 'pending', `admin_id` int unsigned, `rejection_reason` text, `processed_at` timestamp, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** status → 'pending','approved','processing','completed','rejected','cancelled'
- **FK:** fk_sw_seller → seller_profiles(id); fk_sw_bank → user_bank_accounts(id); fk_sw_admin → users(id)
- **Indexes:** idx_seller(seller_id), idx_status(status)

### Migration 042 — (ALTER only — no new tables)

### Migration 043 — (ALTER only — no new tables)

### Migration 044 — (ALTER only — no new tables)

### Migration 045 — (ALTER only — no new tables)

### Migration 046 — (ALTER only — no new tables)

### Migration 047 — (ALTER only — no new tables)

### Migration 048 — (ALTER only — no new tables)

### Migration 049 — (ALTER only — no new tables)

### Migration 050 — (ALTER only — no new tables)

### Migration 051 — (ALTER only — no new tables)

### Migration 052 — `052_drop_settlements_v1.sql`
**Scope:** Drops `settlements_v1` and `settlement_items_v1` tables (replaced by V2 model).
- No new tables. Dropped `settlements_v1` and `settlement_items_v1`.

### Migration 053 — `053_pricing_engine.sql`
**Scope:** Dynamic pricing rules and seasonal multipliers.

#### `pricing_rules`
- **Introduced by:** Migration 053 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (21):** `id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `rule_type` enum('fixed','percentage_increase','percentage_decrease','multiplier','min_price','max_price','override') NOT NULL, `scope` enum('global','organisation','branch','resource') NOT NULL DEFAULT 'global', `scope_id` int unsigned DEFAULT NULL, `resource_id` int unsigned DEFAULT NULL, `value` decimal(12,2) NOT NULL, `priority` int NOT NULL DEFAULT 0, `days_of_week` json DEFAULT NULL, `time_start` varchar(5) DEFAULT NULL, `time_end` varchar(5) DEFAULT NULL, `date_start` date DEFAULT NULL, `date_end` date DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `metadata` json DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `rule_type` → 'fixed','percentage_increase','percentage_decrease','multiplier','min_price','max_price','override'; `scope` → 'global','organisation','branch','resource'
- **CHECK:** json_valid(`days_of_week`); json_valid(`metadata`)
- **Indexes:** `idx_pricing_scope`(`scope`,`scope_id`), `idx_pricing_resource`(`resource_id`)

#### `pricing_seasons`
- **Introduced by:** Migration 053 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (8):** `id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `organisation_id` int unsigned DEFAULT NULL, `date_start` date NOT NULL, `date_end` date NOT NULL, `multiplier` decimal(5,2) NOT NULL DEFAULT 1.00, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** `idx_pricing_seasons_date`(`date_start`,`date_end`), `idx_pricing_seasons_org`(`organisation_id`)

### Migration 054 — `054_financial_engine.sql`
**Scope:** Financial ledger and settlement batch processing.

#### `ledger_entries`
- **Introduced by:** Migration 054 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (10):** `id` bigint unsigned NOT NULL AUTO_INCREMENT, `transaction_id` varchar(64) NOT NULL, `source_type` enum('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement') NOT NULL, `source_id` int unsigned NOT NULL, `account_type` enum('platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund') NOT NULL, `side` enum('debit','credit') NOT NULL, `amount` decimal(14,2) NOT NULL, `currency` varchar(10) NOT NULL DEFAULT 'EGP', `description` text, `reference_id` varchar(128) DEFAULT NULL, `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `source_type` → 'booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement'; `account_type` → 'platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund'; `side` → 'debit','credit'
- **Indexes:** `idx_ledger_tx`(`transaction_id`), `idx_ledger_source`(`source_type`,`source_id`), `idx_ledger_date`(`recorded_at`), `idx_ledger_account`(`account_type`,`recorded_at`)

#### `settlement_batches`
- **Introduced by:** Migration 054 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (12):** `id` int unsigned NOT NULL AUTO_INCREMENT, `batch_type` enum('daily','weekly','monthly','manual') NOT NULL, `period_start` date NOT NULL, `period_end` date NOT NULL, `gross_amount` decimal(14,2) NOT NULL DEFAULT 0, `discount_amount` decimal(14,2) NOT NULL DEFAULT 0, `tax_amount` decimal(14,2) NOT NULL DEFAULT 0, `commission_amount` decimal(14,2) NOT NULL DEFAULT 0, `refund_amount` decimal(14,2) NOT NULL DEFAULT 0, `net_amount` decimal(14,2) NOT NULL DEFAULT 0, `status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending', `organisation_id` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `batch_type` → 'daily','weekly','monthly','manual'; `status` → 'pending','completed','failed'
- **Indexes:** `idx_batch_status`(`status`), `idx_batch_period`(`period_start`,`period_end`), `idx_batch_org`(`organisation_id`)

### Migration 055 — `055_membership_loyalty.sql`
**Scope:** Membership plans, memberships, loyalty points, and rewards platform.

#### `membership_plans`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (13):** `id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `plan_type` enum('monthly','quarterly','semiannual','annual','unlimited','credits','session_bundle','corporate','family','student') NOT NULL, `duration_days` int NOT NULL, `price` decimal(10,2) NOT NULL, `credits` int DEFAULT NULL, `sessions` int DEFAULT NULL, `benefits` json DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `organisation_id` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `plan_type` → 'monthly','quarterly','semiannual','annual','unlimited','credits','session_bundle','corporate','family','student'
- **CHECK:** json_valid(`benefits`)
- **Indexes:** `idx_plan_active`(`is_active`)
- **Note:** Distinct from the earlier `membership_plans` definition (Migration 020); this version includes `organisation_id`, `plan_type`, `credits`, `sessions`, and `benefits` fields.

#### `memberships`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (10):** `id` int unsigned NOT NULL AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `plan_id` int unsigned NOT NULL, `status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'active', `start_date` datetime NOT NULL, `end_date` datetime NOT NULL, `credits_used` int NOT NULL DEFAULT 0, `sessions_used` int NOT NULL DEFAULT 0, `auto_renew` tinyint(1) NOT NULL DEFAULT 0, `aggregate_version` int NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'active','expired','cancelled','pending'
- **Indexes:** `idx_member_user`(`user_id`), `idx_member_status`(`status`,`end_date`), `idx_member_plan`(`plan_id`)

#### `loyalty_points`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (5):** `user_id` int unsigned NOT NULL, `total_earned` int NOT NULL DEFAULT 0, `total_spent` int NOT NULL DEFAULT 0, `current_balance` int NOT NULL DEFAULT 0, `current_tier` enum('bronze','silver','gold','platinum','diamond') NOT NULL DEFAULT 'bronze', `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `user_id`
- **ENUM:** `current_tier` → 'bronze','silver','gold','platinum','diamond'

#### `loyalty_campaigns`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (8):** `id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `description` text, `points_multiplier` decimal(5,2) NOT NULL DEFAULT 1.00, `start_date` datetime NOT NULL, `end_date` datetime NOT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `applicable_activities` json DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(`applicable_activities`)
- **Indexes:** `idx_campaign_active`(`is_active`,`start_date`,`end_date`)

#### `reward_catalog`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (8):** `id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `description` text, `points_cost` int NOT NULL, `reward_type` enum('wallet_credit','coupon','free_booking','free_session','voucher','merchandise','tournament_ticket') NOT NULL, `reward_value` decimal(10,2) NOT NULL, `quantity` int NOT NULL DEFAULT 1, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `reward_type` → 'wallet_credit','coupon','free_booking','free_session','voucher','merchandise','tournament_ticket'
- **Indexes:** `idx_reward_active`(`is_active`)

#### `reward_claims`
- **Introduced by:** Migration 055 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (4):** `id` int unsigned NOT NULL AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `reward_id` int unsigned NOT NULL, `points_used` int NOT NULL, `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** `idx_claim_user`(`user_id`)

### Migration 056 — `056_tournaments.sql`
**Scope:** Tournament management, participants, match scheduling, and ELO ratings.

#### `tournament_participants`
- **Introduced by:** Migration 056 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (7):** `id` int unsigned NOT NULL AUTO_INCREMENT, `tournament_id` int unsigned NOT NULL, `user_id` int unsigned DEFAULT NULL, `team_name` varchar(255) DEFAULT NULL, `seed` int NOT NULL DEFAULT 0, `status` enum('registered','approved','rejected','checked_in') NOT NULL DEFAULT 'registered', `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'registered','approved','rejected','checked_in'
- **Indexes:** `idx_tp_tournament`(`tournament_id`), `idx_tp_user`(`user_id`)

#### `elo_ratings`
- **Introduced by:** Migration 056 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4
- **Columns (7):** `user_id` int unsigned NOT NULL, `sport_id` int unsigned NOT NULL, `rating` int NOT NULL DEFAULT 1200, `matches_played` int NOT NULL DEFAULT 0, `k_factor` int NOT NULL DEFAULT 32, `last_match_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `user_id`, `sport_id`
- **Indexes:** `idx_elo_rating`(`sport_id`,`rating` DESC)

**Modifications to existing tables (056):**
- `tournaments` — Added columns: `code` varchar(50), `format` varchar(50), `category` varchar(100), `season` varchar(100), `max_teams` int unsigned, `registration_fee` decimal(12,2), `price_type` enum('FREE','FIXED','MEMBERS_ONLY'), `is_public` tinyint(1), `archived_at` timestamp, `registration_open_at` timestamp, `registration_close_at` timestamp. Added `uk_code` unique key, indexes `idx_format`, `idx_category`, `idx_is_public`.
- `tournament_registrations` — Added columns: `waiting_order` int unsigned, `team_id` int unsigned, `cancelled_at` timestamp. Added indexes `idx_team`, `idx_waiting_order`.
- `tournament_matches` — Added columns: `group_id` int unsigned, `bracket_position` int unsigned, `referee_id` int unsigned, `round_name` varchar(100). Added indexes `idx_group`, `idx_referee`, `idx_bracket`.

### Migration 057 — `057_widen_processed_commands_command_id.sql`
**Scope:** ALTER TABLE only — widened `command_id` column in `processed_commands`.
- No new tables. Modified `processed_commands.command_id` column type.

### Migration 058 — `058_widen_dead_letter_message_id.sql`
**Scope:** ALTER TABLE only — widened `message_id` column in `dead_letter_entries`.
- No new tables. Modified `dead_letter_entries.message_id` column type.

### Migration 059 — `059_add_expired_at_to_payment_transactions.sql`
**Scope:** ALTER TABLE only — added `expired_at` column to `payment_transactions`.
- No new tables. Added column `expired_at` timestamp NULL DEFAULT NULL to `payment_transactions`.

### Migration 060 — `060_create_user_organisations_user_branches.sql`
**Scope:** Junction tables for user–organisation and user–branch membership (referenced by socket-room-manager, notification dispatcher, player-matching service).

#### `user_organisations`
- **Introduced by:** Migration 060 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `organisation_id` int(10) unsigned NOT NULL, `role_in_org` varchar(50) DEFAULT 'member' COMMENT 'owner, admin, member', `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_user_org`(`user_id`,`organisation_id`)
- **FK:** `fk_uo_user` → `users`(`id`) ON DELETE CASCADE; `fk_uo_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`)

#### `user_branches`
- **Introduced by:** Migration 060 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `id` int(10) unsigned NOT NULL AUTO_INCREMENT, `user_id` int(10) unsigned NOT NULL, `branch_id` int(10) unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT current_timestamp()
- **PK:** `id`
- **UK:** `uk_user_branch`(`user_id`,`branch_id`)
- **FK:** `fk_ub_user` → `users`(`id`) ON DELETE CASCADE; `fk_ub_branch` → `branches`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_branch`(`branch_id`)

### Migration 061 — `061_academy_training.sql`
**Scope:** Academy and training foundation — programs, groups, sessions, attendance.

**Schema change:** Legacy `academy_enrollments` renamed to `academy_enrollments_legacy`; new `academy_enrollments` table created with updated schema.

#### `academy_programs`
- **Introduced by:** Migration 061 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned AUTO_INCREMENT, `code` varchar(50) NOT NULL, `name` varchar(200) NOT NULL, `description` text, `category` varchar(100) NOT NULL, `level` varchar(100) DEFAULT NULL, `season` varchar(100) DEFAULT NULL, `capacity` int unsigned NOT NULL DEFAULT 0, `price` decimal(12,2) NOT NULL DEFAULT 0.00, `currency` char(3) NOT NULL DEFAULT 'USD', `price_type` enum('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED', `status` enum('draft','published','open','full','running','completed','cancelled','archived') NOT NULL DEFAULT 'draft', `is_public` tinyint(1) NOT NULL DEFAULT 1, `archived_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_code`(`code`)
- **ENUM:** `price_type` → 'FREE','FIXED','MEMBERS_ONLY'; `status` → 'draft','published','open','full','running','completed','cancelled','archived'
- **Indexes:** `idx_status`(`status`), `idx_category`(`category`), `idx_is_public`(`is_public`)

#### `academy_groups`
- **Introduced by:** Migration 061 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `program_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `coach_id` int unsigned DEFAULT NULL, `capacity` int unsigned NOT NULL DEFAULT 0, `status` enum('active','inactive','archived') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'active','inactive','archived'
- **FK:** `fk_group_program` → `academy_programs`(`id`) ON DELETE CASCADE; `fk_group_coach` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_program`(`program_id`), `idx_coach`(`coach_id`)

#### `academy_enrollments` (new version)
- **Introduced by:** Migration 061 | Already exists in V3 baseline (legacy table renamed)
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `player_id` int unsigned NOT NULL, `program_id` int unsigned NOT NULL, `group_id` int unsigned DEFAULT NULL, `membership_id` int unsigned DEFAULT NULL, `status` enum('pending','confirmed','waiting','cancelled','completed') NOT NULL DEFAULT 'pending', `waiting_order` int unsigned DEFAULT NULL, `enrolled_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `cancelled_at` timestamp NULL DEFAULT NULL, `completed_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'pending','confirmed','waiting','cancelled','completed'
- **FK:** `fk_enroll_player` → `users`(`id`) ON DELETE CASCADE; `fk_enroll_program` → `academy_programs`(`id`) ON DELETE CASCADE; `fk_enroll_group` → `academy_groups`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_player`(`player_id`), `idx_program`(`program_id`), `idx_group`(`group_id`), `idx_status`(`status`), `idx_waiting_order`(`waiting_order`)

#### `academy_group_sessions`
- **Introduced by:** Migration 061 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned AUTO_INCREMENT, `group_id` int unsigned NOT NULL, `session_date` date NOT NULL, `start_time` time DEFAULT NULL, `end_time` time DEFAULT NULL, `court_id` int unsigned DEFAULT NULL, `coach_id` int unsigned DEFAULT NULL, `status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'scheduled','in_progress','completed','cancelled'
- **FK:** `fk_session_group` → `academy_groups`(`id`) ON DELETE CASCADE; `fk_session_court` → `resources`(`id`) ON DELETE SET NULL; `fk_session_coach` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_group`(`group_id`), `idx_date`(`session_date`), `idx_coach`(`coach_id`)

#### `academy_attendance`
- **Introduced by:** Migration 061 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `group_session_id` int unsigned NOT NULL, `enrollment_id` int unsigned NOT NULL, `attendance_status` enum('present','absent','excused','late') NOT NULL DEFAULT 'present', `notes` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_session_enrollment`(`group_session_id`,`enrollment_id`)
- **ENUM:** `attendance_status` → 'present','absent','excused','late'
- **FK:** `fk_att_session` → `academy_group_sessions`(`id`) ON DELETE CASCADE; `fk_att_enrollment` → `academy_enrollments`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_enrollment`(`enrollment_id`)

### Migration 062 — `062_tournament_competition.sql`
**Scope:** Tournament group stages, team match support, match results, standings.

**Note:** See Migration 056 modifications for ALTER TABLE changes to `tournaments`, `tournament_registrations`, and `tournament_matches`.

#### `tournament_groups`
- **Introduced by:** Migration 062 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `tournament_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `size` int unsigned NOT NULL DEFAULT 0, `advance_count` int unsigned NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_tgroup_tourn` → `tournaments`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_tournament`(`tournament_id`)

#### `tournament_group_members`
- **Introduced by:** Migration 062 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `group_id` int unsigned NOT NULL, `registration_id` int unsigned NOT NULL, `seed` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_group_reg`(`group_id`,`registration_id`)
- **FK:** `fk_tgm_group` → `tournament_groups`(`id`) ON DELETE CASCADE; `fk_tgm_reg` → `tournament_registrations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_registration`(`registration_id`)

#### `tournament_match_players`
- **Introduced by:** Migration 062 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `match_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `side` enum('home','away') NOT NULL DEFAULT 'home', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `side` → 'home','away'
- **FK:** `fk_tmp_match` → `tournament_matches`(`id`) ON DELETE CASCADE; `fk_tmp_player` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_match`(`match_id`), `idx_player`(`player_id`)

#### `tournament_match_results`
- **Introduced by:** Migration 062 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned AUTO_INCREMENT, `match_id` int unsigned NOT NULL, `winner_id` int unsigned DEFAULT NULL, `home_score` text DEFAULT NULL, `away_score` text DEFAULT NULL, `score_details` json DEFAULT NULL, `result_status` enum('submitted','confirmed','disputed') NOT NULL DEFAULT 'submitted', `entered_by` int unsigned NOT NULL, `confirmed_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_match`(`match_id`)
- **ENUM:** `result_status` → 'submitted','confirmed','disputed'
- **FK:** `fk_tmr_match` → `tournament_matches`(`id`) ON DELETE CASCADE; `fk_tmr_winner` → `users`(`id`) ON DELETE SET NULL; `fk_tmr_entered` → `users`(`id`)
- **Indexes:** `idx_winner`(`winner_id`)

#### `tournament_standings`
- **Introduced by:** Migration 062 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (13):** `id` int unsigned AUTO_INCREMENT, `tournament_id` int unsigned NOT NULL, `group_id` int unsigned DEFAULT NULL, `registration_id` int unsigned NOT NULL, `wins` int unsigned NOT NULL DEFAULT 0, `losses` int unsigned NOT NULL DEFAULT 0, `draws` int unsigned NOT NULL DEFAULT 0, `points` decimal(10,2) NOT NULL DEFAULT 0.00, `games_won` int unsigned NOT NULL DEFAULT 0, `games_lost` int unsigned NOT NULL DEFAULT 0, `sets_won` int unsigned NOT NULL DEFAULT 0, `sets_lost` int unsigned NOT NULL DEFAULT 0, `rank_position` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_tourn_reg_group`(`tournament_id`,`registration_id`,`group_id`)
- **FK:** `fk_ts_tourn` → `tournaments`(`id`) ON DELETE CASCADE; `fk_ts_group` → `tournament_groups`(`id`) ON DELETE CASCADE; `fk_ts_reg` → `tournament_registrations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_group`(`group_id`), `idx_rank`(`tournament_id`,`rank_position`)

### Migration 063 — `063_league_season_ranking.sql`
**Scope:** League, season, division, team management with standings and player/team statistics.

#### `seasons`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `code` varchar(50) NOT NULL, `name` varchar(200) NOT NULL, `description` text, `sport_id` int unsigned DEFAULT NULL, `start_date` date NOT NULL, `end_date` date DEFAULT NULL, `status` enum('draft','published','running','completed','archived') NOT NULL DEFAULT 'draft', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_code`(`code`)
- **ENUM:** `status` → 'draft','published','running','completed','archived'
- **Indexes:** `idx_status`(`status`), `idx_sport`(`sport_id`)

#### `leagues`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (16):** `id` int unsigned AUTO_INCREMENT, `season_id` int unsigned NOT NULL, `code` varchar(50) NOT NULL, `name` varchar(200) NOT NULL, `description` text, `sport_id` int unsigned DEFAULT NULL, `format` enum('round_robin','double_round_robin') NOT NULL DEFAULT 'round_robin', `max_teams` int unsigned NOT NULL DEFAULT 0, `registration_fee` decimal(12,2) NOT NULL DEFAULT 0.00, `price_type` enum('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED', `currency` char(3) NOT NULL DEFAULT 'USD', `status` enum('draft','registration_open','registration_closed','running','completed','cancelled','archived') NOT NULL DEFAULT 'draft', `is_public` tinyint(1) NOT NULL DEFAULT 1, `points_per_win` tinyint unsigned NOT NULL DEFAULT 3, `points_per_draw` tinyint unsigned NOT NULL DEFAULT 1, `archived_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_code`(`code`)
- **ENUM:** `format` → 'round_robin','double_round_robin'; `price_type` → 'FREE','FIXED','MEMBERS_ONLY'; `status` → 'draft','registration_open','registration_closed','running','completed','cancelled','archived'
- **FK:** `fk_league_season` → `seasons`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_season`(`season_id`), `idx_status`(`status`), `idx_sport`(`sport_id`)

#### `league_divisions`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned AUTO_INCREMENT, `league_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `tier` int unsigned NOT NULL DEFAULT 1, `capacity` int unsigned NOT NULL DEFAULT 0, `advance_count` int unsigned NOT NULL DEFAULT 0, `relegation_count` int unsigned NOT NULL DEFAULT 0, `status` enum('active','inactive','archived') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'active','inactive','archived'
- **FK:** `fk_div_league` → `leagues`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_league`(`league_id`)

#### `league_teams`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned AUTO_INCREMENT, `division_id` int unsigned NOT NULL, `team_name` varchar(200) NOT NULL, `captain_id` int unsigned DEFAULT NULL, `player_ids` json DEFAULT NULL, `status` enum('pending','confirmed','waiting','cancelled','withdrawn') NOT NULL DEFAULT 'pending', `waiting_order` int unsigned DEFAULT NULL, `seed` int unsigned DEFAULT NULL, `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_div_team`(`division_id`,`team_name`)
- **ENUM:** `status` → 'pending','confirmed','waiting','cancelled','withdrawn'
- **FK:** `fk_team_div` → `league_divisions`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_status`(`status`), `idx_captain`(`captain_id`)

#### `league_matches`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (12):** `id` int unsigned AUTO_INCREMENT, `division_id` int unsigned NOT NULL, `home_team_id` int unsigned NOT NULL, `away_team_id` int unsigned NOT NULL, `round` int unsigned NOT NULL, `match_date` date DEFAULT NULL, `start_time` time DEFAULT NULL, `end_time` time DEFAULT NULL, `court_id` int unsigned DEFAULT NULL, `referee_id` int unsigned DEFAULT NULL, `status` enum('scheduled','in_progress','completed','cancelled','walkover') NOT NULL DEFAULT 'scheduled', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'scheduled','in_progress','completed','cancelled','walkover'
- **FK:** `fk_lm_div` → `league_divisions`(`id`) ON DELETE CASCADE; `fk_lm_home` → `league_teams`(`id`) ON DELETE CASCADE; `fk_lm_away` → `league_teams`(`id`) ON DELETE CASCADE; `fk_lm_court` → `resources`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_division`(`division_id`), `idx_round`(`round`), `idx_status`(`status`), `idx_date`(`match_date`), `idx_court`(`court_id`), `idx_referee`(`referee_id`)

#### `league_results`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `match_id` int unsigned NOT NULL, `home_score` text DEFAULT NULL, `away_score` text DEFAULT NULL, `winner_team_id` int unsigned DEFAULT NULL, `result_status` enum('submitted','confirmed','disputed') NOT NULL DEFAULT 'submitted', `entered_by` int unsigned NOT NULL, `confirmed_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_match`(`match_id`)
- **ENUM:** `result_status` → 'submitted','confirmed','disputed'
- **FK:** `fk_lr_match` → `league_matches`(`id`) ON DELETE CASCADE; `fk_lr_winner` → `league_teams`(`id`) ON DELETE SET NULL; `fk_lr_entered` → `users`(`id`)
- **Indexes:** `idx_winner`(`winner_team_id`)

#### `league_standings`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned AUTO_INCREMENT, `division_id` int unsigned NOT NULL, `team_id` int unsigned NOT NULL, `played` int unsigned NOT NULL DEFAULT 0, `wins` int unsigned NOT NULL DEFAULT 0, `draws` int unsigned NOT NULL DEFAULT 0, `losses` int unsigned NOT NULL DEFAULT 0, `goals_for` int unsigned NOT NULL DEFAULT 0, `goals_against` int unsigned NOT NULL DEFAULT 0, `goal_difference` int NOT NULL DEFAULT 0, `points` decimal(10,2) NOT NULL DEFAULT 0.00, `position` int unsigned DEFAULT NULL, `form` json DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_div_team`(`division_id`,`team_id`)
- **FK:** `fk_ls_div` → `league_divisions`(`id`) ON DELETE CASCADE; `fk_ls_team` → `league_teams`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_position`(`division_id`,`position`)

#### `player_statistics`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (15):** `id` int unsigned AUTO_INCREMENT, `season_id` int unsigned NOT NULL, `player_id` int unsigned NOT NULL, `team_id` int unsigned DEFAULT NULL, `division_id` int unsigned DEFAULT NULL, `appearances` int unsigned NOT NULL DEFAULT 0, `goals` int unsigned NOT NULL DEFAULT 0, `assists` int unsigned NOT NULL DEFAULT 0, `clean_sheets` int unsigned NOT NULL DEFAULT 0, `yellow_cards` int unsigned NOT NULL DEFAULT 0, `red_cards` int unsigned NOT NULL DEFAULT 0, `minutes_played` int unsigned NOT NULL DEFAULT 0, `rating` decimal(4,2) DEFAULT NULL, `stats_json` json DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_season_player`(`season_id`,`player_id`,`team_id`)
- **FK:** `fk_ps_season` → `seasons`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_player`(`player_id`), `idx_team`(`team_id`), `idx_division`(`division_id`)

#### `team_statistics`
- **Introduced by:** Migration 063 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (14):** `id` int unsigned AUTO_INCREMENT, `season_id` int unsigned NOT NULL, `team_id` int unsigned NOT NULL, `division_id` int unsigned DEFAULT NULL, `played` int unsigned NOT NULL DEFAULT 0, `wins` int unsigned NOT NULL DEFAULT 0, `draws` int unsigned NOT NULL DEFAULT 0, `losses` int unsigned NOT NULL DEFAULT 0, `goals_for` int unsigned NOT NULL DEFAULT 0, `goals_against` int unsigned NOT NULL DEFAULT 0, `clean_sheets` int unsigned NOT NULL DEFAULT 0, `home_record` json DEFAULT NULL, `away_record` json DEFAULT NULL, `stats_json` json DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_season_team`(`season_id`,`team_id`)
- **FK:** `fk_ts_season` → `seasons`(`id`) ON DELETE CASCADE; `fk_ts_team` → `league_teams`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_division`(`division_id`)

### Migration 064 — `064_player_profile_extras.sql`
**Scope:** ALTER TABLE only — added columns to `player_profiles`.
- No new tables. Added columns to `player_profiles`: `date_of_birth` date DEFAULT NULL AFTER `bio`, `nationality` varchar(100) DEFAULT NULL AFTER `date_of_birth`, `gender` enum('male','female') DEFAULT NULL AFTER `nationality`, `phone_number` varchar(20) DEFAULT NULL AFTER `gender`, `whatsapp_number` varchar(20) DEFAULT NULL AFTER `phone_number`, `notify_via_whatsapp` tinyint(1) DEFAULT 0 AFTER `whatsapp_number`, `street` varchar(255) DEFAULT NULL AFTER `notify_via_whatsapp`, `city` varchar(100) DEFAULT NULL AFTER `street`, `state_province` varchar(100) DEFAULT NULL AFTER `city`, `height_cm` decimal(5,1) DEFAULT NULL AFTER `state_province`, `weight_kg` decimal(5,1) DEFAULT NULL AFTER `height_cm`.

### Migration 065 — `065_org_announcements.sql`
**Scope:** Organisation-wide announcements with priority levels.

#### `org_announcements`
- **Introduced by:** Migration 065 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (9):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `title` varchar(255) NOT NULL, `content` text NOT NULL, `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal', `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft', `published_at` timestamp NULL DEFAULT NULL, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `priority` → 'low','normal','high','urgent'; `status` → 'draft','published','archived'
- **FK:** `fk_ann_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_ann_creator` → `users`(`id`)
- **Indexes:** `idx_org`(`organisation_id`), `idx_status`(`status`), `idx_priority`(`priority`)

### Migration 066 — `066_support_tickets.sql`
**Scope:** Customer support ticketing system with threaded messages.

#### `support_tickets`
- **Introduced by:** Migration 066 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned DEFAULT NULL, `user_id` int unsigned NOT NULL, `subject` varchar(255) NOT NULL, `description` text NOT NULL, `category` enum('general','billing','technical','account','feature_request','other') NOT NULL DEFAULT 'general', `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal', `status` enum('open','in_progress','waiting_on_customer','resolved','closed') NOT NULL DEFAULT 'open', `assigned_to` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `category` → 'general','billing','technical','account','feature_request','other'; `priority` → 'low','normal','high','urgent'; `status` → 'open','in_progress','waiting_on_customer','resolved','closed'
- **FK:** `fk_st_org` → `organisations`(`id`) ON DELETE SET NULL; `fk_st_user` → `users`(`id`) ON DELETE CASCADE; `fk_st_assign` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_organisation`(`organisation_id`), `idx_user`(`user_id`), `idx_status`(`status`), `idx_assigned`(`assigned_to`)

#### `support_ticket_messages`
- **Introduced by:** Migration 066 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `ticket_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `message` text NOT NULL, `is_internal` tinyint(1) NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_stm_ticket` → `support_tickets`(`id`) ON DELETE CASCADE; `fk_stm_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_ticket`(`ticket_id`)

### Migration 067 — `067_marketplace_inventory.sql`
**Scope:** Warehouse, supplier, purchase order, and stock transfer management.

#### `warehouses`
- **Introduced by:** Migration 067 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `location` text, `status` enum('active','inactive','archived') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'active','inactive','archived'
- **FK:** `fk_wh_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`)

#### `suppliers`
- **Introduced by:** Migration 067 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `contact_name` varchar(200), `email` varchar(255), `phone` varchar(50), `payment_terms` varchar(200), `lead_time_days` int unsigned DEFAULT 0, `status` enum('active','inactive') NOT NULL DEFAULT 'active', `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'active','inactive'
- **FK:** `fk_sup_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`)

#### `purchase_orders`
- **Introduced by:** Migration 067 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `supplier_id` int unsigned NOT NULL, `warehouse_id` int unsigned DEFAULT NULL, `status` enum('draft','submitted','approved','received','cancelled') NOT NULL DEFAULT 'draft', `total_cost` decimal(14,2) NOT NULL DEFAULT 0.00, `notes` text, `created_by` int unsigned NOT NULL, `received_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'draft','submitted','approved','received','cancelled'
- **FK:** `fk_po_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_po_supplier` → `suppliers`(`id`) ON DELETE CASCADE; `fk_po_wh` → `warehouses`(`id`) ON DELETE SET NULL; `fk_po_creator` → `users`(`id`)
- **Indexes:** `idx_org`(`organisation_id`), `idx_supplier`(`supplier_id`), `idx_status`(`status`)

#### `purchase_order_items`
- **Introduced by:** Migration 067 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `purchase_order_id` int unsigned NOT NULL, `variant_id` int unsigned NOT NULL, `quantity` int unsigned NOT NULL, `unit_cost` decimal(14,2) NOT NULL DEFAULT 0.00, `total_cost` decimal(14,2) NOT NULL DEFAULT 0.00, `received_qty` int unsigned NOT NULL DEFAULT 0
- **PK:** `id`
- **FK:** `fk_poi_po` → `purchase_orders`(`id`) ON DELETE CASCADE; `fk_poi_variant` → `product_variants`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_po`(`purchase_order_id`)

#### `stock_transfers`
- **Introduced by:** Migration 067 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `variant_id` int unsigned NOT NULL, `from_warehouse_id` int unsigned DEFAULT NULL, `to_warehouse_id` int unsigned DEFAULT NULL, `quantity` int unsigned NOT NULL, `status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending', `created_by` int unsigned NOT NULL, `completed_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'pending','completed','cancelled'
- **FK:** `fk_st_variant` → `product_variants`(`id`) ON DELETE CASCADE; `fk_st_from_wh` → `warehouses`(`id`) ON DELETE SET NULL; `fk_st_to_wh` → `warehouses`(`id`) ON DELETE SET NULL; `fk_st_creator` → `users`(`id`)
- **Indexes:** `idx_variant`(`variant_id`), `idx_from_wh`(`from_warehouse_id`), `idx_to_wh`(`to_warehouse_id`)

**ALTER TABLE modifications (067):**
- `product_variants` — Added columns: `cost_price` decimal(14,2), `min_stock_level` int unsigned NOT NULL DEFAULT 0, `max_stock_level` int unsigned NOT NULL DEFAULT 0.
- `inventory_logs` — Added column: `warehouse_id` int unsigned DEFAULT NULL, index `idx_wh`.

### Migration 068 — `068_finance_accounting.sql`
**Scope:** Double-entry accounting with chart of accounts, fiscal periods, general ledger, invoices, and tax rates.

#### `chart_of_accounts`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `code` varchar(20) NOT NULL, `name` varchar(200) NOT NULL, `type` enum('asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense') NOT NULL, `parent_id` int unsigned DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `description` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_code`(`code`)
- **ENUM:** `type` → 'asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense'
- **FK:** `fk_coa_parent` → `chart_of_accounts`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_parent`(`parent_id`), `idx_type`(`type`)

#### `accounting_periods`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `fiscal_year` int unsigned NOT NULL, `period_number` tinyint unsigned NOT NULL, `start_date` date NOT NULL, `end_date` date NOT NULL, `status` enum('open','closed','locked') NOT NULL DEFAULT 'open', `closed_at` timestamp NULL DEFAULT NULL, `closed_by` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_fy_period`(`fiscal_year`,`period_number`)
- **ENUM:** `status` → 'open','closed','locked'
- **FK:** `fk_ap_closed` → `users`(`id`)
- **Indexes:** `idx_status`(`status`)

#### `general_ledger`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` bigint unsigned AUTO_INCREMENT, `period_id` int unsigned NOT NULL, `account_id` int unsigned NOT NULL, `entry_date` date NOT NULL, `debit` decimal(14,2) NOT NULL DEFAULT 0.00, `credit` decimal(14,2) NOT NULL DEFAULT 0.00, `balance` decimal(14,2) NOT NULL DEFAULT 0.00, `reference_type` varchar(50) DEFAULT NULL, `reference_id` bigint unsigned DEFAULT NULL, `description` text, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_gl_period` → `accounting_periods`(`id`); `fk_gl_account` → `chart_of_accounts`(`id`); `fk_gl_creator` → `users`(`id`)
- **Indexes:** `idx_period`(`period_id`), `idx_account`(`account_id`), `idx_date`(`entry_date`), `idx_reference`(`reference_type`,`reference_id`)

#### `invoices`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (15):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned DEFAULT NULL, `user_id` int unsigned DEFAULT NULL, `invoice_number` varchar(50) NOT NULL, `invoice_type` enum('sales','purchase','credit_note','debit_note') NOT NULL DEFAULT 'sales', `status` enum('draft','issued','paid','partially_paid','overdue','cancelled') NOT NULL DEFAULT 'draft', `issue_date` date NOT NULL, `due_date` date DEFAULT NULL, `subtotal` decimal(14,2) NOT NULL DEFAULT 0.00, `tax_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `total` decimal(14,2) NOT NULL DEFAULT 0.00, `paid_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `notes` text, `reference_type` varchar(50) DEFAULT NULL, `reference_id` int unsigned DEFAULT NULL, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_inv_number`(`invoice_number`)
- **ENUM:** `invoice_type` → 'sales','purchase','credit_note','debit_note'; `status` → 'draft','issued','paid','partially_paid','overdue','cancelled'
- **FK:** `fk_inv_org` → `organisations`(`id`) ON DELETE SET NULL; `fk_inv_user` → `users`(`id`) ON DELETE SET NULL; `fk_inv_creator` → `users`(`id`)
- **Indexes:** `idx_org`(`organisation_id`), `idx_user`(`user_id`), `idx_status`(`status`), `idx_reference`(`reference_type`,`reference_id`)

#### `invoice_items`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `invoice_id` int unsigned NOT NULL, `description` varchar(500) NOT NULL, `quantity` int unsigned NOT NULL DEFAULT 1, `unit_price` decimal(14,2) NOT NULL DEFAULT 0.00, `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00, `tax_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `total` decimal(14,2) NOT NULL DEFAULT 0.00
- **PK:** `id`
- **FK:** `fk_ii_invoice` → `invoices`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_invoice`(`invoice_id`)

#### `tax_rates`
- **Introduced by:** Migration 068 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned AUTO_INCREMENT, `name` varchar(200) NOT NULL, `rate` decimal(5,2) NOT NULL, `type` enum('percentage','fixed') NOT NULL DEFAULT 'percentage', `is_active` tinyint(1) NOT NULL DEFAULT 1, `country_code` char(2) DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `type` → 'percentage','fixed'

### Migration 069 — `069_crm_marketing.sql`
**Scope:** Customer segmentation, lead management, marketing campaigns, and communication logging.

#### `customer_segments`
- **Introduced by:** Migration 069 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned AUTO_INCREMENT, `name` varchar(200) NOT NULL, `description` text, `rules_json` json DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `member_count` int unsigned NOT NULL DEFAULT 0, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_seg_creator` → `users`(`id`)
- **Indexes:** `idx_active`(`is_active`)

#### `segment_members`
- **Introduced by:** Migration 069 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (4):** `id` int unsigned AUTO_INCREMENT, `segment_id` int unsigned NOT NULL, `user_id` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_seg_user`(`segment_id`,`user_id`)
- **FK:** `fk_sm_segment` → `customer_segments`(`id`) ON DELETE CASCADE; `fk_sm_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_user`(`user_id`)

#### `leads`
- **Introduced by:** Migration 069 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned AUTO_INCREMENT, `source` varchar(100) DEFAULT NULL, `full_name` varchar(200) NOT NULL, `email` varchar(255) DEFAULT NULL, `phone` varchar(50) DEFAULT NULL, `status` enum('new','qualified','converted','lost') NOT NULL DEFAULT 'new', `converted_user_id` int unsigned DEFAULT NULL, `notes` text, `assigned_to` int unsigned DEFAULT NULL, `created_by` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'new','qualified','converted','lost'
- **FK:** `fk_lead_conv` → `users`(`id`) ON DELETE SET NULL; `fk_lead_assign` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_status`(`status`), `idx_assigned`(`assigned_to`), `idx_source`(`source`)

#### `marketing_campaigns`
- **Introduced by:** Migration 069 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `name` varchar(200) NOT NULL, `description` text, `type` enum('email','sms','push','in_app','multi_channel') NOT NULL DEFAULT 'multi_channel', `status` enum('draft','active','paused','completed','cancelled') NOT NULL DEFAULT 'draft', `segment_id` int unsigned DEFAULT NULL, `scheduled_at` timestamp NULL DEFAULT NULL, `started_at` timestamp NULL DEFAULT NULL, `completed_at` timestamp NULL DEFAULT NULL, `stats_json` json DEFAULT NULL, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `type` → 'email','sms','push','in_app','multi_channel'; `status` → 'draft','active','paused','completed','cancelled'
- **FK:** `fk_mc_segment` → `customer_segments`(`id`) ON DELETE SET NULL; `fk_mc_creator` → `users`(`id`)
- **Indexes:** `idx_status`(`status`), `idx_segment`(`segment_id`), `idx_type`(`type`)

#### `communication_log`
- **Introduced by:** Migration 069 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` bigint unsigned AUTO_INCREMENT, `user_id` int unsigned DEFAULT NULL, `channel` enum('email','sms','push','in_app','whatsapp') NOT NULL, `direction` enum('outbound','inbound') NOT NULL DEFAULT 'outbound', `subject` varchar(500) DEFAULT NULL, `body` text, `status` enum('sent','delivered','failed','opened','clicked') DEFAULT 'sent', `reference_type` varchar(50) DEFAULT NULL, `reference_id` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `channel` → 'email','sms','push','in_app','whatsapp'; `direction` → 'outbound','inbound'; `status` → 'sent','delivered','failed','opened','clicked'
- **Indexes:** `idx_user`(`user_id`), `idx_channel`(`channel`), `idx_reference`(`reference_type`,`reference_id`), `idx_created`(`created_at`)

### Migration 070 — `070_hr_payroll.sql`
**Scope:** HR management — departments, positions, employees, contracts, leave, attendance, payroll.

#### `departments`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `parent_id` int unsigned DEFAULT NULL, `head_employee_id` int unsigned DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_dept_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_dept_parent` → `departments`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_org`(`organisation_id`), `idx_parent`(`parent_id`)

#### `positions`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `department_id` int unsigned DEFAULT NULL, `title` varchar(200) NOT NULL, `description` text, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_pos_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_pos_dept` → `departments`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_org`(`organisation_id`), `idx_dept`(`department_id`)

#### `employees`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `organisation_id` int unsigned NOT NULL, `department_id` int unsigned DEFAULT NULL, `position_id` int unsigned DEFAULT NULL, `employee_code` varchar(50) DEFAULT NULL, `employment_status` enum('draft','onboarding','active','on_leave','suspended','terminated','archived') NOT NULL DEFAULT 'draft', `hire_date` date DEFAULT NULL, `termination_date` date DEFAULT NULL, `termination_reason` varchar(500) DEFAULT NULL, `reports_to` int unsigned DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_user_org`(`user_id`,`organisation_id`)
- **ENUM:** `employment_status` → 'draft','onboarding','active','on_leave','suspended','terminated','archived'
- **FK:** `fk_emp_user` → `users`(`id`) ON DELETE CASCADE; `fk_emp_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_emp_dept` → `departments`(`id`) ON DELETE SET NULL; `fk_emp_pos` → `positions`(`id`) ON DELETE SET NULL; `fk_emp_reports` → `employees`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_org`(`organisation_id`), `idx_dept`(`department_id`), `idx_status`(`employment_status`)

#### `employment_contracts`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned AUTO_INCREMENT, `employee_id` int unsigned NOT NULL, `contract_type` enum('permanent','fixed_term','probation','internship','freelance') NOT NULL DEFAULT 'permanent', `start_date` date NOT NULL, `end_date` date DEFAULT NULL, `salary_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `currency` char(3) NOT NULL DEFAULT 'USD', `payment_frequency` enum('monthly','biweekly','weekly','daily','hourly') NOT NULL DEFAULT 'monthly', `status` enum('draft','active','expired','terminated') NOT NULL DEFAULT 'draft', `document_url` varchar(500) DEFAULT NULL, `notes` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `contract_type` → 'permanent','fixed_term','probation','internship','freelance'; `payment_frequency` → 'monthly','biweekly','weekly','daily','hourly'; `status` → 'draft','active','expired','terminated'
- **FK:** `fk_ec_emp` → `employees`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_employee`(`employee_id`)

#### `leave_types`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `default_days` decimal(5,1) NOT NULL DEFAULT 0, `is_paid` tinyint(1) NOT NULL DEFAULT 1, `requires_approval` tinyint(1) NOT NULL DEFAULT 1, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **FK:** `fk_lt_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`)

#### `leave_requests`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` int unsigned AUTO_INCREMENT, `employee_id` int unsigned NOT NULL, `leave_type_id` int unsigned NOT NULL, `start_date` date NOT NULL, `end_date` date NOT NULL, `duration_days` decimal(5,1) NOT NULL, `reason` text, `status` enum('draft','submitted','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'draft', `approved_by` int unsigned DEFAULT NULL, `approved_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'draft','submitted','approved','rejected','cancelled','completed'
- **FK:** `fk_lr_emp` → `employees`(`id`) ON DELETE CASCADE; `fk_lr_type` → `leave_types`(`id`) ON DELETE CASCADE; `fk_lr_approver` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_employee`(`employee_id`), `idx_status`(`status`)

#### `leave_balances`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (5):** `id` int unsigned AUTO_INCREMENT, `employee_id` int unsigned NOT NULL, `leave_type_id` int unsigned NOT NULL, `total_days` decimal(5,1) NOT NULL DEFAULT 0, `used_days` decimal(5,1) NOT NULL DEFAULT 0, `pending_days` decimal(5,1) NOT NULL DEFAULT 0, `year` int unsigned NOT NULL
- **PK:** `id`
- **UK:** `uk_emp_type_year`(`employee_id`,`leave_type_id`,`year`)
- **FK:** `fk_lb_emp` → `employees`(`id`) ON DELETE CASCADE; `fk_lb_type` → `leave_types`(`id`) ON DELETE CASCADE

#### `staff_attendance`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `employee_id` int unsigned NOT NULL, `attendance_date` date NOT NULL, `clock_in` time DEFAULT NULL, `clock_out` time DEFAULT NULL, `status` enum('present','absent','late','early_leave','excused') NOT NULL DEFAULT 'present', `notes` text, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_emp_date`(`employee_id`,`attendance_date`)
- **ENUM:** `status` → 'present','absent','late','early_leave','excused'
- **FK:** `fk_sa_emp` → `employees`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_date`(`attendance_date`)

#### `payroll_components`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `type` enum('earning','deduction') NOT NULL, `calculation_type` enum('fixed','percentage','formula') NOT NULL DEFAULT 'fixed', `default_amount` decimal(14,2) NOT NULL DEFAULT 0.00, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `type` → 'earning','deduction'; `calculation_type` → 'fixed','percentage','formula'
- **FK:** `fk_pc_org` → `organisations`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`)

#### `payroll_runs`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned NOT NULL, `period_start` date NOT NULL, `period_end` date NOT NULL, `status` enum('draft','calculated','approved','posted','paid','closed') NOT NULL DEFAULT 'draft', `total_gross` decimal(14,2) NOT NULL DEFAULT 0.00, `total_deductions` decimal(14,2) NOT NULL DEFAULT 0.00, `total_net` decimal(14,2) NOT NULL DEFAULT 0.00, `posted_at` timestamp NULL DEFAULT NULL, `posted_by` int unsigned DEFAULT NULL, `paid_at` timestamp NULL DEFAULT NULL, `created_by` int unsigned NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `status` → 'draft','calculated','approved','posted','paid','closed'
- **FK:** `fk_pr_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_pr_creator` → `users`(`id`); `fk_pr_poster` → `users`(`id`) ON DELETE SET NULL
- **Indexes:** `idx_org`(`organisation_id`), `idx_status`(`status`)

#### `payroll_entries`
- **Introduced by:** Migration 070 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` int unsigned AUTO_INCREMENT, `payroll_run_id` int unsigned NOT NULL, `employee_id` int unsigned NOT NULL, `base_salary` decimal(14,2) NOT NULL DEFAULT 0.00, `total_earnings` decimal(14,2) NOT NULL DEFAULT 0.00, `total_deductions` decimal(14,2) NOT NULL DEFAULT 0.00, `net_pay` decimal(14,2) NOT NULL DEFAULT 0.00, `component_breakdown` json DEFAULT NULL
- **PK:** `id`
- **FK:** `fk_pe_run` → `payroll_runs`(`id`) ON DELETE CASCADE; `fk_pe_emp` → `employees`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_run`(`payroll_run_id`), `idx_employee`(`employee_id`)

### Migration 071 — `071_business_intelligence.sql`
**Scope:** KPI snapshot storage for trend analysis and reporting.

#### `kpi_snapshots`
- **Introduced by:** Migration 071 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (7):** `id` bigint unsigned AUTO_INCREMENT, `kpi_key` varchar(100) NOT NULL, `kpi_value` decimal(18,2) NOT NULL DEFAULT 0.00, `period_start` date NOT NULL, `period_end` date NOT NULL, `organisation_id` int unsigned DEFAULT NULL, `branch_id` int unsigned DEFAULT NULL, `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **Indexes:** `idx_kpi_key`(`kpi_key`), `idx_period`(`period_start`,`period_end`), `idx_org`(`organisation_id`), `idx_branch`(`branch_id`)

### Migration 072 — `072_integration_platform.sql`
**Scope:** API key management for external integrations.

#### `api_keys`
- **Introduced by:** Migration 072 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `organisation_id` int unsigned DEFAULT NULL, `user_id` int unsigned NOT NULL, `name` varchar(200) NOT NULL, `key_hash` varchar(255) NOT NULL, `key_prefix` varchar(20) NOT NULL, `scopes` json DEFAULT NULL, `rate_limit` int unsigned NOT NULL DEFAULT 100, `expires_at` timestamp NULL DEFAULT NULL, `last_used_at` timestamp NULL DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **CHECK:** json_valid(`scopes`)
- **FK:** `fk_ak_org` → `organisations`(`id`) ON DELETE CASCADE; `fk_ak_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_org`(`organisation_id`), `idx_user`(`user_id`), `idx_prefix`(`key_prefix`), `idx_active`(`is_active`)

### Migration 073 — `073_mobile_platform.sql`
**Scope:** Mobile push notifications, app version management, remote configuration, and push delivery logging.

#### `push_tokens`
- **Introduced by:** Migration 073 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (11):** `id` int unsigned AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `token` varchar(500) NOT NULL, `platform` enum('ios','android','web') NOT NULL, `app_version` varchar(50) DEFAULT NULL, `device_name` varchar(200) DEFAULT NULL, `device_model` varchar(100) DEFAULT NULL, `os_version` varchar(50) DEFAULT NULL, `is_active` tinyint(1) NOT NULL DEFAULT 1, `last_used_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_token`(`token`(255))
- **ENUM:** `platform` → 'ios','android','web'
- **FK:** `fk_pt_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_user`(`user_id`), `idx_platform`(`platform`)

#### `app_versions`
- **Introduced by:** Migration 073 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (8):** `id` int unsigned AUTO_INCREMENT, `platform` enum('ios','android') NOT NULL, `version` varchar(20) NOT NULL, `build_number` int unsigned NOT NULL, `min_version` varchar(20) DEFAULT NULL, `is_forced` tinyint(1) NOT NULL DEFAULT 0, `download_url` varchar(500) DEFAULT NULL, `release_notes` text, `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_platform_version`(`platform`,`version`)
- **ENUM:** `platform` → 'ios','android'

#### `app_settings`
- **Introduced by:** Migration 073 | Already exists in V3 baseline (definition reinforced)
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (6):** `id` int unsigned AUTO_INCREMENT, `key_name` varchar(100) NOT NULL, `key_value` text NOT NULL, `platform` enum('ios','android','both') NOT NULL DEFAULT 'both', `is_active` tinyint(1) NOT NULL DEFAULT 1, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- **PK:** `id`
- **UK:** `uk_key_platform`(`key_name`,`platform`)
- **ENUM:** `platform` → 'ios','android','both'
- See Part 2.1 baseline documentation for full details.

#### `push_log`
- **Introduced by:** Migration 073 | **Not in V3 baseline**
- **Engine:** InnoDB | **Charset:** utf8mb4 | **Collation:** utf8mb4_unicode_ci
- **Columns (10):** `id` bigint unsigned AUTO_INCREMENT, `user_id` int unsigned NOT NULL, `push_token_id` int unsigned DEFAULT NULL, `platform` enum('ios','android','web') NOT NULL, `title` varchar(255) DEFAULT NULL, `body` text, `notification_type` varchar(100) DEFAULT NULL, `status` enum('queued','sent','delivered','failed','opened') NOT NULL DEFAULT 'queued', `error_message` text, `sent_at` timestamp NULL DEFAULT NULL, `opened_at` timestamp NULL DEFAULT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- **PK:** `id`
- **ENUM:** `platform` → 'ios','android','web'; `status` → 'queued','sent','delivered','failed','opened'
- **FK:** `fk_pl_user` → `users`(`id`) ON DELETE CASCADE
- **Indexes:** `idx_user`(`user_id`), `idx_status`(`status`), `idx_created`(`created_at`)

---

## Part 2.3: Infrastructure and Platform Tables

This section catalogs all tables that support the platform infrastructure rather than core business domains. These tables handle authentication, authorisation, session management, auditing, event bus, workflow engine, notifications, monitoring, and mobile platform support. All definitions are fully documented in Part 2.1 (baseline) or Part 2.2 (enterprise migrations); this section provides a functional classification with cross-references.

**Total infrastructure tables:** 45

### 2.3.1 Security & Access Control
| Table | Located In | Purpose |
|-------|-----------|---------|
| `password_reset_tokens` | Part 2.1 | Password reset flow tokens |
| `email_verification_tokens` | Part 2.1 | Email/phone/2FA verification tokens |
| `roles` | Part 2.1 | Role definitions (system + org-scoped) |
| `permission_modules` | Part 2.1 | Permission module grouping |
| `permissions` | Part 2.1 | Flat permission keys with UI element metadata |
| `role_permissions` | Part 2.1 | Role–permission assignments |
| `user_roles` | Part 2.1 | User–role–organisation assignments |
| `role_theme_overrides` | Part 2.1 | Per-role UI theme token overrides |
| `api_keys` | Part 2.2 (M072) | External integration API key management |

### 2.3.2 Session & Authentication
| Table | Located In | Purpose |
|-------|-----------|---------|
| `user_sessions` | Part 2.1 | Web session storage |
| `user_sessions` | Part 2.1 | JWT/refresh token session management |
| `user_devices` | Part 2.1 | Registered device tokens |
| `push_tokens` | Part 2.2 (M073) | FCM/APNs push notification tokens |
| `user_organisations` | Part 2.2 (M060) | Junction: user→organisation membership |
| `user_branches` | Part 2.2 (M060) | Junction: user→branch membership |

### 2.3.3 Auditing & Logging
| Table | Located In | Purpose |
|-------|-----------|---------|
| `audit_logs` | Part 2.1 | Immutable record of data-changing operations |
| `revert_logs` | Part 2.1 | Super admin revert/rollback tracking |
| `communication_log` | Part 2.2 (M069) | Outbound/inbound communication history |
| `push_log` | Part 2.2 (M073) | Push notification delivery tracking |

### 2.3.4 Monitoring & Observability
| Table | Located In | Purpose |
|-------|-----------|---------|
| `notification_alerts` | Part 2.1 | Alert rule definitions |
| `client_error_reports` | Part 2.1 | Client-side JavaScript error reports |
| `web_vitals_metrics` | Part 2.1 | Web Vitals (LCP, CLS, FCP, etc.) |
| `kpi_snapshots` | Part 2.2 (M071) | KPI trend data for BI dashboards |

### 2.3.5 Event Bus & Messaging
| Table | Located In | Purpose |
|-------|-----------|---------|
| `processed_events` | Part 2.1 | Deduplication log for processed domain events |
| `published_events` | Part 2.1 | Outbox-pattern event publication queue |
| `outbox_cursors` | Part 2.1 | Outbox consumer cursor tracking |
| `processed_commands` | Part 2.1 | Deduplication log for processed commands |
| `dead_letter_entries` | Part 2.1 | Failed/unprocessable message dead letter queue |

### 2.3.6 Workflow Engine
| Table | Located In | Purpose |
|-------|-----------|---------|
| `workflow_definitions` | Part 2.1 | Workflow template/blueprint definitions |
| `workflow_instances` | Part 2.1 | Active/past workflow execution instances |
| `workflow_steps` | Part 2.1 | Individual step state within workflow instances |
| `workflow_events` | Part 2.1 | Events emitted during workflow execution |
| `workflow_event_subscriptions` | Part 2.1 | Event→workflow trigger subscriptions |
| `workflow_branch_instances` | Part 2.1 | Parallel branch state within workflows |

### 2.3.7 Notification Infrastructure
| Table | Located In | Purpose |
|-------|-----------|---------|
| `notification_templates` | Part 2.1 | Multi-channel notification templates |
| `notification_delivery` | Part 2.1 | Individual notification delivery records |
| `notification_analytics` | Part 2.1 | Notification delivery analytics |
| `notification_dead_letter_queue` | Part 2.1 | Failed notifications awaiting retry/dead-letter |
| `notification_broadcasts` | Part 2.1 | Mass notification broadcast records |
| `notification_types` | Part 2.1 | Notification type registry |
| `notification_providers` | Part 2.1 | External provider configuration |
| `notification_webhooks` | Part 2.1 | Outbound notification webhook endpoints |
| `notification_audit_trail` | Part 2.1 | Notification system audit trail |
| `notification_feature_flags` | Part 2.1 | Notification feature toggles |
| `notification_ab_tests` | Part 2.1 | A/B test definitions for notification content |
| `notification_ab_results` | Part 2.1 | A/B test result data |
| `notification_cleanup_policies` | Part 2.1 | Data retention/cleanup rules |
| `notification_replay_log` | Part 2.1 | Notification replay/redelivery log |
| `notification_digest_windows` | Part 2.1 | Digest delivery window configuration |
| `notification_rate_limits` | Part 2.1 | Per-channel rate limit configuration |
| `notification_template_versions` | Part 2.1 | Template version history |
| `user_quiet_hours` | Part 2.1 | Per-user quiet hours for notification suppression |
| `user_channel_preferences` | Part 2.1 | Per-user channel-level opt-in/opt-out |

### 2.3.8 Platform Configuration & Mobile
| Table | Located In | Purpose |
|-------|-----------|---------|
| `system_settings` | Part 2.1 | Global system configuration key-value store |
| `application_settings_history` | Part 2.1 | Historical changes to system settings |
| `design_tokens` | Part 2.1 | Published UI theme definitions |
| `app_versions` | Part 2.2 (M073) | Mobile app version tracking and forced upgrades |
| `app_settings` | Part 2.1 / M073 | Mobile app remote configuration |
| `scheduled_jobs` | Part 2.1 | Background job scheduling and tracking |

### 2.3.9 Coach Engine Infrastructure
| Table | Located In | Purpose |
|-------|-----------|---------|
| `coach_session_events` | Part 2.1 | Coach collaboration session event log |

### 2.3.10 Feature & Subscription Infrastructure
| Table | Located In | Purpose |
|-------|-----------|---------|
| `subscription_plans` | Part 2.1 | SaaS plan definitions |
| `subscription_features` | Part 2.1 | Plan feature definitions |
| `organisation_subscriptions` | Part 2.1 | Per-tenant feature usage tracking |
| `organisation_subscriptions` | Part 2.1 | Organisation subscription assignments |

---

## Part 3: Domain Classifications

This part groups all tables into subject-area domains. Each table belongs to one primary domain based on its core purpose. Reference/lookup tables are listed under their consuming domain.

### Domain Legend
| Domain | Description |
|--------|-------------|
| **USR** | User & Account Management |
| **AUTH** | Authentication, Authorisation & Security |
| **ORG** | Organisation & Branch Management |
| **BOOK** | Booking, Scheduling & Resource Management |
| **MKT** | Marketplace, Products & Orders |
| **FIN** | Payments, Wallets & Financial Accounting |
| **COMP** | Tournaments, Competition & Rankings |
| **ACA** | Academy & Training |
| **MEM** | Membership & Loyalty |
| **SPT** | Sports & Facility Reference |
| **HR** | HR, Payroll & Leave |
| **SUPPORT** | Customer Support & Tickets |
| **CRM** | CRM, Marketing & Communication |
| **SUB** | Subscription & Billing |
| **NOTIF** | Notification Infrastructure |
| **EVENT** | Event Bus & Workflow Engine |
| **MON** | Monitoring, Observability & Auditing |
| **CFG** | System Configuration & Mobile Platform |
| **INT** | Integration Platform |

### Domain-to-Table Mapping

#### USR — User & Account Management (14 tables)
| Table | Source | Context |
|-------|--------|---------|
| `users` | Part 2.1 | Core user entity |
| `user_devices` | Part 2.1 | Per-user preference key-value store |
| `user_devices` | Part 2.1 | User device/token registration |
| `user_organisations` | Part 2.2 (M060) | User→organisation membership |
| `user_branches` | Part 2.2 (M060) | User→branch membership |
| `player_profiles` | Part 2.1 | Extended player attributes |
| `player_levels` | Part 2.1 | Skill level reference |
| `player_sport_interests` | Part 2.1 | User→sport interest mapping |
| `player_ratings` | Part 2.1 | Peer ratings and reviews |
| `seller_profiles` | Part 2.1 | Seller payout account configuration |
| `withdrawal_requests` | Part 2.1 | Payout/settlement withdrawal requests |
| `coach_session_events` | Part 2.1 | Coach collaboration session events |

#### AUTH — Authentication, Authorisation & Security (9 tables)
| Table | Source | Context |
|-------|--------|---------|
| `user_sessions` | Part 2.1 | Web session storage |
| `user_sessions` | Part 2.1 | JWT/refresh token sessions |
| `password_reset_tokens` | Part 2.1 | Password reset flow |
| `email_verification_tokens` | Part 2.1 | Email/phone/2FA verification |
| `roles` | Part 2.1 | Role definitions |
| `permission_modules` | Part 2.1 | Module grouping for permissions |
| `permissions` | Part 2.1 | Flat permission key registry |
| `role_permissions` | Part 2.1 | Role↔permission assignment |
| `user_roles` | Part 2.1 | User↔role↔organisation assignment |

#### ORG — Organisation & Branch Management (13 tables)
| Table | Source | Context |
|-------|--------|---------|
| `organisations` | Part 2.1 | Core organisation (venue/club/academy) |
| `organisation_types` | Part 2.1 | Organisation type reference |
| `branches` | Part 2.1 | Organisation branches/outlets |
| `branch_types` | Part 2.1 | Branch type reference |
| `org_announcements` | Part 2.2 (M065) | Organisation-wide announcements |
| `resources` | Part 2.1 | Bookable resources (courts, fields) |
| `resource_types` | Part 2.1 | Resource type definitions |
| `resource_type_attributes` | Part 2.1 | EAV attribute definitions for resource types |
| `resource_attribute_values` | Part 2.1 | EAV attribute values per resource |
| `resource_maintenance` | Part 2.1 | Maintenance scheduling |
| `resource_peak_hours` | Part 2.1 | Peak hour configuration per resource |
| `resource_unavailability` | Part 2.1 | Unavailability windows per resource |

#### BOOK — Booking, Scheduling & Resource Management (7 tables)
| Table | Source | Context |
|-------|--------|---------|
| `bookings` | Part 2.1 | Core booking entity |
| `booking_intents` | Part 2.1 | Pre-booking intent/reservation |
| `booking_slots` | Part 2.1 | Individual time slots within a booking |
| `booking_status_history` | Part 2.1 | Booking status state machine log |
| `peak_hour_pricing` | Part 2.1 | Resource-specific peak hour pricing rules |
| `pricing_rules` | Part 2.2 (M053) | Dynamic pricing rule engine |
| `pricing_seasons` | Part 2.2 (M053) | Seasonal pricing multipliers |

#### MKT — Marketplace, Products & Orders (25 tables)
| Table | Source | Context |
|-------|--------|---------|
| `products` | Part 2.1 | Core product entity |
| `product_categories` | Part 2.1 | Hierarchical product categories |
| `product_images` | Part 2.1 | Product image gallery |
| `product_reviews` | Part 2.1 | Product ratings and reviews |
| `product_specifications` | Part 2.1 | Structured product specs |
| `product_tags` | Part 2.1 | Product↔tag mapping |
| `product_variants` | Part 2.1 | SKU/variant with price and stock |
| `brands` | Part 2.1 | Product brand reference |
| `tags` | Part 2.1 | Tag reference |
| `related_products` | Part 2.1 | Cross-sell/up-sell relationships |
| `cart_items` | Part 2.1 | Active shopping carts |
| `cart_items` | Part 2.1 | Cart line items |
| `wishlist_items` | Part 2.1 | User wishlist entries |
| `orders` | Part 2.1 | Customer orders |
| `order_items` | Part 2.1 | Order line items |
| `order_status_history` | Part 2.1 | Order state machine log |
| `warehouses` | Part 2.2 (M067) | Warehouse/inventory locations |
| `suppliers` | Part 2.2 (M067) | Product supplier records |
| `purchase_orders` | Part 2.2 (M067) | Supplier purchase orders |
| `purchase_order_items` | Part 2.2 (M067) | PO line items |
| `stock_transfers` | Part 2.2 (M067) | Inter-warehouse stock movement |
| `inventory_logs` | Part 2.1 | Inventory change audit trail |

#### FIN — Payments, Wallets & Financial Accounting (20 tables)
| Table | Source | Context |
|-------|--------|---------|
| `payment_gateway_config` | Part 2.1 | Per-org gateway configuration |
| `payment_methods` | Part 2.1 | Payment method reference |
| `payment_transactions` | Part 2.1 | Payment processing records |
| `user_wallets` | Part 2.1 | User/organisation digital wallets |
| `wallet_transactions` | Part 2.1 | Wallet credit/debit log |
| `platform_accounts` | Part 2.1 | Platform float/commission accounts |
| `coupons` | Part 2.1 | Discount coupon definitions |
| `coupon_usages` | Part 2.1 | Coupon redemption log |
| `ledger_entries` | Part 2.2 (M054) | Financial ledger journal entries |
| `settlement_batches` | Part 2.2 (M054) | Settlement batch summaries |
| `chart_of_accounts` | Part 2.2 (M068) | Double-entry accounting COA |
| `accounting_periods` | Part 2.2 (M068) | Fiscal period definitions |
| `general_ledger` | Part 2.2 (M068) | Immutable journal entries |
| `invoices` | Part 2.2 (M068) | Sales/purchase invoices |
| `invoice_items` | Part 2.2 (M068) | Invoice line items |
| `tax_rates` | Part 2.2 (M068) | Tax rate configuration |
| `exchange_rates` | Part 2.1 | Currency exchange rates |
| `currencies` | Part 2.1 | Currency reference |

#### COMP — Tournaments, Competition & Rankings (17 tables)
| Table | Source | Context |
|-------|--------|---------|
| `tournaments` | Part 2.1 | Tournament entity |
| `tournament_participants` | Part 2.2 (M056) | Tournament participant registry |
| `tournament_matches` | Part 2.1 | Tournament match scheduling |
| `tournament_groups` | Part 2.2 (M062) | Tournament group stage groups |
| `tournament_group_members` | Part 2.2 (M062) | Group stage membership |
| `tournament_match_players` | Part 2.2 (M062) | Team match player assignments |
| `tournament_match_results` | Part 2.2 (M062) | Match results with flexible scoring |
| `tournament_standings` | Part 2.2 (M062) | Persisted group standings |
| `tournament_registrations` | Part 2.1 | Tournament registration records |
| `public_match_details` | Part 2.1 | Public match summary view |
| `elo_ratings` | Part 2.2 (M056) | Player ELO rating tracking |
| `seasons` | Part 2.2 (M063) | Season definitions |
| `leagues` | Part 2.2 (M063) | League definitions |
| `league_divisions` | Part 2.2 (M063) | League division/tier structure |
| `league_teams` | Part 2.2 (M063) | Team registration |
| `league_matches` | Part 2.2 (M063) | League match scheduling |
| `league_results` | Part 2.2 (M063) | League match results |
| `league_standings` | Part 2.2 (M063) | League division standings |
| `player_statistics` | Part 2.2 (M063) | Per-player league statistics |
| `team_statistics` | Part 2.2 (M063) | Per-team league statistics |

#### ACA — Academy & Training (5 tables)
| Table | Source | Context |
|-------|--------|---------|
| `academy_programs` | Part 2.2 (M061) | Training program templates |
| `academy_groups` | Part 2.2 (M061) | Program cohort groups |
| `academy_enrollments` | Part 2.2 (M061) | Player enrollment records |
| `academy_group_sessions` | Part 2.2 (M061) | Scheduled group training sessions |
| `academy_attendance` | Part 2.2 (M061) | Per-session attendance records |

#### MEM — Membership & Loyalty (10 tables)
| Table | Source | Context |
|-------|--------|---------|
| `membership_plans` | Part 2.2 (M055) | Membership plan/tier definitions |
| `membership_benefits` | Part 2.1 | Benefit definitions |
| `user_memberships` | Part 2.1 | User membership assignments |
| `membership_history` | Part 2.1 | Membership change log |
| `memberships` | Part 2.2 (M055) | Active user membership records |
| `loyalty_points` | Part 2.2 (M055) | Player loyalty point balances |
| `loyalty_campaigns` | Part 2.2 (M055) | Points multiplier campaigns |
| `reward_catalog` | Part 2.2 (M055) | Redeemable rewards |
| `reward_claims` | Part 2.2 (M055) | Reward redemption records |

#### SPT — Sports & Facility Reference (4 tables)
| Table | Source | Context |
|-------|--------|---------|
| `sports` | Part 2.1 | Sport reference data |
| `player_levels` | Part 2.1 | Skill level reference |

#### HR — HR, Payroll & Leave (11 tables)
| Table | Source | Context |
|-------|--------|---------|
| `departments` | Part 2.2 (M070) | Organisation departments |
| `positions` | Part 2.2 (M070) | Job positions/roles |
| `employees` | Part 2.2 (M070) | Employee records |
| `employment_contracts` | Part 2.2 (M070) | Employment terms |
| `leave_types` | Part 2.2 (M070) | Leave category definitions |
| `leave_requests` | Part 2.2 (M070) | Leave request/workflow |
| `leave_balances` | Part 2.2 (M070) | Annual leave balance tracking |
| `staff_attendance` | Part 2.2 (M070) | Daily clock-in/out |
| `payroll_components` | Part 2.2 (M070) | Earnings/deductions definitions |
| `payroll_runs` | Part 2.2 (M070) | Payroll cycle records |
| `payroll_entries` | Part 2.2 (M070) | Per-employee payroll calculations |

#### SUPPORT — Customer Support (2 tables)
| Table | Source | Context |
|-------|--------|---------|
| `support_tickets` | Part 2.2 (M066) | Customer support tickets |
| `support_ticket_messages` | Part 2.2 (M066) | Ticket message threads |

#### CRM — CRM, Marketing & Communication (5 tables)
| Table | Source | Context |
|-------|--------|---------|
| `customer_segments` | Part 2.2 (M069) | Customer segment definitions |
| `segment_members` | Part 2.2 (M069) | User segment membership |
| `leads` | Part 2.2 (M069) | Sales leads |
| `marketing_campaigns` | Part 2.2 (M069) | Campaign definitions |
| `communication_log` | Part 2.2 (M069) | Outbound/inbound communication history |

#### SUB — Subscription & Billing (4 tables)
| Table | Source | Context |
|-------|--------|---------|
| `subscription_plans` | Part 2.1 | SaaS plan definitions |
| `subscription_features` | Part 2.1 | Plan feature definitions |
| `organisation_subscriptions` | Part 2.1 | Feature usage counters |
| `organisation_subscriptions` | Part 2.1 | Org subscription assignments |

#### NOTIF — Notification Infrastructure (19 tables)
| Table | Source | Context |
|-------|--------|---------|
| `notification_templates` | Part 2.1 | Multi-channel template storage |
| `notification_delivery` | Part 2.1 | Individual delivery records |
| `notification_analytics` | Part 2.1 | Delivery analytics |
| `notification_dead_letter_queue` | Part 2.1 | Failed notification retry queue |
| `notification_broadcasts` | Part 2.1 | Mass broadcast records |
| `notification_types` | Part 2.1 | Type registry |
| `notification_providers` | Part 2.1 | External provider configs |
| `notification_webhooks` | Part 2.1 | Outbound webhook endpoints |
| `notification_audit_trail` | Part 2.1 | System audit trail |
| `notification_feature_flags` | Part 2.1 | Feature toggles |
| `notification_ab_tests` | Part 2.1 | A/B test definitions |
| `notification_ab_results` | Part 2.1 | A/B test results |
| `notification_cleanup_policies` | Part 2.1 | Data retention rules |
| `notification_replay_log` | Part 2.1 | Redelivery log |
| `notification_alerts` | Part 2.1 | Alert rule definitions |
| `notification_digest_windows` | Part 2.1 | Digest delivery windows |
| `notification_rate_limits` | Part 2.1 | Per-channel rate limits |
| `notification_template_versions` | Part 2.1 | Version history |
| `notification_ab_tests` | Part 2.1 | (duplicate removed from count) |

#### EVENT — Event Bus & Workflow Engine (11 tables)
| Table | Source | Context |
|-------|--------|---------|
| `processed_events` | Part 2.1 | Domain event deduplication |
| `published_events` | Part 2.1 | Outbox event queue |
| `outbox_cursors` | Part 2.1 | Consumer cursor tracking |
| `processed_commands` | Part 2.1 | Command deduplication |
| `dead_letter_entries` | Part 2.1 | Failed message queue |
| `workflow_definitions` | Part 2.1 | Workflow blueprint definitions |
| `workflow_instances` | Part 2.1 | Workflow execution instances |
| `workflow_steps` | Part 2.1 | Step state within instances |
| `workflow_events` | Part 2.1 | Workflow-emitted events |
| `workflow_event_subscriptions` | Part 2.1 | Event→workflow triggers |
| `workflow_branch_instances` | Part 2.1 | Parallel branch state |

#### MON — Monitoring, Observability & Auditing (6 tables)
| Table | Source | Context |
|-------|--------|---------|
| `audit_logs` | Part 2.1 | Data change audit trail |
| `revert_logs` | Part 2.1 | Super admin revert tracking |
| `client_error_reports` | Part 2.1 | Client-side JS errors |
| `web_vitals_metrics` | Part 2.1 | Web Vitals measurements |
| `kpi_snapshots` | Part 2.2 (M071) | KPI trend data |
| `scheduled_jobs` | Part 2.1 | Background job scheduling |

#### CFG — System Configuration & Mobile Platform (6 tables)
| Table | Source | Context |
|-------|--------|---------|
| `system_settings` | Part 2.1 | Global key-value configuration |
| `application_settings_history` | Part 2.1 | Settings change history |
| `design_tokens` | Part 2.1 | UI theme definitions |
| `role_theme_overrides` | Part 2.1 | Per-role theme tokens |
| `app_settings` | Part 2.2 (M073) | Mobile remote configuration |
| `app_versions` | Part 2.2 (M073) | Mobile version management |

#### INT — Integration Platform (3 tables)
| Table | Source | Context |
|-------|--------|---------|
| `api_keys` | Part 2.2 (M072) | External API key management |
| `push_tokens` | Part 2.2 (M073) | Push notification tokens |
| `push_log` | Part 2.2 (M073) | Push delivery history |

---

## Part 4: Data Sensitivity Classifications

This part classifies data by sensitivity level and identifies which tables/columns contain regulated or sensitive information.

### Sensitivity Tiers

| Tier | Label | Description | Examples |
|------|-------|-------------|---------|
| **T1** | Public | Non-sensitive, intended for public consumption | Sport names, country lists, published theme tokens |
| **T2** | Internal | Business-operational data, internal use only | Booking counts, resource availability, match scores |
| **T3** | Confidential | Business-sensitive, access restricted by role | Revenue data, commission rates, org settings |
| **T4** | PII | Personally Identifiable Information | Names, emails, phone numbers, addresses |
| **T5** | Authentication | Credentials and secrets | Password hashes, API key hashes, 2FA secrets |
| **T6** | Financial | Payment and transaction data | Payment amounts, wallet balances, bank details |
| **T7** | Regulated | Subject to regulatory compliance | Audit logs, consent records, tax data |

### PII Tables (T4)
Tables containing personal data:
- `users` — name, email, phone, profile image, IP, location
- `player_profiles` — bio, date_of_birth, nationality, gender, phone, address fields, height, weight
- `support_ticket_messages` — user messages (may contain PII)
- `employees` — employee_code linked to user identity
- `employment_contracts` — salary (also T6)
- `staff_attendance` — clock-in/out times
- `leads` — name, email, phone
- `audit_logs` — may capture old/new values containing PII

### Authentication Tables (T5)
Tables containing credentials and secrets:
- `users` — `password_hash`, `two_factor_secret`
- `api_keys` — `key_hash`
- `password_reset_tokens` — `token`
- `email_verification_tokens` — `token`
- `user_sessions` — `token`
- `user_sessions` — `session_token`, `refresh_token`

### Financial Tables (T6)
Tables containing financial data:
- `payment_transactions` — `amount`, `gateway_response`
- `user_wallets` — `balance`, `held_balance`, `available_balance`
- `wallet_transactions` — `amount`, `balance_before`, `balance_after`
- `ledger_entries` — `amount`
- `settlement_batches` — all amount fields
- `general_ledger` — `debit`, `credit`, `balance`
- `invoices` — `subtotal`, `tax_amount`, `total`, `paid_amount`
- `invoice_items` — `unit_price`, `tax_amount`, `total`
- `payroll_runs` — `total_gross`, `total_deductions`, `total_net`
- `payroll_entries` — `base_salary`, `total_earnings`, `total_deductions`, `net_pay`
- `employment_contracts` — `salary_amount`
- `seller_profiles` — `account_identifier`
- `withdrawal_requests` — `amount`
- `purchase_orders` — `total_cost`
- `purchase_order_items` — `unit_cost`, `total_cost`
- `coupons` — discount values
- `platform_accounts` — platform financial accounts

### Regulated Tables (T7)
Tables requiring compliance tracking:
- `audit_logs` — full change history
- `revert_logs` — revert actions
- `notification_audit_trail` — notification system audit
- `tax_rates` — tax configuration

### Security by Layer

| Layer | Mechanism | Applied To |
|-------|-----------|-----------|
| Password hashing | bcrypt/argon2 | `users.password_hash` |
| 2FA | TOTP | `users.two_factor_secret` |
| API key hashing | SHA-256 | `api_keys.key_hash` |
| Token hashing | Hashed on store | `password_reset_tokens`, `email_verification_tokens` |
| Audit logging | Trigger/application | All state-changing operations |
| Role-based access | `user_roles` + `role_permissions` | All UI and API access |

---

## Part 5: ENUM Value Catalog

This part catalogs all ENUM column definitions across the database, organized by functional domain. ENUMs are the primary mechanism for constraining state machines and classification fields.

**Total ENUM definitions:** ~215 across baseline (94) and migrations (121).

### 5.1 Booking & Match Status Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `bookings` | `booking_type` | `public_match`,`private_match`,`academy`,`clinic`,`coach_session` | Baseline |
| `bookings` | `booking_status` | `pending`,`pending_payment`,`confirmed`,`cancelled`,`completed`,`expired`,`checked_in`,`no_show` | Baseline + M034 |
| `bookings` | `payment_status` | `pending`,`paid`,`refunded`,`partially_refunded`,`failed`,`penalty` | Baseline |
| `bookings` | `visibility` | `public`,`private` | Baseline |
| `booking_intents` | `booking_type` | `public_match`,`private_match`,`academy`,`clinic`,`coach_session` | Baseline |
| `booking_intents` | `payment_status` | `created`,`pending`,`processing`,`paid`,`failed`,`cancelled`,`expired`,`refunded` | M034 |
| `matches` | `type` | `public` | M017 |
| `matches` | `status` | `open`,`full`,`closed`,`in_progress`,`completed`,`cancelled`,`void` | M017 |
| `match_participants` | `role` | `host`,`joiner` | M021 |
| `match_sessions` | `status` | `in_progress`,`completed`,`voided` | M022 |
| `public_match_details` | `visibility` | `public`,`invite_only` | M018 |
| `public_match_details` | `target_gender` | `male`,`female`,`any` | M018 |
| `booking_invitations` | `status` | `pending`,`accepted`,`declined` | Baseline |
| `invitations` | `status` | `sent`,`read`,`declined`,`expired` | M019 |
| `join_requests` | `status` | `submitted`,`withdrawn`,`approved`,`rejected`,`auto_rejected` | M020 |

### 5.2 Coach & Academy Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `player_profiles` | `coach_status` | `none`,`pending`,`approved`,`rejected` | Baseline |
| `coach_sessions` | `status` | `pending_court`,`pending_acceptance`,`scheduled`,`confirmed`,`in_progress`,`completed`,`cancelled`,`no_show` | Baseline |
| `coach_org_agreements` | `status` | `pending`,`accepted`,`rejected` | Baseline |
| `coach_org_agreements` | `initiated_by` | `coach`,`org` | Baseline |
| `academy_programs` | `status` | `draft`,`published`,`open`,`full`,`running`,`completed`,`cancelled`,`archived` | M061 |
| `academy_programs` | `price_type` | `FREE`,`FIXED`,`MEMBERS_ONLY` | M061 |
| `academy_groups` | `status` | `active`,`inactive`,`archived` | M061 |
| `academy_enrollments` | `status` | `pending`,`confirmed`,`waiting`,`cancelled`,`completed` | M061 |
| `academy_group_sessions` | `status` | `scheduled`,`in_progress`,`completed`,`cancelled` | M061 |
| `academy_attendance` | `attendance_status` | `present`,`absent`,`excused`,`late` | M061 |

### 5.3 Tournament & League Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `tournaments` | `tournament_type` | `platform`,`community` | Baseline |
| `tournaments` | `status` | `draft`,`open`,`in_progress`,`completed`,`cancelled` | Baseline + M056 |
| `tournaments` | `format` | `knockout`,`double_elimination`,`round_robin`,`swiss`,`group_stage_knockout`,`league`,`custom` | M056 |
| `tournaments` | `registration_type` | `individual`,`team`,`academy`,`invitation`,`public` | M056 |
| `tournaments` | `price_type` | `FREE`,`FIXED`,`MEMBERS_ONLY` | M062 |
| `tournament_matches` | `status` | `scheduled`,`in_progress`,`completed`,`walkover`,`forfeit`,`no_show` | M056 |
| `tournament_participants` | `status` | `registered`,`approved`,`rejected`,`checked_in` | M056 |
| `tournament_match_players` | `side` | `home`,`away` | M062 |
| `tournament_match_results` | `result_status` | `submitted`,`confirmed`,`disputed` | M062 |
| `seasons` | `status` | `draft`,`published`,`running`,`completed`,`archived` | M063 |
| `leagues` | `format` | `round_robin`,`double_round_robin` | M063 |
| `leagues` | `price_type` | `FREE`,`FIXED`,`MEMBERS_ONLY` | M063 |
| `leagues` | `status` | `draft`,`registration_open`,`registration_closed`,`running`,`completed`,`cancelled`,`archived` | M063 |
| `league_divisions` | `status` | `active`,`inactive`,`archived` | M063 |
| `league_teams` | `status` | `pending`,`confirmed`,`waiting`,`cancelled`,`withdrawn` | M063 |
| `league_matches` | `status` | `scheduled`,`in_progress`,`completed`,`cancelled`,`walkover` | M063 |
| `league_results` | `result_status` | `submitted`,`confirmed`,`disputed` | M063 |

### 5.4 Payment & Financial Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `payment_transactions` | `payment_method` | `wallet`,`cash`,`card`,`bank_transfer`,`online` | Baseline |
| `payment_transactions` | `payment_status` | `created`,`pending`,`processing`,`paid`,`failed`,`cancelled`,`expired`,`refunded` | Baseline + M005 + M034 |
| `wallet_transactions` | `transaction_type` | `deposit`,`withdrawal`,`payment`,`refund`,`commission`,`settlement`,`due`,`penalty` | Baseline |
| `wallet_transactions` | `direction` | `credit`,`debit` | Baseline |
| `user_wallets` | `owner_type` | `user`,`organisation` | Baseline |
| `user_wallets` | `status` | `active`,`frozen`,`closed` | Baseline |
| `platform_accounts` | `account_type` | `float`,`commission`,`refund_hold`,`payout` | Baseline |
| `withdrawal_requests` | `status` | `pending`,`approved`,`rejected`,`cancelled` | Baseline |
| `ledger_entries` | `source_type` | `booking`,`academy`,`membership`,`marketplace`,`wallet`,`subscription`,`adjustment`,`refund`,`coupon`,`commission`,`settlement` | M054 |
| `ledger_entries` | `account_type` | `platform_revenue`,`club_revenue`,`wallet_liability`,`customer_balance`,`tax`,`discount`,`commission`,`receivable`,`payable`,`refund` | M054 |
| `ledger_entries` | `side` | `debit`,`credit` | M054 |
| `settlement_batches` | `batch_type` | `daily`,`weekly`,`monthly`,`manual` | M054 |
| `settlement_batches` | `status` | `pending`,`completed`,`failed` | M054 |
| `chart_of_accounts` | `type` | `asset`,`liability`,`equity`,`revenue`,`expense`,`contra_asset`,`contra_liability`,`contra_equity`,`contra_revenue`,`contra_expense` | M068 |
| `accounting_periods` | `status` | `open`,`closed`,`locked` | M068 |
| `invoices` | `invoice_type` | `sales`,`purchase`,`credit_note`,`debit_note` | M068 |
| `invoices` | `status` | `draft`,`issued`,`paid`,`partially_paid`,`overdue`,`cancelled` | M068 |
| `tax_rates` | `type` | `percentage`,`fixed` | M068 |

### 5.5 Marketplace & Product Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `products` | `seller_type` | `org`,`player` | Baseline |
| `products` | `gender` | `male`,`female`,`unisex` | Baseline |
| `products` | `age_group` | `adult`,`youth`,`junior`,`toddler` | Baseline |
| `products` | `skill_level` | `beginner`,`intermediate`,`professional`,`elite` | Baseline |
| `products` | `status` | `draft`,`pending`,`active`,`sold`,`archived`,`out_of_stock` | Baseline |
| `products` | `condition_status` | `new`,`like_new`,`good`,`fair`,`used` | Baseline |
| `orders` | `status` | `pending`,`confirmed`,`processing`,`shipped`,`delivered`,`cancelled`,`refunded` | Baseline |
| `orders` | `payment_status` | `unpaid`,`paid`,`refunded`,`partial_refund` | Baseline |
| `orders` | `cash_holder` | `org`,`courtzon` | Baseline |
| `orders` | `cash_collection_status` | `expected_from_customer`,`under_collection`,`held_by_org`,`held_by_courtzon` | Baseline |
| `orders` | `settlement_status` | `pending`,`settled` | Baseline |
| `related_products` | `relation_type` | `cross_sell`,`up_sell`,`accessory`,`similar` | Baseline |
| `warehouses` | `status` | `active`,`inactive`,`archived` | M067 |
| `suppliers` | `status` | `active`,`inactive` | M067 |
| `purchase_orders` | `status` | `draft`,`submitted`,`approved`,`received`,`cancelled` | M067 |
| `stock_transfers` | `status` | `pending`,`completed`,`cancelled` | M067 |
| `inventory_logs` | `movement_type` | `in`,`out`,`adjustment`,`reservation`,`release`,`return` | Baseline |

### 5.6 Membership & Loyalty Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `membership_plans` | `plan_type` | `monthly`,`quarterly`,`semiannual`,`annual`,`unlimited`,`credits`,`session_bundle`,`corporate`,`family`,`student` | M055 |
| `memberships` | `status` | `active`,`expired`,`cancelled`,`pending` | M055 |
| `user_memberships` | `status` | `pending`,`active`,`frozen`,`expired`,`cancelled`,`completed` | M020 |
| `user_memberships` | `renewal_type` | `auto`,`manual`,`none` | M020 |
| `loyalty_points` | `current_tier` | `bronze`,`silver`,`gold`,`platinum`,`diamond` | M055 |
| `reward_catalog` | `reward_type` | `wallet_credit`,`coupon`,`free_booking`,`free_session`,`voucher`,`merchandise`,`tournament_ticket` | M055 |

### 5.7 Notification Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `notification_templates` | `type` | `info`,`success`,`warning`,`error`,`reminder` | M013 |
| `notification_templates` | `priority` | `low`,`normal`,`high`,`critical` | M013 |
| `notification_templates` | `content_format` | `handlebars`,`text`,`html` | M018 |
| `notification_templates` | `status` | `draft`,`published`,`archived` | M018 |
| `notification_delivery` | `channel` | `in_app`,`push`,`email`,`sms` | M013 |
| `notification_delivery` | `status` | `queued`,`processing`,`sent`,`delivered`,`failed`,`dead_letter` | M013 |
| `notification_broadcasts` | `type` | `info`,`success`,`warning`,`error`,`reminder` | M014 |
| `notification_broadcasts` | `priority` | `low`,`normal`,`high`,`critical` | M014 |
| `notification_alerts` | `severity` | `info`,`warning`,`critical` | M016 |
| `notification_types` | `priority` | `low`,`normal`,`high`,`critical` | M017 |

### 5.8 Organisation & Resource Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `branches` | `access_type` | `open`,`restricted`,`invite_only` | Baseline |
| `resources` | `pricing_type` | `per_hour`,`fixed` | Baseline |
| `resource_type_attributes` | `attribute_type` | `text`,`number`,`boolean`,`select`,`multiselect`,`date`,`image` | Baseline |
| `scheduled_jobs` | `job_type` | `cleanup`,`report`,`backup`,`sync`,`crawl`,`email_digest`,`recurring_booking` | Baseline |
| `scheduled_jobs` | `job_status` | `pending`,`running`,`completed`,`failed`,`cancelled` | Baseline |
| `provinces` | `type` | `province`,`state`,`governorate`,`region`,`emirate`,`county` | Baseline |

### 5.9 HR & Support Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `employees` | `employment_status` | `draft`,`onboarding`,`active`,`on_leave`,`suspended`,`terminated`,`archived` | M070 |
| `employment_contracts` | `contract_type` | `permanent`,`fixed_term`,`probation`,`internship`,`freelance` | M070 |
| `employment_contracts` | `payment_frequency` | `monthly`,`biweekly`,`weekly`,`daily`,`hourly` | M070 |
| `employment_contracts` | `status` | `draft`,`active`,`expired`,`terminated` | M070 |
| `leave_requests` | `status` | `draft`,`submitted`,`approved`,`rejected`,`cancelled`,`completed` | M070 |
| `staff_attendance` | `status` | `present`,`absent`,`late`,`early_leave`,`excused` | M070 |
| `payroll_components` | `type` | `earning`,`deduction` | M070 |
| `payroll_components` | `calculation_type` | `fixed`,`percentage`,`formula` | M070 |
| `payroll_runs` | `status` | `draft`,`calculated`,`approved`,`posted`,`paid`,`closed` | M070 |
| `support_tickets` | `category` | `general`,`billing`,`technical`,`account`,`feature_request`,`other` | M066 |
| `support_tickets` | `priority` | `low`,`normal`,`high`,`urgent` | M066 |
| `support_tickets` | `status` | `open`,`in_progress`,`waiting_on_customer`,`resolved`,`closed` | M066 |
| `org_announcements` | `priority` | `low`,`normal`,`high`,`urgent` | M065 |
| `org_announcements` | `status` | `draft`,`published`,`archived` | M065 |

### 5.10 CRM & Marketing Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `leads` | `status` | `new`,`qualified`,`converted`,`lost` | M069 |
| `marketing_campaigns` | `type` | `email`,`sms`,`push`,`in_app`,`multi_channel` | M069 |
| `marketing_campaigns` | `status` | `draft`,`active`,`paused`,`completed`,`cancelled` | M069 |
| `communication_log` | `channel` | `email`,`sms`,`push`,`in_app`,`whatsapp` | M069 |
| `communication_log` | `direction` | `outbound`,`inbound` | M069 |
| `communication_log` | `status` | `sent`,`delivered`,`failed`,`opened`,`clicked` | M069 |

### 5.11 Workflow & Event Bus Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `workflow_instances` | `status` | `pending`,`active`,`completed`,`failed`,`compensating`,`compensated`,`cancelled` | M040 |
| `workflow_steps` | `step_type` | `activity`,`compensation` | M040 |
| `workflow_steps` | `status` | `pending`,`active`,`completed`,`failed`,`skipped`,`compensated` | M040 |
| `workflow_steps` | `compensation_status` | `none`,`pending`,`completed`,`failed` | M040 |
| `workflow_branch_instances` | `branch_type` | `parallel`,`condition` | M048 |
| `workflow_branch_instances` | `status` | `pending`,`active`,`completed`,`failed`,`skipped` | M048 |
| `dead_letter_entries` | `message_category` | `event`,`command` | M043 |
| `dead_letter_entries` | `resolution_status` | `pending`,`retrying`,`resolved`,`ignored` | M043 |

### 5.12 Mobile Platform Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `push_tokens` | `platform` | `ios`,`android`,`web` | M073 |
| `app_versions` | `platform` | `ios`,`android` | M073 |
| `app_settings` | `platform` | `ios`,`android`,`both` | M073 |
| `push_log` | `platform` | `ios`,`android`,`web` | M073 |
| `push_log` | `status` | `queued`,`sent`,`delivered`,`failed`,`opened` | M073 |
| `user_devices` | `platform` | `ios`,`android`,`web` | Baseline |

### 5.13 Permission & System Enums

| Table | Column | Values | Source |
|-------|--------|--------|--------|
| `permissions` | `element_type` | `button`,`tab`,`page`,`section`,`action`,`field` | Baseline |
| `cities` | `type` | `city`,`district`,`town`,`village`,`neighborhood` | Baseline |
| `system_settings` | `value_type` | `string`,`number`,`boolean`,`json`,`select` | M019 |
| `pricing_rules` | `rule_type` | `fixed`,`percentage_increase`,`percentage_decrease`,`multiplier`,`min_price`,`max_price`,`override` | M053 |
| `pricing_rules` | `scope` | `global`,`organisation`,`branch`,`resource` | M053 |

---

## Part 6: Foreign Key Reference Graph

This part summarizes the foreign key relationship patterns across the database. Detailed FK definitions are documented per-table in Parts 2.1 and 2.2.

### Most-Referenced Tables (FK Targets)

| Table | Referenced By (# of FKs) | Key Domains |
|-------|--------------------------|------------|
| `users` | 35+ | Owner, creator, approver, player, coach, seller references across most domains |
| `organisations` | 20+ | Org-scoped entities across all domains |
| `branches` | 6 | Resource, booking, user assignment |
| `sports` | 5 | Products, tournaments, leagues, player interests |
| `products` | 6 | Variants, images, reviews, cart items, order items |
| `product_variants` | 5 | Images, order items, purchase items, stock transfers |
| `countries` | 4 | Provinces, organisations, shipping addresses |

### Cluster: User-Centric References
The `users` table is the central hub, referenced by virtually all domain tables through patterns:
- `{entity}.user_id` — owner/creator
- `{entity}.created_by` — audit trail
- `{entity}.approved_by` / `{entity}.assigned_to` — action references

### Cluster: Organisation-Scoped Entities
`organisations` scopes most marketplace, booking, and HR entities via `organisation_id`, cascading deletes to clean up tenant data.

### Self-Referencing FKs
| Table | FK Column | References | Purpose |
|-------|-----------|------------|---------|
| `product_categories` | `parent_id` | `product_categories(id)` | Hierarchical categories |
| `chart_of_accounts` | `parent_id` | `chart_of_accounts(id)` | Account hierarchy |
| `departments` | `parent_id` | `departments(id)` | Org hierarchy |
| `employees` | `reports_to` | `employees(id)` | Reporting line |
| `related_products` | `product_id` + `related_product_id` | `products(id)` | Product relationships |

### FK Patterns by Suffix
| Suffix | Convention | Example |
|--------|-----------|---------|
| `_id` | Direct FK reference | `user_id`, `organisation_id` |
| `_by` | Creator/actor reference | `created_by`, `updated_by` |
| `_to` | Assignment reference | `assigned_to`, `reports_to` |

---

## Part 7: Column Naming Conventions

The database follows consistent naming patterns across all tables.

### Timestamp Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `created_at` | Record creation timestamp | All tables (ubiquitous) |
| `updated_at` | Last update timestamp | Most tables (ON UPDATE CURRENT_TIMESTAMP) |
| `deleted_at` | Soft delete timestamp | ~15 tables with soft delete |
| `{action}_at` | Event timestamp | `paid_at`, `published_at`, `processed_at`, `completed_at`, `confirmed_at`, `cancelled_at`, `started_at`, `registered_at`, `enrolled_at`, `last_used_at`, `last_login_at`, `last_match_at`, `recorded_at`, `sent_at`, `opened_at`, `posted_at`, `archived_at`, `received_at`, `expires_at`, `scheduled_at` |

### Boolean Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `is_{adjective}` | Boolean flag | `is_active`, `is_public`, `is_system`, `is_default`, `is_verified`, `is_forced`, `is_global`, `is_published`, `is_digital`, `is_primary`, `is_coach`, `is_seller`, `is_internal`, `is_paid`, `is_required` |
| `has_{noun}` | Flag for related data | `has_slots`, `has_peak` |
| `requires_{noun}` | Dependency flag | `requires_approval` |
| `auto_{verb}` | Auto-behavior flag | `auto_renew` |

### Identifier Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `id` | Primary key | All tables |
| `public_id` | UUID for external reference | `users`, `resources` |
| `{entity}_id` | Foreign key | `user_id`, `organisation_id`, `booking_id` |
| `code` | Business code | `employee_code`, `invoice_number`, `account_number` |
| `slug` | URL-safe identifier | `sports.slug`, `roles.slug`, `brands.slug` |
| `sku` | Stock-keeping unit | `product_variants.sku` |
| `barcode` | Product barcode | `product_variants.barcode` |

### State Machine Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `status` | Entity state (always ENUM) | `booking_status`, `payment_status`, `order_status` |
| `{entity}_status` | Scoped status | `employment_status`, `result_status`, `settlement_status` |
| `coach_status` | Role-specific status | `player_profiles.coach_status` |

### Financial Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `{amount_type}` | Monetary value | `amount`, `price`, `total`, `subtotal`, `balance`, `fee`, `cost` |
| `{amount}_amount` | Qualified amount | `tax_amount`, `discount_amount`, `refund_amount`, `paid_amount` |
| `currency` | ISO currency code | `EGP`, `USD` |
| `rate` | Percentage/rate value | `tax_rate`, `interest_rate`, `processing_fee_pct` |

### Metadata Columns
| Pattern | Meaning | Example |
|---------|---------|---------|
| `metadata` | Arbitrary JSON | `products.metadata`, `users.metadata` |
| `description` | Text description | Most entities |
| `notes` | Free-text notes | Various |
| `{entity}_json` | Typed JSON | `rules_json`, `stats_json`, `applicable_activities` |

---

## Part 8: Audit Trail Coverage

The database employs multiple audit mechanisms across layers.

### Application-Level Audit

| Table | Purpose | Coverage |
|-------|---------|----------|
| `audit_logs` | Immutable record of all data-changing operations | All state-changing CUD operations via application middleware |
| `revert_logs` | Super admin revert/rollback actions | Used with audit_logs for undo operations |

### Notification System Audit

| Table | Purpose |
|-------|---------|
| `notification_analytics` | Delivery metrics per notification |
| `notification_audit_trail` | Notification system administrative actions |
| `notification_replay_log` | Manual replay/redelivery events |
| `notification_dead_letter_queue` | Failed delivery tracking |

### State Machine History

| Table | Tracks |
|-------|--------|
| `booking_status_history` | Booking state transitions |
| `order_status_history` | Order state transitions |
| `membership_history` | Membership lifecycle changes |
| `application_settings_history` | System setting changes |

### Version-Based Optimistic Concurrency

| Table | Version Column | Prevents |
|-------|---------------|----------|
| `user_wallets` | `balance_version` | Concurrent wallet balance updates |
| `bookings` | `version` | Double-booking race conditions |
| `tournaments` | `aggregate_version` | Tournament state conflicts |
| `tournament_matches` | `aggregate_version` | Match state conflicts |
| `memberships` | `aggregate_version` | Membership state conflicts |
| `resources` | `version` | Resource booking conflicts |

### Event Sourcing / Outbox

| Table | Purpose |
|-------|---------|
| `processed_events` | Deduplication log for domain event handlers |
| `published_events` | Outbox-pattern event publication |
| `processed_commands` | Command deduplication for idempotency |
| `dead_letter_entries` | Failed message tracking and retry |
| `workflow_events` | Events emitted during workflow execution |
| `audit_logs` | Immutable CUD operation log |

---

## Part 9: Soft Delete Coverage

Tables using `deleted_at` timestamp for soft delete (non-destructive removal).

### Baseline Tables with Soft Delete

| Table | Deleted At Column | Notes |
|-------|------------------|-------|
| `users` | `deleted_at` | Account deactivation (unique emails preserved) |
| `organisations` | `deleted_at` | Organisation archival |
| `branches` | `deleted_at` | Branch closure |
| `products` | `deleted_at` | Product removal (preserves order history) |
| `resources` | `deleted_at` | Resource decommissioning |
| `resource_types` | `deleted_at` | Type deprecation |
| `marketplace_listings` | `deleted_at` | Listing removal |
| `roles` | `deleted_at` | Role archival |
| `design_tokens` | `deleted_at` | Theme deprecation |
| `design_tokens` | `deleted_at` | Token deprecation |
| `uploads` | `deleted_at` | File cleanup tracking |
| `notifications` | `deleted_at` | Notification cleanup |
| `support_tickets` | `deleted_at` | Not used in M066 (status-based lifecycle) |
| `academy_programs` | `archived_at` | Separate archival timestamp |
| `tournaments` | `archived_at` | Separate archival timestamp (M062 addition) |
| `seasons` | — | Status-based lifecycle (`draft→archived`) |
| `leagues` | `archived_at` | Separate archival timestamp |
| `orders` | `deleted_at` | Order removal |

### Migration Tables with Soft Delete
| Table | Soft Delete Mechanism |
|-------|---------------------|
| `academy_programs` | `archived_at` timestamp |
| `leagues` | `archived_at` timestamp |
| `employees` | `employment_status` ENUM (no hard delete) |
| `employment_contracts` | `status` ENUM (`active→terminated`) |
| `support_tickets` | `status` ENUM (`open→closed`) |
| `marketplace_inventory_*` | `status` ENUM (`active→archived`) |

**Pattern:** Entities that must preserve referential integrity for historical records use `deleted_at`. Entities with finite lifecycles use status-based archival via ENUM state transitions.

---

## Part 10: JSON Column Usage

The database uses JSON columns for flexible/semi-structured data where schema rigidity is unnecessary.

### JSON Column Inventory

| Table | JSON Column(s) | Purpose |
|-------|----------------|---------|
| `users` | `metadata` | Extensible user metadata |
| `products` | `images`, `metadata` | Image gallery JSON + flexible metadata |
| `product_variants` | — | All variant fields are structured columns |
| `resources` | `images` | Resource image gallery |
| `provinces` | `navigation_polygon` | Geo-boundary polygon data |
| `pricing_rules` | `days_of_week`, `metadata` | Weekly schedule + rule metadata |
| `membership_plans` | `benefits` | Flexible benefit definitions |
| `loyalty_campaigns` | `applicable_activities` | Scope of campaign applicability |
| `reward_catalog` | — | Structured columns |
| `tournament_match_results` | `score_details` | Flexible sport-agnostic scoring |
| `league_teams` | `player_ids` | Team roster as JSON array |
| `league_standings` | `form` | Last 5 results (W/D/L) |
| `player_statistics` | `stats_json` | Extensible sport-specific stats |
| `team_statistics` | `home_record`, `away_record`, `stats_json` | Home/away breakdown + extensible stats |
| `chart_of_accounts` | — | Structured columns |
| `general_ledger` | — | Structured columns |
| `payroll_entries` | `component_breakdown` | Payroll component detail |
| `customer_segments` | `rules_json` | Segment membership rules |
| `marketing_campaigns` | `stats_json` | Cached campaign statistics |
| `api_keys` | `scopes` | API key permission scopes (JSON array) |
| `pricing_rules` | `days_of_week` | Active days (JSON array) |
| `invoices` | — | Structured columns |
| `payment_transactions` | `gateway_response` | Full gateway response payload |
| `user_wallets` | — | Generated column for available_balance |
| `wallet_transactions` | `metadata` | Transaction metadata |
| `design_tokens` | `colour_scheme`, `token_overrides` | Theme CSS variable maps |
| `audit_logs` | `old_values`, `new_values` | Changed field snapshots |
| `revert_logs` | `reverted_state` | Reverted entity state |
| `notification_ab_tests` | Test configuration | JSON-based test parameters |

### JSON Column Patterns

| Pattern | Usage | Example Tables |
|---------|-------|----------------|
| `metadata` | Extensible key-value store | `users`, `products`, `pricing_rules`, `wallet_transactions` |
| `{entity}_json` | Typed JSON for specific domain | `rules_json`, `stats_json`, `score_details`, `component_breakdown` |
| `images` | Image gallery as JSON array | `products`, `resources` |
| `{name}_json` | Configuration JSON | `applicable_activities`, `days_of_week`, `player_ids`, `form`, `colour_scheme`, `token_overrides` |
| `gateway_response` | External API response capture | `payment_transactions` |

---

## Part 11: Table-to-Domain Matrix

This matrix maps every domain to its constituent tables. See Part 3 for the primary domain classification.

| Domain | Table Count | Key Tables |
|--------|-------------|------------|
| USR — User & Account Management | 14 | `users`, `user_devices`, `user_devices`, `player_profiles`, `player_ratings` |
| AUTH — Auth & Security | 9 | `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions` |
| ORG — Organisation & Branches | 13 | `organisations`, `branches`, `branch_types`, `org_announcements`, `resources` |
| BOOK — Booking & Scheduling | 7 | `bookings`, `booking_intents`, `booking_slots`, `pricing_rules`, `pricing_seasons` |
| MKT — Marketplace & Products | 26 | `products`, `orders`, `warehouses`, `suppliers`, `purchase_orders` |
| FIN — Payments & Accounting | 18 | `payment_transactions`, `user_wallets`, `ledger_entries`, `general_ledger`, `invoices` |
| COMP — Competition & Rankings | 20 | `tournaments`, `tournament_matches`, `leagues`, `league_standings`, `elo_ratings` |
| ACA — Academy & Training | 5 | `academy_programs`, `academy_groups`, `academy_enrollments`, `academy_attendance` |
| MEM — Membership & Loyalty | 9 | `membership_plans`, `memberships`, `loyalty_points`, `reward_catalog` |
| HR — HR & Payroll | 11 | `employees`, `departments`, `payroll_runs`, `leave_requests`, `staff_attendance` |
| SUPPORT — Customer Support | 2 | `support_tickets`, `support_ticket_messages` |
| CRM — Marketing | 5 | `customer_segments`, `leads`, `marketing_campaigns`, `communication_log` |
| SUB — Subscription | 4 | `subscription_plans`, `subscription_features`, `organisation_subscriptions` |
| NOTIF — Notification Infra | 19 | `notification_templates`, `notification_delivery`, `notification_broadcasts` |
| EVENT — Event Bus & Workflow | 11 | `processed_events`, `workflow_instances`, `workflow_steps`, `dead_letter_entries` |
| MON — Monitoring | 6 | `audit_logs`, `client_error_reports`, `web_vitals_metrics`, `kpi_snapshots` |
| CFG — System Config | 6 | `system_settings`, `design_tokens`, `app_settings`, `app_versions` |
| INT — Integration | 3 | `api_keys`, `push_tokens`, `push_log` |

Total tables accounted: ~188 (unique, no double-counting across domains)

---

## Part 12: Dependency Graph & Impact Analysis

### Tier 1 — Foundation (no external FK dependencies on other domain tables)
`sports`, `countries`, `currencies`, `permission_modules`, `resource_types`, `player_levels`, `brands`, `product_categories`, `tags`, `payment_methods`, `leave_types`, `tax_rates`, `notification_types`

### Tier 2 — Core Entities (depend only on Tier 1)
`users`, `organisations`, `organisation_types`, `membership_plans`

### Tier 3 — Domain Entities (depend on Tier 1–2)
`branches`, `products`, `player_profiles`, `roles`, `user_wallets`, `subscription_plans`, `user_sessions`, `design_tokens`, `departments`, `positions`, `seasons`, `academy_programs`

### Tier 4 — Operational Entities (depend on Tier 1–3)
`bookings`, `orders`, `tournaments`, `leagues`, `employees`, `customer_segments`, `invoices`, `chart_of_accounts`, `support_tickets`, `payroll_runs`, `api_keys`

### Tier 5 — Transactional Entities (deepest dependencies)
`payment_transactions`, `wallet_transactions`, `general_ledger`, `payroll_entries`, `tournament_match_results`, `league_standings`, `academy_attendance`

### High-Impact Tables (changes require cascading updates)

| Table | Downstream Impact | Reasoning |
|-------|------------------|-----------|
| `users` | 35+ FK references | Owner/creator/assignee across all domains |
| `organisations` | 20+ FK references | Tenant scope for all org-owned data |
| `products` | 10+ FK references | Variants, images, orders, reviews, cart |
| `tournaments` | 8+ FK references | Participants, matches, groups, standings |
| `employees` | 7+ FK references | Contracts, leave, attendance, payroll |

---

## Part 13: Table Metrics

### Table Size Estimates

| Size Category | Count | Characteristics |
|---------------|-------|-----------------|
| **Reference/Lookup** (0–100 rows) | ~25 | `sports`, `countries`, `permission_modules`, `roles`, `payment_methods`, `tax_rates` |
| **Small** (100–10K rows) | ~80 | `users`, `organisations`, `branches`, `products` (seed), `academy_programs` |
| **Medium** (10K–100K rows) | ~50 | `bookings`, `orders`, `payment_transactions`, `wallet_transactions` |
| **High Volume** (100K–1M+ rows) | ~30 | `audit_logs`, `general_ledger`, `notification_delivery`, `communication_log`, `push_log`, `inventory_logs`, `workflow_events` |

### Column Count Distribution

| Column Count | Approximate Tables |
|--------------|-------------------|
| 2–5 columns (narrow junction/lookup) | ~30 | 
| 6–10 columns | ~70 |
| 11–15 columns | ~45 |
| 16–20 columns | ~20 |
| 21+ columns (wide) | `products` (38), `users` (25), `resources` (21) |

---

## Part 14: Migration Lineage

The database schema evolved through 73 migration files. This part summarizes the key phases.

### Phase 1: Foundation (Migrations 002–016)
- Core booking, payment, and notification infrastructure
- `payment_transactions` enhancements, `booking_intents`, `booking_status_history`
- Notification enterprise tables (templates, delivery, analytics, broadcasts)
- Monitoring tables (alerts, client_error_reports, web_vitals_metrics)

### Phase 2: Community & Matching (Migrations 017–030)
- `matches`, `match_participants`, `match_sessions`, `join_requests`, `invitations`
- `public_match_details`, `waiting_list`
- `coach_org_agreements`, `chat_groups`, `group_invitations`

### Phase 3: Workflow & Event Bus (Migrations 039–052)
- `processed_events`, `published_events`, `outbox_cursors`, `dead_letter_entries`, `processed_commands`
- `workflow_instances`, `workflow_steps`, `workflow_events`, `workflow_definitions`
- `workflow_branch_instances`, `workflow_event_subscriptions`

### Phase 4: Enterprise Extensions (Migrations 053–056)
- `pricing_rules`, `pricing_seasons` — Dynamic pricing engine
- `ledger_entries`, `settlement_batches` — Financial ledger
- `membership_plans`, `memberships`, `loyalty_points`, `reward_catalog` — Loyalty platform
- `tournament_participants`, `elo_ratings` — Tournament extensions

### Phase 5: Academy & Competition (Migrations 060–064)
- `user_organisations`, `user_branches` — Junction tables
- `academy_programs`, `academy_groups`, `academy_enrollments` — Training platform
- `tournament_groups`, `tournament_standings` — Competition management
- `seasons`, `leagues`, `league_teams`, `league_standings` — League platform

### Phase 6: Enterprise Suite (Migrations 065–073)
- `org_announcements`, `support_tickets` — Org communication & support
- `warehouses`, `suppliers`, `purchase_orders`, `stock_transfers` — Inventory management
- `chart_of_accounts`, `general_ledger`, `invoices`, `tax_rates` — Accounting suite
- `customer_segments`, `leads`, `marketing_campaigns` — CRM
- `departments`, `employees`, `payroll_runs`, `leave_requests` — HR/Payroll
- `kpi_snapshots` — Business intelligence
- `api_keys` — Integration platform
- `push_tokens`, `app_versions`, `app_settings`, `push_log` — Mobile platform

---

## Part 15: Cross-Feature Table Usage

Tables shared across multiple domains/features.

### Tables Serving 3+ Domains
| Table | Domains | Cross-Feature Role |
|-------|---------|-------------------|
| `users` | USR, AUTH, BOOK, MKT, FIN, COMP, ACA, CRM, HR, NOTIF | Universal actor/owner |
| `organisations` | ORG, BOOK, MKT, HR, SUB, FIN, CRM | Tenant scope for all enterprise features |
| `branches` | ORG, BOOK, HR, FIN | Location scoping across operations |
| `resources` | ORG, BOOK, ACA, COMP | Bookable assets shared by booking and academy |
| `products` | MKT, FIN, ACA (via enrollment), BOOK | Central marketplace/product entity |

### Feature → Primary Table Dependencies
| Feature | Primary Table(s) | Depends On |
|---------|-----------------|------------|
| Online Booking | `bookings`, `booking_slots` | `users`, `organisations`, `resources`, `branches` |
| Marketplace | `products`, `orders`, `order_items` | `users` (seller/buyer), `organisations`, `branches` |
| Tournament Engine | `tournaments`, `tournament_matches` | `users`, `sports`, `organisations`, `branches` |
| Academy Training | `academy_programs`, `academy_groups` | `users`, `resources`, `academy_enrollments` |
| HR & Payroll | `employees`, `payroll_runs` | `users`, `organisations`, `departments`, `positions` |
| Finance & Accounting | `chart_of_accounts`, `general_ledger` | `organisations`, `users`, `accounting_periods` |
| CRM & Marketing | `customer_segments`, `marketing_campaigns` | `users`, `organisations` |

---

## Part 16: Index Coverage Analysis

### Index Patterns

| Index Type | Count (Approx.) | Example |
|-----------|----------------|---------|
| PRIMARY KEY | 1 per table | `id` (auto-increment) |
| UNIQUE KEY | ~80 | Business keys (`slug`, `email`, `code`, composite UKs) |
| FOREIGN KEY index | ~180 | Automatically created by InnoDB for FK constraints |
| Performance index | ~60 | Custom `idx_*` for query optimization |
| FULLTEXT index | 1 | `ft_prod_search` on `products(name,name_ar,description,description_ar)` |
| Composite index | ~40 | `idx_user_role_org`, `idx_resource_date`, `idx_pricing_scope` |
| Generated column index | 2 | `idx_org_role` on `roles.org_id_normalized`, `idx_role_org_slug` |

### Fulltext Search Coverage
Only `products` table has a FULLTEXT index (`ft_prod_search`) across name and description columns in both English and Arabic.

### Composite Index Patterns by Domain
| Domain | Common Composite Pattern |
|--------|------------------------|
| BOOK | `(resource_id, date)`, `(user_id, status)` |
| MKT | `(seller_id, is_active, category_id)`, `(product_id, is_primary)` |
| NOTIF | `(channel, status)`, `(user_id, created_at)` |
| COMP | `(tournament_id, round)`, `(division_id, team_id)` |
| AUTH | `(role_id, permission_id)`, `(user_id, role_id, organisation_id)` |

---

## Part 17: FK Constraint Summary

### FK Action Patterns

| ON DELETE Action | Count (Approx.) | Usage |
|-----------------|----------------|-------|
| CASCADE | ~160 | Child tables that should not exist without parent (order items, variants) |
| SET NULL | ~30 | Optional references (creator, approver, assignee) |
| RESTRICT | ~5 | Business-critical references that must not be orphaned |
| NO ACTION | ~0 | Not used (InnoDB default is RESTRICT) |

### Common CASCADE Patterns
- `{entity}_id → {parent}(id) ON DELETE CASCADE` — Ownership: user→entity, org→entity
- `fk_{child}_{parent} ON DELETE CASCADE` — All variant/line-item tables

### Common SET NULL Patterns
- `modified_by`, `approved_by`, `assigned_to`, `deleted_by` — Action audit references
- `parent_id` in self-referencing tables — Hierarchical structure (SET NULL on parent delete)

---

## Part 18: Data Lifecycle Matrix

| Stage | Action | Mechanism | Example Tables |
|-------|--------|-----------|---------------|
| **Create** | INSERT | Application writes | All tables |
| **Read** | SELECT | Application queries | All tables |
| **Update** | UPDATE | Application modifies | Most tables |
| **Soft Delete** | SET deleted_at | Application marks | `users`, `products`, `organisations`, `orders` |
| **Archive** | SET archived_at | Status transition | `academy_programs`, `leagues`, `tournaments` |
| **Hard Delete** | DELETE | Cleanup/purge | `user_sessions`, `email_verification_tokens`, temp data |
| **Audit Log** | INSERT to audit_logs | Middleware/trigger | All CUD operations |
| **Retention** | Scheduled cleanup | `scheduled_jobs` | `notification_dead_letter_queue`, `user_sessions` |

### Immutable Tables (Insert-Only)
| Table | Mutability | Reasoning |
|-------|-----------|-----------|
| `audit_logs` | Immutable | Legal/regulatory requirement |
| `ledger_entries` | Immutable | Financial audit trail |
| `general_ledger` | Immutable | Double-entry accounting |
| `wallet_transactions` | Append-only | Financial reconciliation |
| `notification_delivery` | Append-only | Delivery analytics |
| `communication_log` | Append-only | Communication history |
| `push_log` | Append-only | Push delivery tracking |
| `player_ratings` | Append-only | Rating integrity |

---

## Part 19: Schema Evolution History

This part summarizes key schema changes by migration category.

### Column Additions (Most Common Change)
- ~30 migrations added columns to existing tables
- Most additions use `AFTER` positioning to maintain logical column order
- Common additions: status enums, version columns (optimistic locking), JSON metadata

### Index Additions
- ~15 migrations added performance indexes
- Primary optimization targets: booking lookups, payment queries, notification filtering
- Composite indexes added for multi-column query patterns

### Constraint Additions
- UNIQUE constraints added for business key enforcement (e.g., `uk_gateway_reference`)
- FK constraints added when new child tables reference existing parents

### Table Renames
- `academy_enrollments → academy_enrollments_legacy` (Migration 061) — replaced with new schema

### Table Drops
- Migration 052: Dropped legacy settlement tables (`settlements_v1`, `settlement_transfers`, `settlements`, `transaction_entries`, `transactions`)

---

## Part 20: Glossary and Terminology

### Business Glossary

| Term | Definition | Related Table(s) |
|------|-----------|------------------|
| **Booking** | A reservation of a court/resource for a specific time slot | `bookings`, `booking_slots`, `booking_intents` |
| **Resource** | A bookable asset (court, field, pitch, hall) | `resources`, `resource_types` |
| **Organisation** | A tenant entity (venue, club, academy, facility) | `organisations`, `branches` |
| **Branch** | A physical location belonging to an organisation | `branches` |
| **Tournament** | A competitive event with multiple matches, participants, and a bracket | `tournaments`, `tournament_matches` |
| **League** | A multi-team competition with scheduled matches over a season | `leagues`, `league_teams`, `league_matches` |
| **Academy Program** | A structured training plan with groups, sessions, and attendance | `academy_programs`, `academy_groups` |
| **Enrollment** | A player's registration into an academy program group | `academy_enrollments` |
| **Membership** | A paid plan granting access to facilities or services | `membership_plans`, `memberships` |
| **Loyalty Points** | Earned reward points redeemable for perks or merchandise | `loyalty_points`, `reward_catalog` |
| **ELO Rating** | A numerical skill rating calculated from match outcomes | `elo_ratings` |
| **Wallet** | A digital balance for transactions within the platform | `user_wallets`, `wallet_transactions` |
| **Settlement Batch** | A periodic financial reconciliation between platform and tenant | `settlement_batches`, `ledger_entries` |
| **General Ledger** | Immutable double-entry accounting journal | `general_ledger`, `chart_of_accounts` |
| **Workflow** | A defined business process with conditional steps and compensation | `workflow_instances`, `workflow_steps` |
| **Dead Letter Queue** | A storage for messages that failed processing after retries | `dead_letter_entries` |
| **Outbox** | A message queue pattern ensuring reliable event publication | `published_events`, `outbox_cursors` |
| **KPI Snapshot** | A periodic measurement of business performance metrics | `kpi_snapshots` |
| **Segment** | A dynamically defined group of users for targeted marketing | `customer_segments` |
| **SKU** | Stock-Keeping Unit — a unique identifier for a product variant | `product_variants` |
| **Purchase Order** | An order placed with a supplier to replenish inventory | `purchase_orders`, `purchase_order_items` |
| **Stock Transfer** | Movement of inventory between warehouses | `stock_transfers` |

### Technical Glossary

| Term | Definition |
|------|-----------|
| **Aggregate Version** | An optimistic concurrency counter used to prevent lost updates in distributed operations |
| **EAV** | Entity-Attribute-Value — a flexible schema pattern for variable attributes per entity type |
| **ENUM** | A MySQL data type restricting a column to a predefined set of values |
| **JSON Column** | A MySQL column with native JSON data type for semi-structured data |
| **FULLTEXT Index** | A specialized MySQL index for natural-language searching across text columns |
| **Generated Column** | A column whose value is computed from other columns (VIRTUAL or STORED) |
| **Outbox Pattern** | A reliable messaging pattern where events are stored in the same database as aggregates |
| **Soft Delete** | A deletion pattern where records are marked with `deleted_at` rather than physically removed |
| **Tenant** | A logically isolated customer (organisation) in a multi-tenant architecture |

---

*End of Enterprise Database Knowledge Base*
