-- ============================================================================
-- CourtZon V2 – Geographic Seed Data: Provinces & Cities
-- ============================================================================

-- Clean existing data so re-runs produce correct results
DELETE FROM cities;
DELETE FROM provinces;

-- Ensure all target countries exist (inline seed only covers EG, SA, AE)
INSERT IGNORE INTO countries (id, iso_code, iso_code_3, name, phone_code, default_currency) VALUES
(7, 'FR', 'FRA', 'France', '+33', 'EUR');

-- ═══════════════════════════════════════════════════════════════════════════
-- UAE (id=3) – 7 Emirates
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, sort_order) VALUES
(3, 'Dubai', 'دبي', 'AE-DU', 'emirate', 1),
(3, 'Abu Dhabi', 'أبو ظبي', 'AE-AZ', 'emirate', 2),
(3, 'Sharjah', 'الشارقة', 'AE-SH', 'emirate', 3),
(3, 'Ajman', 'عجمان', 'AE-AJ', 'emirate', 4),
(3, 'Ras Al Khaimah', 'رأس الخيمة', 'AE-RK', 'emirate', 5),
(3, 'Fujairah', 'الفجيرة', 'AE-FU', 'emirate', 6),
(3, 'Umm Al Quwain', 'أم القيوين', 'AE-UQ', 'emirate', 7);

SET @ae_dubai = (SELECT id FROM provinces WHERE code = 'AE-DU');
SET @ae_abudhabi = (SELECT id FROM provinces WHERE code = 'AE-AZ');
SET @ae_sharjah = (SELECT id FROM provinces WHERE code = 'AE-SH');
SET @ae_ajman = (SELECT id FROM provinces WHERE code = 'AE-AJ');
SET @ae_rak = (SELECT id FROM provinces WHERE code = 'AE-RK');
SET @ae_fujairah = (SELECT id FROM provinces WHERE code = 'AE-FU');
SET @ae_uq = (SELECT id FROM provinces WHERE code = 'AE-UQ');

INSERT IGNORE INTO cities (province_id, name, native_name, sort_order) VALUES
(@ae_dubai, 'Dubai City', 'دبي', 1),
(@ae_dubai, 'Deira', 'ديرة', 2),
(@ae_dubai, 'Jumeirah', 'جميرا', 3),
(@ae_dubai, 'Al Quoz', 'القوز', 4),
(@ae_dubai, 'Dubai Marina', 'مرسى دبي', 5),
(@ae_abudhabi, 'Abu Dhabi City', 'أبو ظبي', 1),
(@ae_abudhabi, 'Al Ain', 'العين', 2),
(@ae_abudhabi, 'Madinat Zayed', 'مدينة زايد', 3),
(@ae_abudhabi, 'Liwa Oasis', 'واحة ليوا', 4),
(@ae_sharjah, 'Sharjah City', 'الشارقة', 1),
(@ae_sharjah, 'Khor Fakkan', 'خورفكان', 2),
(@ae_sharjah, 'Kalba', 'كلباء', 3),
(@ae_sharjah, 'Al Dhaid', 'الذيد', 4),
(@ae_ajman, 'Ajman City', 'عجمان', 1),
(@ae_ajman, 'Masfout', 'مسفوت', 2),
(@ae_ajman, 'Al Manama', 'المنامة', 3),
(@ae_rak, 'Ras Al Khaimah City', 'رأس الخيمة', 1),
(@ae_rak, 'Al Marjan Island', 'جزيرة المرجان', 2),
(@ae_rak, 'Khatt', 'خَت', 3),
(@ae_fujairah, 'Fujairah City', 'الفجيرة', 1),
(@ae_fujairah, 'Dibba Al-Fujairah', 'دبا الفجيرة', 2),
(@ae_uq, 'Umm Al Quwain City', 'أم القيوين', 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- Egypt (id=1) – 27 Governorates
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, sort_order) VALUES
(1, 'Cairo', 'القاهرة', 'EG-C', 'governorate', 1),
(1, 'Alexandria', 'الإسكندرية', 'EG-ALX', 'governorate', 2),
(1, 'Giza', 'الجيزة', 'EG-GZ', 'governorate', 3),
(1, 'Sharqia', 'الشرقية', 'EG-SHR', 'governorate', 4),
(1, 'Dakahlia', 'الدقهلية', 'EG-DK', 'governorate', 5),
(1, 'Beheira', 'البحيرة', 'EG-BH', 'governorate', 6),
(1, 'Gharbia', 'الغربية', 'EG-GH', 'governorate', 7),
(1, 'Monufia', 'المنوفية', 'EG-MNF', 'governorate', 8),
(1, 'Qalyubia', 'القليوبية', 'EG-KB', 'governorate', 9),
(1, 'Aswan', 'أسوان', 'EG-ASN', 'governorate', 10),
(1, 'Luxor', 'الأقصر', 'EG-LX', 'governorate', 11),
(1, 'Red Sea', 'البحر الأحمر', 'EG-BA', 'governorate', 12),
(1, 'South Sinai', 'جنوب سيناء', 'EG-JS', 'governorate', 13),
(1, 'North Sinai', 'شمال سيناء', 'EG-SIN', 'governorate', 14),
(1, 'Suez', 'السويس', 'EG-SUZ', 'governorate', 15),
(1, 'Ismailia', 'الإسماعيلية', 'EG-IS', 'governorate', 16),
(1, 'Port Said', 'بورسعيد', 'EG-PTS', 'governorate', 17),
(1, 'Damietta', 'دمياط', 'EG-DT', 'governorate', 18),
(1, 'Kafr El Sheikh', 'كفر الشيخ', 'EG-KFS', 'governorate', 19),
(1, 'Faiyum', 'الفيوم', 'EG-FYM', 'governorate', 20),
(1, 'Beni Suef', 'بني سويف', 'EG-BNS', 'governorate', 21),
(1, 'Minya', 'المنيا', 'EG-MN', 'governorate', 22),
(1, 'Asyut', 'أسيوط', 'EG-AST', 'governorate', 23),
(1, 'Sohag', 'سوهاج', 'EG-SHG', 'governorate', 24),
(1, 'Qena', 'قنا', 'EG-KN', 'governorate', 25),
(1, 'New Valley', 'الوادي الجديد', 'EG-WAD', 'governorate', 26),
(1, 'Matrouh', 'مطروح', 'EG-MT', 'governorate', 27);

