-- 115_replace_product_categories.sql
-- Replaces product_categories with new 12-group hierarchy + images.
-- Products lose their category association (category_id set to NULL).

SET FOREIGN_KEY_CHECKS = 0;

UPDATE products SET category_id = NULL;
DELETE FROM product_categories;

-- ── Top-level categories (parent_id = NULL) ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(1,  NULL, 'Clothing',                 'clothing',                 1,  'https://placehold.co/600x400/1a1a2e/e3e3e3?text=Clothing'),
(19, NULL, 'Footwear',                 'footwear',                 2,  'https://placehold.co/600x400/16213e/e3e3e3?text=Footwear'),
(27, NULL, 'Equipment',                'equipment',                3,  'https://placehold.co/600x400/0f3460/e3e3e3?text=Equipment'),
(42, NULL, 'Bags',                     'bags',                     4,  'https://placehold.co/600x400/533483/e3e3e3?text=Bags'),
(50, NULL, 'Accessories',              'accessories',              5,  'https://placehold.co/600x400/e94560/e3e3e3?text=Accessories'),
(63, NULL, 'Protection & Safety',    'protection-safety',        6,  'https://placehold.co/600x400/ff6b6b/e3e3e3?text=Protection+%26+Safety'),
(75, NULL, 'Fitness & Training',     'fitness-training',         7,  'https://placehold.co/600x400/4ecdc4/e3e3e3?text=Fitness+%26+Training'),
(84, NULL, 'Electronics',              'electronics',              8,  'https://placehold.co/600x400/45b7d1/e3e3e3?text=Electronics'),
(92, NULL, 'Recovery & Medical',     'recovery-medical',         9,  'https://placehold.co/600x400/96ceb4/e3e3e3?text=Recovery+%26+Medical'),
(100,NULL, 'Nutrition & Hydration',  'nutrition-hydration',      10, 'https://placehold.co/600x400/ffeead/e3e3e3?text=Nutrition+%26+Hydration'),
(105,NULL, 'Team & Club Supplies',   'team-club-supplies',       11, 'https://placehold.co/600x400/d4a5a5/e3e3e3?text=Team+%26+Club+Supplies'),
(113,NULL, 'Awards',                   'awards',                   12, 'https://placehold.co/600x400/ffd700/333333?text=Awards');

