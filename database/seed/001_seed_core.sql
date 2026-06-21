-- ============================================================================
-- COURTZON-V2 : COMPREHENSIVE SEED DATA
-- Covers: System, Countries, Currencies, Languages, Design Tokens,
--         Sports, Organisation Types, Resource Types, Bracket Types,
--         Notification Categories & Actions, Admin & Player accounts
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- LANGUAGES
-- ============================================================================
INSERT INTO languages (code, name, native_name, is_rtl, sort_order) VALUES
  ('en', 'English', 'English', FALSE, 1),
  ('ar', 'Arabic', 'العربية', TRUE, 2),
  ('fr', 'French', 'Français', FALSE, 3);

-- ============================================================================
-- CURRENCIES (before countries — FK on default_currency)
-- ============================================================================
INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
  ('AED', 'UAE Dirham', 'د.إ', 2),
  ('EGP', 'Egyptian Pound', 'E£', 2),
  ('SAR', 'Saudi Riyal', '﷼', 2),
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2);

-- ============================================================================
-- COUNTRIES
-- ============================================================================
INSERT INTO countries (iso_code, iso_code_3, name, native_name, phone_code, phone_max_length, phone_min_length, default_locale, default_currency, flag_emoji, sort_order) VALUES
  ('AE', 'ARE', 'United Arab Emirates', 'الإمارات العربية المتحدة', '+971', 15, 7, 'ar', 'AED', '🇦🇪', 1),
  ('EG', 'EGY', 'Egypt', 'مصر', '+20', 15, 7, 'ar', 'EGP', '🇪🇬', 2),
  ('SA', 'SAU', 'Saudi Arabia', 'المملكة العربية السعودية', '+966', 15, 7, 'ar', 'SAR', '🇸🇦', 3),
  ('US', 'USA', 'United States', 'United States', '+1', 15, 7, 'en', 'USD', '🇺🇸', 4),
  ('GB', 'GBR', 'United Kingdom', 'United Kingdom', '+44', 15, 7, 'en', 'GBP', '🇬🇧', 5),
  ('FR', 'FRA', 'France', 'France', '+33', 15, 7, 'fr', 'EUR', '🇫🇷', 6);

-- ============================================================================
-- SYSTEM SETTINGS
-- ============================================================================
INSERT INTO system_settings (`key`, value, description) VALUES
  ('platform.name', '"CourtZon"', 'Platform display name'),
  ('platform.url', '"https://courtzon.com"', 'Platform base URL'),
  ('platform.support_email', '"support@courtzon.com"', 'Support email address'),
  ('platform.default_currency', '"USD"', 'Default platform currency'),
  ('platform.default_language', '"en"', 'Default platform language'),
  ('platform.default_timezone', '"UTC"', 'Default timezone'),
  ('marketplace.max_free_listings', '5', 'Max product listings for free sellers'),
  ('marketplace.commission_percent', '10.00', 'Default marketplace commission %'),
  ('booking.default_advance_days', '7', 'Default booking advance window in days'),
  ('booking.default_slot_duration', '30', 'Default slot duration in minutes'),
  ('booking.auto_cancel_unpaid_minutes', '30', 'Auto-cancel unpaid bookings after N minutes'),
  ('auth.session_lifetime_hours', '720', 'Session lifetime in hours (30 days)'),
  ('auth.refresh_token_lifetime_hours', '720', 'Refresh token lifetime'),
  ('ads.default_cpm_rate', '5.00', 'Default CPM rate in USD'),
  ('ads.default_cpc_rate', '0.50', 'Default CPC rate in USD');

-- ============================================================================
-- SPORTS
-- ============================================================================
INSERT INTO sports (name, slug, icon, sort_order) VALUES
  ('Football', 'football', 'soccer', 1),
  ('Padel', 'padel', 'padel', 2),
  ('Tennis', 'tennis', 'tennis', 3),
  ('Basketball', 'basketball', 'basketball', 4),
  ('Volleyball', 'volleyball', 'volleyball', 5),
  ('Squash', 'squash', 'squash', 6),
  ('Swimming', 'swimming', 'swimming', 7),
  ('Boxing', 'boxing', 'boxing', 8),
  ('Martial Arts', 'martial-arts', 'martial-arts', 9);

-- ============================================================================
-- SPORT POSITIONS
-- ============================================================================
INSERT INTO sport_positions (sport_id, name) VALUES
  (1, 'Goalkeeper'), (1, 'Defender'), (1, 'Midfielder'), (1, 'Forward'),
  (2, 'Left'), (2, 'Right'),
  (3, 'Singles'), (3, 'Doubles'),
  (4, 'Point Guard'), (4, 'Shooting Guard'), (4, 'Small Forward'), (4, 'Power Forward'), (4, 'Center'),
  (5, 'Setter'), (5, 'Outside Hitter'), (5, 'Libero');

-- ============================================================================
-- PLAYER LEVELS
-- ============================================================================
INSERT INTO player_levels (name, level_order) VALUES
  ('Beginner', 1),
  ('Intermediate', 2),
  ('Advanced', 3),
  ('Professional', 4),
  ('Elite', 5);

-- ============================================================================
-- ORGANISATION TYPES
-- ============================================================================
INSERT IGNORE INTO organisation_types (slug, sort_order) VALUES
  ('club', 1),
  ('gym', 2),
  ('clinic', 3),
  ('spa', 4),
  ('wellness_center', 5);