SET @eg_cairo = (SELECT id FROM provinces WHERE code = 'EG-C');
SET @eg_alex = (SELECT id FROM provinces WHERE code = 'EG-ALX');
SET @eg_giza = (SELECT id FROM provinces WHERE code = 'EG-GZ');
SET @eg_sharqia = (SELECT id FROM provinces WHERE code = 'EG-SHR');
SET @eg_dakahlia = (SELECT id FROM provinces WHERE code = 'EG-DK');
SET @eg_beheira = (SELECT id FROM provinces WHERE code = 'EG-BH');
SET @eg_gharbia = (SELECT id FROM provinces WHERE code = 'EG-GH');
SET @eg_monufia = (SELECT id FROM provinces WHERE code = 'EG-MNF');
SET @eg_qalyubia = (SELECT id FROM provinces WHERE code = 'EG-KB');
SET @eg_aswan = (SELECT id FROM provinces WHERE code = 'EG-ASN');
SET @eg_luxor = (SELECT id FROM provinces WHERE code = 'EG-LX');
SET @eg_redsea = (SELECT id FROM provinces WHERE code = 'EG-BA');
SET @eg_s_sinai = (SELECT id FROM provinces WHERE code = 'EG-JS');
SET @eg_n_sinai = (SELECT id FROM provinces WHERE code = 'EG-SIN');
SET @eg_suez = (SELECT id FROM provinces WHERE code = 'EG-SUZ');
SET @eg_ismailia = (SELECT id FROM provinces WHERE code = 'EG-IS');
SET @eg_portsaid = (SELECT id FROM provinces WHERE code = 'EG-PTS');
SET @eg_damietta = (SELECT id FROM provinces WHERE code = 'EG-DT');
SET @eg_kafr = (SELECT id FROM provinces WHERE code = 'EG-KFS');
SET @eg_faiyum = (SELECT id FROM provinces WHERE code = 'EG-FYM');
SET @eg_beni = (SELECT id FROM provinces WHERE code = 'EG-BNS');
SET @eg_minya = (SELECT id FROM provinces WHERE code = 'EG-MN');
SET @eg_asyut = (SELECT id FROM provinces WHERE code = 'EG-AST');
SET @eg_sohag = (SELECT id FROM provinces WHERE code = 'EG-SHG');
SET @eg_qena = (SELECT id FROM provinces WHERE code = 'EG-KN');
SET @eg_newvalley = (SELECT id FROM provinces WHERE code = 'EG-WAD');
SET @eg_matrouh = (SELECT id FROM provinces WHERE code = 'EG-MT');

