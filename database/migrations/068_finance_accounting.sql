-- Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  type            ENUM('asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue','contra_expense') NOT NULL,
  parent_id       INT UNSIGNED DEFAULT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  description     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code),
  KEY idx_parent (parent_id),
  KEY idx_type (type),
  CONSTRAINT fk_coa_parent FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounting Periods
CREATE TABLE IF NOT EXISTS accounting_periods (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fiscal_year     INT UNSIGNED NOT NULL,
  period_number   TINYINT UNSIGNED NOT NULL COMMENT '1-12 for monthly',
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          ENUM('open','closed','locked') NOT NULL DEFAULT 'open',
  closed_at       TIMESTAMP NULL DEFAULT NULL,
  closed_by       INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fy_period (fiscal_year, period_number),
  KEY idx_status (status),
  CONSTRAINT fk_ap_closed FOREIGN KEY (closed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- General Ledger (immutable journal entries)
CREATE TABLE IF NOT EXISTS general_ledger (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  period_id       INT UNSIGNED NOT NULL,
  account_id      INT UNSIGNED NOT NULL,
  entry_date      DATE NOT NULL,
  debit           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  credit          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  balance         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  reference_type  VARCHAR(50) DEFAULT NULL,
  reference_id    BIGINT UNSIGNED DEFAULT NULL,
  description     TEXT,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_period (period_id),
  KEY idx_account (account_id),
  KEY idx_date (entry_date),
  KEY idx_reference (reference_type, reference_id),
  CONSTRAINT fk_gl_period  FOREIGN KEY (period_id) REFERENCES accounting_periods(id),
  CONSTRAINT fk_gl_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_gl_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED DEFAULT NULL,
  user_id         INT UNSIGNED DEFAULT NULL,
  invoice_number  VARCHAR(50) NOT NULL,
  invoice_type    ENUM('sales','purchase','credit_note','debit_note') NOT NULL DEFAULT 'sales',
  status          ENUM('draft','issued','paid','partially_paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
  issue_date      DATE NOT NULL,
  due_date        DATE DEFAULT NULL,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes           TEXT,
  reference_type  VARCHAR(50) DEFAULT NULL,
  reference_id    INT UNSIGNED DEFAULT NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inv_number (invoice_number),
  KEY idx_org (organisation_id),
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_reference (reference_type, reference_id),
  CONSTRAINT fk_inv_org   FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT UNSIGNED NOT NULL,
  description     VARCHAR(500) NOT NULL,
  quantity        INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_rate        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  KEY idx_invoice (invoice_id),
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax Rates
CREATE TABLE IF NOT EXISTS tax_rates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  rate            DECIMAL(5,2) NOT NULL,
  type            ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  country_code    CHAR(2) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
