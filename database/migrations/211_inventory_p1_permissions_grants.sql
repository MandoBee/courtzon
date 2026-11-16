-- 211_inventory_p1_permissions_grants.sql
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- P1 — Organisation-scoped Inventory: complete the production permission set.
--
-- Adds ONLY:
--   * the 8 missing granular Inventory permissions (module slug = 'inventory')
--   * the 47 missing grants across the 7 GLOBAL roles defined by the templates
--     (backend/scripts/role-permission-templates.mjs mirrors
--      backend/src/modules/rbac/domain/org-permission-policy.ts)
--
-- Fail-closed preconditions (key-level, inside the transaction):
--   1. exactly one ACTIVE permission_modules row with slug='inventory'
--   2. exactly one ACTIVE GLOBAL role per target slug
--   3. the module holds EXACTLY the 8 baseline `inventory.*` keys
--   4. the module holds EXACTLY the 5 `sidebar.inventory*` keys
--   5. zero Inventory grants on organisation-scoped roles
--   6. starting grant counts for the SEVEN target roles are exactly
--      8 / 0 / 0 / 0 / 0 / 4 / 4  (total 16)
--
-- Exact expected end state (key-level, not counts alone):
--   * 16 `inventory.*` keys = the exact expected set (none missing, none extra)
--   * 5 `sidebar.inventory*` keys preserved
--   * each role's grant set equals its exact template set:
--       16 / 15 / 9 / 6 / 3 / 7 / 7   (total 63)
--   * 0 Inventory grants on organisation-scoped roles
--   * the 8 inserted rows match the frontend registry metadata field by field
--
-- Concurrency design:
--   * `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;` is issued OUTSIDE this
--     procedure, immediately before `CALL migration_211();` (no statement in
--     between). It applies to the next transaction — the one started by the
--     `START TRANSACTION` below — and pins RR so that gap (next-key) locking is
--     available.
--   * The first executable statement of the procedure is START TRANSACTION.
--   * Module row, seven role rows, the module's permission catalog and the
--     seven roles' grants are locked with `FOR UPDATE` (FORCE INDEX where the
--     range matters) BEFORE the first ordinary consistent read, so the snapshot
--     is only created once the relevant sets are stable.
--
-- Single-shot by design (ROW_COUNT must be exactly 8 and 47); the runner
-- records `up` and never re-executes it.
--
-- No `-- DOWN:` section is provided on purpose: the schema has no column that
-- records which migration created a role_permissions row, so an automated
-- rollback could not prove ownership. See the notes at the end of this file.
-- ============================================================================

DELIMITER $$

