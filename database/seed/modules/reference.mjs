import { batchInsert } from '../run.mjs'

export default async function seed(conn) {
  let total = 0

  const countries = [
    { id: 1, iso_code: 'EG', iso_code_3: 'EGY', name: 'Egypt', native_name: 'مصر', phone_code: '+20', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'EGP', flag_emoji: '🇪🇬', sort_order: 1, is_active: 1 },
    { id: 2, iso_code: 'SA', iso_code_3: 'SAU', name: 'Saudi Arabia', native_name: 'المملكة العربية السعودية', phone_code: '+966', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'SAR', flag_emoji: '🇸🇦', sort_order: 2, is_active: 1 },
    { id: 3, iso_code: 'AE', iso_code_3: 'ARE', name: 'United Arab Emirates', native_name: 'الإمارات العربية المتحدة', phone_code: '+971', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'AED', flag_emoji: '🇦🇪', sort_order: 3, is_active: 1 },
    { id: 4, iso_code: 'US', iso_code_3: 'USA', name: 'United States', native_name: 'United States', phone_code: '+1', phone_max_length: 15, phone_min_length: 7, default_locale: 'en', default_currency: 'USD', flag_emoji: '🇺🇸', sort_order: 10, is_active: 1 },
    { id: 5, iso_code: 'GB', iso_code_3: 'GBR', name: 'United Kingdom', native_name: 'United Kingdom', phone_code: '+44', phone_max_length: 15, phone_min_length: 7, default_locale: 'en', default_currency: 'GBP', flag_emoji: '🇬🇧', sort_order: 11, is_active: 1 },
    { id: 6, iso_code: 'DE', iso_code_3: 'DEU', name: 'Germany', native_name: 'Deutschland', phone_code: '+49', phone_max_length: 15, phone_min_length: 7, default_locale: 'de', default_currency: 'EUR', flag_emoji: '🇩🇪', sort_order: 12, is_active: 1 },
    { id: 7, iso_code: 'QA', iso_code_3: 'QAT', name: 'Qatar', native_name: 'قطر', phone_code: '+974', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'QAR', flag_emoji: '🇶🇦', sort_order: 4, is_active: 1 },
    { id: 8, iso_code: 'KW', iso_code_3: 'KWT', name: 'Kuwait', native_name: 'الكويت', phone_code: '+965', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'KWD', flag_emoji: '🇰🇼', sort_order: 5, is_active: 1 },
    { id: 9, iso_code: 'BH', iso_code_3: 'BHR', name: 'Bahrain', native_name: 'البحرين', phone_code: '+973', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'BHD', flag_emoji: '🇧🇭', sort_order: 6, is_active: 1 },
    { id: 10, iso_code: 'OM', iso_code_3: 'OMN', name: 'Oman', native_name: 'عمان', phone_code: '+968', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'OMR', flag_emoji: '🇴🇲', sort_order: 7, is_active: 1 },
  ]
  total += await batchInsert(conn, 'countries', ['id','iso_code','iso_code_3','name','native_name','phone_code','phone_max_length','phone_min_length','default_locale','default_currency','flag_emoji','sort_order','is_active'], countries)

  const currencies = [
    { id: 1, code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimal_places: 2, is_active: 1 },
    { id: 2, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_active: 1 },
    { id: 3, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_active: 1 },
    { id: 4, code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimal_places: 2, is_active: 1 },
    { id: 5, code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimal_places: 2, is_active: 1 },
    { id: 6, code: 'GBP', name: 'British Pound', symbol: '£', decimal_places: 2, is_active: 1 },
    { id: 7, code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimal_places: 3, is_active: 0 },
  ]
  total += await batchInsert(conn, 'currencies', ['id','code','name','symbol','decimal_places','is_active'], currencies)

  const languages = [
    { id: 1, code: 'ar', name: 'Arabic', native_name: 'العربية', is_rtl: 1, is_active: 1, sort_order: 1 },
    { id: 2, code: 'en', name: 'English', native_name: 'English', is_rtl: 0, is_active: 1, sort_order: 2 },
  ]
  total += await batchInsert(conn, 'languages', ['id','code','name','native_name','is_rtl','is_active','sort_order'], languages)

  const sports = [
    { id: 1, name: 'Football', slug: 'football', icon: 'soccer', is_active: 1, sort_order: 1 },
    { id: 2, name: 'Padel', slug: 'padel', icon: 'padel', is_active: 1, sort_order: 2 },
    { id: 3, name: 'Tennis', slug: 'tennis', icon: 'tennis', is_active: 1, sort_order: 3 },
    { id: 4, name: 'Basketball', slug: 'basketball', icon: 'basketball', is_active: 1, sort_order: 4 },
    { id: 5, name: 'Squash', slug: 'squash', icon: 'squash', is_active: 1, sort_order: 5 },
    { id: 6, name: 'Swimming', slug: 'swimming', icon: 'swimming', is_active: 1, sort_order: 6 },
    { id: 7, name: 'Boxing', slug: 'boxing', icon: 'boxing', is_active: 1, sort_order: 7 },
    { id: 8, name: 'Martial Arts', slug: 'martial-arts', icon: 'martial-arts', is_active: 1, sort_order: 8 },
    { id: 9, name: 'Volleyball', slug: 'volleyball', icon: 'volleyball', is_active: 1, sort_order: 9 },
    { id: 10, name: 'Yoga', slug: 'yoga', icon: 'yoga', is_active: 1, sort_order: 10 },
    { id: 11, name: 'Fitness', slug: 'fitness', icon: 'fitness', is_active: 1, sort_order: 11 },
  ]
  total += await batchInsert(conn, 'sports', ['id','name','slug','icon','is_active','sort_order'], sports)

  const positions = [
    { id: 1, sport_id: 1, name: 'Goalkeeper', is_active: 1 },
    { id: 2, sport_id: 1, name: 'Defender', is_active: 1 },
    { id: 3, sport_id: 1, name: 'Midfielder', is_active: 1 },
    { id: 4, sport_id: 1, name: 'Forward', is_active: 1 },
    { id: 5, sport_id: 2, name: 'Right Side', is_active: 1 },
    { id: 6, sport_id: 2, name: 'Left Side', is_active: 1 },
    { id: 7, sport_id: 3, name: 'Singles Player', is_active: 1 },
    { id: 8, sport_id: 3, name: 'Doubles Player', is_active: 1 },
    { id: 9, sport_id: 4, name: 'Point Guard', is_active: 1 },
    { id: 10, sport_id: 4, name: 'Shooting Guard', is_active: 1 },
  ]
  total += await batchInsert(conn, 'sport_positions', ['id','sport_id','name','is_active'], positions)

  const levels = [
    { id: 1, name: 'Beginner', level_order: 1, is_active: 1 },
    { id: 2, name: 'Intermediate', level_order: 2, is_active: 1 },
    { id: 3, name: 'Advanced', level_order: 3, is_active: 1 },
    { id: 4, name: 'Professional', level_order: 4, is_active: 1 },
    { id: 5, name: 'Elite', level_order: 5, is_active: 1 },
  ]
  total += await batchInsert(conn, 'player_levels', ['id','name','level_order','is_active'], levels)

  const bracketTypes = [
    { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: JSON.stringify({ rounds: 'auto', seeding: true }) },
    { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: JSON.stringify({ rounds: 'auto', seeding: true, losers_bracket: true }) },
    { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: JSON.stringify({ groups: 4, advance: 2 }) },
    { id: 4, name: 'Swiss System', slug: 'swiss', is_active: 1, config_schema: JSON.stringify({ rounds: 7, pairing: 'score-based' }) },
  ]
  total += await batchInsert(conn, 'tournament_bracket_types', ['id','name','slug','is_active','config_schema'], bracketTypes)

  const resourceTypes = [
    { id: 1, slug: 'football-pitch', name: 'Football Pitch', has_slots: 1, default_slot_duration: 90, is_active: 1, sort_order: 1 },
    { id: 2, slug: 'padel-court', name: 'Padel Court', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 2 },
    { id: 3, slug: 'tennis-court', name: 'Tennis Court', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 3 },
    { id: 4, slug: 'basketball-court', name: 'Basketball Court', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 4 },
    { id: 5, slug: 'squash-court', name: 'Squash Court', has_slots: 1, default_slot_duration: 45, is_active: 1, sort_order: 5 },
    { id: 6, slug: 'swimming-pool', name: 'Swimming Pool', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 6 },
    { id: 7, slug: 'boxing-ring', name: 'Boxing Ring', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 7 },
    { id: 8, slug: 'multi-purpose-hall', name: 'Multi-Purpose Hall', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 8 },
    { id: 9, slug: 'yoga-studio', name: 'Yoga Studio', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 9 },
    { id: 10, slug: 'fitness-gym', name: 'Fitness Gym', has_slots: 1, default_slot_duration: 60, is_active: 1, sort_order: 10 },
  ]
  total += await batchInsert(conn, 'resource_types', ['id','slug','name','has_slots','default_slot_duration','is_active','sort_order'], resourceTypes)

  const typeAttrs = [
    { id: 1, resource_type_id: 1, attribute_key: 'pitch_size', attribute_type: 'select', options: JSON.stringify(['5-a-side','7-a-side','11-a-side']), is_required: 1, sort_order: 1 },
    { id: 2, resource_type_id: 1, attribute_key: 'surface_type', attribute_type: 'select', options: JSON.stringify(['Natural Grass','Artificial Turf','Hybrid']), is_required: 1, sort_order: 2 },
    { id: 3, resource_type_id: 2, attribute_key: 'court_type', attribute_type: 'select', options: JSON.stringify(['Indoor','Outdoor']), is_required: 1, sort_order: 1 },
    { id: 4, resource_type_id: 2, attribute_key: 'surface', attribute_type: 'select', options: JSON.stringify(['Carpet','Concrete','Glass']), is_required: 1, sort_order: 2 },
    { id: 5, resource_type_id: 3, attribute_key: 'court_surface', attribute_type: 'select', options: JSON.stringify(['Clay','Hard','Grass']), is_required: 1, sort_order: 1 },
    { id: 6, resource_type_id: 3, attribute_key: 'indoor_outdoor', attribute_type: 'select', options: JSON.stringify(['Indoor','Outdoor']), is_required: 1, sort_order: 2 },
    { id: 7, resource_type_id: 6, attribute_key: 'pool_type', attribute_type: 'select', options: JSON.stringify(['Olympic','Semi-Olympic','Recreational']), is_required: 1, sort_order: 1 },
    { id: 8, resource_type_id: 6, attribute_key: 'depth_meters', attribute_type: 'number', options: null, is_required: 0, sort_order: 2 },
    { id: 9, resource_type_id: 8, attribute_key: 'capacity', attribute_type: 'number', options: null, is_required: 1, sort_order: 1 },
    { id: 10, resource_type_id: 9, attribute_key: 'style', attribute_type: 'select', options: JSON.stringify(['Hatha','Vinyasa','Ashtanga','Hot Yoga']), is_required: 1, sort_order: 1 },
  ]
  total += await batchInsert(conn, 'resource_type_attributes', ['id','resource_type_id','attribute_key','attribute_type','options','is_required','sort_order'], typeAttrs)

  const orgTypes = [
    { id: 1, slug: 'sports-club', is_active: 1, sort_order: 1 },
    { id: 2, slug: 'sports-academy', is_active: 1, sort_order: 2 },
    { id: 3, slug: 'fitness-center', is_active: 1, sort_order: 3 },
    { id: 4, slug: 'padel-club', is_active: 1, sort_order: 4 },
    { id: 5, slug: 'tennis-academy', is_active: 1, sort_order: 5 },
  ]
  total += await batchInsert(conn, 'organisation_types', ['id','slug','is_active','sort_order'], orgTypes)

  const orgTypeAttrs = [
    { id: 1, org_type_id: 1, attribute_key: 'member_capacity', attribute_type: 'number', options: null, is_required: 0, sort_order: 1 },
    { id: 2, org_type_id: 1, attribute_key: 'year_founded', attribute_type: 'number', options: null, is_required: 0, sort_order: 2 },
    { id: 3, org_type_id: 2, attribute_key: 'affiliation', attribute_type: 'text', options: null, is_required: 0, sort_order: 1 },
    { id: 4, org_type_id: 5, attribute_key: 'court_count', attribute_type: 'number', options: null, is_required: 0, sort_order: 1 },
  ]
  total += await batchInsert(conn, 'organisation_type_attributes', ['id','org_type_id','attribute_key','attribute_type','options','is_required','sort_order'], orgTypeAttrs)

  const notifCats = [
    { id: 1, slug: 'booking', is_active: 1, sort_order: 1 },
    { id: 2, slug: 'payment', is_active: 1, sort_order: 2 },
    { id: 3, slug: 'promotion', is_active: 1, sort_order: 3 },
    { id: 4, slug: 'system', is_active: 1, sort_order: 4 },
    { id: 5, slug: 'community', is_active: 1, sort_order: 5 },
    { id: 6, slug: 'marketplace', is_active: 1, sort_order: 6 },
    { id: 7, slug: 'coaching', is_active: 1, sort_order: 7 },
    { id: 8, slug: 'academy', is_active: 1, sort_order: 8 },
  ]
  total += await batchInsert(conn, 'notification_categories', ['id','slug','is_active','sort_order'], notifCats)

  const notifActions = [
    { id: 1, action_key: 'booking.confirmed', route_pattern: '/bookings/{id}' },
    { id: 2, action_key: 'booking.reminder', route_pattern: '/bookings/{id}' },
    { id: 3, action_key: 'booking.cancelled', route_pattern: '/bookings/{id}' },
    { id: 4, action_key: 'booking.updated', route_pattern: '/bookings/{id}' },
    { id: 5, action_key: 'payment.received', route_pattern: '/payments/{id}' },
    { id: 6, action_key: 'payment.refunded', route_pattern: '/payments/{id}' },
    { id: 7, action_key: 'wallet.credited', route_pattern: '/wallet' },
    { id: 8, action_key: 'wallet.debited', route_pattern: '/wallet' },
    { id: 9, action_key: 'promotion.new_offer', route_pattern: '/offers/{id}' },
    { id: 10, action_key: 'promotion.coupon', route_pattern: '/coupons/{id}' },
    { id: 11, action_key: 'community.event_invite', route_pattern: '/events/{id}' },
    { id: 12, action_key: 'community.tournament_update', route_pattern: '/tournaments/{id}' },
    { id: 13, action_key: 'order.confirmed', route_pattern: '/orders/{id}' },
    { id: 14, action_key: 'order.shipped', route_pattern: '/orders/{id}' },
    { id: 15, action_key: 'coaching.session_scheduled', route_pattern: '/sessions/{id}' },
    { id: 16, action_key: 'academy.enrollment', route_pattern: '/academy/enrollments/{id}' },
  ]
  total += await batchInsert(conn, 'notification_actions', ['id','action_key','route_pattern'], notifActions)

  const amenities = [
    { id: 1, name_en: 'Floodlights', name_ar: 'أضواء كاشفة', icon: 'lightbulb', category: 'facilities', sort_order: 1, is_active: 1 },
    { id: 2, name_en: 'Changing Rooms', name_ar: 'غرف تبديل ملابس', icon: 'door-open', category: 'facilities', sort_order: 2, is_active: 1 },
    { id: 3, name_en: 'Showers', name_ar: 'دش', icon: 'shower', category: 'facilities', sort_order: 3, is_active: 1 },
    { id: 4, name_en: 'Parking', name_ar: 'موقف سيارات', icon: 'parking', category: 'facilities', sort_order: 4, is_active: 1 },
    { id: 5, name_en: 'Cafeteria', name_ar: 'كافيتريا', icon: 'coffee', category: 'convenience', sort_order: 5, is_active: 1 },
    { id: 6, name_en: 'Equipment Rental', name_ar: 'تأجير معدات', icon: 'tools', category: 'services', sort_order: 6, is_active: 1 },
    { id: 7, name_en: 'Water Cooler', name_ar: 'مبرد مياه', icon: 'droplet', category: 'facilities', sort_order: 7, is_active: 1 },
    { id: 8, name_en: 'First Aid', name_ar: 'إسعافات أولية', icon: 'heart', category: 'accessibility', sort_order: 8, is_active: 1 },
    { id: 9, name_en: 'WiFi', name_ar: 'واي فاي', icon: 'wifi', category: 'convenience', sort_order: 9, is_active: 1 },
    { id: 10, name_en: 'Air Conditioning', name_ar: 'تكييف هواء', icon: 'thermometer', category: 'facilities', sort_order: 10, is_active: 1 },
    { id: 11, name_en: 'Spectator Seating', name_ar: 'مقاعد للمشاهدين', icon: 'chair', category: 'facilities', sort_order: 11, is_active: 1 },
    { id: 12, name_en: 'Ball Boy Service', name_ar: 'خدمة جمع الكرات', icon: 'users', category: 'services', sort_order: 12, is_active: 1 },
    { id: 13, name_en: 'Coaching Service', name_ar: 'خدمة تدريب', icon: 'graduation-cap', category: 'services', sort_order: 13, is_active: 1 },
    { id: 14, name_en: 'Physiotherapy', name_ar: 'علاج طبيعي', icon: 'activity', category: 'services', sort_order: 14, is_active: 1 },
    { id: 15, name_en: 'Pro Shop', name_ar: 'متجر رياضي', icon: 'shopping-bag', category: 'convenience', sort_order: 15, is_active: 1 },
  ]
  total += await batchInsert(conn, 'amenities', ['id','name_en','name_ar','icon','category','sort_order','is_active'], amenities)

  const settings = [
    { id: 1, key: 'site_name', value: JSON.stringify('CourtZon'), description: 'Platform name' },
    { id: 2, key: 'site_tagline', value: JSON.stringify('Book. Play. Connect.'), description: 'Platform tagline' },
    { id: 3, key: 'default_currency', value: JSON.stringify('EGP'), description: 'Default platform currency' },
    { id: 4, key: 'booking_buffer_minutes', value: JSON.stringify(30), description: 'Minutes between consecutive bookings' },
    { id: 5, key: 'max_booking_days_ahead', value: JSON.stringify(30), description: 'How far ahead bookings can be made' },
    { id: 6, key: 'min_booking_notice_hours', value: JSON.stringify(1), description: 'Minimum notice before booking' },
    { id: 7, key: 'cancellation_window_hours', value: JSON.stringify(24), description: 'Free cancellation window in hours' },
    { id: 8, key: 'cancellation_fee_percent', value: JSON.stringify(15), description: 'Cancellation fee percentage' },
    { id: 9, key: 'default_timezone', value: JSON.stringify('Africa/Cairo'), description: 'Default timezone' },
    { id: 10, key: 'date_format', value: JSON.stringify('Y-m-d'), description: 'Date display format' },
    { id: 11, key: 'time_format', value: JSON.stringify('H:i'), description: 'Time display format' },
    { id: 12, key: 'items_per_page', value: JSON.stringify(20), description: 'Default pagination size' },
    { id: 13, key: 'maintenance_mode', value: JSON.stringify(false), description: 'Enable maintenance mode' },
    { id: 14, key: 'platform_commission_percent', value: JSON.stringify(10), description: 'Platform commission percentage' },
    { id: 15, key: 'wallet_min_balance', value: JSON.stringify(0), description: 'Minimum wallet balance' },
    { id: 16, key: 'max_upload_size_mb', value: JSON.stringify(10), description: 'Maximum upload file size in MB' },
    { id: 17, key: 'allowed_file_types', value: JSON.stringify('jpg,jpeg,png,gif,webp,pdf,doc,docx'), description: 'Allowed file upload types' },
    { id: 18, key: 'session_timeout_minutes', value: JSON.stringify(60), description: 'User session timeout' },
    { id: 19, key: 'max_login_attempts', value: JSON.stringify(5), description: 'Max failed login attempts' },
    { id: 20, key: 'lockout_duration_minutes', value: JSON.stringify(30), description: 'Account lockout duration' },
    { id: 21, key: 'enable_otp_verification', value: JSON.stringify(false), description: 'Enable OTP verification' },
    { id: 22, key: 'otp_expiry_minutes', value: JSON.stringify(5), description: 'OTP expiry in minutes' },
    { id: 23, key: 'default_language', value: JSON.stringify('en'), description: 'Default language code' },
    { id: 24, key: 'support_email', value: JSON.stringify('support@courtzon.com'), description: 'Support email address' },
    { id: 25, key: 'support_phone', value: JSON.stringify('01012637733'), description: 'Support phone number' },
  ]
  total += await batchInsert(conn, 'system_settings', ['id','key','value','description'], settings)

  const tokens = [
    { id: 1, token_key: 'primary_color', token_type: 'color', default_value: '#1d4ed8', current_value: '#1d4ed8', category: 'brand', description: 'Primary brand color' },
    { id: 2, token_key: 'secondary_color', token_type: 'color', default_value: '#7c3aed', current_value: '#7c3aed', category: 'brand', description: 'Secondary brand color' },
    { id: 3, token_key: 'accent_color', token_type: 'color', default_value: '#f59e0b', current_value: '#f59e0b', category: 'brand', description: 'Accent brand color' },
    { id: 4, token_key: 'success_color', token_type: 'color', default_value: '#22c55e', current_value: '#22c55e', category: 'semantic', description: 'Success state color' },
    { id: 5, token_key: 'error_color', token_type: 'color', default_value: '#ef4444', current_value: '#ef4444', category: 'semantic', description: 'Error state color' },
    { id: 6, token_key: 'warning_color', token_type: 'color', default_value: '#f97316', current_value: '#f97316', category: 'semantic', description: 'Warning state color' },
    { id: 7, token_key: 'info_color', token_type: 'color', default_value: '#3b82f6', current_value: '#3b82f6', category: 'semantic', description: 'Info state color' },
    { id: 8, token_key: 'font_family_primary', token_type: 'font', default_value: 'Cairo, sans-serif', current_value: 'Cairo, sans-serif', category: 'typography', description: 'Primary font family' },
    { id: 9, token_key: 'font_family_heading', token_type: 'font', default_value: 'Cairo, sans-serif', current_value: 'Cairo, sans-serif', category: 'typography', description: 'Heading font family' },
    { id: 10, token_key: 'border_radius', token_type: 'radius', default_value: '8px', current_value: '8px', category: 'layout', description: 'Default border radius' },
    { id: 11, token_key: 'sidebar_width', token_type: 'size', default_value: '280px', current_value: '280px', category: 'layout', description: 'Sidebar panel width' },
    { id: 12, token_key: 'header_height', token_type: 'size', default_value: '64px', current_value: '64px', category: 'layout', description: 'Header height' },
    { id: 13, token_key: 'font_size_base', token_type: 'size', default_value: '16px', current_value: '16px', category: 'typography', description: 'Base font size' },
    { id: 14, token_key: 'logo_url', token_type: 'other', default_value: '/images/logo.svg', current_value: '/images/logo.svg', category: 'brand', description: 'Site logo URL' },
    { id: 15, token_key: 'favicon_url', token_type: 'other', default_value: '/images/favicon.ico', current_value: '/images/favicon.ico', category: 'brand', description: 'Favicon URL' },
  ]
  total += await batchInsert(conn, 'design_tokens', ['id','token_key','token_type','default_value','current_value','category','description'], tokens)

  const rates = [
    { id: 1, from_currency: 'EGP', to_currency: 'EGP', rate: 1.0, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
    { id: 2, from_currency: 'EGP', to_currency: 'USD', rate: 0.032, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
    { id: 3, from_currency: 'EGP', to_currency: 'EUR', rate: 0.029, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
    { id: 4, from_currency: 'USD', to_currency: 'EGP', rate: 31.25, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
    { id: 5, from_currency: 'EUR', to_currency: 'EGP', rate: 34.48, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
    { id: 6, from_currency: 'USD', to_currency: 'EUR', rate: 0.91, recorded_at: new Date().toISOString().slice(0, 19).replace('T', ' '), source: 'manual' },
  ]
  total += await batchInsert(conn, 'exchange_rates', ['id','from_currency','to_currency','rate','recorded_at','source'], rates)

  return total
}
