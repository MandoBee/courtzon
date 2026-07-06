-- Migration 016: Notification alerting + client error tracking tables

-- Notification delivery alerts (threshold violations)
CREATE TABLE IF NOT EXISTS notification_alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,
  severity ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  message VARCHAR(500) NOT NULL,
  metric_value DECIMAL(12,2) DEFAULT NULL,
  threshold_value DECIMAL(12,2) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_by INT UNSIGNED DEFAULT NULL,
  acknowledged_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alerts_type (alert_type, created_at),
  INDEX idx_alerts_severity (severity, acknowledged)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Client-side error reports
CREATE TABLE IF NOT EXISTS client_error_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED DEFAULT NULL,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT DEFAULT NULL,
  component_stack TEXT DEFAULT NULL,
  page_url VARCHAR(500) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  viewport_size VARCHAR(20) DEFAULT NULL,
  platform VARCHAR(50) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client_errors_type (error_type, created_at),
  INDEX idx_client_errors_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Frontend performance metrics (Web Vitals)
CREATE TABLE IF NOT EXISTS web_vitals_metrics (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  metric_name VARCHAR(20) NOT NULL,
  metric_value DECIMAL(10,2) NOT NULL,
  metric_rating VARCHAR(10) DEFAULT NULL,
  page_url VARCHAR(500) DEFAULT NULL,
  user_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vitals_metric (metric_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fix: add category_slug and event_name columns to notifications table
-- (Enterprise infrastructure uses these directly instead of JOIN-based lookups)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category_slug VARCHAR(50) DEFAULT NULL AFTER category_id,
  ADD COLUMN IF NOT EXISTS event_name VARCHAR(100) DEFAULT NULL AFTER category_slug,
  ADD INDEX IF NOT EXISTS idx_notifications_event (event_name);
