-- 094_withdrawal_sla_assignment.sql
-- Withdrawal SLA tracking, assignment management, operational metrics

-- 1. Add submitted_at (backfill existing rows)
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `created_at`;

UPDATE `withdrawal_requests` SET `submitted_at` = `created_at` WHERE `submitted_at` IS NULL;

-- 2. Add SLA due at (default 48h from submission)
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `sla_due_at` timestamp NULL DEFAULT NULL AFTER `submitted_at`;

UPDATE `withdrawal_requests` SET `sla_due_at` = DATE_ADD(`submitted_at`, INTERVAL 48 HOUR) WHERE `sla_due_at` IS NULL;

-- 3. Add assignment fields
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `assigned_to` int unsigned DEFAULT NULL AFTER `resolution_notes`,
  ADD COLUMN `assigned_at` timestamp NULL DEFAULT NULL AFTER `assigned_to`,
  ADD KEY `idx_wr_assigned_to` (`assigned_to`),
  ADD CONSTRAINT `fk_wr_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL;
