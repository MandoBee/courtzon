-- ============================================================================
-- EEP Phase 6: Performance Indexes
-- Evidence-based composite indexes for hot query paths.
-- ============================================================================

-- 1. booking_slots: Composite index for slot availability lookups
--    Query: WHERE resource_id = ? AND booking_date = ? AND slot_start = ?
--    Current: Separate indexes on resource_id, date
--    Expected gain: 50-80% faster slot availability checks
ALTER TABLE booking_slots
  ADD INDEX idx_resource_date_slot (resource_id, booking_date, slot_start);

-- 2. notifications: Composite index for user notification listing
--    Query: WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
--    Current: Separate indexes on user_id, created_at
--    Expected gain: 30-50% faster notification list loading
ALTER TABLE notifications
  ADD INDEX idx_user_created (user_id, created_at DESC);

-- 3. products: Composite index for seller product listing
--    Query: WHERE seller_id = ? AND status = ? ORDER BY created_at DESC
--    Current: Separate indexes on seller_id, status, created_at
--    Expected gain: 20-40% faster seller dashboard
ALTER TABLE products
  ADD INDEX idx_seller_status_created (seller_id, status, created_at);
