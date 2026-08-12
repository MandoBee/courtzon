-- Migration 101: Accounting Hardening
-- 1. Add period_id to ledger_entries (canonical ledger period)
-- 2. Add ledger_entry_id to general_ledger (1:1 tracking + idempotency)
-- 3. Make ledger_entries.account_type nullable (chart_account_id is canonical)

-- ── 1. ledger_entries.period_id ──
ALTER TABLE ledger_entries
  ADD COLUMN period_id INT UNSIGNED DEFAULT NULL AFTER event_type,
  ADD KEY idx_le_period (period_id),
  ADD CONSTRAINT fk_le_period FOREIGN KEY (period_id) REFERENCES accounting_periods(id) ON DELETE SET NULL;

-- ── 2. general_ledger.ledger_entry_id (1:1 canon → projection) ──
ALTER TABLE general_ledger
  ADD COLUMN ledger_entry_id BIGINT UNSIGNED DEFAULT NULL AFTER id,
  ADD UNIQUE KEY uk_gl_ledger_entry (ledger_entry_id),
  ADD CONSTRAINT fk_gl_le FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL;

-- ── 3. ledger_entries.account_type NULLABLE ──
ALTER TABLE ledger_entries
  MODIFY COLUMN account_type ENUM('platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund') NULL;
