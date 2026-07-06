-- Migration 013: Enterprise Notification Infrastructure
-- Adds tables for templates, delivery tracking, rate limiting, digests, and analytics

CREATE TABLE IF NOT EXISTS notification_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(100) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'en',
  category_slug VARCHAR(50) NOT NULL,
  type ENUM('info','success','warning','error','reminder') DEFAULT 'info',
  priority ENUM('low','normal','high','critical') DEFAULT 'normal',
  title_template TEXT NOT NULL,
  body_template TEXT DEFAULT NULL,
  action_key VARCHAR(100) DEFAULT NULL,
  route_pattern VARCHAR(255) DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  actions JSON DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_locale (event_name, locale),
  INDEX idx_templates_active (is_active, event_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_delivery (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  channel ENUM('in_app','push','email','sms') NOT NULL DEFAULT 'in_app',
  status ENUM('queued','processing','sent','delivered','failed','dead_letter') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_retries TINYINT UNSIGNED NOT NULL DEFAULT 3,
  error_message TEXT DEFAULT NULL,
  queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processing_at TIMESTAMP NULL DEFAULT NULL,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  delivered_at TIMESTAMP NULL DEFAULT NULL,
  read_at TIMESTAMP NULL DEFAULT NULL,
  clicked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_delivery_status (status, attempts, queued_at),
  INDEX idx_delivery_notification (notification_id),
  INDEX idx_delivery_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_digest_windows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  category_slug VARCHAR(50) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  related_entity_type VARCHAR(50) DEFAULT NULL,
  related_entity_id VARCHAR(100) DEFAULT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  window_opens_at TIMESTAMP NOT NULL,
  window_closes_at TIMESTAMP NOT NULL,
  is_aggregated TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_digest_user (user_id, is_aggregated),
  INDEX idx_digest_window (window_closes_at, is_aggregated)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_rate_limits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  category_slug VARCHAR(50) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  window_start TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rate_window (user_id, category_slug, event_name, window_start),
  INDEX idx_rate_expiry (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_analytics (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  event_name VARCHAR(100) DEFAULT NULL,
  category_slug VARCHAR(50) DEFAULT NULL,
  channel ENUM('in_app','push','email','sms') DEFAULT NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'sent',
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analytics_action (action, created_at),
  INDEX idx_analytics_notification (notification_id),
  INDEX idx_analytics_event (event_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_dead_letter_queue (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT UNSIGNED DEFAULT NULL,
  user_id INT UNSIGNED NOT NULL,
  channel ENUM('in_app','push','email','sms') NOT NULL,
  payload JSON NOT NULL,
  error_message TEXT NOT NULL,
  failed_attempts TINYINT UNSIGNED NOT NULL,
  last_error_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dlq_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE notifications
  ADD COLUMN template_id INT UNSIGNED DEFAULT NULL AFTER sender_id,
  ADD COLUMN image_urls JSON DEFAULT NULL AFTER body,
  ADD COLUMN actions JSON DEFAULT NULL AFTER action_payload,
  ADD INDEX idx_notifications_template (template_id);

ALTER TABLE notification_actions
  ADD COLUMN label VARCHAR(100) DEFAULT NULL AFTER action_key,
  ADD COLUMN icon VARCHAR(50) DEFAULT NULL AFTER label,
  ADD COLUMN confirm_message VARCHAR(255) DEFAULT NULL AFTER icon;
