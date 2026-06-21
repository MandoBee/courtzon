-- ================================
-- Egypt Geographical Seed Data
-- Generated for CourtZon platform
-- ================================

-- Add type column to cities
ALTER TABLE cities ADD COLUMN IF NOT EXISTS type VARCHAR(50) NULL AFTER native_name;

-- ================================
-- COUNTRIES
-- ================================
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

-- ================================
-- PROVINCES (Governorates)
-- ================================
-- ─── PROVINCES (Governorates) ───
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Cairo',
  'القاهرة',
  'EG-C',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.990405999955083,28.96642659001078],[32.480994000044916,28.96642659001078],[32.480994000044916,31.12237340998922],[29.990405999955083,31.12237340998922],[29.990405999955083,28.96642659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Alexandria',
  'الإسكندرية',
  'EG-ALX',
  'governorate',
  '{"type":"Polygon","coordinates":[[[28.658447965133185,30.12212659001078],[31.178952034866818,30.12212659001078],[31.178952034866818,32.27807340998922],[28.658447965133185,32.27807340998922],[28.658447965133185,30.12212659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Giza',
  'الجيزة',
  'EG-GZ',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.96399915834145,28.935126590010782],[32.45380084165855,28.935126590010782],[32.45380084165855,31.09107340998922],[29.96399915834145,31.09107340998922],[29.96399915834145,28.935126590010782]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Sharqia',
  'الشرقية',
  'EG-SHR',
  'governorate',
  '{"type":"Polygon","coordinates":[[[30.377158245413696,29.63502659001078],[32.884841754586304,29.63502659001078],[32.884841754586304,31.79097340998922],[30.377158245413696,31.79097340998922],[30.377158245413696,29.63502659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Dakahlia',
  'الدقهلية',
  'EG-DK',
  'governorate',
  '{"type":"Polygon","coordinates":[[[30.301699902504453,29.95992659001078],[32.817900097495546,29.95992659001078],[32.817900097495546,32.11587340998922],[30.301699902504453,32.11587340998922],[30.301699902504453,29.95992659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Beheira',
  'البحيرة',
  'EG-BH',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.257534076738814,30.06302659001078],[31.776465923261185,30.06302659001078],[31.776465923261185,32.21897340998922],[29.257534076738814,32.21897340998922],[29.257534076738814,30.06302659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Gharbia',
  'الغربية',
  'EG-GH',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.78947446877958,29.76412659001078],[32.30052553122042,29.76412659001078],[32.30052553122042,31.920073409989218],[29.78947446877958,31.920073409989218],[29.78947446877958,29.76412659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Monufia',
  'المنوفية',
  'EG-MNF',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.72465520015826,29.44202659001078],[32.22734479984174,29.44202659001078],[32.22734479984174,31.59797340998922],[29.72465520015826,31.59797340998922],[29.72465520015826,29.44202659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Qalyubia',
  'القليوبية',
  'EG-KB',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.96111533599161,29.25002659001078],[32.458884664008394,29.25002659001078],[32.458884664008394,31.40597340998922],[29.96111533599161,31.40597340998922],[29.96111533599161,29.25002659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Aswan',
  'أسوان',
  'EG-ASN',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.71899405771052,23.01092659001078],[34.08060594228948,23.01092659001078],[34.08060594228948,25.16687340998922],[31.71899405771052,25.16687340998922],[31.71899405771052,23.01092659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Luxor',
  'الأقصر',
  'EG-LX',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.443411966964412,24.60922659001078],[33.83578803303559,24.60922659001078],[33.83578803303559,26.76517340998922],[31.443411966964412,26.76517340998922],[31.443411966964412,24.60922659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Red Sea',
  'البحر الأحمر',
  'EG-BA',
  'governorate',
  '{"type":"Polygon","coordinates":[[[32.56440518248638,24.96502659001078],[34.96399481751362,24.96502659001078],[34.96399481751362,27.12097340998922],[32.56440518248638,27.12097340998922],[32.56440518248638,24.96502659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'South Sinai',
  'جنوب سيناء',
  'EG-JS',
  'governorate',
  '{"type":"Polygon","coordinates":[[[32.9023615661966,27.59502659001078],[35.3596384338034,27.59502659001078],[35.3596384338034,29.750973409989218],[32.9023615661966,29.750973409989218],[32.9023615661966,27.59502659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'North Sinai',
  'شمال سيناء',
  'EG-SIN',
  'governorate',
  '{"type":"Polygon","coordinates":[[[32.37902830546824,29.41302659001078],[34.880971694531766,29.41302659001078],[34.880971694531766,31.56897340998922],[32.37902830546824,31.56897340998922],[32.37902830546824,29.41302659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Suez',
  'السويس',
  'EG-SUZ',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.281893180033585,28.89572659001078],[33.77070681996641,28.89572659001078],[33.77070681996641,31.05167340998922],[31.281893180033585,31.05167340998922],[31.281893180033585,28.89572659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Ismailia',
  'الإسماعيلية',
  'EG-IS',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.019867533541706,29.52632659001078],[33.524732466458296,29.52632659001078],[33.524732466458296,31.682273409989218],[31.019867533541706,31.682273409989218],[31.019867533541706,29.52632659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Port Said',
  'بورسعيد',
  'EG-PTS',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.040778018115873,30.18732659001078],[33.563021981884134,30.18732659001078],[33.563021981884134,32.34327340998922],[31.040778018115873,32.34327340998922],[31.040778018115873,30.18732659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Damietta',
  'دمياط',
  'EG-DT',
  'governorate',
  '{"type":"Polygon","coordinates":[[[30.54980791535724,30.34162659001078],[33.07619208464276,30.34162659001078],[33.07619208464276,32.49757340998922],[30.54980791535724,32.49757340998922],[30.54980791535724,30.34162659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Kafr El Sheikh',
  'كفر الشيخ',
  'EG-KFS',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.68202029470862,30.03392659001078],[32.200179705291376,30.03392659001078],[32.200179705291376,32.18987340998922],[29.68202029470862,32.18987340998922],[29.68202029470862,30.03392659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Faiyum',
  'الفيوم',
  'EG-FYM',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.606588439300943,28.23042659001078],[32.07901156069906,28.23042659001078],[32.07901156069906,30.38637340998922],[29.606588439300943,30.38637340998922],[29.606588439300943,28.23042659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Beni Suef',
  'بني سويف',
  'EG-BNS',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.865605221783408,27.98812659001078],[32.33219477821659,27.98812659001078],[32.33219477821659,30.14407340998922],[29.865605221783408,30.14407340998922],[29.865605221783408,27.98812659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Minya',
  'المنيا',
  'EG-MN',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.539419177042383,27.01012659001078],[31.983180822957614,27.01012659001078],[31.983180822957614,29.16607340998922],[29.539419177042383,29.16607340998922],[29.539419177042383,27.01012659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Asyut',
  'أسيوط',
  'EG-AST',
  'governorate',
  '{"type":"Polygon","coordinates":[[[29.959543678632468,26.10872659001078],[32.383256321367526,26.10872659001078],[32.383256321367526,28.264673409989218],[29.959543678632468,28.264673409989218],[29.959543678632468,26.10872659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Sohag',
  'سوهاج',
  'EG-SHG',
  'governorate',
  '{"type":"Polygon","coordinates":[[[30.489842207137364,25.48202659001078],[32.900157792862636,25.48202659001078],[32.900157792862636,27.63797340998922],[30.489842207137364,27.63797340998922],[30.489842207137364,25.48202659001078]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Qena',
  'قنا',
  'EG-KN',
  'governorate',
  '{"type":"Polygon","coordinates":[[[31.5209939514222,25.083026590010782],[33.923006048577804,25.083026590010782],[33.923006048577804,27.23897340998922],[31.5209939514222,27.23897340998922],[31.5209939514222,25.083026590010782]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'New Valley',
  'الوادي الجديد',
  'EG-WAD',
  'governorate',
  '{"type":"Polygon","coordinates":[[[25.98793888735278,23.467026590010782],[28.358061112647217,23.467026590010782],[28.358061112647217,25.62297340998922],[25.98793888735278,25.62297340998922],[25.98793888735278,23.467026590010782]]]}',
  0,
  1
);
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  1,
  'Matrouh',
  'مطروح',
  'EG-MT',
  'governorate',
  '{"type":"Polygon","coordinates":[[[25.179611124183683,28.49102659001078],[27.658388875816318,28.49102659001078],[27.658388875816318,30.64697340998922],[25.179611124183683,30.64697340998922],[25.179611124183683,28.49102659001078]]]}',
  0,
  1
);

