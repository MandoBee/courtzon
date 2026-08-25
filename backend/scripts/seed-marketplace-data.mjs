// CourtZon Marketplace Test-Data Seeder
// Creates 4 test shops (Shop 1, Shop 2, Shop 3, Shop 5) + 40 diverse products (10 each).
// Uses ONLY the existing application/API flows:
//   - POST /auth/register-seller  (free Freemium Shop plan -> auto-approved)
//   - POST /marketplace/products  (existing product creation flow)
//   - PUT  /marketplace/admin/products/:id/status  (admin approval)
//   - PUT  /marketplace/products/:id/visibility    (seller visibility)
//   - POST /admin/product-categories, /admin/brands (admin reference data)
// Images: generated via sharp and stored through the existing uploads mechanism.
//
// Idempotent: every product/shop/category/brand carries a "TEST/MARKETPLACE-SEED"
// marker (name prefix or slug) so re-running never duplicates.
//
// Usage: node scripts/seed-marketplace-data.mjs [--dry-run]
// Env: API_URL (default http://localhost:3000), plus DB_* for image/file writes.

import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || 'http://localhost:3000';
const UPLOADS_ROOT = join(__dirname, '..', 'uploads');
const DRY_RUN = process.argv.includes('--dry-run');
const SEED_PASSWORD = process.env.SEED_PASSWORD || '123456';

// LIVE_MODE: when targeting the production DB/API, use external placeholder
// image URLs (production stores images in products.images only, served from a
// CDN). Local dev writes real files to backend/uploads + product_images rows.
const LIVE_MODE = !process.env.API_URL || !process.env.API_URL.includes('localhost');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3307', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'courtzon2026',
  database: process.env.DB_NAME || 'courtzon_v3',
};

// ── Marker used for idempotency ──
const MARKER = 'TEST/MARKETPLACE-SEED';
const TAG = 'MS'; // short tag for shop slug / names

// ── Reference data (created only if missing; reuses existing on live DB) ──
const CATEGORIES = [
  { name: 'Rackets', slug: 'rackets', sport: 'padel' },
  { name: 'Balls', slug: 'balls', sport: 'padel' },
  { name: 'Court Shoes', slug: 'court-shoes', sport: 'padel' },
  { name: 'Tennis Rackets', slug: 'rackets', sport: 'tennis', useName: 'Rackets' },
  { name: 'Football Boots', slug: 'football-boots', sport: 'football' },
  { name: 'Gym Apparel', slug: 'gym-apparel', sport: 'gym' },
  { name: 'Fitness Equipment', slug: 'fitness-equipment', sport: 'gym' },
  { name: 'Training Bags', slug: 'bags', sport: null },
  { name: 'Accessories', slug: 'accessories', sport: null },
  { name: 'Hydration', slug: 'nutrition-hydration', sport: null },
];

const BRANDS = [
  'Head', 'Babolat', 'Wilson', 'Yonex', 'Nike', 'Adidas',
  'Puma', 'Asics', 'Dunlop', 'Decathlon', 'Tecnifibre', 'Mizuno',
];

const SPORT_IDS = { padel: 22, tennis: 21, football: 19, gym: 26 };
const TAG_IDS = { lightweight: 26, waterproof: 27, breathable: 28, quick_dry: 29, indoor: 30, outdoor: 31, professional: 32, beginner: 33, tournament: 34, eco: 35, unisex: 36, limited: 37, new_arrival: 38, best_seller: 39, seasonal: 40, compression: 41, reflective: 42, uv: 43, anti_microbial: 44, shock: 45, organic: 46, recycled: 47, water_resistant: 48, windproof: 49, thermal: 50 };

const GENDERS = ['male', 'female', 'unisex'];
const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'used'];

// ── HTTP helper (cookie-based auth) ──
async function api(method, path, { cookies, body } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json, headers: res.headers };
}

