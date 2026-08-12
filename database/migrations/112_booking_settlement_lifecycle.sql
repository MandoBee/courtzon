-- Migration 112: Booking settlement + recovery collection lifecycle
-- 1. Add recovery-collected tracking to bookings (collection vs. recovered).
-- 2. Add settlement_bookings traceability table linking settlements to booking economics.
-- Idempotent. Does NOT alter historical accounting entries.

ALTER TABLE bookings
  ADD COLUMN coach_recovery_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cumulative coach recovery actually collected' AFTER org_recovered_amount,
  ADD COLUMN org_recovery_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cumulative org recovery actually collected' AFTER coach_recovery_collected;

CREATE TABLE IF NOT EXISTS booking_settlements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  organisation_id INT UNSIGNED DEFAULT NULL,
  settlement_type ENUM('coach','org') NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','settled','collected') NOT NULL DEFAULT 'settled',
  batch_reference VARCHAR(100) DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bs_booking (booking_id),
  KEY idx_bs_org (organisation_id),
  CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
