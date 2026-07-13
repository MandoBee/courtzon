-- =============================================================
-- Clean all bookings & marketplace purchase data from courtzon_v3
-- Run in Coolify's database UI or via: mysql -u root -p courtzon_v3 < this_file.sql
-- WARNING: This is irreversible. Back up first if needed.
-- =============================================================
-- Database: courtzon_v3 (Docker) or courtzon_v2 (XAMPP)
-- Change the USE statement below to match your environment.
-- =============================================================

USE `courtzon_v3`;

-- Disable FK checks so we can delete in any order safely
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Booking-linked optional references (SET NULL equivalent) ──
UPDATE `coach_sessions` SET `booking_id` = NULL WHERE `booking_id` IS NOT NULL;
UPDATE `player_ratings`  SET `booking_id` = NULL WHERE `booking_id` IS NOT NULL;

-- ── 2. Notification & queue (action_payload may reference booking/order IDs) ──
DELETE FROM `notification_queue`;
DELETE FROM `notifications`;

-- ── 3. Cart & wishlist (user-pending purchases) ──
DELETE FROM `cart_items`;
DELETE FROM `wishlist_items`;

-- ── 4. Coupon usage (references orders) ──
DELETE FROM `coupon_usage`;

-- ── 5. Settlement chain ──
DELETE FROM `settlement_items_v1`;
DELETE FROM `settlement_orders`;
DELETE FROM `settlement_transfers`;
DELETE FROM `settlements_v1`;
DELETE FROM `settlements`;

-- ── 6. Marketplace ledger (references orders) ──
DELETE FROM `marketplace_ledger_entries`;

-- ── 7. Order items & status history (cascade-safe, delete explicitly) ──
DELETE FROM `order_items`;
DELETE FROM `order_status_history`;

-- ── 8. Orders (core) ──
DELETE FROM `orders`;

-- ── 9. Transaction chain (polymorphic: booking/order references) ──
DELETE FROM `transaction_entries`;
DELETE FROM `transactions`;

-- ── 10. Wallet transactions (polymorphic: booking/order references) ──
DELETE FROM `wallet_transactions`;

-- ── 11. Financial journal (polymorphic: booking/order references) ──
DELETE FROM `financial_journal_entries`;

-- ── 12. Inventory logs (polymorphic: order references) ──
DELETE FROM `inventory_logs`;

-- ── 13. Audit logs (polymorphic: booking/order entity references) ──
DELETE FROM `audit_logs`;

-- ── 14. Payment transactions (references bookings & orders) ──
DELETE FROM `payment_transactions`;

-- ── 15. Booking child tables ──
DELETE FROM `booking_participants`;
DELETE FROM `booking_invitations`;
DELETE FROM `booking_cancellations`;
DELETE FROM `booking_matchmaking_requests`;
DELETE FROM `booking_slots`;

-- ── 16. Booking intents ──
DELETE FROM `booking_intents`;

-- ── 17. Bookings (core) ──
DELETE FROM `bookings`;

-- ── 18. Product reviews & ratings (user-generated content tied to purchases) ──
DELETE FROM `product_reviews`;

-- Re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Done. All bookings and marketplace purchase data cleared.' AS result;
