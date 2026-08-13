-- 119_organisation_coa_customizations.sql
-- Per-organisation overlay for the DEFAULT (global) Level-4 account catalog.
--
-- Enables the multi-tenant rule: an organisation may HIDE, SHOW or locally
-- RENAME a global default L4 account WITHOUT modifying the global account or
-- affecting other organisations or CourtZon's own accounting.
--
-- This is a pure overlay (display/visibility). It does NOT change account
-- identity, mapping references, ledger references or report behaviour. An
-- organisation that wants its OWN distinct accounting account (with its own
-- balance) creates an organisation-scoped account via the existing
-- chart_of_accounts organisation_id mechanism and maps events to it via the
-- existing organisation mapping override.

CREATE TABLE IF NOT EXISTS organisation_coa_customizations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  account_id INT UNSIGNED NOT NULL COMMENT 'Global (organisation_id NULL) L4 account being customised',
  is_visible TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'False hides this default account from the organisation COA view',
  display_name VARCHAR(200) NULL COMMENT 'Local display name (e.g. Bank 1 -> CIB Main Account)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_org_account (organisation_id, account_id),
  KEY idx_org (organisation_id),
  KEY idx_account (account_id),
  CONSTRAINT fk_ocac_org FOREIGN KEY (organisation_id) REFERENCES organisations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ocac_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
