-- Marketplace product visibility (independent of approval status).
-- An approved (active) product can be either Visible or Hidden in the public
-- Marketplace. Pending/rejected products are never public regardless of this
-- flag (the public catalog requires status='active' AND marketplace_visible=1).
-- Default 1 keeps every existing product visible after deployment.
ALTER TABLE `products`
  ADD COLUMN `marketplace_visible` tinyint(1) NOT NULL DEFAULT 1 AFTER `is_active`;