-- 133_marketplace_delivered_at.sql
-- Add `delivered_at` timestamp to orders so the financial entitlement system can
-- calculate the complaint/return window: available_at = delivered_at + complaint_period_days.
--
-- Previously only `estimated_delivery_date` existed (an estimate computed at checkout),
-- so there was no reliable record of when an order was actually delivered.

ALTER TABLE `orders`
  ADD COLUMN `delivered_at` timestamp NULL DEFAULT NULL AFTER `paid_at`;

-- Backfill: for already-delivered orders, the best available timestamp is the last
-- status change (updated_at). Best effort — historical accuracy is limited to what
-- the schema retained.
UPDATE `orders`
  SET `delivered_at` = `updated_at`
  WHERE `status` = 'delivered' AND `delivered_at` IS NULL;