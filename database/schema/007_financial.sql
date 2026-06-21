-- ============================================================================
-- COURTZON-V2 : FINANCIAL SYSTEM (Wallets, Payments, Commissions, Settlements)
-- Matches the physical database schema (courtzon.sql dump).
-- ============================================================================

USE courtzon_v2;

CREATE TABLE user_wallets (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  balance       DECIMAL(14,2) DEFAULT 0.00,
  currency_code VARCHAR(10) DEFAULT 'EGP',
  is_locked     TINYINT(1) DEFAULT 0,
  version       INT DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wallet_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wallet_transactions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id        CHAR(36) DEFAULT NULL,
  wallet_id        BIGINT UNSIGNED NOT NULL,
  transaction_type ENUM('deposit','withdrawal','payment','refund','commission','settlement') NOT NULL,
  amount           DECIMAL(14,2) NOT NULL,
  direction        ENUM('credit','debit') NOT NULL,
  reference_type   VARCHAR(100) DEFAULT NULL,
  reference_id     BIGINT UNSIGNED DEFAULT NULL,
  description      TEXT DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_wallet (wallet_id),
  INDEX idx_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_transactions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  booking_id        BIGINT UNSIGNED DEFAULT NULL,
  payment_method    ENUM('wallet','cash','card','bank_transfer') NOT NULL,
  gateway_provider  VARCHAR(100) DEFAULT NULL,
  gateway_reference VARCHAR(255) DEFAULT NULL,
  amount            DECIMAL(14,2) NOT NULL,
  payment_status    ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  paid_at           TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user (user_id),
  INDEX idx_booking (booking_id),
  INDEX idx_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commission_rules (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_name        VARCHAR(255) DEFAULT NULL,
  rule_type        ENUM('percentage','fixed') NOT NULL,
  amount           DECIMAL(12,2) NOT NULL,
  applicable_entity VARCHAR(100) DEFAULT NULL,
  is_active        TINYINT(1) DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlements (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  club_id               BIGINT UNSIGNED NOT NULL,
  settlement_type       ENUM('club_to_courtzon','courtzon_to_club') NOT NULL,
  gross_amount          DECIMAL(14,2) NOT NULL,
  commission_amount     DECIMAL(14,2) NOT NULL,
  net_amount            DECIMAL(14,2) NOT NULL,
  settlement_status     ENUM('pending','processing','completed','failed') DEFAULT 'pending',
  settlement_period_start DATE DEFAULT NULL,
  settlement_period_end   DATE DEFAULT NULL,
  processed_at          TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_club (club_id),
  INDEX idx_status (settlement_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlement_items (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  settlement_id              BIGINT UNSIGNED NOT NULL,
  booking_id                 BIGINT UNSIGNED DEFAULT NULL,
  tournament_registration_id BIGINT UNSIGNED DEFAULT NULL,
  gross_amount               DECIMAL(12,2) DEFAULT NULL,
  commission_amount          DECIMAL(12,2) DEFAULT NULL,
  net_amount                 DECIMAL(12,2) DEFAULT NULL,
  created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_settlement (settlement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE financial_journal_entries (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_type      VARCHAR(100) DEFAULT NULL,
  reference_type  VARCHAR(100) DEFAULT NULL,
  reference_id    BIGINT UNSIGNED DEFAULT NULL,
  debit_account   VARCHAR(100) DEFAULT NULL,
  credit_account  VARCHAR(100) DEFAULT NULL,
  amount          DECIMAL(14,2) DEFAULT NULL,
  description     TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
