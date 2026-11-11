-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ---------------------------------------------------------------------------
-- 207_settlement_entitlements_reuse.sql
--
-- Fix: a Financial Entitlement could never be re-used after its Unified
-- Settlement was cancelled.
--
-- Root cause (verified in code, not inferred):
--   * `unified-settlement.service.ts` cancel -> `releaseFromSettlement()` sets
--     `financial_entitlements.status='AVAILABLE'` and `settlement_id=NULL`, i.e.
--     the entitlement is deliberately returned to the eligible pool.
--   * The join row in `settlement_entitlements` is never removed (history).
--   * `uk_se_entitlement (entitlement_id)` (migration 137) then rejected the new
--     link, and `linkEntitlements()` used `INSERT IGNORE`, so the rejection was
--     SILENT: the settlement was created with ZERO entitlement links (3713).
--
-- Decision (approved): option B — keep each settlement's composition history and
-- narrow uniqueness to the (settlement, entitlement) PAIR. The ACTIVE
-- reservation is authoritative in `financial_entitlements.settlement_id`.
--
-- HARDENED CONVERGENCE: idempotent, convergent, fail-closed. Each index is
-- validated on its COMPLETE definition: part count, ordered columns, uniqueness,
-- prefix lengths, functional expressions, index type, visibility and sort order.
--
-- Metadata support (verified from repository evidence, no DB connection):
--   * database/Dockerfile:1                      -> `FROM mysql:8.0`
--   * docs/database/backup_recovery.md:310-311   -> production runs 8.0.46
--   * backend/src/infrastructure/migrations/baseline/live-metadata.ts:984-989
--     already SELECTs NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART,
--     COLLATION, INDEX_TYPE, EXPRESSION and IS_VISIBLE from
--     information_schema.STATISTICS, so every column used below is part of the
--     project's supported surface. `live-metadata.ts:609` already interprets
--     `COLLATION = 'D'` as a DESCENDING index part.
--   * baseline 001_courtzon_v3.sql:5091          -> ENGINE=InnoDB (BTREE only)
--
-- Expected definitions:
--   index                        parts  ordered columns                    uniq  sub_part  expression  type   visible  collation
--   idx_se_entitlement           1      entitlement_id                     1     NULL      none        BTREE  YES      A
--   uk_se_settlement_entitlement 2      settlement_id, entitlement_id      0     NULL      none        BTREE  YES      A,A
--   uk_se_entitlement (legacy)   1      entitlement_id                     0     NULL      none        BTREE  YES      A
--
-- State matrix:
--   state                                   action
--   --------------------------------------  ----------------------------------
--   idx_se_entitlement absent               ADD INDEX (entitlement_id)
--   idx exists, complete definition         skip
--   pair UK absent                          ADD UNIQUE (settlement_id, entitlement_id)
--   pair UK exists, complete definition     skip
--   uk_se_entitlement absent (final state)  skip  -> a second run executes no DDL
--   uk_se_entitlement present, complete     DROP INDEX
--   ANY name present with a FOREIGN shape   ABORT before any DDL (fail closed)
--   final shape not reached after the DDL   ABORT (post-condition proof)
--
-- Order is FK-safe: the index whose leftmost column is `entitlement_id` is
-- created or validated BEFORE `uk_se_entitlement` is dropped, so
-- `fk_se_entitlement` is supported throughout.
--
-- Fail-closed mechanism: a prepared `SELECT` of a deliberately non-existent
-- column. MySQL aborts with 1054 and the column name states the reason. No
-- stored procedures, no triggers, no data or DDL side effects on abort.
-- ---------------------------------------------------------------------------

-- ── 0. Snapshot the CURRENT definition of each index in one metadata read ────
-- COUNT(*) proves the exact number of parts, so a functional or hidden part can
-- never pass through GROUP_CONCAT alone (a functional part has COLUMN_NAME NULL
-- and would silently disappear from the concatenation). COLLATION is captured
-- both as an ordered string ('A' ascending / 'D' descending) and as an explicit
-- NULL count, so a missing sort-order value can never be read as ascending.
SELECT COUNT(*),
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),
       MAX(NON_UNIQUE),
       MAX(SUB_PART),
       SUM(CASE WHEN EXPRESSION IS NOT NULL THEN 1 ELSE 0 END),
       MAX(INDEX_TYPE),
       SUM(CASE WHEN IS_VISIBLE = 'YES' THEN 1 ELSE 0 END),
       GROUP_CONCAT(COLLATION ORDER BY SEQ_IN_INDEX),
       SUM(CASE WHEN COLLATION IS NULL THEN 1 ELSE 0 END)
  INTO @se_idx_parts, @se_idx_columns, @se_idx_unique, @se_idx_sub_part,
       @se_idx_expr_parts, @se_idx_type, @se_idx_visible_parts,
       @se_idx_collations, @se_idx_collation_nulls
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'idx_se_entitlement';