INSERT IGNORE INTO cities (province_id, name, native_name, sort_order) VALUES
(@eg_cairo, 'Cairo City', 'القاهرة', 1),
(@eg_cairo, 'Nasr City', 'مدينة نصر', 2),
(@eg_cairo, 'Maadi', 'المعادي', 3),
(@eg_cairo, 'Heliopolis', 'مصر الجديدة', 4),
(@eg_cairo, 'Shubra', 'شبرا', 5),
(@eg_alex, 'Alexandria City', 'الإسكندرية', 1),
(@eg_alex, 'Borg El Arab', 'برج العرب', 2),
(@eg_alex, 'Agamy', 'العجمي', 3),
(@eg_giza, 'Giza City', 'الجيزة', 1),
(@eg_giza, '6th of October City', 'مدينة السادس من أكتوبر', 2),
(@eg_giza, 'Sheikh Zayed City', 'مدينة الشيخ زايد', 3),
(@eg_giza, 'Dokki', 'الدقي', 4),
(@eg_sharqia, 'Zagazig', 'الزقازيق', 1),
(@eg_sharqia, 'Belbeis', 'بلبيس', 2),
(@eg_dakahlia, 'Mansoura', 'المنصورة', 1),
(@eg_dakahlia, 'Mit Ghamr', 'ميت غمر', 2),
(@eg_beheira, 'Damanhur', 'دمنهور', 1),
(@eg_beheira, 'Kafr El Dawwar', 'كفر الدوار', 2),
(@eg_gharbia, 'Tanta', 'طنطا', 1),
(@eg_gharbia, 'El Mahalla El Kubra', 'المحلة الكبرى', 2),
(@eg_monufia, 'Shibin El Kom', 'شبين الكوم', 1),
(@eg_monufia, 'Menouf', 'منوف', 2),
(@eg_qalyubia, 'Banha', 'بنها', 1),
(@eg_qalyubia, 'Qalyub', 'قليوب', 2),
(@eg_aswan, 'Aswan City', 'أسوان', 1),
(@eg_aswan, 'Edfu', 'إدفو', 2),
(@eg_luxor, 'Luxor City', 'الأقصر', 1),
(@eg_redsea, 'Hurghada', 'الغردقة', 1),
(@eg_redsea, 'Marsa Alam', 'مرسى علم', 2),
(@eg_s_sinai, 'Sharm El Sheikh', 'شرم الشيخ', 1),
(@eg_s_sinai, 'Dahab', 'دهب', 2),
(@eg_n_sinai, 'Arish', 'العريش', 1),
(@eg_suez, 'Suez City', 'السويس', 1),
(@eg_ismailia, 'Ismailia City', 'الإسماعيلية', 1),
(@eg_portsaid, 'Port Said City', 'بورسعيد', 1),
(@eg_damietta, 'Damietta City', 'دمياط', 1),
(@eg_kafr, 'Kafr El Sheikh City', 'كفر الشيخ', 1),
(@eg_faiyum, 'Faiyum City', 'الفيوم', 1),
(@eg_beni, 'Beni Suef City', 'بني سويف', 1),
(@eg_minya, 'Minya City', 'المنيا', 1),
(@eg_minya, 'Mallawi', 'ملوي', 2),
(@eg_asyut, 'Asyut City', 'أسيوط', 1),
(@eg_sohag, 'Sohag City', 'سوهاج', 1),
(@eg_qena, 'Qena City', 'قنا', 1),
(@eg_newvalley, 'Kharga', 'الخارجة', 1),
(@eg_matrouh, 'Marsa Matrouh', 'مرسى مطروح', 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- Saudi Arabia (id=2) – 13 Regions
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, sort_order) VALUES
(2, 'Riyadh', 'منطقة الرياض', 'SA-01', 'region', 1),
(2, 'Makkah', 'منطقة مكة المكرمة', 'SA-02', 'region', 2),
(2, 'Eastern Province', 'المنطقة الشرقية', 'SA-04', 'region', 3),
(2, 'Madinah', 'منطقة المدينة المنورة', 'SA-03', 'region', 4),
(2, 'Qassim', 'منطقة القصيم', 'SA-05', 'region', 5),
(2, 'Tabuk', 'منطقة تبوك', 'SA-07', 'region', 6),
(2, 'Asir', 'منطقة عسير', 'SA-14', 'region', 7),
(2, 'Jazan', 'منطقة جازان', 'SA-09', 'region', 8),
(2, 'Hail', 'منطقة حائل', 'SA-06', 'region', 9),
(2, 'Najran', 'منطقة نجران', 'SA-10', 'region', 10),
(2, 'Al Bahah', 'منطقة الباحة', 'SA-11', 'region', 11),
(2, 'Northern Borders', 'منطقة الحدود الشمالية', 'SA-08', 'region', 12),
(2, 'Al Jawf', 'منطقة الجوف', 'SA-12', 'region', 13);

SET @sa_riyadh = (SELECT id FROM provinces WHERE code = 'SA-01');
SET @sa_makkah = (SELECT id FROM provinces WHERE code = 'SA-02');
SET @sa_eastern = (SELECT id FROM provinces WHERE code = 'SA-04');
SET @sa_madinah = (SELECT id FROM provinces WHERE code = 'SA-03');
SET @sa_qassim = (SELECT id FROM provinces WHERE code = 'SA-05');
SET @sa_tabuk = (SELECT id FROM provinces WHERE code = 'SA-07');
SET @sa_asir = (SELECT id FROM provinces WHERE code = 'SA-14');
SET @sa_jazan = (SELECT id FROM provinces WHERE code = 'SA-09');
SET @sa_hail = (SELECT id FROM provinces WHERE code = 'SA-06');
SET @sa_najran = (SELECT id FROM provinces WHERE code = 'SA-10');
SET @sa_bahah = (SELECT id FROM provinces WHERE code = 'SA-11');
SET @sa_northern = (SELECT id FROM provinces WHERE code = 'SA-08');
SET @sa_jawf = (SELECT id FROM provinces WHERE code = 'SA-12');

