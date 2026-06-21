// seed-marketplace.cjs
// Enterprise marketplace catalog seed generator
// Run from project root: node backend/scripts/seed-marketplace.cjs [--count=1000] [--seller-id=1]

const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');
const mysql = require('mysql2/promise');

const projectRoot = resolve(__dirname, '..');

const envPath = resolve(projectRoot, '.env');
const fileEnv = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    fileEnv[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const env = (k, f) => process.env[k] || fileEnv[k] || f;
const clear = process.argv.includes('--clear');
const sellerId = Number(process.argv.find(a => a.startsWith('--seller-id='))?.split('=')[1]) || 1;
const targetProducts = Number(process.argv.find(a => a.startsWith('--count='))?.split('=')[1]) || 10000;

const dbConfig = {
  host: env('DB_HOST', 'localhost'), port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'), password: env('DB_PASSWORD', ''),
  multipleStatements: true,
};
const dbName = env('DB_NAME', 'courtzon_v2');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, dec = 2) => +(min + Math.random() * (max - min)).toFixed(dec);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ── 1. SPORTS ──
const SPORTS = [
  { en: 'Football', ar: 'كرة القدم', slug: 'football' },
  { en: 'Basketball', ar: 'كرة السلة', slug: 'basketball' },
  { en: 'Tennis', ar: 'التنس', slug: 'tennis' },
  { en: 'Padel', ar: 'البادل', slug: 'padel' },
  { en: 'Volleyball', ar: 'الكرة الطائرة', slug: 'volleyball' },
  { en: 'Swimming', ar: 'السباحة', slug: 'swimming' },
  { en: 'Running', ar: 'الجري', slug: 'running' },
  { en: 'Gym & Fitness', ar: 'اللياقة البدنية', slug: 'gym-fitness' },
  { en: 'Cycling', ar: 'ركوب الدراجات', slug: 'cycling' },
  { en: 'Martial Arts', ar: 'الفنون القتالية', slug: 'martial-arts' },
  { en: 'Yoga', ar: 'اليوغا', slug: 'yoga' },
  { en: 'Cricket', ar: 'الكريكيت', slug: 'cricket' },
  { en: 'Table Tennis', ar: 'تنس الطاولة', slug: 'table-tennis' },
  { en: 'Handball', ar: 'كرة اليد', slug: 'handball' },
  { en: 'Badminton', ar: 'الريشة الطائرة', slug: 'badminton' },
  { en: 'Boxing', ar: 'الملاكمة', slug: 'boxing' },
];

// ── 2. CATEGORIES ──
const CAT_ALL = [
  { parent: null, slug: 'footwear', en: 'Footwear', ar: 'الأحذية' },
  { parent: null, slug: 'apparel', en: 'Apparel', ar: 'الملابس' },
  { parent: null, slug: 'equipment', en: 'Equipment', ar: 'المعدات' },
  { parent: null, slug: 'accessories', en: 'Accessories', ar: 'الإكسسوارات' },
  { parent: null, slug: 'protective-gear', en: 'Protective Gear', ar: 'معدات الحماية' },
  { parent: null, slug: 'bags-luggage', en: 'Bags & Luggage', ar: 'الحقائب' },
  { parent: 'footwear', slug: 'shoes', en: 'Shoes', ar: 'الأحذية الرياضية' },
  { parent: 'footwear', slug: 'sandals', en: 'Sandals', ar: 'الصنادل' },
  { parent: 'footwear', slug: 'slippers', en: 'Slippers', ar: 'الشباشب' },
  { parent: 'apparel', slug: 'jerseys', en: 'Jerseys', ar: 'التيشيرتات' },
  { parent: 'apparel', slug: 'shorts', en: 'Shorts', ar: 'الشورتات' },
  { parent: 'apparel', slug: 'tracksuits', en: 'Tracksuits', ar: 'بدلات الرياضة' },
  { parent: 'apparel', slug: 'jackets', en: 'Jackets', ar: 'الجواكت' },
  { parent: 'apparel', slug: 'socks', en: 'Socks', ar: 'الجوارب' },
  { parent: 'apparel', slug: 'compression', en: 'Compression Wear', ar: 'ملابس الضغط' },
  { parent: 'equipment', slug: 'balls', en: 'Balls', ar: 'الكرات' },
  { parent: 'equipment', slug: 'rackets', en: 'Rackets', ar: 'المضارب' },
  { parent: 'equipment', slug: 'bats', en: 'Bats', ar: 'المضارب' },
  { parent: 'equipment', slug: 'nets', en: 'Nets', ar: 'الشباك' },
  { parent: 'equipment', slug: 'dumbbells', en: 'Dumbbells', ar: 'الدمبل' },
  { parent: 'equipment', slug: 'kettlebells', en: 'Kettlebells', ar: 'الكيتلبل' },
  { parent: 'equipment', slug: 'benches', en: 'Benches', ar: 'بنوك التمرين' },
  { parent: 'equipment', slug: 'machines', en: 'Machines', ar: 'أجهزة التمرين' },
  { parent: 'equipment', slug: 'treadmills', en: 'Treadmills', ar: 'أجهزة المشي' },
  { parent: 'equipment', slug: 'bikes', en: 'Bikes', ar: 'الدراجات' },
  { parent: 'equipment', slug: 'helmets', en: 'Helmets', ar: 'الخوذات' },
  { parent: 'equipment', slug: 'goggles', en: 'Goggles', ar: 'النظارات الواقية' },
  { parent: 'equipment', slug: 'gloves', en: 'Gloves', ar: 'القفازات' },
  { parent: 'equipment', slug: 'pads', en: 'Pads', ar: 'الوسادات' },
  { parent: 'equipment', slug: 'swimwear', en: 'Swimwear', ar: 'ملابس السباحة' },
  { parent: 'equipment', slug: 'caps', en: 'Caps', ar: 'قبعات السباحة' },
  { parent: 'equipment', slug: 'fins', en: 'Fins', ar: 'الزعانف' },
  { parent: 'equipment', slug: 'boards', en: 'Boards', ar: 'الألواح' },
  { parent: 'equipment', slug: 'mats', en: 'Mats', ar: 'الحصير' },
  { parent: 'equipment', slug: 'bands', en: 'Resistance Bands', ar: 'أشرطة المقاومة' },
  { parent: 'equipment', slug: 'rollers', en: 'Foam Rollers', ar: 'بكرات الإسفنج' },
  { parent: 'equipment', slug: 'jump-ropes', en: 'Jump Ropes', ar: 'حبال القفز' },
  { parent: 'equipment', slug: 'shuttlecocks', en: 'Shuttlecocks', ar: 'الريشات' },
  { parent: 'protective-gear', slug: 'shin-guards', en: 'Shin Guards', ar: 'واقيات الساق' },
  { parent: 'protective-gear', slug: 'mouth-guards', en: 'Mouth Guards', ar: 'واقيات الفم' },
  { parent: 'protective-gear', slug: 'knee-pads', en: 'Knee Pads', ar: 'واقيات الركبة' },
  { parent: 'protective-gear', slug: 'elbow-pads', en: 'Elbow Pads', ar: 'واقيات الكوع' },
  { parent: 'protective-gear', slug: 'wrist-guards', en: 'Wrist Guards', ar: 'واقيات المعصم' },
  { parent: 'protective-gear', slug: 'chest-guards', en: 'Chest Guards', ar: 'واقيات الصدر' },
  { parent: 'accessories', slug: 'water-bottles', en: 'Water Bottles', ar: 'قوارير الماء' },
  { parent: 'accessories', slug: 'towels', en: 'Towels', ar: 'المناشف' },
  { parent: 'accessories', slug: 'headbands', en: 'Headbands', ar: 'عصابات الرأس' },
  { parent: 'accessories', slug: 'wristbands', en: 'Wristbands', ar: 'أساور المعصم' },
  { parent: 'accessories', slug: 'sunglasses', en: 'Sunglasses', ar: 'النظارات الشمسية' },
  { parent: 'accessories', slug: 'hats', en: 'Hats & Caps', ar: 'القبعات' },
  { parent: 'accessories', slug: 'bags', en: 'Sports Bags', ar: 'حقائب الرياضة' },
  { parent: 'accessories', slug: 'duffels', en: 'Duffel Bags', ar: 'حقائب السفر' },
  { parent: 'accessories', slug: 'backpacks', en: 'Backpacks', ar: 'حقائب الظهر' },
  { parent: 'bags-luggage', slug: 'kit-bags', en: 'Kit Bags', ar: 'حقائب المعدات' },
  { parent: 'bags-luggage', slug: 'racquet-covers', en: 'Racquet Covers', ar: 'أغطية المضارب' },
];

