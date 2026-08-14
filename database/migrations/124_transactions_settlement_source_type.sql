-- Migration 124: Add 'settlement' to transactions.source_type enum
-- markPaid records the settlement payout transaction with source_type 'settlement',
-- but the enum was never extended for it (see migration 018). Payout creation
-- failed with 'Data truncated for column source_type', which also silently masked
-- the markPaid concurrency gap (the payout never persisted, so no duplicates were
-- observable). This unblocks the payout path so the V2 aggregate fix is effective.
ALTER TABLE transactions
  MODIFY COLUMN source_type ENUM('booking','academy','marketplace','admin','wallet','order','settlement') DEFAULT NULL;