INSERT IGNORE INTO cities (province_id, name, native_name, sort_order) VALUES
(@sa_riyadh, 'Riyadh City', 'الرياض', 1),
(@sa_riyadh, 'Diriyah', 'الدرعية', 2),
(@sa_riyadh, 'Al Kharj', 'الخرج', 3),
(@sa_riyadh, 'Al Majmaah', 'المجمعة', 4),
(@sa_makkah, 'Mecca', 'مكة المكرمة', 1),
(@sa_makkah, 'Jeddah', 'جدة', 2),
(@sa_makkah, 'Taif', 'الطائف', 3),
(@sa_makkah, 'Rabigh', 'رابغ', 4),
(@sa_eastern, 'Dammam', 'الدمام', 1),
(@sa_eastern, 'Al Ahsa', 'الأحساء', 2),
(@sa_eastern, 'Dhahran', 'الظهران', 3),
(@sa_eastern, 'Khobar', 'الخبر', 4),
(@sa_eastern, 'Jubail', 'الجبيل', 5),
(@sa_madinah, 'Medina', 'المدينة المنورة', 1),
(@sa_madinah, 'Yanbu', 'ينبع', 2),
(@sa_madinah, 'Badr', 'بدر', 3),
(@sa_qassim, 'Buraydah', 'بريدة', 1),
(@sa_qassim, 'Unaizah', 'عنيزة', 2),
(@sa_tabuk, 'Tabuk City', 'تبوك', 1),
(@sa_asir, 'Abha', 'أبها', 1),
(@sa_asir, 'Khamis Mushait', 'خميس مشيط', 2),
(@sa_jazan, 'Jazan City', 'جازان', 1),
(@sa_hail, 'Hail City', 'حائل', 1),
(@sa_najran, 'Najran City', 'نجران', 1),
(@sa_bahah, 'Al Bahah City', 'الباحة', 1),
(@sa_northern, 'Arar', 'عرعر', 1),
(@sa_jawf, 'Sakakah', 'سكاكا', 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- United States (id=4) – 50 States
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, code, type, sort_order) VALUES
(4, 'Alabama', 'US-AL', 'state', 1),
(4, 'Alaska', 'US-AK', 'state', 2),
(4, 'Arizona', 'US-AZ', 'state', 3),
(4, 'Arkansas', 'US-AR', 'state', 4),
(4, 'California', 'US-CA', 'state', 5),
(4, 'Colorado', 'US-CO', 'state', 6),
(4, 'Connecticut', 'US-CT', 'state', 7),
(4, 'Delaware', 'US-DE', 'state', 8),
(4, 'Florida', 'US-FL', 'state', 9),
(4, 'Georgia', 'US-GA', 'state', 10),
(4, 'Hawaii', 'US-HI', 'state', 11),
(4, 'Idaho', 'US-ID', 'state', 12),
(4, 'Illinois', 'US-IL', 'state', 13),
(4, 'Indiana', 'US-IN', 'state', 14),
(4, 'Iowa', 'US-IA', 'state', 15),
(4, 'Kansas', 'US-KS', 'state', 16),
(4, 'Kentucky', 'US-KY', 'state', 17),
(4, 'Louisiana', 'US-LA', 'state', 18),
(4, 'Maine', 'US-ME', 'state', 19),
(4, 'Maryland', 'US-MD', 'state', 20),
(4, 'Massachusetts', 'US-MA', 'state', 21),
(4, 'Michigan', 'US-MI', 'state', 22),
(4, 'Minnesota', 'US-MN', 'state', 23),
(4, 'Mississippi', 'US-MS', 'state', 24),
(4, 'Missouri', 'US-MO', 'state', 25),
(4, 'Montana', 'US-MT', 'state', 26),
(4, 'Nebraska', 'US-NE', 'state', 27),
(4, 'Nevada', 'US-NV', 'state', 28),
(4, 'New Hampshire', 'US-NH', 'state', 29),
(4, 'New Jersey', 'US-NJ', 'state', 30),
(4, 'New Mexico', 'US-NM', 'state', 31),
(4, 'New York', 'US-NY', 'state', 32),
(4, 'North Carolina', 'US-NC', 'state', 33),
(4, 'North Dakota', 'US-ND', 'state', 34),
(4, 'Ohio', 'US-OH', 'state', 35),
(4, 'Oklahoma', 'US-OK', 'state', 36),
(4, 'Oregon', 'US-OR', 'state', 37),
(4, 'Pennsylvania', 'US-PA', 'state', 38),
(4, 'Rhode Island', 'US-RI', 'state', 39),
(4, 'South Carolina', 'US-SC', 'state', 40),
(4, 'South Dakota', 'US-SD', 'state', 41),
(4, 'Tennessee', 'US-TN', 'state', 42),
(4, 'Texas', 'US-TX', 'state', 43),
(4, 'Utah', 'US-UT', 'state', 44),
(4, 'Vermont', 'US-VT', 'state', 45),
(4, 'Virginia', 'US-VA', 'state', 46),
(4, 'Washington', 'US-WA', 'state', 47),
(4, 'West Virginia', 'US-WV', 'state', 48),
(4, 'Wisconsin', 'US-WI', 'state', 49),
(4, 'Wyoming', 'US-WY', 'state', 50);

