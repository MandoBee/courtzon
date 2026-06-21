USE courtzon_v2;

ALTER TABLE organisations
  ADD COLUMN cancellation_policy_level ENUM('organisation','branch') NOT NULL DEFAULT 'organisation' AFTER cr_number,
  ADD COLUMN cancellation_before_hours INT NOT NULL DEFAULT 24 AFTER cancellation_policy_level,
  ADD COLUMN cancellation_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER cancellation_before_hours,
  ADD COLUMN cancellation_fee_fixed DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER cancellation_fee_percentage;

ALTER TABLE cancellation_policies
  MODIFY organisation_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL AFTER id,
  ADD INDEX idx_branch (branch_id),
  ADD FOREIGN KEY fk_cp_branch (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
