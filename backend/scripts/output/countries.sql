-- ─── COUNTRIES ───
INSERT IGNORE INTO countries (iso_code, iso_code_3, name, native_name, phone_code, phone_max_length, phone_min_length, default_locale, default_currency, currency_symbol, currency_decimal_places, currency_name, flag_emoji, navigation_polygon, sort_order, is_active)
VALUES (
  'EG',
  'EGY',
  'Egypt',
  'مصر',
  '+20',
  10,
  10,
  'ar',
  'EGP',
  'E£',
  2,
  'Egyptian Pound',
  '🇪🇬',
  '{"type":"Polygon","coordinates":[[[27.279409704179404,23.67651088753144],[34.3255902958206,23.67651088753144],[34.3255902958206,29.96468911246856],[27.279409704179404,29.96468911246856],[27.279409704179404,23.67651088753144]]]}',
  1,
  1
);
