-- 136_marketplace_complaint_collection_escalation.sql
--
-- When a complaint requires the product to be returned, the organisation must
-- arrange collection before the complaint can progress. If the collection
-- deadline (collection_due_at) passes while collection is still pending, a
-- scheduled worker escalates the complaint to CourtZon staff for manual
-- intervention.
--
-- The complaint remains OPEN and the disputed Financial Entitlement remains
-- ON_HOLD. The escalation is tracked by collection_escalated_at so repeated
-- worker runs never re-notify (idempotent).

ALTER TABLE `marketplace_complaints`
  ADD COLUMN `collection_escalated_at` datetime DEFAULT NULL COMMENT 'Set when collection-deadline escalation was notified to CourtZon staff' AFTER `collection_completed_at`,
  ADD KEY `idx_mc_collection_due` (`collection_due_at`, `collection_status`);