-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  name            VARCHAR(200) NOT NULL,
  location        TEXT,
  status          ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  CONSTRAINT fk_wh_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  name            VARCHAR(200) NOT NULL,
  contact_name    VARCHAR(200),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  payment_terms   VARCHAR(200),
  lead_time_days  INT UNSIGNED DEFAULT 0,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  CONSTRAINT fk_sup_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  supplier_id     INT UNSIGNED NOT NULL,
  warehouse_id    INT UNSIGNED DEFAULT NULL,
  status          ENUM('draft','submitted','approved','received','cancelled') NOT NULL DEFAULT 'draft',
  total_cost      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes           TEXT,
  created_by      INT UNSIGNED NOT NULL,
  received_at     TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  KEY idx_supplier (supplier_id),
  KEY idx_status (status),
  CONSTRAINT fk_po_org      FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_wh       FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_po_creator  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT UNSIGNED NOT NULL,
  variant_id      INT UNSIGNED NOT NULL,
  quantity        INT UNSIGNED NOT NULL,
  unit_cost       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_cost      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  received_qty    INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_po (purchase_order_id),
  CONSTRAINT fk_poi_po      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id        INT UNSIGNED NOT NULL,
  from_warehouse_id INT UNSIGNED DEFAULT NULL,
  to_warehouse_id   INT UNSIGNED DEFAULT NULL,
  quantity          INT UNSIGNED NOT NULL,
  status            ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_by        INT UNSIGNED NOT NULL,
  completed_at      TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_variant (variant_id),
  KEY idx_from_wh (from_warehouse_id), KEY idx_to_wh (to_warehouse_id),
  CONSTRAINT fk_st_variant  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_st_from_wh  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_st_to_wh    FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_st_creator  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add columns to product_variants
ALTER TABLE product_variants
  ADD COLUMN cost_price      DECIMAL(14,2) DEFAULT NULL AFTER price_adjustment,
  ADD COLUMN min_stock_level INT UNSIGNED NOT NULL DEFAULT 0 AFTER quantity,
  ADD COLUMN max_stock_level INT UNSIGNED NOT NULL DEFAULT 0 AFTER min_stock_level;

-- Add warehouse_id to inventory_logs
ALTER TABLE inventory_logs
  ADD COLUMN warehouse_id INT UNSIGNED DEFAULT NULL AFTER variant_id,
  ADD KEY idx_wh (warehouse_id);
