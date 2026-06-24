-- ============================================================================
-- COURTZON-V2 : Organisation roles (org-admin, org-seller)
--  - 'org-admin'  → manages a specific organisation (bookings, branches, resources)
--  - 'org-seller' → sells products within a specific org's marketplace
--  - Fixes seller role: adds missing 'marketplace.sell' permission
-- ============================================================================

USE courtzon_v2;

-- 1. Add org-admin and org-seller roles
INSERT IGNORE INTO roles (organisation_id, name, slug, description, is_system) VALUES
(NULL, 'Organisation Admin', 'org-admin', 'Manages a specific organisation (bookings, branches, resources, marketplace)', FALSE),
(NULL, 'Organisation Seller', 'org-seller', 'Sells products within a specific organisation marketplace', FALSE);

-- 2. Fix: add missing marketplace.sell permission to seller role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'seller'
  AND p.permission_key IN ('marketplace.sell');

-- 3. Assign org-admin permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'org-admin'
  AND p.permission_key IN (
    -- Org dashboard
    'org.dashboard.view',
    'org.sidebar.dashboard',
    'org.sidebar.bookings',
    'org.sidebar.branches',
    'org.sidebar.resources',
    'org.sidebar.marketplace',
    'org.sidebar.settings',
    -- Bookings
    'bookings.view',
    'bookings.create',
    'bookings.cancel',
    -- Organisations
    'organisations.edit',
    'organisations.edit.basic',
    'organisations.edit.docs',
    'organisations.edit.branches',
    'organisations.edit.resources',
    'organisations.edit.name',
    'organisations.edit.description',
    'organisations.edit.email',
    'organisations.edit.phone',
    'organisations.edit.website',
    'organisations.edit.logo',
    'organisations.edit.cover',
    'organisations.edit.address',
    'organisations.edit.city',
    'organisations.edit.timezone',
    -- Branches
    'branches.view',
    'branches.create',
    'branches.edit',
    'branches.delete',
    'branches.edit.basic',
    'branches.edit.amenities',
    'branches.edit.name',
    'branches.edit.address',
    'branches.edit.phone',
    'branches.edit.email',
    'branches.edit.opening-hours',
    'branches.edit.closing-hours',
    'branches.edit.timezone',
    'branches.edit.status',
    -- Resources
    'resources.view',
    'resources.create',
    'resources.edit',
    'resources.delete',
    'resources.edit.basic',
    'resources.edit.pricing',
    'resources.edit.settings',
    'resources.edit.name',
    'resources.edit.description',
    'resources.edit.sport',
    'resources.edit.capacity',
    'resources.edit.pricing-type',
    'resources.edit.price',
    'resources.edit.duration',
    'resources.edit.advance-booking',
    'resources.edit.cancellation-policy',
    'resources.edit.status',
    -- Marketplace (org-admin can manage org products)
    'marketplace.view',
    'marketplace.cart.view',
    'marketplace.order.view',
    'marketplace.seller.view',
    'marketplace.sell',
    'marketplace.seller.create-product',
    'marketplace.seller.delete-product',
    'marketplace.seller.manage-orders',
    'marketplace.seller.stats',
    'marketplace.seller.products-tab',
    'marketplace.seller.orders-tab',
    'marketplace.seller.settlements',
    'marketplace.seller.request-settlement'
  );

-- 4. Assign org-seller permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'org-seller'
  AND p.permission_key IN (
    'org.sidebar.dashboard',
    'org.sidebar.marketplace',
    -- Marketplace selling
    'marketplace.view',
    'marketplace.cart.view',
    'marketplace.order.view',
    'marketplace.seller.view',
    'marketplace.sell',
    'marketplace.seller.create-product',
    'marketplace.seller.delete-product',
    'marketplace.seller.manage-orders',
    'marketplace.seller.stats',
    'marketplace.seller.products-tab',
    'marketplace.seller.orders-tab',
    'marketplace.seller.settings',
    'marketplace.seller.settlements',
    'marketplace.seller.request-settlement'
  );
