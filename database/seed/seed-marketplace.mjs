// seed-marketplace.mjs
// Enterprise marketplace catalog seed generator
// Generates: brands, products (10K+), variants (50K+), images, specs, tags
// Usage: node database/seed/seed-marketplace.mjs [--clear] [--seller-id=1]

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// ── Config ──
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
const skipVerification = process.argv.includes('--no-verify');

const dbConfig = {
  host: env('DB_HOST', 'localhost'), port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'), password: env('DB_PASSWORD', ''),
  multipleStatements: true,
};
const dbName = env('DB_NAME', 'courtzon_v2');

// ── Helper: slugify ──
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Helper: random item ──
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

// ── 2. CATEGORIES (per sport) ──
function getCategories() {
  const all = [
    { parent: null, slug: 'footwear', en: 'Footwear', ar: 'الأحذية' },
    { parent: null, slug: 'apparel', en: 'Apparel', ar: 'الملابس' },
    { parent: null, slug: 'equipment', en: 'Equipment', ar: 'المعدات' },
    { parent: null, slug: 'accessories', en: 'Accessories', ar: 'الإكسسوارات' },
    { parent: null, slug: 'protective-gear', en: 'Protective Gear', ar: 'معدات الحماية' },
    { parent: null, slug: 'bags-luggage', en: 'Bags & Luggage', ar: 'الحقائب' },
    { parent: 'footwear', slug: 'shoes', en: 'Shoes', ar: 'الأحذية' },
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
    { parent: 'equipment', slug: 'kettlebells', en: 'Kettlebells', ar: 'الكيبل' },
    { parent: 'equipment', slug: 'benches', en: 'Benches', ar: 'بنوك التمرين' },
    { parent: 'equipment', slug: 'machines', en: 'Machines', ar: 'أجهزة التمرين' },
    { parent: 'equipment', slug: 'treadmills', en: 'Treadmills', ar: 'أجهزة المشي' },
    { parent: 'equipment', slug: 'bikes', en: 'Bikes', ar: 'الدراجات' },
    { parent: 'equipment', slug: 'helmets', en: 'Helmets', ar: 'الخوذات' },
    { parent: 'equipment', slug: 'goggles', en: 'Goggles', ar: 'النظارات الواقية' },
    { parent: 'equipment', slug: 'gloves', en: 'Gloves', ar: 'القفازات' },
    { parent: 'equipment', slug: 'pads', en: 'Pads', ar: 'الوسادات' },
    { parent: 'equipment', slug: 'protection', en: 'Protection', ar: 'الحماية' },
    { parent: 'equipment', slug: 'swimwear', en: 'Swimwear', ar: 'ملابس السباحة' },
    { parent: 'equipment', slug: 'caps', en: 'Caps', ar: 'قبعات السباحة' },
    { parent: 'equipment', slug: 'fins', en: 'Fins', ar: 'زعانف السباحة' },
    { parent: 'equipment', slug: 'boards', en: 'Boards', ar: 'الألواح' },
    { parent: 'equipment', slug: 'mats', en: 'Mats', ar: 'الحصير' },
    { parent: 'equipment', slug: 'bands', en: 'Resistance Bands', ar: 'أشرطة المقاومة' },
    { parent: 'equipment', slug: 'rollers', en: 'Foam Rollers', ar: 'بكرات الإسفنج' },
    { parent: 'equipment', slug: 'jump-ropes', en: 'Jump Ropes', ar: 'حبال القفز' },
    { parent: 'equipment', slug: 'timing', en: 'Timing Equipment', ar: 'أجهزة التوقيت' },
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

  // Per-sport category assignments
  const sportCats = {
    football:      ['shoes','jerseys','shorts','socks','balls','shin-guards','gloves','water-bottles','bags','towels','headbands','kit-bags','tracksuits','jackets'],
    basketball:    ['shoes','jerseys','shorts','socks','balls','knee-pads','water-bottles','bags','headbands','tracksuits'],
    tennis:        ['shoes','shorts','socks','rackets','balls','towels','wristbands','hats','bags','racquet-covers','tracksuits'],
    padel:         ['shoes','shorts','socks','rackets','balls','towels','wristbands','hats','bags','racquet-covers'],
    volleyball:    ['shoes','jerseys','shorts','socks','balls','knee-pads','water-bottles','bags'],
    swimming:      ['swimwear','goggles','caps','fins','towels','bags','water-bottles','sandals'],
    running:       ['shoes','shorts','socks','t-shirts','jackets','water-bottles','hats','sunglasses','backpacks','timing'],
    'gym-fitness': ['shoes','shorts','compression','t-shirts','dumbbells','kettlebells','benches','machines','treadmills','bands','rollers','jump-ropes','gloves','water-bottles','towels','bags','mats'],
    cycling:       ['helmets','jerseys','shorts','gloves','bikes','water-bottles','sunglasses','bags','jackets','lights'],
    'martial-arts': ['shorts','protection','pads','gloves','mouth-guards','bags','headbands','mats'],
    yoga:          ['mats','blocks','straps','bands','towels','water-bottles','compression'],
    cricket:       ['shoes','jerseys','pants','bats','balls','gloves','pads','helmets','bags','kit-bags'],
    'table-tennis': ['shoes','shorts','rackets','balls','nets','towels','bags'],
    handball:      ['shoes','jerseys','shorts','balls','knee-pads','water-bottles'],
    badminton:     ['shoes','shorts','socks','rackets','shuttlecocks','nets','towels','wristbands','bags','racquet-covers'],
    boxing:        ['shoes','shorts','gloves','pads','mouth-guards','headbands','bags','jump-ropes','hand-wraps'],
  };

  // "t-shirts" is an alias for jerseys in some contexts
  const slugParentMap = {};
  for (const c of all) slugParentMap[c.slug] = c.parent;

  return { all, sportCats, slugParentMap };
}

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
  { name: "Kipsta", country: 'France', website: 'https://kipsta.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Kipsta' },
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
  { name: 'Tunturi', country: 'Finland', website: 'https://tunturi.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Tunturi' },
  { name: 'Life Fitness', country: 'USA', website: 'https://lifefitness.com', logo_url: 'https://placehold.co/200x80/eee/333?text=LifeFitness' },
  { name: 'Jordan', country: 'USA', website: 'https://jordan.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Jordan' },
  { name: 'Champion', country: 'USA', website: 'https://champion.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Champion' },
  { name: 'Umbro', country: 'UK', website: 'https://umbro.com', logo_url: 'https://placehold.co/200x80/eee/333?text=Umbro' },
];

