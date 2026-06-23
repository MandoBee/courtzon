-- 125: Multi-seller settlement support
-- Adds per-item settlement_status so each seller in a multi-seller order
-- can be settled independently. Orders are only marked 'settled' when ALL
-- their items are settled.

-- Add settlement_status to order_items
ALTER TABLE order_items
  ADD COLUMN settlement_status ENUM('pending','settled','in_dispute') NOT NULL DEFAULT 'pending';

-- Index for finding unsettled items by seller
CREATE INDEX idx_order_items_seller_settlement ON order_items (seller_id, settlement_status);

-- Backfill: any order_items belonging to orders already marked 'settled' should be 'settled' too
UPDATE order_items oi
  JOIN orders o ON o.id = oi.order_id
  SET oi.settlement_status = 'settled'
  WHERE o.settlement_status = 'settled';

-- Composite index for settlement balance queries
CREATE INDEX idx_order_items_seller_order_settlement ON order_items (seller_id, order_id, settlement_status);