SELECT COUNT(*),
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),
       MAX(NON_UNIQUE),
       MAX(SUB_PART),
       SUM(CASE WHEN EXPRESSION IS NOT NULL THEN 1 ELSE 0 END),
       MAX(INDEX_TYPE),
       SUM(CASE WHEN IS_VISIBLE = 'YES' THEN 1 ELSE 0 END),
       GROUP_CONCAT(COLLATION ORDER BY SEQ_IN_INDEX),
       SUM(CASE WHEN COLLATION IS NULL THEN 1 ELSE 0 END)
  INTO @se_pair_parts, @se_pair_columns, @se_pair_unique, @se_pair_sub_part,
       @se_pair_expr_parts, @se_pair_type, @se_pair_visible_parts,
       @se_pair_collations, @se_pair_collation_nulls
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'uk_se_settlement_entitlement';

SELECT COUNT(*),
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),
       MAX(NON_UNIQUE),
       MAX(SUB_PART),
       SUM(CASE WHEN EXPRESSION IS NOT NULL THEN 1 ELSE 0 END),
       MAX(INDEX_TYPE),
       SUM(CASE WHEN IS_VISIBLE = 'YES' THEN 1 ELSE 0 END),
       GROUP_CONCAT(COLLATION ORDER BY SEQ_IN_INDEX),
       SUM(CASE WHEN COLLATION IS NULL THEN 1 ELSE 0 END)
  INTO @se_legacy_parts, @se_legacy_columns, @se_legacy_unique, @se_legacy_sub_part,
       @se_legacy_expr_parts, @se_legacy_type, @se_legacy_visible_parts,
       @se_legacy_collations, @se_legacy_collation_nulls
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'uk_se_entitlement';

-- ── 1. FAIL CLOSED before any DDL when a name carries a FOREIGN definition ───
-- Every clause below is required; dropping any one of them would let a wrong
-- index through (extra part, functional part, prefix part, invisible part,
-- descending or mixed-order part …).
SET @se_bad_definitions :=
    (CASE WHEN @se_idx_parts > 0
           AND NOT (@se_idx_parts = 1
                    AND COALESCE(@se_idx_columns, '') = 'entitlement_id'
                    AND @se_idx_unique = 1
                    AND @se_idx_sub_part IS NULL
                    AND COALESCE(@se_idx_expr_parts, 0) = 0
                    AND UPPER(COALESCE(@se_idx_type, '')) = 'BTREE'
                    AND COALESCE(@se_idx_visible_parts, 0) = @se_idx_parts
                    AND COALESCE(@se_idx_collations, '') = 'A'
                    AND COALESCE(@se_idx_collation_nulls, 0) = 0)
          THEN 1 ELSE 0 END)
  + (CASE WHEN @se_pair_parts > 0
           AND NOT (@se_pair_parts = 2
                    AND COALESCE(@se_pair_columns, '') = 'settlement_id,entitlement_id'
                    AND @se_pair_unique = 0
                    AND @se_pair_sub_part IS NULL
                    AND COALESCE(@se_pair_expr_parts, 0) = 0
                    AND UPPER(COALESCE(@se_pair_type, '')) = 'BTREE'
                    AND COALESCE(@se_pair_visible_parts, 0) = @se_pair_parts
                    AND COALESCE(@se_pair_collations, '') = 'A,A'
                    AND COALESCE(@se_pair_collation_nulls, 0) = 0)
          THEN 1 ELSE 0 END)
  + (CASE WHEN @se_legacy_parts > 0
           AND NOT (@se_legacy_parts = 1
                    AND COALESCE(@se_legacy_columns, '') = 'entitlement_id'
                    AND @se_legacy_unique = 0
                    AND @se_legacy_sub_part IS NULL
                    AND COALESCE(@se_legacy_expr_parts, 0) = 0
                    AND UPPER(COALESCE(@se_legacy_type, '')) = 'BTREE'
                    AND COALESCE(@se_legacy_visible_parts, 0) = @se_legacy_parts
                    AND COALESCE(@se_legacy_collations, '') = 'A'
                    AND COALESCE(@se_legacy_collation_nulls, 0) = 0)
          THEN 1 ELSE 0 END);
SET @sql := IF(@se_bad_definitions > 0,
  'SELECT `MIGRATION_207_FAIL_CLOSED_index_definition_mismatch` FROM DUAL',
  'SELECT 1 AS preflight_ok');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Converge (each step is a no-op when its target already holds) ─────────