SET @us_ca = (SELECT id FROM provinces WHERE code = 'US-CA');
SET @us_tx = (SELECT id FROM provinces WHERE code = 'US-TX');
SET @us_fl = (SELECT id FROM provinces WHERE code = 'US-FL');
SET @us_ny = (SELECT id FROM provinces WHERE code = 'US-NY');
SET @us_il = (SELECT id FROM provinces WHERE code = 'US-IL');
SET @us_ga = (SELECT id FROM provinces WHERE code = 'US-GA');
SET @us_pa = (SELECT id FROM provinces WHERE code = 'US-PA');
SET @us_oh = (SELECT id FROM provinces WHERE code = 'US-OH');
SET @us_nc = (SELECT id FROM provinces WHERE code = 'US-NC');
SET @us_mi = (SELECT id FROM provinces WHERE code = 'US-MI');
SET @us_nj = (SELECT id FROM provinces WHERE code = 'US-NJ');
SET @us_va = (SELECT id FROM provinces WHERE code = 'US-VA');
SET @us_wa = (SELECT id FROM provinces WHERE code = 'US-WA');
SET @us_az = (SELECT id FROM provinces WHERE code = 'US-AZ');
SET @us_ma = (SELECT id FROM provinces WHERE code = 'US-MA');
SET @us_tn = (SELECT id FROM provinces WHERE code = 'US-TN');
SET @us_in = (SELECT id FROM provinces WHERE code = 'US-IN');
SET @us_mo = (SELECT id FROM provinces WHERE code = 'US-MO');
SET @us_md = (SELECT id FROM provinces WHERE code = 'US-MD');
SET @us_co = (SELECT id FROM provinces WHERE code = 'US-CO');
SET @us_mn = (SELECT id FROM provinces WHERE code = 'US-MN');
SET @us_wi = (SELECT id FROM provinces WHERE code = 'US-WI');
SET @us_or = (SELECT id FROM provinces WHERE code = 'US-OR');
SET @us_al = (SELECT id FROM provinces WHERE code = 'US-AL');
SET @us_la = (SELECT id FROM provinces WHERE code = 'US-LA');
SET @us_ky = (SELECT id FROM provinces WHERE code = 'US-KY');
SET @us_sc = (SELECT id FROM provinces WHERE code = 'US-SC');
SET @us_ok = (SELECT id FROM provinces WHERE code = 'US-OK');
SET @us_ct = (SELECT id FROM provinces WHERE code = 'US-CT');
SET @us_ia = (SELECT id FROM provinces WHERE code = 'US-IA');
SET @us_ar = (SELECT id FROM provinces WHERE code = 'US-AR');
SET @us_nv = (SELECT id FROM provinces WHERE code = 'US-NV');
SET @us_ms = (SELECT id FROM provinces WHERE code = 'US-MS');
SET @us_ks = (SELECT id FROM provinces WHERE code = 'US-KS');
SET @us_ut = (SELECT id FROM provinces WHERE code = 'US-UT');
SET @us_nm = (SELECT id FROM provinces WHERE code = 'US-NM');
SET @us_ne = (SELECT id FROM provinces WHERE code = 'US-NE');
SET @us_wv = (SELECT id FROM provinces WHERE code = 'US-WV');
SET @us_id = (SELECT id FROM provinces WHERE code = 'US-ID');
SET @us_hi = (SELECT id FROM provinces WHERE code = 'US-HI');
SET @us_nh = (SELECT id FROM provinces WHERE code = 'US-NH');
SET @us_me = (SELECT id FROM provinces WHERE code = 'US-ME');
SET @us_mt = (SELECT id FROM provinces WHERE code = 'US-MT');
SET @us_de = (SELECT id FROM provinces WHERE code = 'US-DE');
SET @us_sd = (SELECT id FROM provinces WHERE code = 'US-SD');
SET @us_nd = (SELECT id FROM provinces WHERE code = 'US-ND');
SET @us_vt = (SELECT id FROM provinces WHERE code = 'US-VT');
SET @us_wy = (SELECT id FROM provinces WHERE code = 'US-WY');
SET @us_ri = (SELECT id FROM provinces WHERE code = 'US-RI');
SET @us_ak = (SELECT id FROM provinces WHERE code = 'US-AK');

