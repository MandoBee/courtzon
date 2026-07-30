-- ============================================================================
-- CourtZon V3 — Production Data Cleanup
-- Target: Hostinger production database (courtzon_v3)
-- Generated: 2026-07-28
--
-- WHAT THIS CLEANS:
--   1. Orders + related (order_items, order_status_history, marketplace_ledger)
--   2. Bookings + related (cancellations, participants, slots, intents, etc.)
--   3. All users + related EXCEPT Super Admin + Tarek Zaki (01227771587)
--
-- INSTRUCTIONS:
--   1. BACK UP the database FIRST
--   2. mysql -u <user> -p courtzon_v3 < cleanup-production.sql
--   3. Review counts
--   4. Uncomment COMMIT at the bottom
-- ============================================================================

START TRANSACTION;

-- ============================================================================
-- STEP 0: Identify protected user IDs
-- ============================================================================
SET @super_admin_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1);
SET @tarek_id = (SELECT id FROM users WHERE phone_number = '01227771587' OR full_phone LIKE '%01227771587%' LIMIT 1);

SELECT 'Protected:' as step, @super_admin_id as super_admin, @tarek_id as tarek_zaki;
SELECT 'Users to keep:' as step, COUNT(*) as count FROM users WHERE id IN (@super_admin_id, @tarek_id);
SELECT 'Users to delete:' as step, COUNT(*) as count FROM users WHERE id NOT IN (@super_admin_id, @tarek_id);

-- ============================================================================
-- STEP 1: ORDERS + RELATED (unconditional — clear all)
-- ============================================================================
SELECT 'Cleaning orders...' as step;

DELETE FROM marketplace_ledger_entries;
DELETE FROM order_status_history;
DELETE FROM order_items;
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;
DELETE FROM stock_transfers;
DELETE FROM inventory_logs;
DELETE FROM orders;

-- ============================================================================
-- STEP 2: BOOKINGS + RELATED (unconditional — clear all)
-- ============================================================================
SELECT 'Cleaning bookings...' as step;

DELETE FROM booking_cancellations;
DELETE FROM booking_participants;
DELETE FROM booking_invitations;
DELETE FROM booking_matchmaking_requests;
DELETE FROM booking_intents;
DELETE FROM booking_slots;
DELETE FROM bookings;

-- ============================================================================
-- STEP 3: DELETE ALL USERS (and their data) EXCEPT PROTECTED
-- ============================================================================
SELECT 'Cleaning non-protected users and their data...' as step;

-- 3a. Sessions & tokens
DELETE FROM user_sessions WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM email_verification_tokens WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM password_reset_tokens WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM verification_tokens WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3b. RBAC
DELETE FROM user_roles WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_role_scopes WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3c. Organisation/branch membership
DELETE FROM user_organisations WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_branches WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3d. Addresses
DELETE FROM user_addresses WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3e. Wallets (wallet_transactions first, then wallets)
DELETE FROM wallet_transactions WHERE wallet_id IN (
    SELECT id FROM user_wallets WHERE user_id NOT IN (@super_admin_id, @tarek_id)
);
DELETE FROM user_wallets WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3f. Profiles
DELETE FROM player_sport_interests WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM player_profiles WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM coach_profiles WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM seller_profiles WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM seller_shipping_rates WHERE seller_id NOT IN (
    SELECT id FROM seller_profiles WHERE user_id IN (@super_admin_id, @tarek_id)
);

-- 3g. Notification preferences
DELETE FROM user_notification_preferences WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_channel_preferences WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_quiet_hours WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3h. Devices
DELETE FROM user_devices WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM push_tokens WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3i. Social
DELETE FROM user_follows WHERE user_id NOT IN (@super_admin_id, @tarek_id)
    AND followed_user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_friends WHERE user_id NOT IN (@super_admin_id, @tarek_id)
    AND friend_id NOT IN (@super_admin_id, @tarek_id);

-- 3j. Memberships & loyalty
DELETE FROM membership_history WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM user_memberships WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM memberships WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM loyalty_points WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM reward_claims WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3k. Coupons
DELETE FROM coupon_assignments WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM coupon_usage WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3l. Cart & wishlist
DELETE FROM cart_items WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM wishlist_items WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3m. Invitations & join requests
DELETE FROM invitations WHERE user_id NOT IN (@super_admin_id, @tarek_id)
    OR invited_user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM join_requests WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3n. Coach agreements
DELETE FROM coach_org_agreements WHERE coach_id NOT IN (
    SELECT id FROM coach_profiles WHERE user_id IN (@super_admin_id, @tarek_id)
);

-- 3o. Bookings created by non-protected users (if any remain)
DELETE FROM booking_participants WHERE user_id NOT IN (@super_admin_id, @tarek_id);

-- 3p. Match-related
DELETE FROM match_participants WHERE user_id NOT IN (@super_admin_id, @tarek_id);
DELETE FROM matches WHERE created_by NOT IN (@super_admin_id, @tarek_id);

-- 3q. DELETE THE USERS THEMSELVES (LAST)
DELETE FROM users WHERE id NOT IN (@super_admin_id, @tarek_id);

-- ============================================================================
-- STEP 4: VERIFICATION
-- ============================================================================
SELECT '=== VERIFICATION ===' as '';
SELECT 'Remaining users:' as check_name, COUNT(*) as value FROM users;
SELECT 'Remaining orders:' as check_name, COUNT(*) as value FROM orders;
SELECT 'Remaining bookings:' as check_name, COUNT(*) as value FROM bookings;
SELECT 'Remaining marketplace_ledger_entries:' as check_name, COUNT(*) as value FROM marketplace_ledger_entries;
SELECT 'Remaining order_items:' as check_name, COUNT(*) as value FROM order_items;
SELECT 'Remaining user_roles:' as check_name, COUNT(*) as value FROM user_roles;
SELECT 'Remaining user_wallets:' as check_name, COUNT(*) as value FROM user_wallets;
SELECT 'Remaining user_sessions:' as check_name, COUNT(*) as value FROM user_sessions;
SELECT 'Remaining player_profiles:' as check_name, COUNT(*) as value FROM player_profiles;

-- ============================================================================
-- STEP 5: FINALIZE
-- ============================================================================
-- Review the verification counts above.
-- If everything looks correct, run:
--    COMMIT;
-- If something is wrong, run:
--    ROLLBACK;

-- UNCOMMENT THE NEXT LINE TO FINALIZE:
-- COMMIT;
