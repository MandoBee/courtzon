-- ============================================================================
-- COURTZON-V2 : Seller Settlements
--  - Track seller payouts / settlements with CourtZon
--  - Allow sellers to request settlement for their earnings
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS settlements (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id       INT UNSIGNED NOT NULL,
  amount                DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  fee                   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_amount            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status                ENUM('pending','approved','paid','rejected','cancelled') NOT NULL DEFAULT 'pending',
  requested_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at           TIMESTAMP NULL DEFAULT NULL,
  paid_at               TIMESTAMP NULL DEFAULT NULL,
  rejected_at           TIMESTAMP NULL DEFAULT NULL,
  rejected_reason       TEXT DEFAULT NULL,
  notes                 TEXT DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org (organisation_id),
  INDEX idx_status (status),
  CONSTRAINT fk_stl_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
