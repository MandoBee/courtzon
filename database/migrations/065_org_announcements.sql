CREATE TABLE IF NOT EXISTS org_announcements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  title           VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL,
  priority        ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at    TIMESTAMP NULL DEFAULT NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_org (organisation_id),
  KEY idx_status (status),
  KEY idx_priority (priority),
  CONSTRAINT fk_ann_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
