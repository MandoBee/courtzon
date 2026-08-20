-- 135_marketplace_complaints.sql
-- Marketplace complaint/refund lifecycle (player → organisation → CourtZon admin).
--
-- Single table for the whole business flow:
--   submit → review → resolution (REFUND / REPLACEMENT / RESHIPMENT / REJECTED)
--   - REFUND: manual amount; ≤ disputed value or ≤125% executes immediately;
--     >125% requires CourtZon admin approval. Wallet credited, organisation
--     receives an immutable ORGANIZATION_ADJUSTMENT (never mutates the original
--     entitlement amount).
--   - REPLACEMENT / RESHIPMENT: no auto refund; org records shipment, player
--     confirms receipt within 7 days.
--   - Return/collection is enforced before refund/replacement when required.
--
-- Attempt rule: max 2 complaint attempts per order_item (enforced in service
-- by counting existing rows for the order_item; transaction-safe with a lock).
--
-- The financial_entitlements table remains the financial source of truth;
-- this table is the business process that controls entitlement state.

CREATE TABLE IF NOT EXISTS `marketplace_complaints` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `order_id` int(10) unsigned NOT NULL,
  `order_item_id` int(10) unsigned NOT NULL,
  `product_id` int(10) unsigned NOT NULL,
  `buyer_id` int(10) unsigned NOT NULL,
  `seller_org_id` int(10) unsigned NOT NULL,

  `complaint_type` enum('defective','damaged','wrong_item','missing_item','not_as_described','other') NOT NULL,
  `reason` text NOT NULL COMMENT 'Mandatory written reason',
  `images` json DEFAULT NULL COMMENT 'Up to 3 optional image URLs',

  `attempt_number` tinyint(3) unsigned NOT NULL DEFAULT 1 COMMENT '1 or 2 (max two attempts per order_item)',

  `status` enum('pending','in_review','awaiting_return','refund_pending_approval','refunded','awaiting_confirmation','resolved','rejected') NOT NULL DEFAULT 'pending',
  `resolution_type` enum('refund','replacement','reshipment','rejected') DEFAULT NULL,

  `disputed_value` decimal(14,2) NOT NULL DEFAULT 0.00 COMMENT 'System-calculated original disputed value from order snapshot',
  `refund_amount` decimal(14,2) DEFAULT NULL COMMENT 'Manual refund amount entered by organisation',
  `refund_ratio` decimal(6,4) DEFAULT NULL COMMENT 'refund_amount / disputed_value',
  `refund_reason` text DEFAULT NULL COMMENT 'Mandatory when refund > disputed value',

  `needs_return` tinyint(1) NOT NULL DEFAULT 0,
  `collection_status` enum('not_required','pending','in_progress','collected','inspected') NOT NULL DEFAULT 'not_required',
  `collection_due_at` datetime DEFAULT NULL,
  `collection_completed_at` datetime DEFAULT NULL,

  `replacement_sent_at` datetime DEFAULT NULL,
  `reshipment_sent_at` datetime DEFAULT NULL,
  `receipt_awaited` tinyint(1) NOT NULL DEFAULT 0,
  `receipt_due_at` datetime DEFAULT NULL COMMENT 'Player confirmation deadline (7 days after shipment)',
  `receipt_confirmed_at` datetime DEFAULT NULL,

  `admin_approval_required` tinyint(1) NOT NULL DEFAULT 0,
  `approval_status` enum('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  `approved_by` int(10) unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approval_reason` text DEFAULT NULL,

  `rejected_reason` text DEFAULT NULL COMMENT 'Written rejection reason (organisation or admin)',

  `resolved_by` int(10) unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,

  `entitlement_ids` json DEFAULT NULL COMMENT 'financial_entitlements ids held/adjusted by this complaint',

  `aggregate_version` int(10) unsigned NOT NULL DEFAULT 1 COMMENT 'Optimistic locking',
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mc_public_id` (`public_id`),
  KEY `idx_mc_buyer` (`buyer_id`),
  KEY `idx_mc_seller` (`seller_org_id`),
  KEY `idx_mc_status` (`status`),
  KEY `idx_mc_order` (`order_id`),
  KEY `idx_mc_item` (`order_item_id`),
  KEY `idx_mc_approval` (`approval_status`),
  CONSTRAINT `fk_mc_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_mc_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`),
  CONSTRAINT `fk_mc_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_mc_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_mc_seller` FOREIGN KEY (`seller_org_id`) REFERENCES `organisations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Marketplace complaints/refunds lifecycle';