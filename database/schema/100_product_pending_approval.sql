-- Migration 100: Add pending status for product approval workflow
USE `courtzon_v2`;

ALTER TABLE products
  MODIFY COLUMN status ENUM('draft','pending','active','sold','archived','out_of_stock') NOT NULL DEFAULT 'draft';
