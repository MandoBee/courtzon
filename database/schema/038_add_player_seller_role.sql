-- ============================================================================
-- COURTZON-V2 : Add Player Seller role
--  - New role 'player-seller' for players who activate free selling
--  - Distinguishes from regular 'player' (non-selling) and 'seller' (paid plan)
-- ============================================================================

USE courtzon_v2;

-- 1. Add player-seller role
INSERT IGNORE INTO roles (organisation_id, name, slug, description, is_system) VALUES
(NULL, 'Player Seller', 'player-seller', 'Player who activated free selling (max 5 products)', FALSE);

-- 2. Assign marketplace permissions to player-seller role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'player-seller'
  AND p.permission_key IN (
    'marketplace.view',
    'marketplace.cart.view',
    'marketplace.order.view',
    'marketplace.seller.view',
    'marketplace.sell',
    'marketplace.seller.create-product',
    'marketplace.seller.delete-product',
    'marketplace.seller.manage-orders',
    'marketplace.seller.settlements',
    'marketplace.seller.request-settlement',
    'marketplace.seller.stats',
    'marketplace.seller.products-tab',
    'marketplace.seller.orders-tab',
    'marketplace.seller.settings'
  );

-- 3. Assign permissions to the seller role (existing paid sellers)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'seller'
  AND p.permission_key IN (
    'marketplace.seller.stats',
    'marketplace.seller.products-tab',
    'marketplace.seller.orders-tab',
    'marketplace.seller.settings',
    'marketplace.seller.settlements',
    'marketplace.seller.request-settlement'
  );
