-- Customer Segments
CREATE TABLE IF NOT EXISTS customer_segments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  rules_json      JSON DEFAULT NULL COMMENT 'Segment definition rules',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  member_count    INT UNSIGNED NOT NULL DEFAULT 0,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_active (is_active),
  CONSTRAINT fk_seg_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Segment Members (which users belong to which segments)
CREATE TABLE IF NOT EXISTS segment_members (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  segment_id      INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_seg_user (segment_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_sm_segment FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source          VARCHAR(100) DEFAULT NULL COMMENT 'registration, referral, manual, import',
  full_name       VARCHAR(200) NOT NULL,
  email           VARCHAR(255) DEFAULT NULL,
  phone           VARCHAR(50) DEFAULT NULL,
  status          ENUM('new','qualified','converted','lost') NOT NULL DEFAULT 'new',
  converted_user_id INT UNSIGNED DEFAULT NULL,
  notes           TEXT,
  assigned_to     INT UNSIGNED DEFAULT NULL,
  created_by      INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_assigned (assigned_to),
  KEY idx_source (source),
  CONSTRAINT fk_lead_conv FOREIGN KEY (converted_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_assign FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  type            ENUM('email','sms','push','in_app','multi_channel') NOT NULL DEFAULT 'multi_channel',
  status          ENUM('draft','active','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
  segment_id      INT UNSIGNED DEFAULT NULL,
  scheduled_at    TIMESTAMP NULL DEFAULT NULL,
  started_at      TIMESTAMP NULL DEFAULT NULL,
  completed_at    TIMESTAMP NULL DEFAULT NULL,
  stats_json      JSON DEFAULT NULL COMMENT 'Cached campaign stats',
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_segment (segment_id),
  KEY idx_type (type),
  CONSTRAINT fk_mc_segment FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE SET NULL,
  CONSTRAINT fk_mc_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Communication Log
CREATE TABLE IF NOT EXISTS communication_log (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED DEFAULT NULL,
  channel         ENUM('email','sms','push','in_app','whatsapp') NOT NULL,
  direction       ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
  subject         VARCHAR(500) DEFAULT NULL,
  body            TEXT,
  status          ENUM('sent','delivered','failed','opened','clicked') DEFAULT 'sent',
  reference_type  VARCHAR(50) DEFAULT NULL,
  reference_id    INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_channel (channel),
  KEY idx_reference (reference_type, reference_id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
