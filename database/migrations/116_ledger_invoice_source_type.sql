-- Migration 116: Add 'invoice' to ledger_entries.source_type
-- The accounting engine posts invoice issue/cancel/payment ledger entries with
-- sourceType 'invoice', but the enum was never extended for it. This caused
-- invoice accounting postings to fail with 'Data truncated for column source_type'.
ALTER TABLE ledger_entries MODIFY COLUMN source_type ENUM(
  'booking','academy','membership','marketplace','wallet','subscription','adjustment','refund','coupon','commission','settlement','journal','tournament','year_close','year_close_reopen','invoice'
) NOT NULL;