const sportCats = {
  football:      ['shoes','jerseys','shorts','socks','balls','shin-guards','gloves','water-bottles','bags','towels','headbands','kit-bags','tracksuits','jackets'],
  basketball:    ['shoes','jerseys','shorts','socks','balls','knee-pads','water-bottles','bags','headbands','tracksuits'],
  tennis:        ['shoes','shorts','socks','rackets','balls','towels','wristbands','hats','bags','racquet-covers','tracksuits'],
  padel:         ['shoes','shorts','socks','rackets','balls','towels','wristbands','hats','bags','racquet-covers'],
  volleyball:    ['shoes','jerseys','shorts','socks','balls','knee-pads','water-bottles','bags'],
  swimming:      ['swimwear','goggles','caps','fins','towels','bags','water-bottles','sandals'],
  running:       ['shoes','shorts','socks','jerseys','jackets','water-bottles','hats','sunglasses','backpacks'],
  'gym-fitness': ['shoes','shorts','compression','jerseys','dumbbells','kettlebells','benches','machines','treadmills','bands','rollers','jump-ropes','gloves','water-bottles','towels','bags','mats'],
  cycling:       ['helmets','jerseys','shorts','gloves','bikes','water-bottles','sunglasses','bags','jackets'],
  'martial-arts': ['shorts','pads','gloves','mouth-guards','bags','headbands','mats'],
  yoga:          ['mats','bands','towels','water-bottles','compression'],
  cricket:       ['shoes','jerseys','shorts','bats','balls','gloves','pads','helmets','bags','kit-bags'],
  'table-tennis': ['shoes','shorts','rackets','balls','nets','towels','bags'],
  handball:      ['shoes','jerseys','shorts','balls','knee-pads','water-bottles'],
  badminton:     ['shoes','shorts','socks','rackets','shuttlecocks','nets','towels','wristbands','bags','racquet-covers'],
  boxing:        ['shoes','shorts','gloves','pads','mouth-guards','headbands','bags','jump-ropes'],
};

const slugParentMap = {};
for (const c of CAT_ALL) slugParentMap[c.slug] = c.parent;

