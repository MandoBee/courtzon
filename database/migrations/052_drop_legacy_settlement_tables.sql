-- Phase 2.7: Remove legacy settlement tables
-- These have been replaced by the V2 settlement model.
-- Verify no runtime references exist before running this migration.

DROP TABLE IF EXISTS `settlement_items_v1`;
DROP TABLE IF EXISTS `settlements_v1`;
