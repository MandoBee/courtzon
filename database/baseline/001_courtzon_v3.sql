
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `academies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `sport_id` int unsigned DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `fk_acad_branch` (`branch_id`),
  KEY `fk_acad_sport` (`sport_id`),
  CONSTRAINT `fk_acad_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_acad_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_acad_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_attendance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_session_id` int unsigned NOT NULL,
  `enrollment_id` int unsigned NOT NULL,
  `attendance_status` enum('present','absent','excused','late') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'present',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_enrollment` (`group_session_id`,`enrollment_id`),
  KEY `idx_enrollment` (`enrollment_id`),
  CONSTRAINT `fk_att_enrollment` FOREIGN KEY (`enrollment_id`) REFERENCES `academy_enrollments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_session` FOREIGN KEY (`group_session_id`) REFERENCES `academy_group_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_curriculums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_curriculums` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academy_id` int unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `level_required` int unsigned DEFAULT NULL COMMENT 'Min player level',
  `duration_weeks` int unsigned DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academy` (`academy_id`),
  CONSTRAINT `fk_cur_acad` FOREIGN KEY (`academy_id`) REFERENCES `academies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_enrollments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `player_id` int unsigned NOT NULL,
  `program_id` int unsigned NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `membership_id` int unsigned DEFAULT NULL,
  `status` enum('pending','confirmed','waiting','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `waiting_order` int unsigned DEFAULT NULL COMMENT 'Position in waiting list (deterministic promotion)',
  `enrolled_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_player` (`player_id`),
  KEY `idx_program` (`program_id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_status` (`status`),
  KEY `idx_waiting_order` (`waiting_order`),
  CONSTRAINT `fk_enrollments_group` FOREIGN KEY (`group_id`) REFERENCES `academy_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_program` FOREIGN KEY (`program_id`) REFERENCES `academy_programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_evaluations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academy_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `evaluator_id` int unsigned NOT NULL COMMENT 'Coach who evaluated',
  `skill_scores` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '{skill_name: score}',
  `overall_score` decimal(5,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `recommended_level_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_player` (`player_id`),
  KEY `fk_eval_acad` (`academy_id`),
  KEY `fk_eval_evaluator` (`evaluator_id`),
  CONSTRAINT `fk_eval_acad` FOREIGN KEY (`academy_id`) REFERENCES `academies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eval_evaluator` FOREIGN KEY (`evaluator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eval_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `academy_evaluations_chk_1` CHECK (json_valid(`skill_scores`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_group_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_group_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int unsigned NOT NULL,
  `session_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `court_id` int unsigned DEFAULT NULL,
  `coach_id` int unsigned DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_date` (`session_date`),
  KEY `idx_coach` (`coach_id`),
  KEY `fk_session_court` (`court_id`),
  CONSTRAINT `fk_session_coach` FOREIGN KEY (`coach_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_court` FOREIGN KEY (`court_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_group` FOREIGN KEY (`group_id`) REFERENCES `academy_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `program_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coach_id` int unsigned DEFAULT NULL,
  `capacity` int unsigned NOT NULL DEFAULT '0',
  `status` enum('active','inactive','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_program` (`program_id`),
  KEY `idx_coach` (`coach_id`),
  CONSTRAINT `fk_group_coach` FOREIGN KEY (`coach_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_group_program` FOREIGN KEY (`program_id`) REFERENCES `academy_programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_programs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_programs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `season` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int unsigned NOT NULL DEFAULT '0',
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `price_type` enum('FREE','FIXED','MEMBERS_ONLY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `status` enum('draft','published','open','full','running','completed','cancelled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `archived_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status` (`status`),
  KEY `idx_category` (`category`),
  KEY `idx_is_public` (`is_public`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_session_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_session_attendance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `session_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `status` enum('present','absent','excused') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'present',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance` (`session_id`,`player_id`),
  KEY `fk_att_player` (`player_id`),
  CONSTRAINT `fk_att_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_sess` FOREIGN KEY (`session_id`) REFERENCES `academy_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `academy_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academy_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academy_id` int unsigned NOT NULL,
  `curriculum_id` int unsigned DEFAULT NULL,
  `coach_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `max_participants` int unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academy` (`academy_id`),
  KEY `idx_coach` (`coach_id`),
  KEY `idx_dates` (`start_time`,`end_time`),
  KEY `fk_sess_cur` (`curriculum_id`),
  KEY `fk_sess_resource` (`resource_id`),
  CONSTRAINT `fk_sess_acad` FOREIGN KEY (`academy_id`) REFERENCES `academies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sess_coach` FOREIGN KEY (`coach_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sess_cur` FOREIGN KEY (`curriculum_id`) REFERENCES `academy_curriculums` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sess_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `account_template_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_template_lines` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int unsigned NOT NULL,
  `parent_line_id` int unsigned DEFAULT NULL COMMENT 'Self-reference for nested lines',
  `l3_parent_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Fixed L3 code this attaches under (e.g. REVENUE-COURT)',
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Template-level code (org-relative)',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_type` enum('asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense') COLLATE utf8mb4_unicode_ci NOT NULL,
  `normal_side` enum('debit','credit') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_postable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Whether this account can receive GL postings',
  `description` text COLLATE utf8mb4_unicode_ci,
  `display_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_template` (`template_id`),
  KEY `idx_parent_line` (`parent_line_id`),
  CONSTRAINT `fk_atl_parent_line` FOREIGN KEY (`parent_line_id`) REFERENCES `account_template_lines` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_atl_template` FOREIGN KEY (`template_id`) REFERENCES `account_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `account_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `template_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `scope` enum('system','organization') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'organization',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = system template, set = org-owned',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_key` (`template_key`,`organisation_id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_scope` (`scope`),
  KEY `fk_at_creator` (`created_by`),
  CONSTRAINT `fk_at_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_at_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `accounting_event_mapping_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `accounting_event_mapping_lines` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = global default',
  `concept` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Accounting concept (e.g. revenue, tax_liability)',
  `event_org_concept_scope` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `account_id` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_org_concept` (`event_type`,`organisation_id`,`concept`),
  UNIQUE KEY `uk_ael_scope` (`event_org_concept_scope`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_account` (`account_id`),
  CONSTRAINT `fk_ael_account` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`),
  CONSTRAINT `fk_ael_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6044 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_ael_scope_insert` BEFORE INSERT ON `accounting_event_mapping_lines` FOR EACH ROW SET NEW.event_org_concept_scope = CONCAT(NEW.event_type, ':', COALESCE(NEW.organisation_id, 0), ':', NEW.concept) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_ael_scope_update` BEFORE UPDATE ON `accounting_event_mapping_lines` FOR EACH ROW SET NEW.event_org_concept_scope = CONCAT(NEW.event_type, ':', COALESCE(NEW.organisation_id, 0), ':', NEW.concept) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `accounting_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `accounting_periods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = platform-global periods',
  `fiscal_year` int unsigned NOT NULL,
  `period_number` tinyint unsigned NOT NULL COMMENT '1-12 for monthly',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('open','closed','locked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `closed_at` timestamp NULL DEFAULT NULL,
  `closed_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_fy_period` (`organisation_id`,`fiscal_year`,`period_number`),
  KEY `idx_status` (`status`),
  KEY `fk_ap_closed` (`closed_by`),
  KEY `idx_ap_org` (`organisation_id`),
  CONSTRAINT `fk_ap_closed` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ap_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6653 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `achievements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `achievements` (
  `achievement_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_progress` int unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`achievement_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `activity_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_type` (`activity_type`),
  KEY `idx_created` (`created_at`),
  KEY `idx_activities_feed` (`user_id`,`created_at`),
  CONSTRAINT `activity_logs_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ad_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ad_campaigns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = platform-wide ads',
  `placement_id` int unsigned NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `daily_budget` decimal(12,2) DEFAULT NULL,
  `total_budget` decimal(12,2) DEFAULT NULL,
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','active','paused','ended','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `max_impressions` int unsigned DEFAULT NULL,
  `max_clicks` int unsigned DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_placement` (`placement_id`),
  KEY `idx_status` (`status`),
  KEY `idx_dates` (`start_date`,`end_date`),
  KEY `fk_camp_org` (`organisation_id`),
  KEY `fk_camp_creator` (`created_by`),
  CONSTRAINT `fk_camp_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_camp_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_camp_placement` FOREIGN KEY (`placement_id`) REFERENCES `ad_placements` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ad_clicks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ad_clicks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `impression_id` bigint unsigned NOT NULL,
  `campaign_id` int unsigned NOT NULL,
  `creative_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `clicked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cost` decimal(12,8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_impression` (`impression_id`),
  KEY `idx_campaign` (`campaign_id`),
  CONSTRAINT `fk_click_camp` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_click_imp` FOREIGN KEY (`impression_id`) REFERENCES `ad_impressions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ad_creatives`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ad_creatives` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` int unsigned NOT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `click_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alt_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaign` (`campaign_id`),
  CONSTRAINT `fk_creative_camp` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ad_impressions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ad_impressions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `campaign_id` int unsigned NOT NULL,
  `creative_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `placement_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `served_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cost` decimal(12,8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_creative` (`creative_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_served` (`served_at`),
  CONSTRAINT `fk_imp_camp` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ad_placements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ad_placements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `placement_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. home_banner, booking_sidebar, search_results',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dimensions` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. 728x90, 300x250',
  `max_ads` int unsigned NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `placement_key` (`placement_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `amenities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `amenities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name_en` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_ar` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CSS class or SVG ref',
  `category` enum('facilities','equipment','accessibility','convenience','services') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'facilities',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `images` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_announce_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_announce_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcements_chk_1` CHECK (json_valid(`images`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `api_keys` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `key_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SHA-256 hash of the API key',
  `key_prefix` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'First 20 chars for identification',
  `scopes` json DEFAULT NULL COMMENT 'JSON array of permission scopes',
  `rate_limit` int unsigned NOT NULL DEFAULT '100' COMMENT 'Requests per minute',
  `expires_at` timestamp NULL DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_prefix` (`key_prefix`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `fk_ak_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ak_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `app_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_config` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_value` text COLLATE utf8mb4_unicode_ci,
  `description` text COLLATE utf8mb4_unicode_ci,
  `platform` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_ac_platform` (`platform`),
  KEY `idx_ac_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. site_name, support_email, favicon_url',
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `fk_app_settings_user` (`updated_by`),
  CONSTRAINT `fk_app_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `app_settings_chk_1` CHECK (json_valid(`value`))
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `app_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_versions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `platform` enum('ios','android') COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `build_number` int unsigned NOT NULL,
  `min_version` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Minimum supported version',
  `is_forced` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Force upgrade required',
  `download_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `release_notes` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_platform_version` (`platform`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `application_settings_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `application_settings_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `changed_by` int unsigned DEFAULT NULL,
  `request_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_setting` (`setting_key`),
  KEY `idx_history_changed_by` (`changed_by`),
  KEY `idx_history_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_id` int unsigned DEFAULT NULL COMMENT 'NULL for system actions',
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking.create, user.update, org.delete',
  `entity_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking, user, organisation',
  `entity_id` int unsigned DEFAULT NULL,
  `before_state` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `after_state` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Required for destructive actions',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_actor` (`actor_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created` (`created_at`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`,`created_at`),
  KEY `idx_audit_logs_entity_action_created` (`entity_type`,`action`,`created_at`),
  CONSTRAINT `audit_logs_chk_1` CHECK (json_valid(`before_state`)),
  CONSTRAINT `audit_logs_chk_2` CHECK (json_valid(`after_state`))
) ENGINE=InnoDB AUTO_INCREMENT=11029 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bank_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bank_accounts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned NOT NULL,
  `account_holder_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iban` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `swift_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ba_branch` (`branch_id`),
  CONSTRAINT `fk_ba_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bank_branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bank_branches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `bank_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bb_bank` (`bank_id`),
  CONSTRAINT `fk_bb_bank` FOREIGN KEY (`bank_id`) REFERENCES `banks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `banks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `banks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `country_id` smallint unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `swift` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_banks_country` (`country_id`),
  CONSTRAINT `fk_banks_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_cancellations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_cancellations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `cancelled_by` bigint unsigned NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `refund_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `refund_status` enum('pending','processed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  KEY `idx_booking` (`booking_id`)
) ENGINE=InnoDB AUTO_INCREMENT=631 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_invitations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `invited_user_id` bigint unsigned DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','accepted','declined') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `responded_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_booking` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_matchmaking_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_matchmaking_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `min_age` int DEFAULT NULL,
  `max_age` int DEFAULT NULL,
  `target_gender` enum('male','female','any') COLLATE utf8mb4_unicode_ci DEFAULT 'any',
  `target_level_id` int unsigned DEFAULT NULL,
  `max_players` int NOT NULL DEFAULT '2',
  `deadline` datetime DEFAULT NULL,
  `auto_apply` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  KEY `idx_booking` (`booking_id`),
  KEY `idx_active` (`is_active`),
  KEY `target_level_id` (`target_level_id`),
  CONSTRAINT `booking_matchmaking_requests_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `booking_matchmaking_requests_ibfk_2` FOREIGN KEY (`target_level_id`) REFERENCES `player_levels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_players` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `status` enum('confirmed','pending','cancelled','declined') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bp_booking` (`booking_id`),
  KEY `idx_bp_player` (`player_id`),
  CONSTRAINT `fk_bp_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bp_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_settlements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `settlement_type` enum('coach','org') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','settled','collected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'settled',
  `batch_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bs_booking` (`booking_id`),
  KEY `idx_bs_org` (`organisation_id`),
  KEY `fk_bs_creator` (`created_by`),
  CONSTRAINT `fk_bs_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bs_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bs_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4202 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_slots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `resource_id` bigint unsigned NOT NULL,
  `booking_date` date NOT NULL,
  `slot_start` time NOT NULL,
  `slot_end` time NOT NULL,
  `is_available` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking` (`booking_id`),
  KEY `idx_resource_date_slot` (`resource_id`,`booking_date`,`slot_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bookings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `organisation_id` bigint unsigned NOT NULL,
  `resource_id` bigint unsigned NOT NULL,
  `branch_id` int unsigned DEFAULT NULL COMMENT 'Denormalized from resource for branch-level accounting',
  `booking_type` enum('public_match','private_match','academy','clinic','coach_session') COLLATE utf8mb4_unicode_ci NOT NULL,
  `visibility` enum('public','private') COLLATE utf8mb4_unicode_ci DEFAULT 'public',
  `start_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute start time in UTC. Source of truth for all time operations.',
  `end_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute end time in UTC. Source of truth for all time operations.',
  `booking_date` date NOT NULL,
  `business_date` date DEFAULT NULL COMMENT 'The Business Day this booking belongs to. Resolved by OperatingHoursEngine.',
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'Snapshot tax rate %',
  `tax_rate_id` int unsigned DEFAULT NULL COMMENT 'FK to tax_rates (traceability)',
  `tax_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Snapshot tax amount',
  `tax_treatment` enum('taxable','zero_rated','exempt') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'taxable',
  `price_type` enum('net','gross') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'net',
  `commission_rate` decimal(5,2) DEFAULT '0.00',
  `commission_amount` decimal(12,2) DEFAULT '0.00',
  `net_amount` decimal(12,2) DEFAULT '0.00',
  `plan_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `club_amount` decimal(12,2) DEFAULT '0.00',
  `coach_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Coach share (authoritative, from coach session/agreement)',
  `refunded_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Cumulative refunded amount (economic gross incl. tax)',
  `coach_settled_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Coach economics already paid via settlement',
  `org_settled_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Org economics already paid via settlement',
  `coach_recovered_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Cumulative coach recovery already posted',
  `org_recovered_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Cumulative org recovery already posted',
  `coach_recovery_collected` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Cumulative coach recovery actually collected',
  `org_recovery_collected` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Cumulative org recovery actually collected',
  `payment_status` enum('pending','paid','refunded','partially_refunded','failed','penalty') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `booking_status` enum('pending','pending_payment','confirmed','cancelled','completed','expired','checked_in','no_show') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `cancellation_policy_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `expires_at` datetime DEFAULT NULL,
  `version` int DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_date` (`booking_date`),
  KEY `idx_status` (`booking_status`,`payment_status`),
  KEY `idx_organisation` (`organisation_id`),
  KEY `idx_resource` (`resource_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_bookings_org_resource` (`organisation_id`,`resource_id`,`booking_date`,`booking_status`),
  KEY `idx_bookings_start_at_utc` (`start_at_utc`),
  KEY `idx_bookings_business_date` (`business_date`),
  KEY `idx_bookings_tax_rate` (`tax_rate_id`),
  KEY `idx_bookings_resource_date_start` (`resource_id`,`booking_date`,`start_time`),
  CONSTRAINT `fk_booking_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_chk_1` CHECK (json_valid(`cancellation_policy_snapshot`))
) ENGINE=InnoDB AUTO_INCREMENT=19409 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_amenities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_amenities` (
  `branch_id` int unsigned NOT NULL,
  `amenity_id` int unsigned NOT NULL,
  PRIMARY KEY (`branch_id`,`amenity_id`),
  KEY `fk_branch_amenity_amenity` (`amenity_id`),
  CONSTRAINT `fk_branch_amenity_amenity` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_branch_amenity_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_amenity_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_amenity_assignments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `amenity_id` int unsigned NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. "3 showers", "20 spots", NULL = boolean yes',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_branch_amenity` (`branch_id`,`amenity_id`),
  KEY `idx_amenity` (`amenity_id`),
  KEY `idx_branch` (`branch_id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_financial_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_financial_details` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned NOT NULL,
  `bank_id` int unsigned DEFAULT NULL,
  `bank_branch_id` int unsigned DEFAULT NULL COMMENT 'Bank institution branch (bank_branches.id)',
  `bank_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iban` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `swift` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `billing_address` text COLLATE utf8mb4_unicode_ci,
  `billing_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_schedule` enum('daily','weekly','biweekly','monthly') COLLATE utf8mb4_unicode_ci DEFAULT 'monthly',
  `currency_id` tinyint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bfd_branch` (`branch_id`),
  KEY `idx_bfd_bank` (`bank_id`),
  KEY `idx_bfd_bank_branch` (`bank_branch_id`),
  CONSTRAINT `fk_bfd_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_holidays` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned NOT NULL,
  `holiday_date` date NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branch_holidays_branch` (`branch_id`),
  KEY `idx_branch_holidays_date` (`holiday_date`),
  CONSTRAINT `fk_branch_holidays_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_player_access`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_player_access` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `status` enum('pending','approved','rejected','banned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewed_by` int unsigned DEFAULT NULL COMMENT 'Manager who reviewed',
  `review_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_player_branch` (`player_id`,`branch_id`),
  KEY `fk_access_branch` (`branch_id`),
  KEY `fk_access_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_access_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_access_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_access_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branch_staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch_staff` (
  `branch_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`branch_id`,`user_id`),
  KEY `fk_branch_staff_user` (`user_id`),
  CONSTRAINT `fk_branch_staff_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_branch_staff_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_id` smallint unsigned DEFAULT NULL,
  `postal_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `access_type` enum('open','restricted','invite_only') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `images` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Gallery photos array',
  `currency_id` tinyint unsigned DEFAULT NULL COMMENT 'Override org currency',
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Override org timezone',
  `opening_time` time DEFAULT '08:00:00' COMMENT 'Daily operating hours start',
  `closing_time` time DEFAULT '22:00:00' COMMENT 'Daily operating hours end',
  `version` int unsigned NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_active` (`is_active`),
  KEY `idx_location` (`latitude`,`longitude`),
  KEY `fk_branch_currency` (`currency_id`),
  CONSTRAINT `fk_branch_currency` FOREIGN KEY (`currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_branch_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `branches_chk_1` CHECK (json_valid(`images`))
) ENGINE=InnoDB AUTO_INCREMENT=1002193 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `brands` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=161 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cancellation_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cancellation_policies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned DEFAULT NULL,
  `organisation_id` bigint unsigned DEFAULT NULL,
  `cancellation_window_minutes` int NOT NULL,
  `refund_percent` decimal(5,2) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_organisation` (`organisation_id`),
  KEY `idx_branch` (`branch_id`),
  CONSTRAINT `fk_cp_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cart_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `product_id` int unsigned NOT NULL,
  `variant_id` int unsigned DEFAULT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '1',
  `reserved_until` timestamp NULL DEFAULT NULL COMMENT 'Inventory hold expiry',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_product_cart` (`user_id`,`product_id`,`variant_id`),
  KEY `idx_reserved` (`reserved_until`),
  KEY `fk_cart_product` (`product_id`),
  CONSTRAINT `fk_cart_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cart_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chart_of_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chart_of_accounts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = platform-global account',
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense') COLLATE utf8mb4_unicode_ci NOT NULL,
  `normal_side` enum('debit','credit') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Natural balance direction',
  `parent_id` int unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'System accounts cannot be deleted',
  `description` text COLLATE utf8mb4_unicode_ci,
  `org_code_scope` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_code` (`organisation_id`,`code`),
  UNIQUE KEY `uk_org_code_scope` (`org_code_scope`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_type` (`type`),
  KEY `idx_coa_org` (`organisation_id`),
  CONSTRAINT `fk_coa_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coa_parent` FOREIGN KEY (`parent_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6303 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_coa_org_code_scope_insert` BEFORE INSERT ON `chart_of_accounts` FOR EACH ROW SET NEW.org_code_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.code) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_coa_org_code_scope_update` BEFORE UPDATE ON `chart_of_accounts` FOR EACH ROW SET NEW.org_code_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.code) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `cities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `province_id` int unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `native_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('city','district','town','village','neighborhood') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `navigation_polygon` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '[[lat, lng], ...] polygon for map navigation',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cities_slug` (`province_id`,`slug`),
  KEY `idx_cities_province` (`province_id`),
  CONSTRAINT `fk_city_province` FOREIGN KEY (`province_id`) REFERENCES `provinces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cities_chk_1` CHECK (json_valid(`navigation_polygon`))
) ENGINE=InnoDB AUTO_INCREMENT=9432 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_error_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client_error_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `error_type` varchar(100) NOT NULL,
  `error_message` text NOT NULL,
  `stack_trace` text,
  `component_stack` text,
  `page_url` varchar(500) DEFAULT NULL,
  `user_agent` text,
  `viewport_size` varchar(20) DEFAULT NULL,
  `platform` varchar(50) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_client_errors_type` (`error_type`,`created_at`),
  KEY `idx_client_errors_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_blogs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_blogs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `excerpt` text COLLATE utf8mb4_unicode_ci,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `cover_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author_id` int unsigned DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT '0',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_author` (`author_id`),
  KEY `idx_published` (`is_published`,`published_at`),
  CONSTRAINT `fk_blog_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_contact_submission_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_contact_submission_attachments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `submission_id` int unsigned NOT NULL,
  `upload_id` bigint unsigned NOT NULL,
  `sort_order` tinyint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_contact_attach_upload` (`upload_id`),
  KEY `idx_contact_attach_submission` (`submission_id`),
  CONSTRAINT `fk_contact_attach_submission` FOREIGN KEY (`submission_id`) REFERENCES `cms_contact_submissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contact_attach_upload` FOREIGN KEY (`upload_id`) REFERENCES `uploads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_contact_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_contact_submissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country_id` smallint unsigned DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject_other` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `referral_source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referral_other` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `email_sent_at` timestamp NULL DEFAULT NULL,
  `email_error` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contact_country` (`country_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_media` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Stored filename (uuid-based)',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Original uploaded filename',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size_bytes` int unsigned NOT NULL,
  `width` int unsigned DEFAULT NULL,
  `height` int unsigned DEFAULT NULL,
  `media_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image' COMMENT 'image, icon_system, icon_mobile, favicon, logo, banner',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'system, cms, branding, landing',
  `alt_text` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnail_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `medium_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_media_type` (`media_type`),
  KEY `idx_category` (`category`),
  KEY `fk_media_uploader` (`uploaded_by`),
  CONSTRAINT `fk_media_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_pages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `meta_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_homepage` tinyint(1) NOT NULL DEFAULT '0',
  `page_template` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_published` tinyint(1) NOT NULL DEFAULT '0',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_section_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_section_blocks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `page_id` int unsigned NOT NULL,
  `block_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'hero, features, cta, text, team, faq, contact_form, stats, testimonials, blog_preview, image_gallery',
  `block_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtitle` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci COMMENT 'JSON: block-specific configuration fields',
  `style_config` longtext COLLATE utf8mb4_unicode_ci COMMENT 'JSON: background, padding, colors, etc.',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_page_order` (`page_id`,`sort_order`),
  CONSTRAINT `fk_block_page` FOREIGN KEY (`page_id`) REFERENCES `cms_pages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cms_sections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cms_sections` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `page_id` int unsigned NOT NULL,
  `section_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_page_section` (`page_id`,`section_key`),
  KEY `idx_page` (`page_id`),
  CONSTRAINT `fk_section_page` FOREIGN KEY (`page_id`) REFERENCES `cms_pages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_availability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_availability` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coach_id` int unsigned NOT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `day_of_week` tinyint unsigned NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coach_avail_coach` (`coach_id`,`day_of_week`),
  KEY `idx_coach_avail_branch` (`branch_id`),
  CONSTRAINT `fk_coach_avail_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coach_avail_coach` FOREIGN KEY (`coach_id`) REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_availability_blackouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_availability_blackouts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coach_id` int unsigned NOT NULL,
  `blackout_date` date NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coach_blackout` (`coach_id`,`blackout_date`),
  CONSTRAINT `fk_coach_blackout_coach` FOREIGN KEY (`coach_id`) REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_org_agreements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_org_agreements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coach_id` int unsigned NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `coach_split_pct` decimal(5,2) NOT NULL COMMENT 'Coach % after platform commission',
  `org_split_pct` decimal(5,2) NOT NULL COMMENT 'Org % after platform commission',
  `hourly_rate` decimal(12,2) DEFAULT NULL COMMENT 'Org-specific hourly rate override. NULL = use coach_profiles.hourly_rate',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('pending','accepted','active','rejected','suspended','ended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `initiated_by` enum('coach','org') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'coach',
  `invited_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coach_org` (`coach_id`,`organisation_id`),
  KEY `fk_agr_org` (`organisation_id`),
  CONSTRAINT `fk_agr_coach` FOREIGN KEY (`coach_id`) REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agr_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('none','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `platform_status` enum('active','suspended','deactivated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `rejected_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_coach_profiles_status` (`status`),
  CONSTRAINT `fk_coach_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=122 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_reviews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coach_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `session_id` int unsigned DEFAULT NULL,
  `rating` tinyint unsigned NOT NULL,
  `review_text` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review` (`coach_id`,`player_id`,`session_id`),
  KEY `idx_coach` (`coach_id`),
  KEY `fk_cr_player` (`player_id`),
  KEY `fk_cr_session` (`session_id`),
  CONSTRAINT `fk_cr_coach` FOREIGN KEY (`coach_id`) REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cr_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cr_session` FOREIGN KEY (`session_id`) REFERENCES `coach_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `coach_reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_session_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_session_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` int unsigned NOT NULL,
  `event` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` int DEFAULT NULL,
  `actor_role` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_cse_session` (`session_id`,`created_at`),
  CONSTRAINT `fk_cse_session` FOREIGN KEY (`session_id`) REFERENCES `coach_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coach_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coach_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coach_id` int unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = independent session',
  `branch_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `booking_id` bigint unsigned DEFAULT NULL,
  `player_id` int unsigned NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `price` decimal(12,2) NOT NULL,
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform_commission_pct` decimal(5,2) NOT NULL,
  `coach_earnings` decimal(12,2) NOT NULL DEFAULT '0.00',
  `org_earnings` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending_court','pending_acceptance','scheduled','confirmed','in_progress','completed','cancelled','no_show') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_court',
  `requested_at` timestamp NULL DEFAULT NULL,
  `responded_at` timestamp NULL DEFAULT NULL,
  `proposal_viewed_at` timestamp NULL DEFAULT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `hold_expires_at` timestamp NULL DEFAULT NULL,
  `proposed_start_time` datetime DEFAULT NULL,
  `proposed_end_time` datetime DEFAULT NULL,
  `proposed_court_id` int DEFAULT NULL,
  `cancelled_by` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancellation_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coach` (`coach_id`),
  KEY `idx_player` (`player_id`),
  KEY `idx_dates` (`start_time`,`end_time`),
  KEY `fk_cs_org` (`organisation_id`),
  KEY `fk_cs_branch` (`branch_id`),
  KEY `fk_cs_resource` (`resource_id`),
  KEY `idx_cs_booking` (`booking_id`),
  KEY `idx_coach_sessions_status` (`status`),
  CONSTRAINT `fk_cs_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cs_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cs_coach` FOREIGN KEY (`coach_id`) REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cs_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cs_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=361 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coaches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coaches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coaches_user_org` (`user_id`,`organisation_id`),
  KEY `idx_coaches_org` (`organisation_id`),
  CONSTRAINT `fk_coaches_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coaches_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `communication_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `communication_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `channel` enum('email','sms','push','in_app','whatsapp') COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('outbound','inbound') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'outbound',
  `subject` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `status` enum('sent','delivered','failed','opened','clicked') COLLATE utf8mb4_unicode_ci DEFAULT 'sent',
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_channel` (`channel`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `community_event_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `community_event_participants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('going','maybe','declined') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'going',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_user` (`event_id`,`user_id`),
  KEY `fk_cep_user` (`user_id`),
  CONSTRAINT `fk_cep_event` FOREIGN KEY (`event_id`) REFERENCES `community_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cep_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `community_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `community_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `creator_id` int unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `event_type` enum('match','training','social','tournament','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `max_participants` int unsigned DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('active','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_creator` (`creator_id`),
  KEY `idx_dates` (`start_time`,`end_time`),
  KEY `fk_event_org` (`organisation_id`),
  KEY `fk_event_branch` (`branch_id`),
  CONSTRAINT `fk_event_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_event_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_event_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `configuration_profile_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `configuration_profile_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `profile_id` int unsigned NOT NULL,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_profile_setting` (`profile_id`,`setting_key`),
  CONSTRAINT `fk_cps_profile` FOREIGN KEY (`profile_id`) REFERENCES `configuration_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `configuration_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `configuration_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `scope` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'global',
  `profile_version` int NOT NULL DEFAULT '1',
  `is_archived` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cp_category` (`category`),
  KEY `idx_cp_scope` (`scope`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `conversation_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversation_participants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `last_read_at` timestamp NULL DEFAULT NULL,
  `is_muted` tinyint(1) NOT NULL DEFAULT '0',
  `pinned_at` timestamp NULL DEFAULT NULL COMMENT 'When the user pinned this conversation',
  `is_admin` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Group admin can edit settings, remove members, invite',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_convo_user` (`conversation_id`,`user_id`),
  KEY `fk_cp_user` (`user_id`),
  CONSTRAINT `fk_cp_convo` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_type` enum('direct','group') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'direct',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'For group chats',
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Group avatar/logo URL',
  `created_by` int unsigned DEFAULT NULL COMMENT 'User who created the group conversation',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_convo_created_by` (`created_by`),
  CONSTRAINT `fk_convo_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `countries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `countries` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `iso_code` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `iso_code_3` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `native_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. +971, +20',
  `phone_max_length` tinyint unsigned NOT NULL DEFAULT '15',
  `phone_min_length` tinyint unsigned NOT NULL DEFAULT '7',
  `default_locale` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en',
  `default_currency` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Currency symbol (e.g. $, Γö£├│├ö├ç├£Γö¼┬╝)',
  `currency_decimal_places` tinyint unsigned DEFAULT '2' COMMENT 'Decimal places for the currency',
  `currency_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Full currency name',
  `flag_emoji` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `navigation_polygon` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '[[lat, lng], ...] polygon for map navigation',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `iso_code` (`iso_code`),
  UNIQUE KEY `iso_code_3` (`iso_code_3`),
  UNIQUE KEY `uq_countries_slug` (`slug`),
  KEY `fk_country_currency` (`default_currency`),
  CONSTRAINT `fk_country_currency` FOREIGN KEY (`default_currency`) REFERENCES `currencies` (`code`) ON DELETE SET NULL,
  CONSTRAINT `countries_chk_1` CHECK (json_valid(`navigation_polygon`))
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coupon_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coupon_assignments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` int unsigned NOT NULL,
  `entity_type` enum('organisation','branch','resource') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupon_entity` (`coupon_id`,`entity_type`,`entity_id`),
  KEY `idx_ca_entity` (`entity_type`,`entity_id`),
  KEY `idx_ca_active` (`is_active`),
  CONSTRAINT `fk_ca_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coupon_usage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coupon_usage` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `order_id` int unsigned DEFAULT NULL,
  `used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coupon` (`coupon_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_cu_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cu_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `coupons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_type` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` decimal(12,2) NOT NULL,
  `activity_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. booking, marketplace, tournament, academy',
  `sport_id` int unsigned DEFAULT NULL,
  `min_order_amount` decimal(12,2) DEFAULT NULL,
  `max_uses` int unsigned DEFAULT NULL,
  `max_uses_per_user` int unsigned DEFAULT '1',
  `starts_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`is_active`,`expires_at`),
  KEY `idx_coupon_activity` (`activity_type`),
  KEY `idx_coupon_sport` (`sport_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `currencies` (
  `id` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `symbol` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `decimal_places` tinyint unsigned NOT NULL DEFAULT '2',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_segments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_segments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `rules_json` json DEFAULT NULL COMMENT 'Segment definition rules',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `member_count` int unsigned NOT NULL DEFAULT '0',
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active` (`is_active`),
  KEY `fk_seg_creator` (`created_by`),
  CONSTRAINT `fk_seg_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dead_letter_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dead_letter_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `message_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ID of the original event/command',
  `message_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking.created, CreateBookingCommand',
  `message_category` enum('event','command') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Event or Command',
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Module that produced the message',
  `subscriber_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Subscriber that failed processing',
  `workflow_id` bigint unsigned DEFAULT NULL COMMENT 'FK to workflow_instances ??? nullable',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Trace across services',
  `causation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Parent event/command',
  `payload` json DEFAULT NULL COMMENT 'Original message payload',
  `error_message` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Error description',
  `error_stack` text COLLATE utf8mb4_unicode_ci COMMENT 'Full stack trace',
  `retry_count` int unsigned NOT NULL DEFAULT '0',
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_retry_at` timestamp NULL DEFAULT NULL COMMENT 'When the retry scheduler should retry',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolution_status` enum('pending','retrying','resolved','ignored') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `idx_dl_replay` (`resolution_status`,`failed_at`) COMMENT 'Replay worker: pending entries ordered by age',
  KEY `idx_dl_retry` (`resolution_status`,`next_retry_at`) COMMENT 'Retry scheduler: retrying entries due for retry',
  KEY `idx_dl_cleanup` (`resolution_status`,`failed_at`) COMMENT 'Cleanup: resolved/ignored entries by age'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `departments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `head_employee_id` int unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `fk_dept_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dept_parent` FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_theme_reset_baseline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `design_theme_reset_baseline` (
  `id` tinyint unsigned NOT NULL DEFAULT '1',
  `label` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `saved_by` int unsigned DEFAULT NULL,
  `saved_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `design_theme_reset_baseline_chk_1` CHECK (json_valid(`snapshot`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_token_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `design_token_versions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `label` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Flat map { token_key: value } of the published theme at this point',
  `published_by` int unsigned DEFAULT NULL,
  `published_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dtv_published_at` (`published_at`),
  CONSTRAINT `design_token_versions_chk_1` CHECK (json_valid(`snapshot`))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `design_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `token_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. color-primary, radius-sm, font-body',
  `token_type` enum('color','size','radius','font','shadow','spacing','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `default_value` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Overridden by super admin; NULL = use default',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `draft_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT '1',
  `role_editable` tinyint(1) NOT NULL DEFAULT '0',
  `current_value_dark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `draft_value_dark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_key` (`token_key`)
) ENGINE=InnoDB AUTO_INCREMENT=66691 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `elo_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `elo_ratings` (
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `rating` int NOT NULL DEFAULT '1200',
  `matches_played` int NOT NULL DEFAULT '0',
  `k_factor` int NOT NULL DEFAULT '32',
  `last_match_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`sport_id`),
  KEY `idx_elo_rating` (`sport_id`,`rating` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `position_id` int unsigned DEFAULT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employment_status` enum('draft','onboarding','active','on_leave','suspended','terminated','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `hire_date` date DEFAULT NULL,
  `termination_date` date DEFAULT NULL,
  `termination_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reports_to` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_org` (`user_id`,`organisation_id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_dept` (`department_id`),
  KEY `idx_status` (`employment_status`),
  KEY `fk_emp_pos` (`position_id`),
  KEY `fk_emp_reports` (`reports_to`),
  CONSTRAINT `fk_emp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emp_pos` FOREIGN KEY (`position_id`) REFERENCES `positions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_reports` FOREIGN KEY (`reports_to`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `employment_contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employment_contracts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL,
  `contract_type` enum('permanent','fixed_term','probation','internship','freelance') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'permanent',
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `salary_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `payment_frequency` enum('monthly','biweekly','weekly','daily','hourly') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `status` enum('draft','active','expired','terminated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `document_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_employee` (`employee_id`),
  CONSTRAINT `fk_ec_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `feature_flags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `flag_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flag_key` (`flag_key`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `financial_entitlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `financial_entitlements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID for API exposure',
  `organisation_id` int unsigned NOT NULL COMMENT 'Owning organisation',
  `branch_id` int unsigned DEFAULT NULL COMMENT 'Branch scope (NULL = org-wide)',
  `entitlement_type` enum('ORGANIZATION_EARNING','COURTZON_COMMISSION','ORGANIZATION_ADJUSTMENT','COURTZON_ADJUSTMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_type` enum('booking','academy','marketplace','tournament','coach_session','manual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` bigint unsigned DEFAULT NULL COMMENT 'ID of the source entity (booking.id, order.id, etc.)',
  `collector` enum('courtzon','org') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Who originally collected the money: courtzon (online/wallet) or org (cash/COD)',
  `amount` decimal(14,2) NOT NULL COMMENT 'Entitlement amount (always positive)',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `status` enum('PENDING','AVAILABLE','ON_HOLD','SETTLED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `hold_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reason if ON_HOLD',
  `cancelled_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reason if CANCELLED',
  `available_at` timestamp NULL DEFAULT NULL COMMENT 'When entitlement becomes AVAILABLE (activation window)',
  `settled_at` timestamp NULL DEFAULT NULL COMMENT 'When settlement was completed',
  `settled_by` bigint unsigned DEFAULT NULL COMMENT 'User who processed settlement',
  `settlement_id` int unsigned DEFAULT NULL COMMENT 'FK to settlements.id (future unified settlement)',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT 'Human-readable description',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'JSON metadata (booking details, line items, etc.)',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1' COMMENT 'Optimistic concurrency',
  `created_by` bigint unsigned DEFAULT NULL COMMENT 'User who created (NULL = system)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fe_public_id` (`public_id`),
  UNIQUE KEY `uk_fe_source_type` (`source_type`,`source_id`,`entitlement_type`),
  KEY `idx_fe_org_status` (`organisation_id`,`status`),
  KEY `idx_fe_source` (`source_type`,`source_id`),
  KEY `idx_fe_type_status` (`entitlement_type`,`status`),
  KEY `idx_fe_available_at` (`available_at`,`status`),
  KEY `idx_fe_settlement` (`settlement_id`),
  KEY `idx_fe_branch` (`branch_id`),
  KEY `idx_fe_created_at` (`created_at`),
  KEY `idx_fe_org_status_settlement` (`organisation_id`,`status`,`settlement_id`),
  CONSTRAINT `fk_fe_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fe_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE SET NULL,
  CONSTRAINT `financial_entitlements_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB AUTO_INCREMENT=700495 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `financial_journal_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `financial_journal_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `entry_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `debit_account` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credit_account` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(14,2) DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reference` (`reference_type`,`reference_id`)
) ENGINE=InnoDB AUTO_INCREMENT=297 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `general_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `general_ledger` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ledger_entry_id` bigint unsigned DEFAULT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `period_id` int unsigned NOT NULL,
  `account_id` int unsigned NOT NULL,
  `entry_date` date NOT NULL,
  `debit` decimal(14,2) NOT NULL DEFAULT '0.00',
  `credit` decimal(14,2) NOT NULL DEFAULT '0.00',
  `balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gl_ledger_entry` (`ledger_entry_id`),
  KEY `idx_period` (`period_id`),
  KEY `idx_account` (`account_id`),
  KEY `idx_date` (`entry_date`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  KEY `fk_gl_creator` (`created_by`),
  KEY `idx_gl_org` (`organisation_id`),
  CONSTRAINT `fk_gl_account` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`),
  CONSTRAINT `fk_gl_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_gl_le` FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_gl_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_gl_period` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=39146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `group_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `group_invitations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `inviter_id` int unsigned NOT NULL,
  `invitee_id` int unsigned NOT NULL,
  `status` enum('pending','accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_invite` (`conversation_id`,`invitee_id`),
  KEY `fk_gi_inviter` (`inviter_id`),
  KEY `fk_gi_invitee` (`invitee_id`),
  CONSTRAINT `fk_gi_convo` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gi_invitee` FOREIGN KEY (`invitee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gi_inviter` FOREIGN KEY (`inviter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `holidays` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `owner_type` enum('organisation','branch','resource') COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. Ramadan, Eid, New Year',
  `date_from` date NOT NULL,
  `date_to` date NOT NULL,
  `is_recurring` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Recurring yearly (e.g. holidays)',
  `is_open_modified` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'TRUE if hours differ on these days',
  `open_time` time DEFAULT NULL COMMENT 'Modified hours if is_open_modified',
  `close_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_holiday_owner` (`owner_type`,`owner_id`),
  KEY `idx_holiday_dates` (`date_from`,`date_to`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventory_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `variant_id` int unsigned NOT NULL,
  `warehouse_id` int unsigned DEFAULT NULL,
  `movement_type` enum('in','out','adjustment','reservation','release','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL COMMENT 'Positive for in, negative for out',
  `stock_before` int unsigned NOT NULL DEFAULT '0',
  `stock_after` int unsigned NOT NULL DEFAULT '0',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'order, adjustment, return, etc.',
  `reference_id` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_il_variant` (`variant_id`),
  KEY `idx_il_created` (`created_at`),
  KEY `idx_il_reference` (`reference_type`,`reference_id`),
  KEY `fk_il_user` (`created_by`),
  KEY `idx_wh` (`warehouse_id`),
  CONSTRAINT `fk_il_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_il_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invitations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('sent','read','declined','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
  `sent_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  `responded_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitation` (`match_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`status`,`expires_at`),
  CONSTRAINT `fk_inv_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invoice_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `invoice_id` int unsigned NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '1',
  `price_type` enum('net','gross') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'net',
  `tax_treatment` enum('taxable','zero_rated','exempt') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'taxable',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `unit_price` decimal(14,2) NOT NULL DEFAULT '0.00',
  `tax_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `tax_rate_id` int unsigned DEFAULT NULL,
  `total` decimal(14,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_ii_invoice` (`invoice_id`),
  KEY `idx_ii_tax_rate` (`tax_rate_id`),
  CONSTRAINT `fk_ii_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ii_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1699 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invoices` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `invoice_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_type` enum('sales','purchase','credit_note','debit_note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sales',
  `status` enum('draft','issued','paid','partially_paid','overdue','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `issue_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total` decimal(14,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` int unsigned DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoice_number` (`invoice_number`),
  KEY `idx_inv_org` (`organisation_id`),
  KEY `idx_inv_user` (`user_id`),
  KEY `idx_inv_status` (`status`),
  KEY `idx_inv_reference` (`reference_type`,`reference_id`),
  KEY `fk_invoice_creator` (`created_by`),
  CONSTRAINT `fk_invoice_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_invoice_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invoice_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1447 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `join_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `join_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('submitted','withdrawn','approved','rejected','auto_rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` timestamp NULL DEFAULT NULL,
  `responder_id` int unsigned DEFAULT NULL COMMENT 'User who approved/rejected (NULL = system)',
  `rejection_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_join_request` (`match_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status_match` (`status`,`match_id`),
  KEY `fk_jr_responder` (`responder_id`),
  CONSTRAINT `fk_jr_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jr_responder` FOREIGN KEY (`responder_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_jr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kpi_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kpi_snapshots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `kpi_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kpi_value` decimal(18,2) NOT NULL DEFAULT '0.00',
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kpi_key` (`kpi_key`),
  KEY `idx_period` (`period_start`,`period_end`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `languages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `languages` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. en, ar, fr',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `native_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_rtl` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leads` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'registration, referral, manual, import',
  `full_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('new','qualified','converted','lost') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `converted_user_id` int unsigned DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `assigned_to` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_assigned` (`assigned_to`),
  KEY `idx_source` (`source`),
  KEY `fk_lead_conv` (`converted_user_id`),
  CONSTRAINT `fk_lead_assign` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lead_conv` FOREIGN KEY (`converted_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `league_divisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `league_divisions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `league_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tier` int unsigned NOT NULL DEFAULT '1' COMMENT '1=top,2=second,etc',
  `capacity` int unsigned NOT NULL DEFAULT '0',
  `advance_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'Promotion spots to next tier',
  `relegation_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'Relegation spots to lower tier',
  `status` enum('active','inactive','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_league` (`league_id`),
  CONSTRAINT `fk_div_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `league_matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `league_matches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `division_id` int unsigned NOT NULL,
  `home_team_id` int unsigned NOT NULL,
  `away_team_id` int unsigned NOT NULL,
  `round` int unsigned NOT NULL,
  `match_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `court_id` int unsigned DEFAULT NULL,
  `referee_id` int unsigned DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','cancelled','walkover') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_division` (`division_id`),
  KEY `idx_round` (`round`),
  KEY `idx_status` (`status`),
  KEY `idx_date` (`match_date`),
  KEY `idx_court` (`court_id`),
  KEY `idx_referee` (`referee_id`),
  KEY `fk_lm_home` (`home_team_id`),
  KEY `fk_lm_away` (`away_team_id`),
  CONSTRAINT `fk_lm_away` FOREIGN KEY (`away_team_id`) REFERENCES `league_teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lm_court` FOREIGN KEY (`court_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lm_div` FOREIGN KEY (`division_id`) REFERENCES `league_divisions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lm_home` FOREIGN KEY (`home_team_id`) REFERENCES `league_teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `league_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `league_results` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int unsigned NOT NULL,
  `home_score` text COLLATE utf8mb4_unicode_ci COMMENT 'Flexible JSON score for home team',
  `away_score` text COLLATE utf8mb4_unicode_ci COMMENT 'Flexible JSON score for away team',
  `winner_team_id` int unsigned DEFAULT NULL COMMENT 'NULL = draw',
  `result_status` enum('submitted','confirmed','disputed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `entered_by` int unsigned NOT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_match` (`match_id`),
  KEY `idx_winner` (`winner_team_id`),
  KEY `fk_lr_entered` (`entered_by`),
  CONSTRAINT `fk_lr_entered` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_lr_match` FOREIGN KEY (`match_id`) REFERENCES `league_matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_winner` FOREIGN KEY (`winner_team_id`) REFERENCES `league_teams` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `league_standings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `league_standings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `division_id` int unsigned NOT NULL,
  `team_id` int unsigned NOT NULL,
  `played` int unsigned NOT NULL DEFAULT '0',
  `wins` int unsigned NOT NULL DEFAULT '0',
  `draws` int unsigned NOT NULL DEFAULT '0',
  `losses` int unsigned NOT NULL DEFAULT '0',
  `goals_for` int unsigned NOT NULL DEFAULT '0',
  `goals_against` int unsigned NOT NULL DEFAULT '0',
  `goal_difference` int NOT NULL DEFAULT '0',
  `points` decimal(10,2) NOT NULL DEFAULT '0.00',
  `position` int unsigned DEFAULT NULL,
  `form` json DEFAULT NULL COMMENT 'Last 5 results (W/D/L)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_div_team` (`division_id`,`team_id`),
  KEY `idx_position` (`division_id`,`position`),
  KEY `fk_ls_team` (`team_id`),
  CONSTRAINT `fk_ls_div` FOREIGN KEY (`division_id`) REFERENCES `league_divisions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ls_team` FOREIGN KEY (`team_id`) REFERENCES `league_teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `league_teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `league_teams` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `division_id` int unsigned NOT NULL,
  `team_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `captain_id` int unsigned DEFAULT NULL,
  `player_ids` json DEFAULT NULL COMMENT 'Roster of player user IDs',
  `status` enum('pending','confirmed','waiting','cancelled','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `waiting_order` int unsigned DEFAULT NULL,
  `seed` int unsigned DEFAULT NULL,
  `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_div_team` (`division_id`,`team_name`),
  KEY `idx_status` (`status`),
  KEY `idx_captain` (`captain_id`),
  CONSTRAINT `fk_team_div` FOREIGN KEY (`division_id`) REFERENCES `league_divisions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leagues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leagues` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season_id` int unsigned NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `sport_id` int unsigned DEFAULT NULL,
  `format` enum('round_robin','double_round_robin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'round_robin',
  `max_teams` int unsigned NOT NULL DEFAULT '0',
  `registration_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `price_type` enum('FREE','FIXED','MEMBERS_ONLY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `status` enum('draft','registration_open','registration_closed','running','completed','cancelled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `points_per_win` tinyint unsigned NOT NULL DEFAULT '3',
  `points_per_draw` tinyint unsigned NOT NULL DEFAULT '1',
  `archived_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_season` (`season_id`),
  KEY `idx_status` (`status`),
  KEY `idx_sport` (`sport_id`),
  CONSTRAINT `fk_league_season` FOREIGN KEY (`season_id`) REFERENCES `seasons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leave_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leave_balances` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL,
  `leave_type_id` int unsigned NOT NULL,
  `total_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `used_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `pending_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `year` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_emp_type_year` (`employee_id`,`leave_type_id`,`year`),
  KEY `fk_lb_type` (`leave_type_id`),
  CONSTRAINT `fk_lb_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lb_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leave_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leave_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL,
  `leave_type_id` int unsigned NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `duration_days` decimal(5,1) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','submitted','approved','rejected','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_status` (`status`),
  KEY `fk_lr_type` (`leave_type_id`),
  KEY `fk_lr_approver` (`approved_by`),
  CONSTRAINT `fk_lr_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leave_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leave_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `default_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `is_paid` tinyint(1) NOT NULL DEFAULT '1',
  `requires_approval` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_lt_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ledger_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `transaction_id` varchar(64) NOT NULL,
  `source_type` enum('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement','journal','tournament','year_close','year_close_reopen','invoice') NOT NULL,
  `source_id` int unsigned NOT NULL,
  `event_type` varchar(50) DEFAULT NULL COMMENT 'Accounting event type (e.g. card_payment)',
  `period_id` int unsigned DEFAULT NULL,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = platform event',
  `chart_account_id` int unsigned DEFAULT NULL COMMENT 'FK to chart_of_accounts',
  `account_type` enum('platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund') DEFAULT NULL,
  `side` enum('debit','credit') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'EGP',
  `description` text,
  `reference_id` varchar(128) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dedup` (`source_type`,`source_id`,`event_type`,`chart_account_id`,`side`),
  KEY `idx_ledger_tx` (`transaction_id`),
  KEY `idx_ledger_source` (`source_type`,`source_id`),
  KEY `idx_ledger_date` (`recorded_at`),
  KEY `idx_ledger_account` (`account_type`,`recorded_at`),
  KEY `idx_event` (`event_type`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_chart_account` (`chart_account_id`),
  KEY `idx_le_period` (`period_id`),
  CONSTRAINT `fk_le_chart_account` FOREIGN KEY (`chart_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_le_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_le_period` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=35067 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `login_attempts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `identifier` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `success` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_attempts_identifier` (`identifier`),
  KEY `idx_login_attempts_success` (`success`),
  KEY `idx_login_attempts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `loyalty_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `loyalty_campaigns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `points_multiplier` decimal(5,2) NOT NULL DEFAULT '1.00',
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `applicable_activities` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaign_active` (`is_active`,`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `loyalty_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `loyalty_points` (
  `user_id` int unsigned NOT NULL,
  `total_earned` int NOT NULL DEFAULT '0',
  `total_spent` int NOT NULL DEFAULT '0',
  `current_balance` int NOT NULL DEFAULT '0',
  `current_tier` enum('bronze','silver','gold','platinum','diamond') NOT NULL DEFAULT 'bronze',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketing_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marketing_campaigns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('email','sms','push','in_app','multi_channel') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'multi_channel',
  `status` enum('draft','active','paused','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `segment_id` int unsigned DEFAULT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `stats_json` json DEFAULT NULL COMMENT 'Cached campaign stats',
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_segment` (`segment_id`),
  KEY `idx_type` (`type`),
  KEY `fk_mc_creator` (`created_by`),
  CONSTRAINT `fk_mc_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_mc_segment` FOREIGN KEY (`segment_id`) REFERENCES `customer_segments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketplace_complaint_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marketplace_complaint_config` (
  `id` tinyint unsigned NOT NULL DEFAULT '1' COMMENT 'Singleton row (always 1)',
  `complaint_period_days` int unsigned NOT NULL DEFAULT '7' COMMENT 'Days after delivery during which buyers may raise a complaint/refund',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 disables the complaint window (entitlements activate immediately on delivery)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Platform-wide marketplace complaint window configuration';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketplace_complaints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marketplace_complaints` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` int unsigned NOT NULL,
  `order_item_id` int unsigned NOT NULL,
  `product_id` int unsigned NOT NULL,
  `buyer_id` int unsigned NOT NULL,
  `seller_org_id` int unsigned NOT NULL,
  `complaint_type` enum('defective','damaged','wrong_item','missing_item','not_as_described','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Mandatory written reason',
  `images` json DEFAULT NULL COMMENT 'Up to 3 optional image URLs',
  `attempt_number` tinyint unsigned NOT NULL DEFAULT '1' COMMENT '1 or 2 (max two attempts per order_item)',
  `status` enum('pending','in_review','awaiting_return','refund_pending_approval','refunded','awaiting_confirmation','resolved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `resolution_type` enum('refund','replacement','reshipment','rejected') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disputed_value` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'System-calculated original disputed value from order snapshot',
  `refund_amount` decimal(14,2) DEFAULT NULL COMMENT 'Manual refund amount entered by organisation',
  `refund_ratio` decimal(6,4) DEFAULT NULL COMMENT 'refund_amount / disputed_value',
  `refund_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Mandatory when refund > disputed value',
  `needs_return` tinyint(1) NOT NULL DEFAULT '0',
  `collection_status` enum('not_required','pending','in_progress','collected','inspected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_required',
  `collection_due_at` datetime DEFAULT NULL,
  `collection_completed_at` datetime DEFAULT NULL,
  `collection_escalated_at` datetime DEFAULT NULL COMMENT 'Set when collection-deadline escalation was notified to CourtZon staff',
  `replacement_sent_at` datetime DEFAULT NULL,
  `reshipment_sent_at` datetime DEFAULT NULL,
  `receipt_awaited` tinyint(1) NOT NULL DEFAULT '0',
  `receipt_due_at` datetime DEFAULT NULL COMMENT 'Player confirmation deadline (7 days after shipment)',
  `receipt_confirmed_at` datetime DEFAULT NULL,
  `admin_approval_required` tinyint(1) NOT NULL DEFAULT '0',
  `approval_status` enum('none','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approval_reason` text COLLATE utf8mb4_unicode_ci,
  `rejected_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Written rejection reason (organisation or admin)',
  `resolved_by` int unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `entitlement_ids` json DEFAULT NULL COMMENT 'financial_entitlements ids held/adjusted by this complaint',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1' COMMENT 'Optimistic locking',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mc_public_id` (`public_id`),
  KEY `idx_mc_buyer` (`buyer_id`),
  KEY `idx_mc_seller` (`seller_org_id`),
  KEY `idx_mc_status` (`status`),
  KEY `idx_mc_order` (`order_id`),
  KEY `idx_mc_item` (`order_item_id`),
  KEY `idx_mc_approval` (`approval_status`),
  KEY `fk_mc_product` (`product_id`),
  KEY `idx_mc_collection_due` (`collection_due_at`,`collection_status`),
  CONSTRAINT `fk_mc_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_mc_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`),
  CONSTRAINT `fk_mc_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_mc_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_mc_seller` FOREIGN KEY (`seller_org_id`) REFERENCES `organisations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=977163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Marketplace complaints/refunds lifecycle';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketplace_ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marketplace_ledger_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `order_item_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `organisation_id` int unsigned NOT NULL,
  `entry_type` enum('inventory_deduction','due_to_collect','due_to_transfer','due_to_courtzon','reversal','refund') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_method` enum('cod','online') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `description` text COLLATE utf8mb4_unicode_ci,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mle_order` (`order_id`),
  KEY `idx_mle_branch` (`branch_id`),
  KEY `idx_mle_org` (`organisation_id`),
  KEY `idx_mle_type` (`entry_type`),
  KEY `idx_mle_org_type_amount` (`organisation_id`,`entry_type`,`amount`),
  KEY `idx_mle_org_created` (`organisation_id`,`created_at`),
  CONSTRAINT `fk_mle_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mle_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mle_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `marketplace_ledger_entries_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB AUTO_INCREMENT=876 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `match_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `role` enum('host','joiner') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'joiner',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_participant` (`match_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_part_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_part_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `match_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `status` enum('in_progress','completed','voided') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `started_at` timestamp NULL DEFAULT NULL,
  `ended_at` timestamp NULL DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `winner_id` int unsigned DEFAULT NULL,
  `participants_confirmed` json DEFAULT NULL COMMENT 'Array of user_ids who checked in',
  `no_show_user_ids` json DEFAULT NULL COMMENT 'Array of user_ids who did not show',
  `scores` json DEFAULT NULL COMMENT 'Sport-specific score data',
  `format` json DEFAULT NULL COMMENT 'Rules, game format settings',
  `metadata` json DEFAULT NULL COMMENT 'Extensible for future needs',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `match_id` (`match_id`),
  KEY `idx_status` (`status`),
  KEY `idx_winner` (`winner_id`),
  CONSTRAINT `fk_session_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_winner` FOREIGN KEY (`winner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `matches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('public') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('open','full','closed','in_progress','completed','cancelled','void') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `booking_id` bigint unsigned DEFAULT NULL,
  `sport_id` int unsigned NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_booking` (`booking_id`),
  KEY `idx_type_status` (`type`,`status`),
  KEY `idx_sport_date` (`sport_id`,`status`,`created_at`),
  CONSTRAINT `fk_match_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_match_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=128 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `membership_benefits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `membership_benefits` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `membership_plan_id` int unsigned NOT NULL,
  `benefit_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `benefit_value` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_benefit_plan` (`membership_plan_id`),
  KEY `idx_benefit_key` (`benefit_key`),
  CONSTRAINT `fk_benefit_plan` FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `membership_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `membership_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_membership_id` int unsigned NOT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_membership` (`user_membership_id`),
  KEY `idx_history_action` (`action`),
  KEY `idx_history_created` (`created_at`),
  CONSTRAINT `fk_history_membership` FOREIGN KEY (`user_membership_id`) REFERENCES `user_memberships` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `membership_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `membership_plans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `category` varchar(50) NOT NULL DEFAULT 'general',
  `duration_type` enum('days','months','years','perpetual') NOT NULL DEFAULT 'months',
  `duration_value` int unsigned NOT NULL DEFAULT '1',
  `plan_type` enum('monthly','quarterly','semiannual','annual','unlimited','credits','session_bundle','corporate','family','student') NOT NULL,
  `duration_days` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'EGP',
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `credits` int DEFAULT NULL,
  `sessions` int DEFAULT NULL,
  `benefits` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `organisation_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_code` (`code`),
  KEY `idx_plan_active` (`is_active`),
  KEY `idx_plan_category` (`category`),
  KEY `idx_plan_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `memberships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `plan_id` int unsigned NOT NULL,
  `status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'active',
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `credits_used` int NOT NULL DEFAULT '0',
  `sessions_used` int NOT NULL DEFAULT '0',
  `auto_renew` tinyint(1) NOT NULL DEFAULT '0',
  `aggregate_version` int NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_user` (`user_id`),
  KEY `idx_member_status` (`status`,`end_date`),
  KEY `idx_member_plan` (`plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `sender_id` int unsigned NOT NULL,
  `message_type` enum('text','image','file','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `is_edited` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversation` (`conversation_id`),
  KEY `idx_sender` (`sender_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_msg_convo` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_ab_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_ab_results` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `test_id` bigint unsigned NOT NULL,
  `notification_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `variant` enum('A','B') NOT NULL,
  `template_id` int unsigned NOT NULL,
  `template_version` int unsigned DEFAULT NULL,
  `action` varchar(50) DEFAULT NULL,
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ab_test` (`test_id`,`variant`),
  KEY `idx_ab_notification` (`notification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_ab_tests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_ab_tests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `test_key` varchar(50) NOT NULL,
  `template_id_a` int unsigned NOT NULL,
  `template_id_b` int unsigned NOT NULL,
  `category_slug` varchar(50) NOT NULL,
  `event_name` varchar(100) NOT NULL,
  `traffic_split` tinyint unsigned NOT NULL DEFAULT '50',
  `starts_at` timestamp NULL DEFAULT NULL,
  `ends_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_test_key` (`test_key`),
  KEY `idx_ab_test_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `action_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. view_booking, open_chat, view_tournament',
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confirm_message` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route_pattern` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Frontend route with params placeholder',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `action_key` (`action_key`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_analytics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_analytics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `event_name` varchar(100) DEFAULT NULL,
  `category_slug` varchar(50) DEFAULT NULL,
  `channel` enum('in_app','push','email','sms') DEFAULT NULL,
  `action` varchar(50) NOT NULL DEFAULT 'sent',
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analytics_action` (`action`,`created_at`),
  KEY `idx_analytics_notification` (`notification_id`),
  KEY `idx_analytics_event` (`event_name`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=497 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_audit_trail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_audit_trail` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `lifecycle_event` varchar(50) NOT NULL,
  `channel` varchar(20) DEFAULT NULL,
  `provider_slug` varchar(30) DEFAULT NULL,
  `attempt` tinyint unsigned DEFAULT '1',
  `metadata` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_notification` (`notification_id`,`lifecycle_event`),
  KEY `idx_audit_user` (`user_id`,`created_at`),
  KEY `idx_audit_event` (`lifecycle_event`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1489 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_broadcasts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_broadcasts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `type` enum('info','success','warning','error','reminder') DEFAULT 'info',
  `priority` enum('low','normal','high','critical') DEFAULT 'normal',
  `action_key` varchar(100) DEFAULT NULL,
  `route_pattern` varchar(255) DEFAULT NULL,
  `image_urls` json DEFAULT NULL,
  `actions` json DEFAULT NULL,
  `target_scope` varchar(50) NOT NULL DEFAULT 'all',
  `target_value` varchar(500) DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcasts_active` (`is_active`,`scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_cleanup_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_cleanup_policies` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `policy_key` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `entity_table` varchar(50) NOT NULL,
  `retention_days` int unsigned NOT NULL DEFAULT '90',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `last_run_at` timestamp NULL DEFAULT NULL,
  `deleted_count` bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `policy_key` (`policy_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_dead_letter_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_dead_letter_queue` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `channel` enum('in_app','push','email','sms') NOT NULL,
  `payload` json NOT NULL,
  `error_message` text NOT NULL,
  `failed_attempts` tinyint unsigned NOT NULL,
  `last_error_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dlq_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_delivery`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_delivery` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `channel` enum('in_app','push','email','sms') NOT NULL DEFAULT 'in_app',
  `status` enum('queued','processing','sent','delivered','failed','dead_letter') NOT NULL DEFAULT 'queued',
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `max_retries` tinyint unsigned NOT NULL DEFAULT '3',
  `error_message` text,
  `queued_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `processing_at` timestamp NULL DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `clicked_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_status` (`status`,`attempts`,`queued_at`),
  KEY `idx_delivery_notification` (`notification_id`),
  KEY `idx_delivery_user` (`user_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=497 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_digest_windows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_digest_windows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `category_slug` varchar(50) NOT NULL,
  `event_name` varchar(100) NOT NULL,
  `related_entity_type` varchar(50) DEFAULT NULL,
  `related_entity_id` varchar(100) DEFAULT NULL,
  `count` int unsigned NOT NULL DEFAULT '1',
  `window_opens_at` timestamp NOT NULL,
  `window_closes_at` timestamp NOT NULL,
  `is_aggregated` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_digest_user` (`user_id`,`is_aggregated`),
  KEY `idx_digest_window` (`window_closes_at`,`is_aggregated`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_feature_flags` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `flag_key` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flag_key` (`flag_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_global_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_global_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_setting_key` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_providers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_providers` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(30) NOT NULL,
  `label` varchar(100) NOT NULL,
  `class_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `priority` tinyint unsigned NOT NULL DEFAULT '0',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `config` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_queue` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `notification_id` bigint unsigned DEFAULT NULL,
  `channel` enum('push','email','sms','in_app') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `retry_count` tinyint unsigned NOT NULL DEFAULT '0',
  `max_retries` tinyint unsigned NOT NULL DEFAULT '3',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `scheduled_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`,`scheduled_at`),
  KEY `fk_queue_user` (`user_id`),
  CONSTRAINT `fk_queue_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_rate_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_rate_limits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `category_slug` varchar(50) NOT NULL,
  `event_name` varchar(100) NOT NULL,
  `count` int unsigned NOT NULL DEFAULT '1',
  `window_start` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rate_window` (`user_id`,`category_slug`,`event_name`,`window_start`),
  KEY `idx_rate_expiry` (`window_start`)
) ENGINE=InnoDB AUTO_INCREMENT=449 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_replay_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_replay_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_name` varchar(100) NOT NULL,
  `payload` json NOT NULL,
  `replayed_by` int unsigned DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `affected_users` int unsigned DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_replay_event` (`event_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_retry_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_retry_policies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `policy_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_slug` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'NULL = default policy',
  `max_retries` int unsigned NOT NULL DEFAULT '3',
  `retry_delay_ms` int unsigned NOT NULL DEFAULT '30000',
  `exponential_backoff` tinyint(1) NOT NULL DEFAULT '1',
  `max_delay_ms` int unsigned DEFAULT '300000',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_policy_key` (`policy_key`),
  KEY `idx_category` (`category_slug`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_rule_conditions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_rule_conditions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rule_id` int unsigned NOT NULL,
  `field` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. user_online, is_quiet_hours, is_vip, user_role',
  `operator` enum('equals','not_equals','greater_than','less_than','contains','in','is_true','is_false') COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rule` (`rule_id`),
  CONSTRAINT `fk_rule_condition` FOREIGN KEY (`rule_id`) REFERENCES `notification_rules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'NULL = applies to all events',
  `category_slug` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `priority` int unsigned NOT NULL DEFAULT '100' COMMENT 'Lower = evaluated first',
  `action` enum('suppress','delay','force_channel','force_priority','require_approval') COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_data` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON: channel, priority, delay, etc.',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event` (`event_name`),
  KEY `idx_category` (`category_slug`),
  KEY `idx_active_priority` (`is_active`,`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_template_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_template_versions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int unsigned NOT NULL,
  `version` int unsigned NOT NULL,
  `title_template` text NOT NULL,
  `body_template` text,
  `action_key` varchar(100) DEFAULT NULL,
  `route_pattern` varchar(255) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `actions` json DEFAULT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `change_summary` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_version` (`template_id`,`version`),
  KEY `idx_template_versions` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) DEFAULT NULL,
  `notification_type_id` int unsigned DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `description` text,
  `event_name` varchar(100) NOT NULL,
  `locale` varchar(10) NOT NULL DEFAULT 'en',
  `category_slug` varchar(50) NOT NULL,
  `type` enum('info','success','warning','error','reminder') DEFAULT 'info',
  `priority` enum('low','normal','high','critical') DEFAULT 'normal',
  `title_template` text NOT NULL,
  `body_template` text,
  `content_format` enum('handlebars','text','html') NOT NULL DEFAULT 'handlebars',
  `action_key` varchar(100) DEFAULT NULL,
  `route_pattern` varchar(255) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `variables` json DEFAULT NULL,
  `actions` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `version` int unsigned NOT NULL DEFAULT '1',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_locale` (`event_name`,`locale`),
  UNIQUE KEY `uk_template_code` (`code`),
  UNIQUE KEY `uk_template_type_locale_version` (`notification_type_id`,`locale`,`version`),
  KEY `idx_templates_active` (`is_active`,`event_name`),
  KEY `idx_template_code` (`code`),
  KEY `idx_template_notification_type` (`notification_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=232 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `priority` enum('low','normal','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `default_channels` json NOT NULL,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `requires_action` tinyint(1) NOT NULL DEFAULT '0',
  `system_managed` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_type_code` (`code`),
  UNIQUE KEY `uk_notification_type_event_key` (`event_key`),
  KEY `idx_notification_type_category` (`category`),
  KEY `idx_notification_type_enabled` (`enabled`),
  KEY `idx_notification_type_sort` (`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_webhooks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notification_webhooks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `url` varchar(500) NOT NULL,
  `secret` varchar(255) NOT NULL,
  `events` json NOT NULL,
  `headers` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_triggered_at` timestamp NULL DEFAULT NULL,
  `last_status_code` smallint unsigned DEFAULT NULL,
  `failed_count` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhooks_org` (`organisation_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `category_id` int unsigned DEFAULT NULL,
  `category_slug` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_id` int unsigned DEFAULT NULL,
  `action_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Params for the action route',
  `actions` json DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rendered_title` text COLLATE utf8mb4_unicode_ci,
  `body` text COLLATE utf8mb4_unicode_ci,
  `rendered_body` text COLLATE utf8mb4_unicode_ci,
  `image_urls` json DEFAULT NULL,
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'info',
  `priority` enum('low','normal','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `organization_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `sender_id` int unsigned DEFAULT NULL,
  `template_id` int unsigned DEFAULT NULL,
  `template_version` int unsigned DEFAULT NULL,
  `related_entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `is_pushed` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `archived_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read` (`user_id`,`is_read`),
  KEY `idx_created` (`created_at`),
  KEY `fk_notif_category` (`category_id`),
  KEY `fk_notif_action` (`action_id`),
  KEY `idx_notifications_push` (`user_id`,`is_pushed`,`created_at`),
  KEY `idx_notifications_org` (`organization_id`),
  KEY `idx_notifications_entity` (`related_entity_type`,`related_entity_id`),
  KEY `idx_notifications_priority` (`priority`,`created_at`),
  KEY `idx_notifications_template` (`template_id`),
  KEY `idx_notifications_event` (`event_name`),
  KEY `idx_user_created` (`user_id`,`created_at` DESC),
  CONSTRAINT `fk_notif_action` FOREIGN KEY (`action_id`) REFERENCES `notification_actions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_category` FOREIGN KEY (`category_id`) REFERENCES `notification_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_chk_1` CHECK (json_valid(`action_payload`))
) ENGINE=InnoDB AUTO_INCREMENT=580 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `order_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `product_id` int unsigned NOT NULL,
  `variant_id` int unsigned DEFAULT NULL,
  `seller_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `total_price` decimal(12,2) NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `settlement_status` enum('pending','settled','in_dispute') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`),
  KEY `idx_seller` (`seller_id`),
  KEY `fk_oi_product` (`product_id`),
  KEY `idx_order_items_seller_created` (`seller_id`,`created_at`),
  KEY `idx_order_items_seller_settlement` (`seller_id`,`settlement_status`),
  KEY `idx_order_items_seller_order_settlement` (`seller_id`,`order_id`,`settlement_status`),
  CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oi_org` FOREIGN KEY (`seller_id`) REFERENCES `organisations` (`id`),
  CONSTRAINT `fk_oi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=700557 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `order_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `order_status_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `from_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `changed_by_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`),
  CONSTRAINT `fk_hist_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2609 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `orders` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checkout_group_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UUID linking all seller-orders from one checkout',
  `buyer_id` int unsigned NOT NULL,
  `status` enum('pending','confirmed','processing','shipped','delivered','cancelled','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `payment_status` enum('unpaid','paid','refunded','partial_refund') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `subtotal` decimal(12,2) NOT NULL,
  `shipping_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `estimated_delivery_date` date DEFAULT NULL,
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Platform commission',
  `courtzon_commission` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'CourtZon commission due on this order (same as commission_amount)',
  `org_product_share` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Org revenue from products = subtotal - discount - commission',
  `org_shipping_share` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Org revenue from shipping = shipping_cost',
  `coupon_id` int unsigned DEFAULT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total` decimal(12,2) NOT NULL,
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cash_holder` enum('org','courtzon') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Who collects/collected the cash: org (COD) or courtzon (online/wallet)',
  `cash_collection_status` enum('expected_from_customer','under_collection','held_by_org','held_by_courtzon') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Current status of the cash collection lifecycle',
  `settlement_status` enum('pending','settled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'Settlement status between CourtZon and the organisation',
  `shipping_address` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `shipping_carrier` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tracking_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `paid_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancellation_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `courtzon_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_buyer` (`buyer_id`),
  KEY `idx_status` (`status`,`payment_status`),
  KEY `idx_orders_buyer_created` (`buyer_id`,`created_at`),
  KEY `idx_orders_settlement_status` (`settlement_status`,`status`,`payment_status`),
  KEY `idx_orders_checkout_group` (`checkout_group_id`),
  CONSTRAINT `fk_order_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `orders_chk_1` CHECK (json_valid(`shipping_address`))
) ENGINE=InnoDB AUTO_INCREMENT=943585 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = cp850 */ ;
/*!50003 SET character_set_results = cp850 */ ;
/*!50003 SET collation_connection  = cp850_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_order_after_insert` AFTER INSERT ON `orders` FOR EACH ROW BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_state)
  VALUES (NEW.buyer_id, 'order.create', 'order', NEW.id,
    JSON_OBJECT('order_id', NEW.id, 'total', NEW.total, 'status', NEW.status));
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = cp850 */ ;
/*!50003 SET character_set_results = cp850 */ ;
/*!50003 SET collation_connection  = cp850_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_order_status_change` AFTER UPDATE ON `orders` FOR EACH ROW BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES (NEW.buyer_id, CONCAT('order.status.', NEW.status), 'order', NEW.id,
      JSON_OBJECT('old', OLD.status), JSON_OBJECT('new', NEW.status),
      IFNULL(NEW.cancellation_reason, 'Status updated'));
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `org_announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `org_announcements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `status` enum('draft','published','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_status` (`status`),
  KEY `idx_priority` (`priority`),
  KEY `fk_ann_creator` (`created_by`),
  CONSTRAINT `fk_ann_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ann_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_attribute_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_attribute_values` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `attribute_id` int unsigned NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_attr` (`organisation_id`,`attribute_id`),
  KEY `fk_eav_attrdef` (`attribute_id`),
  CONSTRAINT `fk_eav_attrdef` FOREIGN KEY (`attribute_id`) REFERENCES `organisation_type_attributes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eav_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_coa_customizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_coa_customizations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `account_id` int unsigned NOT NULL COMMENT 'Global (organisation_id NULL) L4 account being customised',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'False hides this default account from the organisation COA view',
  `display_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Local display name (e.g. Bank 1 -> CIB Main Account)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_account` (`organisation_id`,`account_id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_account` (`account_id`),
  CONSTRAINT `fk_ocac_account` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ocac_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=651 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_reviews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `rating` decimal(3,2) NOT NULL,
  `review_text` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_review` (`organisation_id`,`user_id`),
  KEY `idx_or_org` (`organisation_id`),
  KEY `idx_or_user` (`user_id`),
  CONSTRAINT `fk_or_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_or_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `plan_id` bigint unsigned NOT NULL,
  `billing_cycle` enum('monthly','yearly') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `subscription_status` enum('active','suspended','pending','expired','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `auto_renew` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_reminder_sent` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Comma-separated intervals already notified (30,14,7,3,1)',
  `plan_snapshot` json DEFAULT NULL COMMENT 'Complete plan config at subscription time (name, price, features, rates)',
  PRIMARY KEY (`id`),
  KEY `idx_organisation` (`organisation_id`),
  KEY `idx_plan` (`plan_id`),
  KEY `idx_status` (`subscription_status`),
  CONSTRAINT `fk_os_organisation` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_os_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_type_attributes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_type_attributes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `org_type_id` int unsigned NOT NULL,
  `attribute_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attribute_type` enum('text','number','boolean','select','multiselect','date','image') COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'For select/multiselect: array of {value,label}',
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attr` (`org_type_id`,`attribute_key`),
  CONSTRAINT `fk_attr_orgtype` FOREIGN KEY (`org_type_id`) REFERENCES `organisation_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `organisation_type_attributes_chk_1` CHECK (json_valid(`options`))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. club, gym, clinic, spa',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Display name',
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_upgrade_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_upgrade_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `registration_type` enum('player','seller','organization','upgrade') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'upgrade',
  `request_type` enum('NEW_SUBSCRIPTION','PLAN_CHANGE','RENEWAL') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_by` int unsigned NOT NULL,
  `requested_org_type_id` int unsigned DEFAULT NULL,
  `requested_plan_id` bigint unsigned DEFAULT NULL,
  `requested_plan_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_price` decimal(12,2) DEFAULT NULL,
  `requested_billing_cycle` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_plan_id` bigint unsigned DEFAULT NULL,
  `current_plan_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_price` decimal(12,2) DEFAULT NULL,
  `current_billing_cycle` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chosen_payment_method` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Additional registration data (payment_method, shop_name, etc.)',
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `approval_notes` text COLLATE utf8mb4_unicode_ci,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `cancelled_by` int unsigned DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancellation_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_status` (`status`),
  KEY `fk_upr_user` (`requested_by`),
  KEY `fk_upr_plan` (`requested_plan_id`),
  KEY `fk_upr_admin` (`approved_by`),
  KEY `idx_registration_type` (`registration_type`),
  KEY `fk_upr_orgtype` (`requested_org_type_id`),
  KEY `idx_request_type` (`request_type`),
  KEY `fk_upr_canceller` (`cancelled_by`),
  KEY `idx_org_status` (`organisation_id`,`status`),
  KEY `idx_request_type_status` (`request_type`,`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_requested_plan` (`requested_plan_id`),
  CONSTRAINT `fk_upr_admin` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_upr_canceller` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_upr_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upr_orgtype` FOREIGN KEY (`requested_org_type_id`) REFERENCES `organisation_types` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_upr_plan` FOREIGN KEY (`requested_plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_upr_user` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `organisation_upgrade_requests_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisation_verification_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisation_verification_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ovl_org` (`organisation_id`),
  KEY `idx_ovl_created` (`created_at`),
  KEY `fk_ovl_creator` (`created_by`),
  CONSTRAINT `fk_ovl_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ovl_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organisations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organisations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `org_type_id` int unsigned NOT NULL,
  `owner_id` int unsigned NOT NULL COMMENT 'Super admin or org owner',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documents` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_id` smallint unsigned DEFAULT NULL,
  `tax_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tax/VAT registration number',
  `tax_id_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. VAT, CR, TaxID',
  `cr_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancellation_policy_level` enum('organisation','branch') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'organisation',
  `cancellation_before_hours` int NOT NULL DEFAULT '24',
  `cancellation_fee_percentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `cancellation_fee_fixed` decimal(12,2) NOT NULL DEFAULT '0.00',
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `version` int unsigned NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_orgtype` (`org_type_id`),
  KEY `idx_owner` (`owner_id`),
  KEY `idx_active` (`is_active`),
  KEY `idx_org_country` (`country_id`),
  KEY `idx_organisations_owner` (`owner_id`,`is_active`),
  KEY `idx_organisations_country` (`country_id`,`is_active`),
  CONSTRAINT `fk_org_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`),
  CONSTRAINT `fk_org_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_org_type` FOREIGN KEY (`org_type_id`) REFERENCES `organisation_types` (`id`),
  CONSTRAINT `organisations_chk_1` CHECK (json_valid(`documents`))
) ENGINE=InnoDB AUTO_INCREMENT=1003034 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = cp850 */ ;
/*!50003 SET character_set_results = cp850 */ ;
/*!50003 SET collation_connection  = cp850_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_audit_org_update` AFTER UPDATE ON `organisations` FOR EACH ROW BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (NEW.owner_id, 'organisation.soft_delete', 'organisation', NEW.id,
      JSON_OBJECT('name', OLD.name, 'status', OLD.is_active),
      JSON_OBJECT('name', NEW.name, 'status', NEW.is_active));
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `outbox_cursors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `outbox_cursors` (
  `subscriber_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_event_id` bigint unsigned NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_token` (`token`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_reset_token_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_gateway_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_gateway_config` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL,
  `payment_method_id` int unsigned DEFAULT NULL,
  `gateway_provider` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'paymob',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gateway_org` (`organisation_id`,`gateway_provider`),
  KEY `fk_gateway_payment_method` (`payment_method_id`),
  CONSTRAINT `fk_gateway_payment_method` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_gateway_config_ibfk_1` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_gateway_config_chk_1` CHECK (json_valid(`config`))
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_methods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'emoji or icon class',
  `description` text COLLATE utf8mb4_unicode_ci,
  `processing_fee_pct` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'percentage fee',
  `processing_fee_fixed` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'fixed fee amount',
  `requires_approval` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'admin must approve org before use',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `booking_id` bigint unsigned DEFAULT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `idempotency_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_method` enum('wallet','cash','card','bank_transfer','online') COLLATE utf8mb4_unicode_ci NOT NULL,
  `gateway_provider` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `payment_status` enum('created','pending','processing','paid','failed','cancelled','expired','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'created' COMMENT 'Payment lifecycle state',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `gateway_response` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `paid_at` timestamp NULL DEFAULT NULL,
  `expired_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `trace_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UUID for end-to-end payment tracing',
  `cancelled_at` timestamp NULL DEFAULT NULL COMMENT 'When payment was cancelled/expired',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gateway_reference` (`gateway_reference`),
  UNIQUE KEY `uk_idempotency_key` (`idempotency_key`),
  KEY `idx_user` (`user_id`),
  KEY `idx_booking` (`booking_id`),
  KEY `idx_status` (`payment_status`),
  KEY `idx_order` (`order_id`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  CONSTRAINT `payment_transactions_chk_1` CHECK (json_valid(`gateway_response`))
) ENGINE=InnoDB AUTO_INCREMENT=2922 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payroll_components`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_components` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('earning','deduction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `calculation_type` enum('fixed','percentage','formula') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fixed',
  `default_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_pc_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payroll_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `payroll_run_id` int unsigned NOT NULL,
  `employee_id` int unsigned NOT NULL,
  `base_salary` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_earnings` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(14,2) NOT NULL DEFAULT '0.00',
  `net_pay` decimal(14,2) NOT NULL DEFAULT '0.00',
  `component_breakdown` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_run` (`payroll_run_id`),
  KEY `idx_employee` (`employee_id`),
  CONSTRAINT `fk_pe_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pe_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payroll_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_runs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('draft','calculated','approved','posted','paid','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `total_gross` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_net` decimal(14,2) NOT NULL DEFAULT '0.00',
  `posted_at` timestamp NULL DEFAULT NULL,
  `posted_by` int unsigned DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_status` (`status`),
  KEY `fk_pr_creator` (`created_by`),
  KEY `fk_pr_poster` (`posted_by`),
  CONSTRAINT `fk_pr_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pr_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_poster` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `peak_hour_pricing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `peak_hour_pricing` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_id` int unsigned NOT NULL,
  `day_of_week` tinyint unsigned NOT NULL COMMENT '1=Monday .. 7=Sunday',
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `price_multiplier` decimal(5,2) NOT NULL DEFAULT '1.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_day` (`resource_id`,`day_of_week`),
  CONSTRAINT `fk_peak_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permission_modules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permission_modules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. bookings, users, financial',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `module_id` int unsigned NOT NULL,
  `permission_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking.create, booking.cancel.any',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'What this permission allows',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'System permissions cannot be deleted',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `element_type` enum('button','tab','page','section','action','field') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `element_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable label for admin UI',
  `is_ui_element` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Whether this permission gates a UI element',
  `component_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Optional reference to component file path',
  PRIMARY KEY (`id`),
  UNIQUE KEY `permission_key` (`permission_key`),
  KEY `fk_perm_module` (`module_id`),
  KEY `idx_ui_element` (`is_ui_element`),
  CONSTRAINT `fk_perm_module` FOREIGN KEY (`module_id`) REFERENCES `permission_modules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22280 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platform_accounts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_type` enum('float','commission','refund_hold','payout') COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency_id` tinyint unsigned NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account` (`account_type`,`currency_id`),
  KEY `fk_platform_currency` (`currency_id`),
  CONSTRAINT `fk_platform_currency` FOREIGN KEY (`currency_id`) REFERENCES `currencies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_emergency_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_emergency_contacts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pec_user` (`user_id`),
  CONSTRAINT `fk_pec_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_levels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_levels` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` tinyint unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_match_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_match_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint unsigned NOT NULL,
  `sport_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `required_players` int unsigned NOT NULL DEFAULT '1',
  `invited_count` int unsigned NOT NULL DEFAULT '0',
  `created_by` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pmr_booking` (`booking_id`),
  KEY `idx_pmr_creator` (`created_by`),
  KEY `idx_pmr_active` (`is_active`),
  CONSTRAINT `fk_pmr_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmr_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `main_sport_id` int unsigned DEFAULT NULL,
  `main_level_id` int unsigned DEFAULT NULL COMMENT 'Set at registration; non-editable by player',
  `playing_hand` enum('right','left','ambidextrous') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_coach` tinyint(1) NOT NULL DEFAULT '0',
  `coach_status` enum('none','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `coach_rejected_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_seller` tinyint(1) NOT NULL DEFAULT '0',
  `bio` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `emergency_contact_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_relation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `privacy_show_profile` tinyint(1) NOT NULL DEFAULT '1',
  `privacy_show_stats` tinyint(1) NOT NULL DEFAULT '1',
  `privacy_show_activity` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_player_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_sport_interests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_sport_interests` (
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`sport_id`),
  KEY `fk_psi_sport` (`sport_id`),
  CONSTRAINT `fk_psi_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_psi_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `player_statistics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `player_statistics` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `team_id` int unsigned DEFAULT NULL,
  `division_id` int unsigned DEFAULT NULL,
  `appearances` int unsigned NOT NULL DEFAULT '0',
  `goals` int unsigned NOT NULL DEFAULT '0',
  `assists` int unsigned NOT NULL DEFAULT '0',
  `clean_sheets` int unsigned NOT NULL DEFAULT '0',
  `yellow_cards` int unsigned NOT NULL DEFAULT '0',
  `red_cards` int unsigned NOT NULL DEFAULT '0',
  `minutes_played` int unsigned NOT NULL DEFAULT '0',
  `rating` decimal(4,2) DEFAULT NULL,
  `stats_json` json DEFAULT NULL COMMENT 'Extensible sport-specific stats',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_season_player` (`season_id`,`player_id`,`team_id`),
  KEY `idx_player` (`player_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_division` (`division_id`),
  CONSTRAINT `fk_ps_season` FOREIGN KEY (`season_id`) REFERENCES `seasons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `positions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_dept` (`department_id`),
  CONSTRAINT `fk_pos_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pos_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pricing_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pricing_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `rule_type` enum('fixed','percentage_increase','percentage_decrease','multiplier','min_price','max_price','override') NOT NULL,
  `scope` enum('global','organisation','branch','resource') NOT NULL DEFAULT 'global',
  `scope_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `value` decimal(12,2) NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `days_of_week` json DEFAULT NULL,
  `time_start` varchar(5) DEFAULT NULL,
  `time_end` varchar(5) DEFAULT NULL,
  `date_start` date DEFAULT NULL,
  `date_end` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_scope` (`scope`,`scope_id`),
  KEY `idx_pricing_resource` (`resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pricing_seasons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pricing_seasons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `date_start` date NOT NULL,
  `date_end` date NOT NULL,
  `multiplier` decimal(5,2) NOT NULL DEFAULT '1.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_seasons_date` (`date_start`,`date_end`),
  KEY `idx_pricing_seasons_org` (`organisation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `processed_commands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `processed_commands` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `command_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Command identifier — supports ULID (26) and descriptive formats (up to 45+)',
  `command_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. CreateBookingCommand, ProcessPaymentCommand',
  `subscriber_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Subscriber that processed the command',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Trace across services',
  `causation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Parent event/command that triggered this',
  `metadata` json DEFAULT NULL COMMENT 'Arbitrary metadata for audit/debugging',
  `processed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_command_subscriber` (`command_id`,`subscriber_id`),
  KEY `idx_subscriber` (`subscriber_id`),
  KEY `idx_command_type` (`command_type`),
  KEY `idx_processed_at` (`processed_at`)
) ENGINE=InnoDB AUTO_INCREMENT=4531 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `processed_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `processed_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ULID of the published event',
  `subscriber_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Subscriber identifier (e.g. notification-engine, search-indexer)',
  `processed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_subscriber` (`event_id`,`subscriber_id`),
  KEY `idx_subscriber` (`subscriber_id`),
  KEY `idx_processed_at` (`processed_at`)
) ENGINE=InnoDB AUTO_INCREMENT=359 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `parent_id` int unsigned DEFAULT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `fk_cat_parent` FOREIGN KEY (`parent_id`) REFERENCES `product_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=625 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_images` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `product_id` int unsigned NOT NULL,
  `variant_id` int unsigned DEFAULT NULL,
  `media_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alt_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pi_product` (`product_id`),
  KEY `idx_pi_variant` (`variant_id`),
  KEY `idx_pi_primary` (`product_id`,`is_primary`),
  CONSTRAINT `fk_pi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pi_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=121 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_reviews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `product_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `rating` tinyint unsigned NOT NULL,
  `review_text` text COLLATE utf8mb4_unicode_ci,
  `is_verified_purchase` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_product` (`user_id`,`product_id`),
  KEY `idx_product` (`product_id`),
  CONSTRAINT `fk_rev_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rev_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_specifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_specifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `product_id` int unsigned NOT NULL,
  `spec_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `spec_value` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_ps_product` (`product_id`),
  CONSTRAINT `fk_ps_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_tags` (
  `product_id` int unsigned NOT NULL,
  `tag_id` int unsigned NOT NULL,
  PRIMARY KEY (`product_id`,`tag_id`),
  KEY `fk_pt_tag` (`tag_id`),
  CONSTRAINT `fk_pt_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pt_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `product_variants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_variants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `product_id` int unsigned NOT NULL,
  `sku` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `barcode` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variant_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'size, color, etc.',
  `price_adjustment` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cost_price` decimal(14,2) DEFAULT NULL,
  `compare_price` decimal(12,2) DEFAULT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '0',
  `min_stock_level` int unsigned NOT NULL DEFAULT '0',
  `max_stock_level` int unsigned NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `variant_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Hex color code for color variant type',
  `variant_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `weight` decimal(10,2) DEFAULT NULL COMMENT 'Weight in kg',
  `dimensions` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LxWxH in cm',
  PRIMARY KEY (`id`),
  KEY `idx_product` (`product_id`),
  KEY `idx_var_sku` (`sku`),
  KEY `idx_var_barcode` (`barcode`),
  KEY `idx_var_default` (`is_default`),
  CONSTRAINT `fk_var_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `seller_id` int unsigned DEFAULT NULL,
  `seller_user_id` int unsigned DEFAULT NULL,
  `seller_type` enum('org','player') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'org',
  `branch_id` int unsigned DEFAULT NULL,
  `category_id` int unsigned NOT NULL,
  `brand_id` int unsigned DEFAULT NULL,
  `sport_id` int unsigned DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_ar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `short_description_en` text COLLATE utf8mb4_unicode_ci,
  `short_description_ar` text COLLATE utf8mb4_unicode_ci,
  `description_ar` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(12,2) NOT NULL,
  `discounted_price` decimal(12,2) DEFAULT NULL COMMENT 'Discounted/sale price for discount display',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` enum('male','female','unisex') COLLATE utf8mb4_unicode_ci DEFAULT 'unisex',
  `age_group` enum('adult','youth','junior','toddler') COLLATE utf8mb4_unicode_ci DEFAULT 'adult',
  `skill_level` enum('beginner','intermediate','professional','elite') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `material` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `view_count` int unsigned NOT NULL DEFAULT '0',
  `sales_count` int unsigned NOT NULL DEFAULT '0',
  `quantity` int unsigned NOT NULL DEFAULT '0',
  `reserved_quantity` int unsigned NOT NULL DEFAULT '0' COMMENT 'Items in active carts',
  `is_digital` tinyint(1) NOT NULL DEFAULT '0',
  `digital_download_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','pending','active','sold','archived','out_of_stock') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `condition_status` enum('new','like_new','good','fair','used') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `images` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Brand, size, color, etc.',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `marketplace_visible` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_seller` (`seller_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_status` (`status`),
  KEY `idx_price` (`price`),
  KEY `idx_prod_sport` (`sport_id`),
  KEY `idx_products_seller_active` (`seller_id`,`is_active`,`category_id`),
  KEY `idx_products_seller_price` (`seller_id`,`is_active`,`price`),
  KEY `idx_prod_brand` (`brand_id`),
  KEY `idx_prod_rating` (`rating_avg`),
  KEY `idx_prod_gender` (`gender`),
  KEY `idx_prod_age` (`age_group`),
  KEY `idx_prod_skill` (`skill_level`),
  KEY `idx_seller_user` (`seller_user_id`),
  KEY `idx_product_branch` (`branch_id`),
  KEY `idx_seller_status_created` (`seller_id`,`status`,`created_at`),
  FULLTEXT KEY `ft_prod_search` (`name`,`name_ar`,`description`,`description_ar`),
  CONSTRAINT `fk_prod_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prod_category` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`),
  CONSTRAINT `fk_prod_org` FOREIGN KEY (`seller_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prod_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prod_user` FOREIGN KEY (`seller_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_chk_1` CHECK (json_valid(`images`)),
  CONSTRAINT `products_chk_2` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB AUTO_INCREMENT=648 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `professional_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `professional_bio` text COLLATE utf8mb4_unicode_ci,
  `experience_years` tinyint unsigned DEFAULT NULL,
  `certifications` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `sports` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'Array of sport_ids they officiate/coach',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_professional_profile_user` (`user_id`),
  KEY `idx_pp_availability` (`is_available`),
  CONSTRAINT `fk_pp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `professional_profiles_chk_1` CHECK (json_valid(`certifications`)),
  CONSTRAINT `professional_profiles_chk_2` CHECK (json_valid(`sports`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `professional_services` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `professional_profile_id` int unsigned NOT NULL,
  `service_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Stable key e.g. ''default'', ''match_fee'', ''60min_session''',
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable label',
  `pricing_model` enum('hourly','session','match','fixed','package','consultation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `duration_minutes` int unsigned DEFAULT NULL COMMENT 'Session duration in minutes (NULL for non-session models)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_service` (`professional_profile_id`,`service_key`),
  KEY `idx_ps_profile_active` (`professional_profile_id`,`is_active`),
  CONSTRAINT `fk_ps_pp` FOREIGN KEY (`professional_profile_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `provinces` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `country_id` smallint unsigned NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `native_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ISO 3166-2 code e.g. AE-DU, EG-ALX',
  `type` enum('province','state','governorate','region','emirate','county') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'province',
  `navigation_polygon` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '[[lat, lng], ...] polygon for map navigation',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_provinces_slug` (`country_id`,`slug`),
  KEY `idx_provinces_country` (`country_id`),
  KEY `idx_provinces_code` (`code`),
  CONSTRAINT `fk_province_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `provinces_chk_1` CHECK (json_valid(`navigation_polygon`))
) ENGINE=InnoDB AUTO_INCREMENT=3169 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `public_match_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `public_match_details` (
  `match_id` bigint unsigned NOT NULL,
  `creator_id` int unsigned NOT NULL,
  `visibility` enum('public','invite_only') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public',
  `auto_accept` tinyint(1) NOT NULL DEFAULT '0',
  `max_players` int NOT NULL DEFAULT '2',
  `min_age` int DEFAULT NULL,
  `max_age` int DEFAULT NULL,
  `target_gender` enum('male','female','any') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'any',
  `target_level_id` int unsigned DEFAULT NULL,
  `deadline` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`match_id`),
  KEY `fk_pmd_creator` (`creator_id`),
  KEY `fk_pmd_level` (`target_level_id`),
  CONSTRAINT `fk_pmd_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pmd_level` FOREIGN KEY (`target_level_id`) REFERENCES `player_levels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pmd_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `published_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `published_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ULID ??? globally unique event identifier',
  `event_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Canonical dot-separated event name (e.g. booking.created)',
  `aggregate_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Aggregate root type (e.g. booking, payment, wallet)',
  `aggregate_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Aggregate root identifier',
  `aggregate_version` int unsigned NOT NULL COMMENT 'Monotonic sequence number within the aggregate',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Trace across services',
  `causation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID of the event/command that caused this event',
  `payload` json DEFAULT NULL COMMENT 'Event-specific data',
  `metadata` json DEFAULT NULL COMMENT 'Envelope metadata (actor_id, tenant_id, etc.)',
  `occurred_at` timestamp NOT NULL COMMENT 'When the event occurred in the domain',
  `published_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the bus published the event',
  `schema_version` int unsigned NOT NULL DEFAULT '1' COMMENT 'Event schema version (non-breaking=0, breaking=+1)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_id` (`event_id`),
  KEY `idx_aggregate` (`aggregate_type`,`aggregate_id`,`aggregate_version`) COMMENT 'Aggregate event history in order',
  KEY `idx_correlation_id` (`correlation_id`) COMMENT 'Cross-service tracing',
  KEY `idx_event_name_occurred` (`event_name`,`occurred_at`) COMMENT 'Replay by event type',
  KEY `idx_occurred_at` (`occurred_at`) COMMENT 'Cleanup and time-range queries'
) ENGINE=InnoDB AUTO_INCREMENT=10378 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `purchase_order_id` int unsigned NOT NULL,
  `variant_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `unit_cost` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_cost` decimal(14,2) NOT NULL DEFAULT '0.00',
  `received_qty` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_po` (`purchase_order_id`),
  KEY `fk_poi_variant` (`variant_id`),
  CONSTRAINT `fk_poi_po` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poi_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_orders` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `supplier_id` int unsigned NOT NULL,
  `warehouse_id` int unsigned DEFAULT NULL,
  `status` enum('draft','submitted','approved','received','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `total_cost` decimal(14,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned NOT NULL,
  `received_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_status` (`status`),
  KEY `fk_po_wh` (`warehouse_id`),
  KEY `fk_po_creator` (`created_by`),
  CONSTRAINT `fk_po_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_po_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_po_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_po_wh` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `push_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `push_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `push_token_id` int unsigned DEFAULT NULL,
  `platform` enum('ios','android','web') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `notification_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('queued','sent','delivered','failed','opened') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `sent_at` timestamp NULL DEFAULT NULL,
  `opened_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_pl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `push_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `push_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `token` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform` enum('ios','android','web') COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`(255)),
  KEY `idx_user` (`user_id`),
  KEY `idx_platform` (`platform`),
  CONSTRAINT `fk_pt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `referee_availability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `referee_availability` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `referee_id` int unsigned NOT NULL,
  `day_of_week` tinyint unsigned NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ra_referee` (`referee_id`),
  CONSTRAINT `fk_ra_referee` FOREIGN KEY (`referee_id`) REFERENCES `referees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `referee_availability_blackouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `referee_availability_blackouts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `referee_id` int unsigned NOT NULL,
  `blackout_date` date NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referee_blackout` (`referee_id`,`blackout_date`),
  CONSTRAINT `fk_ref_blackout_referee` FOREIGN KEY (`referee_id`) REFERENCES `referees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `referees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `referees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `status` enum('pending','approved','rejected','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_referee_user` (`user_id`),
  KEY `idx_ref_status` (`status`),
  CONSTRAINT `fk_ref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `related_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `related_products` (
  `product_id` int unsigned NOT NULL,
  `related_product_id` int unsigned NOT NULL,
  `relation_type` enum('cross_sell','up_sell','accessory','similar') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'similar',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`product_id`,`related_product_id`,`relation_type`),
  KEY `fk_rp_related` (`related_product_id`),
  CONSTRAINT `fk_rp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_related` FOREIGN KEY (`related_product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_attribute_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_attribute_values` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_id` int unsigned NOT NULL,
  `attribute_id` int unsigned NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_res_attr` (`resource_id`,`attribute_id`),
  KEY `fk_res_eav_attr` (`attribute_id`),
  CONSTRAINT `fk_res_eav_attr` FOREIGN KEY (`attribute_id`) REFERENCES `resource_type_attributes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_eav_res` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_maintenance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_maintenance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_id` int unsigned NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_from` datetime NOT NULL,
  `date_to` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource` (`resource_id`),
  KEY `idx_dates` (`date_from`,`date_to`),
  CONSTRAINT `fk_maint_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_peak_hours`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_peak_hours` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_id` int unsigned NOT NULL,
  `day_of_week` tinyint unsigned NOT NULL COMMENT '0=Sunday...6=Saturday',
  `has_peak` tinyint(1) NOT NULL DEFAULT '0',
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_peak_hours_resource_day` (`resource_id`,`day_of_week`),
  KEY `idx_peak_hours_resource` (`resource_id`),
  CONSTRAINT `fk_peak_hours_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_time_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_time_slots` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_id` int unsigned NOT NULL,
  `date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `status` enum('available','booked','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rt_slots_resource` (`resource_id`),
  KEY `idx_rt_slots_date` (`date`),
  CONSTRAINT `fk_rt_slots_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_type_attributes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_type_attributes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `resource_type_id` int unsigned NOT NULL,
  `attribute_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attribute_type` enum('text','number','boolean','select','multiselect','date','image') COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_resattr_def` (`resource_type_id`,`attribute_key`),
  CONSTRAINT `fk_resattr_type` FOREIGN KEY (`resource_type_id`) REFERENCES `resource_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `resource_type_attributes_chk_1` CHECK (json_valid(`options`))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resource_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. court, pool, jacuzzi, treatment_room',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `has_slots` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'FALSE for appointment-based',
  `default_slot_duration` int unsigned NOT NULL DEFAULT '30' COMMENT 'Default slot length in minutes',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resources` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int unsigned NOT NULL,
  `resource_type_id` int unsigned NOT NULL,
  `sport_id` int unsigned DEFAULT NULL COMMENT 'NULL for non-sport resources (pool, jacuzzi)',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `capacity` int unsigned NOT NULL DEFAULT '1',
  `hourly_price` decimal(12,2) DEFAULT NULL COMMENT 'Base hourly rate, overrides can apply',
  `pricing_type` enum('per_hour','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'per_hour',
  `peak_hour_value` decimal(12,2) DEFAULT NULL,
  `images` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `slot_duration` int unsigned DEFAULT NULL COMMENT 'Override resource type default (minutes)',
  `max_bookings_per_slot` int unsigned NOT NULL DEFAULT '1',
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_type` (`resource_type_id`),
  KEY `idx_sport` (`sport_id`),
  KEY `idx_active` (`is_active`,`branch_id`),
  CONSTRAINT `fk_res_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_res_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_res_type` FOREIGN KEY (`resource_type_id`) REFERENCES `resource_types` (`id`),
  CONSTRAINT `resources_chk_1` CHECK (json_valid(`images`))
) ENGINE=InnoDB AUTO_INCREMENT=1002137 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reward_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reward_catalog` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `points_cost` int NOT NULL,
  `reward_type` enum('wallet_credit','coupon','free_booking','free_session','voucher','merchandise','tournament_ticket') NOT NULL,
  `reward_value` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reward_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reward_claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reward_claims` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `reward_id` int unsigned NOT NULL,
  `points_used` int NOT NULL,
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_claim_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `role_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned NOT NULL,
  `permission_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_perm` (`role_id`,`permission_id`),
  KEY `fk_rp_perm` (`permission_id`),
  CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37774 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `role_theme_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `role_theme_overrides` (
  `role_id` int unsigned NOT NULL,
  `token_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`,`token_key`),
  KEY `idx_rto_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = system role, non-null = org-specific',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'System roles (Super Admin, Player)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_org_slug` (`org_id_normalized`,`slug`),
  KEY `idx_org_role` (`organisation_id`),
  CONSTRAINT `fk_role_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1139 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `seasons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `seasons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `sport_id` int unsigned DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('draft','published','running','completed','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status` (`status`),
  KEY `idx_sport` (`sport_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `segment_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `segment_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `segment_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seg_user` (`segment_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_sm_segment` FOREIGN KEY (`segment_id`) REFERENCES `customer_segments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `segments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `segments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_segments_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `seller_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `seller_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'Link to organisations table (org_type=seller)',
  `branch_id` int unsigned DEFAULT NULL COMMENT 'Auto-created branch for seller accounting',
  `shop_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shop_description` text COLLATE utf8mb4_unicode_ci,
  `shop_logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_subscribed` tinyint(1) NOT NULL DEFAULT '0',
  `subscription_expires_at` timestamp NULL DEFAULT NULL,
  `max_free_listings` int unsigned NOT NULL DEFAULT '5',
  `total_listings` int unsigned NOT NULL DEFAULT '0',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seller_user` (`user_id`),
  KEY `idx_seller_org` (`organisation_id`),
  KEY `idx_seller_branch` (`branch_id`),
  CONSTRAINT `fk_seller_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_seller_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_seller_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `seller_shipping_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `seller_shipping_rates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `seller_id` int unsigned NOT NULL,
  `province_id` int unsigned DEFAULT NULL,
  `city_id` int unsigned DEFAULT NULL,
  `price` decimal(14,2) NOT NULL DEFAULT '0.00',
  `estimated_days` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_seller` (`seller_id`),
  KEY `idx_province` (`province_id`),
  KEY `idx_city` (`city_id`),
  KEY `idx_seller_province` (`seller_id`,`province_id`,`city_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settlement_entitlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settlement_entitlements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `settlement_id` int unsigned NOT NULL,
  `entitlement_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_se_entitlement` (`entitlement_id`) COMMENT 'One entitlement may belong to at most one settlement',
  KEY `idx_se_settlement` (`settlement_id`),
  CONSTRAINT `fk_se_entitlement` FOREIGN KEY (`entitlement_id`) REFERENCES `financial_entitlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_se_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2065 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Entitlements included in each unified settlement';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settlement_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settlement_orders` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `settlement_id` int unsigned NOT NULL,
  `order_id` int unsigned NOT NULL,
  `products_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Products subtotal before shipping',
  `shipping_price` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Shipping cost for this order',
  `gross_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'products_price + shipping_price',
  `courtzon_fee` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Fee on gross_amount',
  `organization_net` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'gross_amount - courtzon_fee',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'cash (COD), wallet, card, etc.',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_so_settlement` (`settlement_id`),
  KEY `idx_so_order` (`order_id`),
  KEY `idx_settlement_orders_unique` (`settlement_id`,`order_id`),
  CONSTRAINT `fk_so_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_so_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settlement_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settlement_transfers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `settlement_id` int unsigned NOT NULL,
  `transfer_direction` enum('courtzon_to_org','org_to_courtzon') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `bank_account_id` int unsigned DEFAULT NULL,
  `bank_account_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `transfer_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_date` timestamp NULL DEFAULT NULL,
  `transfer_status` enum('pending','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `failure_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tf_settlement` (`settlement_id`),
  CONSTRAINT `fk_tf_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `settlement_transfers_chk_1` CHECK (json_valid(`bank_account_snapshot`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settlements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `branch_id` int unsigned DEFAULT NULL COMMENT 'NULL = org-wide settlement',
  `settlement_status` enum('requested','calculating','pending_approval','approved','paid','completed','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `requested_by` int unsigned DEFAULT NULL,
  `requested_by_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settlement_period_start` date DEFAULT NULL,
  `settlement_period_end` date DEFAULT NULL,
  `gross_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Products + Shipping total across all included orders',
  `shipping_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Total shipping cost of included orders',
  `courtzon_fee` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Total CourtZon fee = sum(fee on (products+shipping))',
  `organization_net` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'gross_amount - courtzon_fee = org keeps',
  `cod_fee_total` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'CourtZon fee total from COD orders',
  `online_net_total` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Organization net total from online orders',
  `settlement_direction` enum('courtzon_to_org','org_to_courtzon') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Who pays whom after netting',
  `final_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Net transfer amount after netting',
  `settlement_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Shared batch grouping code (e.g. SET-2026-08-001); multiple settlements may share it',
  `commission_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `organization_position` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Net organization position included in this settlement',
  `courtzon_position` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Net CourtZon position included in this settlement',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_amount` decimal(14,2) DEFAULT NULL,
  `paid_by` int unsigned DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `bank_account_id` int unsigned DEFAULT NULL,
  `bank_account_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `calculating_started_at` timestamp NULL DEFAULT NULL,
  `calculating_completed_at` timestamp NULL DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejected_reason` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stl_org` (`organisation_id`),
  KEY `idx_stl_branch` (`branch_id`),
  KEY `idx_stl_status` (`settlement_status`),
  KEY `idx_stl_requested_by` (`requested_by`),
  KEY `idx_settlements_org_status_requested` (`organisation_id`,`settlement_status`,`requested_at`),
  KEY `idx_stl_batch_code` (`batch_code`),
  CONSTRAINT `fk_stl_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stl_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `settlements_chk_1` CHECK (json_valid(`bank_account_snapshot`))
) ENGINE=InnoDB AUTO_INCREMENT=1405 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sidebar_layout`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sidebar_layout` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `parent_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ordered_keys` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Array of permissionKeys in display order',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_parent` (`user_id`,`parent_key`),
  CONSTRAINT `sidebar_layout_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sidebar_layout_chk_1` CHECK (json_valid(`ordered_keys`))
) ENGINE=InnoDB AUTO_INCREMENT=309 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sport_positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sport_positions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `sport_id` int unsigned NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pos_sport` (`sport_id`),
  CONSTRAINT `fk_pos_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sports` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `show_in_marketplace` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `staff_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `staff_attendance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL,
  `attendance_date` date NOT NULL,
  `clock_in` time DEFAULT NULL,
  `clock_out` time DEFAULT NULL,
  `status` enum('present','absent','late','early_leave','excused') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'present',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_emp_date` (`employee_id`,`attendance_date`),
  KEY `idx_date` (`attendance_date`),
  CONSTRAINT `fk_sa_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stock_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stock_transfers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `variant_id` int unsigned NOT NULL,
  `from_warehouse_id` int unsigned DEFAULT NULL,
  `to_warehouse_id` int unsigned DEFAULT NULL,
  `quantity` int unsigned NOT NULL,
  `status` enum('pending','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_by` int unsigned NOT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_variant` (`variant_id`),
  KEY `idx_from_wh` (`from_warehouse_id`),
  KEY `idx_to_wh` (`to_warehouse_id`),
  KEY `fk_st_creator` (`created_by`),
  CONSTRAINT `fk_st_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_st_from_wh` FOREIGN KEY (`from_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_st_to_wh` FOREIGN KEY (`to_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_st_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_features` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `feature_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_type` enum('numeric','boolean','tier','text') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'boolean',
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Used by getPlanNumericLimit() joins',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `feature_key` (`feature_key`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_plan_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_plan_features` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` bigint unsigned NOT NULL,
  `feature_id` int unsigned NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_feature` (`plan_id`,`feature_id`),
  KEY `feature_id` (`feature_id`),
  CONSTRAINT `subscription_plan_features_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `subscription_plan_features_ibfk_2` FOREIGN KEY (`feature_id`) REFERENCES `subscription_features` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=361 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_plan_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_plan_rates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` bigint unsigned NOT NULL,
  `applicable_entity` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'booking, tournament, marketplace, coach_session, academy',
  `rate_type` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'percentage',
  `amount` decimal(5,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_entity` (`plan_id`,`applicable_entity`),
  CONSTRAINT `fk_spr_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1277 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subscription_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_monthly` decimal(12,2) DEFAULT NULL,
  `price_yearly` decimal(12,2) DEFAULT NULL,
  `is_unlimited` tinyint(1) NOT NULL DEFAULT '0',
  `duration_months` tinyint unsigned DEFAULT NULL COMMENT 'Explicit plan length in months (1-12) when not unlimited; NULL = derive from billing_cycle',
  `features` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `applicable_org_types` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'e.g. ["club","gym"] or ["seller"]',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_internal` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Admin-assignment only; excluded from public catalog',
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_plan_duration_months` CHECK (((`duration_months` is null) or (`duration_months` between 1 and 12))),
  CONSTRAINT `subscription_plans_chk_1` CHECK (json_valid(`features`)),
  CONSTRAINT `subscription_plans_chk_2` CHECK (json_valid(`applicable_org_types`))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `suppliers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_terms` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lead_time_days` int unsigned DEFAULT '0',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_sup_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `support_ticket_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `support_ticket_messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ticket_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_internal` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Internal admin note, not visible to customer',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ticket` (`ticket_id`),
  KEY `fk_stm_user` (`user_id`),
  CONSTRAINT `fk_stm_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `support_tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `support_tickets` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('general','billing','technical','account','feature_request','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `status` enum('open','in_progress','waiting_on_customer','resolved','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `assigned_to` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_organisation` (`organisation_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_assigned` (`assigned_to`),
  CONSTRAINT `fk_st_assign` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_st_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_st_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `value_type` enum('string','number','boolean','json','select','decimal','text','enum') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'string',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_value` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_value` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `allowed_values` text COLLATE utf8mb4_unicode_ci,
  `placeholder` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `help_text` text COLLATE utf8mb4_unicode_ci,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `scope` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'global',
  `restart_policy` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `feature_flag` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `setting_version` int NOT NULL DEFAULT '1',
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `is_editable` tinyint(1) NOT NULL DEFAULT '1',
  `validation_rules` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `depends_on` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `depends_value` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `depends_operator` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '==',
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  KEY `idx_setting_category` (`category`),
  KEY `idx_setting_public` (`is_public`),
  CONSTRAINT `system_settings_chk_1` CHECK (json_valid(`value`))
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tax_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tax_rates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate` decimal(5,2) NOT NULL,
  `type` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'percentage',
  `tax_category` enum('sales','vat','gst','withholding','other') COLLATE utf8mb4_unicode_ci DEFAULT 'vat',
  `org_scope` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_global` tinyint(1) NOT NULL DEFAULT '1',
  `country_code` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tr_org_scope` (`org_scope`),
  KEY `idx_tr_org` (`organisation_id`),
  CONSTRAINT `fk_tr_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2225 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_tr_scope_insert` BEFORE INSERT ON `tax_rates` FOR EACH ROW SET NEW.org_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.name) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_tr_scope_update` BEFORE UPDATE ON `tax_rates` FOR EACH ROW SET NEW.org_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.name) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `team_statistics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `team_statistics` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season_id` int unsigned NOT NULL,
  `team_id` int unsigned NOT NULL,
  `division_id` int unsigned DEFAULT NULL,
  `played` int unsigned NOT NULL DEFAULT '0',
  `wins` int unsigned NOT NULL DEFAULT '0',
  `draws` int unsigned NOT NULL DEFAULT '0',
  `losses` int unsigned NOT NULL DEFAULT '0',
  `goals_for` int unsigned NOT NULL DEFAULT '0',
  `goals_against` int unsigned NOT NULL DEFAULT '0',
  `clean_sheets` int unsigned NOT NULL DEFAULT '0',
  `home_record` json DEFAULT NULL COMMENT '{wins,draws,losses,gf,ga}',
  `away_record` json DEFAULT NULL COMMENT '{wins,draws,losses,gf,ga}',
  `stats_json` json DEFAULT NULL COMMENT 'Extensible sport-specific stats',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_season_team` (`season_id`,`team_id`),
  KEY `idx_division` (`division_id`),
  KEY `fk_ts_team` (`team_id`),
  CONSTRAINT `fk_ts_season` FOREIGN KEY (`season_id`) REFERENCES `seasons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ts_team` FOREIGN KEY (`team_id`) REFERENCES `league_teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_bracket_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_bracket_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `config_schema` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'JSON Schema for bracket-specific config',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  CONSTRAINT `tournament_bracket_types_chk_1` CHECK (json_valid(`config_schema`))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_group_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_group_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int unsigned NOT NULL,
  `registration_id` int unsigned NOT NULL,
  `seed` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_reg` (`group_id`,`registration_id`),
  KEY `idx_registration` (`registration_id`),
  CONSTRAINT `fk_tgm_group` FOREIGN KEY (`group_id`) REFERENCES `tournament_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tgm_reg` FOREIGN KEY (`registration_id`) REFERENCES `tournament_registrations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` int unsigned NOT NULL DEFAULT '0' COMMENT 'Number of players/teams in group',
  `advance_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'How many advance from this group',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tournament` (`tournament_id`),
  CONSTRAINT `fk_tgroup_tourn` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_match_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_match_results` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int unsigned NOT NULL,
  `winner_id` int unsigned DEFAULT NULL COMMENT 'NULL = draw',
  `home_score` text COLLATE utf8mb4_unicode_ci COMMENT 'Flexible JSON score for home side',
  `away_score` text COLLATE utf8mb4_unicode_ci COMMENT 'Flexible JSON score for away side',
  `score_details` json DEFAULT NULL COMMENT 'Full score breakdown (sets, games, etc)',
  `result_status` enum('submitted','confirmed','disputed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `entered_by` int unsigned NOT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_match` (`match_id`),
  KEY `idx_winner` (`winner_id`),
  KEY `fk_tmr_entered` (`entered_by`),
  CONSTRAINT `fk_tmr_entered` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_tmr_match` FOREIGN KEY (`match_id`) REFERENCES `tournament_matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tmr_winner` FOREIGN KEY (`winner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_match_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_match_scores` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int unsigned NOT NULL,
  `set_number` tinyint unsigned NOT NULL,
  `player1_score` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `player2_score` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entered_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_match` (`match_id`),
  CONSTRAINT `fk_score_match` FOREIGN KEY (`match_id`) REFERENCES `tournament_matches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_matches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `round` int unsigned NOT NULL,
  `round_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `match_number` int unsigned NOT NULL,
  `bracket_position` int unsigned DEFAULT NULL,
  `player1_id` int unsigned DEFAULT NULL,
  `player2_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL COMMENT 'Linked resource allocation',
  `referee_id` int unsigned DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','walkover','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `winner_id` int unsigned DEFAULT NULL,
  `score_summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tournament` (`tournament_id`),
  KEY `idx_player1` (`player1_id`),
  KEY `idx_player2` (`player2_id`),
  KEY `idx_status` (`status`),
  KEY `fk_match_resource` (`resource_id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_referee` (`referee_id`),
  KEY `idx_bracket` (`bracket_position`),
  CONSTRAINT `fk_match_player1` FOREIGN KEY (`player1_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_match_player2` FOREIGN KEY (`player2_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_match_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_match_tourn` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_registrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  `team_id` int unsigned DEFAULT NULL,
  `seed_rank` int unsigned DEFAULT NULL,
  `waiting_order` int unsigned DEFAULT NULL,
  `payment_status` enum('unpaid','paid','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `status` enum('registered','confirmed','withdrawn','disqualified') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered',
  `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_player_tourn` (`tournament_id`,`player_id`),
  KEY `idx_tournament` (`tournament_id`),
  KEY `idx_player` (`player_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_waiting_order` (`waiting_order`),
  CONSTRAINT `fk_reg_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reg_tourn` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournament_standings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournament_standings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `registration_id` int unsigned NOT NULL,
  `wins` int unsigned NOT NULL DEFAULT '0',
  `losses` int unsigned NOT NULL DEFAULT '0',
  `draws` int unsigned NOT NULL DEFAULT '0',
  `points` decimal(10,2) NOT NULL DEFAULT '0.00',
  `games_won` int unsigned NOT NULL DEFAULT '0',
  `games_lost` int unsigned NOT NULL DEFAULT '0',
  `sets_won` int unsigned NOT NULL DEFAULT '0',
  `sets_lost` int unsigned NOT NULL DEFAULT '0',
  `rank_position` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tourn_reg_group` (`tournament_id`,`registration_id`,`group_id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_rank` (`tournament_id`,`rank_position`),
  KEY `fk_ts_reg` (`registration_id`),
  CONSTRAINT `fk_ts_group` FOREIGN KEY (`group_id`) REFERENCES `tournament_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ts_reg` FOREIGN KEY (`registration_id`) REFERENCES `tournament_registrations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ts_tourn` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tournaments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tournaments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creator_id` int unsigned NOT NULL COMMENT 'Any role can create',
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = community tournament',
  `branch_id` int unsigned DEFAULT NULL,
  `bracket_type_id` int unsigned NOT NULL,
  `format` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `season` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sport_id` int unsigned DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `tournament_type` enum('platform','community') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'platform',
  `max_participants` int unsigned NOT NULL,
  `max_teams` int unsigned DEFAULT NULL,
  `min_participants` int unsigned NOT NULL DEFAULT '2',
  `entry_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `registration_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_type` enum('FREE','FIXED','MEMBERS_ONLY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `commission_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'Platform commission % on entry fees',
  `prize_description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','open','in_progress','published','registration_open','registration_closed','running','completed','cancelled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `registration_open_at` timestamp NULL DEFAULT NULL,
  `registration_close_at` timestamp NULL DEFAULT NULL,
  `registration_opens` timestamp NULL DEFAULT NULL,
  `registration_closes` timestamp NULL DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `rules` text COLLATE utf8mb4_unicode_ci,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `archived_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_creator` (`creator_id`),
  KEY `idx_org` (`organisation_id`),
  KEY `idx_sport` (`sport_id`),
  KEY `idx_status` (`status`),
  KEY `idx_dates` (`start_date`,`end_date`),
  KEY `fk_tourn_branch` (`branch_id`),
  KEY `fk_tourn_bracket` (`bracket_type_id`),
  KEY `idx_format` (`format`),
  KEY `idx_category` (`category`),
  KEY `idx_is_public` (`is_public`),
  CONSTRAINT `fk_tourn_bracket` FOREIGN KEY (`bracket_type_id`) REFERENCES `tournament_bracket_types` (`id`),
  CONSTRAINT `fk_tourn_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tourn_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_tourn_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tourn_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `transaction_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transaction_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `transaction_id` bigint unsigned NOT NULL,
  `side` enum('debit','credit') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` enum('user_wallet','platform_account','branch') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` bigint unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency_id` tinyint unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL COMMENT 'Branch when entity is a branch (accounting unit)',
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'Denormalized from branch for dashboard speed',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_transaction` (`transaction_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_organisation` (`organisation_id`),
  KEY `idx_created` (`created_at`),
  KEY `fk_entry_currency` (`currency_id`),
  KEY `idx_txn_entries_branch_created` (`branch_id`,`created_at`),
  CONSTRAINT `fk_entry_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_entry_currency` FOREIGN KEY (`currency_id`) REFERENCES `currencies` (`id`),
  CONSTRAINT `fk_entry_organisation` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_entry_txn` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=842 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('booking_payment','wallet_topup','refund','payout','marketplace_order','withdrawal','wallet_payment','subscription') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_type` enum('booking','academy','marketplace','admin','wallet','order','settlement','organisation_upgrade_request') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` bigint unsigned DEFAULT NULL,
  `currency_id` tinyint unsigned DEFAULT NULL,
  `total_amount` decimal(14,2) NOT NULL,
  `status` enum('pending','completed','reversed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_source` (`source_type`,`source_id`),
  KEY `idx_status` (`status`),
  KEY `fk_txn_currency` (`currency_id`),
  KEY `idx_transactions_type_status` (`type`,`status`,`created_at`),
  CONSTRAINT `fk_txn_currency` FOREIGN KEY (`currency_id`) REFERENCES `currencies` (`id`),
  CONSTRAINT `transactions_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB AUTO_INCREMENT=457 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `translation_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `translation_keys` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `default_value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `module_slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `element_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'label',
  `element_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_deprecated` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_translation_key` (`key`(191)),
  KEY `idx_module` (`module_slug`),
  KEY `idx_tk_deprecated` (`is_deprecated`)
) ENGINE=InnoDB AUTO_INCREMENT=40259 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `translations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `translations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Dot-notation key (e.g. auth.login.title)',
  `locale` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_auto` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'TRUE if machine-translated',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_translation` (`locale`,`key`(191)),
  KEY `idx_key` (`key`(191))
) ENGINE=InnoDB AUTO_INCREMENT=308 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `uploads` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'organisation, branch, resource, sport, user',
  `entity_id` int unsigned NOT NULL,
  `file_category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'logo, cover, gallery, document, icon',
  `original_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Path relative to storage root',
  `file_size` int unsigned DEFAULT NULL COMMENT 'Bytes',
  `width` int unsigned DEFAULT NULL,
  `height` int unsigned DEFAULT NULL,
  `processing_status` enum('pending','processing','ready','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_status` (`processing_status`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=140 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_addresses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `full_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `street_address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province_id` int unsigned DEFAULT NULL,
  `city_id` int unsigned DEFAULT NULL,
  `postal_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Egypt',
  `address_type` enum('shipping','billing','both') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'both',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_province` (`province_id`),
  KEY `idx_city` (`city_id`),
  CONSTRAINT `fk_addr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_branches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `branch_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_branch` (`user_id`,`branch_id`),
  KEY `idx_branch` (`branch_id`),
  CONSTRAINT `fk_ub_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ub_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_channel_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_channel_preferences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `category_slug` varchar(50) NOT NULL,
  `channels` json NOT NULL,
  `failover_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `failover_chain` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_category` (`user_id`,`category_slug`),
  KEY `idx_channel_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_devices` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `device_fingerprint` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` enum('mobile','tablet','desktop','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `browser` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `first_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_fingerprint` (`device_fingerprint`),
  CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_follows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_follows` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `follower_id` int unsigned NOT NULL,
  `following_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_follow` (`follower_id`,`following_id`),
  KEY `idx_following` (`following_id`),
  CONSTRAINT `fk_follow_follower` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_follow_following` FOREIGN KEY (`following_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_friends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_friends` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `requester_id` int unsigned NOT NULL,
  `addressee_id` int unsigned NOT NULL,
  `status` enum('pending','accepted','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `responded_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_friendship` (`requester_id`,`addressee_id`),
  KEY `idx_addressee` (`addressee_id`),
  CONSTRAINT `fk_friend_addr` FOREIGN KEY (`addressee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friend_req` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_memberships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `membership_plan_id` int unsigned NOT NULL,
  `status` enum('pending','active','frozen','expired','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `renewal_type` enum('auto','manual','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `expired_at` timestamp NULL DEFAULT NULL,
  `frozen_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_membership_user` (`user_id`),
  KEY `idx_user_membership_plan` (`membership_plan_id`),
  KEY `idx_user_membership_status` (`status`),
  CONSTRAINT `fk_user_membership_plan` FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_notification_preferences` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  `is_allowed` tinyint(1) NOT NULL DEFAULT '1',
  `push_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `email_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `sms_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_cat` (`user_id`,`category_id`),
  KEY `fk_pref_cat` (`category_id`),
  CONSTRAINT `fk_pref_cat` FOREIGN KEY (`category_id`) REFERENCES `notification_categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_organisations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_organisations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `role_in_org` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'member' COMMENT 'owner, admin, member',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_org` (`user_id`,`organisation_id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_uo_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_quiet_hours`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_quiet_hours` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `weekday` enum('mon','tue','wed','thu','fri','sat','sun') DEFAULT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `timezone` varchar(50) DEFAULT 'UTC',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_quiet` (`user_id`,`weekday`,`start_time`),
  KEY `idx_quiet_user` (`user_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_role_scopes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_role_scopes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_role_id` int unsigned NOT NULL,
  `scope_type` enum('organisation','branch','resource') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope` (`user_role_id`,`scope_type`,`scope_id`),
  CONSTRAINT `fk_scope_userrole` FOREIGN KEY (`user_role_id`) REFERENCES `user_roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `role_id` int unsigned NOT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`user_id`,`role_id`),
  KEY `fk_ur_role` (`role_id`),
  KEY `fk_ur_assigner` (`assigned_by`),
  CONSTRAINT `fk_ur_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=307 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `device_id` int unsigned DEFAULT NULL,
  `refresh_token_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `expires_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `refresh_token_expires_at` timestamp NULL DEFAULT NULL,
  `last_activity_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_revoked` tinyint(1) NOT NULL DEFAULT '0',
  `suspicious` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `session_token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`expires_at`),
  KEY `fk_session_device` (`device_id`),
  KEY `idx_sessions_active` (`user_id`,`is_revoked`,`expires_at`),
  KEY `idx_sessions_cleanup` (`expires_at`,`is_revoked`),
  KEY `idx_sessions_token_hash` (`session_token_hash`),
  KEY `idx_user_sessions_refresh_expires` (`user_id`,`refresh_token_expires_at`),
  KEY `idx_suspicious_sessions` (`suspicious`,`is_revoked`,`expires_at`),
  CONSTRAINT `fk_session_device` FOREIGN KEY (`device_id`) REFERENCES `user_devices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=555 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_sports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_sports` (
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `skill_level` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`sport_id`),
  KEY `fk_us_sport` (`sport_id`),
  CONSTRAINT `fk_us_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_us_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_targeted_achievements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_targeted_achievements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `achievement_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unlocked_at` timestamp NULL DEFAULT NULL,
  `progress` int unsigned NOT NULL DEFAULT '0',
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uta_user` (`user_id`),
  KEY `idx_uta_key` (`achievement_key`),
  CONSTRAINT `fk_uta_achievement` FOREIGN KEY (`achievement_key`) REFERENCES `achievements` (`achievement_key`) ON DELETE CASCADE,
  CONSTRAINT `fk_uta_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_wallets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `balance` decimal(14,2) DEFAULT '0.00',
  `reserved_balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'EGP',
  `is_locked` tinyint(1) DEFAULT '0',
  `version` int DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wallet_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2587 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID for external references',
  `country_id` smallint unsigned NOT NULL,
  `phone_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_phone` varchar(25) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'country_code + phone_number (E.164)',
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('male','female') COLLATE utf8mb4_unicode_ci NOT NULL,
  `birth_date` date DEFAULT NULL,
  `language_id` smallint unsigned DEFAULT NULL,
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'UTC',
  `dark_mode` enum('light','dark','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `account_status` enum('active','suspended','banned','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `last_login_at` timestamp NULL DEFAULT NULL,
  `last_login_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_phone_verified` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Auto-verified on signup',
  `is_email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `has_seen_welcome` tinyint(1) NOT NULL DEFAULT '0',
  `has_activated_selling` tinyint(1) NOT NULL DEFAULT '0',
  `version` int unsigned NOT NULL DEFAULT '1' COMMENT 'Optimistic locking',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `full_phone` (`full_phone`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_country` (`country_id`),
  KEY `idx_status` (`account_status`),
  KEY `idx_full_phone` (`full_phone`),
  CONSTRAINT `fk_user_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1000566 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = cp850 */ ;
/*!50003 SET character_set_results = cp850 */ ;
/*!50003 SET collation_connection  = cp850_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_audit_user_update` AFTER UPDATE ON `users` FOR EACH ROW BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES (NEW.id, 'user.soft_delete', 'user', NEW.id,
      JSON_OBJECT('status', OLD.account_status, 'full_name', OLD.full_name),
      JSON_OBJECT('status', NEW.account_status, 'full_name', NEW.full_name),
      'User self-deleted');
  END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `waiting_list`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `waiting_list` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `position` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wl_entry` (`match_id`,`user_id`),
  UNIQUE KEY `uk_wl_position` (`match_id`,`position`),
  KEY `idx_match_position` (`match_id`,`position`),
  KEY `fk_wl_user` (`user_id`),
  CONSTRAINT `fk_wl_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wallet_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `wallet_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wallet_id` bigint unsigned NOT NULL,
  `transaction_type` enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `direction` enum('credit','debit') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallet_txn_ref` (`reference_type`,`reference_id`),
  KEY `idx_wallet` (`wallet_id`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  KEY `idx_wallet_txn_wallet_created` (`wallet_id`,`created_at`),
  KEY `idx_wallet_txn_type_created` (`wallet_id`,`transaction_type`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1198 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `warehouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `warehouses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_wh_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `web_vitals_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `web_vitals_metrics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `metric_name` varchar(20) NOT NULL,
  `metric_value` decimal(10,2) NOT NULL,
  `metric_rating` varchar(10) DEFAULT NULL,
  `page_url` varchar(500) DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vitals_metric` (`metric_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wishlist_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `wishlist_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `product_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_product_wish` (`user_id`,`product_id`),
  KEY `idx_user` (`user_id`),
  KEY `fk_wish_product` (`product_id`),
  CONSTRAINT `fk_wish_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wish_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `withdrawal_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `withdrawal_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `wallet_id` int unsigned NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `player_notes` text COLLATE utf8mb4_unicode_ci,
  `branch_financial_details_id` int unsigned DEFAULT NULL,
  `status` enum('pending','under_review','approved','rejected','processing','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `admin_notes` text COLLATE utf8mb4_unicode_ci,
  `resolution_notes` text COLLATE utf8mb4_unicode_ci,
  `assigned_to` int unsigned DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `execution_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `executed_by` int unsigned DEFAULT NULL,
  `executed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sla_due_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_withdrawal_user` (`user_id`),
  KEY `idx_withdrawal_status` (`status`),
  KEY `fk_wr_branch_financial` (`branch_financial_details_id`),
  KEY `idx_wr_executed_by` (`executed_by`),
  KEY `idx_wr_assigned_to` (`assigned_to`),
  CONSTRAINT `fk_wr_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wr_branch_financial` FOREIGN KEY (`branch_financial_details_id`) REFERENCES `branch_financial_details` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wr_executed_by` FOREIGN KEY (`executed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `withdrawal_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `withdrawal_requests_ibfk_3` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=685 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_branch_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_branch_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL COMMENT 'FK to workflow_instances',
  `branch_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. branch_0, branch_1 ??? defined in workflow definition',
  `parent_step_id` bigint unsigned DEFAULT NULL COMMENT 'The PARALLEL/CONDITION step that created this branch',
  `branch_type` enum('parallel','condition') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'parallel',
  `status` enum('pending','active','completed','failed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `current_step_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Step the branch is currently executing',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branch_workflow` (`workflow_instance_id`),
  KEY `idx_branch_parent` (`parent_step_id`),
  CONSTRAINT `fk_branch_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking.checkout',
  `version` int unsigned NOT NULL COMMENT 'Monotonically increasing per workflow_type',
  `definition` json NOT NULL COMMENT 'Serialized WorkflowDefinition',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_version` (`workflow_type`,`version`)
) ENGINE=InnoDB AUTO_INCREMENT=2006 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_event_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_event_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL COMMENT 'FK to workflow_instances',
  `step_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'WAIT_EVENT step that is waiting',
  `event_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Canonical event name to match',
  `correlation_value` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Value extracted from event for correlation (e.g. aggregateId)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lookup` (`event_name`,`correlation_value`),
  KEY `idx_workflow` (`workflow_instance_id`),
  CONSTRAINT `fk_sub_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL COMMENT 'FK to workflow_instances',
  `event_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Canonical event name e.g. booking.payment.received',
  `event_body` json DEFAULT NULL COMMENT 'Full event payload',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `causation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_we_workflow_instance` (`workflow_instance_id`),
  KEY `idx_we_correlation` (`correlation_id`),
  KEY `idx_we_created` (`created_at`),
  CONSTRAINT `fk_we_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` varchar(26) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ULID ??? external reference for this workflow execution',
  `workflow_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. booking.checkout, marketplace.fulfillment, settlement.payout',
  `workflow_definition_version` int unsigned NOT NULL DEFAULT '1',
  `status` enum('pending','active','completed','failed','compensating','compensated','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `correlation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Trace across services ??? inherited from EventEnvelope',
  `causation_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Parent event that triggered this workflow',
  `actor_id` int unsigned DEFAULT NULL COMMENT 'User who initiated the workflow',
  `payload` json DEFAULT NULL COMMENT 'Workflow-level input data (booking details, order info)',
  `context` json DEFAULT NULL COMMENT 'Runtime state shared across workflow steps',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_public_id` (`public_id`),
  KEY `idx_workflow_type_status` (`workflow_type`,`status`),
  KEY `idx_correlation_id` (`correlation_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Optimistic lock version ??? incremented on every write';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_steps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL COMMENT 'FK to workflow_instances',
  `step_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. validate_booking, process_payment, release_slot',
  `step_type` enum('activity','compensation') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activity',
  `status` enum('pending','active','completed','failed','skipped','compensated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `retry_count` int unsigned NOT NULL DEFAULT '0',
  `max_retries` int unsigned NOT NULL DEFAULT '3',
  `timeout_at` timestamp NULL DEFAULT NULL COMMENT 'If exceeded, step is considered failed',
  `compensation_status` enum('none','pending','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `input` json DEFAULT NULL COMMENT 'Step input ??? copied from workflow payload or previous step output',
  `output` json DEFAULT NULL COMMENT 'Step output ??? used as input for the next step',
  `error` text COLLATE utf8mb4_unicode_ci COMMENT 'Error details if the step failed',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workflow_instance` (`workflow_instance_id`),
  KEY `idx_step_status` (`workflow_instance_id`,`status`),
  KEY `idx_timeout_query` (`status`,`timeout_at`) COMMENT 'Find timed-out steps ??? status=active AND timeout_at < NOW()',
  CONSTRAINT `fk_ws_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `year_close_cycles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `year_close_cycles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `year_closings_id` int unsigned NOT NULL,
  `cycle_number` int unsigned NOT NULL,
  `net_income` decimal(14,2) NOT NULL DEFAULT '0.00',
  `entry_count` int unsigned NOT NULL DEFAULT '0',
  `status` enum('pending','completed','reversed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ycc_cycle` (`year_closings_id`,`cycle_number`),
  KEY `idx_ycc_parent` (`year_closings_id`),
  CONSTRAINT `fk_ycc_parent` FOREIGN KEY (`year_closings_id`) REFERENCES `year_closings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=832 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `year_closings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `year_closings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned DEFAULT NULL COMMENT 'NULL = platform',
  `fiscal_year` int unsigned NOT NULL,
  `org_year_scope` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'Composite: NULL orgâ†’0 + year for uniqueness',
  `net_income` decimal(14,2) NOT NULL DEFAULT '0.00',
  `retained_earnings_account_id` int unsigned NOT NULL,
  `status` enum('pending','completed','failed','reopened') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `close_count` int unsigned NOT NULL DEFAULT '1',
  `reopened_at` timestamp NULL DEFAULT NULL,
  `reopened_by` int unsigned DEFAULT NULL,
  `reopen_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reversal_entry_count` int unsigned DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_year_close_scope` (`org_year_scope`),
  KEY `idx_org` (`organisation_id`),
  KEY `fk_yc_account` (`retained_earnings_account_id`),
  KEY `fk_yc_creator` (`created_by`),
  CONSTRAINT `fk_yc_account` FOREIGN KEY (`retained_earnings_account_id`) REFERENCES `chart_of_accounts` (`id`),
  CONSTRAINT `fk_yc_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_yc_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=281 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_yc_scope_insert` BEFORE INSERT ON `year_closings` FOR EACH ROW SET NEW.org_year_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.fiscal_year) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = latin1 */ ;
/*!50003 SET character_set_results = latin1 */ ;
/*!50003 SET collation_connection  = latin1_swedish_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER `trg_yc_scope_update` BEFORE UPDATE ON `year_closings` FOR EACH ROW SET NEW.org_year_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.fiscal_year) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

DROP TABLE IF EXISTS `gateway_settlement_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gateway_settlement_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `gateway_settlement_id` int unsigned NOT NULL,
  `payment_transaction_id` bigint unsigned NOT NULL,
  `active_payment_transaction_id` bigint unsigned DEFAULT NULL,
  `payment_method_id` int unsigned DEFAULT NULL,
  `gross_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `gateway_fee_pct` decimal(5,2) NOT NULL DEFAULT '0.00',
  `gateway_fee_fixed` decimal(12,2) NOT NULL DEFAULT '0.00',
  `gateway_fee_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gst_active_payment` (`active_payment_transaction_id`),
  KEY `idx_gst_settlement` (`gateway_settlement_id`),
  KEY `idx_gst_payment_txn` (`payment_transaction_id`),
  CONSTRAINT `fk_gst_settlement` FOREIGN KEY (`gateway_settlement_id`) REFERENCES `gateway_settlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gst_payment` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gateway_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gateway_settlements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `batch_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settlement_status` enum('completed','reversed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `gross_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `gateway_fee_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `transaction_count` int unsigned NOT NULL DEFAULT '0',
  `settled_by` int unsigned DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `reversed_at` timestamp NULL DEFAULT NULL,
  `reversed_by` int unsigned DEFAULT NULL,
  `reversal_reason` text COLLATE utf8mb4_unicode_ci,
  `reversal_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gs_batch_code` (`batch_code`),
  KEY `idx_gs_settled_at` (`settled_at`),
  KEY `idx_gs_reversed_at` (`reversed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

ALTER TABLE `payment_transactions`
  ADD COLUMN `gateway_settlement_id` int unsigned DEFAULT NULL AFTER `paid_at`,
  ADD COLUMN `gateway_settled_at` timestamp NULL DEFAULT NULL AFTER `gateway_settlement_id`,
  ADD KEY `idx_payment_gateway_settlement` (`gateway_settlement_id`),
  ADD CONSTRAINT `fk_payment_gateway_settlement` FOREIGN KEY (`gateway_settlement_id`) REFERENCES `gateway_settlements` (`id`) ON DELETE SET NULL;

INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_state) VALUES (1, 'BASELINE', 'system', 1, NULL);

INSERT INTO `marketplace_complaint_config` (`id`, `complaint_period_days`, `is_active`) VALUES (1, 7, 1) ON DUPLICATE KEY UPDATE `id`=`id`;

-- Canonical admin-controllable marketplace complaint period (default 7 days).
-- All complaint-window eligibility logic reads this via getMarketplaceComplaintPeriodDays().
INSERT IGNORE INTO `system_settings`
  (`category`, `key`, `value`, `value_type`, `description`, `display_name`, `unit`,
   `min_value`, `help_text`, `sort_order`, `is_visible`, `is_editable`, `scope`)
VALUES
  ('marketplace',
   'marketplace.complaint_period_days',
   '7',
   'number',
   'Number of days after marketplace delivery during which the buyer can submit a complaint before the entitlement becomes available for settlement.',
   'Complaint Period',
   'days',
   '0',
   'Entitlements become settlement-eligible only after delivery + this many days. Set to 0 to disable the complaint window (immediate eligibility).',
   10,
   1,
   1,
   'global');
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

