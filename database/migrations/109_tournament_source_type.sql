-- Migration 109: Add 'tournament' source type for canonical accounting
ALTER TABLE ledger_entries MODIFY COLUMN source_type ENUM('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement','journal','tournament','year_close','year_close_reopen') NOT NULL;