-- ============================================================================
-- ORG TYPE ATTRIBUTES (EAV schema)
-- ============================================================================
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'number_of_courts', 'number', NULL, TRUE, 1 FROM organisation_types ot WHERE ot.slug = 'club' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_changing_rooms', 'boolean', NULL, FALSE, 2 FROM organisation_types ot WHERE ot.slug = 'club' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_cafeteria', 'boolean', NULL, FALSE, 3 FROM organisation_types ot WHERE ot.slug = 'club' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_parking', 'boolean', NULL, FALSE, 4 FROM organisation_types ot WHERE ot.slug = 'club' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'membership_types', 'multiselect', JSON_ARRAY(JSON_OBJECT('value', 'monthly', 'label', 'Monthly'), JSON_OBJECT('value', 'yearly', 'label', 'Yearly'), JSON_OBJECT('value', 'pay_per_visit', 'label', 'Pay Per Visit')), FALSE, 5 FROM organisation_types ot WHERE ot.slug = 'club' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'equipment_types', 'multiselect', JSON_ARRAY(JSON_OBJECT('value', 'cardio', 'label', 'Cardio'), JSON_OBJECT('value', 'weights', 'label', 'Weights'), JSON_OBJECT('value', 'functional', 'label', 'Functional')), TRUE, 1 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_swimming_pool', 'boolean', NULL, FALSE, 2 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_sauna', 'boolean', NULL, FALSE, 3 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_personal_trainers', 'boolean', NULL, FALSE, 4 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_classes', 'boolean', NULL, FALSE, 5 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'operating_hours_247', 'boolean', NULL, FALSE, 6 FROM organisation_types ot WHERE ot.slug = 'gym' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'specialties', 'multiselect', JSON_ARRAY(JSON_OBJECT('value', 'physiotherapy', 'label', 'Physiotherapy'), JSON_OBJECT('value', 'sports_medicine', 'label', 'Sports Medicine'), JSON_OBJECT('value', 'nutrition', 'label', 'Nutrition'), JSON_OBJECT('value', 'massage_therapy', 'label', 'Massage Therapy')), TRUE, 1 FROM organisation_types ot WHERE ot.slug = 'clinic' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_medical_imaging', 'boolean', NULL, FALSE, 2 FROM organisation_types ot WHERE ot.slug = 'clinic' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_laboratory', 'boolean', NULL, FALSE, 3 FROM organisation_types ot WHERE ot.slug = 'clinic' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_pharmacy', 'boolean', NULL, FALSE, 4 FROM organisation_types ot WHERE ot.slug = 'clinic' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_jacuzzi', 'boolean', NULL, FALSE, 5 FROM organisation_types ot WHERE ot.slug = 'spa' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_steam_room', 'boolean', NULL, FALSE, 6 FROM organisation_types ot WHERE ot.slug = 'spa' LIMIT 1;
INSERT IGNORE INTO organisation_type_attributes (org_type_id, attribute_key, attribute_type, options, is_required, sort_order)
SELECT ot.id, 'has_pool', 'boolean', NULL, FALSE, 7 FROM organisation_types ot WHERE ot.slug = 'wellness_center' LIMIT 1;

-- ============================================================================
-- RESOURCE TYPES
-- ============================================================================
INSERT INTO resource_types (slug, name, has_slots, default_slot_duration, sort_order) VALUES
  ('court', 'Court', TRUE, 60, 1),
  ('pool', 'Swimming Pool', TRUE, 60, 2),
  ('jacuzzi', 'Jacuzzi', TRUE, 30, 3),
  ('treatment_room', 'Treatment Room', FALSE, 60, 4),
  ('fitness_zone', 'Fitness Zone', TRUE, 60, 5),
  ('yoga_studio', 'Yoga Studio', TRUE, 60, 6),
  ('multi_purpose_hall', 'Multi-Purpose Hall', TRUE, 60, 7);

-- ============================================================================
-- RESOURCE TYPE ATTRIBUTES
-- ============================================================================
INSERT INTO resource_type_attributes (resource_type_id, attribute_key, attribute_type, options, is_required, sort_order) VALUES
  -- Court attributes
  (1, 'surface_type', 'select', JSON_ARRAY(JSON_OBJECT('value', 'grass', 'label', 'Grass'), JSON_OBJECT('value', 'clay', 'label', 'Clay'), JSON_OBJECT('value', 'hard', 'label', 'Hard'), JSON_OBJECT('value', 'artificial_grass', 'label', 'Artificial Grass'), JSON_OBJECT('value', 'parquet', 'label', 'Parquet')), TRUE, 1),
  (1, 'indoor', 'boolean', NULL, FALSE, 2),
  (1, 'has_lighting', 'boolean', NULL, FALSE, 3),
  (1, 'has_changing_room', 'boolean', NULL, FALSE, 4),
  (1, 'has_showers', 'boolean', NULL, FALSE, 5),
  -- Pool attributes
  (2, 'pool_type', 'select', JSON_ARRAY(JSON_OBJECT('value', 'olympic', 'label', 'Olympic'), JSON_OBJECT('value', 'semi_olympic', 'label', 'Semi-Olympic'), JSON_OBJECT('value', 'recreational', 'label', 'Recreational'), JSON_OBJECT('value', 'children', 'label', 'Children')), TRUE, 1),
  (2, 'depth_min_meters', 'number', NULL, TRUE, 2),
  (2, 'depth_max_meters', 'number', NULL, TRUE, 3),
  (2, 'is_heated', 'boolean', NULL, FALSE, 4),
  (2, 'has_lifeguard', 'boolean', NULL, FALSE, 5),
  (2, 'has_lanes', 'boolean', NULL, FALSE, 6),
  -- Treatment room attributes
  (4, 'has_bed', 'boolean', NULL, TRUE, 1),
  (4, 'has_sink', 'boolean', NULL, TRUE, 2),
  (4, 'has_equipment', 'multiselect', JSON_ARRAY(JSON_OBJECT('value', 'ultrasound', 'label', 'Ultrasound'), JSON_OBJECT('value', 'tens', 'label', 'TENS'), JSON_OBJECT('value', 'laser', 'label', 'Laser'), JSON_OBJECT('value', 'massage_table', 'label', 'Massage Table')), FALSE, 3),
  (4, 'is_private', 'boolean', NULL, TRUE, 4);

