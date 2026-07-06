-- Migration 014: Notification Broadcasts table
CREATE TABLE IF NOT EXISTS notification_broadcasts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('info','success','warning','error','reminder') DEFAULT 'info',
  priority ENUM('low','normal','high','critical') DEFAULT 'normal',
  action_key VARCHAR(100) DEFAULT NULL,
  route_pattern VARCHAR(255) DEFAULT NULL,
  image_urls JSON DEFAULT NULL,
  actions JSON DEFAULT NULL,
  target_scope VARCHAR(50) NOT NULL DEFAULT 'all',
  target_value VARCHAR(500) DEFAULT NULL,
  created_by INT UNSIGNED NOT NULL,
  scheduled_at TIMESTAMP NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_broadcasts_active (is_active, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
