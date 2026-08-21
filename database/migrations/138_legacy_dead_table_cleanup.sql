-- 138_legacy_dead_table_cleanup.sql
--
-- Legacy / dead-table cleanup (approved cleanup audit, baseline 040df46).
--
-- Drops 22 tables proven DEAD by the cleanup audit:
--   - zero runtime code references (backend/src, frontend/src, scripts, e2e)
--   - zero FK children (no other table references them)
--   - zero trigger / event / view dependencies
--   - not required by any active API, worker, scheduled job, or migration
--
-- The audit evidence is in the Phase 2 classification (22 DEAD tables).
-- Seed rows for commission_rules / cron_jobs / exchange_rates / scheduled_jobs
-- (reference/demo data only) are removed with their tables.
--
-- Explicitly NOT touched: accounting/GL, settlement tables, wallet, payments,
-- subscriptions, notifications, event bus infrastructure.
--
-- Changes: drop 22 tables only. No schema changes to active tables.

DROP TABLE IF EXISTS `academy_enrollments_legacy`;
DROP TABLE IF EXISTS `ad_pricing`;
DROP TABLE IF EXISTS `ad_targeting_rules`;
DROP TABLE IF EXISTS `announcement_comments`;
DROP TABLE IF EXISTS `announcement_likes`;
DROP TABLE IF EXISTS `booking_intents`;
DROP TABLE IF EXISTS `branch_unavailability`;
DROP TABLE IF EXISTS `commission_rules`;
DROP TABLE IF EXISTS `community_tournaments`;
DROP TABLE IF EXISTS `cron_jobs`;
DROP TABLE IF EXISTS `email_verification_tokens`;
DROP TABLE IF EXISTS `exchange_rates`;
DROP TABLE IF EXISTS `media_uploads`;
DROP TABLE IF EXISTS `notification_alerts`;
DROP TABLE IF EXISTS `operating_hours`;
DROP TABLE IF EXISTS `player_ratings`;
DROP TABLE IF EXISTS `referee_assignments`;
DROP TABLE IF EXISTS `resource_unavailability`;
DROP TABLE IF EXISTS `revert_logs`;
DROP TABLE IF EXISTS `scheduled_jobs`;
DROP TABLE IF EXISTS `tournament_match_players`;
DROP TABLE IF EXISTS `tournament_participants`;