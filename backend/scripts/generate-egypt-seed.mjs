import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

// ─── SLUG GENERATION ───────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(name, provinceName, seen) {
  let slug = slugify(name);
  if (!seen.has(slug)) {
    seen.add(slug);
    return slug;
  }
  let n = 1;
  while (seen.has(`${slug}-${n}`)) n++;
  seen.add(`${slug}-${n}`);
  return `${slug}-${n}`;
}

// ─── POLYGON GENERATION ────────────────────────────────────────────────────────

function generateBBoxPolygon(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));

  const coords = [
    [lng - lngDelta, lat - latDelta],
    [lng + lngDelta, lat - latDelta],
    [lng + lngDelta, lat + latDelta],
    [lng - lngDelta, lat + latDelta],
    [lng - lngDelta, lat - latDelta],
  ];

  return JSON.stringify({
    type: 'Polygon',
    coordinates: [coords],
  });
}

function polygonRadiusForType(type) {
  switch (type) {
    case 'city': return 8;
    case 'district': return 3;
    case 'neighborhood': return 1.2;
    case 'area': return 2;
    default: return 4;
  }
}

// ─── EGYPT DATA ────────────────────────────────────────────────────────────────

const EGYPT_COUNTRY = {
  iso_code: 'EG',
  iso_code_3: 'EGY',
  name: 'Egypt',
  native_name: 'مصر',
  phone_code: '+20',
  phone_max_length: 10,
  phone_min_length: 10,
  default_locale: 'ar',
  default_currency: 'EGP',
  currency_symbol: 'E£',
  currency_decimal_places: 2,
  currency_name: 'Egyptian Pound',
  flag_emoji: '🇪🇬',
  lat: 26.8206,
  lng: 30.8025,
};