// ── 4. PRODUCT TEMPLATES per sport + category ──
// Each template: { names: string[], brands: string[], gender, age, skill, priceRange, material }
const PRODUCT_TEMPLATES = {};

function genShoeTemplates() {
  const out = [];
  const brands = ['Nike','Adidas','Puma','Under Armour','New Balance','Asics','Mizuno','Reebok','Li-Ning','Decathlon'];
  const models = ['Speed','Pro','Elite','Strike','Vapor','Phantom','Predator','Freak','Boost','Ultra','Shadow','Storm','Flash','Fusion','Edge','Ace','Focus','Pulse'];
  for (let i = 0; i < 30; i++) {
    const b = pick(brands);
    const m = pick(models);
    const m2 = pick(models);
    out.push({
      name: `${b} ${m} ${m2} ${pick(['FG','AG','SG','TF'])}`,
      brands: [b], gender: pick(['male','female','unisex']),
      age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional','elite']),
      price: [300, 2500], material: pick(['Synthetic Leather','Mesh','Knit','Primeknit','Flyknit','Full-Grain Leather','Suede']),
      sizeType: 'shoe', hasColor: true,
    });
  }
  return out;
}

function genApparelTemplates(cat) {
  const out = [];
  const brands = ['Nike','Adidas','Puma','Under Armour','Reebok','New Balance','Champion','Jordan','Umbro','Decathlon','Lululemon'];
  const models = ['Performance','Pro','Elite','Essential','Dri-FIT','Heat.RDY','Climalite','Aeroready','Tech','Core','Supremacy','Ace','Prime','Flex'];
  const genders = ['male','female','unisex'];
  for (let i = 0; i < 20; i++) {
    const b = pick(brands);
    const m = pick(models);
    out.push({
      name: `${b} ${m} ${pick(['Running','Training','Sport','Game Day','Practice'])} ${cat === 'jerseys' ? pick(['Jersey','Shirt']) : cat === 'shorts' ? 'Shorts' : cat === 'jackets' ? pick(['Jacket','Windbreaker','Full Zip']) : cat === 'tracksuits' ? pick(['Tracksuit','Track Top','Track Pants']) : cat === 'socks' ? pick(['Socks','Crew Socks','No-Show Socks','Quarter Socks','Knee-High Socks']) : cat === 'compression' ? pick(['Compression Top','Compression Shorts','Compression Leggings','Compression Tights']) : 'Top'}`,
      brands: [b], gender: pick(genders),
      age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']),
      price: [50, 800], material: pick(['Polyester','Cotton','Elastane Blend','Dri-FIT','Mesh','Mercerized Cotton','Nylon','Wool Blend']),
      sizeType: 'apparel', hasColor: true,
    });
  }
  return out;
}

function genBallTemplates(sport) {
  const out = [];
  const ballBrands = {
    football: ['Adidas','Nike','Mitre','Select Sport','Decathlon','Puma'],
    basketball: ['Spalding','Wilson','Molten','Nike','Decathlon'],
    tennis: ['Wilson','Head','Babolat','Penn','Decathlon'],
    padel: ['Head','Babolat','Wilson','Adidas','Decathlon'],
    volleyball: ['Mikasa','Molten','Wilson','Decathlon'],
    cricket: ['Kookaburra','Gray-Nicolls','Gunn & Moore'],
    handball: ['Select Sport','Molten','Kempa','Decathlon'],
    waterpolo: ['Mikasa','Speedo'],
  };
  const brands = ballBrands[sport] || ballBrands['football'];
  const models = ['Match','Pro','Training','Club','Academy','Elite','Official','Tournament','All-Weather','Indoor','Outdoor'];
  const sizes = sport === 'football' ? ['Size 5','Size 4','Size 3'] :
                sport === 'basketball' ? ['Size 7','Size 6','Size 5'] :
                sport === 'volleyball' ? ['Official','Pro'] :
                ['Standard'];
  const count = sport === 'tennis' || sport === 'padel' ? 12 : 8;
  for (let i = 0; i < count; i++) {
    const b = pick(brands);
    out.push({
      name: `${b} ${sport.charAt(0).toUpperCase() + sport.slice(1)} ${pick(models)} ${pick(sizes)} ${pick(['Ball','Set of 3','Pack of 6'])}`,
      brands: [b], gender: 'unisex', age: 'adult',
      skill: pick(['beginner','intermediate','professional']),
      price: [30, 600], material: pick(['Synthetic Leather','PU Leather','Rubber','Microfiber','PVC']),
      sizeType: 'none', hasColor: true,
    });
  }
  return out;
}

