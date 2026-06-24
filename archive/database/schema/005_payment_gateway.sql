-- Migration 005: Payment Gateway & Financial Engine
-- Adds: bank_accounts, settlement tracking columns, payment gateway config

-- 1. Bank accounts for withdrawals (per-branch)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_holder_name VARCHAR(150) NOT NULL,
  iban VARCHAR(50) DEFAULT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- 2. (moved to 007_financial.sql where payment_transactions is created)

-- 3. (moved to 007_financial.sql where settlements table is created)

-- 4. Payment gateway configuration (tenant/admin settings)
CREATE TABLE IF NOT EXISTS payment_gateway_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED DEFAULT NULL,
  gateway_provider VARCHAR(50) NOT NULL DEFAULT 'paymob',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  config JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  INDEX idx_gateway_org (organisation_id, gateway_provider)
);

-- 5. Withdrawal requests for admin approval workflow
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  wallet_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  bank_account_id INT UNSIGNED DEFAULT NULL,
  status ENUM('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT NULL,
  reviewed_by INT UNSIGNED DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_withdrawal_user (user_id),
  INDEX idx_withdrawal_status (status)
);

-- 6. (moved to 007_financial.sql)
