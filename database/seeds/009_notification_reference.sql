-- ============================================================================
-- 009_notification_reference.sql — Notification platform reference data
-- ============================================================================
-- DATA-ONLY seed. The authoritative source of these rows is migration
-- database/migrations/015_notification_enterprise_platform.sql (the INSERT
-- IGNORE blocks at lines 17, 150 and 203). That migration also carries
-- non-idempotent ALTER TABLE statements, so it cannot be replayed on a
-- baseline-hydrated schema; the reference rows are therefore mirrored here so
-- fresh schemas (test harness and fresh installs) have the providers,
-- feature flags and cleanup policies the Notification Platform expects.
--
-- Idempotent: every target table has a UNIQUE key on its natural key
-- (notification_providers.slug, notification_feature_flags.flag_key,
-- notification_cleanup_policies.policy_key) and all inserts use INSERT IGNORE.
--
-- Template rows are intentionally NOT here: notification templates are
-- code-defined and provisioned by seedTemplates() at application startup
-- (backend/src/modules/notifications/application/template.service.ts).
-- ============================================================================

-- Notification providers registry (mirrors migration 015 lines 17-23)
INSERT IGNORE INTO notification_providers (slug, label, class_name, priority, description) VALUES
  ('in_app', 'In-App', 'InAppProvider', 10, 'Real-time Socket.IO delivery'),
  ('push', 'Push Notification', 'PushProvider', 20, 'Firebase/APNs push'),
  ('email', 'Email', 'EmailProvider', 30, 'SMTP email delivery'),
  ('sms', 'SMS', 'SMSProvider', 40, 'Twilio/Vonage SMS'),
  ('whatsapp', 'WhatsApp', 'WhatsAppProvider', 50, 'WhatsApp Business API'),
  ('webhook', 'Webhook', 'WebhookProvider', 60, 'Organisation webhooks');

-- Notification feature flags (mirrors migration 015 lines 150-157)
INSERT IGNORE INTO notification_feature_flags (flag_key, label, description, is_enabled) VALUES
  ('player_matching', 'Player Matching', 'Smart player matching for bookings', 1),
  ('broadcasts', 'Admin Broadcasts', 'Admin announcement broadcasts', 1),
  ('digest', 'Notification Digest', 'Digest window aggregation', 1),
  ('rate_limiting', 'Rate Limiting', 'Per-user rate limiting', 1),
  ('webhooks', 'Webhooks', 'Organisation webhook delivery', 0),
  ('ab_testing', 'A/B Testing', 'Template A/B experiments', 0),
  ('quiet_hours', 'Quiet Hours', 'Respect user quiet hours', 0);

-- Notification cleanup policies (mirrors migration 015 lines 203-210)
INSERT IGNORE INTO notification_cleanup_policies (policy_key, label, entity_table, retention_days, is_enabled) VALUES
  ('expired_notifications', 'Expired Notifications', 'notifications', 90, 0),
  ('old_analytics', 'Old Analytics', 'notification_analytics', 30, 0),
  ('old_delivery_logs', 'Old Delivery Logs', 'notification_delivery', 60, 0),
  ('old_digests', 'Old Digest Windows', 'notification_digest_windows', 30, 0),
  ('resolved_dead_letters', 'Resolved Dead Letters', 'notification_dead_letter_queue', 30, 0),
  ('old_audit_trail', 'Old Audit Trail', 'notification_audit_trail', 180, 0),
  ('old_ab_results', 'Old A/B Results', 'notification_ab_results', 90, 0);
