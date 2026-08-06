-- 093_withdrawal_workflow_v2.sql
-- Withdrawal Request Workflow V2: full state machine, reservation fields, execution tracking
--
-- State machine: pending → under_review → approved → processing → completed
--                                                     → rejected
--                            any → cancelled

-- 1. Extend status ENUM
ALTER TABLE `withdrawal_requests`
  MODIFY COLUMN `status` enum('pending','under_review','approved','rejected','processing','completed','cancelled') NOT NULL DEFAULT 'pending';

-- 2. Add withdrawal reason and player notes
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `reason` varchar(500) DEFAULT NULL AFTER `amount`,
  ADD COLUMN `player_notes` text DEFAULT NULL AFTER `reason`;

-- 3. Add resolution notes (admin internal)
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `resolution_notes` text DEFAULT NULL AFTER `admin_notes`;

-- 4. Add execution tracking
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `execution_method` varchar(50) DEFAULT NULL AFTER `resolution_notes`,
  ADD COLUMN `reference_number` varchar(100) DEFAULT NULL AFTER `execution_method`,
  ADD COLUMN `executed_by` int unsigned DEFAULT NULL AFTER `reference_number`,
  ADD COLUMN `executed_at` timestamp NULL DEFAULT NULL AFTER `executed_by`,
  ADD KEY `idx_wr_executed_by` (`executed_by`),
  ADD CONSTRAINT `fk_wr_executed_by` FOREIGN KEY (`executed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 5. Add reserved amount tracking on user_wallets (protects funds during pending withdrawal)
ALTER TABLE `user_wallets`
  ADD COLUMN `reserved_balance` decimal(14,2) NOT NULL DEFAULT 0.00 AFTER `balance`;
