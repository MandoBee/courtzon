-- Migration 102: Account Templates
-- Templates define Level 4+ organization accounts as blueprints

CREATE TABLE IF NOT EXISTS account_templates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_key    VARCHAR(100) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  scope           ENUM('system','organization') NOT NULL DEFAULT 'organization',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = system template, set = org-owned',
  created_by      INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_template_key (template_key, organisation_id),
  KEY idx_org (organisation_id),
  KEY idx_scope (scope),
  CONSTRAINT fk_at_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_at_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_template_lines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id     INT UNSIGNED NOT NULL,
  parent_line_id  INT UNSIGNED DEFAULT NULL COMMENT 'Self-reference for nested lines',
  l3_parent_code  VARCHAR(20) NOT NULL COMMENT 'Fixed L3 code this attaches under (e.g. REVENUE-COURT)',
  code            VARCHAR(20) NOT NULL COMMENT 'Template-level code (org-relative)',
  name            VARCHAR(200) NOT NULL,
  account_type    ENUM('asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense') NOT NULL,
  normal_side     ENUM('debit','credit') NOT NULL,
  is_postable     TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Whether this account can receive GL postings',
  description     TEXT,
  display_order   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_template (template_id),
  KEY idx_parent_line (parent_line_id),
  CONSTRAINT fk_atl_template FOREIGN KEY (template_id) REFERENCES account_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_atl_parent_line FOREIGN KEY (parent_line_id) REFERENCES account_template_lines(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