-- ============================================================================
-- TOURNAMENT BRACKET TYPES
-- ============================================================================
INSERT INTO tournament_bracket_types (name, slug, config_schema) VALUES
  ('Single Elimination', 'single_elimination', JSON_OBJECT('rounds', 'auto', 'third_place', FALSE)),
  ('Double Elimination', 'double_elimination', JSON_OBJECT('rounds', 'auto', 'third_place', TRUE)),
  ('Round Robin', 'round_robin', JSON_OBJECT('groups', 1, 'advance_to_knockout', TRUE)),
  ('Group Stage + Knockout', 'group_knockout', JSON_OBJECT('groups', 4, 'advance_per_group', 2, 'knockout_type', 'single_elimination')),
  ('Swiss System', 'swiss', JSON_OBJECT('rounds', 7, 'pairing', 'swiss'));

-- ============================================================================
-- NOTIFICATION CATEGORIES
-- ============================================================================
INSERT INTO notification_categories (slug, sort_order) VALUES
  ('booking_confirmations', 1),
  ('booking_reminders', 2),
  ('booking_cancellations', 3),
  ('booking_changes', 4),
  ('payments', 5),
  ('tournaments', 6),
  ('academy', 7),
  ('coach_sessions', 8),
  ('marketplace', 9),
  ('community', 10),
  ('system', 11),
  ('promotions', 12);

-- ============================================================================
-- NOTIFICATION ACTIONS
-- ============================================================================
INSERT INTO notification_actions (action_key, route_pattern) VALUES
  ('view_booking', '/bookings/{bookingId}'),
  ('view_tournament', '/tournaments/{tournamentId}'),
  ('view_match', '/tournaments/{tournamentId}/matches/{matchId}'),
  ('view_order', '/marketplace/orders/{orderId}'),
  ('open_chat', '/chat/{conversationId}'),
  ('view_coach_session', '/coaches/sessions/{sessionId}'),
  ('view_academy', '/academies/{academyId}'),
  ('view_event', '/community/events/{eventId}'),
  ('view_wallet', '/wallet/transactions/{transactionId}'),
  ('view_organisation', '/organisations/{orgId}'),
  ('view_branch', '/organisations/{orgId}/branches/{branchId}');

-- ============================================================================
-- DESIGN TOKENS (Sport Color Palette)
-- ============================================================================
INSERT IGNORE INTO design_tokens (token_key, token_type, default_value, category, description) VALUES
  ('color-primary', 'color', '#00E676', 'brand', 'Primary brand color (sport green)'),
  ('color-primary-dark', 'color', '#00C853', 'brand', 'Dark variant of primary'),
  ('color-primary-light', 'color', '#69F0AE', 'brand', 'Light variant of primary'),
  ('color-secondary', 'color', '#FF6D00', 'brand', 'Secondary brand color (energy orange)'),
  ('color-secondary-dark', 'color', '#E65100', 'brand', 'Dark variant of secondary'),
  ('color-accent', 'color', '#304FFE', 'brand', 'Accent color'),
  ('color-bg', 'color', '#FAFAFA', 'theme', 'Light mode background'),
  ('color-bg-dark', 'color', '#121212', 'theme', 'Dark mode background'),
  ('color-surface', 'color', '#FFFFFF', 'theme', 'Light mode card/surface'),
  ('color-surface-dark', 'color', '#1E1E1E', 'theme', 'Dark mode card/surface'),
  ('color-text', 'color', '#212121', 'theme', 'Light mode text'),
  ('color-text-dark', 'color', '#E0E0E0', 'theme', 'Dark mode text'),
  ('color-text-muted', 'color', '#757575', 'theme', 'Muted/secondary text'),
  ('color-text-muted-dark', 'color', '#9E9E9E', 'theme', 'Dark mode muted text'),
  ('color-success', 'color', '#4CAF50', 'semantic', 'Success state'),
  ('color-warning', 'color', '#FF9800', 'semantic', 'Warning state'),
  ('color-error', 'color', '#F44336', 'semantic', 'Error state'),
  ('color-info', 'color', '#2196F3', 'semantic', 'Info state'),
  ('font-body', 'font', '\"Inter\", system-ui, sans-serif', 'typography', 'Body font stack'),
  ('font-heading', 'font', '\"Inter\", system-ui, sans-serif', 'typography', 'Heading font stack'),
  ('font-mono', 'font', '\"JetBrains Mono\", monospace', 'typography', 'Monospace font stack'),
  ('radius-sm', 'radius', '4px', 'border', 'Small border radius'),
  ('radius-md', 'radius', '8px', 'border', 'Medium border radius'),
  ('radius-lg', 'radius', '16px', 'border', 'Large border radius'),
  ('radius-full', 'radius', '9999px', 'border', 'Full/pill border radius'),
  ('shadow-sm', 'shadow', '0 1px 2px rgba(0,0,0,0.05)', 'shadow', 'Small shadow'),
  ('shadow-md', 'shadow', '0 4px 6px rgba(0,0,0,0.1)', 'shadow', 'Medium shadow'),
  ('shadow-lg', 'shadow', '0 10px 15px rgba(0,0,0,0.1)', 'shadow', 'Large shadow'),
  ('spacing-xs', 'spacing', '4px', 'spacing', 'Extra small spacing'),
  ('spacing-sm', 'spacing', '8px', 'spacing', 'Small spacing'),
  ('spacing-md', 'spacing', '16px', 'spacing', 'Medium spacing'),
  ('spacing-lg', 'spacing', '24px', 'spacing', 'Large spacing'),
  ('spacing-xl', 'spacing', '48px', 'spacing', 'Extra large spacing');

