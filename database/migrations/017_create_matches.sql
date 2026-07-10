-- Migration 017: Create matches table (generic Match aggregate root)

CREATE TABLE IF NOT EXISTS matches (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type            ENUM('public') NOT NULL,
  status          ENUM('open','full','closed','in_progress','completed','cancelled','void') NOT NULL DEFAULT 'open',
  booking_id      BIGINT UNSIGNED DEFAULT NULL,
  sport_id        INT UNSIGNED NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_booking (booking_id),
  KEY idx_type_status (type, status),
  KEY idx_sport_date (sport_id, status, created_at),

  CONSTRAINT fk_match_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE RESTRICT,
  CONSTRAINT fk_match_sport FOREIGN KEY (sport_id) REFERENCES sports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
