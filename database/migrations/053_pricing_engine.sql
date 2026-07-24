-- Dynamic Pricing Engine tables

CREATE TABLE IF NOT EXISTS `pricing_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `rule_type` enum('fixed','percentage_increase','percentage_decrease','multiplier','min_price','max_price','override') NOT NULL,
  `scope` enum('global','organisation','branch','resource') NOT NULL DEFAULT 'global',
  `scope_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `value` decimal(12,2) NOT NULL,
  `priority` int NOT NULL DEFAULT 0,
  `days_of_week` json DEFAULT NULL,
  `time_start` varchar(5) DEFAULT NULL,
  `time_end` varchar(5) DEFAULT NULL,
  `date_start` date DEFAULT NULL,
  `date_end` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_scope` (`scope`, `scope_id`),
  KEY `idx_pricing_resource` (`resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pricing_seasons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `date_start` date NOT NULL,
  `date_end` date NOT NULL,
  `multiplier` decimal(5,2) NOT NULL DEFAULT 1.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_seasons_date` (`date_start`, `date_end`),
  KEY `idx_pricing_seasons_org` (`organisation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
