-- 087_complete_production_role_catalog.sql
-- Create the remaining official CourtZon production roles (August 2026).
--
-- All roles are Global (is_system=0, organisation_id=NULL) — editable,
-- assignable, and visible under CourtZon Global in the admin panel.
--
-- Existing roles (1-11) already converted in 086; this migration
-- creates roles 12-26. Only Super Admin (1) and Player (2) remain System.
--
-- All statements are idempotent (safe to re-run).

INSERT IGNORE INTO `roles`
  (`id`, `organisation_id`, `name`, `slug`, `description`, `is_system`, `is_active`, `deleted_at`, `created_at`, `updated_at`)
VALUES
  (12, NULL, 'Master Admin',     'master-admin',        'Elevated admin with broad org, finance, and marketplace access', 0, 1, NULL, NOW(), NOW()),
  (13, NULL, 'Court Manager',    'court-manager',       'Manages courts, resources, and bookings for their organisation',   0, 1, NULL, NOW(), NOW()),
  (14, NULL, 'Marketplace Mgr',  'marketplace-manager', 'Full marketplace management (products, orders, sellers)',         0, 1, NULL, NOW(), NOW()),
  (15, NULL, 'Receptionist',     'receptionist',        'Front-desk: create/view/cancel bookings, check-in players',       0, 1, NULL, NOW(), NOW()),
  (16, NULL, 'Customer Service', 'customer-service',    'Player support, ticket management, basic order lookups',          0, 1, NULL, NOW(), NOW()),
  (17, NULL, 'Finance Manager',  'finance-manager',     'Full financial suite: wallet, payments, settlements, reports',   0, 1, NULL, NOW(), NOW()),
  (18, NULL, 'Operations Mgr',   'operations-manager',  'Branch, resource, staff and booking operations management',       0, 1, NULL, NOW(), NOW()),
  (19, NULL, 'Tournament Mgr',   'tournament-manager',  'Full tournament lifecycle management',                            0, 1, NULL, NOW(), NOW()),
  (20, NULL, 'Academy Manager',  'academy-manager',     'Full academy program and enrollment management',                  0, 1, NULL, NOW(), NOW()),
  (21, NULL, 'Event Manager',    'event-manager',       'Community events and engagement management',                      0, 1, NULL, NOW(), NOW()),
  (22, NULL, 'Marketing Mgr',    'marketing-manager',   'Ads, campaigns, CMS content and promotions',                      0, 1, NULL, NOW(), NOW()),
  (23, NULL, 'Content Manager',  'content-manager',     'CMS pages, translations, design tokens',                          0, 1, NULL, NOW(), NOW()),
  (24, NULL, 'Support Agent',    'support-agent',       'Support ticket handling only',                                    0, 1, NULL, NOW(), NOW()),
  (25, NULL, 'Auditor',          'auditor',             'Read-only access across all modules for audit purposes',           0, 1, NULL, NOW(), NOW()),
  (26, NULL, 'Read Only Admin',  'read-only-admin',     'Read-only admin panel access — no mutations',                     0, 1, NULL, NOW(), NOW());