function genRacketTemplates(sport) {
  const out = [];
  const racketBrands = {
    tennis: ['Wilson','Head','Babolat','Yonex','Prince'],
    padel: ['Head','Babolat','Wilson','Adidas','Bullpadel','Nox','Siux'],
    badminton: ['Yonex','Li-Ning','Victor','Carlton'],
    'table-tennis': ['Butterfly','Stiga','Joola','Donic'],
  };
  const brands = racketBrands[sport] || racketBrands['tennis'];
  const models = ['Pro','Elite','Tour','Performance','Club','Graphite','Carbon','Aluminium'];
  const count = sport === 'tennis' || sport === 'badminton' ? 15 : 8;
  for (let i = 0; i < count; i++) {
    const b = pick(brands);
    out.push({
      name: `${b} ${pick(models)} ${pick(['300G','310G','320G','280G','250G','270G','4U','5U'])} ${pick(['Racket','Racquet'])}`,
      brands: [b], gender: pick(['male','female','unisex']), age: 'adult',
      skill: pick(['beginner','intermediate','professional','elite']),
      price: [150, 3000], material: pick(['Graphite','Carbon Fiber','Aluminium','Titanium','Composite','Boron']),
      sizeType: pick(['grip','none']), hasColor: true,
    });
  }
  return out;
}

