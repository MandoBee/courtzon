-- Push notification tokens with FCM/APNs support
CREATE TABLE IF NOT EXISTS push_tokens (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  token             VARCHAR(500) NOT NULL,
  platform          ENUM('ios','android','web') NOT NULL,
  app_version       VARCHAR(50) DEFAULT NULL,
  device_name       VARCHAR(200) DEFAULT NULL,
  device_model      VARCHAR(100) DEFAULT NULL,
  os_version        VARCHAR(50) DEFAULT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_used_at      TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_token (token(255)),
  KEY idx_user (user_id),
  KEY idx_platform (platform),
  CONSTRAINT fk_pt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mobile app version tracking for forced upgrades
CREATE TABLE IF NOT EXISTS app_versions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform          ENUM('ios','android') NOT NULL,
  version           VARCHAR(20) NOT NULL,
  build_number      INT UNSIGNED NOT NULL,
  min_version       VARCHAR(20) DEFAULT NULL COMMENT 'Minimum supported version',
  is_forced         TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Force upgrade required',
  download_url      VARCHAR(500) DEFAULT NULL,
  release_notes     TEXT,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_version (platform, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mobile app settings (remote config)
CREATE TABLE IF NOT EXISTS app_settings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name          VARCHAR(100) NOT NULL,
  key_value         TEXT NOT NULL,
  platform          ENUM('ios','android','both') NOT NULL DEFAULT 'both',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_key_platform (key_name, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Push notification log for delivery tracking
CREATE TABLE IF NOT EXISTS push_log (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  push_token_id     INT UNSIGNED DEFAULT NULL,
  platform          ENUM('ios','android','web') NOT NULL,
  title             VARCHAR(255) DEFAULT NULL,
  body              TEXT,
  notification_type VARCHAR(100) DEFAULT NULL,
  status            ENUM('queued','sent','delivered','failed','opened') NOT NULL DEFAULT 'queued',
  error_message     TEXT,
  sent_at           TIMESTAMP NULL DEFAULT NULL,
  opened_at         TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_created (created_at),
  CONSTRAINT fk_pl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
