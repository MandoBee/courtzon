-- ============================================================
-- Migration 012: Booking Enhancements
-- Adds: open/close times, unavailability, peak pricing, cancellation policy
-- ============================================================

-- 1. Opening / Closing Times per branch
ALTER TABLE branches
  ADD COLUMN opening_time TIME DEFAULT '06:00:00',
  ADD COLUMN closing_time TIME DEFAULT '23:00:00';

-- 2. Resource-level unavailability (maintenance, temporary closures)
CREATE TABLE IF NOT EXISTS resource_unavailability (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  start_time TIME DEFAULT NULL,
  end_time TIME DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  INDEX idx_resource_date (resource_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Branch-level unavailability (holidays, closures)
CREATE TABLE IF NOT EXISTS branch_unavailability (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  INDEX idx_branch_date (branch_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Peak hour pricing (per resource, per day-of-week)
CREATE TABLE IF NOT EXISTS peak_hour_pricing (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '1=Monday, 2=Tuesday, ..., 7=Sunday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  INDEX idx_resource_day (resource_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Cancellation policy columns on organisations
ALTER TABLE organisations
  ADD COLUMN cancellation_before_hours INT DEFAULT 24,
  ADD COLUMN cancellation_fee_percentage DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN cancellation_fee_fixed DECIMAL(10,2) DEFAULT 0.00;

-- 6. Cancellation fee column on booking_cancellations
ALTER TABLE booking_cancellations
  ADD COLUMN fee_amount DECIMAL(10,2) DEFAULT 0.00 AFTER reason;