// ── 3. BRANDS ──
const BRANDS = [
  { name: 'Nike', country: 'USA', website: 'https://nike.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Nike' },
  { name: 'Adidas', country: 'Germany', website: 'https://adidas.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Adidas' },
  { name: 'Puma', country: 'Germany', website: 'https://puma.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Puma' },
  { name: 'Under Armour', country: 'USA', website: 'https://underarmour.com', logo_url: 'https://placehold.co/200x80/eee/333?text=UA' },
  { name: 'Wilson', country: 'USA', website: 'https://wilson.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Wilson' },
  { name: 'Yonex', country: 'Japan', website: 'https://yonex.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Yonex' },
  { name: 'Head', country: 'Austria', website: 'https://head.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Head' },
  { name: 'Babolat', country: 'France', website: 'https://babolat.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Babolat' },
  { name: 'Speedo', country: 'Australia', website: 'https://speedo.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Speedo' },
  { name: 'Arena', country: 'Italy', website: 'https://arena.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Arena' },
  { name: 'Reebok', country: 'USA', website: 'https://reebok.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Reebok' },
  { name: 'New Balance', country: 'USA', website: 'https://newbalance.com', logo_url: 'https://placehold.co/200x80/eee/333?text=NB' },
  { name: 'Asics', country: 'Japan', website: 'https://asics.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Asics' },
  { name: 'Mizuno', country: 'Japan', website: 'https://mizuno.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Mizuno' },
  { name: 'Li-Ning', country: 'China', website: 'https://lining.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Li-Ning' },
  { name: 'Decathlon', country: 'France', website: 'https://decathlon.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Decathlon' },
  { name: 'Kipsta', country: 'France', website: 'https://kipsta.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Kipsta' },
  { name: 'Sondico', country: 'UK', website: 'https://sondico.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Sondico' },
  { name: 'Mitre', country: 'UK', website: 'https://mitre.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Mitre' },
  { name: 'Select Sport', country: 'Denmark', website: 'https://select-sport.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Select' },
  { name: 'Molten', country: 'Japan', website: 'https://molten.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Molten' },
  { name: 'Spalding', country: 'USA', website: 'https://spalding.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Spalding' },
  { name: 'Everlast', country: 'USA', website: 'https://everlast.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Everlast' },
  { name: 'Venum', country: 'Thailand', website: 'https://venum.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Venum' },
  { name: 'Fairtex', country: 'Thailand', website: 'https://fairtex.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Fairtex' },
  { name: 'Twins Special', country: 'Thailand', website: 'https://twins.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Twins' },
  { name: 'Rival', country: 'Canada', website: 'https://rival.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Rival' },
  { name: 'Giro', country: 'USA', website: 'https://giro.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Giro' },
  { name: 'Shimano', country: 'Japan', website: 'https://shimano.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Shimano' },
  { name: 'SRAM', country: 'USA', website: 'https://sram.com', logo_url: 'https://placehold.co/200x80/eee/333?text=SRAM' },
  { name: 'Trek', country: 'USA', website: 'https://trekbikes.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Trek' },
  { name: 'Giant', country: 'Taiwan', website: 'https://giant.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Giant' },
  { name: 'Specialized', country: 'USA', website: 'https://specialized.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Specialized' },
  { name: 'Cannondale', country: 'USA', website: 'https://cannondale.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Cannondale' },
  { name: 'Liforme', country: 'UK', website: 'https://liforme.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Liforme' },
  { name: 'Manduka', country: 'USA', website: 'https://manduka.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Manduka' },
  { name: 'Lululemon', country: 'Canada', website: 'https://lululemon.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Lululemon' },
  { name: 'Gaiam', country: 'USA', website: 'https://gaiam.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Gaiam' },
  { name: 'Gray-Nicolls', country: 'Australia', website: 'https://graynicolls.com', logo_url: 'https://placehold.co/200x80/eee/333?text=GrayNicolls' },
  { name: 'Kookaburra', country: 'Australia', website: 'https://kookaburra.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Kookaburra' },
  { name: 'Gunn & Moore', country: 'UK', website: 'https://gmandm.com', logo_url: 'https://placehold.co/200x80/eee/333?text=GM' },
  { name: 'Stiga', country: 'Sweden', website: 'https://stiga.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Stiga' },
  { name: 'Butterfly', country: 'Japan', website: 'https://butterfly.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Butterfly' },
  { name: 'Joola', country: 'Germany', website: 'https://joola.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Joola' },
  { name: 'Donic', country: 'Germany', website: 'https://donic.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Donic' },
  { name: 'Victor', country: 'Taiwan', website: 'https://victorsport.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Victor' },
  { name: 'Carlton', country: 'UK', website: 'https://carlton.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Carlton' },
  { name: 'Mikasa', country: 'Japan', website: 'https://mikasa.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Mikasa' },
  { name: 'Gilbert', country: 'UK', website: 'https://gilbert.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Gilbert' },
  { name: 'Tyr', country: 'USA', website: 'https://tyr.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Tyr' },
  { name: 'Huub', country: 'UK', website: 'https://huub.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Huub' },
  { name: 'Zoggs', country: 'UK', website: 'https://zoggs.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Zoggs' },
  { name: 'Finis', country: 'USA', website: 'https://finisinc.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Finis' },
  { name: 'Technogym', country: 'Italy', website: 'https://technogym.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Technogym' },
  { name: 'Bowflex', country: 'USA', website: 'https://bowflex.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Bowflex' },
  { name: 'Rogue', country: 'USA', website: 'https://roguefitness.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Rogue' },
  { name: 'NordicTrack', country: 'USA', website: 'https://nordictrack.com', logo_url: 'https://placehold.co/200x80/eee/333?text=NordicTrack' },
  { name: 'Peloton', country: 'USA', website: 'https://onepeloton.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Peloton' },
  { name: 'Schwinn', country: 'USA', website: 'https://schwinn.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Schwinn' },
  { name: 'Life Fitness', country: 'USA', website: 'https://lifefitness.com', logo_url: 'https://placehold.co/200x80/eee/333?text=LifeFitness' },
  { name: 'Jordan', country: 'USA', website: 'https://jordan.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Jordan' },
  { name: 'Champion', country: 'USA', website: 'https://champion.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Champion' },
  { name: 'Umbro', country: 'UK', website: 'https://umbro.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Umbro' },
  { name: 'Oakley', country: 'USA', website: 'https://oakley.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Oakley' },
  { name: 'Reusch', country: 'USA', website: 'https://reusch.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Reusch' },
  { name: 'Uhlsport', country: 'Germany', website: 'https://uhlsport.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Uhlsport' },
  { name: 'Prince', country: 'USA', website: 'https://princetennis.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Prince' },
  { name: 'Bullpadel', country: 'Spain', website: 'https://bullpadel.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Bullpadel' },
  { name: 'Nox', country: 'Spain', website: 'https://nox.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Nox' },
  { name: 'Siux', country: 'Spain', website: 'https://siux.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Siux' },
  { name: 'Kempa', country: 'Germany', website: 'https://kempa.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Kempa' },
  { name: 'Penn', country: 'USA', website: 'https://penn.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Penn' },
  { name: 'TheraBand', country: 'USA', website: 'https://theraband.com', logo_url: 'https://placehold.co/200x80/eee/333?text=TheraBand' },
  { name: 'Title', country: 'USA', website: 'https://titleboxing.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Title' },
];

// ── 4. TAGS ──
const TAG_LIST = ['Lightweight','Waterproof','Breathable','Quick-Dry','Indoor','Outdoor','Professional','Beginner','Tournament','Eco-Friendly','Unisex','Limited Edition','New Arrival','Best Seller','Seasonal','Compression','Reflective','UV Protection','Anti-Microbial','Shock-Absorbing','Organic','Recycled','Water-Resistant','Windproof','Thermal'];

