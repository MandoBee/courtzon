-- ============================================================================
-- COURTZON-V2 : Move swift from bank_branches to banks
-- ============================================================================

USE courtzon_v2;

ALTER TABLE banks ADD COLUMN swift VARCHAR(20) DEFAULT NULL AFTER name;
ALTER TABLE bank_branches DROP COLUMN swift;
