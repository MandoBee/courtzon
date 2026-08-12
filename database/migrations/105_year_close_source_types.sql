-- Migration 105: Add year_close source types to ledger_entries
ALTER TABLE ledger_entries MODIFY COLUMN source_type ENUM('booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement','journal','year_close','year_close_reopen') NOT NULL;