// ── 5. COLORS ──
const COLORS = [
  { en: 'Black', ar: 'أسود', hex: '#000000' },
  { en: 'White', ar: 'أبيض', hex: '#FFFFFF' },
  { en: 'Navy Blue', ar: 'أزرق داكن', hex: '#000080' },
  { en: 'Royal Blue', ar: 'أزرق ملكي', hex: '#4169E1' },
  { en: 'Red', ar: 'أحمر', hex: '#FF0000' },
  { en: 'Dark Red', ar: 'أحمر داكن', hex: '#8B0000' },
  { en: 'Green', ar: 'أخضر', hex: '#008000' },
  { en: 'Lime Green', ar: 'أخضر ليموني', hex: '#32CD32' },
  { en: 'Yellow', ar: 'أصفر', hex: '#FFD700' },
  { en: 'Orange', ar: 'برتقالي', hex: '#FF8C00' },
  { en: 'Purple', ar: 'بنفسجي', hex: '#800080' },
  { en: 'Pink', ar: 'وردي', hex: '#FF69B4' },
  { en: 'Grey', ar: 'رمادي', hex: '#808080' },
  { en: 'Silver', ar: 'فضي', hex: '#C0C0C0' },
  { en: 'Gold', ar: 'ذهبي', hex: '#FFD700' },
  { en: 'Camo Green', ar: 'أخضر تمويه', hex: '#4A5D23' },
  { en: 'Coral', ar: 'مرجاني', hex: '#FF7F50' },
  { en: 'Turquoise', ar: 'فيروزي', hex: '#40E0D0' },
  { en: 'Teal', ar: 'بطي', hex: '#008080' },
  { en: 'Brown', ar: 'بني', hex: '#8B4513' },
  { en: 'Beige', ar: 'بيج', hex: '#F5F5DC' },
  { en: 'Maroon', ar: 'كستنائي', hex: '#800000' },
  { en: 'Sky Blue', ar: 'أزرق سماوي', hex: '#87CEEB' },
  { en: 'Burgundy', ar: 'نبيذي', hex: '#900020' },
];

