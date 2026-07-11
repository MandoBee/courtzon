-- ============================================================
-- CLEAN: Bookings, Marketplace & Notifications on Hostinger
-- ============================================================
-- Tables affected: 22
-- Tables NOT touched: users, products, organisations, branches,
--   resources, settlements, audit_logs, wallets,
--   notification_actions, notification_categories,
--   user_notification_preferences
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ────────────────────────────────────────────────────────────
-- PHASE 1: Booking children (no FK constraints)
-- ────────────────────────────────────────────────────────────

DELETE FROM booking_participants;
DELETE FROM booking_slots;
DELETE FROM booking_invitations;
DELETE FROM booking_cancellations;

-- coach_sessions FK → bookings ON DELETE SET NULL (won't cascade)
DELETE FROM coach_sessions;

-- ────────────────────────────────────────────────────────────
-- PHASE 2: Booking parents
--   bookings → CASCADE deletes booking_matchmaking_requests
-- ────────────────────────────────────────────────────────────

DELETE FROM booking_intents;
DELETE FROM bookings;

-- ────────────────────────────────────────────────────────────
-- PHASE 3: Marketplace children (ON DELETE CASCADE from orders)
-- ────────────────────────────────────────────────────────────

DELETE FROM marketplace_ledger_entries;
DELETE FROM settlement_orders;
DELETE FROM order_status_history;
DELETE FROM order_items;

-- ────────────────────────────────────────────────────────────
-- PHASE 4: Marketplace parents
-- ────────────────────────────────────────────────────────────

DELETE FROM orders;

-- ────────────────────────────────────────────────────────────
-- PHASE 5: Financial records
--   transaction_entries CASCADE from transactions
-- ────────────────────────────────────────────────────────────

DELETE te FROM transaction_entries te
  JOIN transactions t ON t.id = te.transaction_id
  WHERE t.source_type IN ('booking', 'marketplace');

DELETE FROM transactions
  WHERE source_type IN ('booking', 'marketplace');

-- payment_transactions (logical refs, no FK)
DELETE FROM payment_transactions
  WHERE booking_id IS NOT NULL OR order_id IS NOT NULL;

-- wallet_transactions (polymorphic refs, no FK)
DELETE FROM wallet_transactions
  WHERE reference_type IN ('booking', 'order');

-- ────────────────────────────────────────────────────────────
-- PHASE 6: Cart, Wishlist, Coupon usage
-- ────────────────────────────────────────────────────────────

DELETE FROM cart_items;
DELETE FROM wishlist_items;

DELETE FROM coupon_usage
  WHERE order_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- PHASE 7: Notifications (all user notifications + queue)
--   Keeps: notification_actions, notification_categories,
--          user_notification_preferences
-- ────────────────────────────────────────────────────────────

DELETE FROM notification_queue;
DELETE FROM notifications;

SET FOREIGN_KEY_CHECKS = 1;
