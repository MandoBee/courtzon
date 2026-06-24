USE courtzon_v2;

CREATE TABLE booking_intents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  organisation_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  booking_type ENUM('public_match','private_match','academy','clinic','coach_session') NOT NULL DEFAULT 'private_match',
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  commission_amount DECIMAL(12,2) DEFAULT 0.00,
  club_amount DECIMAL(12,2) DEFAULT 0.00,
  payment_method VARCHAR(50) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  matchmaking JSON DEFAULT NULL,
  participants JSON DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 15 MINUTE),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