-- ============================================================================
-- SYSTEM ROLES & PERMISSIONS
-- ============================================================================
INSERT INTO permissions (module_id, permission_key, is_system) VALUES
  -- Dashboard
  (1, 'dashboard.view', TRUE),
  (1, 'dashboard.view_financial', TRUE),
  -- Users
  (2, 'users.view', TRUE),
  (2, 'users.create', TRUE),
  (2, 'users.edit', TRUE),
  (2, 'users.delete', TRUE),
  (2, 'users.ban', TRUE),
  (2, 'users.impersonate', TRUE),
  -- Roles
  (3, 'roles.view', TRUE),
  (3, 'roles.create', TRUE),
  (3, 'roles.edit', TRUE),
  (3, 'roles.delete', TRUE),
  (3, 'roles.assign', TRUE),
  -- Organisations
  (4, 'organisations.view', TRUE),
  (4, 'organisations.create', TRUE),
  (4, 'organisations.edit', TRUE),
  (4, 'organisations.delete', TRUE),
  (4, 'organisations.verify', TRUE),
  (4, 'organisations.manage_types', TRUE),
  -- Branches
  (5, 'branches.view', TRUE),
  (5, 'branches.create', TRUE),
  (5, 'branches.edit', TRUE),
  (5, 'branches.delete', TRUE),
  (5, 'branches.manage_access', TRUE),
  -- Resources
  (6, 'resources.view', TRUE),
  (6, 'resources.create', TRUE),
  (6, 'resources.edit', TRUE),
  (6, 'resources.delete', TRUE),
  (6, 'resources.manage_types', TRUE),
  -- Bookings
  (7, 'bookings.view', TRUE),
  (7, 'bookings.create', TRUE),
  (7, 'bookings.edit', TRUE),
  (7, 'bookings.cancel.own', TRUE),
  (7, 'bookings.cancel.any', TRUE),
  (7, 'bookings.check_in', TRUE),
  (7, 'bookings.refund', TRUE),
  -- Financial
  (8, 'financial.view', TRUE),
  (8, 'financial.manage_wallets', TRUE),
  (8, 'financial.process_payouts', TRUE),
  (8, 'financial.manage_commission', TRUE),
  (8, 'financial.reconcile', TRUE),
  (8, 'financial.view_journal', TRUE),
  (8, 'financial.withdraw', TRUE),
  -- Marketplace
  (9, 'marketplace.view', TRUE),
  (9, 'marketplace.sell', TRUE),
  (9, 'marketplace.manage_categories', TRUE),
  (9, 'marketplace.moderate', TRUE),
  (9, 'marketplace.manage_commissions', TRUE),
  -- Tournaments
  (10, 'tournaments.view', TRUE),
  (10, 'tournaments.create', TRUE),
  (10, 'tournaments.edit', TRUE),
  (10, 'tournaments.delete', TRUE),
  (10, 'tournaments.manage_brackets', TRUE),
  (10, 'tournaments.enter_scores', TRUE),
  (10, 'tournaments.manage_commissions', TRUE),
  -- Academies
  (11, 'academies.view', TRUE),
  (11, 'academies.create', TRUE),
  (11, 'academies.edit', TRUE),
  (11, 'academies.delete', TRUE),
  (11, 'academies.evaluate', TRUE),
  -- Coaches
  (12, 'coaches.view', TRUE),
  (12, 'coaches.create_sessions', TRUE),
  (12, 'coaches.manage_profile', TRUE),
  (12, 'coaches.manage_agreements', TRUE),
  -- Community
  (13, 'community.view', TRUE),
  (13, 'community.create_events', TRUE),
  (13, 'community.create_tournaments', TRUE),
  (13, 'community.moderate', TRUE),
  -- Notifications
  (14, 'notifications.view', TRUE),
  (14, 'notifications.send', TRUE),
  (14, 'notifications.manage_categories', TRUE),
  -- Ads
  (15, 'ads.view', TRUE),
  (15, 'ads.create', TRUE),
  (15, 'ads.edit', TRUE),
  (15, 'ads.delete', TRUE),
  (15, 'ads.manage_placements', TRUE),
  (15, 'ads.manage_pricing', TRUE),
  -- CMS
  (16, 'cms.view', TRUE),
  (16, 'cms.create', TRUE),
  (16, 'cms.edit', TRUE),
  (16, 'cms.delete', TRUE),
  -- Settings
  (17, 'app-settings.view', TRUE),
  (17, 'app-settings.edit', TRUE),
  (17, 'settings.manage_design_tokens', TRUE),
  -- Audit
  (18, 'audit.view', TRUE),
  (18, 'audit.revert', TRUE),
  -- Reports
  (19, 'reports.view', TRUE),
  (19, 'reports.export', TRUE),
  (19, 'reports.view_financial', TRUE),
  (19, 'reports.view_bookings', TRUE),
  (19, 'reports.view_users', TRUE),
  (19, 'reports.view_organisations', TRUE),
  (19, 'reports.view_marketplace', TRUE),
  (19, 'reports.view_tournaments', TRUE),
  (19, 'reports.view_ads', TRUE),
  (19, 'reports.view_audit', TRUE),
  -- Translations
  (20, 'translations.view', TRUE),
  (20, 'translations.edit', TRUE);

