-- ============================================================================
-- COURTZON-V2 : COURT AMENITIES
-- Super-admin manages the amenity catalog; clubs assign amenities to courts.
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS court_amenities (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name_en           VARCHAR(200) NOT NULL,
  name_ar           VARCHAR(200) NOT NULL,
  icon              VARCHAR(100) DEFAULT NULL COMMENT 'CSS class or SVG ref',
  category          ENUM('facilities','equipment','accessibility','convenience','services') NOT NULL DEFAULT 'facilities',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS court_amenity_assignments (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  court_id          BIGINT UNSIGNED NOT NULL,
  amenity_id        INT UNSIGNED NOT NULL,
  value             VARCHAR(255) DEFAULT NULL COMMENT 'e.g. "3 showers", "20 spots", NULL = boolean yes',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_court_amenity (court_id, amenity_id),
  INDEX idx_court (court_id),
  INDEX idx_amenity (amenity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: Common court amenities
INSERT INTO court_amenities (name_en, name_ar, icon, category, sort_order) VALUES
  ('Floodlights / Night Lighting',  'إضاءة ليلية',       'floodlight',  'facilities',   1),
  ('Parking',                       'موقف سيارات',       'parking',     'facilities',   2),
  ('Changing Rooms',                'غرف تبديل ملابس',   'changing',    'facilities',   3),
  ('Showers',                       'دش',                'shower',      'facilities',   4),
  ('Spectator Seating',             'مقاعد للمشاهدين',   'seating',     'facilities',   5),
  ('Air Conditioning',              'تكييف',              'ac',          'facilities',   6),
  ('Covered Court',                 'ملعب مغطى',          'covered',     'facilities',   7),
  ('Café / Restaurant',            'مقهى / مطعم',        'cafe',        'convenience',  8),
  ('Water / Drinks Available',      'مياه / مشروبات',    'drinks',      'convenience',  9),
  ('WiFi',                          'واي فاي',            'wifi',        'convenience', 10),
  ('Lockers',                       'خزائن',              'locker',      'facilities',  11),
  ('Kids Area',                     'منطقة أطفال',        'kids',        'facilities',  12),
  ('Equipment Rental',              'تأجير معدات',        'rental',      'equipment',   13),
  ('Ball Machine',                  'آلة كرات',           'ballmachine', 'equipment',   14),
  ('Ball Pickup Service',           'خدمة جمع الكرات',    'ballpickup',  'services',    15),
  ('Pro Shop',                      'متجر مستلزمات',      'proshop',     'services',    16),
  ('Coaching Available',            'مدرب متاح',          'coach',       'services',    17),
  ('Video Recording',               'تسجيل فيديو',        'video',       'services',    18),
  ('First Aid',                     'إسعافات أولية',      'firstaid',    'services',    19),
  ('Wheelchair Accessible',         'مناسب للكراسي المتحركة', 'wheelchair', 'accessibility', 20);
