USE courtzon_v2;

CREATE TABLE booking_matchmaking_requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id      BIGINT UNSIGNED NOT NULL UNIQUE,
  min_age         INT DEFAULT NULL,
  max_age         INT DEFAULT NULL,
  target_gender   ENUM('male','female','any') DEFAULT 'any',
  target_level_id INT UNSIGNED DEFAULT NULL,
  max_players     INT NOT NULL DEFAULT 2,
  deadline        DATETIME DEFAULT NULL,
  auto_apply      TINYINT(1) NOT NULL DEFAULT 0,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_booking (booking_id),
  INDEX idx_active (is_active),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (target_level_id) REFERENCES player_levels(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