-- ── 1. Clothing children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(2,  1, 'T-Shirts',           't-shirts',           1,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=T-Shirts'),
(3,  1, 'Polo Shirts',        'polo-shirts',        2,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Polo+Shirts'),
(4,  1, 'Jerseys',            'jerseys',            3,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Jerseys'),
(5,  1, 'Tank Tops',          'tank-tops',          4,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Tank+Tops'),
(6,  1, 'Shorts',             'shorts',             5,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Shorts'),
(7,  1, 'Pants',              'pants',              6,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Pants'),
(8,  1, 'Leggings',           'leggings',           7,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Leggings'),
(9,  1, 'Tracksuits',         'tracksuits',         8,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Tracksuits'),
(10, 1, 'Hoodies',            'hoodies',            9,  'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Hoodies'),
(11, 1, 'Jackets',            'jackets',            10, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Jackets'),
(12, 1, 'Compression Wear',   'compression-wear',   11, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Compression+Wear'),
(13, 1, 'Base Layers',        'base-layers',        12, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Base+Layers'),
(14, 1, 'Swimwear',           'swimwear',           13, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Swimwear'),
(15, 1, 'Socks',              'socks',              14, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Socks'),
(16, 1, 'Underwear',          'underwear',          15, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Underwear'),
(17, 1, 'Rainwear',           'rainwear',           16, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Rainwear'),
(18, 1, 'Referee Uniforms',   'referee-uniforms',   17, 'https://placehold.co/400x400/1a1a2e/e3e3e3?text=Referee+Uniforms');

-- ── 2. Footwear children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(20, 19, 'Sports Shoes',       'sports-shoes',       1,  'https://placehold.co/400x400/16213e/e3e3e3?text=Sports+Shoes'),
(21, 19, 'Training Shoes',     'training-shoes',     2,  'https://placehold.co/400x400/16213e/e3e3e3?text=Training+Shoes'),
(22, 19, 'Running Shoes',      'running-shoes',      3,  'https://placehold.co/400x400/16213e/e3e3e3?text=Running+Shoes'),
(23, 19, 'Court Shoes',        'court-shoes',        4,  'https://placehold.co/400x400/16213e/e3e3e3?text=Court+Shoes'),
(24, 19, 'Cleats / Boots',  'cleats-boots',       5,  'https://placehold.co/400x400/16213e/e3e3e3?text=Cleats+%2F+Boots'),
(25, 19, 'Sandals & Slides','sandals-slides',     6,  'https://placehold.co/400x400/16213e/e3e3e3?text=Sandals+%26+Slides'),
(26, 19, 'Shoe Accessories',   'shoe-accessories',   7,  'https://placehold.co/400x400/16213e/e3e3e3?text=Shoe+Accessories');

-- ── 3. Equipment children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(28, 27, 'Balls',               'balls',              1,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Balls'),
(29, 27, 'Rackets',             'rackets',            2,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Rackets'),
(30, 27, 'Bats & Sticks',    'bats-sticks',        3,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Bats+%26+Sticks'),
(31, 27, 'Nets',                'nets',               4,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Nets'),
(32, 27, 'Goals',               'goals',              5,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Goals'),
(33, 27, 'Training Equipment',  'training-equipment', 6,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Training+Equipment'),
(34, 27, 'Agility Equipment',   'agility-equipment',  7,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Agility+Equipment'),
(35, 27, 'Fitness Equipment',   'fitness-equipment',  8,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Fitness+Equipment'),
(36, 27, 'Weights',             'weights',            9,  'https://placehold.co/400x400/0f3460/e3e3e3?text=Weights'),
(37, 27, 'Resistance Equipment','resistance-equip',   10, 'https://placehold.co/400x400/0f3460/e3e3e3?text=Resistance+Equipment'),
(38, 27, 'Jump Ropes',          'jump-ropes',         11, 'https://placehold.co/400x400/0f3460/e3e3e3?text=Jump+Ropes'),
(39, 27, 'Mats',                'mats',               12, 'https://placehold.co/400x400/0f3460/e3e3e3?text=Mats'),
(40, 27, 'Exercise Machines',   'exercise-machines',  13, 'https://placehold.co/400x400/0f3460/e3e3e3?text=Exercise+Machines'),
(41, 27, 'Measuring Equipment',  'measuring-equip',   14, 'https://placehold.co/400x400/0f3460/e3e3e3?text=Measuring+Equipment');

-- ── 4. Bags children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(43, 42, 'Backpacks',         'backpacks',         1,  'https://placehold.co/400x400/533483/e3e3e3?text=Backpacks'),
(44, 42, 'Gym Bags',          'gym-bags',          2,  'https://placehold.co/400x400/533483/e3e3e3?text=Gym+Bags'),
(45, 42, 'Duffel Bags',       'duffel-bags',       3,  'https://placehold.co/400x400/533483/e3e3e3?text=Duffel+Bags'),
(46, 42, 'Equipment Bags',    'equipment-bags',    4,  'https://placehold.co/400x400/533483/e3e3e3?text=Equipment+Bags'),
(47, 42, 'Shoe Bags',         'shoe-bags',         5,  'https://placehold.co/400x400/533483/e3e3e3?text=Shoe+Bags'),
(48, 42, 'Travel Bags',       'travel-bags',       6,  'https://placehold.co/400x400/533483/e3e3e3?text=Travel+Bags'),
(49, 42, 'Waist Bags',        'waist-bags',        7,  'https://placehold.co/400x400/533483/e3e3e3?text=Waist+Bags');

-- ── 5. Accessories children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(51, 50, 'Caps & Hats',     'caps-hats',          1,  'https://placehold.co/400x400/e94560/e3e3e3?text=Caps+%26+Hats'),
(52, 50, 'Headbands',         'headbands',          2,  'https://placehold.co/400x400/e94560/e3e3e3?text=Headbands'),
(53, 50, 'Wristbands',        'wristbands',         3,  'https://placehold.co/400x400/e94560/e3e3e3?text=Wristbands'),
(54, 50, 'Belts',             'belts',              4,  'https://placehold.co/400x400/e94560/e3e3e3?text=Belts'),
(55, 50, 'Towels',            'towels',             5,  'https://placehold.co/400x400/e94560/e3e3e3?text=Towels'),
(56, 50, 'Water Bottles',     'water-bottles',      6,  'https://placehold.co/400x400/e94560/e3e3e3?text=Water+Bottles'),
(57, 50, 'Shakers',           'shakers',            7,  'https://placehold.co/400x400/e94560/e3e3e3?text=Shakers'),
(58, 50, 'Sunglasses',        'sunglasses',         8,  'https://placehold.co/400x400/e94560/e3e3e3?text=Sunglasses'),
(59, 50, 'Keychains',         'keychains',          9,  'https://placehold.co/400x400/e94560/e3e3e3?text=Keychains'),
(60, 50, 'Phone Holders',     'phone-holders',      10, 'https://placehold.co/400x400/e94560/e3e3e3?text=Phone+Holders'),
(61, 50, 'Watches',           'watches',            11, 'https://placehold.co/400x400/e94560/e3e3e3?text=Watches'),
(62, 50, 'Lanyards',          'lanyards',           12, 'https://placehold.co/400x400/e94560/e3e3e3?text=Lanyards');

-- ── 6. Protection & Safety children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(64, 63, 'Helmets',               'helmets',               1,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Helmets'),
(65, 63, 'Gloves',                'gloves',                2,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Gloves'),
(66, 63, 'Shin Guards',           'shin-guards',           3,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Shin+Guards'),
(67, 63, 'Knee Guards',           'knee-guards',           4,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Knee+Guards'),
(68, 63, 'Elbow Guards',          'elbow-guards',          5,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Elbow+Guards'),
(69, 63, 'Mouth Guards',          'mouth-guards',          6,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Mouth+Guards'),
(70, 63, 'Protective Eyewear',    'protective-eyewear',    7,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Protective+Eyewear'),
(71, 63, 'Chest Protectors',      'chest-protectors',      8,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Chest+Protectors'),
(72, 63, 'Ankle Supports',        'ankle-supports',        9,  'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Ankle+Supports'),
(73, 63, 'Wrist Supports',        'wrist-supports',        10, 'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Wrist+Supports'),
(74, 63, 'Back Supports',         'back-supports',         11, 'https://placehold.co/400x400/ff6b6b/e3e3e3?text=Back+Supports');

-- ── 7. Fitness & Training children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(76, 75, 'Yoga Mats',            'yoga-mats',            1,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Yoga+Mats'),
(77, 75, 'Resistance Bands',     'resistance-bands',     2,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Resistance+Bands'),
(78, 75, 'Foam Rollers',         'foam-rollers',         3,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Foam+Rollers'),
(79, 75, 'Balance Equipment',    'balance-equipment',    4,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Balance+Equipment'),
(80, 75, 'Suspension Trainers',  'suspension-trainers',  5,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Suspension+Trainers'),
(81, 75, 'Recovery Equipment',   'recovery-equipment',   6,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Recovery+Equipment'),
(82, 75, 'Massage Equipment',    'massage-equipment',    7,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Massage+Equipment'),
(83, 75, 'Stretching Equipment', 'stretching-equipment', 8,  'https://placehold.co/400x400/4ecdc4/e3e3e3?text=Stretching+Equipment');

-- ── 8. Electronics children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(85, 84, 'Smart Watches',         'smart-watches',         1,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Smart+Watches'),
(86, 84, 'Fitness Trackers',      'fitness-trackers',      2,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Fitness+Trackers'),
(87, 84, 'Heart Rate Monitors',   'heart-rate-monitors',   3,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Heart+Rate+Monitors'),
(88, 84, 'GPS Devices',           'gps-devices',           4,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=GPS+Devices'),
(89, 84, 'Earbuds',               'earbuds',               5,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Earbuds'),
(90, 84, 'Action Cameras',        'action-cameras',        6,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Action+Cameras'),
(91, 84, 'Stopwatches',           'stopwatches',           7,  'https://placehold.co/400x400/45b7d1/e3e3e3?text=Stopwatches');

-- ── 9. Recovery & Medical children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(93, 92, 'First Aid Kits',        'first-aid-kits',        1,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=First+Aid+Kits'),
(94, 92, 'Athletic Tape',         'athletic-tape',         2,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Athletic+Tape'),
(95, 92, 'Kinesiology Tape',      'kinesiology-tape',      3,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Kinesiology+Tape'),
(96, 92, 'Ice Packs',             'ice-packs',             4,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Ice+Packs'),
(97, 92, 'Compression Sleeves',   'compression-sleeves',   5,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Compression+Sleeves'),
(98, 92, 'Recovery Tools',        'recovery-tools',        6,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Recovery+Tools'),
(99, 92, 'Muscle Rollers',        'muscle-rollers',        7,  'https://placehold.co/400x400/96ceb4/e3e3e3?text=Muscle+Rollers');

-- ── 10. Nutrition & Hydration children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(101, 100, 'Water Bottles',       'water-bottles-ntr',     1,  'https://placehold.co/400x400/ffeead/333333?text=Water+Bottles'),
(102, 100, 'Shakers',             'shakers-ntr',           2,  'https://placehold.co/400x400/ffeead/333333?text=Shakers'),
(103, 100, 'Hydration Packs',     'hydration-packs',       3,  'https://placehold.co/400x400/ffeead/333333?text=Hydration+Packs'),
(104, 100, 'Energy Products',     'energy-products',       4,  'https://placehold.co/400x400/ffeead/333333?text=Energy+Products');

-- ── 11. Team & Club Supplies children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(106, 105, 'Training Bibs',       'training-bibs',         1,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Training+Bibs'),
(107, 105, 'Captain Armbands',    'captain-armbands',      2,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Captain+Armbands'),
(108, 105, 'Coaching Boards',     'coaching-boards',       3,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Coaching+Boards'),
(109, 105, 'Tactical Boards',     'tactical-boards',       4,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Tactical+Boards'),
(110, 105, 'Scoreboards',         'scoreboards',           5,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Scoreboards'),
(111, 105, 'Whistles',            'whistles',              6,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Whistles'),
(112, 105, 'Team Equipment',      'team-equipment',        7,  'https://placehold.co/400x400/d4a5a5/e3e3e3?text=Team+Equipment');

-- ── 12. Awards children ──
INSERT INTO product_categories (id, parent_id, name, slug, sort_order, image_url) VALUES
(114, 113, 'Trophies',            'trophies',              1,  'https://placehold.co/400x400/ffd700/333333?text=Trophies'),
(115, 113, 'Medals',              'medals',                2,  'https://placehold.co/400x400/ffd700/333333?text=Medals'),
(116, 113, 'Plaques',             'plaques',               3,  'https://placehold.co/400x400/ffd700/333333?text=Plaques'),
(117, 113, 'Certificates',        'certificates',          4,  'https://placehold.co/400x400/ffd700/333333?text=Certificates'),
(118, 113, 'Ribbons',             'ribbons',               5,  'https://placehold.co/400x400/ffd700/333333?text=Ribbons');

ALTER TABLE product_categories AUTO_INCREMENT = 119;

SET FOREIGN_KEY_CHECKS = 1;
