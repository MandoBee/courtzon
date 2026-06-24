ALTER TABLE player_profiles
  ADD COLUMN coach_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none' AFTER is_coach,
  ADD COLUMN coach_rejected_reason VARCHAR(500) DEFAULT NULL AFTER coach_status;