// ── Generators ──
function genShoeTemplates() {
  const out = []; const brands = ['Nike','Adidas','Puma','Under Armour','New Balance','Asics','Mizuno','Reebok','Li-Ning','Decathlon','Jordan'];
  const models = ['Speed','Pro','Elite','Strike','Vapor','Phantom','Predator','Freak','Boost','Ultra','Shadow','Storm','Flash','Fusion','Edge','Ace','Focus','Pulse'];
  for (let i = 0; i < 200; i++) { const b = pick(brands); const m = pick(models); out.push({ name: `${b} ${m} ${pick(models)} ${pick(['FG','AG','SG','TF'])}`, brands: [b], gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional','elite']), price: [300, 2500], material: pick(['Synthetic Leather','Mesh','Knit','Primeknit','Flyknit','Full-Grain Leather','Suede']), sizeType: 'shoe', hasColor: true }); }
  return out;
}
function genApparelTemplates(cat) {
  const out = []; const brands = ['Nike','Adidas','Puma','Under Armour','Reebok','New Balance','Champion','Jordan','Umbro','Decathlon','Lululemon','Asics'];
  const models = ['Performance','Pro','Elite','Essential','Dri-FIT','Heat.RDY','Climalite','Aeroready','Tech','Core','Supremacy','Ace','Prime','Flex'];
  for (let i = 0; i < 100; i++) { const b = pick(brands); const nm = { jerseys: pick(['Jersey','Shirt']), shorts: 'Shorts', jackets: pick(['Jacket','Windbreaker','Full Zip']), tracksuits: pick(['Tracksuit','Track Top','Track Pants']), socks: pick(['Socks','Crew Socks','No-Show Socks']), compression: pick(['Compression Top','Compression Shorts','Compression Leggings']) }[cat] || 'Top'; out.push({ name: `${b} ${pick(models)} ${pick(['Training','Sport','Game Day'])} ${nm}`, brands: [b], gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']), price: [50, 800], material: pick(['Polyester','Cotton','Elastane Blend','Dri-FIT','Mesh','Nylon']), sizeType: 'apparel', hasColor: true }); }
  return out;
}
function genBallTemplates(sport) {
  const out = []; const bm = { football: ['Adidas','Nike','Mitre','Select Sport','Decathlon','Puma'], basketball: ['Spalding','Wilson','Molten','Nike','Decathlon'], tennis: ['Wilson','Head','Babolat','Penn','Decathlon'], padel: ['Head','Babolat','Wilson','Adidas','Decathlon'], volleyball: ['Mikasa','Molten','Wilson','Decathlon'], cricket: ['Kookaburra','Gray-Nicolls','Gunn & Moore'], handball: ['Select Sport','Molten','Kempa'] }; const brands = bm[sport] || bm['football']; const models = ['Match','Pro','Training','Club','Elite','Official','Tournament']; const sizes = sport === 'football' ? ['Size 5','Size 4','Size 3'] : sport === 'basketball' ? ['Size 7','Size 6','Size 5'] : ['Standard'];   for (let i = 0; i < 50; i++) { const b = pick(brands); out.push({ name: `${b} ${pick(models)} ${pick(sizes)} ${pick(['Ball','Set of 3','Pack of 6'])}`, brands: [b], gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [30, 600], material: pick(['Synthetic Leather','PU Leather','Rubber','Microfiber']), sizeType: 'none', hasColor: true }); }
  return out;
}
function genRacketTemplates(sport) {
  const out = []; const rm = { tennis: ['Wilson','Head','Babolat','Yonex','Prince'], padel: ['Head','Babolat','Wilson','Adidas','Bullpadel','Nox'], badminton: ['Yonex','Li-Ning','Victor','Carlton'], 'table-tennis': ['Butterfly','Stiga','Joola','Donic'] }; const brands = rm[sport] || rm['tennis']; const models = ['Pro','Elite','Tour','Performance','Club','Graphite','Carbon'];   for (let i = 0; i < 80; i++) { const b = pick(brands); out.push({ name: `${b} ${pick(models)} ${pick(['300G','310G','320G','280G','250G'])} ${pick(['Racket','Racquet'])}`, brands: [b], gender: pick(['male','female','unisex']), age: 'adult', skill: pick(['beginner','intermediate','professional','elite']), price: [150, 3000], material: pick(['Graphite','Carbon Fiber','Aluminium','Composite']), sizeType: pick(['grip','none']), hasColor: true }); }
  return out;
}
function genEquipmentTemplates(sport, cat) {
  const out = [];
  if (cat === 'dumbbells') for (let i = 0; i < 60; i++) out.push({ name: `${pick(['Rogue','Bowflex','Technogym','Decathlon'])} Adjustable Dumbbell ${pick(['5-25kg','5-52.5lb','10-40kg'])}`, brands: pick([['Rogue'],['Bowflex'],['Technogym'],['Decathlon']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [200, 2500], material: 'Cast Iron + Rubber', sizeType: 'weight', hasColor: false });
  if (cat === 'machines') for (let i = 0; i < 50; i++) out.push({ name: `${pick(['Technogym','Life Fitness','NordicTrack','Bowflex'])} ${pick(['Multi Gym','Cable Crossover','Leg Press','Home Gym'])} ${pick(['Elite','Pro','Compact'])}`, brands: pick([['Technogym'],['Life Fitness'],['NordicTrack'],['Bowflex']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [1500, 15000], material: 'Steel + Nylon', sizeType: 'none', hasColor: false });
  if (cat === 'treadmills') for (let i = 0; i < 40; i++) out.push({ name: `${pick(['NordicTrack','Peloton','Life Fitness','Technogym'])} ${pick(['Treadmill','Incline Trainer'])} ${pick(['Commercial','Pro','Home','Series 7'])}`, brands: pick([['NordicTrack'],['Peloton'],['Life Fitness'],['Technogym']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [3000, 25000], material: 'Steel + Rubber Belt', sizeType: 'none', hasColor: false });
  if (cat === 'bikes') for (let i = 0; i < 80; i++) out.push({ name: `${pick(['Trek','Giant','Specialized','Cannondale','Schwinn'])} ${pick(['Road Bike','Mountain Bike','Hybrid Bike','Electric Bike'])} ${pick(['Elite','Pro','Sport','Comp','Expert'])}`, brands: pick([['Trek'],['Giant'],['Specialized'],['Cannondale'],['Schwinn']]), gender: pick(['male','female','unisex']), age: 'adult', skill: pick(['beginner','intermediate','professional','elite']), price: [3000, 60000], material: pick(['Carbon Fiber','Aluminium','Titanium','Steel']), sizeType: 'bike', hasColor: true });
  if (cat === 'goggles') for (let i = 0; i < 50; i++) out.push({ name: `${pick(['Speedo','Arena','Tyr','Zoggs','Finis'])} ${pick(['Fastskin','Vanquisher','Predator','Vapor'])} ${pick(['Swim Goggles','Racing Goggles','Mirror Goggles'])}`, brands: pick([['Speedo'],['Arena'],['Tyr'],['Zoggs'],['Finis']]), gender: pick(['male','female','unisex']), age: pick(['adult','youth']), skill: pick(['beginner','intermediate','professional']), price: [60, 400], material: pick(['Silicone','PVC','Polycarbonate Lens']), sizeType: 'none', hasColor: true });
  if (cat === 'swimwear') for (let i = 0; i < 80; i++) out.push({ name: `${pick(['Speedo','Arena','Tyr','Huub','Decathlon'])} ${pick(['Endurance','Fastskin','Carbon','Icon'])} ${pick(['Swimsuit','Briefs','Jammer','Bikini','One Piece','Trunks'])}`, brands: pick([['Speedo'],['Arena'],['Tyr'],['Huub'],['Decathlon']]), gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']), price: [80, 700], material: pick(['Polyester','Nylon+Spandex','PBT','Neoprene']), sizeType: 'apparel', hasColor: true });
  if (cat === 'helmets') for (let i = 0; i < 50; i++) out.push({ name: `${pick(['Giro','Specialized','Trek','Shimano','Decathlon'])} ${pick(['Aether','Synthe','S-Works','Eclipse','Road'])} Helmet ${pick(['','MIPS'])}`, brands: pick([['Giro'],['Specialized'],['Trek'],['Shimano'],['Decathlon']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [200, 2500], material: pick(['In-Mold Polycarbonate','EPS Foam','Carbon']), sizeType: 'apparel', hasColor: true });
  if (cat === 'pads' || cat === 'protection') for (let i = 0; i < 60; i++) out.push({ name: `${pick(['Venum','Everlast','Fairtex','Twins Special','Rival'])} ${pick(['Shin','Knee','Elbow','Chest'])} ${pick(['Guard','Protector','Pad Set'])} ${pick(['Pro','Elite','Training'])}`, brands: pick([['Venum'],['Everlast'],['Fairtex'],['Twins Special'],['Rival']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [100, 900], material: pick(['Leather','Synthetic Leather','PU Foam','Memory Foam']), sizeType: 'apparel', hasColor: true });
  if (cat === 'gloves' && sport === 'boxing') for (let i = 0; i < 70; i++) out.push({ name: `${pick(['Everlast','Venum','Fairtex','Twins Special','Rival','Title'])} ${pick(['Boxing Gloves','Training Gloves','Sparring Gloves','Bag Gloves'])} ${pick(['Pro','Elite','Platinum','Contender'])} ${pick(['10oz','12oz','14oz','16oz','18oz'])}`, brands: pick([['Everlast'],['Venum'],['Fairtex'],['Twins Special'],['Rival'],['Title']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [150, 1200], material: pick(['Genuine Leather','Synthetic Leather','PU','Mesh']), sizeType: 'weight', hasColor: true });
  if (cat === 'gloves' && sport !== 'boxing') for (let i = 0; i < 40; i++) out.push({ name: `${pick(['Nike','Adidas','Reusch','Uhlsport','Decathlon'])} ${pick(['Goalkeeper Gloves','Match Gloves'])} ${pick(['Pro','Elite','Club','Performance'])}`, brands: pick([['Nike'],['Adidas'],['Reusch'],['Uhlsport'],['Decathlon']]), gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']), price: [150, 1000], material: pick(['Latex','Neoprene','Foam Latex']), sizeType: 'apparel', hasColor: true });
  if (cat === 'shin-guards') for (let i = 0; i < 40; i++) out.push({ name: `${pick(['Nike','Adidas','Puma','Decathlon'])} ${pick(['Shin Guards','Sleeve Shin Guards'])} ${pick(['Mercurial','Predator','Ultra','Fixel'])}`, brands: pick([['Nike'],['Adidas'],['Puma'],['Decathlon']]), gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']), price: [50, 350], material: pick(['Polypropylene','EVA Foam','TPU','Fiberglass']), sizeType: 'apparel', hasColor: true });
  if (cat === 'mats') for (let i = 0; i < 40; i++) out.push({ name: `${pick(['Liforme','Manduka','Gaiam','Lululemon','Decathlon'])} ${pick(['Yoga Mat','Exercise Mat','Travel Mat','Premium Mat'])} ${pick(['Classic','Pro','5mm','6mm','Reversible'])}`, brands: pick([['Liforme'],['Manduka'],['Gaiam'],['Lululemon'],['Decathlon']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [100, 1500], material: pick(['Natural Rubber','PVC','TPE','Cork','Jute']), sizeType: 'none', hasColor: true });
  if (cat === 'bands') for (let i = 0; i < 30; i++) out.push({ name: `${pick(['Rogue','Decathlon','TheraBand','Lululemon'])} ${pick(['Resistance Band Set','Power Band','Loop Bands','Tube Bands'])} ${pick(['Heavy','Medium','Light','Set of 5'])}`, brands: pick([['Rogue'],['Decathlon'],['TheraBand'],['Lululemon']]), gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']), price: [40, 300], material: 'Natural Latex + Fabric', sizeType: 'resistance', hasColor: true });
  if (cat === 'bats') for (let i = 0; i < 60; i++) out.push({ name: `${pick(['Gray-Nicolls','Gunn & Moore','Kookaburra','Decathlon'])} ${pick(['Cricket Bat','Kashmir Willow','English Willow','Junior Bat'])} ${pick(['Oblivion','Radical','Echelon','Purist','Cobra'])}`, brands: pick([['Gray-Nicolls'],['Gunn & Moore'],['Kookaburra'],['Decathlon']]), gender: 'unisex', age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']), price: [300, 8000], material: pick(['English Willow','Kashmir Willow','Sallew Willow']), sizeType: 'cricket', hasColor: false });
  return out;
}
function genAccessoryTemplates(cat) {
  const out = []; const brands = ['Nike','Adidas','Puma','Under Armour','Decathlon'];
  const N = { 'water-bottles': `${pick(brands)} ${pick(['Squeeze Bottle','Thermal Bottle','Stainless Steel Bottle','Shaker Bottle'])} ${pick(['500ml','750ml','1L'])}`, 'towels': `${pick(brands)} ${pick(['Sports Towel','Microfiber Towel','Quick Dry Towel','Gym Towel'])}`, 'headbands': `${pick(brands)} ${pick(['Headband','Sweatband','Tennis Headband'])}`, 'wristbands': `${pick(brands)} ${pick(['Wristband','Sweatband','Tennis Wristband'])}`, 'hats': `${pick(brands)} ${pick(['Performance Cap','Baseball Cap','Trucker Hat','Running Hat'])}`, 'bags': `${pick(brands)} ${pick(['Gym Bag','Sports Bag','Duffel Bag','Team Bag'])} ${pick(['Small','Medium','Large'])}`, 'backpacks': `${pick(brands)} ${pick(['Backpack','Running Backpack','Gym Backpack'])} ${pick(['20L','30L','40L'])}`, 'sunglasses': `${pick(['Oakley','Nike','Adidas','Decathlon'])} ${pick(['Sport Sunglasses','Polarized Sunglasses','Running Glasses'])}`, 'kit-bags': `${pick(['Nike','Adidas','Puma','Kookaburra','Gray-Nicolls','Decathlon'])} ${pick(['Kit Bag','Team Bag','Wheeled Bag'])} ${pick(['Large','XL','90L','120L'])}`, 'racquet-covers': `${pick(['Wilson','Head','Babolat','Yonex','Decathlon'])} ${pick(['Racquet Cover','Racquet Bag','Thermo Bag','Triple Bag'])}` };
  for (let i = 0; i < (['bags','backpacks','sunglasses','kit-bags'].includes(cat) ? 50 : 30); i++) out.push({ name: N[cat] || `${pick(brands)} ${cat}`, brands: pick([brands[Math.floor(Math.random()*brands.length)]]), gender: 'unisex', age: 'adult', skill: 'beginner', price: [30, 600], material: pick(['Polyester','Nylon','Cotton','Silicone','Neoprene']), sizeType: 'none', hasColor: true });
  return out;
}

function generateVariants(template, usedSkus) {
  const variants = [];
  const colorCount = template.hasColor ? randInt(2, 5) : 1;
  const selectedColors = [...COLORS].sort(() => Math.random() - 0.5).slice(0, colorCount);
  let sizeValues = ['']; let sizeLabel = '';
  if (template.sizeType === 'shoe') { const sizes = template.age === 'junior' || template.age === 'youth' ? [30,31,32,33,34,35,36,37,38] : template.gender === 'male' || template.gender === 'unisex' ? [39,39.5,40,40.5,41,42,42.5,43,44,45,46] : [36,36.5,37,37.5,38,38.5,39,39.5,40,41,42]; sizeValues = sizes.map(s => `${s}`); }
  else if (template.sizeType === 'apparel') sizeValues = template.gender === 'female' ? ['XXS','XS','S','M','L','XL','XXL'] : ['XS','S','M','L','XL','XXL','XXXL'];
  else if (template.sizeType === 'weight') sizeValues = ['2.5kg','5kg','7.5kg','10kg','15kg','20kg','25kg','30kg','40kg','50kg'];
  else if (template.sizeType === 'resistance') sizeValues = ['Light','Medium','Heavy','X-Heavy','XX-Heavy'];
  else if (template.sizeType === 'bike') sizeValues = ['XS','S','M','L','XL'];
  else if (template.sizeType === 'cricket') sizeValues = ['Size 6','Size 5','Size 4','Size 3','Harrow','Short Handle','Long Handle'];
  else if (template.sizeType === 'grip') sizeValues = ['Grip 0','Grip 1','Grip 2','Grip 3','Grip 4'];
  const basePrice = randFloat(template.price[0], template.price[1]);
  let isFirst = true;
  for (const color of selectedColors) {
    for (const size of sizeValues) {
      if (template.sizeType !== 'none' && sizeValues.indexOf(size) > 4) continue;
      const priceAdj = randInt(-Math.round(basePrice * 0.1), Math.round(basePrice * 0.3));
      const sku = `CZ-${template.name.substring(0,3).toUpperCase()}-${color.hex.substring(1)}${size ? '-'+size.replace(/\s/g,'') : ''}-${randInt(1000,9999)}`;
      if (usedSkus.has(sku)) continue; usedSkus.add(sku);
      variants.push({ sku, barcode: `${randInt(100,999)}${randInt(10000000,99999999)}`, variantName: size || color.en, variantType: template.sizeType !== 'none' ? 'size' : 'color', priceAdjustment: priceAdj, quantity: randInt(5,200), variantColor: template.sizeType === 'none' && template.hasColor ? color.hex : (template.hasColor && sizeValues.length === 1 ? color.hex : null), isDefault: isFirst ? 1 : 0, weight: template.sizeType !== 'none' ? randFloat(0.15,2.5) : null, dimensions: template.sizeType !== 'none' ? `${randInt(10,40)}x${randInt(10,30)}x${randInt(5,20)}` : null, colorHex: template.hasColor ? color.hex : null });
      isFirst = false;
    }
  }
  return variants;
}

// ── MAIN ──
async function seed() {
  const conn = await mysql.createConnection(dbConfig);
  await conn.query(`USE \`${dbName}\``);
  console.log(`\n=== Marketplace Seed Generator ===`);
  console.log(`Target: ${dbName} @ ${dbConfig.host}`);
  console.log(`Seller ID: ${sellerId}, Count: ${targetProducts}`);
  if (clear) { for (const t of ['inventory_logs','related_products','product_tags','product_specifications','product_images','product_variants','products','brands','tags','sport_categories','product_categories','sports']) try { await conn.query(`DELETE FROM \`${t}\``); } catch {} console.log('Cleared.\n'); }

  const sportIdMap = {};
  for (const s of SPORTS) {
    const [ex] = await conn.query('SELECT id FROM sports WHERE slug = ?', [s.slug]);
    if (ex.length) sportIdMap[s.slug] = ex[0].id;
    else { const [r] = await conn.query('INSERT INTO sports (name,slug,sort_order,is_active) VALUES (?,?,?,1)', [s.en,s.slug,Object.keys(sportIdMap).length+1]); sportIdMap[s.slug] = r.insertId; }
  }
  console.log(`📌 Sports: ${Object.keys(sportIdMap).length}`);

  const catSlugMap = {};
  for (const c of CAT_ALL) {
    if (c.parent !== null) continue;
    const [ex] = await conn.query('SELECT id FROM product_categories WHERE slug = ?', [c.slug]);
    if (ex.length) catSlugMap[c.slug] = ex[0].id;
    else { const [r] = await conn.query('INSERT INTO product_categories (name,slug,sort_order,is_active) VALUES (?,?,?,1)', [c.en,c.slug,CAT_ALL.indexOf(c)]); catSlugMap[c.slug] = r.insertId; }
  }
  for (const c of CAT_ALL) {
    if (c.parent === null || catSlugMap[c.slug]) continue;
    const [ex] = await conn.query('SELECT id FROM product_categories WHERE slug = ?', [c.slug]);
    if (ex.length) catSlugMap[c.slug] = ex[0].id;
    else { const pid = catSlugMap[c.parent]; const [r] = await conn.query('INSERT INTO product_categories (parent_id,name,slug,sort_order,is_active) VALUES (?,?,?,?,1)', [pid||null,c.en,c.slug,CAT_ALL.indexOf(c)]); catSlugMap[c.slug] = r.insertId; }
  }
  console.log(`📌 Categories: ${Object.keys(catSlugMap).length}`);

  let sc = 0;
  for (const [sSlug, cSlugs] of Object.entries(sportCats)) {
    const sid = sportIdMap[sSlug]; if (!sid) continue;
    for (const cs of cSlugs) { const cid = catSlugMap[cs]; if (!cid) continue; try { await conn.query('INSERT IGNORE INTO sport_categories (sport_id,category_id) VALUES (?,?)', [sid, cid]); sc++; } catch {} }
  }
  console.log(`📌 Sport-Category Mappings: ${sc}`);

  let brandCount = 0; const brandIdMap = {};
  for (const b of BRANDS) {
    const slug = slugify(b.name);
    const [ex] = await conn.query('SELECT id FROM brands WHERE slug = ?', [slug]);
    if (ex.length) brandIdMap[b.name] = ex[0].id;
    else { const [r] = await conn.query('INSERT INTO brands (name,slug,logo_url,country,website,sort_order) VALUES (?,?,?,?,?,?)', [b.name,slug,b.logo_url,b.country,b.website,brandCount]); brandIdMap[b.name] = r.insertId; brandCount++; }
  }
  console.log(`📌 Brands: ${brandCount}`);

  const tagIdMap = {};
  for (const t of TAG_LIST) {
    const slug = slugify(t);
    const [ex] = await conn.query('SELECT id FROM tags WHERE slug = ?', [slug]);
    if (ex.length) tagIdMap[t] = ex[0].id;
    else { const [r] = await conn.query('INSERT INTO tags (name,slug) VALUES (?,?)', [t,slug]); tagIdMap[t] = r.insertId; }
  }
  console.log(`📌 Tags: ${TAG_LIST.length}`);

  console.log('\n🔄 Generating products...');
  const usedSkus = new Set();
  let pCount = 0, vCount = 0, imgCount = 0, specCount = 0, tagCount = 0;
  const startTime = Date.now();

  for (const sport of SPORTS) {
    const sSlug = sport.slug;
    const cats = sportCats[sSlug] || [];
    for (const catSlug of cats) {
      const catId = catSlugMap[catSlug]; if (!catId) continue;
      const sid = sportIdMap[sSlug];
      let templates = [];
      if (catSlug === 'shoes') templates = genShoeTemplates();
      else if (['jerseys','shorts','socks','jackets','tracksuits','compression'].includes(catSlug)) templates = genApparelTemplates(catSlug);
      else if (catSlug === 'balls') templates = genBallTemplates(sSlug);
      else if (catSlug === 'rackets' && ['tennis','padel','badminton','table-tennis'].includes(sSlug)) templates = genRacketTemplates(sSlug);
      else if (['dumbbells','machines','treadmills','bikes','goggles','swimwear','helmets','pads','protection','shin-guards','gloves','mats','bands','bats'].includes(catSlug)) templates = genEquipmentTemplates(sSlug, catSlug);
      if (['water-bottles','towels','headbands','wristbands','hats','bags','backpacks','sunglasses','kit-bags','racquet-covers','shuttlecocks','nets'].includes(catSlug)) templates = genAccessoryTemplates(catSlug);
      if (templates.length === 0) templates = Array.from({length:30}, (_,i) => ({ name: `${pick(['Decathlon','Sondico','Kipsta','Select Sport'])} ${sport.en} ${catSlug.replace(/-/g,' ')} ${pick(['100','500','900','Pro','Essential'])}`, brands: [pick(['Decathlon','Sondico','Kipsta','Select Sport'])], gender: 'unisex', age: 'adult', skill: 'beginner', price: [30,300], material: 'Synthetic', sizeType: 'none', hasColor: true }));
      for (const tmpl of templates) {
        if (pCount >= targetProducts) break;
        const brandId = brandIdMap[tmpl.brands[0]];
        const basePrice = randFloat(tmpl.price[0], tmpl.price[1]);
        const variants = generateVariants(tmpl, usedSkus);
        if (!variants.length) continue;
        const mv = variants.find(v => v.isDefault) || variants[0];
        const ep = clamp(basePrice + mv.priceAdjustment, 1, 99999);
        const hasDisc = Math.random() < 0.35;
        const dp = hasDisc ? Math.round(ep * randFloat(0.5, 0.95) * 100) / 100 : null;
        const totalQty = variants.reduce((s, v) => s + v.quantity, 0);
        const name = tmpl.name;
        const desc = `${name} - Premium ${sSlug} ${catSlug.replace(/-/g,' ')}. ${pick(['High quality','Professional grade','Perfect for training','Designed for performance','Engineered for comfort'])}.`;
        const sdesc = `${pick(['Premium','High quality','Professional','Essential'])} ${catSlug.replace(/-/g,' ')} for ${sport.en}`;
        const imgs = JSON.stringify(Array.from({length:randInt(2,4)}, (_,i) => `https://placehold.co/800x800/${mv.colorHex?.substring(1)||'eee'}/333?text=${encodeURIComponent(name.substring(0,20))+'+'+(i+1)}`));
        const [pr] = await conn.query('INSERT INTO products (seller_id,brand_id,category_id,sport_id,name,description,short_description_en,price,discounted_price,currency_code,gender,age_group,skill_level,material,quantity,status,images,rating_avg,rating_count,view_count,sales_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'active\',?,?,?,?,?)', [sellerId,brandId||null,catId,sid||null,name,desc,sdesc,ep,dp||null,'EGP',tmpl.gender,tmpl.age,tmpl.skill,tmpl.material,totalQty,imgs,randFloat(3.0,5.0,1),randInt(5,500),randInt(100,50000),randInt(10,2000)]);
        const pid = pr.insertId; pCount++;
        for (const v of variants) {
          const vp = clamp(basePrice + v.priceAdjustment, 1, 99999);
          const [vr] = await conn.query('INSERT INTO product_variants (product_id,sku,barcode,variant_name,variant_type,price_adjustment,compare_price,quantity,weight,dimensions,variant_color,variant_image_url,is_default,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)', [pid,v.sku,v.barcode,v.variantName,v.variantType,v.priceAdjustment,hasDisc ? Math.round(ep*randFloat(1.1,1.5)*100)/100 : null,v.quantity,v.weight,v.dimensions,v.variantColor,v.colorHex ? `https://placehold.co/800x800/${v.colorHex.substring(1)}/333?text=${v.variantName}` : null,v.isDefault]);
          const vid = vr.insertId;
          await conn.query('INSERT INTO inventory_logs (variant_id,movement_type,quantity,stock_before,stock_after,reason) VALUES (?,\'in\',?,0,?,\'Initial stock\')', [vid, v.quantity, v.quantity]);
          vCount++;
          if (v.isDefault || v.colorHex) {
            const iurl = v.colorHex ? `https://placehold.co/800x800/${v.colorHex.substring(1)}/333?text=${v.variantName}` : `https://placehold.co/800x800/eee/333?text=${name.substring(0,20)}`;
            await conn.query('INSERT INTO product_images (product_id,variant_id,media_url,alt_text,sort_order,is_primary) VALUES (?,?,?,?,?,?)', [pid,vid,iurl,`${name} - ${v.variantName}`,imgCount+1,v.isDefault?1:0]);
            imgCount++;
          }
        }
        for (const [sn, sv] of [['Brand',tmpl.brands[0]||'Generic'],['Sport',sport.en],['Material',tmpl.material],['Gender',tmpl.gender==='unisex'?'Unisex':tmpl.gender.charAt(0).toUpperCase()+tmpl.gender.slice(1)],['Age Group',tmpl.age.charAt(0).toUpperCase()+tmpl.age.slice(1)],['Skill Level',tmpl.skill.charAt(0).toUpperCase()+tmpl.skill.slice(1)]]) { await conn.query('INSERT INTO product_specifications (product_id,spec_name,spec_value,sort_order) VALUES (?,?,?,?)', [pid,sn,sv,specCount]); specCount++; }
        const ptags = [...TAG_LIST].sort(()=>Math.random()-0.5).slice(0,randInt(1,4));
        for (const tag of ptags) { const tid = tagIdMap[tag]; if (tid) try { await conn.query('INSERT IGNORE INTO product_tags (product_id,tag_id) VALUES (?,?)', [pid,tid]); tagCount++; } catch {} }
        if (pCount % 1000 === 0) console.log(`   ... ${pCount} products, ${vCount} variants (${Math.round((Date.now() - startTime)/1000)}s)`);
      }
      if (pCount >= targetProducts) break;
    }
    if (pCount >= targetProducts) break;
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`📦 Products: ${pCount} | 🏷️ Variants: ${vCount} | 🖼️ Images: ${imgCount} | 📋 Specs: ${specCount} | 🔖 Tags: ${tagCount} | ⏱️ ${elapsed}s`);

  // Related products
  console.log('\n🔄 Generating related products...');
  const [allIds] = await conn.query('SELECT id FROM products ORDER BY RAND() LIMIT 5000');
  const ids = allIds.map(r => r.id); let rc = 0;
  for (let i = 0; i < ids.length && i < 3000; i++) {
    const shuffled = [...ids].sort(() => Math.random() - 0.5).filter(id => id !== ids[i]).slice(0, randInt(2,5));
    for (const relId of shuffled) { try { await conn.query('INSERT IGNORE INTO related_products (product_id,related_product_id,relation_type,sort_order) VALUES (?,?,?,?)', [ids[i],relId,pick(['cross_sell','up_sell','accessory','similar']),randInt(0,10)]); rc++; } catch {} }
  }
  console.log(`🔗 Related: ${rc}`);

  console.log('\n=== ✅ Seeding Complete ===');
  console.log(`Sports: ${Object.keys(sportIdMap).length} | Categories: ${Object.keys(catSlugMap).length} | Brands: ${brandCount}`);
  console.log(`Products: ${pCount} | Variants: ${vCount} | Total images: ${imgCount}\n`);
  await conn.end();
}

seed().catch((e) => { console.error('FAILED:', e); process.exit(1); });
