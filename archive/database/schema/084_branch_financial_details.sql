-- Branch-level financial profile (replaces organisation_financial_details + bank_accounts)

CREATE TABLE IF NOT EXISTS branch_financial_details (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id             INT UNSIGNED NOT NULL,
  bank_id               INT UNSIGNED DEFAULT NULL,
  bank_branch_id        INT UNSIGNED DEFAULT NULL COMMENT 'Bank institution branch (bank_branches.id)',
  bank_name             VARCHAR(200) DEFAULT NULL,
  bank_account_name     VARCHAR(200) DEFAULT NULL,
  bank_account_number   VARCHAR(100) DEFAULT NULL,
  iban                  VARCHAR(50) DEFAULT NULL,
  swift                 VARCHAR(20) DEFAULT NULL,
  billing_address       TEXT DEFAULT NULL,
  billing_email         VARCHAR(255) DEFAULT NULL,
  payout_schedule       ENUM('daily','weekly','biweekly','monthly') DEFAULT 'monthly',
  currency_id           TINYINT UNSIGNED DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bfd_branch (branch_id),
  INDEX idx_bfd_bank (bank_id),
  INDEX idx_bfd_bank_branch (bank_branch_id),
  CONSTRAINT fk_bfd_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Copy org financial row to every branch under that org
INSERT IGNORE INTO branch_financial_details (
  branch_id, bank_id, bank_branch_id, bank_name, bank_account_name, bank_account_number,
  iban, swift, billing_address, billing_email, payout_schedule, currency_id
)
SELECT
  b.id, ofd.bank_id, ofd.bank_branch_id, ofd.bank_name, ofd.bank_account_name, ofd.bank_account_number,
  ofd.iban, ofd.swift, ofd.billing_address, ofd.billing_email,
  COALESCE(ofd.payout_schedule, 'monthly'), ofd.currency_id
FROM organisation_financial_details ofd
INNER JOIN branches b ON b.organisation_id = ofd.organisation_id AND b.deleted_at IS NULL;

-- Merge bank_accounts into branch_financial_details where missing
INSERT IGNORE INTO branch_financial_details (
  branch_id, bank_name, bank_account_name, bank_account_number, iban
)
SELECT ba.branch_id, ba.bank_name, ba.account_holder_name, ba.account_number, ba.iban
FROM bank_accounts ba;

UPDATE branch_financial_details bfd
INNER JOIN bank_accounts ba ON ba.branch_id = bfd.branch_id
SET
  bfd.bank_name = COALESCE(bfd.bank_name, ba.bank_name),
  bfd.bank_account_name = COALESCE(bfd.bank_account_name, ba.account_holder_name),
  bfd.bank_account_number = COALESCE(bfd.bank_account_number, ba.account_number),
  bfd.iban = COALESCE(bfd.iban, ba.iban)
WHERE bfd.bank_account_number IS NULL OR bfd.bank_account_number = '';

-- Point withdrawal requests at branch financial profile
ALTER TABLE withdrawal_requests
  ADD COLUMN branch_financial_details_id INT UNSIGNED DEFAULT NULL AFTER amount;

UPDATE withdrawal_requests wr
INNER JOIN bank_accounts ba ON ba.id = wr.bank_account_id
INNER JOIN branch_financial_details bfd ON bfd.branch_id = ba.branch_id
SET wr.branch_financial_details_id = bfd.id
WHERE wr.bank_account_id IS NOT NULL;

ALTER TABLE withdrawal_requests DROP FOREIGN KEY withdrawal_requests_ibfk_2;
ALTER TABLE withdrawal_requests DROP COLUMN bank_account_id;
ALTER TABLE withdrawal_requests
  ADD CONSTRAINT fk_wr_branch_financial
  FOREIGN KEY (branch_financial_details_id) REFERENCES branch_financial_details(id) ON DELETE SET NULL;

DROP TABLE IF EXISTS bank_accounts;
DROP TABLE IF EXISTS organisation_financial_details;