-- 2a. FK-supporting index on entitlement_id. Must exist BEFORE 2c.
SET @sql := IF(@se_idx_parts = 0,
  'ALTER TABLE `settlement_entitlements` ADD INDEX `idx_se_entitlement` (`entitlement_id`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2b. Pair-level uniqueness (settlement_id, entitlement_id) — exact order.
SET @sql := IF(@se_pair_parts = 0,
  'ALTER TABLE `settlement_entitlements` ADD UNIQUE KEY `uk_se_settlement_entitlement` (`settlement_id`, `entitlement_id`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2c. Drop the legacy global unique key — only when it exists in the exact
--     expected legacy shape (validated in step 1). On abort it is never touched.
SET @sql := IF(@se_legacy_parts > 0,
  'ALTER TABLE `settlement_entitlements` DROP INDEX `uk_se_entitlement`',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Post-condition proof — never assume the final shape was reached ───────
SELECT COUNT(*),
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),
       MAX(NON_UNIQUE),
       MAX(SUB_PART),
       SUM(CASE WHEN EXPRESSION IS NOT NULL THEN 1 ELSE 0 END),
       MAX(INDEX_TYPE),
       SUM(CASE WHEN IS_VISIBLE = 'YES' THEN 1 ELSE 0 END),
       GROUP_CONCAT(COLLATION ORDER BY SEQ_IN_INDEX),
       SUM(CASE WHEN COLLATION IS NULL THEN 1 ELSE 0 END)
  INTO @se_post_idx_parts, @se_post_idx_columns, @se_post_idx_unique, @se_post_idx_sub_part,
       @se_post_idx_expr_parts, @se_post_idx_type, @se_post_idx_visible_parts,
       @se_post_idx_collations, @se_post_idx_collation_nulls
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'idx_se_entitlement';

SELECT COUNT(*),
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),
       MAX(NON_UNIQUE),
       MAX(SUB_PART),
       SUM(CASE WHEN EXPRESSION IS NOT NULL THEN 1 ELSE 0 END),
       MAX(INDEX_TYPE),
       SUM(CASE WHEN IS_VISIBLE = 'YES' THEN 1 ELSE 0 END),
       GROUP_CONCAT(COLLATION ORDER BY SEQ_IN_INDEX),
       SUM(CASE WHEN COLLATION IS NULL THEN 1 ELSE 0 END)
  INTO @se_post_pair_parts, @se_post_pair_columns, @se_post_pair_unique, @se_post_pair_sub_part,
       @se_post_pair_expr_parts, @se_post_pair_type, @se_post_pair_visible_parts,
       @se_post_pair_collations, @se_post_pair_collation_nulls
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'uk_se_settlement_entitlement';

SELECT COUNT(*)
  INTO @se_post_legacy_parts
  FROM information_schema.statistics
 WHERE table_schema = DATABASE()
   AND table_name = 'settlement_entitlements'
   AND index_name = 'uk_se_entitlement';

SET @se_post_ok := (@se_post_idx_parts = 1
                    AND COALESCE(@se_post_idx_columns, '') = 'entitlement_id'
                    AND @se_post_idx_unique = 1
                    AND @se_post_idx_sub_part IS NULL
                    AND COALESCE(@se_post_idx_expr_parts, 0) = 0
                    AND UPPER(COALESCE(@se_post_idx_type, '')) = 'BTREE'
                    AND COALESCE(@se_post_idx_visible_parts, 0) = @se_post_idx_parts
                    AND COALESCE(@se_post_idx_collations, '') = 'A'
                    AND COALESCE(@se_post_idx_collation_nulls, 0) = 0
                    AND @se_post_pair_parts = 2
                    AND COALESCE(@se_post_pair_columns, '') = 'settlement_id,entitlement_id'
                    AND @se_post_pair_unique = 0
                    AND @se_post_pair_sub_part IS NULL
                    AND COALESCE(@se_post_pair_expr_parts, 0) = 0
                    AND UPPER(COALESCE(@se_post_pair_type, '')) = 'BTREE'
                    AND COALESCE(@se_post_pair_visible_parts, 0) = @se_post_pair_parts
                    AND COALESCE(@se_post_pair_collations, '') = 'A,A'
                    AND COALESCE(@se_post_pair_collation_nulls, 0) = 0
                    AND @se_post_legacy_parts = 0);
SET @sql := IF(@se_post_ok,
  'SELECT 1 AS postcondition_ok',
  'SELECT `MIGRATION_207_FAIL_CLOSED_postcondition_not_met` FROM DUAL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
