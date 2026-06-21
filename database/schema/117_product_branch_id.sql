-- 117_product_branch_id.sql
-- Adds branch_id to products for per-branch inventory management.

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE products
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL AFTER seller_type,
  ADD INDEX idx_product_branch (branch_id),
  ADD CONSTRAINT fk_product_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- Backfill: assign existing products to the first branch of their seller's organisation
UPDATE products p
SET p.branch_id = (
  SELECT MIN(b.id) FROM branches b
  WHERE b.organisation_id = (SELECT o.id FROM organisations o WHERE o.id = p.seller_id)
    AND b.is_active = TRUE AND b.deleted_at IS NULL
)
WHERE p.branch_id IS NULL AND p.seller_type = 'org' AND p.deleted_at IS NULL;

SET FOREIGN_KEY_CHECKS = 1;
