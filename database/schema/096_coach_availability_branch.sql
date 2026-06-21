-- Migration 096: Add branch_id to coach_availability for branch-scoped slots
USE `courtzon_v2`;

ALTER TABLE coach_availability
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL AFTER coach_id,
  ADD INDEX idx_coach_avail_branch (branch_id),
  ADD CONSTRAINT fk_coach_avail_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