function genEquipmentTemplates(sport, cat) {
  const out = [];
  if (cat === 'dumbbells') {
    for (let i = 0; i < 10; i++) {
      out.push({
        name: `${pick(['Rogue','Bowflex','Technogym','NordicTrack','Decathlon'])} Adjustable Dumbbell ${pick(['5-25kg','5-50lb','5-52.5lb','5-75lb','10-40kg'])}`,
        brands: ['Rogue','Bowflex','Technogym','NordicTrack','Decathlon'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [200, 2500], material: 'Cast Iron + Rubber', sizeType: 'weight', hasColor: false,
      });
    }
  }
  if (cat === 'machines') {
    for (let i = 0; i < 8; i++) {
      out.push({
        name: `${pick(['Technogym','Life Fitness','NordicTrack','Bowflex','Tunturi'])} ${pick(['Multi Gym','Cable Crossover','Leg Press','Lat Pulldown','Smith Machine','Home Gym'])} ${pick(['Elite','Pro','Compact','Select'])}`,
        brands: ['Technogym','Life Fitness','NordicTrack','Bowflex','Tunturi'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [1500, 15000], material: 'Steel + Nylon', sizeType: 'none', hasColor: false,
      });
    }
  }
  if (cat === 'treadmills') {
    for (let i = 0; i < 6; i++) {
      out.push({
        name: `${pick(['NordicTrack','Peloton','Life Fitness','Technogym','Bowflex'])} ${pick(['Treadmill','Incline Trainer','Running Machine'])} ${pick(['Commercial','Pro','Home','Series 7','Series 9'])}`,
        brands: ['NordicTrack','Peloton','Life Fitness','Technogym','Bowflex'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [3000, 25000], material: 'Steel + Rubber Belt', sizeType: 'none', hasColor: false,
      });
    }
  }
  if (cat === 'bikes') {
    for (let i = 0; i < 15; i++) {
      out.push({
        name: `${pick(['Trek','Giant','Specialized','Cannondale','Schwinn'])} ${pick(['Road Bike','Mountain Bike','Hybrid Bike','City Bike','Gravel Bike','Electric Bike'])} ${pick(['Elite','Pro','Sport','Comp','Expert','XR','SL'])}`,
        brands: ['Trek','Giant','Specialized','Cannondale','Schwinn'].slice(0,1),
        gender: pick(['male','female','unisex']), age: 'adult', skill: pick(['beginner','intermediate','professional','elite']),
        price: [3000, 60000], material: pick(['Carbon Fiber','Aluminium','Titanium','Steel']), sizeType: 'bike', hasColor: true,
      });
    }
  }
  if (cat === 'goggles') {
    for (let i = 0; i < 8; i++) {
      out.push({
        name: `${pick(['Speedo','Arena','Tyr','Zoggs','Finis'])} ${pick(['Fastskin','Vanquisher','Predator','Vapor','Ultimate','Optimum'])} ${pick(['Swim Goggles','Racing Goggles','Mirror Goggles'])}`,
        brands: ['Speedo','Arena','Tyr','Zoggs','Finis'].slice(0,1),
        gender: pick(['male','female','unisex']), age: pick(['adult','youth']), skill: pick(['beginner','intermediate','professional']),
        price: [60, 400], material: pick(['Silicone','PVC','Polycarbonate Lens']), sizeType: 'none', hasColor: true,
      });
    }
  }
  if (cat === 'swimwear') {
    for (let i = 0; i < 15; i++) {
      out.push({
        name: `${pick(['Speedo','Arena','Tyr','Huub','Decathlon'])} ${pick(['Endurance','Fastskin','Carbon','Icon','Challenge','Jammer'])} ${pick(['Swimsuit','Briefs','Jammer','Bikini','One Piece','Trunks'])}`,
        brands: ['Speedo','Arena','Tyr','Huub','Decathlon'].slice(0,1),
        gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']),
        price: [80, 700], material: pick(['Polyester','Nylon + Spandex','PBT','Neoprene']), sizeType: 'apparel', hasColor: true,
      });
    }
  }
  if (cat === 'helmets') {
    for (let i = 0; i < 8; i++) {
      out.push({
        name: `${pick(['Giro','Specialized','Trek','Shimano','Decathlon'])} ${pick(['Aether','Synthe','S-Works','Eclipse','Vapor','Road','Aero'])} ${pick(['Helmet','MIPS Helmet'])}`,
        brands: ['Giro','Specialized','Trek','Shimano','Decathlon'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [200, 2500], material: pick(['In-Mold Polycarbonate','EPS Foam','Carbon']), sizeType: 'apparel', hasColor: true,
      });
    }
  }
  if (cat === 'pads' || cat === 'protection') {
    for (let i = 0; i < 10; i++) {
      out.push({
        name: `${pick(['Venum','Everlast','Fairtex','Twins Special','Rival'])} ${pick(['Shin','Knee','Elbow','Chest','Full Body'])} ${pick(['Guard','Protector','Pad Set','Protection Set'])} ${pick(['Pro','Elite','Training','Competition'])}`,
        brands: ['Venum','Everlast','Fairtex','Twins Special','Rival'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [100, 900], material: pick(['Leather','Synthetic Leather','PU Foam','Memory Foam']), sizeType: 'apparel', hasColor: true,
      });
    }
  }
  if (cat === 'gloves' && sport === 'boxing') {
    for (let i = 0; i < 12; i++) {
      out.push({
        name: `${pick(['Everlast','Venum','Fairtex','Twins Special','Rival','Title'])} ${pick(['Boxing Gloves','Training Gloves','Sparring Gloves','Fight Gloves','Bag Gloves'])} ${pick(['Pro','Elite','Platinum','Contender','MX','Classic'])} ${pick(['10oz','12oz','14oz','16oz','18oz'])}`,
        brands: ['Everlast','Venum','Fairtex','Twins Special','Rival','Title'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [150, 1200], material: pick(['Genuine Leather','Synthetic Leather','PU','Mesh']), sizeType: 'weight', hasColor: true,
      });
    }
  }
  if (cat === 'gloves' && sport !== 'boxing') {
    for (let i = 0; i < 6; i++) {
      out.push({
        name: `${pick(['Nike','Adidas','Reusch','Uhlsport','Decathlon'])} ${pick(['Goalkeeper Gloves','Training Gloves','Match Gloves'])} ${pick(['Pro','Elite','Club','Performance','Aqua'])}`,
        brands: ['Nike','Adidas','Reusch','Uhlsport','Decathlon'].slice(0,1),
        gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']),
        price: [150, 1000], material: pick(['Latex','Neoprene','Foam Latex','German Latex']), sizeType: 'apparel', hasColor: true,
      });
    }
  }
  if (cat === 'shin-guards') {
    for (let i = 0; i < 6; i++) {
      out.push({
        name: `${pick(['Nike','Adidas','Puma','Decathlon'])} ${pick(['Shin Guards','Sleeve Shin Guards','Ankle Shin Guards'])} ${pick(['Mercurial','Predator','Ultra','Fixel','Hunter'])}`,
        brands: ['Nike','Adidas','Puma','Decathlon'].slice(0,1),
        gender: pick(['male','female','unisex']), age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']),
        price: [50, 350], material: pick(['Polypropylene','EVA Foam','TPU','Fiberglass']), sizeType: 'apparel', hasColor: true,
      });
    }
  }
  if (cat === 'mats') {
    for (let i = 0; i < 6; i++) {
      out.push({
        name: `${pick(['Liforme','Manduka','Gaiam','Lululemon','Decathlon'])} ${pick(['Yoga Mat','Exercise Mat','Travel Mat','Premium Mat','Eco Mat'])} ${pick(['Classic','Pro','5mm','6mm','4mm','Reversible'])}`,
        brands: ['Liforme','Manduka','Gaiam','Lululemon','Decathlon'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [100, 1500], material: pick(['Natural Rubber','PVC','TPE','Cork','Jute']), sizeType: 'none', hasColor: true,
      });
    }
  }
  if (cat === 'bands') {
    for (let i = 0; i < 5; i++) {
      out.push({
        name: `${pick(['Rogue','Decathlon','TheraBand','Lululemon'])} ${pick(['Resistance Band Set','Power Band','Loop Bands','Tube Bands','Mini Bands'])} ${pick(['Heavy','Medium','Light','Extra Heavy','Set of 5'])}`,
        brands: ['Rogue','Decathlon','TheraBand','Lululemon'].slice(0,1),
        gender: 'unisex', age: 'adult', skill: pick(['beginner','intermediate','professional']),
        price: [40, 300], material: 'Natural Latex + Fabric', sizeType: 'resistance', hasColor: true,
      });
    }
  }
  if (cat === 'bats') {
    for (let i = 0; i < 10; i++) {
      out.push({
        name: `${pick(['Gray-Nicolls','Gunn & Moore','Kookaburra','Decathlon'])} ${pick(['Cricket Bat','Kashmir Willow','English Willow','Junior Bat','Batting Set'])} ${pick(['Oblivion','Radical','Echelon','Purist','Cobra','Diamond'])}`,
        brands: ['Gray-Nicolls','Gunn & Moore','Kookaburra','Decathlon'].slice(0,1),
        gender: 'unisex', age: pick(['adult','youth','junior']), skill: pick(['beginner','intermediate','professional']),
        price: [300, 8000], material: pick(['English Willow','Kashmir Willow','Sallew Willow']), sizeType: 'cricket', hasColor: false,
      });
    }
  }
  return out;
}

function genAccessoryTemplates(cat) {
  const out = [];
  const count = cat === 'bags' ? 8 : cat === 'backpacks' ? 6 : cat === 'water-bottles' ? 5 : 4;
  const brands = ['Nike','Adidas','Puma','Under Armour','Decathlon'];
  for (let i = 0; i < count; i++) {
    const b = pick(brands);
    const names = {
      'water-bottles': `${b} ${pick(['Squeeze Bottle','Thermal Bottle','Stainless Steel Bottle','Shaker Bottle','Insulated Bottle'])} ${pick(['500ml','750ml','1L','1.5L'])}`,
      'towels': `${b} ${pick(['Sports Towel','Microfiber Towel','Quick Dry Towel','Gym Towel'])} ${pick(['Large','Medium'])}`,
      'headbands': `${b} ${pick(['Headband','Sweatband','Tennis Headband','Running Headband'])} ${pick(['Wide','Classic'])}`,
      'wristbands': `${b} ${pick(['Wristband','Sweatband','Tennis Wristband','Gym Wristband'])} ${pick(['Pair','Set of 2'])}`,
      'hats': `${b} ${pick(['Performance Cap','Baseball Cap','Trucker Hat','Running Hat','Sun Hat'])}`,
      'bags': `${b} ${pick(['Gym Bag','Sports Bag','Duffel Bag','Team Bag'])} ${pick(['Small','Medium','Large','XL'])}`,
      'backpacks': `${b} ${pick(['Backpack','Running Backpack','Gym Backpack','Hiking Backpack'])} ${pick(['20L','30L','40L','50L'])}`,
      'sunglasses': `${pick(['Oakley','Nike','Adidas','Decathlon'])} ${pick(['Sport Sunglasses','Polarized Sunglasses','Running Glasses','Cycling Glasses'])} ${pick(['Pro','Elite','Aero','Vented'])}`,
      'kit-bags': `${pick(['Nike','Adidas','Puma','Kookaburra','Gray-Nicolls','Decathlon'])} ${pick(['Kit Bag','Team Bag','Wheeled Bag','Cricket Kit Bag'])} ${pick(['Large','XL','XXL','90L','120L'])}`,
      'racquet-covers': `${pick(['Wilson','Head','Babolat','Yonex','Decathlon'])} ${pick(['Racquet Cover','Racquet Bag','Thermo Bag','Triple Bag','Pro Bag'])}`,
    };
    out.push({
      name: names[cat] || `${b} ${cat} ${pick(['Pro','Elite','Classic'])}`,
      brands: [b], gender: 'unisex', age: 'adult', skill: 'beginner',
      price: [30, 600], material: pick(['Polyester','Nylon','Cotton','Silicone','Plastic','Neoprene']),
      sizeType: 'none', hasColor: true,
    });
  }
  return out;
}

// ── 5. SIZE / COLOR / VARIANT GENERATION ──
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

function getShoeSizes(gender) {
  const sizes = gender === 'male' || gender === 'unisex' ?
    [39, 39.5, 40, 40.5, 41, 42, 42.5, 43, 43.5, 44, 44.5, 45, 46, 47, 48] :
    [36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 42];
  return sizes;
}

function getApparelSizes(gender) {
  if (gender === 'female') return ['XXS','XS','S','M','L','XL','XXL','XXXL'];
  return ['XS','S','M','L','XL','XXL','XXXL','4XL'];
}

function getYouthShoeSizes() {
  return [30, 31, 32, 33, 34, 35, 36, 37, 38];
}

function getBikeFrameSizes() {
  return ['XS','S','M','L','XL'];
}

function getCricketBatSizes() {
  return ['Size 6','Size 5','Size 4','Size 3','Size 2','Harrow','Short Handle','Long Handle'];
}

function getResistanceLevels() {
  return ['XX-Light','X-Light','Light','Medium','Heavy','X-Heavy','XX-Heavy','XXX-Heavy'];
}

function getWeightOptions() {
  return ['1kg','2.5kg','5kg','7.5kg','10kg','12.5kg','15kg','20kg','25kg','30kg','40kg','50kg'];
}

function getGripSizes() {
  return ['Grip 0 (4")','Grip 1 (4 1/8")','Grip 2 (4 1/4")','Grip 3 (4 3/8")','Grip 4 (4 1/2")','Grip 5 (4 5/8")'];
}

function generateVariants(template, usedSkus) {
  const variants = [];
  const colorCount = template.hasColor ? randInt(2, 6) : 1;
  const selectedColors = [...COLORS].sort(() => Math.random() - 0.5).slice(0, colorCount);

  let sizeValues = [''];
  let sizeLabel = '';

  if (template.sizeType === 'shoe') {
    const sizes = template.age === 'junior' || template.age === 'youth' ? getYouthShoeSizes() : getShoeSizes(template.gender);
    sizeValues = sizes.map(s => `${s}`);
    sizeLabel = 'EU';
  } else if (template.sizeType === 'apparel') {
    sizeValues = getApparelSizes(template.gender);
    sizeLabel = 'Alpha';
  } else if (template.sizeType === 'weight') {
    sizeValues = getWeightOptions();
    sizeLabel = 'Weight';
  } else if (template.sizeType === 'resistance') {
    sizeValues = getResistanceLevels();
    sizeLabel = 'Level';
  } else if (template.sizeType === 'bike') {
    sizeValues = getBikeFrameSizes();
    sizeLabel = 'Frame';
  } else if (template.sizeType === 'cricket') {
    sizeValues = getCricketBatSizes();
    sizeLabel = 'Bat';
  } else if (template.sizeType === 'grip') {
    sizeValues = getGripSizes();
    sizeLabel = 'Grip';
  } else {
    sizeValues = [''];
  }

  const basePrice = randFloat(template.price[0], template.price[1]);
  let isFirst = true;

  for (const color of selectedColors) {
    for (const size of sizeValues) {
      if (template.sizeType === 'none' && colorCount > 1 && selectedColors.indexOf(color) > 2) continue;
      if (template.sizeType !== 'none' && sizeValues.length > 3 && sizeValues.indexOf(size) > Math.min(4, Math.floor(sizeValues.length * 0.6))) continue;

      const priceAdj = randInt(-Math.round(basePrice * 0.15), Math.round(basePrice * 0.3));
      const sku = `CZ-${template.name.substring(0, 3).toUpperCase()}-${color.hex.substring(1)}${size ? '-' + size : ''}-${randInt(1000, 9999)}`;
      const skuKey = sku.replace(/\s/g, '');
      if (usedSkus.has(skuKey)) continue;
      usedSkus.add(skuKey);

      variants.push({
        sku,
        barcode: `${randInt(100, 999)}${randInt(10000000, 99999999)}`,
        variantName: size || color.en,
        variantType: template.sizeType !== 'none' ? 'size' : 'color',
        priceAdjustment: priceAdj,
        quantity: randInt(5, 200),
        variantColor: template.sizeType === 'none' && template.hasColor ? color.hex : null,
        isDefault: isFirst ? 1 : 0,
        weight: template.sizeType !== 'none' ? randFloat(0.15, 2.5) : null,
        dimensions: template.sizeType !== 'none' ? `${randInt(10, 40)}x${randInt(10, 30)}x${randInt(5, 20)}` : null,
        colorName: template.hasColor ? color.en : null,
        colorHex: template.hasColor ? color.hex : null,
      });
      isFirst = false;
    }
  }

  return variants;
}

// ── Main Seeder ──
async function seed() {
  const conn = await mysql.createConnection(dbConfig);
  await conn.query(`USE \`${dbName}\``);
  console.log(`\n=== Marketplace Seed Generator ===`);
  console.log(`Target: ${dbName} on ${dbConfig.host}`);
  console.log(`Seller ID: ${sellerId}`);
  if (clear) console.log('⚠️  --clear mode: truncating related tables first\n');

  const usedSkus = new Set();

  // ── Clear if requested ──
  if (clear) {
    const tables = ['inventory_logs','related_products','product_tags','product_specifications','product_images','product_variants','products','brands','tags','product_categories','sports'];
    for (const t of tables) {
      try { await conn.query(`DELETE FROM \`${t}\``); } catch {}
    }
    console.log('Cleared existing data.\n');
  }

  // ── Helper: batch insert ──
  async function batchInsert(table, columns, rows) {
    if (!rows.length) return 0;
    const placeholders = rows.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const values = rows.flatMap(r => columns.map(c => r[c] ?? null));
    const [result] = await conn.query(
      `INSERT IGNORE INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES ${placeholders}`,
      values
    );
    return result.affectedRows;
  }

  // ── 1. Verify / insert Sports ──
  const sportIdMap = {};
  for (const s of SPORTS) {
    const [existing] = await conn.query('SELECT id FROM sports WHERE slug = ?', [s.slug]);
    if (existing.length) {
      sportIdMap[s.slug] = existing[0].id;
    } else {
      const [r] = await conn.query(
        'INSERT INTO sports (name, slug, icon, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
        [s.en, s.slug, s.slug, Object.keys(sportIdMap).length + 1]
      );
      sportIdMap[s.slug] = r.insertId;
    }
  }
  console.log(`📌 Sports: ${Object.keys(sportIdMap).length}`);

  // ── 2. Insert Categories ──
  const { all, sportCats, slugParentMap } = getCategories();
  const catSlugMap = {};
  // First pass: parent-less categories
  for (const c of all) {
    if (c.parent !== null) continue;
    const [existing] = await conn.query('SELECT id FROM product_categories WHERE slug = ?', [c.slug]);
    if (existing.length) {
      catSlugMap[c.slug] = existing[0].id;
    } else {
      const [r] = await conn.query(
        'INSERT INTO product_categories (name, slug, sort_order, is_active) VALUES (?, ?, ?, 1)',
        [c.en, c.slug, all.indexOf(c)]
      );
      catSlugMap[c.slug] = r.insertId;
    }
  }
  // Second pass: child categories
  for (const c of all) {
    if (c.parent === null) continue;
    if (catSlugMap[c.slug]) continue;
    const [existing] = await conn.query('SELECT id FROM product_categories WHERE slug = ?', [c.slug]);
    if (existing.length) {
      catSlugMap[c.slug] = existing[0].id;
    } else {
      const parentId = catSlugMap[c.parent];
      const [r] = await conn.query(
        'INSERT INTO product_categories (parent_id, name, slug, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
        [parentId || null, c.en, c.slug, all.indexOf(c)]
      );
      catSlugMap[c.slug] = r.insertId;
    }
  }
  console.log(`📌 Categories: ${Object.keys(catSlugMap).length}`);

  // ── 4. Insert Brands ──
  let brandCount = 0;
  const brandIdMap = {};
  for (const b of BRANDS) {
    const slug = slugify(b.name);
    const [existing] = await conn.query('SELECT id FROM brands WHERE slug = ?', [slug]);
    if (existing.length) {
      brandIdMap[b.name] = existing[0].id;
    } else {
      const [r] = await conn.query(
        'INSERT INTO brands (name, slug, logo_url, country, website, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [b.name, slug, b.logo_url, b.country, b.website, brandCount]
      );
      brandIdMap[b.name] = r.insertId;
      brandCount++;
    }
  }
  console.log(`📌 Brands: ${brandCount}`);

  // ── 5. Tags ──
  const TAG_LIST = ['Lightweight','Waterproof','Breathable','Quick-Dry','Indoor','Outdoor','Professional','Beginner','Tournament','Eco-Friendly','Unisex','Limited Edition','New Arrival','Best Seller','Seasonal','Compression','Reflective','UV Protection','Anti-Microbial','Shock-Absorbing'];
  const tagIdMap = {};
  for (const t of TAG_LIST) {
    const slug = slugify(t);
    const [existing] = await conn.query('SELECT id FROM tags WHERE slug = ?', [slug]);
    if (existing.length) { tagIdMap[t] = existing[0].id; }
    else { const [r] = await conn.query('INSERT INTO tags (name, slug) VALUES (?, ?)', [t, slug]); tagIdMap[t] = r.insertId; }
  }
  console.log(`📌 Tags: ${TAG_LIST.length}`);

  // ── 6. Generate Products ──
  console.log('\n🔄 Generating products...');

  const allTemplates = [];
  let productCount = 0;
  let variantCount = 0;
  let imageCount = 0;
  let specCount = 0;
  let tagAssignCount = 0;
  let relatedCount = 0;

  // Build template arrays per sport
  for (const sport of SPORTS) {
    const sSlug = sport.slug;
    const sName = sport.en;
    const categories = sportCats[sSlug] || [];
    for (const catSlug of categories) {
      const catId = catSlugMap[catSlug];
      if (!catId) continue;
      const sid = sportIdMap[sSlug];
      const parentSlug = slugParentMap[catSlug];
      // Determine which generator to use
      let templates = [];
      if (catSlug === 'shoes') {
        templates = genShoeTemplates();
      } else if (['jerseys','shorts','socks','jackets','tracksuits','compression'].includes(catSlug)) {
        templates = genApparelTemplates(catSlug);
      } else if (catSlug === 'balls') {
        templates = genBallTemplates(sSlug);
      } else if (['rackets','bats'].includes(catSlug) || (sSlug === 'table-tennis' && catSlug === 'equipment') || (sSlug === 'badminton' && catSlug === 'rackets')) {
        if (sSlug === 'tennis' || sSlug === 'padel' || sSlug === 'badminton' || sSlug === 'table-tennis') {
          templates = genRacketTemplates(sSlug);
        }
      } else if (['dumbbells','machines','treadmills','bikes','goggles','swimwear','helmets','pads','protection','shin-guards','gloves','mats','bands','bats'].includes(catSlug)) {
        templates = genEquipmentTemplates(sSlug, catSlug);
      }
      if (['water-bottles','towels','headbands','wristbands','hats','bags','backpacks','sunglasses','kit-bags','racquet-covers'].includes(catSlug)) {
        templates = genAccessoryTemplates(catSlug);
      }
      if (!parentSlug && !['footwear','apparel','equipment','accessories','protective-gear','bags-luggage'].includes(catSlug)) {
        // Top-level specific categories like 'swimwear' etc.
        if (['swimwear','goggles','caps','fins','boards','mats'].includes(catSlug)) {
          // Already handled above
        }
      }

      // Also add generic templates for categories without specific generators
      if (templates.length === 0) {
        // Create a generic template
        templates = Array.from({length: 5}, () => ({
          name: `${pick(['Decathlon','Sondico','Kipsta','Select Sport'])} ${sName} ${catSlug.replace(/-/g,' ')} ${pick(['Pro','Club','Elite','Essential','100','500','900'])}`,
          brands: pick([['Decathlon'],['Sondico'],['Kipsta'],['Select Sport']]),
          gender: 'unisex', age: 'adult', skill: 'beginner',
          price: [30, 300], material: 'Synthetic',
          sizeType: 'none', hasColor: true,
        }));
      }

      for (const tmpl of templates) {
        if (productCount >= targetProducts) break;
        const brandId = brandIdMap[tmpl.brands[0]];
        const basePrice = randFloat(tmpl.price[0], tmpl.price[1]);
        const gender = tmpl.gender;
        const age = tmpl.age;
        const skill = tmpl.skill;
        const material = tmpl.material;
        const variants = generateVariants(tmpl, usedSkus);

        if (variants.length === 0) continue;

        const mainVariant = variants.find(v => v.isDefault) || variants[0];
        const effectivePrice = Math.max(1, basePrice + mainVariant.priceAdjustment);
        const name = tmpl.name;

        // Determine discount
        const hasDiscount = Math.random() < 0.35;
        const discountedPrice = hasDiscount ? Math.round(effectivePrice * randFloat(0.5, 0.95) * 100) / 100 : null;

        // Insert product
        const genderDb = gender;
        const ageDb = age;
        const skillDb = skill;

        const [prodResult] = await conn.query(
          `INSERT INTO products (seller_id, brand_id, category_id, sport_id, name, description,
            short_description_en, price, discounted_price, currency_code, gender, age_group, skill_level,
            material, quantity, status, images, rating_avg, rating_count, view_count, sales_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
          [
            sellerId, brandId || null, catId, sid || null, name,
            `${name} - Premium ${sSlug} ${sport.en} ${catSlug.replace(/-/g,' ')}. ${pick(['High quality','Professional grade','Perfect for training and competition','Designed for optimal performance','Engineered for comfort and durability'])}. ${pick(['Suitable for all skill levels','Ideal for competitive play','Great for recreational use','Perfect for beginners and pros alike'])}.`,
            `${pick(['Premium','High quality','Professional','Essential'])} ${catSlug.replace(/-/g,' ')} for ${sport.en}`,
            effectivePrice, discountedPrice, 'EGP', genderDb, ageDb, skillDb,
            material, variants.reduce((s, v) => s + v.quantity, 0),
            JSON.stringify(Array.from({length: randInt(2,5)}, (_, i) => `https://placehold.co/800x800/${mainVariant.colorHex?.substring(1) || 'eee'}/333?text=${encodeURIComponent(name.substring(0,20))}+${i+1}`)),
            randFloat(3.0, 5.0, 1), randInt(5, 500), randInt(100, 50000), randInt(10, 2000),
          ]
        );
        const productId = prodResult.insertId;
        productCount++;

        // Insert variants
        for (const v of variants) {
          const varPrice = clamp(basePrice + v.priceAdjustment, 1, 99999);
          const [varResult] = await conn.query(
            `INSERT INTO product_variants (product_id, sku, barcode, variant_name, variant_type,
              price_adjustment, compare_price, quantity, weight, dimensions, variant_color,
              variant_image_url, is_default, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              productId, v.sku, v.barcode, v.variantName, v.variantType,
              v.priceAdjustment,
              hasDiscount ? Math.round(effectivePrice * randFloat(1.1, 1.5) * 100) / 100 : null,
              v.quantity, v.weight, v.dimensions, v.variantColor,
              v.colorHex ? `https://placehold.co/800x800/${v.colorHex.substring(1)}/333?text=${v.variantName}` : null,
              v.isDefault,
            ]
          );
          const variantId = varResult.insertId;

          // Inventory log
          await conn.query(
            `INSERT INTO inventory_logs (variant_id, movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, 'in', ?, 0, ?, 'Initial stock from seed')`,
            [variantId, v.quantity, v.quantity]
          );
          variantCount++;

          // Product image per variant (only for default + color variants)
          if (v.isDefault || v.colorHex) {
            const imgUrl = v.colorHex
              ? `https://placehold.co/800x800/${v.colorHex.substring(1)}/333?text=${v.variantName}`
              : `https://placehold.co/800x800/eee/333?text=${name.substring(0,20)}`;
            await conn.query(
              `INSERT INTO product_images (product_id, variant_id, media_url, alt_text, sort_order, is_primary)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [productId, variantId, imgUrl, `${name} - ${v.variantName}`, variantCount, v.isDefault ? 1 : 0]
            );
            imageCount++;
          }
        }

        // Specifications
        const specs = [
          ['Brand', tmpl.brands[0] || 'Generic'],
          ['Sport', sport.en],
          ['Material', material],
          ['Gender', gender === 'unisex' ? 'Unisex' : gender.charAt(0).toUpperCase() + gender.slice(1)],
          ['Age Group', age.charAt(0).toUpperCase() + age.slice(1)],
          ['Skill Level', skill.charAt(0).toUpperCase() + skill.slice(1)],
        ];
        if (mainVariant.weight) specs.push(['Weight (kg)', String(mainVariant.weight)]);
        if (mainVariant.dimensions) specs.push(['Dimensions (cm)', mainVariant.dimensions]);
        for (const [sn, sv] of specs) {
          await conn.query(
            'INSERT INTO product_specifications (product_id, spec_name, spec_value, sort_order) VALUES (?, ?, ?, ?)',
            [productId, sn, sv, specs.indexOf([sn, sv])]
          );
          specCount++;
        }

        // Tags
        const productTags = [...TAG_LIST].sort(() => Math.random() - 0.5).slice(0, randInt(1, 4));
        for (const tag of productTags) {
          const tid = tagIdMap[tag];
          if (tid) {
            try {
              await conn.query('INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)', [productId, tid]);
              tagAssignCount++;
            } catch {}
          }
        }

        // Related products will be linked after all insertions

        if (productCount % 500 === 0) {
          console.log(`   ... ${productCount} products, ${variantCount} variants`);
        }
        if (productCount >= targetProducts) break;
      }
      if (productCount >= targetProducts) break;
    }
    if (productCount >= targetProducts) break;
  }

  console.log(`📦 Products: ${productCount}`);
  console.log(`🏷️  Variants: ${variantCount}`);
  console.log(`🖼️  Images: ${imageCount}`);
  console.log(`📋 Specs: ${specCount}`);
  console.log(`🔖 Tag Assignments: ${tagAssignCount}`);

  // ── 7. Related Products (cross-sell/up-sell) ──
  console.log('\n🔄 Generating related products...');
  const [allProductIds] = await conn.query('SELECT id FROM products ORDER BY RAND() LIMIT 5000');
  const ids = allProductIds.map(r => r.id);
  for (let i = 0; i < ids.length && i < 3000; i++) {
    const pid = ids[i];
    const relatedCount = randInt(2, 5);
    const shuffled = [...ids].sort(() => Math.random() - 0.5).filter(id => id !== pid).slice(0, relatedCount);
    for (const relId of shuffled) {
      try {
        await conn.query(
          'INSERT IGNORE INTO related_products (product_id, related_product_id, relation_type, sort_order) VALUES (?, ?, ?, ?)',
          [pid, relId, pick(['cross_sell','up_sell','accessory','similar']), randInt(0, 10)]
        );
        relatedCount++;
      } catch {}
    }
  }
  console.log(`🔗 Related Product Pairs: ${relatedCount}`);

  // ── Summary ──
  console.log('\n=== ✅ Seeding Complete ===');
  console.log(`Sports:     ${Object.keys(sportIdMap).length}`);
  console.log(`Categories: ${Object.keys(catSlugMap).length}`);
  console.log(`Brands:     ${brandCount}`);
  console.log(`Products:   ${productCount}`);
  console.log(`Variants:   ${variantCount}`);
  console.log(`Images:     ${imageCount}`);
  console.log(`Specs:      ${specCount}`);
  console.log(`Tags:       ${TAG_LIST.length}`);
  console.log(`Tag Assign: ${tagAssignCount}`);
  console.log(`Related:    ${relatedCount}\n`);

  await conn.end();
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