-- Assign ALL permissions to Super Admin role (role_id=1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Assign management permissions to Admin role (role_id=3)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE permission_key IN (
  'dashboard.view', 'dashboard.view_financial',
  'users.view', 'users.create', 'users.edit', 'users.delete', 'users.ban',
  'roles.view', 'roles.assign',
  'organisations.view', 'organisations.create', 'organisations.edit', 'organisations.verify',
  'branches.view', 'branches.create', 'branches.edit', 'branches.delete', 'branches.manage_access',
  'resources.view', 'resources.create', 'resources.edit', 'resources.delete',
  'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.cancel.any', 'bookings.check_in', 'bookings.refund',
  'financial.view', 'financial.manage_wallets', 'financial.process_payouts', 'financial.reconcile', 'financial.withdraw',
  'marketplace.view', 'marketplace.moderate', 'marketplace.manage_categories',
  'notifications.view', 'notifications.send',
  'app-settings.view', 'app-settings.edit',
  'reports.view', 'reports.export', 'reports.view_financial', 'reports.view_bookings', 'reports.view_users', 'reports.view_organisations', 'reports.view_marketplace'
);

-- ============================================================================
-- SYSTEM USERS (Passwords: all '123456' hashed with PBKDF2-SHA512)
-- Hash: $pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ
-- ============================================================================
-- NOTE: Backend uses PBKDF2-SHA512 (not bcrypt) for password hashing.
INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, birth_date, language_id, timezone, dark_mode, account_status, is_email_verified) VALUES
  ('a0000000-0000-0000-0000-000000000001', 1, '501234567', '+971501234567', 'superadmin@courtzon.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Ahmed Al Admin', 'male', '1985-06-15', 1, 'Asia/Dubai', 'dark', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000002', 1, '507654321', '+971507654321', 'omarmanger@courtzon.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Omar Al Manager', 'male', '1990-03-20', 1, 'Asia/Dubai', 'system', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000003', 1, '505551234', '+971505551234', 'fatima.reception@courtzon.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Fatima Al Reception', 'female', '1995-09-10', 1, 'Asia/Dubai', 'light', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000004', 1, '504449876', '+971504449876', 'khalid.coach@courtzon.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Khalid Al Coach', 'male', '1988-12-05', 1, 'Asia/Dubai', 'system', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000005', 1, '509991111', '+971509991111', 'layla.player@example.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Layla Mohammed', 'female', '2000-07-22', 1, 'Asia/Dubai', 'dark', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000006', 1, '509992222', '+971509992222', 'saeed.player@example.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Saeed Abdullah', 'male', '1998-11-15', 1, 'Asia/Dubai', 'light', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000007', 1, '509993333', '+971509993333', 'nora.player@example.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Nora Hassan', 'female', '2001-04-30', 1, 'Asia/Dubai', 'system', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000008', 2, '100123456', '+20100123456', 'mohamed.egypt@example.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Mohamed Ali', 'male', '1995-08-12', 2, 'Africa/Cairo', 'dark', 'active', TRUE),
  ('a0000000-0000-0000-0000-000000000009', 1, '509994444', '+971509994444', 'coach.sarah@courtzon.com', '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ', 'Sarah Khalid', 'female', '1992-03-18', 1, 'Asia/Dubai', 'system', 'active', TRUE);

-- ============================================================================
-- PLAYER PROFILES
-- ============================================================================
INSERT INTO player_profiles (user_id, main_sport_id, main_level_id) VALUES
  (5, 3, 2),  -- Layla - Tennis - Intermediate
  (6, 1, 3),  -- Saeed - Football - Advanced
  (7, 2, 1),  -- Nora - Padel - Beginner
  (8, 1, 2);  -- Mohamed - Football - Intermediate

-- Coach profiles
INSERT INTO player_profiles (user_id, is_coach, bio) VALUES
  (4, TRUE, 'Professional tennis coach with 10+ years experience'),
  (9, TRUE, 'Certified fitness and padel coach');

INSERT INTO coach_profiles (user_id, bio, experience_years, certifications, sports, hourly_rate, currency_code, is_verified) VALUES
  (4, 'Professional tennis coach with 10+ years experience. Certified by ITF.', 10, 
   JSON_ARRAY('ITF Certified', 'First Aid Certified'),
   JSON_ARRAY(3), 150.00, 'AED', TRUE),
  (9, 'Certified fitness and padel coach. Specializing in technique improvement.', 7,
   JSON_ARRAY('ACE Certified', 'Padel Federation Certified'),
   JSON_ARRAY(2, 5), 120.00, 'AED', TRUE);

-- ============================================================================
-- USER ROLES
-- ============================================================================
INSERT INTO user_roles (user_id, role_id) VALUES
  (1, 1),  -- Super Admin
  (1, 3),  -- Super Admin also gets Admin role
  (5, 2),  -- Player Layla
  (6, 2),  -- Player Saeed
  (7, 2),  -- Player Nora
  (8, 2);  -- Player Mohamed

-- ============================================================================
-- ORGANISATIONS
-- ============================================================================
INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, description, email, phone, is_verified, is_active, rating_avg, rating_count) VALUES
  ('b0000000-0000-0000-0000-000000000001', 1, 1, 'Dubai Sports Academy', 'dubai-sports-academy', 'Premium sports facility in the heart of Dubai with football, tennis, padel and basketball courts.', 'info@dubaisports.ae', '+971501234500', TRUE, TRUE, 4.5, 128),
  ('b0000000-0000-0000-0000-000000000002', 1, 1, 'Abu Dhabi Tennis Club', 'abu-dhabi-tennis-club', 'World-class tennis facilities with professional coaching.', 'info@adtennis.ae', '+971501234501', TRUE, TRUE, 4.2, 87),
  ('b0000000-0000-0000-0000-000000000003', 3, 1, 'Al Neyadi Medical & Sports Clinic', 'al-neyadi-clinic', 'Sports medicine, physiotherapy and rehabilitation center with modern equipment.', 'info@alneyadiclinic.ae', '+971501234502', TRUE, TRUE, 4.7, 56),
  ('b0000000-0000-0000-0000-000000000004', 2, 1, 'PowerZone Gym', 'powerzone-gym', 'Full-service gym with cardio, weights, pool and fitness classes.', 'info@powerzone.ae', '+971501234503', TRUE, TRUE, 3.9, 203);