INSERT IGNORE INTO cities (province_id, name, sort_order) VALUES
(@us_ca, 'Los Angeles', 1), (@us_ca, 'San Francisco', 2), (@us_ca, 'San Diego', 3), (@us_ca, 'Sacramento', 4), (@us_ca, 'San Jose', 5),
(@us_tx, 'Houston', 1), (@us_tx, 'Dallas', 2), (@us_tx, 'Austin', 3), (@us_tx, 'San Antonio', 4),
(@us_fl, 'Miami', 1), (@us_fl, 'Orlando', 2), (@us_fl, 'Tampa', 3), (@us_fl, 'Jacksonville', 4),
(@us_ny, 'New York City', 1), (@us_ny, 'Buffalo', 2), (@us_ny, 'Rochester', 3), (@us_ny, 'Albany', 4),
(@us_il, 'Chicago', 1), (@us_il, 'Springfield', 2), (@us_il, 'Naperville', 3),
(@us_ga, 'Atlanta', 1), (@us_ga, 'Savannah', 2), (@us_ga, 'Augusta', 3),
(@us_pa, 'Philadelphia', 1), (@us_pa, 'Pittsburgh', 2), (@us_pa, 'Harrisburg', 3),
(@us_oh, 'Columbus', 1), (@us_oh, 'Cleveland', 2), (@us_oh, 'Cincinnati', 3),
(@us_nc, 'Charlotte', 1), (@us_nc, 'Raleigh', 2), (@us_nc, 'Greensboro', 3),
(@us_mi, 'Detroit', 1), (@us_mi, 'Grand Rapids', 2), (@us_mi, 'Ann Arbor', 3),
(@us_nj, 'Newark', 1), (@us_nj, 'Jersey City', 2), (@us_nj, 'Trenton', 3),
(@us_va, 'Virginia Beach', 1), (@us_va, 'Richmond', 2), (@us_va, 'Norfolk', 3),
(@us_wa, 'Seattle', 1), (@us_wa, 'Spokane', 2), (@us_wa, 'Tacoma', 3),
(@us_az, 'Phoenix', 1), (@us_az, 'Tucson', 2), (@us_az, 'Mesa', 3),
(@us_ma, 'Boston', 1), (@us_ma, 'Cambridge', 2), (@us_ma, 'Worcester', 3),
(@us_tn, 'Nashville', 1), (@us_tn, 'Memphis', 2), (@us_tn, 'Knoxville', 3),
(@us_in, 'Indianapolis', 1), (@us_in, 'Fort Wayne', 2), (@us_in, 'Evansville', 3),
(@us_mo, 'St. Louis', 1), (@us_mo, 'Kansas City', 2), (@us_mo, 'Springfield', 3),
(@us_md, 'Baltimore', 1), (@us_md, 'Annapolis', 2), (@us_md, 'Rockville', 3),
(@us_co, 'Denver', 1), (@us_co, 'Colorado Springs', 2), (@us_co, 'Boulder', 3),
(@us_mn, 'Minneapolis', 1), (@us_mn, 'St. Paul', 2), (@us_mn, 'Rochester', 3),
(@us_wi, 'Milwaukee', 1), (@us_wi, 'Madison', 2), (@us_wi, 'Green Bay', 3),
(@us_or, 'Portland', 1), (@us_or, 'Salem', 2), (@us_or, 'Eugene', 3),
(@us_al, 'Birmingham', 1), (@us_al, 'Montgomery', 2), (@us_al, 'Mobile', 3),
(@us_la, 'New Orleans', 1), (@us_la, 'Baton Rouge', 2), (@us_la, 'Shreveport', 3),
(@us_ky, 'Louisville', 1), (@us_ky, 'Lexington', 2), (@us_ky, 'Frankfort', 3),
(@us_sc, 'Charleston', 1), (@us_sc, 'Columbia', 2), (@us_sc, 'Greenville', 3),
(@us_ok, 'Oklahoma City', 1), (@us_ok, 'Tulsa', 2), (@us_ok, 'Norman', 3),
(@us_ct, 'Hartford', 1), (@us_ct, 'New Haven', 2), (@us_ct, 'Bridgeport', 3),
(@us_ia, 'Des Moines', 1), (@us_ia, 'Cedar Rapids', 2), (@us_ia, 'Iowa City', 3),
(@us_ar, 'Little Rock', 1), (@us_ar, 'Fayetteville', 2), (@us_ar, 'Fort Smith', 3),
(@us_nv, 'Las Vegas', 1), (@us_nv, 'Reno', 2), (@us_nv, 'Carson City', 3),
(@us_ms, 'Jackson', 1), (@us_ms, 'Gulfport', 2), (@us_ms, 'Biloxi', 3),
(@us_ks, 'Wichita', 1), (@us_ks, 'Kansas City', 2), (@us_ks, 'Topeka', 3),
(@us_ut, 'Salt Lake City', 1), (@us_ut, 'Provo', 2), (@us_ut, 'Park City', 3),
(@us_nm, 'Albuquerque', 1), (@us_nm, 'Santa Fe', 2), (@us_nm, 'Las Cruces', 3),
(@us_ne, 'Omaha', 1), (@us_ne, 'Lincoln', 2), (@us_ne, 'Grand Island', 3),
(@us_wv, 'Charleston', 1), (@us_wv, 'Huntington', 2), (@us_wv, 'Morgantown', 3),
(@us_id, 'Boise', 1), (@us_id, 'Idaho Falls', 2), (@us_id, 'Twin Falls', 3),
(@us_hi, 'Honolulu', 1), (@us_hi, 'Hilo', 2), (@us_hi, 'Kailua', 3),
(@us_nh, 'Manchester', 1), (@us_nh, 'Nashua', 2), (@us_nh, 'Concord', 3),
(@us_me, 'Portland', 1), (@us_me, 'Augusta', 2), (@us_me, 'Bangor', 3),
(@us_mt, 'Billings', 1), (@us_mt, 'Missoula', 2), (@us_mt, 'Helena', 3),
(@us_de, 'Wilmington', 1), (@us_de, 'Dover', 2), (@us_de, 'Newark', 3),
(@us_sd, 'Sioux Falls', 1), (@us_sd, 'Rapid City', 2), (@us_sd, 'Pierre', 3),
(@us_nd, 'Fargo', 1), (@us_nd, 'Bismarck', 2), (@us_nd, 'Grand Forks', 3),
(@us_vt, 'Burlington', 1), (@us_vt, 'Montpelier', 2), (@us_vt, 'Rutland', 3),
(@us_wy, 'Cheyenne', 1), (@us_wy, 'Casper', 2), (@us_wy, 'Jackson', 3),
(@us_ri, 'Providence', 1), (@us_ri, 'Newport', 2), (@us_ri, 'Warwick', 3),
(@us_ak, 'Anchorage', 1), (@us_ak, 'Juneau', 2), (@us_ak, 'Fairbanks', 3);

-- ═══════════════════════════════════════════════════════════════════════════
-- United Kingdom (id=5) – Countries & Regions
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, code, type, sort_order) VALUES
(5, 'England', 'GB-ENG', 'region', 1),
(5, 'Scotland', 'GB-SCT', 'region', 2),
(5, 'Wales', 'GB-WLS', 'region', 3),
(5, 'Northern Ireland', 'GB-NIR', 'region', 4);

