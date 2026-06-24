-- Org-scoped staff roles (assignable in Add Staff screen)
-- These are template roles (org_id=NULL) but NOT system roles,
-- so they can be assigned to org staff via user_role_scopes.

INSERT IGNORE INTO roles (slug, name, description, is_system) VALUES
  ('club-manager',      'Club Manager',      'Manages club operations except staff & members', FALSE),
  ('branch-manager',    'Branch Manager',    'Manages specific branches and their resources', FALSE),
  ('resource-manager',  'Resource Manager',  'Manages resources across branches', FALSE),
  ('org-coach',         'Org Coach',         'Manages coaching activities within the org', FALSE),
  ('org-accountant',    'Org Accountant',    'View financial data and reports for the org', FALSE);
