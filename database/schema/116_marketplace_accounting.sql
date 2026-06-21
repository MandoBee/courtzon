-- ============================================================================
-- COURTZON-V2 : Marketplace Accounting Ledger
-- Immutable double-entry for marketplace order lifecycle.
-- Supports COD and Online payment flows with reversals.
-- ============================================================================

USE courtzon_v2;

CREATE TABLE marketplace_ledger_entries (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED NOT NULL,
  order_item_id   INT UNSIGNED DEFAULT NULL,
  branch_id       INT UNSIGNED DEFAULT NULL,
  organisation_id INT UNSIGNED NOT NULL,
  entry_type      ENUM(
    'inventory_deduction',
    'due_to_collect',
    'due_to_transfer',
    'due_to_courtzon',
    'reversal',
    'refund'
  ) NOT NULL,
  payment_method  ENUM('cod','online') DEFAULT NULL,
  amount          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency_code   CHAR(3) NOT NULL DEFAULT 'EGP',
  description     TEXT DEFAULT NULL,
  metadata        JSON DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_mle_order (order_id),
  INDEX idx_mle_branch (branch_id),
  INDEX idx_mle_org (organisation_id),
  INDEX idx_mle_type (entry_type),

  CONSTRAINT fk_mle_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_mle_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_mle_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
