-- 040_product_catalog_enhancements.sql
-- Enterprise catalog: brands, images, tags, specs, inventory tracking

-- ============================================================
-- 1. BRANDS
-- ============================================================
CREATE TABLE IF NOT EXISTS brands (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(200) NOT NULL UNIQUE,
  description   TEXT NULL,
  logo_url      VARCHAR(500) NULL,
  website       VARCHAR(500) NULL,
  country       VARCHAR(100) NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE products
  ADD COLUMN brand_id INT UNSIGNED NULL AFTER category_id,
  ADD COLUMN name_ar VARCHAR(255) NULL AFTER name,
  ADD COLUMN short_description_en TEXT NULL AFTER description,
  ADD COLUMN short_description_ar TEXT NULL AFTER short_description_en,
  ADD COLUMN description_ar TEXT NULL AFTER short_description_ar,
  ADD COLUMN gender ENUM('male','female','unisex') NULL DEFAULT 'unisex' AFTER currency_code,
  ADD COLUMN age_group ENUM('adult','youth','junior','toddler') NULL DEFAULT 'adult' AFTER gender,
  ADD COLUMN skill_level ENUM('beginner','intermediate','professional','elite') NULL AFTER age_group,
  ADD COLUMN material VARCHAR(255) NULL AFTER skill_level,
  ADD COLUMN rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0.00 AFTER material,
  ADD COLUMN rating_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating_avg,
  ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating_count,
  ADD COLUMN sales_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER view_count;

ALTER TABLE products
  ADD CONSTRAINT fk_prod_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX idx_prod_brand ON products(brand_id);
CREATE INDEX idx_prod_rating ON products(rating_avg);
CREATE INDEX idx_prod_gender ON products(gender);
CREATE INDEX idx_prod_age ON products(age_group);
CREATE INDEX idx_prod_skill ON products(skill_level);

-- ============================================================
-- 2. PRODUCT VARIANTS ENHANCEMENTS
-- ============================================================
ALTER TABLE product_variants
  ADD COLUMN barcode VARCHAR(50) NULL AFTER sku,
  ADD COLUMN compare_price DECIMAL(12,2) NULL AFTER price_adjustment,
  ADD COLUMN weight DECIMAL(10,2) NULL COMMENT 'Weight in kg',
  ADD COLUMN dimensions VARCHAR(100) NULL COMMENT 'LxWxH in cm',
  ADD COLUMN variant_image_url VARCHAR(500) NULL AFTER variant_color,
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE AFTER variant_image_url,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active;

CREATE INDEX idx_var_sku ON product_variants(sku);
CREATE INDEX idx_var_barcode ON product_variants(barcode);
CREATE INDEX idx_var_default ON product_variants(is_default);

-- ============================================================
-- 3. PRODUCT IMAGES (replaces JSON images array)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  variant_id    INT UNSIGNED NULL,
  media_url     VARCHAR(500) NOT NULL,
  alt_text      VARCHAR(255) NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pi_product (product_id),
  INDEX idx_pi_variant (variant_id),
  INDEX idx_pi_primary (product_id, is_primary),
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 4. TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_tags (
  product_id    INT UNSIGNED NOT NULL,
  tag_id        INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. PRODUCT SPECIFICATIONS (structured key-value)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_specifications (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id    INT UNSIGNED NOT NULL,
  spec_name     VARCHAR(100) NOT NULL,
  spec_value    VARCHAR(500) NOT NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_ps_product (product_id),
  CONSTRAINT fk_ps_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 6. RELATED PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS related_products (
  product_id        INT UNSIGNED NOT NULL,
  related_product_id INT UNSIGNED NOT NULL,
  relation_type     ENUM('cross_sell','up_sell','accessory','similar') NOT NULL DEFAULT 'similar',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, related_product_id, relation_type),
  CONSTRAINT fk_rp_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_related FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7. INVENTORY LOGS (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id    INT UNSIGNED NOT NULL,
  movement_type ENUM('in','out','adjustment','reservation','release','return') NOT NULL,
  quantity      INT NOT NULL COMMENT 'Positive for in, negative for out',
  stock_before  INT UNSIGNED NOT NULL DEFAULT 0,
  stock_after   INT UNSIGNED NOT NULL DEFAULT 0,
  reason        VARCHAR(500) NULL,
  reference_type VARCHAR(50) NULL COMMENT 'order, adjustment, return, etc.',
  reference_id  INT UNSIGNED NULL,
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_il_variant (variant_id),
  INDEX idx_il_created (created_at),
  INDEX idx_il_reference (reference_type, reference_id),
  CONSTRAINT fk_il_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_il_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 8. FULL-TEXT INDEX for product search
-- ============================================================
ALTER TABLE products
  ADD FULLTEXT INDEX ft_prod_search (name, name_ar, description, description_ar);
