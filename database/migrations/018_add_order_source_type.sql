ALTER TABLE transactions MODIFY COLUMN `source_type` enum('booking','academy','marketplace','admin','wallet','order') DEFAULT NULL;