SET @gb_eng = (SELECT id FROM provinces WHERE code = 'GB-ENG');
SET @gb_sct = (SELECT id FROM provinces WHERE code = 'GB-SCT');
SET @gb_wls = (SELECT id FROM provinces WHERE code = 'GB-WLS');
SET @gb_nir = (SELECT id FROM provinces WHERE code = 'GB-NIR');

INSERT IGNORE INTO cities (province_id, name, sort_order) VALUES
(@gb_eng, 'London', 1), (@gb_eng, 'Manchester', 2), (@gb_eng, 'Birmingham', 3),
(@gb_eng, 'Liverpool', 4), (@gb_eng, 'Leeds', 5), (@gb_eng, 'Sheffield', 6),
(@gb_eng, 'Bristol', 7), (@gb_eng, 'Newcastle upon Tyne', 8), (@gb_eng, 'Nottingham', 9),
(@gb_eng, 'Southampton', 10), (@gb_eng, 'Cambridge', 11), (@gb_eng, 'Oxford', 12),
(@gb_sct, 'Edinburgh', 1), (@gb_sct, 'Glasgow', 2), (@gb_sct, 'Aberdeen', 3),
(@gb_sct, 'Dundee', 4), (@gb_sct, 'Inverness', 5),
(@gb_wls, 'Cardiff', 1), (@gb_wls, 'Swansea', 2), (@gb_wls, 'Newport', 3),
(@gb_wls, 'Bangor', 4),
(@gb_nir, 'Belfast', 1), (@gb_nir, 'Derry', 2), (@gb_nir, 'Lisburn', 3);

-- ═══════════════════════════════════════════════════════════════════════════
-- France (id=7) – 13 Regions
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, sort_order) VALUES
(7, 'Île-de-France', 'Île-de-France', 'FR-IDF', 'region', 1),
(7, 'Auvergne-Rhône-Alpes', 'Auvergne-Rhône-Alpes', 'FR-ARA', 'region', 2),
(7, 'Nouvelle-Aquitaine', 'Nouvelle-Aquitaine', 'FR-NAQ', 'region', 3),
(7, 'Occitanie', 'Occitanie', 'FR-OCC', 'region', 4),
(7, 'Hauts-de-France', 'Hauts-de-France', 'FR-HDF', 'region', 5),
(7, "Provence-Alpes-Côte d'Azur", "Provence-Alpes-Côte d'Azur", 'FR-PAC', 'region', 6),
(7, 'Grand Est', 'Grand Est', 'FR-GES', 'region', 7),
(7, 'Brittany', 'Bretagne', 'FR-BRE', 'region', 8),
(7, 'Normandy', 'Normandie', 'FR-NOR', 'region', 9),
(7, "Bourgogne-Franche-Comté", "Bourgogne-Franche-Comté", 'FR-BFC', 'region', 10),
(7, 'Pays de la Loire', 'Pays de la Loire', 'FR-PDL', 'region', 11),
(7, 'Centre-Val de Loire', 'Centre-Val de Loire', 'FR-CVL', 'region', 12),
(7, 'Corsica', 'Corse', 'FR-COR', 'region', 13);

SET @fr_idf = (SELECT id FROM provinces WHERE code = 'FR-IDF');
SET @fr_ara = (SELECT id FROM provinces WHERE code = 'FR-ARA');
SET @fr_pac = (SELECT id FROM provinces WHERE code = 'FR-PAC');
SET @fr_occ = (SELECT id FROM provinces WHERE code = 'FR-OCC');
SET @fr_hdf = (SELECT id FROM provinces WHERE code = 'FR-HDF');
SET @fr_ges = (SELECT id FROM provinces WHERE code = 'FR-GES');
SET @fr_bre = (SELECT id FROM provinces WHERE code = 'FR-BRE');
SET @fr_nor = (SELECT id FROM provinces WHERE code = 'FR-NOR');
SET @fr_naq = (SELECT id FROM provinces WHERE code = 'FR-NAQ');
SET @fr_bfc = (SELECT id FROM provinces WHERE code = 'FR-BFC');
SET @fr_pdl = (SELECT id FROM provinces WHERE code = 'FR-PDL');
SET @fr_cvl = (SELECT id FROM provinces WHERE code = 'FR-CVL');
SET @fr_cor = (SELECT id FROM provinces WHERE code = 'FR-COR');