-- ============================================================================
-- BRANCHES
-- ============================================================================
INSERT INTO branches (public_id, organisation_id, name, slug, description, email, phone, address_line1, city, country_id, latitude, longitude, access_type, is_active, rating_avg, rating_count, currency_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 1, 'Dubai Sports Academy - Main Branch', 'dsa-main', 'Main branch with 5 football pitches, 4 tennis courts, 2 padel courts', 'main@dubaisports.ae', '+971501234510', 'Sheikh Zayed Road, Al Quoz', 'Dubai', 1, 25.2048, 55.2708, 'open', TRUE, 4.6, 98, 1),
  ('c0000000-0000-0000-0000-000000000002', 1, 'Dubai Sports Academy - Marina Branch', 'dsa-marina', 'Waterfront branch with 2 padel courts and fitness center', 'marina@dubaisports.ae', '+971501234511', 'Dubai Marina, Walk JBR', 'Dubai', 1, 25.0800, 55.1400, 'restricted', TRUE, 4.3, 45, 1),
  ('c0000000-0000-0000-0000-000000000003', 2, 'Abu Dhabi Tennis Club - Main', 'ad-tc-main', '12 tennis courts (clay + hard), academy, pro shop', 'info@adtennis.ae', '+971501234520', 'Al Mushrif Area, near ADNEC', 'Abu Dhabi', 1, 24.4539, 54.3773, 'open', TRUE, 4.4, 67, 1),
  ('c0000000-0000-0000-0000-000000000004', 3, 'Al Neyadi Clinic - Dubai', 'al-neyadi-dxb', 'Sports medicine and physiotherapy in Dubai Healthcare City', 'dxb@alneyadiclinic.ae', '+971501234530', 'Dubai Healthcare City, Building 24', 'Dubai', 1, 25.2267, 55.3124, 'restricted', TRUE, 4.8, 42, 1),
  ('c0000000-0000-0000-0000-000000000005', 4, 'PowerZone Gym - Downtown', 'pz-downtown', 'Flagship gym in Downtown Dubai', 'downtown@powerzone.ae', '+971501234540', 'Downtown Dubai, Burj Blvd', 'Dubai', 1, 25.1972, 55.2744, 'open', TRUE, 4.1, 156, 1);

-- ============================================================================
-- OPERATING HOURS (Organisation level)
-- ============================================================================
INSERT INTO operating_hours (owner_type, owner_id, day_of_week, is_open, open_time, close_time)
SELECT 'organisation', o.id, d.day, TRUE, '06:00', '23:00'
FROM organisations o
CROSS JOIN (
  SELECT 0 AS day UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
  UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
) d
WHERE o.id <= 4;

-- Friday shorter hours
UPDATE operating_hours SET open_time = '08:00', close_time = '22:00' WHERE day_of_week = 5;

