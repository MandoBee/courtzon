-- ============================================================================
-- COURTZON-V2 : CMS LANDING PAGES + MEDIA LIBRARY
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: CMS SECTION BLOCKS (structured page building)
-- ============================================================================

CREATE TABLE cms_section_blocks (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page_id           INT UNSIGNED NOT NULL,
  block_type        VARCHAR(50) NOT NULL COMMENT 'hero, features, cta, text, team, faq, contact_form, stats, testimonials, blog_preview, image_gallery',
  block_key         VARCHAR(100) NOT NULL,
  title             VARCHAR(255) DEFAULT NULL,
  subtitle          VARCHAR(500) DEFAULT NULL,
  content           LONGTEXT DEFAULT NULL COMMENT 'JSON: block-specific configuration fields',
  style_config      LONGTEXT DEFAULT NULL COMMENT 'JSON: background, padding, colors, etc.',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_page_order (page_id, sort_order),
  CONSTRAINT fk_block_page FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: MEDIA LIBRARY
-- ============================================================================

CREATE TABLE cms_media (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename          VARCHAR(255) NOT NULL COMMENT 'Stored filename (uuid-based)',
  original_name     VARCHAR(255) NOT NULL COMMENT 'Original uploaded filename',
  mime_type         VARCHAR(100) NOT NULL,
  size_bytes        INT UNSIGNED NOT NULL,
  width             INT UNSIGNED DEFAULT NULL,
  height            INT UNSIGNED DEFAULT NULL,
  media_type        VARCHAR(50) NOT NULL DEFAULT 'image' COMMENT 'image, icon_system, icon_mobile, favicon, logo, banner',
  category          VARCHAR(100) DEFAULT NULL COMMENT 'system, cms, branding, landing',
  alt_text          VARCHAR(500) DEFAULT NULL,
  url               VARCHAR(500) NOT NULL,
  thumbnail_url     VARCHAR(500) DEFAULT NULL,
  medium_url        VARCHAR(500) DEFAULT NULL,
  uploaded_by       INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_type (media_type),
  INDEX idx_category (category),
  CONSTRAINT fk_media_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: CONTACT FORM SUBMISSIONS
-- ============================================================================

CREATE TABLE cms_contact_submissions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  phone             VARCHAR(50) DEFAULT NULL,
  subject           VARCHAR(500) DEFAULT NULL,
  message           TEXT NOT NULL,
  is_read           TINYINT(1) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 4: CMS PAGE ENHANCEMENTS
-- ============================================================================

ALTER TABLE cms_pages ADD COLUMN is_homepage TINYINT(1) NOT NULL DEFAULT 0 AFTER meta_description;
ALTER TABLE cms_pages ADD COLUMN page_template VARCHAR(50) DEFAULT NULL AFTER is_homepage;
