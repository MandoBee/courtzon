-- 132_financial_entitlements_unique_source.sql
-- Add unique constraint on (source_type, source_id, entitlement_type) to prevent
-- duplicate entitlements for the same financial event.
--
-- This is a safety constraint: the application-level idempotency check (reading
-- existing entitlements before insert) is not atomic with the write. The unique
-- index provides a database-level backstop against duplicate creation.

ALTER TABLE `financial_entitlements`
  ADD UNIQUE KEY `uk_fe_source_type` (`source_type`, `source_id`, `entitlement_type`);