function cookiesFrom(res) {
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

// ── Shop definitions ──
const SHOPS = [
  { name: 'Shop 1', phone: '01610101011', email: 'shop1.mseed@test.local', fullName: 'Shop One Owner' },
  { name: 'Shop 2', phone: '01610101012', email: 'shop2.mseed@test.local', fullName: 'Shop Two Owner' },
  { name: 'Shop 3', phone: '01610101013', email: 'shop3.mseed@test.local', fullName: 'Shop Three Owner' },
  { name: 'Shop 5', phone: '01610101015', email: 'shop5.mseed@test.local', fullName: 'Shop Five Owner' },
];

// ── Product blueprints per shop (10 each) ──
// Each product: category, sport, brand, gender, condition, price, discount,
// quantity, tags, variants, specs, isDigital, images.
const PRODUCT_SET = [
  // Shop 1 — Padel pro shop
  {
    name: `${MARKER} Padel Pro Racket`, category: 'Rackets', sport: 'padel', brand: 'Head',
    gender: 'unisex', condition: 'new', price: 289.00, discountedPrice: null, quantity: 25,
    tags: ['professional', 'tournament', 'lightweight'],
    variants: [
      { sku: 'HDP-PPR-S', variantName: 'Standard Grip', variantType: 'Grip Size', priceAdjustment: 0, quantity: 12, sortOrder: 1 },
      { sku: 'HDP-PPR-L', variantName: 'Large Grip', variantType: 'Grip Size', priceAdjustment: 0, quantity: 8, sortOrder: 2 },
    ],
    specs: [{ name: 'Weight', value: '365g' }, { name: 'Core', value: 'EVA Soft' }, { name: 'Balance', value: 'Medium' }],
    description: 'A tournament-grade padel racket with a carbon fiber face and soft EVA core, engineered for spin and control at every level.',
  },
  {
    name: `${MARKER} Tournament Padel Balls (3-pack)`, category: 'Balls', sport: 'padel', brand: 'Babolat',
    gender: 'unisex', condition: 'new', price: 12.50, discountedPrice: 9.99, quantity: 80,
    tags: ['tournament', 'outdoor', 'best_seller'],
    variants: [],
    specs: [{ name: 'Pack', value: '3 balls' }, { name: 'Pressure', value: 'Pressurized' }],
    description: 'Official tournament padel balls offering consistent bounce and durability across all court surfaces.',
  },
  {
    name: `${MARKER} Women\'s Padel Court Shoes`, category: 'Court Shoes', sport: 'padel', brand: 'Asics',
    gender: 'female', condition: 'new', price: 129.00, discountedPrice: 99.00, quantity: 18,
    tags: ['breathable', 'quick_dry', 'lightweight'],
    variants: [
      { sku: 'ASC-WPS-38', variantName: 'EU 38', variantType: 'Size', priceAdjustment: 0, quantity: 6, sortOrder: 1 },
      { sku: 'ASC-WPS-39', variantName: 'EU 39', variantType: 'Size', priceAdjustment: 0, quantity: 8, sortOrder: 2 },
      { sku: 'ASC-WPS-40', variantName: 'EU 40', variantType: 'Size', priceAdjustment: 0, quantity: 4, sortOrder: 3 },
    ],
    specs: [{ name: 'Upper', value: 'Mesh' }, { name: 'Sole', value: 'Rubber' }],
    description: 'Lightweight women\'s court shoes with breathable mesh upper and cushioned sole for lateral support on padel courts.',
  },
  {
    name: `${MARKER} Padel Overgrip (x3)`, category: 'Accessories', sport: 'padel', brand: 'Wilson',
    gender: 'unisex', condition: 'new', price: 8.00, discountedPrice: null, quantity: 150,
    tags: ['lightweight', 'new_arrival'],
    variants: [{ sku: 'WLS-OG-W', variantName: 'White', variantType: 'Color', priceAdjustment: 0, quantity: 60, sortOrder: 1, variantColor: '#ffffff' }, { sku: 'WLS-OG-B', variantName: 'Black', variantType: 'Color', priceAdjustment: 0, quantity: 90, sortOrder: 2, variantColor: '#000000' }],
    specs: [{ name: 'Length', value: '105cm' }, { name: 'Thickness', value: '0.6mm' }],
    description: 'Tacky overgrips that improve grip and comfort; pack of three in assorted colors.',
  },
  {
    name: `${MARKER} Padel Backpack`, category: 'Training Bags', sport: 'padel', brand: 'Decathlon',
    gender: 'unisex', condition: 'like_new', price: 49.00, discountedPrice: 39.00, quantity: 12,
    tags: ['outdoor', 'water_resistant'],
    variants: [],
    specs: [{ name: 'Capacity', value: '30L' }, { name: 'Laptop Sleeve', value: 'Yes' }],
    description: 'Durable padel backpack with racket slot, ventilated shoe compartment, and water-resistant outer fabric. Gently used demo unit.',
  },
  {
    name: `${MARKER} Pro Padel Training Machine`, category: 'Fitness Equipment', sport: 'gym', brand: 'Dunlop',
    gender: 'unisex', condition: 'used', price: 899.00, discountedPrice: null, quantity: 3,
    tags: ['professional', 'seasonal'],
    variants: [],
    specs: [{ name: 'Power', value: '120W' }, { name: 'Ball Capacity', value: '60' }],
    description: 'Ball-feeding training machine for solo padel practice. Used condition with full working mechanics.',
  },
  {
    name: `${MARKER} Padel Sweatband Set`, category: 'Accessories', sport: 'padel', brand: 'Nike',
    gender: 'unisex', condition: 'new', price: 15.00, discountedPrice: 12.00, quantity: 5,
    tags: ['anti_microbial', 'quick_dry', 'low stock'],
    variants: [{ sku: 'NKE-SB-W', variantName: 'White', variantType: 'Color', priceAdjustment: 0, quantity: 2, sortOrder: 1 }, { sku: 'NKE-SB-N', variantName: 'Navy', variantType: 'Color', priceAdjustment: 0, quantity: 3, sortOrder: 2 }],
    specs: [{ name: 'Material', value: 'Terry cotton' }],
    description: 'Moisture-wicking wristbands that keep sweat off your grip during long matches.',
  },
  {
    name: `${MARKER} Padel Court Net`, category: 'Fitness Equipment', sport: 'padel', brand: 'Wilson',
    gender: 'unisex', condition: 'good', price: 199.00, discountedPrice: 179.00, quantity: 7,
    tags: ['outdoor', 'professional'],
    variants: [],
    specs: [{ name: 'Width', value: '10m' }, { name: 'Height', value: '88cm' }],
    description: 'Regulation-size padel net with durable galvanized frame, good used condition ideal for clubs.',
  },
  {
    name: `${MARKER} Padel Elbow Compression Sleeve`, category: 'Accessories', sport: 'padel', brand: 'Puma',
    gender: 'unisex', condition: 'new', price: 22.00, discountedPrice: null, quantity: 30,
    tags: ['compression', 'shock'],
    variants: [{ sku: 'PUM-CS-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 15, sortOrder: 1 }, { sku: 'PUM-CS-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 15, sortOrder: 2 }],
    specs: [{ name: 'Compression', value: 'Medium' }],
    description: 'Elbow compression sleeve supporting the forearm during powerful smashes.',
  },
  {
    name: `${MARKER} Organic Energy Drink (12pk)`, category: 'Hydration', sport: 'gym', brand: 'Decathlon',
    gender: 'unisex', condition: 'new', price: 18.00, discountedPrice: 15.00, quantity: 45,
    tags: ['organic', 'eco', 'new_arrival'],
    variants: [],
    specs: [{ name: 'Volume', value: '500ml' }, { name: 'Flavor', value: 'Lemon' }],
    description: 'Organic electrolyte drink mix, twelve-pack, for sustained energy during training.',
  },

  // Shop 2 — Tennis equipment
  {
    name: `${MARKER} Tennis Performance Racket`, category: 'Tennis Rackets', sport: 'tennis', brand: 'Yonex',
    gender: 'unisex', condition: 'new', price: 229.00, discountedPrice: 199.00, quantity: 22,
    tags: ['professional', 'tournament'],
    variants: [{ sku: 'YNX-TPR-100', variantName: '100sq in', variantType: 'Head Size', priceAdjustment: 0, quantity: 10, sortOrder: 1 }, { sku: 'YNX-TPR-98', variantName: '98sq in', variantType: 'Head Size', priceAdjustment: 0, quantity: 12, sortOrder: 2 }],
    specs: [{ name: 'String Pattern', value: '16x19' }, { name: 'Weight', value: '305g' }],
    description: 'Precision-engineered tennis racket with isometric head for a larger sweet spot and greater spin.',
  },
  {
    name: `${MARKER} Tennis Balls (can of 4)`, category: 'Balls', sport: 'tennis', brand: 'Wilson',
    gender: 'unisex', condition: 'new', price: 9.00, discountedPrice: null, quantity: 120,
    tags: ['tournament', 'outdoor'],
    variants: [],
    specs: [{ name: 'Pack', value: '4 balls' }],
    description: 'Pressurized tennis balls with felt cover for consistent performance on hard courts.',
  },
  {
    name: `${MARKER} Men\'s Tennis Shoes`, category: 'Court Shoes', sport: 'tennis', brand: 'Adidas',
    gender: 'male', condition: 'new', price: 140.00, discountedPrice: 110.00, quantity: 14,
    tags: ['breathable', 'shock', 'best_seller'],
    variants: [{ sku: 'ADS-MTS-42', variantName: 'EU 42', variantType: 'Size', priceAdjustment: 0, quantity: 6, sortOrder: 1 }, { sku: 'ADS-MTS-43', variantName: 'EU 43', variantType: 'Size', priceAdjustment: 0, quantity: 5, sortOrder: 2 }, { sku: 'ADS-MTS-44', variantName: 'EU 44', variantType: 'Size', priceAdjustment: 0, quantity: 3, sortOrder: 3 }],
    specs: [{ name: 'Outsole', value: 'Adiwear' }],
    description: 'Men\'s hard-court tennis shoes with reinforced toe and responsive cushioning.',
  },
  {
    name: `${MARKER} Tennis Grip Replacement (2pk)`, category: 'Accessories', sport: 'tennis', brand: 'Babolat',
    gender: 'unisex', condition: 'new', price: 10.50, discountedPrice: null, quantity: 90,
    tags: ['lightweight', 'new_arrival'],
    variants: [{ sku: 'BBT-GR-W', variantName: 'White', variantType: 'Color', priceAdjustment: 0, quantity: 45, sortOrder: 1 }, { sku: 'BBT-GR-G', variantName: 'Green', variantType: 'Color', priceAdjustment: 0, quantity: 45, sortOrder: 2 }],
    specs: [{ name: 'Thickness', value: '1.5mm' }],
    description: 'Replacement grips for better feel and control; two per pack.',
  },
  {
    name: `${MARKER} Tennis Racquet Bag (6-pack)`, category: 'Training Bags', sport: 'tennis', brand: 'Head',
    gender: 'unisex', condition: 'new', price: 89.00, discountedPrice: 74.00, quantity: 9,
    tags: ['outdoor', 'water_resistant'],
    variants: [],
    specs: [{ name: 'Racquet Capacity', value: '6' }],
    description: 'Large tennis bag with thermal lining, shoe pocket, and water-repellent finish.',
  },
  {
    name: `${MARKER} Used Tennis Racket (Demo)`, category: 'Tennis Rackets', sport: 'tennis', brand: 'Dunlop',
    gender: 'unisex', condition: 'used', price: 60.00, discountedPrice: 45.00, quantity: 4,
    tags: ['beginner', 'eco'],
    variants: [],
    specs: [{ name: 'Weight', value: '280g' }, { name: 'Head', value: '105sq in' }],
    description: 'Pre-loved demo racket, ideal for beginners; light scuffs on the frame.',
  },
  {
    name: `${MARKER} Women\'s Tennis Dress`, category: 'Gym Apparel', sport: 'tennis', brand: 'Nike',
    gender: 'female', condition: 'new', price: 65.00, discountedPrice: null, quantity: 20,
    tags: ['quick_dry', 'breathable', 'uv'],
    variants: [{ sku: 'NKE-WTD-S', variantName: 'S', variantType: 'Size', priceAdjustment: 0, quantity: 8, sortOrder: 1 }, { sku: 'NKE-WTD-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 8, sortOrder: 2 }, { sku: 'NKE-WTD-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 4, sortOrder: 3 }],
    specs: [{ name: 'Material', value: 'Dri-FIT' }],
    description: 'Lightweight tennis dress with built-in shorts and UV protection for sun-soaked matches.',
  },
  {
    name: `${MARKER} Tennis Ball Basket`, category: 'Fitness Equipment', sport: 'tennis', brand: 'Wilson',
    gender: 'unisex', condition: 'good', price: 35.00, discountedPrice: null, quantity: 6,
    tags: ['indoor', 'professional'],
    variants: [],
    specs: [{ name: 'Capacity', value: '80 balls' }],
    description: 'Sturdy ball basket for practice sessions; good used condition.',
  },
  {
    name: `${MARKER} Tennis Training Socks (3pk)`, category: 'Accessories', sport: 'tennis', brand: 'Adidas',
    gender: 'unisex', condition: 'new', price: 16.00, discountedPrice: 13.00, quantity: 3,
    tags: ['anti_microbial', 'compression'],
    variants: [],
    specs: [{ name: 'Pack', value: '3 pairs' }],
    description: 'Cushioned athletic socks with arch support — low stock, quick sale.',
  },
  {
    name: `${MARKER} Tennis Water Bottle 750ml`, category: 'Hydration', sport: 'gym', brand: 'Mizuno',
    gender: 'unisex', condition: 'new', price: 11.00, discountedPrice: null, quantity: 60,
    tags: ['eco', 'outdoor'],
    variants: [],
    specs: [{ name: 'Capacity', value: '750ml' }, { name: 'Insulated', value: 'Yes' }],
    description: 'BPA-free insulated water bottle keeps drinks cold during long matches.',
  },

  // Shop 3 — Football & gym
  {
    name: `${MARKER} Football Boots (FG)`, category: 'Football Boots', sport: 'football', brand: 'Nike',
    gender: 'male', condition: 'new', price: 175.00, discountedPrice: 150.00, quantity: 16,
    tags: ['professional', 'new_arrival'],
    variants: [{ sku: 'NKE-FB-41', variantName: 'EU 41', variantType: 'Size', priceAdjustment: 0, quantity: 5, sortOrder: 1 }, { sku: 'NKE-FB-42', variantName: 'EU 42', variantType: 'Size', priceAdjustment: 0, quantity: 6, sortOrder: 2 }, { sku: 'NKE-FB-43', variantName: 'EU 43', variantType: 'Size', priceAdjustment: 0, quantity: 5, sortOrder: 3 }],
    specs: [{ name: 'Sole', value: 'Firm Ground' }, { name: 'Upper', value: 'Knit' }],
    description: 'Firm-ground football boots with knitted upper for a locked-in fit and explosive acceleration.',
  },
  {
    name: `${MARKER} Match Football (Size 5)`, category: 'Balls', sport: 'football', brand: 'Adidas',
    gender: 'unisex', condition: 'new', price: 45.00, discountedPrice: null, quantity: 40,
    tags: ['tournament', 'best_seller'],
    variants: [],
    specs: [{ name: 'Size', value: '5' }, { name: 'Bladder', value: 'Butyl' }],
    description: 'FIFA-quality match ball with thermally bonded panels for a true flight.',
  },
  {
    name: `${MARKER} Men\'s Training Jersey`, category: 'Gym Apparel', sport: 'football', brand: 'Puma',
    gender: 'male', condition: 'new', price: 35.00, discountedPrice: 28.00, quantity: 33,
    tags: ['breathable', 'quick_dry'],
    variants: [{ sku: 'PUM-TJ-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 12, sortOrder: 1 }, { sku: 'PUM-TJ-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 12, sortOrder: 2 }, { sku: 'PUM-TJ-XL', variantName: 'XL', variantType: 'Size', priceAdjustment: 0, quantity: 9, sortOrder: 3 }],
    specs: [{ name: 'Material', value: 'Polyester' }],
    description: 'Moisture-wicking training jersey for team practice sessions.',
  },
  {
    name: `${MARKER} Shin Guards`, category: 'Accessories', sport: 'football', brand: 'Adidas',
    gender: 'unisex', condition: 'new', price: 18.00, discountedPrice: null, quantity: 55,
    tags: ['shock', 'lightweight'],
    variants: [{ sku: 'ADS-SG-S', variantName: 'S', variantType: 'Size', priceAdjustment: 0, quantity: 20, sortOrder: 1 }, { sku: 'ADS-SG-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 20, sortOrder: 2 }, { sku: 'ADS-SG-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 15, sortOrder: 3 }],
    specs: [{ name: 'Material', value: 'EVA + PP' }],
    description: 'Lightweight shin guards with ankle protection, sized for youth through adult.',
  },
  {
    name: `${MARKER} Training Agility Ladder`, category: 'Fitness Equipment', sport: 'gym', brand: 'Decathlon',
    gender: 'unisex', condition: 'like_new', price: 28.00, discountedPrice: 22.00, quantity: 8,
    tags: ['indoor', 'outdoor', 'beginner'],
    variants: [],
    specs: [{ name: 'Rungs', value: '12' }, { name: 'Length', value: '6m' }],
    description: 'Agility ladder for footwork drills; like-new demo unit.',
  },
  {
    name: `${MARKER} Adjustable Dumbbell 20kg`, category: 'Fitness Equipment', sport: 'gym', brand: 'Nike',
    gender: 'unisex', condition: 'used', price: 120.00, discountedPrice: 95.00, quantity: 6,
    tags: ['professional', 'eco'],
    variants: [],
    specs: [{ name: 'Range', value: '2-20kg' }, { name: 'Increment', value: '2kg' }],
    description: 'Space-saving adjustable dumbbell; used condition with minor surface wear.',
  },
  {
    name: `${MARKER} Yoga Mat 6mm`, category: 'Fitness Equipment', sport: 'gym', brand: 'Mizuno',
    gender: 'unisex', condition: 'new', price: 24.00, discountedPrice: 19.00, quantity: 26,
    tags: ['eco', 'indoor'],
    variants: [],
    specs: [{ name: 'Thickness', value: '6mm' }, { name: 'Material', value: 'TPE' }],
    description: 'Non-slip eco yoga mat with alignment lines and carry strap.',
  },
  {
    name: `${MARKER} Resistance Band Set`, category: 'Fitness Equipment', sport: 'gym', brand: 'Babolat',
    gender: 'unisex', condition: 'new', price: 14.00, discountedPrice: null, quantity: 70,
    tags: ['lightweight', 'eco', 'beginner'],
    variants: [],
    specs: [{ name: 'Levels', value: '3' }, { name: 'Max Resistance', value: '25kg' }],
    description: 'Set of three latex resistance bands with handles for home training.',
  },
  {
    name: `${MARKER} Football Socks (2pk)`, category: 'Accessories', sport: 'football', brand: 'Puma',
    gender: 'male', condition: 'new', price: 12.00, discountedPrice: null, quantity: 4,
    tags: ['anti_microbial', 'compression'],
    variants: [],
    specs: [{ name: 'Pack', value: '2 pairs' }],
    description: 'Cushioned football socks with shin-guard pocket — very low stock.',
  },
  {
    name: `${MARKER} Hydration Pack 2L`, category: 'Hydration', sport: 'gym', brand: 'Decathlon',
    gender: 'unisex', condition: 'new', price: 32.00, discountedPrice: null, quantity: 15,
    tags: ['outdoor', 'waterproof'],
    variants: [],
    specs: [{ name: 'Capacity', value: '2L' }, { name: 'Tube', value: 'Insulated' }],
    description: 'Hands-free hydration backpack for long training sessions.',
  },

  // Shop 5 — Mixed & multi-sport
  {
    name: `${MARKER} Multi-Sport Training Shirt`, category: 'Gym Apparel', sport: 'gym', brand: 'Adidas',
    gender: 'unisex', condition: 'new', price: 30.00, discountedPrice: 24.00, quantity: 28,
    tags: ['quick_dry', 'uv', 'unisex'],
    variants: [{ sku: 'ADS-MTS-S', variantName: 'S', variantType: 'Size', priceAdjustment: 0, quantity: 10, sortOrder: 1 }, { sku: 'ADS-MTS-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 10, sortOrder: 2 }, { sku: 'ADS-MTS-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 8, sortOrder: 3 }],
    specs: [{ name: 'Material', value: 'Recycled polyester' }],
    description: 'Versatile unisex training shirt made from recycled materials with UV protection.',
  },
  {
    name: `${MARKER} Padel Starter Combo (Racket + 3 balls)`, category: 'Rackets', sport: 'padel', brand: 'Decathlon',
    gender: 'unisex', condition: 'new', price: 79.00, discountedPrice: 69.00, quantity: 20,
    tags: ['beginner', 'best_seller'],
    variants: [],
    specs: [{ name: 'Includes', value: 'Racket + 3 balls' }],
    description: 'Everything a beginner needs to start playing padel, bundled at a great price.',
  },
  {
    name: `${MARKER} Kids\' Court Shoes`, category: 'Court Shoes', sport: 'tennis', brand: 'Asics',
    gender: 'unisex', condition: 'new', price: 55.00, discountedPrice: 44.00, quantity: 17,
    tags: ['beginner', 'lightweight'],
    variants: [{ sku: 'ASC-KCS-33', variantName: 'EU 33', variantType: 'Size', priceAdjustment: 0, quantity: 8, sortOrder: 1 }, { sku: 'ASC-KCS-34', variantName: 'EU 34', variantType: 'Size', priceAdjustment: 0, quantity: 5, sortOrder: 2 }, { sku: 'ASC-KCS-35', variantName: 'EU 35', variantType: 'Size', priceAdjustment: 0, quantity: 4, sortOrder: 3 }],
    specs: [{ name: 'Upper', value: 'Synthetic' }],
    description: 'Durable kids\' court shoes for junior players, easy to slip on and off.',
  },
  {
    name: `${MARKER} Gym Gloves`, category: 'Accessories', sport: 'gym', brand: 'Nike',
    gender: 'male', condition: 'new', price: 20.00, discountedPrice: null, quantity: 38,
    tags: ['anti_microbial', 'shock'],
    variants: [{ sku: 'NKE-GG-M', variantName: 'M', variantType: 'Size', priceAdjustment: 0, quantity: 20, sortOrder: 1 }, { sku: 'NKE-GG-L', variantName: 'L', variantType: 'Size', priceAdjustment: 0, quantity: 18, sortOrder: 2 }],
    specs: [{ name: 'Padding', value: 'Gel' }],
    description: 'Ventilated gym gloves with gel padding to protect palms during lifts.',
  },
  {
    name: `${MARKER} Lightweight Running Shorts`, category: 'Gym Apparel', sport: 'gym', brand: 'Puma',
    gender: 'female', condition: 'new', price: 25.00, discountedPrice: null, quantity: 21,
    tags: ['breathable', 'quick_dry', 'reflective'],
    variants: [],
    specs: [{ name: 'Length', value: '5 inch' }],
    description: 'Featherweight running shorts with reflective details for evening runs.',
  },
  {
    name: `${MARKER} Tennis Sun Cap`, category: 'Accessories', sport: 'tennis', brand: 'Wilson',
    gender: 'unisex', condition: 'like_new', price: 16.00, discountedPrice: null, quantity: 11,
    tags: ['uv', 'outdoor'],
    variants: [],
    specs: [{ name: 'Closure', value: 'Adjustable' }],
    description: 'Moisture-wicking tennis cap with wide brim; like-new display unit.',
  },
  {
    name: `${MARKER} Match Badminton Racket`, category: 'Rackets', sport: 'tennis', brand: 'Yonex',
    gender: 'unisex', condition: 'new', price: 95.00, discountedPrice: 85.00, quantity: 13,
    tags: ['professional', 'lightweight'],
    variants: [{ sku: 'YNX-MBR-4U', variantName: '4U (83g)', variantType: 'Weight', priceAdjustment: 0, quantity: 7, sortOrder: 1 }, { sku: 'YNX-MBR-5U', variantName: '5U (80g)', variantType: 'Weight', priceAdjustment: 0, quantity: 6, sortOrder: 2 }],
    specs: [{ name: 'Flex', value: 'Stiff' }],
    description: 'Tournament badminton racket with aerodynamic frame for rapid swing speed.',
  },
  {
    name: `${MARKER} Sports Towel (Microfibre)`, category: 'Accessories', sport: 'gym', brand: 'Decathlon',
    gender: 'unisex', condition: 'new', price: 9.50, discountedPrice: null, quantity: 64,
    tags: ['quick_dry', 'eco'],
    variants: [],
    specs: [{ name: 'Size', value: '100x50cm' }],
    description: 'Ultra-absorbent microfibre sports towel that dries in seconds.',
  },
  {
    name: `${MARKER} Insulated Protein Shaker`, category: 'Hydration', sport: 'gym', brand: 'Mizuno',
    gender: 'unisex', condition: 'new', price: 13.00, discountedPrice: 10.50, quantity: 42,
    tags: ['eco', 'new_arrival'],
    variants: [],
    specs: [{ name: 'Capacity', value: '700ml' }],
    description: 'Insulated shaker bottle with mixer ball and leak-proof lid.',
  },
  {
    name: `${MARKER} Heart Rate Monitor Strap`, category: 'Fitness Equipment', sport: 'gym', brand: 'Babolat',
    gender: 'unisex', condition: 'used', price: 49.00, discountedPrice: 39.00, quantity: 2,
    tags: ['professional', 'water_resistant'],
    variants: [],
    specs: [{ name: 'Bluetooth', value: '5.0' }],
    description: 'Chest-strap heart rate monitor, used condition, fully functional.',
  },
];

// ── Image generation (existing seed-marketplace-images pattern) ──
const CATEGORY_STYLES = {
  default:    { bg: '#1a1a2e', accent: '#e94560', shape: 'circle' },
  rackets:    { bg: '#0f3460', accent: '#e94560', shape: 'diamond' },
  balls:      { bg: '#16213e', accent: '#f5a623', shape: 'circle' },
  shoes:      { bg: '#2d3436', accent: '#00cec9', shape: 'triangle' },
  bags:       { bg: '#2c3e50', accent: '#e74c3c', shape: 'square' },
  apparel:    { bg: '#1e272e', accent: '#ff6b6b', shape: 'diamond' },
  accessories:{ bg: '#2f3640', accent: '#fbc531', shape: 'circle' },
  equipment:  { bg: '#192a56', accent: '#00a8ff', shape: 'diamond' },
  hydration:  { bg: '#1e3799', accent: '#78e08f', shape: 'triangle' },
};

function pickStyle(productName, categoryName) {
  const n = (productName + ' ' + (categoryName || '')).toLowerCase();
  if (n.includes('racket')) return CATEGORY_STYLES.rackets;
  if (n.includes('ball') || n.includes('shuttle')) return CATEGORY_STYLES.balls;
  if (n.includes('shoe') || n.includes('boot')) return CATEGORY_STYLES.shoes;
  if (n.includes('bag') || n.includes('backpack')) return CATEGORY_STYLES.bags;
  if (n.includes('shirt') || n.includes('short') || n.includes('dress') || n.includes('jersey')) return CATEGORY_STYLES.apparel;
  if (n.includes('grip') || n.includes('cap') || n.includes('sock') || n.includes('towel') || n.includes('guard')) return CATEGORY_STYLES.accessories;
  if (n.includes('machine') || n.includes('dumbbell') || n.includes('ladder') || n.includes('mat') || n.includes('band') || n.includes('monitor')) return CATEGORY_STYLES.equipment;
  if (n.includes('drink') || n.includes('bottle') || n.includes('shaker') || n.includes('pack')) return CATEGORY_STYLES.hydration;
  return CATEGORY_STYLES.default;
}

async function generateImage(productName, categoryName, index) {
  const style = pickStyle(productName, categoryName);
  const size = 800;
  const svgGradient = `<svg width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${style.accent}44"/>
      <stop offset="100%" style="stop-color:${style.bg}"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>`;
  const gradientBuf = await sharp(Buffer.from(svgGradient)).resize(size, size).png().toBuffer();
  const words = productName.split(' ').filter(w => w !== MARKER).slice(0, 4);
  const line1 = words.slice(0, 2).join(' ');
  const line2 = words.slice(2, 4).join(' ');
  const label = ['Front', 'Side', 'Detail'][index % 3];
  const svgText = `<svg width="${size}" height="${size}">
    <style>
      .title { font-family: Arial, Helvetica, sans-serif; font-size: 48px; font-weight: bold; fill: white; text-anchor: middle; }
      .sub { font-family: Arial, Helvetica, sans-serif; font-size: 26px; fill: ${style.accent}; text-anchor: middle; }
      .label { font-family: Arial, Helvetica, sans-serif; font-size: 20px; fill: rgba(255,255,255,0.4); text-anchor: middle; }
    </style>
    <text x="${size/2}" y="${size/2 - 30}" class="title">${line1}</text>
    ${line2 ? `<text x="${size/2}" y="${size/2 + 30}" class="title">${line2}</text>` : ''}
    <text x="${size/2}" y="${size/2 + 80}" class="sub">CourtZon Marketplace</text>
    <text x="${size/2}" y="${size - 40}" class="label">${label} View</text>
  </svg>`;
  const textBuf = await sharp(Buffer.from(svgText)).resize(size, size).png().toBuffer();
  return sharp(gradientBuf).composite([{ input: textBuf, top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer();
}

// ── Helpers ──
async function db() {
  return mysql.createPool(DB);
}

function getCategoryId(catName) {
  return CATEGORIES.find((c) => c.name === catName)?.slug;
}

// ── Main ──
const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const pool = await db();
  const admin = await loginAdmin(pool);
  if (!admin) throw new Error('Admin login failed');

  // 1. Create realistic categories + brands via admin API (idempotent)
  const catIds = await ensureCategories(admin, pool);
  const brandIds = await ensureBrands(admin, pool);

  // 2. Create shops via register-seller (free plan -> auto-approved)
  const shops = [];
  for (const s of SHOPS) {
    const shop = await ensureShop(pool, s);
    shops.push(shop);
  }

  // 3. Create 40 products via POST /marketplace/products
  const products = await seedProducts(pool, shops, catIds, brandIds);

  // 4. Approval/visibility mix via existing admin + seller APIs
  await applyApprovalMix(pool, admin, shops, products);

  await pool.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== SEED SUMMARY: ${results.length - failed.length}/${results.length} checks passed ====`);
  if (failed.length) {
    for (const f of failed) console.log('  FAIL:', f.step, f.detail);
    process.exit(1);
  }
}

async function loginAdmin(pool) {
  // Resolve the platform super_admin from the DB (works on live + local).
  const [rows] = await pool.execute(
    `SELECT u.id, u.phone_number FROM users u
     JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
     JOIN roles r ON r.id = ur.role_id
     WHERE r.slug = 'super_admin' AND u.deleted_at IS NULL
     ORDER BY u.id LIMIT 1`
  );
  if (!rows.length) return null;
  const admin = rows[0];
  const res = await api('POST', '/auth/login', { body: { phoneNumber: admin.phone_number, countryCode: '+20', password: SEED_PASSWORD } });
  const cookies = cookiesFrom(res);
  record('admin login', res.status === 200, `status=${res.status} user=${admin.id}`);
  return cookies;
}

async function ensureCategories(adminCookies, pool) {
  const map = {};
  // Prefer resolving from the live DB (existing reference data) — no duplicates.
  const [rows] = await pool.execute(
    `SELECT id, name, slug FROM product_categories WHERE is_active = 1`
  );
  const byName = new Map((rows || []).map((r) => [r.name.toLowerCase(), r.id]));
  const bySlug = new Map((rows || []).map((r) => [r.slug, r.id]));
  for (const c of CATEGORIES) {
    const resolved = byName.get(c.name.toLowerCase()) || bySlug.get(c.slug)
      || (c.useName ? byName.get(c.useName.toLowerCase()) : null) || bySlug.get('bags');
    if (resolved) {
      map[c.name] = resolved;
      record(`category ${c.name}`, true, `reused id=${resolved}`);
      continue;
    }
    const res = await api('POST', '/admin/product-categories', { cookies: adminCookies, body: { name: c.name, slug: c.slug, description: 'TEST/MARKETPLACE-SEED reference category', sortOrder: 1 } });
    const id = res.body?.id || res.body?.categoryId || null;
    map[c.name] = id;
    record(`category ${c.name}`, res.status === 201 || res.status === 200, `status=${res.status} id=${id}`);
  }
  return map;
}

async function ensureBrands(adminCookies, pool) {
  const map = {};
  const [rows] = await pool.execute(`SELECT id, name FROM brands`);
  const byName = new Map((rows || []).map((r) => [r.name.toLowerCase(), r.id]));
  for (const name of BRANDS) {
    const existing = byName.get(name.toLowerCase());
    if (existing) { map[name] = existing; continue; }
    const res = await api('POST', '/admin/brands', { cookies: adminCookies, body: { name, slug: name.toLowerCase(), description: 'TEST/MARKETPLACE-SEED brand', sortOrder: 1 } });
    map[name] = res.body?.id || null;
  }
  record('brands ready', Object.keys(map).length === BRANDS.length, `${Object.keys(map).length}/${BRANDS.length}`);
  return map;
}

async function ensureShop(pool, def) {
  // Existing shop? Match by name (works on live DB where Shop 1/2/3/5 exist)
  const [existing] = await pool.execute(
    `SELECT o.id, o.owner_id FROM organisations o WHERE o.name = ? AND o.org_type_id = 10 AND o.deleted_at IS NULL LIMIT 1`,
    [def.name]
  );
  if (existing.length) {
    const [u] = await pool.execute(`SELECT id, phone_number, email FROM users WHERE id = ? LIMIT 1`, [existing[0].owner_id]);
    record(`shop ${def.name}`, true, `reused id=${existing[0].id} owner=${u[0]?.id}`);
    const owner = { ...def, phone: u[0]?.phone_number || def.phone, email: u[0]?.email || def.email };
    return { id: existing[0].id, name: def.name, owner };
  }
  // Otherwise register via the app flow (local/test DB where shops are missing)
  const res = await api('POST', '/auth/register-seller', { body: {
    countryId: 1, countryCode: '+20', phoneNumber: def.phone, password: 'Test123456!',
    fullName: def.fullName, email: def.email, gender: 'male', timezone: 'UTC',
    shopName: def.name, planId: 5, billingCycle: 'monthly',
  } });
  const cookies = cookiesFrom(res);
  const [rows] = await pool.execute(`SELECT id FROM organisations WHERE name = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, [def.name]);
  const orgId = rows[0]?.id || null;
  record(`shop ${def.name}`, res.status === 201 && !!orgId, `status=${res.status} orgId=${orgId}`);
  return { id: orgId, name: def.name, owner: def, cookies };
}

async function seedProducts(pool, shops, catIds, brandIds) {
  const created = [];
  for (let shopIdx = 0; shopIdx < shops.length; shopIdx++) {
    const shop = shops[shopIdx];
    if (!shop.id) { record(`products for ${shop.name}`, false, 'no shop id'); continue; }
    const cookies = shop.cookies || await loginShopOwner(pool, shop.owner);
    const startIdx = shopIdx * 10;
    const blueprints = PRODUCT_SET.slice(startIdx, startIdx + 10);
    for (const bp of blueprints) {
      const pid = await createOneProduct(pool, shop, cookies, bp, catIds, brandIds);
      if (pid) created.push({ shopId: shop.id, shopName: shop.name, productId: pid, name: bp.name });
    }
  }
  return created;
}

async function loginShopOwner(pool, def) {
  const res = await api('POST', '/auth/login', { body: { phoneNumber: def.phone, countryCode: '+20', password: SEED_PASSWORD } });
  return cookiesFrom(res);
}

async function createOneProduct(pool, shop, cookies, bp, catIds, brandIds) {
  const catSlug = getCategoryId(bp.category);
  const categoryId = catIds[bp.category];
  if (!categoryId) { record(`product ${bp.name}`, false, 'no category'); return; }

  // Idempotency: skip if a product with this exact name + marker exists for this shop
  const [existing] = await pool.execute(
    `SELECT id FROM products WHERE seller_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1`,
    [shop.id, bp.name]
  );
  if (existing.length) {
    const pid = existing[0].id;
    record(`product ${bp.name}`, true, `reused id=${pid}`);
    // Ensure specs + images exist on reuse too (idempotent backfill)
    await ensureSpecs(pool, pid, bp);
    const imageUrls = await ensureImages(pool, pid, shop.id, bp.name, bp.category);
    if (imageUrls.length) {
      await pool.execute(`UPDATE products SET images = ? WHERE id = ?`, [JSON.stringify(imageUrls), pid]);
    }
    return pid;
  }

  const tagIds = bp.tags.map((t) => TAG_IDS[t]).filter(Boolean);
  const body = {
    categoryId,
    sportId: bp.sport ? SPORT_IDS[bp.sport] : undefined,
    branchId: undefined, // falls back to shop's main branch
    name: bp.name,
    description: bp.description,
    price: bp.price,
    currencyCode: 'EGP',
    quantity: bp.quantity,
    gender: bp.gender,
    condition: bp.condition,
    tagIds,
    variants: bp.variants.map((v) => ({ sku: v.sku, variantName: v.variantName, variantType: v.variantType, priceAdjustment: v.priceAdjustment, quantity: v.quantity, sortOrder: v.sortOrder, variantColor: v.variantColor })),
    metadata: { seed: MARKER },
  };
  // Only include optional fields when actually provided (null breaks zod).
  if (bp.discountedPrice != null) body.discountedPrice = bp.discountedPrice;
  if (brandIds[bp.brand]) body.brandId = brandIds[bp.brand];

  const res = await api('POST', '/marketplace/products', { cookies, body });
  const pid = res.body?.id || res.body?.productId || (res.body?.data && res.body.data.id) || null;
  if (!pid || res.status >= 400) {
    record(`create ${bp.name}`, false, `status=${res.status} msg=${res.body?.message || res.body?.error || ''}`);
    return;
  }
  record(`create ${bp.name}`, true, `id=${pid} status=${res.status}`);

  // Images: generate + persist via uploads + product_images + products.images
  const imageUrls = await persistImages(pool, pid, shop.id, bp.name, bp.category);
  if (imageUrls.length) {
    await pool.execute(`UPDATE products SET images = ? WHERE id = ?`, [JSON.stringify(imageUrls), pid]);
    record(`images for ${bp.name}`, true, `${imageUrls.length} images`);
  }

  // Specifications: the create API does not accept a specs field (specs are a
  // read-only product detail, surfaced by getProduct from product_specifications).
  // Persist via the app's supported storage table — idempotent per product.
  await ensureSpecs(pool, pid, bp);

  return pid;
}

/** Write product_specifications rows (idempotent). */
async function ensureSpecs(pool, pid, bp) {
  if (!bp.specs?.length) return;
  await pool.execute(`DELETE FROM product_specifications WHERE product_id = ?`, [pid]);
  for (let si = 0; si < bp.specs.length; si++) {
    await pool.execute(
      `INSERT INTO product_specifications (product_id, spec_name, spec_value, sort_order) VALUES (?, ?, ?, ?)`,
      [pid, bp.specs[si].name, bp.specs[si].value, si + 1]
    );
  }
  record(`specs for ${bp.name}`, true, `${bp.specs.length} specs`);
}

/** Ensure at least 3 images exist for the product (idempotent). */
async function ensureImages(pool, pid, sellerId, productName, categoryName) {
  const [existing] = await pool.execute(`SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?`, [pid]);
  if (Number(existing[0]?.n || 0) > 0) {
    const [imgs] = await pool.execute(`SELECT media_url FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 3`, [pid]);
    return (imgs || []).map((r) => r.media_url);
  }
  return persistImages(pool, pid, sellerId, productName, categoryName);
}

/**
 * Apply a realistic approval/visibility mix via the EXISTING admin status API
 * and seller visibility API. Never bypasses approval: visibility-hide is only
 * applied to products that are Active (the API enforces that).
 */
async function applyApprovalMix(pool, adminCookies, shops, products) {
  // Deterministic distribution by position: 24 active, 8 archived, 8 pending.
  // Every 5th product stays pending; products at index % 5 === 2 become archived.
  const statusPlan = products.map((p, i) => {
    const pos = i % 5;
    if (pos === 4) return 'pending';      // stays pending
    if (pos === 3) return 'archived';     // rejected-like (archived)
    return 'active';                       // approved
  });

  // Hide ~4 active products via seller visibility API (independent of approval).
  const hidePlan = products.map((_, i) => i % 10 === 7); // 7th product of each shop (4 total) hidden

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const targetStatus = statusPlan[i];
    const res = await api('PUT', `/marketplace/admin/products/${p.productId}/status`, {
      cookies: adminCookies,
      body: { status: targetStatus },
    });
    record(`status ${p.name} -> ${targetStatus}`, res.status === 200, `status=${res.status}`);
  }

  // Visibility: fetch active products, hide the planned ones (seller owner session).
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!hidePlan[i]) continue;
    const shop = shops.find((s) => s.id === p.shopId);
    const ownerCookies = shop?.cookies || await loginShopOwner(pool, shop.owner);
    const res = await api('PUT', `/marketplace/products/${p.productId}/visibility`, {
      cookies: ownerCookies,
      body: { visible: false },
    });
    record(`hide ${p.name}`, res.status === 200, `status=${res.status}`);
  }
}