-- ============================================================================
-- RESOURCES
-- ============================================================================
INSERT INTO resources (public_id, branch_id, resource_type_id, sport_id, name, capacity, hourly_price, slot_duration, max_bookings_per_slot) VALUES
  -- DSA Main - Football pitches
  ('d0000000-0000-0000-0000-000000000001', 1, 1, 1, 'Football Pitch A (11-a-side)', 22, 250.00, 90, 1),
  ('d0000000-0000-0000-0000-000000000002', 1, 1, 1, 'Football Pitch B (7-a-side)', 14, 200.00, 90, 1),
  -- DSA Main - Tennis courts
  ('d0000000-0000-0000-0000-000000000003', 1, 1, 3, 'Tennis Court 1 (Clay)', 4, 120.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000004', 1, 1, 3, 'Tennis Court 2 (Hard)', 4, 120.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000005', 1, 1, 3, 'Tennis Court 3 (Hard)', 4, 120.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000006', 1, 1, 3, 'Tennis Court 4 (Clay)', 4, 120.00, 60, 1),
  -- DSA Main - Padel
  ('d0000000-0000-0000-0000-000000000007', 1, 1, 2, 'Padel Court 1', 4, 150.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000008', 1, 1, 2, 'Padel Court 2', 4, 150.00, 60, 1),
  -- DSA Marina - Padel
  ('d0000000-0000-0000-0000-000000000009', 2, 1, 2, 'Marina Padel Court 1', 4, 150.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000010', 2, 1, 2, 'Marina Padel Court 2', 4, 150.00, 60, 1),
  -- AD Tennis Club
  ('d0000000-0000-0000-0000-000000000011', 3, 1, 3, 'Centre Court (Clay - Stadium)', 8, 200.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000012', 3, 1, 3, 'Court 2 (Clay)', 4, 100.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000013', 3, 1, 3, 'Court 3 (Hard)', 4, 100.00, 60, 1),
  -- Al Neyadi Clinic - Treatment rooms
  ('d0000000-0000-0000-0000-000000000014', 4, 4, NULL, 'Physiotherapy Room 1', 1, 350.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000015', 4, 4, NULL, 'Massage Therapy Room', 1, 250.00, 60, 1),
  ('d0000000-0000-0000-0000-000000000016', 4, 2, 7, 'Hydrotherapy Pool', 4, 180.00, 60, 1),
  -- PowerZone - Downtown
  ('d0000000-0000-0000-0000-000000000017', 5, 5, NULL, 'Main Fitness Floor', 50, 50.00, 60, 50),
  ('d0000000-0000-0000-0000-000000000018', 5, 6, NULL, 'Yoga & Pilates Studio', 20, 80.00, 60, 20);

-- ============================================================================
-- COMMISSION RULES
-- ============================================================================
INSERT INTO commission_rules (rule_name, rule_type, amount, applicable_entity) VALUES
  ('Global Booking Commission', 'percentage', 10.00, 'booking'),
  ('Global Marketplace Commission', 'percentage', 5.00, 'marketplace'),
  ('Global Tournament Commission', 'percentage', 15.00, 'tournament'),
  ('Global Coach Session Commission', 'percentage', 20.00, 'coach_session');

-- ============================================================================
-- AD PLACEMENTS
-- ============================================================================
INSERT INTO ad_placements (placement_key, name, dimensions, max_ads) VALUES
  ('home_banner', 'Home Page Banner', '728x90', 3),
  ('home_sidebar', 'Home Page Sidebar', '300x250', 2),
  ('search_results_top', 'Search Results Top', '728x90', 2),
  ('booking_confirmation', 'Booking Confirmation Page', '300x250', 1),
  ('profile_sidebar', 'Player Profile Sidebar', '300x600', 1),
  ('marketplace_sidebar', 'Marketplace Sidebar', '300x250', 2),
  ('mobile_banner', 'Mobile Bottom Banner', '320x50', 1);

-- ============================================================================
-- DEFAULT WALLETS
-- ============================================================================
INSERT INTO user_wallets (user_id, balance, currency_code) VALUES
  (1, 100000.00, 'AED'),
  (2, 5000.00, 'AED'),
  (3, 2000.00, 'AED'),
  (4, 8000.00, 'AED'),
  (5, 1500.00, 'AED'),
  (6, 500.00, 'AED'),
  (7, 1000.00, 'AED'),
  (8, 300.00, 'AED'),
  (9, 3000.00, 'AED');

-- ============================================================================
-- SAMPLE BOOKINGS (for demo)
-- ============================================================================
INSERT INTO bookings (public_id, user_id, organisation_id, resource_id, booking_type, visibility, booking_date, start_time, end_time, total_amount, booking_status, payment_status) VALUES
  ('e0000000-0000-0000-0000-000000000001', 5, 1, 3, 'public_match', 'public', CURDATE() + INTERVAL 1 DAY, '10:00', '11:00', 120.00, 'confirmed', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 6, 1, 1, 'public_match', 'public', CURDATE() + INTERVAL 2 DAY, '18:00', '19:30', 300.00, 'confirmed', 'unpaid'),
  ('e0000000-0000-0000-0000-000000000003', 7, 2, 9, 'public_match', 'public', CURDATE() + INTERVAL 3 DAY, '16:00', '17:00', 200.00, 'pending', 'unpaid');

-- ============================================================================
-- SAMPLE PRODUCT CATEGORIES (Marketplace)
-- ============================================================================
INSERT INTO product_categories (parent_id, sport_id, name, slug, sort_order) VALUES
  (NULL, NULL, 'General Sports', 'general-sports', 1),
  (NULL, 1, 'Football', 'football', 2),
  (NULL, 2, 'Padel', 'padel', 3),
  (NULL, 3, 'Tennis', 'tennis', 4),
  (1, NULL, 'Shoes', 'shoes', 1),
  (1, NULL, 'Balls', 'balls', 2),
  (1, NULL, 'Clothing', 'clothing', 3),
  (1, NULL, 'Accessories', 'accessories', 4),
  (1, NULL, 'Equipment', 'equipment', 5),
  (2, 1, 'Football Shoes', 'football-shoes', 1),
  (2, 1, 'Football Jerseys', 'football-jerseys', 2),
  (2, 1, 'Football Balls', 'football-balls', 3),
  (3, 2, 'Rackets', 'padel-rackets', 1),
  (3, 2, 'Balls', 'padel-balls', 2),
  (4, 3, 'Rackets', 'tennis-rackets', 1),
  (4, 3, 'Balls', 'tennis-balls', 2),
  (4, 3, 'Shoes', 'tennis-shoes', 3);

-- ============================================================================
-- SAMPLE SELLER ORGANISATION (Khalid) — must be before products
-- ============================================================================
INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, description, is_verified, is_active) VALUES
  (UUID(), 10, 4, 'Khalid Sports Shop', 'khalid-sports-shop', 'Premium sports equipment and accessories', TRUE, TRUE);

-- ============================================================================
-- SAMPLE PRODUCTS (seller_id references organisations.id where org_type_id=10)
-- ============================================================================
INSERT INTO products (seller_id, category_id, name, description, price, currency_code, quantity, status, images) VALUES
  ((SELECT id FROM organisations WHERE slug = 'khalid-sports-shop'), 10, 'Nike Mercurial Superfly 9', 'Professional football boots', 1299.00, 'AED', 25, 'active', JSON_ARRAY('https://placehold.co/400x400?text=Mercurial')),
  ((SELECT id FROM organisations WHERE slug = 'khalid-sports-shop'), 13, 'Bullpadel Vertex 04', 'Pro-level padel racket', 1899.00, 'AED', 10, 'active', JSON_ARRAY('https://placehold.co/400x400?text=Vertex04')),
  ((SELECT id FROM organisations WHERE slug = 'khalid-sports-shop'), 15, 'Wilson Pro Staff RF97', 'Roger Federer signature racket', 2199.00, 'AED', 5, 'active', JSON_ARRAY('https://placehold.co/400x400?text=ProStaff')),
  ((SELECT id FROM organisations WHERE slug = 'khalid-sports-shop'), 11, 'Adidas Tiro 24 Jersey', 'Training jersey', 199.00, 'AED', 50, 'active', JSON_ARRAY('https://placehold.co/400x400?text=Tiro24'));

-- ============================================================================
-- TRANSLATIONS (Sample)
-- ============================================================================
INSERT INTO translations (`key`, locale, value) VALUES
  ('app.name', 'en', 'CourtZon'),
  ('app.name', 'ar', 'كورت زون'),
  ('app.tagline', 'en', 'Book. Play. Connect.'),
  ('app.tagline', 'ar', 'احجز. العب. تواصل'),
  ('auth.login.title', 'en', 'Sign In'),
  ('auth.login.title', 'ar', 'تسجيل الدخول'),
  ('auth.login.phone', 'en', 'Phone Number'),
  ('auth.login.phone', 'ar', 'رقم الهاتف'),
  ('auth.login.password', 'en', 'Password'),
  ('auth.login.password', 'ar', 'كلمة المرور'),
  ('auth.register.title', 'en', 'Create Account'),
  ('auth.register.title', 'ar', 'إنشاء حساب'),
  ('nav.home', 'en', 'Home'),
  ('nav.home', 'ar', 'الرئيسية'),
  ('nav.bookings', 'en', 'My Bookings'),
  ('nav.bookings', 'ar', 'حجوزاتي'),
  ('nav.marketplace', 'en', 'Marketplace'),
  ('nav.marketplace', 'ar', 'المتجر'),
  ('nav.profile', 'en', 'Profile'),
  ('nav.profile', 'ar', 'الملف الشخصي'),
  ('common.save', 'en', 'Save'),
  ('common.save', 'ar', 'حفظ'),
  ('common.cancel', 'en', 'Cancel'),
  ('common.cancel', 'ar', 'إلغاء'),
  ('common.delete', 'en', 'Delete'),
  ('common.delete', 'ar', 'حذف'),
  ('common.search', 'en', 'Search'),
  ('common.search', 'ar', 'بحث'),
  ('common.confirm', 'en', 'Confirm'),
  ('common.confirm', 'ar', 'تأكيد'),
  ('booking.title', 'en', 'Book a Resource'),
  ('booking.title', 'ar', 'احجز مورد'),
  ('booking.select_date', 'en', 'Select Date'),
  ('booking.select_date', 'ar', 'اختر التاريخ'),
  ('booking.select_time', 'en', 'Select Time'),
  ('booking.select_time', 'ar', 'اختر الوقت'),
  ('booking.qr_code', 'en', 'Your Booking QR'),
  ('booking.qr_code', 'ar', 'رمز QR للحجز'),
  ('player.main_sport', 'en', 'Main Sport'),
  ('player.main_sport', 'ar', 'الرياضة الرئيسية'),
  ('player.level', 'en', 'Skill Level'),
  ('player.level', 'ar', 'مستوى المهارة'),
  ('org.name', 'en', 'Organisation'),
  ('org.name', 'ar', 'المنظمة'),
  ('branch.name', 'en', 'Branch'),
  ('branch.name', 'ar', 'الفرع'),
  ('resource.name', 'en', 'Resource'),
  ('resource.name', 'ar', 'المورد'),
  ('marketplace.shop', 'en', 'Shop'),
  ('marketplace.shop', 'ar', 'متجر'),
  ('marketplace.cart', 'en', 'Cart'),
  ('marketplace.cart', 'ar', 'السلة'),
  ('settings.theme', 'en', 'Theme'),
  ('settings.theme', 'ar', 'السمة'),
  ('settings.language', 'en', 'Language'),
  ('settings.language', 'ar', 'اللغة'),
  ('settings.notifications', 'en', 'Notifications'),
  ('settings.notifications', 'ar', 'الإشعارات'),
  ('notification.booking_confirmed', 'en', 'Booking Confirmed'),
  ('notification.booking_confirmed', 'ar', 'تم تأكيد الحجز'),
  ('error.generic', 'en', 'Something went wrong'),
  ('error.generic', 'ar', 'حدث خطأ ما'),
  ('error.not_found', 'en', 'Not Found'),
  ('error.not_found', 'ar', 'غير موجود'),
  ('coach.session_booked', 'en', 'Coach Session Booked'),
  ('coach.session_booked', 'ar', 'تم حجز جلسة المدرب'),
  ('community.event_created', 'en', 'Event Created'),
  ('community.event_created', 'ar', 'تم إنشاء الفعالية');

SET FOREIGN_KEY_CHECKS = 0;