CREATE PROCEDURE migration_211() SQL SECURITY INVOKER
BEGIN
  DECLARE v_module_id        INT DEFAULT 0;
  DECLARE v_module_count     INT DEFAULT 0;

  DECLARE v_role_super       INT DEFAULT 0;
  DECLARE v_role_org_admin   INT DEFAULT 0;
  DECLARE v_role_mm          INT DEFAULT 0;
  DECLARE v_role_accountant  INT DEFAULT 0;
  DECLARE v_role_receptionist INT DEFAULT 0;
  DECLARE v_role_auditor     INT DEFAULT 0;
  DECLARE v_role_read_only   INT DEFAULT 0;

  DECLARE v_bad              INT DEFAULT 0;
  DECLARE v_extra            INT DEFAULT 0;
  DECLARE v_key_count        INT DEFAULT 0;
  DECLARE v_sidebar_count    INT DEFAULT 0;

  DECLARE v_org_grants       INT DEFAULT 0;
  DECLARE v_total_grants     INT DEFAULT 0;
  DECLARE v_outside          INT DEFAULT 0;

  DECLARE v_super            INT DEFAULT 0;
  DECLARE v_org_admin        INT DEFAULT 0;
  DECLARE v_mm               INT DEFAULT 0;
  DECLARE v_accountant       INT DEFAULT 0;
  DECLARE v_receptionist     INT DEFAULT 0;
  DECLARE v_auditor          INT DEFAULT 0;
  DECLARE v_read_only        INT DEFAULT 0;

  DECLARE v_miss_super       INT DEFAULT 0;
  DECLARE v_miss_org_admin   INT DEFAULT 0;
  DECLARE v_miss_mm          INT DEFAULT 0;
  DECLARE v_miss_accountant  INT DEFAULT 0;
  DECLARE v_miss_receptionist INT DEFAULT 0;
  DECLARE v_miss_auditor     INT DEFAULT 0;
  DECLARE v_miss_read_only   INT DEFAULT 0;

  DECLARE v_inserted_keys    INT DEFAULT 0;
  DECLARE v_inserted_grants  INT DEFAULT 0;
  DECLARE v_meta_mismatch    INT DEFAULT 0;

  -- Any SQL error (SIGNAL included) rolls the DML back and is re-raised, so the
  -- migration runner sees a non-zero exit and records `failed`.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- First executable statement: the transaction whose isolation was pinned by
  -- the `SET TRANSACTION` immediately before CALL.
  START TRANSACTION;

  -- ── 0. LOCKING PHASE (current reads; no snapshot is created here) ─────────

  -- 0.1 Inventory module: unique search on UNIQUE(slug) -> record lock.
  --     No LIMIT 1: a duplicate slug must raise 1172 and abort instead of
  --     silently picking one row.
  SELECT id INTO v_module_id
    FROM permission_modules
   WHERE slug = 'inventory' AND is_active = 1
   FOR UPDATE;
  IF v_module_id IS NULL OR v_module_id = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: inventory permission_module missing or not lockable';
  END IF;

  -- 0.2 Seven roles: unique search on UNIQUE(slug) -> record locks.
  SELECT id INTO v_role_super FROM roles
   WHERE slug = 'super_admin' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_super IS NULL OR v_role_super = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: super_admin is not one active global role';
  END IF;

  SELECT id INTO v_role_org_admin FROM roles
   WHERE slug = 'org-admin' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_org_admin IS NULL OR v_role_org_admin = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: org-admin is not one active global role';
  END IF;

  SELECT id INTO v_role_mm FROM roles
   WHERE slug = 'marketplace-manager' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_mm IS NULL OR v_role_mm = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: marketplace-manager is not one active global role';
  END IF;

  SELECT id INTO v_role_accountant FROM roles
   WHERE slug = 'accountant' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_accountant IS NULL OR v_role_accountant = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: accountant is not one active global role';
  END IF;

  SELECT id INTO v_role_receptionist FROM roles
   WHERE slug = 'receptionist' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_receptionist IS NULL OR v_role_receptionist = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: receptionist is not one active global role';
  END IF;

  SELECT id INTO v_role_auditor FROM roles
   WHERE slug = 'auditor' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_auditor IS NULL OR v_role_auditor = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: auditor is not one active global role';
  END IF;

  SELECT id INTO v_role_read_only FROM roles
   WHERE slug = 'read-only-admin' AND organisation_id IS NULL
     AND is_active = 1 AND deleted_at IS NULL FOR UPDATE;
  IF v_role_read_only IS NULL OR v_role_read_only = 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: read-only-admin is not one active global role';
  END IF;

  -- 0.3 Permission catalog of THIS module: range access on fk_perm_module
  --     (rows + gap locks for module_id = v_module_id; no full-table scan).
  SELECT id
    FROM permissions FORCE INDEX (fk_perm_module)
   WHERE module_id = v_module_id
   FOR UPDATE;

  -- 0.4 Existing grants of the SEVEN roles: range access on uk_role_perm.
  --     Equality on the leading column only is NOT a unique search, so InnoDB
  --     takes next-key (record + gap) locks per role_id — including roles that
  --     currently hold zero rows.
  SELECT id
    FROM role_permissions FORCE INDEX (uk_role_perm)
   WHERE role_id IN (v_role_super, v_role_org_admin, v_role_mm, v_role_accountant,
                     v_role_receptionist, v_role_auditor, v_role_read_only)
     FOR UPDATE;

  -- ── 1. PRECONDITIONS ─────────────────────────────────────────────────────

  -- 1.1 The first ordinary consistent read: the snapshot is created HERE,
  --     after every lock above has been acquired.
  SELECT COUNT(*) INTO v_module_count
    FROM permission_modules
   WHERE slug = 'inventory' AND is_active = 1;
  IF v_module_count <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: expected exactly one active inventory permission_module';
  END IF;

  -- 1.2 BASELINE SET: exactly the 8 expected keys, attached to this module.
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT 'inventory.warehouses.view' AS k UNION ALL
    SELECT 'inventory.warehouses.manage'        UNION ALL
    SELECT 'inventory.suppliers.view'           UNION ALL
    SELECT 'inventory.suppliers.manage'         UNION ALL
    SELECT 'inventory.purchase-orders.view'     UNION ALL
    SELECT 'inventory.purchase-orders.manage'   UNION ALL
    SELECT 'inventory.stock.view'               UNION ALL
    SELECT 'inventory.stock.manage'
  ) AS b
  WHERE NOT EXISTS (
    SELECT 1 FROM permissions p
     WHERE p.permission_key = b.k AND p.module_id = v_module_id
  );
  IF v_bad <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: a baseline inventory key is missing or on another module';
  END IF;

  SELECT COUNT(*) INTO v_extra
    FROM permissions p
   WHERE p.module_id = v_module_id
     AND p.permission_key LIKE 'inventory.%'
     AND p.permission_key NOT IN (
       'inventory.warehouses.view','inventory.warehouses.manage',
       'inventory.suppliers.view','inventory.suppliers.manage',
       'inventory.purchase-orders.view','inventory.purchase-orders.manage',
       'inventory.stock.view','inventory.stock.manage');
  IF v_extra <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: unexpected inventory keys exist before insert';
  END IF;

  SELECT COUNT(*) INTO v_key_count
    FROM permissions
   WHERE module_id = v_module_id AND permission_key LIKE 'inventory.%';
  IF v_key_count <> 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: expected exactly 8 inventory keys before insert';
  END IF;

  -- 1.3 SIDEBAR SET: exactly the 5 expected keys (must be preserved).
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT 'sidebar.inventory' AS k UNION ALL
    SELECT 'sidebar.inventory-stock'       UNION ALL
    SELECT 'sidebar.inventory-warehouses'  UNION ALL
    SELECT 'sidebar.inventory-suppliers'   UNION ALL
    SELECT 'sidebar.inventory-purchase-orders'
  ) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM permissions p
     WHERE p.permission_key = s.k AND p.module_id = v_module_id
  );
  IF v_bad <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: a sidebar.inventory key is missing or on another module';
  END IF;

  SELECT COUNT(*) INTO v_extra
    FROM permissions p
   WHERE p.module_id = v_module_id
     AND p.permission_key LIKE 'sidebar.inventory%'
     AND p.permission_key NOT IN (
       'sidebar.inventory','sidebar.inventory-stock',
       'sidebar.inventory-warehouses','sidebar.inventory-suppliers',
       'sidebar.inventory-purchase-orders');
  IF v_extra <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: unexpected sidebar.inventory keys exist before insert';
  END IF;

  SELECT COUNT(*) INTO v_sidebar_count
    FROM permissions
   WHERE module_id = v_module_id AND permission_key LIKE 'sidebar.inventory%';
  IF v_sidebar_count <> 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: expected exactly 5 sidebar.inventory keys before insert';
  END IF;

  -- 1.4 No organisation-scoped role may already hold Inventory grants.
  SELECT COUNT(*) INTO v_org_grants
    FROM role_permissions rp
    JOIN roles r       ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.organisation_id IS NOT NULL
     AND p.module_id = v_module_id AND p.permission_key LIKE 'inventory.%';
  IF v_org_grants <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: org-scoped roles already hold inventory grants';
  END IF;

  -- 1.5 Starting counts — restricted to the SEVEN target roles only.
  SELECT
    COUNT(CASE WHEN r.slug = 'super_admin'         THEN 1 END),
    COUNT(CASE WHEN r.slug = 'org-admin'           THEN 1 END),
    COUNT(CASE WHEN r.slug = 'marketplace-manager' THEN 1 END),
    COUNT(CASE WHEN r.slug = 'accountant'          THEN 1 END),
    COUNT(CASE WHEN r.slug = 'receptionist'        THEN 1 END),
    COUNT(CASE WHEN r.slug = 'auditor'             THEN 1 END),
    COUNT(CASE WHEN r.slug = 'read-only-admin'     THEN 1 END)
  INTO v_super, v_org_admin, v_mm, v_accountant, v_receptionist, v_auditor, v_read_only
  FROM role_permissions rp
  JOIN roles r       ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
    AND r.slug IN ('super_admin','org-admin','marketplace-manager','accountant',
                   'receptionist','auditor','read-only-admin')
    AND p.module_id = v_module_id AND p.permission_key LIKE 'inventory.%';

  IF v_super <> 8 OR v_org_admin <> 0 OR v_mm <> 0 OR v_accountant <> 0
     OR v_receptionist <> 0 OR v_auditor <> 4 OR v_read_only <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: unexpected starting counts (expected 8/0/0/0/0/4/4)';
  END IF;

  -- ── 2. DML ───────────────────────────────────────────────────────────────

  -- 2.1 The 8 missing permissions (module resolved by slug, never by ID).
  INSERT IGNORE INTO permissions
    (module_id, permission_key, description, element_type, element_label,
     is_ui_element, component_path)
  SELECT v_module_id, v.permission_key,
         CONCAT('Controls visibility of "', v.element_label, '" (', v.element_type, ')'),
         v.element_type, v.element_label, TRUE,
         'pages/admin/inventory/InventoryPage.tsx'
  FROM (
    SELECT 'inventory.stock.adjust'      AS permission_key, 'Adjust Stock'           AS element_label, 'button' AS element_type UNION ALL
    SELECT 'inventory.transfers.view',      'View Stock Transfers',    'tab'    UNION ALL
    SELECT 'inventory.transfers.create',    'Create Stock Transfer',   'button' UNION ALL
    SELECT 'inventory.transfers.complete',  'Complete Stock Transfer', 'button' UNION ALL
    SELECT 'inventory.transfers.cancel',    'Cancel Stock Transfer',   'button' UNION ALL
    SELECT 'inventory.logs.view',           'View Inventory Logs',     'tab'    UNION ALL
    SELECT 'inventory.reports.view',        'View Inventory Reports',  'page'   UNION ALL
    SELECT 'inventory.reports.export',      'Export Inventory Reports','button'
  ) AS v;

  SELECT ROW_COUNT() INTO v_inserted_keys;

  -- 2.2 The 47 grants (roles by slug; global + active + not deleted).
  INSERT IGNORE INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM (
    -- org-admin (15)
    SELECT 'org-admin' AS role_slug, 'inventory.warehouses.view' AS permission_key UNION ALL
    SELECT 'org-admin','inventory.warehouses.manage'        UNION ALL
    SELECT 'org-admin','inventory.suppliers.view'           UNION ALL
    SELECT 'org-admin','inventory.suppliers.manage'         UNION ALL
    SELECT 'org-admin','inventory.purchase-orders.view'     UNION ALL
    SELECT 'org-admin','inventory.purchase-orders.manage'   UNION ALL
    SELECT 'org-admin','inventory.stock.view'               UNION ALL
    SELECT 'org-admin','inventory.stock.adjust'             UNION ALL
    SELECT 'org-admin','inventory.transfers.view'           UNION ALL
    SELECT 'org-admin','inventory.transfers.create'         UNION ALL
    SELECT 'org-admin','inventory.transfers.complete'       UNION ALL
    SELECT 'org-admin','inventory.transfers.cancel'         UNION ALL
    SELECT 'org-admin','inventory.logs.view'                UNION ALL
    SELECT 'org-admin','inventory.reports.view'             UNION ALL
    SELECT 'org-admin','inventory.reports.export'           UNION ALL
    -- marketplace-manager (9)
    SELECT 'marketplace-manager','inventory.warehouses.view'    UNION ALL
    SELECT 'marketplace-manager','inventory.warehouses.manage'  UNION ALL
    SELECT 'marketplace-manager','inventory.stock.view'         UNION ALL
    SELECT 'marketplace-manager','inventory.stock.adjust'       UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.view'     UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.create'   UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.complete' UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.cancel'   UNION ALL
    SELECT 'marketplace-manager','inventory.logs.view'          UNION ALL
    -- accountant (6)
    SELECT 'accountant','inventory.warehouses.view'  UNION ALL
    SELECT 'accountant','inventory.stock.view'       UNION ALL
    SELECT 'accountant','inventory.transfers.view'   UNION ALL
    SELECT 'accountant','inventory.logs.view'        UNION ALL
    SELECT 'accountant','inventory.reports.view'     UNION ALL
    SELECT 'accountant','inventory.reports.export'   UNION ALL
    -- receptionist (3)
    SELECT 'receptionist','inventory.warehouses.view' UNION ALL
    SELECT 'receptionist','inventory.stock.view'      UNION ALL
    SELECT 'receptionist','inventory.transfers.view'  UNION ALL
    -- super_admin (8): the 8 baseline keys (incl. inventory.stock.manage) already held
    SELECT 'super_admin','inventory.stock.adjust'       UNION ALL
    SELECT 'super_admin','inventory.transfers.view'     UNION ALL
    SELECT 'super_admin','inventory.transfers.create'   UNION ALL
    SELECT 'super_admin','inventory.transfers.complete' UNION ALL
    SELECT 'super_admin','inventory.transfers.cancel'   UNION ALL
    SELECT 'super_admin','inventory.logs.view'          UNION ALL
    SELECT 'super_admin','inventory.reports.view'       UNION ALL
    SELECT 'super_admin','inventory.reports.export'     UNION ALL
    -- auditor (3): the 4 read views already held
    SELECT 'auditor','inventory.transfers.view' UNION ALL
    SELECT 'auditor','inventory.logs.view'      UNION ALL
    SELECT 'auditor','inventory.reports.view'   UNION ALL
    -- read-only-admin (3): the 4 read views already held
    SELECT 'read-only-admin','inventory.transfers.view' UNION ALL
    SELECT 'read-only-admin','inventory.logs.view'      UNION ALL
    SELECT 'read-only-admin','inventory.reports.view'
  ) AS expected_pairs
  JOIN roles r
    ON r.slug = expected_pairs.role_slug
   AND r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
  JOIN permissions p
    ON p.permission_key = expected_pairs.permission_key
   AND p.module_id = v_module_id;

  SELECT ROW_COUNT() INTO v_inserted_grants;

  -- ── 3. POSTCONDITIONS ────────────────────────────────────────────────────

  -- 3.1 Exactly 8 permission rows and exactly 47 grant rows were inserted.
  IF v_inserted_keys <> 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: inserted permission row count is not 8';
  END IF;
  IF v_inserted_grants <> 47 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: inserted grant row count is not 47';
  END IF;

  -- 3.2 Metadata matches the frontend registry field by field.
  SELECT COUNT(*) INTO v_meta_mismatch
  FROM (
    SELECT 'inventory.stock.adjust' AS k, 'button' AS t, 'Adjust Stock' AS l UNION ALL
    SELECT 'inventory.transfers.view','tab','View Stock Transfers' UNION ALL
    SELECT 'inventory.transfers.create','button','Create Stock Transfer' UNION ALL
    SELECT 'inventory.transfers.complete','button','Complete Stock Transfer' UNION ALL
    SELECT 'inventory.transfers.cancel','button','Cancel Stock Transfer' UNION ALL
    SELECT 'inventory.logs.view','tab','View Inventory Logs' UNION ALL
    SELECT 'inventory.reports.view','page','View Inventory Reports' UNION ALL
    SELECT 'inventory.reports.export','button','Export Inventory Reports'
  ) AS e
  JOIN permissions p ON p.permission_key = e.k
  WHERE p.module_id <> v_module_id
     OR p.element_type <> e.t
     OR p.element_label <> e.l
     OR p.component_path <> 'pages/admin/inventory/InventoryPage.tsx'
     OR p.is_ui_element <> 1
     OR p.is_system <> 0
     OR p.description <> CONCAT('Controls visibility of "', e.l, '" (', e.t, ')');
  IF v_meta_mismatch <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: permission metadata does not match the frontend registry';
  END IF;

  -- 3.3 FINAL 16-key set (exact): none missing, none unexpected.
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT 'inventory.warehouses.view' AS k UNION ALL
    SELECT 'inventory.warehouses.manage'        UNION ALL
    SELECT 'inventory.suppliers.view'           UNION ALL
    SELECT 'inventory.suppliers.manage'         UNION ALL
    SELECT 'inventory.purchase-orders.view'     UNION ALL
    SELECT 'inventory.purchase-orders.manage'   UNION ALL
    SELECT 'inventory.stock.view'               UNION ALL
    SELECT 'inventory.stock.adjust'             UNION ALL
    SELECT 'inventory.transfers.view'           UNION ALL
    SELECT 'inventory.transfers.create'         UNION ALL
    SELECT 'inventory.transfers.complete'       UNION ALL
    SELECT 'inventory.transfers.cancel'         UNION ALL
    SELECT 'inventory.logs.view'                UNION ALL
    SELECT 'inventory.reports.view'             UNION ALL
    SELECT 'inventory.reports.export'           UNION ALL
    SELECT 'inventory.stock.manage'
  ) AS f
  WHERE NOT EXISTS (
    SELECT 1 FROM permissions p
     WHERE p.permission_key = f.k AND p.module_id = v_module_id
  );
  IF v_bad <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: an expected inventory key is missing after insert';
  END IF;

  SELECT COUNT(*) INTO v_extra
    FROM permissions p
   WHERE p.module_id = v_module_id
     AND p.permission_key LIKE 'inventory.%'
     AND p.permission_key NOT IN (
       'inventory.warehouses.view','inventory.warehouses.manage',
       'inventory.suppliers.view','inventory.suppliers.manage',
       'inventory.purchase-orders.view','inventory.purchase-orders.manage',
       'inventory.stock.view','inventory.stock.adjust',
       'inventory.transfers.view','inventory.transfers.create',
       'inventory.transfers.complete','inventory.transfers.cancel',
       'inventory.logs.view','inventory.reports.view',
       'inventory.reports.export','inventory.stock.manage');
  IF v_extra <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: unexpected inventory keys exist after insert';
  END IF;

  SELECT COUNT(*) INTO v_key_count
    FROM permissions
   WHERE module_id = v_module_id AND permission_key LIKE 'inventory.%';
  IF v_key_count <> 16 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: inventory key count is not 16 after insert';
  END IF;

  -- 3.4 SIDEBAR SET preserved (exact set + count).
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT 'sidebar.inventory' AS k UNION ALL
    SELECT 'sidebar.inventory-stock'       UNION ALL
    SELECT 'sidebar.inventory-warehouses'  UNION ALL
    SELECT 'sidebar.inventory-suppliers'   UNION ALL
    SELECT 'sidebar.inventory-purchase-orders'
  ) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM permissions p
     WHERE p.permission_key = s.k AND p.module_id = v_module_id
  );
  IF v_bad <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: a sidebar.inventory key was removed or moved';
  END IF;

  SELECT COUNT(*) INTO v_sidebar_count
    FROM permissions
   WHERE module_id = v_module_id AND permission_key LIKE 'sidebar.inventory%';
  IF v_sidebar_count <> 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: sidebar.inventory key count changed (expected 5)';
  END IF;

  -- 3.5 KEY-LEVEL: no expected grant is missing, over the COMPLETE 63-pair set
  --     per role (pre-existing baseline grants included, not only the new 47).
  SELECT
    COUNT(CASE WHEN e.role_slug = 'super_admin'         AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'org-admin'           AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'marketplace-manager' AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'accountant'          AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'receptionist'        AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'auditor'             AND rp.id IS NULL THEN 1 END),
    COUNT(CASE WHEN e.role_slug = 'read-only-admin'     AND rp.id IS NULL THEN 1 END)
  INTO v_miss_super, v_miss_org_admin, v_miss_mm, v_miss_accountant,
       v_miss_receptionist, v_miss_auditor, v_miss_read_only
  FROM (
    -- super_admin (16)
    SELECT 'super_admin' AS role_slug, 'inventory.warehouses.view' AS permission_key UNION ALL
    SELECT 'super_admin','inventory.warehouses.manage'      UNION ALL
    SELECT 'super_admin','inventory.suppliers.view'         UNION ALL
    SELECT 'super_admin','inventory.suppliers.manage'       UNION ALL
    SELECT 'super_admin','inventory.purchase-orders.view'   UNION ALL
    SELECT 'super_admin','inventory.purchase-orders.manage' UNION ALL
    SELECT 'super_admin','inventory.stock.view'             UNION ALL
    SELECT 'super_admin','inventory.stock.adjust'           UNION ALL
    SELECT 'super_admin','inventory.transfers.view'         UNION ALL
    SELECT 'super_admin','inventory.transfers.create'       UNION ALL
    SELECT 'super_admin','inventory.transfers.complete'     UNION ALL
    SELECT 'super_admin','inventory.transfers.cancel'       UNION ALL
    SELECT 'super_admin','inventory.logs.view'              UNION ALL
    SELECT 'super_admin','inventory.reports.view'           UNION ALL
    SELECT 'super_admin','inventory.reports.export'         UNION ALL
    SELECT 'super_admin','inventory.stock.manage'           UNION ALL
    -- org-admin (15)
    SELECT 'org-admin','inventory.warehouses.view'          UNION ALL
    SELECT 'org-admin','inventory.warehouses.manage'        UNION ALL
    SELECT 'org-admin','inventory.suppliers.view'           UNION ALL
    SELECT 'org-admin','inventory.suppliers.manage'         UNION ALL
    SELECT 'org-admin','inventory.purchase-orders.view'     UNION ALL
    SELECT 'org-admin','inventory.purchase-orders.manage'   UNION ALL
    SELECT 'org-admin','inventory.stock.view'               UNION ALL
    SELECT 'org-admin','inventory.stock.adjust'             UNION ALL
    SELECT 'org-admin','inventory.transfers.view'           UNION ALL
    SELECT 'org-admin','inventory.transfers.create'         UNION ALL
    SELECT 'org-admin','inventory.transfers.complete'       UNION ALL
    SELECT 'org-admin','inventory.transfers.cancel'         UNION ALL
    SELECT 'org-admin','inventory.logs.view'                UNION ALL
    SELECT 'org-admin','inventory.reports.view'             UNION ALL
    SELECT 'org-admin','inventory.reports.export'           UNION ALL
    -- marketplace-manager (9)
    SELECT 'marketplace-manager','inventory.warehouses.view'    UNION ALL
    SELECT 'marketplace-manager','inventory.warehouses.manage'  UNION ALL
    SELECT 'marketplace-manager','inventory.stock.view'         UNION ALL
    SELECT 'marketplace-manager','inventory.stock.adjust'       UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.view'     UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.create'   UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.complete' UNION ALL
    SELECT 'marketplace-manager','inventory.transfers.cancel'   UNION ALL
    SELECT 'marketplace-manager','inventory.logs.view'          UNION ALL
    -- accountant (6)
    SELECT 'accountant','inventory.warehouses.view' UNION ALL
    SELECT 'accountant','inventory.stock.view'      UNION ALL
    SELECT 'accountant','inventory.transfers.view'  UNION ALL
    SELECT 'accountant','inventory.logs.view'       UNION ALL
    SELECT 'accountant','inventory.reports.view'    UNION ALL
    SELECT 'accountant','inventory.reports.export'  UNION ALL
    -- receptionist (3)
    SELECT 'receptionist','inventory.warehouses.view' UNION ALL
    SELECT 'receptionist','inventory.stock.view'      UNION ALL
    SELECT 'receptionist','inventory.transfers.view'  UNION ALL
    -- auditor (7)
    SELECT 'auditor','inventory.warehouses.view'      UNION ALL
    SELECT 'auditor','inventory.suppliers.view'       UNION ALL
    SELECT 'auditor','inventory.purchase-orders.view' UNION ALL
    SELECT 'auditor','inventory.stock.view'           UNION ALL
    SELECT 'auditor','inventory.transfers.view'       UNION ALL
    SELECT 'auditor','inventory.logs.view'            UNION ALL
    SELECT 'auditor','inventory.reports.view'         UNION ALL
    -- read-only-admin (7)
    SELECT 'read-only-admin','inventory.warehouses.view'      UNION ALL
    SELECT 'read-only-admin','inventory.suppliers.view'       UNION ALL
    SELECT 'read-only-admin','inventory.purchase-orders.view' UNION ALL
    SELECT 'read-only-admin','inventory.stock.view'           UNION ALL
    SELECT 'read-only-admin','inventory.transfers.view'       UNION ALL
    SELECT 'read-only-admin','inventory.logs.view'            UNION ALL
    SELECT 'read-only-admin','inventory.reports.view'
  ) AS e
  JOIN roles r
    ON r.slug = e.role_slug
   AND r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
  JOIN permissions p
    ON p.permission_key = e.permission_key AND p.module_id = v_module_id
  LEFT JOIN role_permissions rp
    ON rp.role_id = r.id AND rp.permission_id = p.id;

  IF v_miss_super <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: super_admin is missing expected inventory grants'; END IF;
  IF v_miss_org_admin <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: org-admin is missing expected inventory grants'; END IF;
  IF v_miss_mm <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: marketplace-manager is missing expected inventory grants'; END IF;
  IF v_miss_accountant <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: accountant is missing expected inventory grants'; END IF;
  IF v_miss_receptionist <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: receptionist is missing expected inventory grants'; END IF;
  IF v_miss_auditor <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: auditor is missing expected inventory grants'; END IF;
  IF v_miss_read_only <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
    'migration_211: read-only-admin is missing expected inventory grants'; END IF;

  -- 3.6 No grant outside the 16-key universe (catches ANY unexpected grant,
  --     including inventory.* keys attached to a different module).
  SELECT COUNT(*) INTO v_outside
    FROM role_permissions rp
    JOIN roles r       ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
     AND r.slug IN ('super_admin','org-admin','marketplace-manager','accountant',
                    'receptionist','auditor','read-only-admin')
     AND p.permission_key LIKE 'inventory.%'
     AND p.permission_key NOT IN (
       'inventory.warehouses.view','inventory.warehouses.manage',
       'inventory.suppliers.view','inventory.suppliers.manage',
       'inventory.purchase-orders.view','inventory.purchase-orders.manage',
       'inventory.stock.view','inventory.stock.adjust',
       'inventory.transfers.view','inventory.transfers.create',
       'inventory.transfers.complete','inventory.transfers.cancel',
       'inventory.logs.view','inventory.reports.view',
       'inventory.reports.export','inventory.stock.manage');
  IF v_outside <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: an inventory grant exists outside the 16-key universe';
  END IF;

  -- 3.7 Per-role totals must equal the template size. Combined with
  --     "missing = 0" (3.5) and the universe check (3.6) this proves EXACT set
  --     equality:
  --       unexpected = total - (expected - missing) = total - expected = 0
  SELECT
    COUNT(CASE WHEN r.slug = 'super_admin'         THEN 1 END),
    COUNT(CASE WHEN r.slug = 'org-admin'           THEN 1 END),
    COUNT(CASE WHEN r.slug = 'marketplace-manager' THEN 1 END),
    COUNT(CASE WHEN r.slug = 'accountant'          THEN 1 END),
    COUNT(CASE WHEN r.slug = 'receptionist'        THEN 1 END),
    COUNT(CASE WHEN r.slug = 'auditor'             THEN 1 END),
    COUNT(CASE WHEN r.slug = 'read-only-admin'     THEN 1 END)
  INTO v_super, v_org_admin, v_mm, v_accountant, v_receptionist, v_auditor, v_read_only
  FROM role_permissions rp
  JOIN roles r       ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
    AND r.slug IN ('super_admin','org-admin','marketplace-manager','accountant',
                   'receptionist','auditor','read-only-admin')
    AND p.module_id = v_module_id AND p.permission_key LIKE 'inventory.%';

  IF v_super      - (16 - v_miss_super)      <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: super_admin has unexpected inventory grants'; END IF;
  IF v_org_admin  - (15 - v_miss_org_admin)  <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: org-admin has unexpected inventory grants'; END IF;
  IF v_mm         - (9  - v_miss_mm)         <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: marketplace-manager has unexpected inventory grants'; END IF;
  IF v_accountant - (6  - v_miss_accountant) <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: accountant has unexpected inventory grants'; END IF;
  IF v_receptionist - (3 - v_miss_receptionist) <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: receptionist has unexpected inventory grants'; END IF;
  IF v_auditor    - (7  - v_miss_auditor)    <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: auditor has unexpected inventory grants'; END IF;
  IF v_read_only  - (7  - v_miss_read_only)  <> 0 THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'migration_211: read-only-admin has unexpected inventory grants'; END IF;

  -- 3.8 Organisation-scoped roles still hold zero Inventory grants.
  SELECT COUNT(*) INTO v_org_grants
    FROM role_permissions rp
    JOIN roles r       ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.organisation_id IS NOT NULL
     AND p.module_id = v_module_id AND p.permission_key LIKE 'inventory.%';
  IF v_org_grants <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: org-scoped roles received inventory grants';
  END IF;

  -- 3.9 Exactly 63 relationships across the seven target roles.
  SELECT COUNT(*) INTO v_total_grants
    FROM role_permissions rp
    JOIN roles r       ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.organisation_id IS NULL AND r.is_active = 1 AND r.deleted_at IS NULL
     AND r.slug IN ('super_admin','org-admin','marketplace-manager','accountant',
                    'receptionist','auditor','read-only-admin')
     AND p.module_id = v_module_id AND p.permission_key LIKE 'inventory.%';
  IF v_total_grants <> 63 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'migration_211: total inventory grants <> 63 after insert';
  END IF;

  COMMIT;
