-- Accounting Unification Changes
ALTER TABLE ledger_entries MODIFY COLUMN source_type ENUM('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement','journal') NOT NULL;
