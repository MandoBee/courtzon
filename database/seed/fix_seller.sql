INSERT IGNORE INTO organisations (public_id, org_type_id, owner_id, name, slug, description, is_verified, is_active, rating_avg, rating_count, version) VALUES (UUID(), 10, 1, 'Egyptian Sports Shop', 'egyptian-sports-shop', 'Premium sports equipment', 1, 1, 4.5, 12, 1);

SET @org_id = (SELECT id FROM organisations WHERE org_type_id = 10 LIMIT 1);

INSERT IGNORE INTO branches (public_id, organisation_id, name, slug, access_type, is_active, version) VALUES (UUID(), @org_id, 'Main Shop', CONCAT('shop-', @org_id), 'open', 1, 1);

SET @branch_id = (SELECT id FROM branches WHERE organisation_id = @org_id LIMIT 1);

INSERT IGNORE INTO seller_profiles (user_id, organisation_id, branch_id, shop_name, shop_description, is_subscribed, max_free_listings, total_listings, is_active) VALUES (2, @org_id, @branch_id, 'Egyptian Sports Shop', 'Premium sports equipment and apparel', 1, 5, 0, 1);

UPDATE player_profiles SET is_seller = 1 WHERE user_id = 2;

SET @seller_id = (SELECT id FROM seller_profiles WHERE user_id = 2 LIMIT 1);

INSERT IGNORE INTO products (seller_id, category_id, name, description, price, currency_code, quantity, status, is_active) VALUES
(@seller_id, 1, 'Tennis Racket Pro', 'Pro racket', 1200.00, 'EGP', 25, 'active', 1),
(@seller_id, 2, 'Squash Ball Set', '2-pack', 180.00, 'EGP', 50, 'active', 1),
(@seller_id, 3, 'Football Jersey', 'National team', 350.00, 'EGP', 15, 'active', 1),
(@seller_id, 4, 'Swimming Goggles', 'Pro goggles', 80.00, 'EGP', 40, 'active', 1),
(@seller_id, 1, 'Basketball', 'Size 7', 250.00, 'EGP', 20, 'active', 1),
(@seller_id, 2, 'Yoga Mat', '6mm premium', 150.00, 'EGP', 30, 'draft', 1);

INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew) VALUES
(@org_id, 5, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1);

SELECT CONCAT('Done: org=', @org_id, ' branch=', @branch_id, ' seller=', @seller_id) as result;