// Each province entry:
// { name, code, native_name, type, lat, lng, areas: [{ name, native_name, type, lat, lng }] }
const PROVINCES = [
  // ── 1. Cairo ──
  {
    name: 'Cairo',
    code: 'EG-C',
    native_name: 'القاهرة',
    lat: 30.0444, lng: 31.2357,
    areas: [
      { name: 'Cairo City', native_name: 'مدينة القاهرة', type: 'city', lat: 30.0444, lng: 31.2357 },
      { name: 'Downtown Cairo', native_name: 'وسط البلد', type: 'district', lat: 30.0477, lng: 31.2370 },
      { name: 'Garden City', native_name: 'جاردن سيتي', type: 'district', lat: 30.0380, lng: 31.2300 },
      { name: 'Zamalek', native_name: 'الزمالك', type: 'district', lat: 30.0644, lng: 31.2185 },
      { name: 'Abdeen', native_name: 'عابدين', type: 'district', lat: 30.0414, lng: 31.2412 },
      { name: 'Sayeda Zeinab', native_name: 'السيدة زينب', type: 'district', lat: 30.0320, lng: 31.2370 },
      { name: 'Old Cairo', native_name: 'مصر القديمة', type: 'district', lat: 30.0060, lng: 31.2310 },
      { name: 'Fustat', native_name: 'الفسطاط', type: 'area', lat: 30.0000, lng: 31.2310 },
      { name: 'Manial', native_name: 'المنيل', type: 'district', lat: 30.0310, lng: 31.2270 },
      { name: 'Qasr El Nil', native_name: 'قصر النيل', type: 'district', lat: 30.0484, lng: 31.2282 },
      { name: 'Bulaq', native_name: 'بولاق', type: 'district', lat: 30.0590, lng: 31.2280 },
      { name: 'Rod El Farag', native_name: 'رود الفرج', type: 'district', lat: 30.0750, lng: 31.2330 },
      { name: 'Shubra', native_name: 'شبرا', type: 'district', lat: 30.0730, lng: 31.2410 },
      { name: 'El Sahel', native_name: 'الساحل', type: 'district', lat: 30.0870, lng: 31.2450 },
      { name: 'Zawya El Hamra', native_name: 'الزاوية الحمراء', type: 'district', lat: 30.1020, lng: 31.2590 },
      { name: 'Hadayek El Kobba', native_name: 'حدائق القبة', type: 'district', lat: 30.0930, lng: 31.2730 },
      { name: 'Saray El Kobba', native_name: 'سريا القبة', type: 'area', lat: 30.0980, lng: 31.2800 },
      { name: 'Zeitoun', native_name: 'الزيتون', type: 'district', lat: 30.1100, lng: 31.2860 },
      { name: 'Matareya', native_name: 'المطرية', type: 'district', lat: 30.1280, lng: 31.2850 },
      { name: 'Ain Shams', native_name: 'عين شمس', type: 'district', lat: 30.1280, lng: 31.3060 },
      { name: 'El Marg', native_name: 'المرج', type: 'district', lat: 30.1570, lng: 31.3200 },
      { name: 'El Salam', native_name: 'السلام', type: 'district', lat: 30.1700, lng: 31.3500 },
      { name: 'Dar El Salam', native_name: 'دار السلام', type: 'district', lat: 29.9800, lng: 31.2600 },
      { name: 'Basatin', native_name: 'البساتين', type: 'district', lat: 29.9700, lng: 31.2600 },
      { name: 'Tora', native_name: 'طرة', type: 'district', lat: 29.9480, lng: 31.2800 },
      { name: 'Helwan', native_name: 'حلوان', type: 'city', lat: 29.8500, lng: 31.3330 },
      { name: 'El Maasara', native_name: 'المعصرة', type: 'district', lat: 29.9000, lng: 31.3000 },
      { name: 'Mokattam', native_name: 'المقطم', type: 'district', lat: 29.9800, lng: 31.3200 },
      { name: 'Nasr City', native_name: 'مدينة نصر', type: 'city', lat: 30.0580, lng: 31.3300 },
      { name: 'Heliopolis', native_name: 'مصر الجديدة', type: 'city', lat: 30.0950, lng: 31.3300 },
      { name: 'El Nozha', native_name: 'النزهة', type: 'district', lat: 30.1060, lng: 31.3520 },
      { name: 'Sheraton', native_name: 'شيراتون', type: 'area', lat: 30.0850, lng: 31.3610 },
      { name: 'New Heliopolis', native_name: 'هليوبوليس الجديدة', type: 'area', lat: 30.1300, lng: 31.3880 },
      { name: 'New Cairo', native_name: 'القاهرة الجديدة', type: 'city', lat: 30.0100, lng: 31.4400 },
      { name: 'Fifth Settlement', native_name: 'التجمع الخامس', type: 'area', lat: 30.0100, lng: 31.4660 },
      { name: 'El Rehab', native_name: 'الرحاب', type: 'area', lat: 30.0250, lng: 31.4900 },
      { name: 'Katameya', native_name: 'القطامية', type: 'area', lat: 29.9900, lng: 31.4900 },
      { name: 'El Shorouk', native_name: 'الشروق', type: 'city', lat: 30.1350, lng: 31.6200 },
      { name: 'Badr City', native_name: 'مدينة بدر', type: 'city', lat: 30.1430, lng: 31.7250 },
      { name: 'Obour City', native_name: 'مدينة العبور', type: 'city', lat: 30.2000, lng: 31.5200 },
      { name: 'Madinaty', native_name: 'مدينتي', type: 'area', lat: 30.0820, lng: 31.5520 },
      { name: 'Maadi', native_name: 'المعادي', type: 'district', lat: 29.9600, lng: 31.2600 },
      { name: 'Maadi Degla', native_name: 'المعادي دجلة', type: 'neighborhood', lat: 29.9600, lng: 31.2800 },
      { name: '15th of May City', native_name: 'مدينة ١٥ مايو', type: 'city', lat: 29.8600, lng: 31.3800 },
      { name: 'El Tebbin', native_name: 'التبين', type: 'district', lat: 29.8200, lng: 31.3500 },
    ],
  },

  // ── 2. Alexandria ──
  {
    name: 'Alexandria',
    code: 'EG-ALX',
    native_name: 'الإسكندرية',
    lat: 31.2001, lng: 29.9187,
    areas: [
      { name: 'Alexandria City', native_name: 'مدينة الإسكندرية', type: 'city', lat: 31.2001, lng: 29.9187 },
      { name: 'Smouha', native_name: 'سموحة', type: 'district', lat: 31.2200, lng: 29.9550 },
      { name: 'Sidi Bishr', native_name: 'سيدي بشر', type: 'district', lat: 31.2520, lng: 29.9700 },
      { name: 'Stanly', native_name: 'ستانلي', type: 'neighborhood', lat: 31.2320, lng: 29.9450 },
      { name: 'Gleem', native_name: 'جليم', type: 'neighborhood', lat: 31.2400, lng: 29.9550 },
      { name: 'Ibrahimeya', native_name: 'الإبراهيمية', type: 'district', lat: 31.2160, lng: 29.9350 },
      { name: 'Sporting', native_name: 'سبورتنج', type: 'neighborhood', lat: 31.2100, lng: 29.9300 },
      { name: 'Mostafa Kamel', native_name: 'مصطفى كامل', type: 'neighborhood', lat: 31.2020, lng: 29.9220 },
      { name: 'Roushdy', native_name: 'رشدي', type: 'neighborhood', lat: 31.2300, lng: 29.9490 },
      { name: 'Sidi Gaber', native_name: 'سيدي جابر', type: 'district', lat: 31.2230, lng: 29.9380 },
      { name: 'San Stefano', native_name: 'سان ستيفانو', type: 'neighborhood', lat: 31.2420, lng: 29.9600 },
      { name: 'Miami', native_name: 'ميامي', type: 'neighborhood', lat: 31.2600, lng: 29.9770 },
      { name: 'Mandara', native_name: 'المندرة', type: 'neighborhood', lat: 31.2750, lng: 29.9850 },
      { name: 'Asafra', native_name: 'العصافرة', type: 'neighborhood', lat: 31.2840, lng: 29.9900 },
      { name: 'Montaza', native_name: 'المنتزة', type: 'district', lat: 31.2900, lng: 30.0000 },
      { name: 'Abu Qir', native_name: 'أبو قير', type: 'area', lat: 31.3200, lng: 30.0630 },
      { name: 'Kafr Abdou', native_name: 'كفر عبده', type: 'neighborhood', lat: 31.2240, lng: 29.9480 },
      { name: 'Fleming', native_name: 'فلمنغ', type: 'neighborhood', lat: 31.2340, lng: 29.9500 },
      { name: 'El Saraya', native_name: 'السرايا', type: 'neighborhood', lat: 31.2140, lng: 29.9330 },
      { name: 'Muharram Bek', native_name: 'محرم بك', type: 'district', lat: 31.1940, lng: 29.9100 },
      { name: 'Mina El Basal', native_name: 'مينا البصل', type: 'district', lat: 31.1800, lng: 29.8800 },
      { name: 'Anfoushi', native_name: 'الأنفوشي', type: 'neighborhood', lat: 31.1960, lng: 29.8850 },
      { name: 'Bahari', native_name: 'بحري', type: 'neighborhood', lat: 31.2000, lng: 29.8950 },
      { name: 'Mansheya', native_name: 'المنشية', type: 'district', lat: 31.1980, lng: 29.8930 },
      { name: 'Labban', native_name: 'اللبان', type: 'neighborhood', lat: 31.1820, lng: 29.8880 },
      { name: 'Dekheila', native_name: 'الدخيلة', type: 'district', lat: 31.1300, lng: 29.8200 },
      { name: 'El Amreya', native_name: 'العامرية', type: 'district', lat: 31.0300, lng: 29.7800 },
      { name: 'King Mariout', native_name: 'كنج مريوط', type: 'area', lat: 31.1500, lng: 29.8300 },
      { name: 'Borg El Arab', native_name: 'برج العرب', type: 'city', lat: 30.9000, lng: 29.5800 },
      { name: 'Agamy', native_name: 'العجمي', type: 'district', lat: 31.1300, lng: 29.7800 },
      { name: 'El Max', native_name: 'المكس', type: 'area', lat: 31.1150, lng: 29.8050 },
    ],
  },

  // ── 3. Giza ──
  {
    name: 'Giza',
    code: 'EG-GZ',
    native_name: 'الجيزة',
    lat: 30.0131, lng: 31.2089,
    areas: [
      { name: 'Giza City', native_name: 'مدينة الجيزة', type: 'city', lat: 30.0131, lng: 31.2089 },
      { name: 'Mohandessin', native_name: 'المهندسين', type: 'district', lat: 30.0498, lng: 31.2020 },
      { name: 'Agouza', native_name: 'العجوزة', type: 'district', lat: 30.0530, lng: 31.2100 },
      { name: 'Dokki', native_name: 'الدقي', type: 'district', lat: 30.0390, lng: 31.2060 },
      { name: 'Imbaba', native_name: 'إمبابة', type: 'district', lat: 30.0750, lng: 31.2100 },
      { name: 'Bulaq El Dakrour', native_name: 'بولاق الدكرور', type: 'district', lat: 30.0360, lng: 31.1790 },
      { name: 'Mit Okba', native_name: 'ميت عقبة', type: 'neighborhood', lat: 30.0600, lng: 31.2000 },
      { name: 'Faisal', native_name: 'فيصل', type: 'district', lat: 30.0070, lng: 31.1900 },
      { name: 'Haram', native_name: 'الهرم', type: 'district', lat: 29.9890, lng: 31.1670 },
      { name: 'Remaya', native_name: 'الرماية', type: 'area', lat: 29.9700, lng: 31.1550 },
      { name: 'Omraniya', native_name: 'العمرانية', type: 'district', lat: 30.0000, lng: 31.1880 },
      { name: 'Talbiya', native_name: 'الطالبية', type: 'area', lat: 29.9800, lng: 31.1800 },
      { name: 'Kerdasa', native_name: 'كرداسة', type: 'area', lat: 30.0340, lng: 31.1150 },
      { name: 'Mansoureya', native_name: 'المنصورية', type: 'area', lat: 30.0850, lng: 31.1500 },
      { name: 'Warraq', native_name: 'الوراق', type: 'district', lat: 30.1010, lng: 31.2170 },
      { name: 'Abu Nomros', native_name: 'أبو نمرس', type: 'area', lat: 29.9760, lng: 31.2300 },
      { name: 'Badrashin', native_name: 'البدرشين', type: 'area', lat: 29.8580, lng: 31.2600 },
      { name: 'Hawamdeya', native_name: 'الحوامدية', type: 'area', lat: 29.9000, lng: 31.2500 },
      { name: 'Atfeh', native_name: 'العطف', type: 'area', lat: 29.7500, lng: 31.2830 },
      { name: 'El Saf', native_name: 'الصف', type: 'area', lat: 29.6500, lng: 31.3000 },
      { name: 'Awsim', native_name: 'أوسيم', type: 'area', lat: 30.1180, lng: 31.1650 },
      { name: 'Dahshur', native_name: 'دهشور', type: 'area', lat: 29.7800, lng: 31.2300 },
      { name: 'Sakiet Mekki', native_name: 'ساقية مكي', type: 'neighborhood', lat: 30.0600, lng: 31.1850 },
      { name: '6th of October City', native_name: 'مدينة السادس من أكتوبر', type: 'city', lat: 29.9400, lng: 30.9300 },
      { name: 'Sheikh Zayed City', native_name: 'مدينة الشيخ زايد', type: 'city', lat: 30.0350, lng: 31.0000 },
      { name: 'New October', native_name: 'أكتوبر الجديدة', type: 'city', lat: 29.8600, lng: 31.0100 },
    ],
  },

  // ── 4. Sharqia ──
  {
    name: 'Sharqia',
    code: 'EG-SHR',
    native_name: 'الشرقية',
    lat: 30.7130, lng: 31.6310,
    areas: [
      { name: 'Zagazig', native_name: 'الزقازيق', type: 'city', lat: 30.5877, lng: 31.5020 },
      { name: 'Belbeis', native_name: 'بلبيس', type: 'city', lat: 30.4200, lng: 31.5600 },
      { name: '10th of Ramadan City', native_name: 'مدينة العاشر من رمضان', type: 'city', lat: 30.3100, lng: 31.7300 },
      { name: 'Abu Hammad', native_name: 'أبو حماد', type: 'city', lat: 30.5450, lng: 31.6400 },
      { name: 'Abu Kabir', native_name: 'أبو كبير', type: 'city', lat: 30.7120, lng: 31.6700 },
      { name: 'Faqous', native_name: 'فاقوس', type: 'city', lat: 30.7300, lng: 31.8000 },
      { name: 'Hehya', native_name: 'ههيا', type: 'city', lat: 30.6720, lng: 31.6030 },
      { name: 'Mashtoul El Souk', native_name: 'مشتول السوق', type: 'city', lat: 30.4900, lng: 31.5400 },
      { name: 'Minya El Qamh', native_name: 'منيا القمح', type: 'city', lat: 30.5100, lng: 31.3500 },
      { name: 'Diarb Negm', native_name: 'ديرب نجم', type: 'city', lat: 30.7530, lng: 31.4600 },
      { name: 'Kafr Saqr', native_name: 'كفر صقر', type: 'city', lat: 30.7930, lng: 31.6300 },
      { name: 'Awlad Saqr', native_name: 'أولاد صقر', type: 'city', lat: 30.8500, lng: 31.7500 },
      { name: 'Husseiniya', native_name: 'الحسينية', type: 'city', lat: 30.8600, lng: 31.9200 },
      { name: 'Qenayen', native_name: 'قناين', type: 'city', lat: 30.6000, lng: 31.5800 },
      { name: 'San El Hagar', native_name: 'صان الحجر', type: 'area', lat: 30.9000, lng: 31.9200 },
    ],
  },

  // ── 5. Dakahlia ──
  {
    name: 'Dakahlia',
    code: 'EG-DK',
    native_name: 'الدقهلية',
    lat: 31.0379, lng: 31.5598,
    areas: [
      { name: 'Mansoura', native_name: 'المنصورة', type: 'city', lat: 31.0488, lng: 31.5610 },
      { name: 'Mit Ghamr', native_name: 'ميت غمر', type: 'city', lat: 30.7170, lng: 31.2600 },
      { name: 'Talkha', native_name: 'طلخا', type: 'city', lat: 31.0500, lng: 31.4000 },
      { name: 'Nabaroh', native_name: 'نبروه', type: 'city', lat: 31.1010, lng: 31.3170 },
      { name: 'Sherbin', native_name: 'شربين', type: 'city', lat: 31.1900, lng: 31.5300 },
      { name: 'El Senbellawein', native_name: 'السنبلاوين', type: 'city', lat: 30.8850, lng: 31.4700 },
      { name: 'Temay El Amdeed', native_name: 'تمي الأمديد', type: 'city', lat: 30.8800, lng: 31.3400 },
      { name: 'Manzala', native_name: 'المنزلة', type: 'city', lat: 31.2200, lng: 31.8300 },
      { name: 'Gamasa', native_name: 'جمصة', type: 'city', lat: 31.4270, lng: 31.5200 },
      { name: 'Dekernes', native_name: 'دكرنس', type: 'city', lat: 30.9100, lng: 31.3800 },
      { name: 'Belqas', native_name: 'بلقاس', type: 'city', lat: 31.2250, lng: 31.3600 },
      { name: 'Aga', native_name: 'أجا', type: 'city', lat: 30.9500, lng: 31.3000 },
      { name: 'Mit Salsil', native_name: 'ميت سلسيل', type: 'city', lat: 30.8200, lng: 31.3400 },
      { name: 'Beni Ebid', native_name: 'بني عبيد', type: 'city', lat: 31.0400, lng: 31.3600 },
      { name: 'Minet El Nasr', native_name: 'منية النصر', type: 'city', lat: 31.1400, lng: 31.7000 },
    ],
  },

  // ── 6. Beheira ──
  {
    name: 'Beheira',
    code: 'EG-BH',
    native_name: 'البحيرة',
    lat: 31.1410, lng: 30.5170,
    areas: [
      { name: 'Damanhur', native_name: 'دمنهور', type: 'city', lat: 31.0389, lng: 30.4680 },
      { name: 'Kafr El Dawwar', native_name: 'كفر الدوار', type: 'city', lat: 31.1300, lng: 30.1300 },
      { name: 'Rashid', native_name: 'رشيد', type: 'city', lat: 31.4020, lng: 30.4200 },
      { name: 'Edku', native_name: 'إدكو', type: 'city', lat: 31.2940, lng: 30.2960 },
      { name: 'Abu El Matamir', native_name: 'أبو المطامير', type: 'city', lat: 30.9400, lng: 30.1700 },
      { name: 'Housh Essa', native_name: 'حوش عيسى', type: 'city', lat: 30.9100, lng: 30.3000 },
      { name: 'Wadi El Natrun', native_name: 'وادي النطرون', type: 'city', lat: 30.3760, lng: 30.1930 },
      { name: 'Kom Hamada', native_name: 'كوم حمادة', type: 'city', lat: 30.7600, lng: 30.6900 },
      { name: 'Mahmoudia', native_name: 'المحمودية', type: 'city', lat: 31.1850, lng: 30.5250 },
      { name: 'Rahmaniya', native_name: 'الرحمانية', type: 'city', lat: 31.0700, lng: 30.6900 },
      { name: 'Itay El Barud', native_name: 'إيتاي البارود', type: 'city', lat: 30.8900, lng: 30.6700 },
      { name: 'Shubra Khit', native_name: 'شبراخيت', type: 'city', lat: 31.0300, lng: 30.7100 },
      { name: 'Badr Center', native_name: 'مركز بدر', type: 'city', lat: 30.8000, lng: 30.2000 },
    ],
  },

  // ── 7. Gharbia ──
  {
    name: 'Gharbia',
    code: 'EG-GH',
    native_name: 'الغربية',
    lat: 30.8421, lng: 31.0450,
    areas: [
      { name: 'Tanta', native_name: 'طنطا', type: 'city', lat: 30.7865, lng: 31.0000 },
      { name: 'El Mahalla El Kubra', native_name: 'المحلة الكبرى', type: 'city', lat: 30.9720, lng: 31.1600 },
      { name: 'Samanoud', native_name: 'سمنود', type: 'city', lat: 30.9600, lng: 31.2400 },
      { name: 'Zefta', native_name: 'زفتى', type: 'city', lat: 30.7200, lng: 31.2400 },
      { name: 'Kafr El Zayat', native_name: 'كفر الزيات', type: 'city', lat: 30.8200, lng: 30.8300 },
      { name: 'Santa', native_name: 'سنطة', type: 'city', lat: 30.7500, lng: 31.0000 },
      { name: 'Basyoun', native_name: 'بسيون', type: 'city', lat: 30.9500, lng: 30.7400 },
      { name: 'Qutur', native_name: 'قطور', type: 'city', lat: 30.8500, lng: 30.8300 },
    ],
  },

  // ── 8. Monufia ──
  {
    name: 'Monufia',
    code: 'EG-MNF',
    native_name: 'المنوفية',
    lat: 30.5200, lng: 30.9760,
    areas: [
      { name: 'Shibin El Kom', native_name: 'شبين الكوم', type: 'city', lat: 30.5580, lng: 31.0050 },
      { name: 'Menouf', native_name: 'منوف', type: 'city', lat: 30.4680, lng: 30.9300 },
      { name: 'Ashmoun', native_name: 'أشمون', type: 'city', lat: 30.3100, lng: 31.0500 },
      { name: 'Tala', native_name: 'تلا', type: 'city', lat: 30.6800, lng: 30.9400 },
      { name: 'Quwaysna', native_name: 'قويسنا', type: 'city', lat: 30.5650, lng: 31.1500 },
      { name: 'Berket El Saba', native_name: 'بركة السبع', type: 'city', lat: 30.6300, lng: 31.0800 },
      { name: 'Sadat City', native_name: 'مدينة السادات', type: 'city', lat: 30.3700, lng: 30.5300 },
      { name: 'El Shohada', native_name: 'الشهداء', type: 'city', lat: 30.5800, lng: 30.8800 },
      { name: 'Bajour', native_name: 'الباجور', type: 'city', lat: 30.4300, lng: 31.0400 },
    ],
  },

  // ── 9. Qalyubia ──
  {
    name: 'Qalyubia',
    code: 'EG-KB',
    native_name: 'القليوبية',
    lat: 30.3280, lng: 31.2100,
    areas: [
      { name: 'Banha', native_name: 'بنها', type: 'city', lat: 30.4710, lng: 31.1780 },
      { name: 'Qalyub', native_name: 'قليوب', type: 'city', lat: 30.2000, lng: 31.2000 },
      { name: 'Shubra El Kheima', native_name: 'شبرا الخيمة', type: 'city', lat: 30.1280, lng: 31.2300 },
      { name: 'Khanka', native_name: 'الخانكة', type: 'city', lat: 30.2100, lng: 31.3500 },
      { name: 'Toukh', native_name: 'طوخ', type: 'city', lat: 30.3500, lng: 31.2000 },
      { name: 'Kafr Shukr', native_name: 'كفر شكر', type: 'city', lat: 30.3700, lng: 31.3100 },
      { name: 'Qaha', native_name: 'قها', type: 'city', lat: 30.2700, lng: 31.2000 },
      { name: 'El Qanater El Khayreya', native_name: 'القناطر الخيرية', type: 'city', lat: 30.1900, lng: 31.1400 },
      { name: 'Shebin El Qanater', native_name: 'شبين القناطر', type: 'city', lat: 30.2700, lng: 31.3200 },
      { name: 'El Ubour', native_name: 'العبور', type: 'city', lat: 30.2000, lng: 31.4400 },
    ],
  },

  // ── 10. Aswan ──
  {
    name: 'Aswan',
    code: 'EG-ASN',
    native_name: 'أسوان',
    lat: 24.0889, lng: 32.8998,
    areas: [
      { name: 'Aswan City', native_name: 'مدينة أسوان', type: 'city', lat: 24.0889, lng: 32.8998 },
      { name: 'Edfu', native_name: 'إدفو', type: 'city', lat: 24.9780, lng: 32.8780 },
      { name: 'Kom Ombo', native_name: 'كوم أمبو', type: 'city', lat: 24.4700, lng: 32.9500 },
      { name: 'Daraw', native_name: 'دراو', type: 'city', lat: 24.4150, lng: 32.9300 },
      { name: 'Nasr El Nuba', native_name: 'نصر النوبة', type: 'city', lat: 23.8200, lng: 32.9000 },
      { name: 'Abu Simbel', native_name: 'أبو سمبل', type: 'city', lat: 22.3460, lng: 31.6250 },
      { name: 'Kalabsha', native_name: 'كلابشة', type: 'area', lat: 23.5200, lng: 32.8700 },
    ],
  },

  // ── 11. Luxor ──
  {
    name: 'Luxor',
    code: 'EG-LX',
    native_name: 'الأقصر',
    lat: 25.6872, lng: 32.6396,
    areas: [
      { name: 'Luxor City', native_name: 'مدينة الأقصر', type: 'city', lat: 25.6872, lng: 32.6396 },
      { name: 'Esna', native_name: 'إسنا', type: 'city', lat: 25.2930, lng: 32.5540 },
      { name: 'Armant', native_name: 'أرمنت', type: 'city', lat: 25.6190, lng: 32.5300 },
      { name: 'El Karnak', native_name: 'الكرنك', type: 'area', lat: 25.7200, lng: 32.6570 },
      { name: 'El West Bank', native_name: 'البر الغربي', type: 'area', lat: 25.7000, lng: 32.6000 },
    ],
  },

  // ── 12. Red Sea ──
  {
    name: 'Red Sea',
    code: 'EG-BA',
    native_name: 'البحر الأحمر',
    lat: 26.0430, lng: 33.7642,
    areas: [
      { name: 'Hurghada', native_name: 'الغردقة', type: 'city', lat: 27.2578, lng: 33.8116 },
      { name: 'Marsa Alam', native_name: 'مرسى علم', type: 'city', lat: 25.0630, lng: 34.8900 },
      { name: 'El Gouna', native_name: 'الجونة', type: 'city', lat: 27.3850, lng: 33.6720 },
      { name: 'Safaga', native_name: 'سفاجا', type: 'city', lat: 26.7400, lng: 33.9400 },
      { name: 'Qusayr', native_name: 'القصير', type: 'city', lat: 26.1080, lng: 34.2800 },
      { name: 'Ras Ghareb', native_name: 'رأس غارب', type: 'city', lat: 28.3600, lng: 33.0700 },
      { name: 'Shalateen', native_name: 'شلاتين', type: 'city', lat: 23.1300, lng: 35.5800 },
      { name: 'Abu Ramad', native_name: 'أبو رماد', type: 'area', lat: 22.6500, lng: 35.7200 },
      { name: 'Hamata', native_name: 'حماطة', type: 'area', lat: 24.2500, lng: 35.4400 },
      { name: 'Sahl Hasheesh', native_name: 'سهل حشيش', type: 'area', lat: 27.0400, lng: 33.9000 },
      { name: 'Makadi Bay', native_name: 'خليج ماكادي', type: 'area', lat: 26.9500, lng: 33.9700 },
      { name: 'Soma Bay', native_name: 'خليج سومة', type: 'area', lat: 26.9200, lng: 33.9900 },
    ],
  },

  // ── 13. South Sinai ──
  {
    name: 'South Sinai',
    code: 'EG-JS',
    native_name: 'جنوب سيناء',
    lat: 28.6730, lng: 34.1310,
    areas: [
      { name: 'Sharm El Sheikh', native_name: 'شرم الشيخ', type: 'city', lat: 27.9158, lng: 34.3299 },
      { name: 'Dahab', native_name: 'دهب', type: 'city', lat: 28.4920, lng: 34.5000 },
      { name: 'Saint Catherine', native_name: 'سانت كاترين', type: 'city', lat: 28.5620, lng: 33.9500 },
      { name: 'Nuweiba', native_name: 'نويبع', type: 'city', lat: 29.0400, lng: 34.6600 },
      { name: 'Taba', native_name: 'طابا', type: 'city', lat: 29.4900, lng: 34.9000 },
      { name: 'Ras Sidr', native_name: 'رأس سدر', type: 'city', lat: 29.5900, lng: 32.6900 },
      { name: 'Abu Zenima', native_name: 'أبو زنيمة', type: 'city', lat: 29.0500, lng: 33.1000 },
      { name: 'El Tor', native_name: 'الطور', type: 'city', lat: 28.2400, lng: 33.6200 },
    ],
  },

  // ── 14. North Sinai ──
  {
    name: 'North Sinai',
    code: 'EG-SIN',
    native_name: 'شمال سيناء',
    lat: 30.4910, lng: 33.6300,
    areas: [
      { name: 'Arish', native_name: 'العريش', type: 'city', lat: 31.1320, lng: 33.8030 },
      { name: 'Rafah', native_name: 'رفح', type: 'city', lat: 31.2800, lng: 34.2400 },
      { name: 'Sheikh Zuweid', native_name: 'الشيخ زويد', type: 'city', lat: 31.2100, lng: 34.1200 },
      { name: 'Bir El Abd', native_name: 'بئر العبد', type: 'city', lat: 31.0200, lng: 33.0200 },
      { name: 'El Hassana', native_name: 'الحسنة', type: 'city', lat: 30.4700, lng: 33.7600 },
      { name: 'Nakhl', native_name: 'نخل', type: 'city', lat: 29.9000, lng: 33.7500 },
    ],
  },

  // ── 15. Suez ──
  {
    name: 'Suez',
    code: 'EG-SUZ',
    native_name: 'السويس',
    lat: 29.9737, lng: 32.5263,
    areas: [
      { name: 'Suez City', native_name: 'مدينة السويس', type: 'city', lat: 29.9737, lng: 32.5263 },
      { name: 'Ain Sokhna', native_name: 'العين السخنة', type: 'city', lat: 29.6200, lng: 32.3600 },
      { name: 'Ataka', native_name: 'عتاقة', type: 'district', lat: 29.9500, lng: 32.4800 },
      { name: 'Port Tawfik', native_name: 'بورتوفيق', type: 'district', lat: 29.9330, lng: 32.5500 },
      { name: 'El Naqaa', native_name: 'النقعة', type: 'area', lat: 30.0000, lng: 32.5400 },
      { name: 'Kabanoun', native_name: 'كبانون', type: 'area', lat: 29.9900, lng: 32.5200 },
    ],
  },

  // ── 16. Ismailia ──
  {
    name: 'Ismailia',
    code: 'EG-IS',
    native_name: 'الإسماعيلية',
    lat: 30.6043, lng: 32.2723,
    areas: [
      { name: 'Ismailia City', native_name: 'مدينة الإسماعيلية', type: 'city', lat: 30.6043, lng: 32.2723 },
      { name: 'Fayed', native_name: 'فايد', type: 'city', lat: 30.3200, lng: 32.3000 },
      { name: 'Abu Sultan', native_name: 'أبو سلطان', type: 'area', lat: 30.4300, lng: 32.3200 },
      { name: 'Al Qantara Sharq', native_name: 'القنطرة شرق', type: 'city', lat: 30.8500, lng: 32.3300 },
      { name: 'Al Qantara Gharb', native_name: 'القنطرة غرب', type: 'city', lat: 30.8300, lng: 32.2000 },
      { name: 'Tell El Kabir', native_name: 'التل الكبير', type: 'city', lat: 30.5300, lng: 31.7900 },
      { name: 'Qassasin', native_name: 'القصاصين', type: 'city', lat: 30.5800, lng: 31.9300 },
      { name: 'Abu Sawer', native_name: 'أبو صوير', type: 'city', lat: 30.5300, lng: 32.0900 },
      { name: 'El Salhiya', native_name: 'الصالحية', type: 'city', lat: 30.6700, lng: 31.8800 },
    ],
  },

  // ── 17. Port Said ──
  {
    name: 'Port Said',
    code: 'EG-PTS',
    native_name: 'بورسعيد',
    lat: 31.2653, lng: 32.3019,
    areas: [
      { name: 'Port Said City', native_name: 'مدينة بورسعيد', type: 'city', lat: 31.2653, lng: 32.3019 },
      { name: 'Port Fouad', native_name: 'بورفؤاد', type: 'city', lat: 31.2500, lng: 32.3300 },
      { name: 'El Manakh', native_name: 'المناخ', type: 'district', lat: 31.2700, lng: 32.2900 },
      { name: 'El Arab', native_name: 'العرب', type: 'district', lat: 31.2600, lng: 32.3000 },
      { name: 'El Gharb', native_name: 'الغرب', type: 'district', lat: 31.2550, lng: 32.2950 },
      { name: 'El Dawahi', native_name: 'الضواحي', type: 'district', lat: 31.2800, lng: 32.2900 },
      { name: 'El Sharg', native_name: 'الشرق', type: 'district', lat: 31.2650, lng: 32.3100 },
      { name: 'Zohour', native_name: 'الزهور', type: 'district', lat: 31.2900, lng: 32.2800 },
    ],
  },

  // ── 18. Damietta ──
  {
    name: 'Damietta',
    code: 'EG-DT',
    native_name: 'دمياط',
    lat: 31.4196, lng: 31.8130,
    areas: [
      { name: 'Damietta City', native_name: 'مدينة دمياط', type: 'city', lat: 31.4196, lng: 31.8130 },
      { name: 'New Damietta', native_name: 'دمياط الجديدة', type: 'city', lat: 31.4100, lng: 31.6900 },
      { name: 'Ras El Bar', native_name: 'رأس البر', type: 'city', lat: 31.5200, lng: 31.8400 },
      { name: 'Ezbet El Borg', native_name: 'عزبة البرج', type: 'city', lat: 31.5000, lng: 31.8300 },
      { name: 'Faraskour', native_name: 'فارسكور', type: 'city', lat: 31.3300, lng: 31.7600 },
      { name: 'El Sarw', native_name: 'السر', type: 'area', lat: 31.3100, lng: 31.7400 },
      { name: 'Kafr Saad', native_name: 'كفر سعد', type: 'city', lat: 31.3600, lng: 31.6400 },
      { name: 'El Karkassar', native_name: 'الكركسر', type: 'area', lat: 31.3700, lng: 31.7000 },
    ],
  },

  // ── 19. Kafr El Sheikh ──
  {
    name: 'Kafr El Sheikh',
    code: 'EG-KFS',
    native_name: 'كفر الشيخ',
    lat: 31.1119, lng: 30.9411,
    areas: [
      { name: 'Kafr El Sheikh City', native_name: 'مدينة كفر الشيخ', type: 'city', lat: 31.1119, lng: 30.9411 },
      { name: 'Baltim', native_name: 'بلطيم', type: 'city', lat: 31.5900, lng: 31.1000 },
      { name: 'Hamoul', native_name: 'الحامول', type: 'city', lat: 31.4300, lng: 31.1200 },
      { name: 'Metoubas', native_name: 'مطوبس', type: 'city', lat: 31.3500, lng: 30.9000 },
      { name: 'Desouk', native_name: 'دسوق', type: 'city', lat: 31.1300, lng: 30.6400 },
      { name: 'Sidi Salem', native_name: 'سيدي سالم', type: 'city', lat: 31.2200, lng: 30.7700 },
      { name: 'El Reyad', native_name: 'الرياض', type: 'city', lat: 31.2400, lng: 30.9500 },
      { name: 'Fowa', native_name: 'فوّة', type: 'city', lat: 31.1200, lng: 30.5600 },
      { name: 'Beila', native_name: 'بيلا', type: 'city', lat: 31.2700, lng: 31.1100 },
      { name: 'Qaleen', native_name: 'قلين', type: 'city', lat: 31.0500, lng: 30.9000 },
    ],
  },

  // ── 20. Faiyum ──
  {
    name: 'Faiyum',
    code: 'EG-FYM',
    native_name: 'الفيوم',
    lat: 29.3084, lng: 30.8428,
    areas: [
      { name: 'Faiyum City', native_name: 'مدينة الفيوم', type: 'city', lat: 29.3084, lng: 30.8428 },
      { name: 'Ibsheway', native_name: 'إبشواي', type: 'city', lat: 29.3500, lng: 30.6000 },
      { name: 'Itsa', native_name: 'إطسا', type: 'city', lat: 29.2400, lng: 30.7900 },
      { name: 'Senoures', native_name: 'سنورس', type: 'city', lat: 29.4100, lng: 30.8600 },
      { name: 'Tamiya', native_name: 'طامية', type: 'city', lat: 29.4800, lng: 30.9600 },
      { name: 'Abshaway', native_name: 'أبشواي', type: 'city', lat: 29.3500, lng: 30.5000 },
      { name: 'Youssef El Seddik', native_name: 'يوسف الصديق', type: 'city', lat: 29.2400, lng: 30.6000 },
      { name: 'Hawaret El Maqta', native_name: 'حوارة المقطع', type: 'area', lat: 29.3000, lng: 30.8400 },
    ],
  },

  // ── 21. Beni Suef ──
  {
    name: 'Beni Suef',
    code: 'EG-BNS',
    native_name: 'بني سويف',
    lat: 29.0661, lng: 31.0989,
    areas: [
      { name: 'Beni Suef City', native_name: 'مدينة بني سويف', type: 'city', lat: 29.0661, lng: 31.0989 },
      { name: 'El Fashn', native_name: 'الفشن', type: 'city', lat: 28.8200, lng: 30.8100 },
      { name: 'Biba', native_name: 'ببا', type: 'city', lat: 28.9200, lng: 30.9800 },
      { name: 'El Wasta', native_name: 'الواسطى', type: 'city', lat: 29.3400, lng: 31.2200 },
      { name: 'Nasser', native_name: 'ناصر', type: 'city', lat: 29.1700, lng: 31.1300 },
      { name: 'Ehnasia', native_name: 'أهناسيا', type: 'city', lat: 29.0900, lng: 31.0400 },
      { name: 'Somasta', native_name: 'سومستا', type: 'city', lat: 29.0200, lng: 31.1000 },
      { name: 'Tansa', native_name: 'تانسا', type: 'area', lat: 29.2000, lng: 31.2000 },
    ],
  },

  // ── 22. Minya ──
  {
    name: 'Minya',
    code: 'EG-MN',
    native_name: 'المنيا',
    lat: 28.0881, lng: 30.7613,
    areas: [
      { name: 'Minya City', native_name: 'مدينة المنيا', type: 'city', lat: 28.0881, lng: 30.7613 },
      { name: 'Mallawi', native_name: 'ملوي', type: 'city', lat: 27.7300, lng: 30.8300 },
      { name: 'Samalout', native_name: 'سمالوط', type: 'city', lat: 28.3000, lng: 30.7100 },
      { name: 'El Idwa', native_name: 'العدوة', type: 'city', lat: 28.5800, lng: 30.7600 },
      { name: 'Maghagha', native_name: 'مغاغة', type: 'city', lat: 28.6450, lng: 30.8000 },
      { name: 'Bani Mazar', native_name: 'بني مزار', type: 'city', lat: 28.5050, lng: 30.8000 },
      { name: 'Mattay', native_name: 'مطاي', type: 'city', lat: 28.4200, lng: 30.7700 },
      { name: 'Abou Qirqas', native_name: 'أبو قرقاص', type: 'city', lat: 27.9300, lng: 30.8300 },
      { name: 'Deir Mawas', native_name: 'دير مواس', type: 'city', lat: 27.6400, lng: 30.8500 },
    ],
  },

  // ── 23. Asyut ──
  {
    name: 'Asyut',
    code: 'EG-AST',
    native_name: 'أسيوط',
    lat: 27.1867, lng: 31.1714,
    areas: [
      { name: 'Asyut City', native_name: 'مدينة أسيوط', type: 'city', lat: 27.1867, lng: 31.1714 },
      { name: 'Abnub', native_name: 'أبنوب', type: 'city', lat: 27.2700, lng: 31.1600 },
      { name: 'Abu Tig', native_name: 'أبو تيج', type: 'city', lat: 27.0400, lng: 31.3200 },
      { name: 'El Badari', native_name: 'البداري', type: 'city', lat: 26.9900, lng: 31.4200 },
      { name: 'Sahel Seleem', native_name: 'ساحل سليم', type: 'city', lat: 27.1000, lng: 31.2600 },
      { name: 'El Quseya', native_name: 'القوصية', type: 'city', lat: 27.4400, lng: 30.8200 },
      { name: 'Manfalut', native_name: 'منفلوط', type: 'city', lat: 27.3200, lng: 30.9700 },
      { name: 'Dayrout', native_name: 'ديروط', type: 'city', lat: 27.5660, lng: 30.8100 },
      { name: 'Sedfa', native_name: 'صدفا', type: 'city', lat: 27.1400, lng: 31.0600 },
      { name: 'El Fateh', native_name: 'الفتح', type: 'city', lat: 27.2200, lng: 31.1800 },
      { name: 'El Ghanayem', native_name: 'الغنايم', type: 'city', lat: 27.1000, lng: 31.3300 },
    ],
  },

  // ── 24. Sohag ──
  {
    name: 'Sohag',
    code: 'EG-SHG',
    native_name: 'سوهاج',
    lat: 26.5600, lng: 31.6950,
    areas: [
      { name: 'Sohag City', native_name: 'مدينة سوهاج', type: 'city', lat: 26.5600, lng: 31.6950 },
      { name: 'Akhmim', native_name: 'أخميم', type: 'city', lat: 26.5630, lng: 31.7430 },
      { name: 'Gerga', native_name: 'جرجا', type: 'city', lat: 26.3400, lng: 31.8700 },
      { name: 'El Maragha', native_name: 'المراغة', type: 'city', lat: 26.7100, lng: 31.6100 },
      { name: 'Tima', native_name: 'طما', type: 'city', lat: 26.9100, lng: 31.4700 },
      { name: 'Tahta', native_name: 'طهطا', type: 'city', lat: 26.7700, lng: 31.5000 },
      { name: 'El Balyana', native_name: 'البلينا', type: 'city', lat: 26.2300, lng: 31.9100 },
      { name: 'Sakulta', native_name: 'ساقلتة', type: 'city', lat: 26.6500, lng: 31.6700 },
      { name: 'Dar El Salam', native_name: 'دار السلام', type: 'city', lat: 26.2200, lng: 32.0000 },
      { name: 'El Monshah', native_name: 'المنشأة', type: 'city', lat: 26.4800, lng: 31.8000 },
    ],
  },

  // ── 25. Qena ──
  {
    name: 'Qena',
    code: 'EG-KN',
    native_name: 'قنا',
    lat: 26.1610, lng: 32.7220,
    areas: [
      { name: 'Qena City', native_name: 'مدينة قنا', type: 'city', lat: 26.1610, lng: 32.7220 },
      { name: 'Nag Hammadi', native_name: 'نجع حمادي', type: 'city', lat: 26.0500, lng: 32.2500 },
      { name: 'Deshna', native_name: 'دشنا', type: 'city', lat: 26.1300, lng: 32.4600 },
      { name: 'Farshout', native_name: 'فرشوط', type: 'city', lat: 26.0600, lng: 32.1900 },
      { name: 'Abou Tesht', native_name: 'أبو تشت', type: 'city', lat: 26.1200, lng: 32.1000 },
      { name: 'Qus', native_name: 'قوص', type: 'city', lat: 25.9300, lng: 32.7600 },
      { name: 'Naqada', native_name: 'نقادة', type: 'city', lat: 25.9000, lng: 32.7200 },
      { name: 'El Waqf', native_name: 'الوقف', type: 'city', lat: 26.0100, lng: 32.3000 },
    ],
  },

  // ── 26. New Valley ──
  {
    name: 'New Valley',
    code: 'EG-WAD',
    native_name: 'الوادي الجديد',
    lat: 24.5450, lng: 27.1730,
    areas: [
      { name: 'Kharga', native_name: 'الخارجة', type: 'city', lat: 25.4500, lng: 30.5500 },
      { name: 'Dakhla', native_name: 'الداخلة', type: 'city', lat: 25.5100, lng: 29.0000 },
      { name: 'Farafra', native_name: 'الفرافرة', type: 'city', lat: 27.0600, lng: 27.9700 },
      { name: 'Baris', native_name: 'باريس', type: 'city', lat: 24.6200, lng: 30.6200 },
      { name: 'El Qasr', native_name: 'القصر', type: 'city', lat: 25.4800, lng: 28.9900 },
      { name: 'Mout', native_name: 'موط', type: 'city', lat: 25.4800, lng: 28.9800 },
    ],
  },

  // ── 27. Matrouh ──
  {
    name: 'Matrouh',
    code: 'EG-MT',
    native_name: 'مطروح',
    lat: 29.5690, lng: 26.4190,
    areas: [
      { name: 'Marsa Matrouh', native_name: 'مرسى مطروح', type: 'city', lat: 31.3524, lng: 27.2373 },
      { name: 'Siwa', native_name: 'سيوة', type: 'city', lat: 29.2030, lng: 25.5200 },
      { name: 'El Alamein', native_name: 'العلمين', type: 'city', lat: 30.8300, lng: 28.9500 },
      { name: 'El Dabaa', native_name: 'الضبعة', type: 'city', lat: 31.0300, lng: 28.4300 },
      { name: 'Sidi Abdel Rahman', native_name: 'سيدي عبد الرحمن', type: 'area', lat: 31.0000, lng: 28.6900 },
      { name: 'El Negaila', native_name: 'النجيلة', type: 'city', lat: 31.3100, lng: 27.0500 },
      { name: 'Barrani', native_name: 'البراني', type: 'city', lat: 31.6100, lng: 25.9200 },
      { name: 'Salloum', native_name: 'السلوم', type: 'city', lat: 31.5500, lng: 25.1500 },
      { name: 'El Hamam', native_name: 'الحمام', type: 'city', lat: 30.8300, lng: 29.3900 },
    ],
  },
];