END$$

DELIMITER ;

-- Isolation for the transaction started inside the procedure. This statement
-- applies to the NEXT transaction only. No SQL statement may be placed between
-- this line and CALL (in autocommit mode any intervening statement would be its
-- own transaction and would consume this setting).
-- DELIMITER above is a client directive and is not sent to the server.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

CALL migration_211();

-- Reached only when CALL succeeded (a failed CALL leaves the routine in place
-- on purpose, so a retry cannot silently reuse a stale definition).

-- ============================================================================
-- ROLLBACK — intentionally NOT provided as executable SQL.
--
-- The schema records no migration ownership on permissions / role_permissions
-- (no created_by / migration_id column), so no automated script can prove that
-- a given grant was created by 211 rather than by a later manual assignment.
-- A DELETE-based `-- DOWN:` section could remove grants this migration never
-- created. `scripts/migrate.sh --rollback 211_...` will therefore refuse to run
-- (no `-- DOWN:` section present in this file).
--
-- Manual rollback (separate review + explicit approval; never automated):
--   1. Read-only inspection of the Inventory permission rows and the grants of
--      the seven global roles.
--   2. Confirm migration_history shows 211 as the latest `up` for this file.
--   3. Confirm no later grant, migration or role template depends on the 8 keys.
--   4. Take a verified backup and record the pre-change counts.
--   5. Obtain explicit written approval for the exact DELETE statements.
--   6. Execute, then re-verify counts.
-- Ownership cannot be proven by the database; only this human review can.
-- ============================================================================