async function persistImages(pool, productId, sellerId, productName, categoryName) {
  try {
    // Production pattern: external CDN/placeholder URLs in products.images JSON.
    if (LIVE_MODE) {
      const slug = (productName + '-' + categoryName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return [
        `https://placehold.co/800x800/1a1a2e/e94560?text=${encodeURIComponent(slug.slice(0, 40))}`,
        `https://placehold.co/800x800/0f3460/e3e3e3?text=View+2`,
        `https://placehold.co/800x800/2d3436/00cec9?text=View+3`,
      ];
    }
    const dir = `marketplace/${sellerId}/products/${productId}`;
    const urls = [];
    for (let i = 0; i < 3; i++) {
      const buf = await generateImage(productName, categoryName, i);
      const filename = `${randomUUID()}.jpg`;
      const rel = `${dir}/${filename}`;
      const full = join(UPLOADS_ROOT, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, buf);
      const urlPath = `/uploads/${rel}`;
      await pool.execute(
        `INSERT INTO uploads (public_id, entity_type, entity_id, file_category, original_name, mime_type, file_path, file_size, width, height, processing_status)
         VALUES (?, 'product', ?, 'gallery', ?, 'image/jpeg', ?, ?, 800, 800, 'ready')`,
        [randomUUID(), productId, `demo_${i + 1}.jpg`, urlPath, buf.length]
      );
      await pool.execute(
        `INSERT INTO product_images (product_id, media_url, alt_text, sort_order, is_primary)
         VALUES (?, ?, ?, ?, ?)`,
        [productId, urlPath, `${productName} - View ${i + 1}`, i, i === 0 ? 1 : 0]
      );
      urls.push(urlPath);
    }
    return urls;
  } catch (err) {
    record(`images for ${productName}`, false, err.message);
    return [];
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});