// ─── SQL GENERATORS ────────────────────────────────────────────────────────────

function sanitize(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function generateCountriesSQL(country) {
  return `INSERT IGNORE INTO countries (iso_code, iso_code_3, name, native_name, phone_code, phone_max_length, phone_min_length, default_locale, default_currency, currency_symbol, currency_decimal_places, currency_name, flag_emoji, navigation_polygon, sort_order, is_active)
VALUES (
  ${sanitize(country.iso_code)},
  ${sanitize(country.iso_code_3)},
  ${sanitize(country.name)},
  ${sanitize(country.native_name)},
  ${sanitize(country.phone_code)},
  ${country.phone_max_length},
  ${country.phone_min_length},
  ${sanitize(country.default_locale)},
  ${sanitize(country.default_currency)},
  ${sanitize(country.currency_symbol)},
  ${country.currency_decimal_places},
  ${sanitize(country.currency_name)},
  ${sanitize(country.flag_emoji)},
  ${sanitize(generateBBoxPolygon(country.lat, country.lng, 350))},
  1,
  1
);\n`;
}

function generateProvincesSQL(provinces, countryId) {
  const polygonsSeen = new Set();
  return provinces.map(p => {
    const polygon = generateBBoxPolygon(p.lat, p.lng, 120);
    polygonsSeen.add(polygon);
    return `INSERT IGNORE INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order, is_active)
VALUES (
  ${countryId},
  ${sanitize(p.name)},
  ${sanitize(p.native_name)},
  ${sanitize(p.code)},
  'governorate',
  ${sanitize(polygon)},
  0,
  1
);`;
  }).join('\n') + '\n';
}

function generateCitiesSQL(provinces, provinceIdMap) {
  const seen = new Set();
  const lines = [];

  for (const p of provinces) {
    const pid = provinceIdMap[p.name];
    if (!pid) {
      console.warn(`⚠ Province not mapped: ${p.name}`);
      continue;
    }
    for (const area of p.areas) {
      const key = `${pid}|${area.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const polygon = generateBBoxPolygon(area.lat, area.lng, polygonRadiusForType(area.type));

      lines.push(`INSERT IGNORE INTO cities (province_id, name, native_name, type, navigation_polygon, sort_order, is_active)
VALUES (
  ${pid},
  ${sanitize(area.name)},
  ${sanitize(area.native_name)},
  ${sanitize(area.type)},
  ${sanitize(polygon)},
  0,
  1
);`);
    }
  }

  return lines.join('\n') + '\n';
}

// ─── MAIN GENERATOR ────────────────────────────────────────────────────────────

function generate() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── 1. Countries ──
  const countriesSQL = '-- ─── COUNTRIES ───\n' + generateCountriesSQL(EGYPT_COUNTRY);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'countries.sql'), countriesSQL, 'utf8');
  console.log('✔ countries.sql');

  // ── 2. Provinces ──
  // Egypt already has id=1, use it
  const provincesSQL = '-- ─── PROVINCES (Governorates) ───\n' + generateProvincesSQL(PROVINCES, 1);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'provinces.sql'), provincesSQL, 'utf8');
  console.log('✔ provinces.sql');

  // ── 3. Cities ──
  // Build a map: province name → id
  // Default IDs match existing data (Cairo=242, Alex=243, Giza=244, etc.)
  const DEFAULT_IDS = {
    'Cairo': 242,
    'Alexandria': 243,
    'Giza': 244,
    'Sharqia': 245,
    'Dakahlia': 246,
    'Beheira': 247,
    'Gharbia': 248,
    'Monufia': 249,
    'Qalyubia': 250,
    'Aswan': 251,
    'Luxor': 252,
    'Red Sea': 253,
    'South Sinai': 254,
    'North Sinai': 255,
    'Suez': 256,
    'Ismailia': 257,
    'Port Said': 258,
    'Damietta': 259,
    'Kafr El Sheikh': 260,
    'Faiyum': 261,
    'Beni Suef': 262,
    'Minya': 263,
    'Asyut': 264,
    'Sohag': 265,
    'Qena': 266,
    'New Valley': 267,
    'Matrouh': 268,
  };

  const citiesSQL = '-- ─── CITIES (Districts, Areas, Neighborhoods) ───\n' + generateCitiesSQL(PROVINCES, DEFAULT_IDS);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'cities.sql'), citiesSQL, 'utf8');
  console.log('✔ cities.sql');

  // ── 4. Combined seed ──
  const combined = [
    '-- ================================',
    '-- Egypt Geographical Seed Data',
    '-- Generated for CourtZon platform',
    '-- ================================',
    '',
    '-- Add type column to cities',
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS type VARCHAR(50) NULL AFTER native_name;",
    '',
    '-- ================================',
    '-- COUNTRIES',
    '-- ================================',
    countriesSQL,
    '-- ================================',
    '-- PROVINCES (Governorates)',
    '-- ================================',
    provincesSQL,
    '-- ================================',
    '-- CITIES (Districts + Areas + Neighborhoods)',
    '-- ================================',
    citiesSQL,
    '-- ================================',
    '-- INDEXES',
    '-- ================================',
    'CREATE INDEX IF NOT EXISTS idx_cities_type ON cities(type);',
    'CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);',
    '',
    '-- ================================',
    '-- Done.',
    '-- ================================',
  ].join('\n');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'seed-egypt.sql'), combined, 'utf8');
  console.log('✔ seed-egypt.sql (combined)');

  // Summary
  let totalAreas = 0;
  for (const p of PROVINCES) totalAreas += p.areas.length;

  console.log(`\n─── Summary ───`);
  console.log(`Countries: 1 (Egypt)`);
  console.log(`Provinces: ${PROVINCES.length}`);
  console.log(`Cities/Areas: ${totalAreas}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

generate();
