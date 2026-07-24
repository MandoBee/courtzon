-- Financial Engine ledger and settlement tables

CREATE TABLE IF NOT EXISTS `ledger_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `transaction_id` varchar(64) NOT NULL,
  `source_type` enum('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement') NOT NULL,
  `source_id` int unsigned NOT NULL,
  `account_type` enum('platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund') NOT NULL,
  `side` enum('debit','credit') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'EGP',
  `description` text,
  `reference_id` varchar(128) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_tx` (`transaction_id`),
  KEY `idx_ledger_source` (`source_type`, `source_id`),
  KEY `idx_ledger_date` (`recorded_at`),
  KEY `idx_ledger_account` (`account_type`, `recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `settlement_batches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `batch_type` enum('daily','weekly','monthly','manual') NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `gross_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `discount_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `tax_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `commission_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `refund_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `net_amount` decimal(14,2) NOT NULL DEFAULT 0,
  `status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
  `organisation_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_batch_status` (`status`),
  KEY `idx_batch_period` (`period_start`, `period_end`),
  KEY `idx_batch_org` (`organisation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
