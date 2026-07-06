-- Migration 015: Enterprise Notification Platform
-- Multi-channel delivery, versioning, devices, webhooks, audit trail, A/B testing, cleanup

-- Notification providers registry
CREATE TABLE IF NOT EXISTS notification_providers (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  config JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notification_providers (slug, label, class_name, priority, description) VALUES
  ('in_app', 'In-App', 'InAppProvider', 10, 'Real-time Socket.IO delivery'),
  ('push', 'Push Notification', 'PushProvider', 20, 'Firebase/APNs push'),
  ('email', 'Email', 'EmailProvider', 30, 'SMTP email delivery'),
  ('sms', 'SMS', 'SMSProvider', 40, 'Twilio/Vonage SMS'),
  ('whatsapp', 'WhatsApp', 'WhatsAppProvider', 50, 'WhatsApp Business API'),
  ('webhook', 'Webhook', 'WebhookProvider', 60, 'Organisation webhooks');

-- Device management
CREATE TABLE IF NOT EXISTS user_devices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  platform ENUM('web','ios','android','desktop','tablet','unknown') DEFAULT 'unknown',
  browser VARCHAR(100) DEFAULT NULL,
  os VARCHAR(100) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  push_token VARCHAR(500) DEFAULT NULL,
  push_provider ENUM('fcm','apns','huawei','onesignal','none') DEFAULT 'none',
  push_token_expires_at TIMESTAMP NULL DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device (device_id),
  INDEX idx_devices_user (user_id, is_active),
  INDEX idx_devices_token (push_token),
  INDEX idx_devices_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quiet hours / delivery windows
CREATE TABLE IF NOT EXISTS user_quiet_hours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  weekday ENUM('mon','tue','wed','thu','fri','sat','sun') DEFAULT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_quiet (user_id, weekday, start_time),
  INDEX idx_quiet_user (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Channel preferences per category per user
CREATE TABLE IF NOT EXISTS user_channel_preferences (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  category_slug VARCHAR(50) NOT NULL,
  channels JSON NOT NULL,
  failover_enabled TINYINT(1) NOT NULL DEFAULT 0,
  failover_chain JSON DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_category (user_id, category_slug),
  INDEX idx_channel_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Template versioning
ALTER TABLE notification_templates
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active,
  ADD COLUMN published_at TIMESTAMP NULL DEFAULT NULL AFTER version,
  ADD COLUMN created_by INT UNSIGNED DEFAULT NULL AFTER published_at;

CREATE TABLE IF NOT EXISTS notification_template_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  title_template TEXT NOT NULL,
  body_template TEXT DEFAULT NULL,
  action_key VARCHAR(100) DEFAULT NULL,
  route_pattern VARCHAR(255) DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  actions JSON DEFAULT NULL,
  changed_by INT UNSIGNED DEFAULT NULL,
  change_summary VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_template_version (template_id, version),
  INDEX idx_template_versions (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Store template version used at notification creation time
ALTER TABLE notifications
  ADD COLUMN template_version INT UNSIGNED DEFAULT NULL AFTER template_id,
  ADD COLUMN rendered_title TEXT DEFAULT NULL AFTER title,
  ADD COLUMN rendered_body TEXT DEFAULT NULL AFTER body;

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS notification_webhooks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  events JSON NOT NULL,
  headers JSON DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_triggered_at TIMESTAMP NULL DEFAULT NULL,
  last_status_code SMALLINT UNSIGNED DEFAULT NULL,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_webhooks_org (organisation_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notification audit trail (full lifecycle)
CREATE TABLE IF NOT EXISTS notification_audit_trail (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  lifecycle_event VARCHAR(50) NOT NULL,
  channel VARCHAR(20) DEFAULT NULL,
  provider_slug VARCHAR(30) DEFAULT NULL,
  attempt TINYINT UNSIGNED DEFAULT 1,
  metadata JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_notification (notification_id, lifecycle_event),
  INDEX idx_audit_user (user_id, created_at),
  INDEX idx_audit_event (lifecycle_event, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feature flags for notifications
CREATE TABLE IF NOT EXISTS notification_feature_flags (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flag_key VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notification_feature_flags (flag_key, label, description, is_enabled) VALUES
  ('player_matching', 'Player Matching', 'Smart player matching for bookings', 1),
  ('broadcasts', 'Admin Broadcasts', 'Admin announcement broadcasts', 1),
  ('digest', 'Notification Digest', 'Digest window aggregation', 1),
  ('rate_limiting', 'Rate Limiting', 'Per-user rate limiting', 1),
  ('webhooks', 'Webhooks', 'Organisation webhook delivery', 0),
  ('ab_testing', 'A/B Testing', 'Template A/B experiments', 0),
  ('quiet_hours', 'Quiet Hours', 'Respect user quiet hours', 0);

-- A/B test experiments
CREATE TABLE IF NOT EXISTS notification_ab_tests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_key VARCHAR(50) NOT NULL,
  template_id_a INT UNSIGNED NOT NULL,
  template_id_b INT UNSIGNED NOT NULL,
  category_slug VARCHAR(50) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  traffic_split TINYINT UNSIGNED NOT NULL DEFAULT 50,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_test_key (test_key),
  INDEX idx_ab_test_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_ab_results (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT UNSIGNED NOT NULL,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  variant ENUM('A','B') NOT NULL,
  template_id INT UNSIGNED NOT NULL,
  template_version INT UNSIGNED DEFAULT NULL,
  action VARCHAR(50) DEFAULT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ab_test (test_id, variant),
  INDEX idx_ab_notification (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cleanup policy configuration
CREATE TABLE IF NOT EXISTS notification_cleanup_policies (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  policy_key VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  entity_table VARCHAR(50) NOT NULL,
  retention_days INT UNSIGNED NOT NULL DEFAULT 90,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_run_at TIMESTAMP NULL DEFAULT NULL,
  deleted_count BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notification_cleanup_policies (policy_key, label, entity_table, retention_days, is_enabled) VALUES
  ('expired_notifications', 'Expired Notifications', 'notifications', 90, 0),
  ('old_analytics', 'Old Analytics', 'notification_analytics', 30, 0),
  ('old_delivery_logs', 'Old Delivery Logs', 'notification_delivery', 60, 0),
  ('old_digests', 'Old Digest Windows', 'notification_digest_windows', 30, 0),
  ('resolved_dead_letters', 'Resolved Dead Letters', 'notification_dead_letter_queue', 30, 0),
  ('old_audit_trail', 'Old Audit Trail', 'notification_audit_trail', 180, 0),
  ('old_ab_results', 'Old A/B Results', 'notification_ab_results', 90, 0);

-- Event replay log
CREATE TABLE IF NOT EXISTS notification_replay_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  replayed_by INT UNSIGNED DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  affected_users INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_replay_event (event_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