INSERT IGNORE INTO cities (province_id, name, native_name, sort_order) VALUES
(@fr_idf, 'Paris', 'Paris', 1), (@fr_idf, 'Versailles', 'Versailles', 2),
(@fr_idf, 'Saint-Denis', 'Saint-Denis', 3), (@fr_idf, 'Boulogne-Billancourt', 'Boulogne-Billancourt', 4),
(@fr_ara, 'Lyon', 'Lyon', 1), (@fr_ara, 'Grenoble', 'Grenoble', 2),
(@fr_ara, 'Saint-Étienne', 'Saint-Étienne', 3), (@fr_ara, 'Clermont-Ferrand', 'Clermont-Ferrand', 4),
(@fr_pac, 'Marseille', 'Marseille', 1), (@fr_pac, 'Nice', 'Nice', 2),
(@fr_pac, 'Toulon', 'Toulon', 3), (@fr_pac, 'Aix-en-Provence', 'Aix-en-Provence', 4),
(@fr_occ, 'Toulouse', 'Toulouse', 1), (@fr_occ, 'Montpellier', 'Montpellier', 2),
(@fr_occ, 'Nîmes', 'Nîmes', 3), (@fr_occ, 'Perpignan', 'Perpignan', 4),
(@fr_hdf, 'Lille', 'Lille', 1), (@fr_hdf, 'Amiens', 'Amiens', 2),
(@fr_hdf, 'Calais', 'Calais', 3),
(@fr_ges, 'Strasbourg', 'Strasbourg', 1), (@fr_ges, 'Reims', 'Reims', 2),
(@fr_ges, 'Metz', 'Metz', 3), (@fr_ges, 'Nancy', 'Nancy', 4),
(@fr_bre, 'Rennes', 'Rennes', 1), (@fr_bre, 'Brest', 'Brest', 2),
(@fr_bre, 'Nantes', 'Nantes', 3),
(@fr_nor, 'Rouen', 'Rouen', 1), (@fr_nor, 'Caen', 'Caen', 2),
(@fr_nor, 'Le Havre', 'Le Havre', 3),
(@fr_naq, 'Bordeaux', 'Bordeaux', 1), (@fr_naq, 'La Rochelle', 'La Rochelle', 2),
(@fr_naq, 'Limoges', 'Limoges', 3), (@fr_naq, 'Poitiers', 'Poitiers', 4),
(@fr_bfc, 'Dijon', 'Dijon', 1), (@fr_bfc, 'Besançon', 'Besançon', 2),
(@fr_pdl, 'Le Mans', 'Le Mans', 1), (@fr_pdl, 'Angers', 'Angers', 2),
(@fr_cvl, 'Orléans', 'Orléans', 1), (@fr_cvl, 'Tours', 'Tours', 2),
(@fr_cor, 'Ajaccio', 'Ajaccio', 1), (@fr_cor, 'Bastia', 'Bastia', 2);

-- ═══════════════════════════════════════════════════════════════════════════
-- Kuwait (id=8) – 6 Governorates
-- ═══════════════════════════════════════════════════════════════════════════
INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, sort_order) VALUES
(8, 'Al Asimah', 'العاصمة', 'KW-KU', 'governorate', 1),
(8, 'Hawalli', 'حولي', 'KW-HA', 'governorate', 2),
(8, 'Farwaniya', 'الفروانية', 'KW-FA', 'governorate', 3),
(8, 'Ahmadi', 'الأحمدي', 'KW-AH', 'governorate', 4),
(8, 'Jahra', 'الجهراء', 'KW-JA', 'governorate', 5),
(8, 'Mubarak Al-Kabeer', 'مبارك الكبير', 'KW-MU', 'governorate', 6);

SET @kw_asimah = (SELECT id FROM provinces WHERE code = 'KW-KU');
SET @kw_hawalli = (SELECT id FROM provinces WHERE code = 'KW-HA');
SET @kw_farwaniya = (SELECT id FROM provinces WHERE code = 'KW-FA');
SET @kw_ahmadi = (SELECT id FROM provinces WHERE code = 'KW-AH');
SET @kw_jahra = (SELECT id FROM provinces WHERE code = 'KW-JA');
SET @kw_mubarak = (SELECT id FROM provinces WHERE code = 'KW-MU');

INSERT IGNORE INTO cities (province_id, name, native_name, sort_order) VALUES
(@kw_asimah, 'Kuwait City', 'مدينة الكويت', 1),
(@kw_asimah, 'Dasman', 'دسمان', 2),
(@kw_asimah, 'Sharq', 'الشرق', 3),
(@kw_hawalli, 'Hawalli City', 'حولي', 1),
(@kw_hawalli, 'Salmiya', 'السالمية', 2),
(@kw_hawalli, 'Bayān', 'بيان', 3),
(@kw_farwaniya, 'Farwaniya City', 'الفروانية', 1),
(@kw_farwaniya, 'Jleeb Al-Shuyoukh', 'جليب الشيوخ', 2),
(@kw_farwaniya, 'Ardhiya', 'العارضية', 3),
(@kw_ahmadi, 'Ahmadi City', 'الأحمدي', 1),
(@kw_ahmadi, 'Fahaheel', 'الفحيحيل', 2),
(@kw_ahmadi, 'Mangaf', 'المنقف', 3),
(@kw_jahra, 'Jahra City', 'الجهراء', 1),
(@kw_jahra, 'Sulaibiya', 'الصليبية', 2),
(@kw_jahra, 'Taima', 'تيماء', 3),
(@kw_mubarak, 'Abu Halifa', 'أبو حليفة', 1),
(@kw_mubarak, 'Sabah Al-Salem', 'صباح السالم', 2),
(@kw_mubarak, 'Messila', 'المسيلة', 3);

-- ============================================================================
-- Generate slugs for all provinces and cities
-- ============================================================================
UPDATE countries
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;

UPDATE provinces
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;

UPDATE cities
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(LOWER(REPLACE(name, ' ', '-')), '[^a-z0-9-]', ''), '-+', '-'))
WHERE slug IS NULL;


-- ============================================================================


-- Polygon updates moved to polygons.mjs
