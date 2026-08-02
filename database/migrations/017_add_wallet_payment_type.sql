ALTER TABLE transactions MODIFY COLUMN `type` enum('booking_payment','wallet_topup','refund','payout','marketplace_order','withdrawal','wallet_payment') NOT NULL;
