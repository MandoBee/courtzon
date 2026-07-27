-- KPI Snapshots for trend analysis
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kpi_key           VARCHAR(100) NOT NULL,
  kpi_value         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL,
  branch_id         INT UNSIGNED DEFAULT NULL,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_kpi_key (kpi_key),
  KEY idx_period (period_start, period_end),
  KEY idx_org (organisation_id),
  KEY idx_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
