-- 139_drop_settlement_batches.sql
--
-- Final cleanup: drop the dead `settlement_batches` table.
--
-- This table was created by migration 054 (financial engine) for the legacy
-- settlement-batch reporting feature. Its entire API surface
-- (FinancialSettlementService.generateBatch + GET/POST /admin/financial/settlements)
-- was removed in the "retire dead legacy settlement/withdrawal/batch endpoints"
-- cleanup (edc5f7b). Re-verified before this drop:
--   - 0 rows
--   - 0 FK children / 0 FK parents
--   - 0 triggers / 0 scheduled events / 0 views
--   - zero runtime, test, script, seed, or baseline references
--   - not part of the authoritative baseline (migration-created only)
--
-- Historical migration 054 remains immutable. Only this table is dropped.
-- No accounting/GL, settlement_orders, settlement_transfers, or active
-- settlement tables are touched.

DROP TABLE IF EXISTS `settlement_batches`;