-- Migration 103: Global COA Code Uniqueness Hardening
-- Fix: organisation_id=NULL bypasses uk_org_code in MySQL (NULL != NULL)
-- Solution: Regular column + trigger + UNIQUE index (generated STORED columns conflict with existing FKs)

-- Add composite scope column (populated by triggers)
ALTER TABLE chart_of_accounts
  ADD COLUMN org_code_scope VARCHAR(40) DEFAULT '' COMMENT 'Composite: NULL org→0 + code for uniqueness'
    AFTER description;

-- Populate existing rows
UPDATE chart_of_accounts SET org_code_scope = CONCAT(COALESCE(organisation_id, 0), ':', code);

-- Add unique constraint
CREATE UNIQUE INDEX uk_org_code_scope ON chart_of_accounts (org_code_scope);

-- Auto-populate triggers (keeps org_code_scope in sync with organisation_id + code)
CREATE TRIGGER trg_coa_org_code_scope_insert BEFORE INSERT ON chart_of_accounts FOR EACH ROW SET NEW.org_code_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.code);
CREATE TRIGGER trg_coa_org_code_scope_update BEFORE UPDATE ON chart_of_accounts FOR EACH ROW SET NEW.org_code_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.code);
