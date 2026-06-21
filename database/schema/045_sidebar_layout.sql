CREATE TABLE IF NOT EXISTS sidebar_layout (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  parent_key VARCHAR(100) DEFAULT NULL COMMENT 'NULL = top-level, or a permissionKey like sidebar.marketplace',
  ordered_keys JSON NOT NULL COMMENT 'Array of permissionKeys in display order',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_parent (user_id, parent_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
