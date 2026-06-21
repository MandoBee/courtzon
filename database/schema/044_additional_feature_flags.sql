-- ============================================================================
-- COURTZON-V2 : Additional feature flags for registration type control & more
-- ============================================================================

USE courtzon_v2;

INSERT IGNORE INTO feature_flags (flag_key, label, description, module, is_enabled) VALUES
  ('player.registration_enabled', 'Player Registration', 'Allow new player registrations', 'player', TRUE),
  ('seller.registration_enabled', 'Seller Registration', 'Allow new seller registrations', 'seller', TRUE),
  ('organization.registration_enabled', 'Organization Registration', 'Allow new organization registrations', 'organization', TRUE),
  ('app.maintenance_mode', 'Maintenance Mode', 'Put the entire app in maintenance mode', 'system', FALSE),
  ('booking.payment_required', 'Payment Required', 'Require payment when creating bookings', 'bookings', FALSE),
  ('marketplace.reviews_enabled', 'Product Reviews', 'Enable product reviews on marketplace', 'marketplace', TRUE);