-- ================================
-- CITIES (Districts + Areas + Neighborhoods)
-- ================================
-- ─── CITIES (Districts, Areas, Neighborhoods) ───
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Cairo City',
  'مدينة القاهرة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.152680399997006,29.97253510600072],[31.318719600002996,29.97253510600072],[31.318719600002996,30.11626489399928],[31.152680399997006,30.11626489399928],[31.152680399997006,29.97253510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Downtown Cairo',
  'وسط البلد',
  'district',
  '{"type":"Polygon","coordinates":[[[31.205866612815495,30.020750664750267],[31.268133387184502,30.020750664750267],[31.268133387184502,30.07464933524973],[31.205866612815495,30.07464933524973],[31.205866612815495,30.020750664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Garden City',
  'جاردن سيتي',
  'district',
  '{"type":"Polygon","coordinates":[[[31.198869661014744,30.011050664750268],[31.261130338985257,30.011050664750268],[31.261130338985257,30.064949335249732],[31.198869661014744,30.064949335249732],[31.198869661014744,30.011050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Zamalek',
  'الزمالك',
  'district',
  '{"type":"Polygon","coordinates":[[[31.187361361394785,30.037450664750267],[31.249638638605212,30.037450664750267],[31.249638638605212,30.09134933524973],[31.187361361394785,30.09134933524973],[31.187361361394785,30.037450664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Abdeen',
  'عابدين',
  'district',
  '{"type":"Polygon","coordinates":[[[31.210068592743276,30.014450664750267],[31.272331407256722,30.014450664750267],[31.272331407256722,30.06834933524973],[31.210068592743276,30.06834933524973],[31.210068592743276,30.014450664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Sayeda Zeinab',
  'السيدة زينب',
  'district',
  '{"type":"Polygon","coordinates":[[[31.205871545753457,30.005050664750268],[31.26812845424654,30.005050664750268],[31.26812845424654,30.058949335249732],[31.205871545753457,30.058949335249732],[31.205871545753457,30.005050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Old Cairo',
  'مصر القديمة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.19987970637525,29.979050664750268],[31.262120293624754,29.979050664750268],[31.262120293624754,30.032949335249732],[31.19987970637525,30.032949335249732],[31.19987970637525,29.979050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Fustat',
  'الفسطاط',
  'area',
  '{"type":"Polygon","coordinates":[[[31.210254392052118,29.98203377650018],[31.251745607947885,29.98203377650018],[31.251745607947885,30.01796622349982],[31.210254392052118,30.01796622349982],[31.210254392052118,29.98203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Manial',
  'المنيل',
  'district',
  '{"type":"Polygon","coordinates":[[[31.195871859821203,30.004050664750267],[31.258128140178798,30.004050664750267],[31.258128140178798,30.05794933524973],[31.195871859821203,30.05794933524973],[31.195871859821203,30.004050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Qasr El Nil',
  'قصر النيل',
  'district',
  '{"type":"Polygon","coordinates":[[[31.19706639278474,30.02145066475027],[31.25933360721526,30.02145066475027],[31.25933360721526,30.075349335249733],[31.19706639278474,30.075349335249733],[31.19706639278474,30.02145066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Bulaq',
  'بولاق',
  'district',
  '{"type":"Polygon","coordinates":[[[31.196863059942153,30.03205066475027],[31.25913694005785,30.03205066475027],[31.25913694005785,30.085949335249733],[31.196863059942153,30.085949335249733],[31.196863059942153,30.03205066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Rod El Farag',
  'رود الفرج',
  'district',
  '{"type":"Polygon","coordinates":[[[31.201858025865732,30.048050664750267],[31.26414197413427,30.048050664750267],[31.26414197413427,30.10194933524973],[31.201858025865732,30.10194933524973],[31.201858025865732,30.048050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Shubra',
  'شبرا',
  'district',
  '{"type":"Polygon","coordinates":[[[31.209858655347112,30.04605066475027],[31.272141344652887,30.04605066475027],[31.272141344652887,30.099949335249732],[31.209858655347112,30.099949335249732],[31.209858655347112,30.04605066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Sahel',
  'الساحل',
  'district',
  '{"type":"Polygon","coordinates":[[[31.213854247645937,30.060050664750268],[31.276145752354065,30.060050664750268],[31.276145752354065,30.113949335249732],[31.213854247645937,30.113949335249732],[31.213854247645937,30.060050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Zawya El Hamra',
  'الزاوية الحمراء',
  'district',
  '{"type":"Polygon","coordinates":[[[31.22784952166001,30.07505066475027],[31.290150478339992,30.07505066475027],[31.290150478339992,30.128949335249732],[31.22784952166001,30.128949335249732],[31.22784952166001,30.07505066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Hadayek El Kobba',
  'حدائق القبة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.241852357679832,30.066050664750268],[31.304147642320167,30.066050664750268],[31.304147642320167,30.119949335249732],[31.241852357679832,30.119949335249732],[31.241852357679832,30.066050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Saray El Kobba',
  'سريا القبة',
  'area',
  '{"type":"Polygon","coordinates":[[[31.25923385484794,30.08003377650018],[31.300766145152064,30.08003377650018],[31.300766145152064,30.115966223499818],[31.25923385484794,30.115966223499818],[31.25923385484794,30.08003377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Zeitoun',
  'الزيتون',
  'district',
  '{"type":"Polygon","coordinates":[[[31.254846999674548,30.083050664750267],[31.317153000325455,30.083050664750267],[31.317153000325455,30.13694933524973],[31.254846999674548,30.13694933524973],[31.254846999674548,30.083050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Matareya',
  'المطرية',
  'district',
  '{"type":"Polygon","coordinates":[[[31.253841321492562,30.101050664750268],[31.31615867850744,30.101050664750268],[31.31615867850744,30.154949335249732],[31.253841321492562,30.154949335249732],[31.253841321492562,30.101050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Ain Shams',
  'عين شمس',
  'district',
  '{"type":"Polygon","coordinates":[[[31.274841321492563,30.101050664750268],[31.33715867850744,30.101050664750268],[31.33715867850744,30.154949335249732],[31.274841321492563,30.154949335249732],[31.274841321492563,30.101050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Marg',
  'المرج',
  'district',
  '{"type":"Polygon","coordinates":[[[31.28883216248338,30.130050664750268],[31.35116783751662,30.130050664750268],[31.35116783751662,30.183949335249732],[31.28883216248338,30.183949335249732],[31.28883216248338,30.130050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Salam',
  'السلام',
  'district',
  '{"type":"Polygon","coordinates":[[[31.318828052379764,30.14305066475027],[31.38117194762024,30.14305066475027],[31.38117194762024,30.196949335249734],[31.318828052379764,30.196949335249734],[31.318828052379764,30.14305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Dar El Salam',
  'دار السلام',
  'district',
  '{"type":"Polygon","coordinates":[[[31.228887856314415,29.95305066475027],[31.291112143685588,29.95305066475027],[31.291112143685588,30.006949335249733],[31.228887856314415,30.006949335249733],[31.228887856314415,29.95305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Basatin',
  'البساتين',
  'district',
  '{"type":"Polygon","coordinates":[[[31.2288909880644,29.943050664750267],[31.291109011935603,29.943050664750267],[31.291109011935603,29.99694933524973],[31.2288909880644,29.99694933524973],[31.2288909880644,29.943050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Tora',
  'طرة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.248897872361226,29.92105066475027],[31.311102127638776,29.92105066475027],[31.311102127638776,29.974949335249732],[31.248897872361226,29.974949335249732],[31.248897872361226,29.92105066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Helwan',
  'حلوان',
  'city',
  '{"type":"Polygon","coordinates":[[[31.250142523149826,29.778135106000722],[31.41585747685017,29.778135106000722],[31.41585747685017,29.92186489399928],[31.250142523149826,29.92186489399928],[31.250142523149826,29.778135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Maasara',
  'المعصرة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.268912866171412,29.873050664750266],[31.33108713382859,29.873050664750266],[31.33108713382859,29.92694933524973],[31.268912866171412,29.92694933524973],[31.268912866171412,29.873050664750266]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Mokattam',
  'المقطم',
  'district',
  '{"type":"Polygon","coordinates":[[[31.288887856314414,29.95305066475027],[31.351112143685587,29.95305066475027],[31.351112143685587,30.006949335249733],[31.288887856314414,30.006949335249733],[31.288887856314414,29.95305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Nasr City',
  'مدينة نصر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.2469689984994,29.98613510600072],[31.413031001500595,29.98613510600072],[31.413031001500595,30.12986489399928],[31.2469689984994,30.12986489399928],[31.2469689984994,29.98613510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Heliopolis',
  'مصر الجديدة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.246937940171332,30.02313510600072],[31.413062059828665,30.02313510600072],[31.413062059828665,30.16686489399928],[31.246937940171332,30.16686489399928],[31.246937940171332,30.02313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Nozha',
  'النزهة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.320848260794236,30.07905066475027],[31.383151739205765,30.07905066475027],[31.383151739205765,30.132949335249734],[31.320848260794236,30.132949335249734],[31.320848260794236,30.07905066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Sheraton',
  'شيراتون',
  'area',
  '{"type":"Polygon","coordinates":[[[31.340236585005183,30.067033776500182],[31.38176341499482,30.067033776500182],[31.38176341499482,30.10296622349982],[31.340236585005183,30.10296622349982],[31.340236585005183,30.067033776500182]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'New Heliopolis',
  'هليوبوليس الجديدة',
  'area',
  '{"type":"Polygon","coordinates":[[[31.367227126843886,30.11203377650018],[31.408772873156117,30.11203377650018],[31.408772873156117,30.147966223499818],[31.367227126843886,30.147966223499818],[31.367227126843886,30.11203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'New Cairo',
  'القاهرة الجديدة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.357009204241564,29.938135106000722],[31.52299079575844,29.938135106000722],[31.52299079575844,30.08186489399928],[31.357009204241564,30.08186489399928],[31.357009204241564,29.938135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Fifth Settlement',
  'التجمع الخامس',
  'area',
  '{"type":"Polygon","coordinates":[[[31.445252301060393,29.992033776500183],[31.48674769893961,29.992033776500183],[31.48674769893961,30.02796622349982],[31.445252301060393,30.02796622349982],[31.445252301060393,29.992033776500183]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Rehab',
  'الرحاب',
  'area',
  '{"type":"Polygon","coordinates":[[[31.46924916259699,30.00703377650018],[31.510750837403005,30.00703377650018],[31.510750837403005,30.042966223499818],[31.46924916259699,30.042966223499818],[31.46924916259699,30.00703377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Katameya',
  'القطامية',
  'area',
  '{"type":"Polygon","coordinates":[[[31.469256481990595,29.97203377650018],[31.510743518009402,29.97203377650018],[31.510743518009402,30.007966223499817],[31.469256481990595,30.007966223499817],[31.469256481990595,29.97203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Shorouk',
  'الشروق',
  'city',
  '{"type":"Polygon","coordinates":[[[31.53690429845596,30.063135106000722],[31.703095701544044,30.063135106000722],[31.703095701544044,30.20686489399928],[31.53690429845596,30.20686489399928],[31.53690429845596,30.063135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Badr City',
  'مدينة بدر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.6418975619812,30.07113510600072],[31.808102438018803,30.07113510600072],[31.808102438018803,30.21486489399928],[31.6418975619812,30.21486489399928],[31.6418975619812,30.07113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Obour City',
  'مدينة العبور',
  'city',
  '{"type":"Polygon","coordinates":[[[31.436849486023622,30.12813510600072],[31.603150513976377,30.12813510600072],[31.603150513976377,30.27186489399928],[31.436849486023622,30.27186489399928],[31.436849486023622,30.12813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Madinaty',
  'مدينتي',
  'area',
  '{"type":"Polygon","coordinates":[[[31.531237214787744,30.06403377650018],[31.572762785212255,30.06403377650018],[31.572762785212255,30.09996622349982],[31.531237214787744,30.09996622349982],[31.531237214787744,30.06403377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Maadi',
  'المعادي',
  'district',
  '{"type":"Polygon","coordinates":[[[31.228894118236525,29.93305066475027],[31.291105881763478,29.93305066475027],[31.291105881763478,29.986949335249733],[31.228894118236525,29.986949335249733],[31.228894118236525,29.93305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'Maadi Degla',
  'المعادي دجلة',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[31.26755764729461,29.94922026590011],[31.292442352705393,29.94922026590011],[31.292442352705393,29.970779734099892],[31.26755764729461,29.970779734099892],[31.26755764729461,29.94922026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  '15th of May City',
  'مدينة ١٥ مايو',
  'city',
  '{"type":"Polygon","coordinates":[[[31.297134222191108,29.78813510600072],[31.46286577780889,29.78813510600072],[31.46286577780889,29.93186489399928],[31.297134222191108,29.93186489399928],[31.297134222191108,29.78813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  242,
  'El Tebbin',
  'التبين',
  'district',
  '{"type":"Polygon","coordinates":[[[31.318937775343024,29.793050664750268],[31.38106222465698,29.793050664750268],[31.38106222465698,29.846949335249732],[31.318937775343024,29.846949335249732],[31.318937775343024,29.793050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Alexandria City',
  'مدينة الإسكندرية',
  'city',
  '{"type":"Polygon","coordinates":[[[29.834683197675545,31.12823510600072],[30.002716802324457,31.12823510600072],[30.002716802324457,31.27196489399928],[29.834683197675545,31.27196489399928],[29.834683197675545,31.12823510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Smouha',
  'سموحة',
  'district',
  '{"type":"Polygon","coordinates":[[[29.92348706862087,31.193050664750267],[29.986512931379128,31.193050664750267],[29.986512931379128,31.24694933524973],[29.92348706862087,31.24694933524973],[29.92348706862087,31.193050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Sidi Bishr',
  'سيدي بشر',
  'district',
  '{"type":"Polygon","coordinates":[[[29.938476392667912,31.225050664750267],[30.001523607332086,31.225050664750267],[30.001523607332086,31.27894933524973],[29.938476392667912,31.27894933524973],[29.938476392667912,31.225050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Stanly',
  'ستانلي',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.932393226855226,31.221220265900108],[29.957606773144775,31.221220265900108],[29.957606773144775,31.24277973409989],[29.932393226855226,31.24277973409989],[29.932393226855226,31.221220265900108]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Gleem',
  'جليم',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.94239215926002,31.229220265900107],[29.967607840739976,31.229220265900107],[29.967607840739976,31.25077973409989],[29.94239215926002,31.25077973409989],[29.94239215926002,31.229220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Ibrahimeya',
  'الإبراهيمية',
  'district',
  '{"type":"Polygon","coordinates":[[[29.903488401915542,31.18905066475027],[29.966511598084455,31.18905066475027],[29.966511598084455,31.242949335249733],[29.903488401915542,31.242949335249733],[29.903488401915542,31.18905066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Sporting',
  'سبورتنج',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.917396160543234,31.19922026590011],[29.942603839456766,31.19922026590011],[29.942603839456766,31.220779734099892],[29.917396160543234,31.220779734099892],[29.917396160543234,31.19922026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Mostafa Kamel',
  'مصطفى كامل',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.90939722653976,31.19122026590011],[29.93460277346024,31.19122026590011],[29.93460277346024,31.212779734099893],[29.90939722653976,31.212779734099893],[29.90939722653976,31.19122026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Roushdy',
  'رشدي',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.936393493687376,31.21922026590011],[29.961606506312627,31.21922026590011],[29.961606506312627,31.240779734099892],[29.936393493687376,31.240779734099892],[29.936393493687376,31.21922026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Sidi Gaber',
  'سيدي جابر',
  'district',
  '{"type":"Polygon","coordinates":[[[29.906486068475022,31.196050664750267],[29.969513931524975,31.196050664750267],[29.969513931524975,31.24994933524973],[29.906486068475022,31.24994933524973],[29.906486068475022,31.196050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'San Stefano',
  'سان ستيفانو',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.94739189229456,31.23122026590011],[29.97260810770544,31.23122026590011],[29.97260810770544,31.252779734099892],[29.94739189229456,31.252779734099892],[29.94739189229456,31.23122026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Miami',
  'ميامي',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.964389488405004,31.24922026590011],[29.989610511594996,31.24922026590011],[29.989610511594996,31.270779734099893],[29.964389488405004,31.270779734099893],[29.964389488405004,31.24922026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Mandara',
  'المندرة',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.972387483512318,31.264220265900107],[29.99761251648768,31.264220265900107],[29.99761251648768,31.28577973409989],[29.972387483512318,31.28577973409989],[29.972387483512318,31.264220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Asafra',
  'العصافرة',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.97738627985565,31.273220265900108],[30.002613720144346,31.273220265900108],[30.002613720144346,31.29477973409989],[29.97738627985565,31.29477973409989],[29.97738627985565,31.273220265900108]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Montaza',
  'المنتزة',
  'district',
  '{"type":"Polygon","coordinates":[[[29.96846369279326,31.263050664750267],[30.03153630720674,31.263050664750267],[30.03153630720674,31.31694933524973],[29.96846369279326,31.31694933524973],[29.96846369279326,31.263050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Abu Qir',
  'أبو قير',
  'area',
  '{"type":"Polygon","coordinates":[[[30.041969099693898,31.30203377650018],[30.0840309003061,31.30203377650018],[30.0840309003061,31.33796622349982],[30.041969099693898,31.33796622349982],[30.041969099693898,31.30203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Kafr Abdou',
  'كفر عبده',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.935394294023904,31.21322026590011],[29.960605705976096,31.21322026590011],[29.960605705976096,31.23477973409989],[29.935394294023904,31.23477973409989],[29.935394294023904,31.21322026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Fleming',
  'فلمنغ',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.937392959996416,31.22322026590011],[29.962607040003583,31.22322026590011],[29.962607040003583,31.244779734099893],[29.937392959996416,31.244779734099893],[29.937392959996416,31.22322026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'El Saraya',
  'السرايا',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.920395627385194,31.203220265900107],[29.945604372614806,31.203220265900107],[29.945604372614806,31.22477973409989],[29.920395627385194,31.22477973409989],[29.920395627385194,31.203220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Muharram Bek',
  'محرم بك',
  'district',
  '{"type":"Polygon","coordinates":[[[29.87849573027581,31.167050664750267],[29.94150426972419,31.167050664750267],[29.94150426972419,31.22094933524973],[29.87849573027581,31.22094933524973],[29.87849573027581,31.167050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Mina El Basal',
  'مينا البصل',
  'district',
  '{"type":"Polygon","coordinates":[[[29.848500389585748,31.153050664750268],[29.91149961041425,31.153050664750268],[29.91149961041425,31.206949335249732],[29.848500389585748,31.206949335249732],[29.848500389585748,31.153050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Anfoushi',
  'الأنفوشي',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.872398025757608,31.18522026590011],[29.897601974242395,31.18522026590011],[29.897601974242395,31.206779734099893],[29.872398025757608,31.206779734099893],[29.872398025757608,31.18522026590011]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Bahari',
  'بحري',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.882397492972327,31.189220265900108],[29.907602507027672,31.189220265900108],[29.907602507027672,31.21077973409989],[29.882397492972327,31.21077973409989],[29.882397492972327,31.189220265900108]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Mansheya',
  'المنشية',
  'district',
  '{"type":"Polygon","coordinates":[[[29.861494398445693,31.17105066475027],[29.92450560155431,31.17105066475027],[29.92450560155431,31.224949335249732],[29.861494398445693,31.224949335249732],[29.861494398445693,31.17105066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Labban',
  'اللبان',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[29.87539988966783,31.171220265900107],[29.900600110332174,31.171220265900107],[29.900600110332174,31.19277973409989],[29.87539988966783,31.19277973409989],[29.87539988966783,31.171220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Dekheila',
  'الدخيلة',
  'district',
  '{"type":"Polygon","coordinates":[[[29.788517003395665,31.103050664750267],[29.851482996604336,31.103050664750267],[29.851482996604336,31.15694933524973],[29.788517003395665,31.15694933524973],[29.788517003395665,31.103050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'El Amreya',
  'العامرية',
  'district',
  '{"type":"Polygon","coordinates":[[[29.748550106706986,31.00305066475027],[29.811449893293016,31.00305066475027],[29.811449893293016,31.056949335249733],[29.748550106706986,31.056949335249733],[29.748550106706986,31.00305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'King Mariout',
  'كنج مريوط',
  'area',
  '{"type":"Polygon","coordinates":[[[29.809006908568502,31.13203377650018],[29.850993091431494,31.13203377650018],[29.850993091431494,31.167966223499818],[29.809006908568502,31.167966223499818],[29.809006908568502,31.13203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Borg El Arab',
  'برج العرب',
  'city',
  '{"type":"Polygon","coordinates":[[[29.496247717952436,30.82813510600072],[29.66375228204756,30.82813510600072],[29.66375228204756,30.971864893999278],[29.496247717952436,30.971864893999278],[29.496247717952436,30.82813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'Agamy',
  'العجمي',
  'district',
  '{"type":"Polygon","coordinates":[[[29.748517003395666,31.103050664750267],[29.811482996604337,31.103050664750267],[29.811482996604337,31.15694933524973],[29.748517003395666,31.15694933524973],[29.748517003395666,31.103050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  243,
  'El Max',
  'المكس',
  'area',
  '{"type":"Polygon","coordinates":[[[29.784014652965705,31.09703377650018],[29.825985347034294,31.09703377650018],[29.825985347034294,31.132966223499817],[29.784014652965705,31.132966223499817],[29.784014652965705,31.09703377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Giza City',
  'مدينة الجيزة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.125906610556097,29.941235106000722],[31.291893389443903,29.941235106000722],[31.291893389443903,30.08496489399928],[31.125906610556097,30.08496489399928],[31.125906610556097,29.941235106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Mohandessin',
  'المهندسين',
  'district',
  '{"type":"Polygon","coordinates":[[[31.170865952699955,30.02285066475027],[31.233134047300048,30.02285066475027],[31.233134047300048,30.076749335249733],[31.170865952699955,30.076749335249733],[31.170865952699955,30.02285066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Agouza',
  'العجوزة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.178864946675343,30.02605066475027],[31.24113505332466,30.02605066475027],[31.24113505332466,30.079949335249733],[31.178864946675343,30.079949335249733],[31.178864946675343,30.02605066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Dokki',
  'الدقي',
  'district',
  '{"type":"Polygon","coordinates":[[[31.174869346836243,30.01205066475027],[31.237130653163756,30.01205066475027],[31.237130653163756,30.065949335249734],[31.174869346836243,30.065949335249734],[31.174869346836243,30.01205066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Imbaba',
  'إمبابة',
  'district',
  '{"type":"Polygon","coordinates":[[[31.178858025865733,30.048050664750267],[31.24114197413427,30.048050664750267],[31.24114197413427,30.10194933524973],[31.178858025865733,30.10194933524973],[31.178858025865733,30.048050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Bulaq El Dakrour',
  'بولاق الدكرور',
  'district',
  '{"type":"Polygon","coordinates":[[[31.14787028932427,30.00905066475027],[31.210129710675726,30.00905066475027],[31.210129710675726,30.062949335249733],[31.14787028932427,30.062949335249733],[31.14787028932427,30.00905066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Mit Okba',
  'ميت عقبة',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[31.187545098172475,30.049220265900107],[31.212454901827524,30.049220265900107],[31.212454901827524,30.07077973409989],[31.187545098172475,30.07077973409989],[31.187545098172475,30.049220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Faisal',
  'فيصل',
  'district',
  '{"type":"Polygon","coordinates":[[[31.15887939270279,29.98005066475027],[31.221120607297213,29.98005066475027],[31.221120607297213,30.033949335249734],[31.15887939270279,30.033949335249734],[31.15887939270279,29.98005066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Haram',
  'الهرم',
  'district',
  '{"type":"Polygon","coordinates":[[[31.135885036389798,29.96205066475027],[31.198114963610205,29.96205066475027],[31.198114963610205,30.015949335249733],[31.135885036389798,30.015949335249733],[31.135885036389798,29.96205066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Remaya',
  'الرماية',
  'area',
  '{"type":"Polygon","coordinates":[[[31.1342606587096,29.95203377650018],[31.175739341290402,29.95203377650018],[31.175739341290402,29.987966223499818],[31.1342606587096,29.987966223499818],[31.1342606587096,29.95203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Omraniya',
  'العمرانية',
  'district',
  '{"type":"Polygon","coordinates":[[[31.15688158807817,29.973050664750268],[31.219118411921826,29.973050664750268],[31.219118411921826,30.026949335249732],[31.15688158807817,30.026949335249732],[31.15688158807817,29.973050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Talbiya',
  'الطالبية',
  'area',
  '{"type":"Polygon","coordinates":[[[31.159258570876275,29.96203377650018],[31.200741429123724,29.96203377650018],[31.200741429123724,29.99796622349982],[31.159258570876275,29.99796622349982],[31.159258570876275,29.96203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Kerdasa',
  'كرداسة',
  'area',
  '{"type":"Polygon","coordinates":[[[31.094247278380337,30.01603377650018],[31.13575272161966,30.01603377650018],[31.13575272161966,30.051966223499818],[31.094247278380337,30.051966223499818],[31.094247278380337,30.01603377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Mansoureya',
  'المنصورية',
  'area',
  '{"type":"Polygon","coordinates":[[[31.12923658500518,30.067033776500182],[31.170763414994816,30.067033776500182],[31.170763414994816,30.10296622349982],[31.12923658500518,30.10296622349982],[31.12923658500518,30.067033776500182]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Warraq',
  'الوراق',
  'district',
  '{"type":"Polygon","coordinates":[[[31.18584983683678,30.074050664750267],[31.248150163163217,30.074050664750267],[31.248150163163217,30.12794933524973],[31.18584983683678,30.12794933524973],[31.18584983683678,30.074050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Abu Nomros',
  'أبو نمرس',
  'area',
  '{"type":"Polygon","coordinates":[[[31.209259406135864,29.95803377650018],[31.250740593864137,29.95803377650018],[31.250740593864137,29.993966223499818],[31.209259406135864,29.993966223499818],[31.209259406135864,29.95803377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Badrashin',
  'البدرشين',
  'area',
  '{"type":"Polygon","coordinates":[[[31.239283970679462,29.84003377650018],[31.28071602932054,29.84003377650018],[31.28071602932054,29.87596622349982],[31.239283970679462,29.87596622349982],[31.239283970679462,29.84003377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Hawamdeya',
  'الحوامدية',
  'area',
  '{"type":"Polygon","coordinates":[[[31.229275244114273,29.88203377650018],[31.270724755885727,29.88203377650018],[31.270724755885727,29.917966223499818],[31.229275244114273,29.917966223499818],[31.229275244114273,29.88203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Atfeh',
  'العطف',
  'area',
  '{"type":"Polygon","coordinates":[[[31.262306325694087,29.73203377650018],[31.303693674305915,29.73203377650018],[31.303693674305915,29.76796622349982],[31.262306325694087,29.76796622349982],[31.262306325694087,29.73203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'El Saf',
  'الصف',
  'area',
  '{"type":"Polygon","coordinates":[[[31.279326916380114,29.63203377650018],[31.320673083619887,29.63203377650018],[31.320673083619887,29.667966223499818],[31.279326916380114,29.667966223499818],[31.279326916380114,29.63203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Awsim',
  'أوسيم',
  'area',
  '{"type":"Polygon","coordinates":[[[31.144229651115495,30.10003377650018],[31.185770348884503,30.10003377650018],[31.185770348884503,30.135966223499818],[31.144229651115495,30.135966223499818],[31.144229651115495,30.10003377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Dahshur',
  'دهشور',
  'area',
  '{"type":"Polygon","coordinates":[[[31.209300128185184,29.762033776500182],[31.250699871814817,29.762033776500182],[31.250699871814817,29.79796622349982],[31.209300128185184,29.79796622349982],[31.209300128185184,29.762033776500182]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Sakiet Mekki',
  'ساقية مكي',
  'neighborhood',
  '{"type":"Polygon","coordinates":[[[31.172545098172474,30.049220265900107],[31.197454901827523,30.049220265900107],[31.197454901827523,30.07077973409989],[31.172545098172474,30.07077973409989],[31.172545098172474,30.049220265900107]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  '6th of October City',
  'مدينة السادس من أكتوبر',
  'city',
  '{"type":"Polygon","coordinates":[[[30.84706766359957,29.86813510600072],[31.01293233640043,29.86813510600072],[31.01293233640043,30.01186489399928],[30.84706766359957,30.01186489399928],[30.84706766359957,29.86813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'Sheikh Zayed City',
  'مدينة الشيخ زايد',
  'city',
  '{"type":"Polygon","coordinates":[[[30.9169882758808,29.96313510600072],[31.0830117241192,29.96313510600072],[31.0830117241192,30.10686489399928],[30.9169882758808,30.10686489399928],[30.9169882758808,29.96313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  244,
  'New October',
  'أكتوبر الجديدة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.92713422219111,29.78813510600072],[31.092865777808893,29.78813510600072],[31.092865777808893,29.93186489399928],[30.92713422219111,29.93186489399928],[30.92713422219111,29.78813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Zagazig',
  'الزقازيق',
  'city',
  '{"type":"Polygon","coordinates":[[[31.41851880507433,30.515835106000722],[31.585481194925666,30.515835106000722],[31.585481194925666,30.65956489399928],[31.41851880507433,30.65956489399928],[31.41851880507433,30.515835106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Belbeis',
  'بلبيس',
  'city',
  '{"type":"Polygon","coordinates":[[[31.476662632045713,30.348135106000722],[31.643337367954285,30.348135106000722],[31.643337367954285,30.49186489399928],[31.476662632045713,30.49186489399928],[31.476662632045713,30.348135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  '10th of Ramadan City',
  'مدينة العاشر من رمضان',
  'city',
  '{"type":"Polygon","coordinates":[[[31.64675631730334,30.23813510600072],[31.813243682696662,30.23813510600072],[31.813243682696662,30.38186489399928],[31.64675631730334,30.38186489399928],[31.64675631730334,30.23813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Abu Hammad',
  'أبو حماد',
  'city',
  '{"type":"Polygon","coordinates":[[[31.556555541436055,30.473135106000722],[31.723444458563947,30.473135106000722],[31.723444458563947,30.61686489399928],[31.556555541436055,30.61686489399928],[31.556555541436055,30.473135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Abu Kabir',
  'أبو كبير',
  'city',
  '{"type":"Polygon","coordinates":[[[31.586411416358345,30.64013510600072],[31.75358858364166,30.64013510600072],[31.75358858364166,30.78386489399928],[31.586411416358345,30.78386489399928],[31.586411416358345,30.64013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Faqous',
  'فاقوس',
  'city',
  '{"type":"Polygon","coordinates":[[[31.716395809757525,30.65813510600072],[31.883604190242476,30.65813510600072],[31.883604190242476,30.80186489399928],[31.716395809757525,30.80186489399928],[31.716395809757525,30.65813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Hehya',
  'ههيا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.519446047327,30.60013510600072],[31.686553952673002,30.60013510600072],[31.686553952673002,30.74386489399928],[31.519446047327,30.74386489399928],[31.519446047327,30.60013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Mashtoul El Souk',
  'مشتول السوق',
  'city',
  '{"type":"Polygon","coordinates":[[[31.456602744098994,30.41813510600072],[31.623397255901004,30.41813510600072],[31.623397255901004,30.561864893999278],[31.456602744098994,30.561864893999278],[31.456602744098994,30.41813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Minya El Qamh',
  'منيا القمح',
  'city',
  '{"type":"Polygon","coordinates":[[[31.26658559456728,30.438135106000722],[31.43341440543272,30.438135106000722],[31.43341440543272,30.58186489399928],[31.26658559456728,30.58186489399928],[31.26658559456728,30.438135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Diarb Negm',
  'ديرب نجم',
  'city',
  '{"type":"Polygon","coordinates":[[[31.376375847493648,30.68113510600072],[31.543624152506354,30.68113510600072],[31.543624152506354,30.82486489399928],[31.376375847493648,30.82486489399928],[31.376375847493648,30.68113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Kafr Saqr',
  'كفر صقر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.546341075676533,30.72113510600072],[31.713658924323465,30.72113510600072],[31.713658924323465,30.86486489399928],[31.546341075676533,30.86486489399928],[31.546341075676533,30.72113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Awlad Saqr',
  'أولاد صقر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.66629140531451,30.778135106000722],[31.83370859468549,30.778135106000722],[31.83370859468549,30.92186489399928],[31.66629140531451,30.92186489399928],[31.66629140531451,30.778135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Husseiniya',
  'الحسينية',
  'city',
  '{"type":"Polygon","coordinates":[[[31.836282676588453,30.78813510600072],[32.00371732341155,30.78813510600072],[32.00371732341155,30.93186489399928],[31.836282676588453,30.93186489399928],[31.836282676588453,30.78813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'Qenayen',
  'قناين',
  'city',
  '{"type":"Polygon","coordinates":[[[31.496508208331097,30.528135106000722],[31.6634917916689,30.528135106000722],[31.6634917916689,30.67186489399928],[31.496508208331097,30.67186489399928],[31.496508208331097,30.528135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  245,
  'San El Hagar',
  'صان الحجر',
  'area',
  '{"type":"Polygon","coordinates":[[[31.899061929488113,30.88203377650018],[31.94093807051189,30.88203377650018],[31.94093807051189,30.917966223499818],[31.899061929488113,30.917966223499818],[31.899061929488113,30.88203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Mansoura',
  'المنصورة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.47711705576325,30.97693510600072],[31.64488294423675,30.97693510600072],[31.64488294423675,31.12066489399928],[31.47711705576325,31.12066489399928],[31.47711705576325,30.97693510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Mit Ghamr',
  'ميت غمر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.176407082603497,30.64513510600072],[31.343592917396506,30.64513510600072],[31.343592917396506,30.78886489399928],[31.176407082603497,30.78886489399928],[31.176407082603497,30.64513510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Talkha',
  'طلخا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.316115998077773,30.97813510600072],[31.483884001922224,30.97813510600072],[31.483884001922224,31.12186489399928],[31.316115998077773,31.12186489399928],[31.316115998077773,30.97813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Nabaroh',
  'نبروه',
  'city',
  '{"type":"Polygon","coordinates":[[[31.23307098773251,31.02913510600072],[31.40092901226749,31.02913510600072],[31.40092901226749,31.17286489399928],[31.23307098773251,31.17286489399928],[31.23307098773251,31.02913510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Sherbin',
  'شربين',
  'city',
  '{"type":"Polygon","coordinates":[[[31.445992164906126,31.11813510600072],[31.614007835093876,31.11813510600072],[31.614007835093876,31.26186489399928],[31.445992164906126,31.26186489399928],[31.445992164906126,31.11813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'El Senbellawein',
  'السنبلاوين',
  'city',
  '{"type":"Polygon","coordinates":[[[31.38626083564481,30.813135106000722],[31.55373916435519,30.813135106000722],[31.55373916435519,30.95686489399928],[31.38626083564481,30.95686489399928],[31.38626083564481,30.813135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Temay El Amdeed',
  'تمي الأمديد',
  'city',
  '{"type":"Polygon","coordinates":[[[31.2562652060206,30.80813510600072],[31.4237347939794,30.80813510600072],[31.4237347939794,30.95186489399928],[31.2562652060206,30.95186489399928],[31.2562652060206,30.80813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Manzala',
  'المنزلة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.74596551632232,31.14813510600072],[31.914034483677675,31.14813510600072],[31.914034483677675,31.29186489399928],[31.74596551632232,31.29186489399928],[31.74596551632232,31.14813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Gamasa',
  'جمصة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.43578054900813,31.35513510600072],[31.60421945099187,31.35513510600072],[31.60421945099187,31.49886489399928],[31.43578054900813,31.49886489399928],[31.43578054900813,31.35513510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Dekernes',
  'دكرنس',
  'city',
  '{"type":"Polygon","coordinates":[[[31.29623896735098,30.83813510600072],[31.463761032649018,30.83813510600072],[31.463761032649018,30.98186489399928],[31.29623896735098,30.98186489399928],[31.29623896735098,30.83813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Belqas',
  'بلقاس',
  'city',
  '{"type":"Polygon","coordinates":[[[31.275961071007604,31.153135106000722],[31.444038928992395,31.153135106000722],[31.444038928992395,31.29686489399928],[31.275961071007604,31.29686489399928],[31.275961071007604,31.153135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Aga',
  'أجا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.216203921118165,30.87813510600072],[31.383796078881836,30.87813510600072],[31.383796078881836,31.02186489399928],[31.216203921118165,31.02186489399928],[31.216203921118165,30.87813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Mit Salsil',
  'ميت سلسيل',
  'city',
  '{"type":"Polygon","coordinates":[[[31.25631756528402,30.74813510600072],[31.423682434715978,30.74813510600072],[31.423682434715978,30.89186489399928],[31.25631756528402,30.89186489399928],[31.25631756528402,30.74813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Beni Ebid',
  'بني عبيد',
  'city',
  '{"type":"Polygon","coordinates":[[[31.27612481018438,30.96813510600072],[31.443875189815618,30.96813510600072],[31.443875189815618,31.11186489399928],[31.27612481018438,31.11186489399928],[31.27612481018438,30.96813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  246,
  'Minet El Nasr',
  'منية النصر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.616036490543735,31.06813510600072],[31.783963509456264,31.06813510600072],[31.783963509456264,31.21186489399928],[31.616036490543735,31.21186489399928],[31.616036490543735,31.06813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Damanhur',
  'دمنهور',
  'city',
  '{"type":"Polygon","coordinates":[[[30.384125779247107,30.967035106000722],[30.551874220752893,30.967035106000722],[30.551874220752893,31.11076489399928],[30.384125779247107,31.11076489399928],[30.384125779247107,30.967035106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Kafr El Dawwar',
  'كفر الدوار',
  'city',
  '{"type":"Polygon","coordinates":[[[30.04604534238844,31.05813510600072],[30.21395465761156,31.05813510600072],[30.21395465761156,31.20186489399928],[30.04604534238844,31.20186489399928],[30.04604534238844,31.05813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Rashid',
  'رشيد',
  'city',
  '{"type":"Polygon","coordinates":[[[30.335802989657484,31.33013510600072],[30.50419701034252,31.33013510600072],[30.50419701034252,31.47386489399928],[30.335802989657484,31.47386489399928],[30.335802989657484,31.33013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Edku',
  'إدكو',
  'city',
  '{"type":"Polygon","coordinates":[[[30.211899612165215,31.22213510600072],[30.380100387834784,31.22213510600072],[30.380100387834784,31.36586489399928],[30.211899612165215,31.36586489399928],[30.211899612165215,31.22213510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Abu El Matamir',
  'أبو المطامير',
  'city',
  '{"type":"Polygon","coordinates":[[[30.086212689254236,30.86813510600072],[30.253787310745768,30.86813510600072],[30.253787310745768,31.01186489399928],[30.086212689254236,31.01186489399928],[30.086212689254236,30.86813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Housh Essa',
  'حوش عيسى',
  'city',
  '{"type":"Polygon","coordinates":[[[30.216238967350982,30.83813510600072],[30.38376103264902,30.83813510600072],[30.38376103264902,30.98186489399928],[30.216238967350982,30.98186489399928],[30.216238967350982,30.83813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Wadi El Natrun',
  'وادي النطرون',
  'city',
  '{"type":"Polygon","coordinates":[[[30.109700168288818,30.30413510600072],[30.276299831711185,30.30413510600072],[30.276299831711185,30.44786489399928],[30.109700168288818,30.44786489399928],[30.109700168288818,30.30413510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Kom Hamada',
  'كوم حمادة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.606369767454506,30.688135106000722],[30.773630232545496,30.688135106000722],[30.773630232545496,30.83186489399928],[30.606369767454506,30.83186489399928],[30.606369767454506,30.688135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Mahmoudia',
  'المحمودية',
  'city',
  '{"type":"Polygon","coordinates":[[[30.44099660245495,31.11313510600072],[30.60900339754505,31.11313510600072],[30.60900339754505,31.25686489399928],[30.44099660245495,31.25686489399928],[30.44099660245495,31.11313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Rahmaniya',
  'الرحمانية',
  'city',
  '{"type":"Polygon","coordinates":[[[30.60609836063976,30.99813510600072],[30.773901639360243,30.99813510600072],[30.773901639360243,31.14186489399928],[30.60609836063976,31.14186489399928],[30.60609836063976,30.99813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Itay El Barud',
  'إيتاي البارود',
  'city',
  '{"type":"Polygon","coordinates":[[[30.586256464175012,30.81813510600072],[30.75374353582499,30.81813510600072],[30.75374353582499,30.96186489399928],[30.586256464175012,30.96186489399928],[30.586256464175012,30.81813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Shubra Khit',
  'شبراخيت',
  'city',
  '{"type":"Polygon","coordinates":[[[30.626133617885298,30.95813510600072],[30.793866382114704,30.95813510600072],[30.793866382114704,31.10186489399928],[30.626133617885298,31.10186489399928],[30.626133617885298,30.95813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  247,
  'Badr Center',
  'مركز بدر',
  'city',
  '{"type":"Polygon","coordinates":[[[30.116334983442094,30.72813510600072],[30.283665016557904,30.72813510600072],[30.283665016557904,30.87186489399928],[30.116334983442094,30.87186489399928],[30.116334983442094,30.72813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Tanta',
  'طنطا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.91634673083903,30.71463510600072],[31.08365326916097,30.71463510600072],[31.08365326916097,30.85836489399928],[30.91634673083903,30.85836489399928],[30.91634673083903,30.71463510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'El Mahalla El Kubra',
  'المحلة الكبرى',
  'city',
  '{"type":"Polygon","coordinates":[[[31.076184615768845,30.90013510600072],[31.243815384231155,30.90013510600072],[31.243815384231155,31.04386489399928],[31.076184615768845,31.04386489399928],[31.076184615768845,30.90013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Samanoud',
  'سمنود',
  'city',
  '{"type":"Polygon","coordinates":[[[31.156195148593664,30.88813510600072],[31.323804851406333,30.88813510600072],[31.323804851406333,31.03186489399928],[31.156195148593664,31.03186489399928],[31.156195148593664,30.88813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Zefta',
  'زفتى',
  'city',
  '{"type":"Polygon","coordinates":[[[31.156404481829288,30.64813510600072],[31.32359551817071,30.64813510600072],[31.32359551817071,30.79186489399928],[31.156404481829288,30.79186489399928],[31.156404481829288,30.64813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Kafr El Zayat',
  'كفر الزيات',
  'city',
  '{"type":"Polygon","coordinates":[[[30.74631756528402,30.74813510600072],[30.913682434715977,30.74813510600072],[30.913682434715977,30.89186489399928],[30.74631756528402,30.89186489399928],[30.74631756528402,30.74813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Santa',
  'سنطة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.916378452572015,30.67813510600072],[31.083621547427985,30.67813510600072],[31.083621547427985,30.82186489399928],[30.916378452572015,30.82186489399928],[30.916378452572015,30.67813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Basyoun',
  'بسيون',
  'city',
  '{"type":"Polygon","coordinates":[[[30.656203921118163,30.87813510600072],[30.823796078881834,30.87813510600072],[30.823796078881834,31.02186489399928],[30.656203921118163,31.02186489399928],[30.656203921118163,30.87813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  248,
  'Qutur',
  'قطور',
  'city',
  '{"type":"Polygon","coordinates":[[[30.74629140531451,30.778135106000722],[30.913708594685488,30.778135106000722],[30.913708594685488,30.92186489399928],[30.74629140531451,30.92186489399928],[30.74629140531451,30.778135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Shibin El Kom',
  'شبين الكوم',
  'city',
  '{"type":"Polygon","coordinates":[[[30.92154436539486,30.48613510600072],[31.08845563460514,30.48613510600072],[31.08845563460514,30.62986489399928],[30.92154436539486,30.62986489399928],[30.92154436539486,30.48613510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Menouf',
  'منوف',
  'city',
  '{"type":"Polygon","coordinates":[[[30.84662158870947,30.39613510600072],[31.013378411290528,30.39613510600072],[31.013378411290528,30.53986489399928],[30.84662158870947,30.53986489399928],[30.84662158870947,30.39613510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Ashmoun',
  'أشمون',
  'city',
  '{"type":"Polygon","coordinates":[[[30.96675631730334,30.23813510600072],[31.133243682696662,30.23813510600072],[31.133243682696662,30.38186489399928],[30.96675631730334,30.38186489399928],[30.96675631730334,30.23813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Tala',
  'تلا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.856439126686947,30.60813510600072],[31.023560873313055,30.60813510600072],[31.023560873313055,30.75186489399928],[30.856439126686947,30.75186489399928],[30.856439126686947,30.60813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Quwaysna',
  'قويسنا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.066538344506597,30.49313510600072],[31.2334616554934,30.49313510600072],[31.2334616554934,30.63686489399928],[31.066538344506597,30.63686489399928],[31.066538344506597,30.49313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Berket El Saba',
  'بركة السبع',
  'city',
  '{"type":"Polygon","coordinates":[[[30.99648233518355,30.55813510600072],[31.163517664816446,30.55813510600072],[31.163517664816446,30.70186489399928],[30.99648233518355,30.70186489399928],[30.99648233518355,30.55813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Sadat City',
  'مدينة السادات',
  'city',
  '{"type":"Polygon","coordinates":[[[30.4467052804425,30.29813510600072],[30.6132947195575,30.29813510600072],[30.6132947195575,30.44186489399928],[30.4467052804425,30.44186489399928],[30.4467052804425,30.29813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'El Shohada',
  'الشهداء',
  'city',
  '{"type":"Polygon","coordinates":[[[30.79652543548123,30.50813510600072],[30.96347456451877,30.50813510600072],[30.96347456451877,30.651864893999278],[30.79652543548123,30.651864893999278],[30.79652543548123,30.50813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  249,
  'Bajour',
  'الباجور',
  'city',
  '{"type":"Polygon","coordinates":[[[30.956654089506593,30.35813510600072],[31.123345910493406,30.35813510600072],[31.123345910493406,30.50186489399928],[30.956654089506593,30.50186489399928],[30.956654089506593,30.35813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Banha',
  'بنها',
  'city',
  '{"type":"Polygon","coordinates":[[[31.094619020215198,30.39913510600072],[31.261380979784803,30.39913510600072],[31.261380979784803,30.54286489399928],[31.094619020215198,30.54286489399928],[31.094619020215198,30.39913510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Qalyub',
  'قليوب',
  'city',
  '{"type":"Polygon","coordinates":[[[31.11684948602362,30.12813510600072],[31.283150513976377,30.12813510600072],[31.283150513976377,30.27186489399928],[31.11684948602362,30.27186489399928],[31.11684948602362,30.12813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Shubra El Kheima',
  'شبرا الخيمة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.146910190646828,30.05613510600072],[31.313089809353173,30.05613510600072],[31.313089809353173,30.19986489399928],[31.146910190646828,30.19986489399928],[31.146910190646828,30.05613510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Khanka',
  'الخانكة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.266841037420754,30.13813510600072],[31.43315896257925,30.13813510600072],[31.43315896257925,30.28186489399928],[31.266841037420754,30.28186489399928],[31.266841037420754,30.13813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Toukh',
  'طوخ',
  'city',
  '{"type":"Polygon","coordinates":[[[31.116722309829363,30.278135106000722],[31.283277690170635,30.278135106000722],[31.283277690170635,30.42186489399928],[31.116722309829363,30.42186489399928],[31.116722309829363,30.278135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Kafr Shukr',
  'كفر شكر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.2267052804425,30.29813510600072],[31.3932947195575,30.29813510600072],[31.3932947195575,30.44186489399928],[31.2267052804425,30.44186489399928],[31.2267052804425,30.29813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Qaha',
  'قها',
  'city',
  '{"type":"Polygon","coordinates":[[[31.116790256475046,30.19813510600072],[31.283209743524953,30.19813510600072],[31.283209743524953,30.34186489399928],[31.116790256475046,30.34186489399928],[31.116790256475046,30.19813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'El Qanater El Khayreya',
  'القناطر الخيرية',
  'city',
  '{"type":"Polygon","coordinates":[[[31.05685793037759,30.11813510600072],[31.223142069622412,30.11813510600072],[31.223142069622412,30.26186489399928],[31.05685793037759,30.26186489399928],[31.05685793037759,30.11813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'Shebin El Qanater',
  'شبين القناطر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.236790256475047,30.19813510600072],[31.403209743524954,30.19813510600072],[31.403209743524954,30.34186489399928],[31.236790256475047,30.34186489399928],[31.236790256475047,30.19813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  250,
  'El Ubour',
  'العبور',
  'city',
  '{"type":"Polygon","coordinates":[[[31.356849486023624,30.12813510600072],[31.52315051397638,30.12813510600072],[31.52315051397638,30.27186489399928],[31.356849486023624,30.27186489399928],[31.356849486023624,30.12813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Aswan City',
  'مدينة أسوان',
  'city',
  '{"type":"Polygon","coordinates":[[[32.821079603847366,24.01703510600072],[32.97852039615263,24.01703510600072],[32.97852039615263,24.16076489399928],[32.821079603847366,24.16076489399928],[32.821079603847366,24.01703510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Edfu',
  'إدفو',
  'city',
  '{"type":"Polygon","coordinates":[[[32.79872005198613,24.906135106000722],[32.95727994801387,24.906135106000722],[32.95727994801387,25.04986489399928],[32.79872005198613,25.04986489399928],[32.79872005198613,24.906135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Kom Ombo',
  'كوم أمبو',
  'city',
  '{"type":"Polygon","coordinates":[[[32.87104305754492,24.39813510600072],[33.02895694245509,24.39813510600072],[33.02895694245509,24.54186489399928],[32.87104305754492,24.54186489399928],[32.87104305754492,24.39813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Daraw',
  'دراو',
  'city',
  '{"type":"Polygon","coordinates":[[[32.851077499177364,24.34313510600072],[33.008922500822635,24.34313510600072],[33.008922500822635,24.48686489399928],[32.851077499177364,24.48686489399928],[32.851077499177364,24.34313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Nasr El Nuba',
  'نصر النوبة',
  'city',
  '{"type":"Polygon","coordinates":[[[32.821443571047844,23.74813510600072],[32.97855642895215,23.74813510600072],[32.97855642895215,23.89186489399928],[32.821443571047844,23.89186489399928],[32.821443571047844,23.74813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Abu Simbel',
  'أبو سمبل',
  'city',
  '{"type":"Polygon","coordinates":[[[31.547300223684292,22.27413510600072],[31.702699776315708,22.27413510600072],[31.702699776315708,22.41786489399928],[31.547300223684292,22.41786489399928],[31.547300223684292,22.27413510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  251,
  'Kalabsha',
  'كلابشة',
  'area',
  '{"type":"Polygon","coordinates":[[[32.85040591626361,23.50203377650018],[32.889594083736384,23.50203377650018],[32.889594083736384,23.53796622349982],[32.85040591626361,23.53796622349982],[32.85040591626361,23.50203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  252,
  'Luxor City',
  'مدينة الأقصر',
  'city',
  '{"type":"Polygon","coordinates":[[[32.55985413113096,25.61533510600072],[32.71934586886904,25.61533510600072],[32.71934586886904,25.75906489399928],[32.55985413113096,25.75906489399928],[32.55985413113096,25.61533510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  252,
  'Esna',
  'إسنا',
  'city',
  '{"type":"Polygon","coordinates":[[[32.474515284210085,25.22113510600072],[32.63348471578992,25.22113510600072],[32.63348471578992,25.36486489399928],[32.474515284210085,25.36486489399928],[32.474515284210085,25.22113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  252,
  'Armant',
  'أرمنت',
  'city',
  '{"type":"Polygon","coordinates":[[[32.450299705645925,25.54713510600072],[32.60970029435408,25.54713510600072],[32.60970029435408,25.69086489399928],[32.450299705645925,25.69086489399928],[32.450299705645925,25.54713510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  252,
  'El Karnak',
  'الكرنك',
  'area',
  '{"type":"Polygon","coordinates":[[[32.6370580384415,25.70203377650018],[32.67694196155849,25.70203377650018],[32.67694196155849,25.737966223499818],[32.6370580384415,25.737966223499818],[32.6370580384415,25.70203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  252,
  'El West Bank',
  'البر الغربي',
  'area',
  '{"type":"Polygon","coordinates":[[[32.58006138978724,25.68203377650018],[32.61993861021276,25.68203377650018],[32.61993861021276,25.71796622349982],[32.58006138978724,25.71796622349982],[32.58006138978724,25.68203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Hurghada',
  'الغردقة',
  'city',
  '{"type":"Polygon","coordinates":[[[33.73075798871053,27.18593510600072],[33.89244201128947,27.18593510600072],[33.89244201128947,27.32966489399928],[33.73075798871053,27.32966489399928],[33.73075798871053,27.18593510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Marsa Alam',
  'مرسى علم',
  'city',
  '{"type":"Polygon","coordinates":[[[34.8106651373351,24.99113510600072],[34.9693348626649,24.99113510600072],[34.9693348626649,25.13486489399928],[34.8106651373351,25.13486489399928],[34.8106651373351,24.99113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'El Gouna',
  'الجونة',
  'city',
  '{"type":"Polygon","coordinates":[[[33.591065217115634,27.313135106000722],[33.75293478288436,27.313135106000722],[33.75293478288436,27.45686489399928],[33.591065217115634,27.45686489399928],[33.591065217115634,27.313135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Safaga',
  'سفاجا',
  'city',
  '{"type":"Polygon","coordinates":[[[33.85952937514001,26.66813510600072],[34.02047062485998,26.66813510600072],[34.02047062485998,26.811864893999278],[33.85952937514001,26.811864893999278],[33.85952937514001,26.66813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Qusayr',
  'القصير',
  'city',
  '{"type":"Polygon","coordinates":[[[34.19996926074917,26.03613510600072],[34.36003073925083,26.03613510600072],[34.36003073925083,26.17986489399928],[34.19996926074917,26.17986489399928],[34.19996926074917,26.03613510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Ras Ghareb',
  'رأس غارب',
  'city',
  '{"type":"Polygon","coordinates":[[[32.9883335294253,28.28813510600072],[33.1516664705747,28.28813510600072],[33.1516664705747,28.43186489399928],[32.9883335294253,28.43186489399928],[32.9883335294253,28.28813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Shalateen',
  'شلاتين',
  'city',
  '{"type":"Polygon","coordinates":[[[35.50185336230046,23.05813510600072],[35.65814663769954,23.05813510600072],[35.65814663769954,23.20186489399928],[35.50185336230046,23.20186489399928],[35.50185336230046,23.05813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Abu Ramad',
  'أبو رماد',
  'area',
  '{"type":"Polygon","coordinates":[[[35.70053232220791,22.63203377650018],[35.739467677792085,22.63203377650018],[35.739467677792085,22.667966223499818],[35.70053232220791,22.667966223499818],[35.70053232220791,22.63203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Hamata',
  'حماطة',
  'area',
  '{"type":"Polygon","coordinates":[[[35.420295052172456,24.23203377650018],[35.45970494782754,24.23203377650018],[35.45970494782754,24.26796622349982],[35.420295052172456,24.26796622349982],[35.420295052172456,24.23203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Sahl Hasheesh',
  'سهل حشيش',
  'area',
  '{"type":"Polygon","coordinates":[[[33.879828855863884,27.02203377650018],[33.92017114413611,27.02203377650018],[33.92017114413611,27.057966223499818],[33.879828855863884,27.057966223499818],[33.879828855863884,27.02203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Makadi Bay',
  'خليج ماكادي',
  'area',
  '{"type":"Polygon","coordinates":[[[33.94984499012041,26.93203377650018],[33.99015500987959,26.93203377650018],[33.99015500987959,26.96796622349982],[33.94984499012041,26.96796622349982],[33.94984499012041,26.93203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  253,
  'Soma Bay',
  'خليج سومة',
  'area',
  '{"type":"Polygon","coordinates":[[[33.9698503514284,26.902033776500183],[34.010149648571605,26.902033776500183],[34.010149648571605,26.93796622349982],[33.9698503514284,26.93796622349982],[33.9698503514284,26.902033776500183]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Sharm El Sheikh',
  'شرم الشيخ',
  'city',
  '{"type":"Polygon","coordinates":[[[34.2485714342568,27.84393510600072],[34.4112285657432,27.84393510600072],[34.4112285657432,27.98766489399928],[34.2485714342568,27.98766489399928],[34.2485714342568,27.84393510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Dahab',
  'دهب',
  'city',
  '{"type":"Polygon","coordinates":[[[34.418231625290595,28.42013510600072],[34.581768374709405,28.42013510600072],[34.581768374709405,28.56386489399928],[34.418231625290595,28.56386489399928],[34.418231625290595,28.42013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Saint Catherine',
  'سانت كاترين',
  'city',
  '{"type":"Polygon","coordinates":[[[33.86817730559174,28.49013510600072],[34.03182269440826,28.49013510600072],[34.03182269440826,28.63386489399928],[33.86817730559174,28.63386489399928],[33.86817730559174,28.49013510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Nuweiba',
  'نويبع',
  'city',
  '{"type":"Polygon","coordinates":[[[34.57780115171029,28.96813510600072],[34.7421988482897,28.96813510600072],[34.7421988482897,29.11186489399928],[34.57780115171029,29.11186489399928],[34.57780115171029,28.96813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Taba',
  'طابا',
  'city',
  '{"type":"Polygon","coordinates":[[[34.81743858314445,29.41813510600072],[34.982561416855546,29.41813510600072],[34.982561416855546,29.561864893999278],[34.81743858314445,29.561864893999278],[34.81743858314445,29.41813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Ras Sidr',
  'رأس سدر',
  'city',
  '{"type":"Polygon","coordinates":[[[32.60735688378949,29.51813510600072],[32.7726431162105,29.51813510600072],[32.7726431162105,29.66186489399928],[32.60735688378949,29.66186489399928],[32.60735688378949,29.51813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'Abu Zenima',
  'أبو زنيمة',
  'city',
  '{"type":"Polygon","coordinates":[[[33.017793184245626,28.97813510600072],[33.18220681575438,28.97813510600072],[33.18220681575438,29.12186489399928],[33.017793184245626,29.12186489399928],[33.017793184245626,28.97813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  254,
  'El Tor',
  'الطور',
  'city',
  '{"type":"Polygon","coordinates":[[[33.538425574109475,28.16813510600072],[33.70157442589052,28.16813510600072],[33.70157442589052,28.311864893999278],[33.538425574109475,28.311864893999278],[33.538425574109475,28.16813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'Arish',
  'العريش',
  'city',
  '{"type":"Polygon","coordinates":[[[33.7190435723734,31.060135106000722],[33.88695642762659,31.060135106000722],[33.88695642762659,31.20386489399928],[33.7190435723734,31.20386489399928],[33.7190435723734,31.060135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'Rafah',
  'رفح',
  'city',
  '{"type":"Polygon","coordinates":[[[34.155912099206354,31.20813510600072],[34.32408790079365,31.20813510600072],[34.32408790079365,31.35186489399928],[34.155912099206354,31.35186489399928],[34.155912099206354,31.20813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'Sheikh Zuweid',
  'الشيخ زويد',
  'city',
  '{"type":"Polygon","coordinates":[[[34.035974403621566,31.13813510600072],[34.20402559637843,31.13813510600072],[34.20402559637843,31.28186489399928],[34.035974403621566,31.28186489399928],[34.035974403621566,31.13813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'Bir El Abd',
  'بئر العبد',
  'city',
  '{"type":"Polygon","coordinates":[[[32.936142421182446,30.94813510600072],[33.10385757881756,30.94813510600072],[33.10385757881756,31.09186489399928],[32.936142421182446,31.09186489399928],[32.936142421182446,30.94813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'El Hassana',
  'الحسنة',
  'city',
  '{"type":"Polygon","coordinates":[[[33.67661987642293,30.39813510600072],[33.84338012357706,30.39813510600072],[33.84338012357706,30.54186489399928],[33.67661987642293,30.54186489399928],[33.67661987642293,30.39813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  255,
  'Nakhl',
  'نخل',
  'city',
  '{"type":"Polygon","coordinates":[[[33.66710097645709,29.82813510600072],[33.83289902354291,29.82813510600072],[33.83289902354291,29.971864893999278],[33.66710097645709,29.971864893999278],[33.66710097645709,29.82813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'Suez City',
  'مدينة السويس',
  'city',
  '{"type":"Polygon","coordinates":[[[32.44333954533557,29.90183510600072],[32.60926045466443,29.90183510600072],[32.60926045466443,30.04556489399928],[32.44333954533557,30.04556489399928],[32.44333954533557,29.90183510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'Ain Sokhna',
  'العين السخنة',
  'city',
  '{"type":"Polygon","coordinates":[[[32.27733229331271,29.54813510600072],[32.44266770668729,29.54813510600072],[32.44266770668729,29.69186489399928],[32.27733229331271,29.69186489399928],[32.27733229331271,29.54813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'Ataka',
  'عتاقة',
  'district',
  '{"type":"Polygon","coordinates":[[[32.44889724683144,29.923050664750267],[32.51110275316855,29.923050664750267],[32.51110275316855,29.97694933524973],[32.44889724683144,29.97694933524973],[32.44889724683144,29.923050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'Port Tawfik',
  'بورتوفيق',
  'district',
  '{"type":"Polygon","coordinates":[[[32.51890256182503,29.906050664750268],[32.581097438174965,29.906050664750268],[32.581097438174965,29.959949335249732],[32.51890256182503,29.959949335249732],[32.51890256182503,29.906050664750268]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'El Naqaa',
  'النقعة',
  'area',
  '{"type":"Polygon","coordinates":[[[32.51925439205211,29.98203377650018],[32.56074560794789,29.98203377650018],[32.56074560794789,30.01796622349982],[32.51925439205211,30.01796622349982],[32.51925439205211,29.98203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  256,
  'Kabanoun',
  'كبانون',
  'area',
  '{"type":"Polygon","coordinates":[[[32.4992564819906,29.97203377650018],[32.54074351800941,29.97203377650018],[32.54074351800941,30.007966223499817],[32.4992564819906,30.007966223499817],[32.4992564819906,29.97203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Ismailia City',
  'مدينة الإسماعيلية',
  'city',
  '{"type":"Polygon","coordinates":[[[32.18880450223612,30.53243510600072],[32.355795497763886,30.53243510600072],[32.355795497763886,30.676164893999278],[32.18880450223612,30.676164893999278],[32.18880450223612,30.53243510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Fayed',
  'فايد',
  'city',
  '{"type":"Polygon","coordinates":[[[32.21674782184274,30.24813510600072],[32.38325217815726,30.24813510600072],[32.38325217815726,30.39186489399928],[32.21674782184274,30.39186489399928],[32.21674782184274,30.24813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Abu Sultan',
  'أبو سلطان',
  'area',
  '{"type":"Polygon","coordinates":[[[32.299163522376645,30.41203377650018],[32.340836477623355,30.41203377650018],[32.340836477623355,30.44796622349982],[32.299163522376645,30.44796622349982],[32.299163522376645,30.41203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Al Qantara Sharq',
  'القنطرة شرق',
  'city',
  '{"type":"Polygon","coordinates":[[[32.24629140531451,30.778135106000722],[32.41370859468549,30.778135106000722],[32.41370859468549,30.92186489399928],[32.24629140531451,30.92186489399928],[32.24629140531451,30.778135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Al Qantara Gharb',
  'القنطرة غرب',
  'city',
  '{"type":"Polygon","coordinates":[[[32.116308849660406,30.75813510600072],[32.2836911503396,30.75813510600072],[32.2836911503396,30.901864893999278],[32.116308849660406,30.901864893999278],[32.116308849660406,30.75813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Tell El Kabir',
  'التل الكبير',
  'city',
  '{"type":"Polygon","coordinates":[[[31.706568427812993,30.45813510600072],[31.873431572187005,30.45813510600072],[31.873431572187005,30.60186489399928],[31.706568427812993,30.60186489399928],[31.706568427812993,30.45813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Qassasin',
  'القصاصين',
  'city',
  '{"type":"Polygon","coordinates":[[[31.84652543548123,30.50813510600072],[32.01347456451877,30.50813510600072],[32.01347456451877,30.651864893999278],[31.84652543548123,30.651864893999278],[31.84652543548123,30.50813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'Abu Sawer',
  'أبو صوير',
  'city',
  '{"type":"Polygon","coordinates":[[[32.006568427813,30.45813510600072],[32.173431572187006,30.45813510600072],[32.173431572187006,30.60186489399928],[32.006568427813,30.60186489399928],[32.006568427813,30.45813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  257,
  'El Salhiya',
  'الصالحية',
  'city',
  '{"type":"Polygon","coordinates":[[[31.796447777053395,30.598135106000722],[31.963552222946603,30.598135106000722],[31.963552222946603,30.74186489399928],[31.796447777053395,30.74186489399928],[31.796447777053395,30.598135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'Port Said City',
  'مدينة بورسعيد',
  'city',
  '{"type":"Polygon","coordinates":[[[32.21782520120773,31.19343510600072],[32.385974798792276,31.19343510600072],[32.385974798792276,31.33716489399928],[32.21782520120773,31.33716489399928],[32.21782520120773,31.19343510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'Port Fouad',
  'بورفؤاد',
  'city',
  '{"type":"Polygon","coordinates":[[[32.24593882777331,31.17813510600072],[32.41406117222669,31.17813510600072],[32.41406117222669,31.32186489399928],[32.24593882777331,31.32186489399928],[32.24593882777331,31.17813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'El Manakh',
  'المناخ',
  'district',
  '{"type":"Polygon","coordinates":[[[32.25847037994189,31.243050664750267],[32.32152962005811,31.243050664750267],[32.32152962005811,31.29694933524973],[32.25847037994189,31.29694933524973],[32.25847037994189,31.243050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'El Arab',
  'العرب',
  'district',
  '{"type":"Polygon","coordinates":[[[32.26847372101251,31.23305066475027],[32.33152627898748,31.23305066475027],[32.33152627898748,31.286949335249734],[32.26847372101251,31.286949335249734],[32.26847372101251,31.23305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'El Gharb',
  'الغرب',
  'district',
  '{"type":"Polygon","coordinates":[[[32.263475390922224,31.228050664750267],[32.32652460907778,31.228050664750267],[32.32652460907778,31.28194933524973],[32.263475390922224,31.28194933524973],[32.263475390922224,31.228050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'El Dawahi',
  'الضواحي',
  'district',
  '{"type":"Polygon","coordinates":[[[32.25846703720238,31.25305066475027],[32.32153296279762,31.25305066475027],[32.32153296279762,31.306949335249733],[32.25846703720238,31.306949335249733],[32.25846703720238,31.25305066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'El Sharg',
  'الشرق',
  'district',
  '{"type":"Polygon","coordinates":[[[32.27847205068577,31.23805066475027],[32.341527949314234,31.23805066475027],[32.341527949314234,31.291949335249733],[32.27847205068577,31.291949335249733],[32.27847205068577,31.23805066475027]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  258,
  'Zohour',
  'الزهور',
  'district',
  '{"type":"Polygon","coordinates":[[[32.248463692793266,31.263050664750267],[32.31153630720674,31.263050664750267],[32.31153630720674,31.31694933524973],[32.248463692793266,31.31694933524973],[32.248463692793266,31.263050664750267]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'Damietta City',
  'مدينة دمياط',
  'city',
  '{"type":"Polygon","coordinates":[[[31.72878719435715,31.34773510600072],[31.897212805642848,31.34773510600072],[31.897212805642848,31.49146489399928],[31.72878719435715,31.49146489399928],[31.72878719435715,31.34773510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'New Damietta',
  'دمياط الجديدة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.60579581169507,31.33813510600072],[31.77420418830493,31.33813510600072],[31.77420418830493,31.48186489399928],[31.60579581169507,31.48186489399928],[31.60579581169507,31.33813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'Ras El Bar',
  'رأس البر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.755696823658372,31.44813510600072],[31.924303176341628,31.44813510600072],[31.924303176341628,31.59186489399928],[31.755696823658372,31.59186489399928],[31.755696823658372,31.44813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'Ezbet El Borg',
  'عزبة البرج',
  'city',
  '{"type":"Polygon","coordinates":[[[31.745714861903412,31.42813510600072],[31.914285138096584,31.42813510600072],[31.914285138096584,31.57186489399928],[31.745714861903412,31.57186489399928],[31.745714861903412,31.42813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'Faraskour',
  'فارسكور',
  'city',
  '{"type":"Polygon","coordinates":[[[31.67586746252242,31.25813510600072],[31.844132537477584,31.25813510600072],[31.844132537477584,31.401864893999278],[31.67586746252242,31.401864893999278],[31.67586746252242,31.25813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'El Sarw',
  'السر',
  'area',
  '{"type":"Polygon","coordinates":[[[31.718971332642152,31.29203377650018],[31.761028667357845,31.29203377650018],[31.761028667357845,31.327966223499818],[31.718971332642152,31.327966223499818],[31.718971332642152,31.29203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'Kafr Saad',
  'كفر سعد',
  'city',
  '{"type":"Polygon","coordinates":[[[31.55584062698227,31.28813510600072],[31.72415937301773,31.28813510600072],[31.72415937301773,31.43186489399928],[31.55584062698227,31.43186489399928],[31.55584062698227,31.28813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  259,
  'El Karkassar',
  'الكركسر',
  'area',
  '{"type":"Polygon","coordinates":[[[31.678957918217193,31.352033776500182],[31.721042081782805,31.352033776500182],[31.721042081782805,31.38796622349982],[31.678957918217193,31.38796622349982],[31.678957918217193,31.352033776500182]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Kafr El Sheikh City',
  'مدينة كفر الشيخ',
  'city',
  '{"type":"Polygon","coordinates":[[[30.857161352980572,31.04003510600072],[31.025038647019425,31.04003510600072],[31.025038647019425,31.183764893999278],[30.857161352980572,31.183764893999278],[30.857161352980572,31.04003510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Baltim',
  'بلطيم',
  'city',
  '{"type":"Polygon","coordinates":[[[31.015633547953495,31.51813510600072],[31.184366452046508,31.51813510600072],[31.184366452046508,31.66186489399928],[31.015633547953495,31.66186489399928],[31.015633547953495,31.51813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Hamoul',
  'الحامول',
  'city',
  '{"type":"Polygon","coordinates":[[[31.035777854248686,31.35813510600072],[31.204222145751316,31.35813510600072],[31.204222145751316,31.50186489399928],[31.035777854248686,31.50186489399928],[31.035777854248686,31.35813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Metoubas',
  'مطوبس',
  'city',
  '{"type":"Polygon","coordinates":[[[30.81584957662772,31.278135106000722],[30.984150423372277,31.278135106000722],[30.984150423372277,31.42186489399928],[30.81584957662772,31.42186489399928],[30.81584957662772,31.278135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Desouk',
  'دسوق',
  'city',
  '{"type":"Polygon","coordinates":[[[30.55604534238844,31.05813510600072],[30.72395465761156,31.05813510600072],[30.72395465761156,31.20186489399928],[30.55604534238844,31.20186489399928],[30.55604534238844,31.05813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Sidi Salem',
  'سيدي سالم',
  'city',
  '{"type":"Polygon","coordinates":[[[30.685965516322323,31.14813510600072],[30.854034483677676,31.14813510600072],[30.854034483677676,31.29186489399928],[30.685965516322323,31.29186489399928],[30.685965516322323,31.14813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'El Reyad',
  'الرياض',
  'city',
  '{"type":"Polygon","coordinates":[[[30.865947728400144,31.16813510600072],[31.034052271599855,31.16813510600072],[31.034052271599855,31.311864893999278],[30.865947728400144,31.311864893999278],[30.865947728400144,31.16813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Fowa',
  'فوّة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.476054189810064,31.04813510600072],[30.643945810189933,31.04813510600072],[30.643945810189933,31.19186489399928],[30.476054189810064,31.19186489399928],[30.476054189810064,31.04813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Beila',
  'بيلا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.02592101317837,31.19813510600072],[31.19407898682163,31.19813510600072],[31.19407898682163,31.34186489399928],[31.02592101317837,31.34186489399928],[31.02592101317837,31.19813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  260,
  'Qaleen',
  'قلين',
  'city',
  '{"type":"Polygon","coordinates":[[[30.816115998077773,30.97813510600072],[30.983884001922224,30.97813510600072],[30.983884001922224,31.12186489399928],[30.816115998077773,31.12186489399928],[30.816115998077773,30.97813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Faiyum City',
  'مدينة الفيوم',
  'city',
  '{"type":"Polygon","coordinates":[[[30.760385895953398,29.23653510600072],[30.925214104046603,29.23653510600072],[30.925214104046603,29.38026489399928],[30.760385895953398,29.38026489399928],[30.760385895953398,29.23653510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Ibsheway',
  'إبشواي',
  'city',
  '{"type":"Polygon","coordinates":[[[30.517552269837072,29.278135106000722],[30.68244773016293,29.278135106000722],[30.68244773016293,29.42186489399928],[30.517552269837072,29.42186489399928],[30.517552269837072,29.278135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Itsa',
  'إطسا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.70764103113634,29.16813510600072],[30.872358968863658,29.16813510600072],[30.872358968863658,29.311864893999278],[30.70764103113634,29.311864893999278],[30.70764103113634,29.16813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Senoures',
  'سنورس',
  'city',
  '{"type":"Polygon","coordinates":[[[30.777503645636916,29.33813510600072],[30.942496354363083,29.33813510600072],[30.942496354363083,29.48186489399928],[30.777503645636916,29.48186489399928],[30.777503645636916,29.33813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Tamiya',
  'طامية',
  'city',
  '{"type":"Polygon","coordinates":[[[30.87744673037105,29.40813510600072],[31.04255326962895,29.40813510600072],[31.04255326962895,29.55186489399928],[30.87744673037105,29.55186489399928],[30.87744673037105,29.40813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Abshaway',
  'أبشواي',
  'city',
  '{"type":"Polygon","coordinates":[[[30.41755226983707,29.278135106000722],[30.58244773016293,29.278135106000722],[30.58244773016293,29.42186489399928],[30.41755226983707,29.42186489399928],[30.41755226983707,29.278135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Youssef El Seddik',
  'يوسف الصديق',
  'city',
  '{"type":"Polygon","coordinates":[[[30.517641031136343,29.16813510600072],[30.68235896886366,29.16813510600072],[30.68235896886366,29.311864893999278],[30.517641031136343,29.311864893999278],[30.517641031136343,29.16813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  261,
  'Hawaret El Maqta',
  'حوارة المقطع',
  'area',
  '{"type":"Polygon","coordinates":[[[30.81939816931089,29.28203377650018],[30.86060183068911,29.28203377650018],[30.86060183068911,29.31796622349982],[30.81939816931089,29.31796622349982],[30.81939816931089,29.28203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Beni Suef City',
  'مدينة بني سويف',
  'city',
  '{"type":"Polygon","coordinates":[[[31.016680348118893,28.99423510600072],[31.181119651881108,28.99423510600072],[31.181119651881108,29.13796489399928],[31.016680348118893,29.13796489399928],[31.016680348118893,28.99423510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'El Fashn',
  'الفشن',
  'city',
  '{"type":"Polygon","coordinates":[[[30.727975414797896,28.74813510600072],[30.8920245852021,28.74813510600072],[30.8920245852021,28.89186489399928],[30.727975414797896,28.89186489399928],[30.727975414797896,28.74813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Biba',
  'ببا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.89789644604044,28.848135106000722],[31.06210355395956,28.848135106000722],[31.06210355395956,28.99186489399928],[30.89789644604044,28.99186489399928],[30.89789644604044,28.848135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'El Wasta',
  'الواسطى',
  'city',
  '{"type":"Polygon","coordinates":[[[31.137560359511184,29.26813510600072],[31.302439640488814,29.26813510600072],[31.302439640488814,29.41186489399928],[31.137560359511184,29.41186489399928],[31.137560359511184,29.26813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Nasser',
  'ناصر',
  'city',
  '{"type":"Polygon","coordinates":[[[31.04769725834299,29.098135106000722],[31.21230274165701,29.098135106000722],[31.21230274165701,29.24186489399928],[31.04769725834299,29.24186489399928],[31.04769725834299,29.098135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Ehnasia',
  'أهناسيا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.957761273876727,29.01813510600072],[31.12223872612327,29.01813510600072],[31.12223872612327,29.16186489399928],[30.957761273876727,29.16186489399928],[30.957761273876727,29.01813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Somasta',
  'سومستا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.017817074498215,28.94813510600072],[31.182182925501788,28.94813510600072],[31.182182925501788,29.09186489399928],[31.017817074498215,29.09186489399928],[31.017817074498215,28.94813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  262,
  'Tansa',
  'تانسا',
  'area',
  '{"type":"Polygon","coordinates":[[[31.179418296354683,29.18203377650018],[31.220581703645315,29.18203377650018],[31.220581703645315,29.21796622349982],[31.179418296354683,29.21796622349982],[31.179418296354683,29.18203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Minya City',
  'مدينة المنيا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.679841278469492,28.01623510600072],[30.842758721530505,28.01623510600072],[30.842758721530505,28.15996489399928],[30.679841278469492,28.15996489399928],[30.679841278469492,28.01623510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Mallawi',
  'ملوي',
  'city',
  '{"type":"Polygon","coordinates":[[[30.748810501304487,27.65813510600072],[30.91118949869551,27.65813510600072],[30.91118949869551,27.80186489399928],[30.748810501304487,27.80186489399928],[30.748810501304487,27.65813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Samalout',
  'سمالوط',
  'city',
  '{"type":"Polygon","coordinates":[[[30.628379622470856,28.22813510600072],[30.791620377529146,28.22813510600072],[30.791620377529146,28.37186489399928],[30.628379622470856,28.37186489399928],[30.628379622470856,28.22813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'El Idwa',
  'العدوة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.67816330625179,28.50813510600072],[30.841836693748213,28.50813510600072],[30.841836693748213,28.651864893999278],[30.67816330625179,28.651864893999278],[30.67816330625179,28.50813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Maghagha',
  'مغاغة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.718112645853235,28.57313510600072],[30.881887354146766,28.57313510600072],[30.881887354146766,28.71686489399928],[30.718112645853235,28.71686489399928],[30.718112645853235,28.57313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Bani Mazar',
  'بني مزار',
  'city',
  '{"type":"Polygon","coordinates":[[[30.718221552028833,28.43313510600072],[30.88177844797117,28.43313510600072],[30.88177844797117,28.57686489399928],[30.718221552028833,28.57686489399928],[30.718221552028833,28.43313510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Mattay',
  'مطاي',
  'city',
  '{"type":"Polygon","coordinates":[[[30.688287294631923,28.348135106000722],[30.851712705368076,28.348135106000722],[30.851712705368076,28.49186489399928],[30.688287294631923,28.49186489399928],[30.688287294631923,28.348135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Abou Qirqas',
  'أبو قرقاص',
  'city',
  '{"type":"Polygon","coordinates":[[[30.748660751075825,27.85813510600072],[30.911339248924172,27.85813510600072],[30.911339248924172,28.00186489399928],[30.748660751075825,28.00186489399928],[30.748660751075825,27.85813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  263,
  'Deir Mawas',
  'دير مواس',
  'city',
  '{"type":"Polygon","coordinates":[[[30.768877387055184,27.56813510600072],[30.93112261294482,27.56813510600072],[30.93112261294482,27.71186489399928],[30.768877387055184,27.71186489399928],[30.768877387055184,27.56813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Asyut City',
  'مدينة أسيوط',
  'city',
  '{"type":"Polygon","coordinates":[[[31.090609578575496,27.11483510600072],[31.2521904214245,27.11483510600072],[31.2521904214245,27.258564893999278],[31.090609578575496,27.258564893999278],[31.090609578575496,27.11483510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Abnub',
  'أبنوب',
  'city',
  '{"type":"Polygon","coordinates":[[[31.079149117299636,27.19813510600072],[31.240850882700364,27.19813510600072],[31.240850882700364,27.34186489399928],[31.079149117299636,27.34186489399928],[31.079149117299636,27.19813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Abu Tig',
  'أبو تيج',
  'city',
  '{"type":"Polygon","coordinates":[[[31.23931542345555,26.96813510600072],[31.40068457654445,26.96813510600072],[31.40068457654445,27.11186489399928],[31.23931542345555,27.11186489399928],[31.23931542345555,26.96813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'El Badari',
  'البداري',
  'city',
  '{"type":"Polygon","coordinates":[[[31.3393513146757,26.91813510600072],[31.500648685324304,26.91813510600072],[31.500648685324304,27.061864893999278],[31.3393513146757,27.061864893999278],[31.3393513146757,26.91813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Sahel Seleem',
  'ساحل سليم',
  'city',
  '{"type":"Polygon","coordinates":[[[31.179272230609318,27.028135106000722],[31.340727769390686,27.028135106000722],[31.340727769390686,27.17186489399928],[31.179272230609318,27.17186489399928],[31.179272230609318,27.028135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'El Quseya',
  'القوصية',
  'city',
  '{"type":"Polygon","coordinates":[[[30.7390249139624,27.36813510600072],[30.9009750860376,27.36813510600072],[30.9009750860376,27.51186489399928],[30.7390249139624,27.51186489399928],[30.7390249139624,27.36813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Manfalut',
  'منفلوط',
  'city',
  '{"type":"Polygon","coordinates":[[[30.889112700379727,27.24813510600072],[31.05088729962027,27.24813510600072],[31.05088729962027,27.39186489399928],[30.889112700379727,27.39186489399928],[30.889112700379727,27.24813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Dayrout',
  'ديروط',
  'city',
  '{"type":"Polygon","coordinates":[[[30.72893214976532,27.49413510600072],[30.891067850234677,27.49413510600072],[30.891067850234677,27.63786489399928],[30.72893214976532,27.63786489399928],[30.72893214976532,27.49413510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'Sedfa',
  'صدفا',
  'city',
  '{"type":"Polygon","coordinates":[[[30.9792433604575,27.06813510600072],[31.1407566395425,27.06813510600072],[31.1407566395425,27.21186489399928],[30.9792433604575,27.21186489399928],[30.9792433604575,27.06813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'El Fateh',
  'الفتح',
  'city',
  '{"type":"Polygon","coordinates":[[[31.099185439927087,27.14813510600072],[31.260814560072912,27.14813510600072],[31.260814560072912,27.29186489399928],[31.099185439927087,27.29186489399928],[31.099185439927087,27.14813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  264,
  'El Ghanayem',
  'الغنايم',
  'city',
  '{"type":"Polygon","coordinates":[[[31.249272230609314,27.028135106000722],[31.410727769390682,27.028135106000722],[31.410727769390682,27.17186489399928],[31.249272230609314,27.17186489399928],[31.249272230609314,27.028135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Sohag City',
  'مدينة سوهاج',
  'city',
  '{"type":"Polygon","coordinates":[[[31.61465614714249,26.48813510600072],[31.77534385285751,26.48813510600072],[31.77534385285751,26.63186489399928],[31.61465614714249,26.63186489399928],[31.61465614714249,26.48813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Akhmim',
  'أخميم',
  'city',
  '{"type":"Polygon","coordinates":[[[31.662654044043723,26.49113510600072],[31.823345955956274,26.49113510600072],[31.823345955956274,26.63486489399928],[31.662654044043723,26.63486489399928],[31.662654044043723,26.49113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Gerga',
  'جرجا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.789809476444322,26.26813510600072],[31.95019052355568,26.26813510600072],[31.95019052355568,26.41186489399928],[31.789809476444322,26.41186489399928],[31.789809476444322,26.26813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'El Maragha',
  'المراغة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.529550586740203,26.63813510600072],[31.690449413259795,26.63813510600072],[31.690449413259795,26.78186489399928],[31.529550586740203,26.78186489399928],[31.529550586740203,26.63813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Tima',
  'طما',
  'city',
  '{"type":"Polygon","coordinates":[[[31.38940854667992,26.83813510600072],[31.550591453320077,26.83813510600072],[31.550591453320077,26.98186489399928],[31.38940854667992,26.98186489399928],[31.38940854667992,26.83813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Tahta',
  'طهطا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.41950813027829,26.69813510600072],[31.58049186972171,26.69813510600072],[31.58049186972171,26.84186489399928],[31.41950813027829,26.84186489399928],[31.41950813027829,26.69813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'El Balyana',
  'البلينا',
  'city',
  '{"type":"Polygon","coordinates":[[[31.829885479467862,26.15813510600072],[31.99011452053214,26.15813510600072],[31.99011452053214,26.30186489399928],[31.829885479467862,26.30186489399928],[31.829885479467862,26.15813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Sakulta',
  'ساقلتة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.58959291030758,26.57813510600072],[31.750407089692423,26.57813510600072],[31.750407089692423,26.721864893999278],[31.58959291030758,26.721864893999278],[31.58959291030758,26.57813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'Dar El Salam',
  'دار السلام',
  'city',
  '{"type":"Polygon","coordinates":[[[31.919892367054523,26.14813510600072],[32.08010763294548,26.14813510600072],[32.08010763294548,26.29186489399928],[31.919892367054523,26.29186489399928],[31.919892367054523,26.14813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  265,
  'El Monshah',
  'المنشأة',
  'city',
  '{"type":"Polygon","coordinates":[[[31.719712108031015,26.40813510600072],[31.880287891968987,26.40813510600072],[31.880287891968987,26.55186489399928],[31.719712108031015,26.55186489399928],[31.719712108031015,26.40813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Qena City',
  'مدينة قنا',
  'city',
  '{"type":"Polygon","coordinates":[[[32.64193293009482,26.08913510600072],[32.802067069905185,26.08913510600072],[32.802067069905185,26.23286489399928],[32.64193293009482,26.23286489399928],[32.64193293009482,26.08913510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Nag Hammadi',
  'نجع حمادي',
  'city',
  '{"type":"Polygon","coordinates":[[[32.17000890266138,25.97813510600072],[32.32999109733862,25.97813510600072],[32.32999109733862,26.12186489399928],[32.17000890266138,26.12186489399928],[32.17000890266138,25.97813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Deshna',
  'دشنا',
  'city',
  '{"type":"Polygon","coordinates":[[[32.3799541924179,26.05813510600072],[32.5400458075821,26.05813510600072],[32.5400458075821,26.20186489399928],[32.3799541924179,26.20186489399928],[32.3799541924179,26.05813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Farshout',
  'فرشوط',
  'city',
  '{"type":"Polygon","coordinates":[[[32.110002076498844,25.98813510600072],[32.26999792350115,25.98813510600072],[32.26999792350115,26.13186489399928],[32.110002076498844,26.13186489399928],[32.110002076498844,25.98813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Abou Tesht',
  'أبو تشت',
  'city',
  '{"type":"Polygon","coordinates":[[[32.019961043825624,26.04813510600072],[32.18003895617438,26.04813510600072],[32.18003895617438,26.19186489399928],[32.019961043825624,26.19186489399928],[32.019961043825624,26.04813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Qus',
  'قوص',
  'city',
  '{"type":"Polygon","coordinates":[[[32.68009053610804,25.85813510600072],[32.839909463891956,25.85813510600072],[32.839909463891956,26.00186489399928],[32.68009053610804,26.00186489399928],[32.68009053610804,25.85813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'Naqada',
  'نقادة',
  'city',
  '{"type":"Polygon","coordinates":[[[32.64011086371489,25.82813510600072],[32.79988913628511,25.82813510600072],[32.79988913628511,25.971864893999278],[32.64011086371489,25.971864893999278],[32.64011086371489,25.82813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  266,
  'El Waqf',
  'الوقف',
  'city',
  '{"type":"Polygon","coordinates":[[[32.220036171313936,25.938135106000722],[32.37996382868606,25.938135106000722],[32.37996382868606,26.08186489399928],[32.220036171313936,26.08186489399928],[32.220036171313936,25.938135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'Kharga',
  'الخارجة',
  'city',
  '{"type":"Polygon","coordinates":[[[30.47041193002401,25.37813510600072],[30.62958806997599,25.37813510600072],[30.62958806997599,25.52186489399928],[30.47041193002401,25.52186489399928],[30.47041193002401,25.37813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'Dakhla',
  'الداخلة',
  'city',
  '{"type":"Polygon","coordinates":[[[28.920372202558266,25.438135106000722],[29.079627797441734,25.438135106000722],[29.079627797441734,25.58186489399928],[28.920372202558266,25.58186489399928],[28.920372202558266,25.438135106000722]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'Farafra',
  'الفرافرة',
  'city',
  '{"type":"Polygon","coordinates":[[[27.88930104080896,26.98813510600072],[28.05069895919104,26.98813510600072],[28.05069895919104,27.13186489399928],[27.88930104080896,27.13186489399928],[27.88930104080896,26.98813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'Baris',
  'باريس',
  'city',
  '{"type":"Polygon","coordinates":[[[30.540948602266575,24.54813510600072],[30.699051397733427,24.54813510600072],[30.699051397733427,24.69186489399928],[30.540948602266575,24.69186489399928],[30.540948602266575,24.54813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'El Qasr',
  'القصر',
  'city',
  '{"type":"Polygon","coordinates":[[[28.91039208216001,25.40813510600072],[29.06960791783999,25.40813510600072],[29.06960791783999,25.55186489399928],[28.91039208216001,25.55186489399928],[28.91039208216001,25.40813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  267,
  'Mout',
  'موط',
  'city',
  '{"type":"Polygon","coordinates":[[[28.90039208216001,25.40813510600072],[29.05960791783999,25.40813510600072],[29.05960791783999,25.55186489399928],[28.90039208216001,25.55186489399928],[28.90039208216001,25.40813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'Marsa Matrouh',
  'مرسى مطروح',
  'city',
  '{"type":"Polygon","coordinates":[[[27.153147429120192,31.28053510600072],[27.32145257087981,31.28053510600072],[27.32145257087981,31.42426489399928],[27.153147429120192,31.42426489399928],[27.153147429120192,31.28053510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'Siwa',
  'سيوة',
  'city',
  '{"type":"Polygon","coordinates":[[[25.437670776110213,29.13113510600072],[25.602329223889786,29.13113510600072],[25.602329223889786,29.27486489399928],[25.437670776110213,29.27486489399928],[25.437670776110213,29.13113510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'El Alamein',
  'العلمين',
  'city',
  '{"type":"Polygon","coordinates":[[[28.8663088496604,30.75813510600072],[29.0336911503396,30.75813510600072],[29.0336911503396,30.901864893999278],[28.8663088496604,30.901864893999278],[28.8663088496604,30.75813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'El Dabaa',
  'الضبعة',
  'city',
  '{"type":"Polygon","coordinates":[[[28.346133617885297,30.95813510600072],[28.513866382114703,30.95813510600072],[28.513866382114703,31.10186489399928],[28.346133617885297,31.10186489399928],[28.346133617885297,30.95813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'Sidi Abdel Rahman',
  'سيدي عبد الرحمن',
  'area',
  '{"type":"Polygon","coordinates":[[[28.669040003643275,30.98203377650018],[28.710959996356728,30.98203377650018],[28.710959996356728,31.01796622349982],[28.669040003643275,31.01796622349982],[28.669040003643275,30.98203377650018]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'El Negaila',
  'النجيلة',
  'city',
  '{"type":"Polygon","coordinates":[[[26.965885330568614,31.23813510600072],[27.134114669431387,31.23813510600072],[27.134114669431387,31.38186489399928],[26.965885330568614,31.38186489399928],[26.965885330568614,31.23813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'Barrani',
  'البراني',
  'city',
  '{"type":"Polygon","coordinates":[[[25.835615428586895,31.53813510600072],[26.00438457141311,31.53813510600072],[26.00438457141311,31.68186489399928],[25.835615428586895,31.68186489399928],[25.835615428586895,31.53813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'Salloum',
  'السلوم',
  'city',
  '{"type":"Polygon","coordinates":[[[25.065669732537632,31.47813510600072],[25.234330267462365,31.47813510600072],[25.234330267462365,31.62186489399928],[25.065669732537632,31.62186489399928],[25.065669732537632,31.47813510600072]]]}',
  0,
  1
);
INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  268,
  'El Hamam',
  'الحمام',
  'city',
  '{"type":"Polygon","coordinates":[[[29.306308849660404,30.75813510600072],[29.473691150339597,30.75813510600072],[29.473691150339597,30.901864893999278],[29.306308849660404,30.901864893999278],[29.306308849660404,30.75813510600072]]]}',
  0,
  1
);

-- ================================
-- INDEXES
-- ================================
CREATE INDEX IF NOT EXISTS idx_cities_type ON cities(type);
CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);

-- ================================
-- Done.
-- ================================