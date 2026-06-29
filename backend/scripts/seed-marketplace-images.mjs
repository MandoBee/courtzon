// CourtZon Marketplace Demo Image Seeder
// Generates professional placeholder product images using Sharp.
// Stores images via the existing upload service and product_images table.
// Usage: node scripts/seed-marketplace-images.mjs

import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, '..', 'uploads');
const URL_PREFIX = '/uploads';

const DB = {
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'courtzon2026',
  database: process.env.DB_NAME || 'courtzon_v3',
};

const DIR_MODE = 0o775;

// ── Category-specific color palettes and shapes ──
const CATEGORY_STYLES = {
  default:    { bg: '#1a1a2e', accent: '#e94560',   shape: 'circle' },
  racket:     { bg: '#0f3460', accent: '#e94560',   shape: 'diamond' },
  balls:      { bg: '#16213e', accent: '#f5a623',   shape: 'circle' },
  shoes:      { bg: '#2d3436', accent: '#00cec9',   shape: 'triangle' },
  bag:        { bg: '#2c3e50', accent: '#e74c3c',   shape: 'square' },
  grips:      { bg: '#34495e', accent: '#2ecc71',   shape: 'line' },
  apparel:    { bg: '#1e272e', accent: '#ff6b6b',   shape: 'diamond' },
  accessories:{ bg: '#2f3640', accent: '#fbc531',   shape: 'circle' },
  equipment:  { bg: '#192a56', accent: '#00a8ff',   shape: 'diamond' },
  nutrition:  { bg: '#1e3799', accent: '#78e08f',   shape: 'triangle' },
};

function pickStyle(productName, categoryName) {
  const name = (productName + ' ' + (categoryName || '')).toLowerCase();
  if (name.includes('racket') || name.includes('padel') || name.includes('tennis')) return CATEGORY_STYLES.racket;
  if (name.includes('ball')) return CATEGORY_STYLES.balls;
  if (name.includes('shoe') || name.includes('sneaker')) return CATEGORY_STYLES.shoes;
  if (name.includes('bag') || name.includes('backpack')) return CATEGORY_STYLES.bag;
  if (name.includes('grip') || name.includes('overgrip')) return CATEGORY_STYLES.grips;
  if (name.includes('shirt') || name.includes('short') || name.includes('hoodie') || name.includes('jacket')) return CATEGORY_STYLES.apparel;
  if (name.includes('wristband') || name.includes('hat') || name.includes('cap') || name.includes('sunglass')) return CATEGORY_STYLES.accessories;
  if (name.includes('machine') || name.includes('trainer') || name.includes('net')) return CATEGORY_STYLES.equipment;
  if (name.includes('protein') || name.includes('bar') || name.includes('drink')) return CATEGORY_STYLES.nutrition;
  return CATEGORY_STYLES.default;
}

// ── Generate a professional 800×800 demo image ──
async function generateDemoImage(productName, categoryName, index) {
  const style = pickStyle(productName, categoryName);
  const size = 800;

  // Background gradient overlay
  const bg = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  // Gradient background via SVG
  const svgGradient = `<svg width="${size}" height="${size}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${style.accent}44"/>
        <stop offset="100%" style="stop-color:${style.bg}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>`;

  const gradientBuf = await sharp(Buffer.from(svgGradient)).resize(size, size).png().toBuffer();

  // Product name overlay SVG
  const words = productName.split(' ').slice(0, 4);
  const line1 = words.slice(0, 2).join(' ');
  const line2 = words.slice(2, 4).join(' ');
  const label = ['Front', 'Side', 'Detail'][index % 3];

  const svgText = `<svg width="${size}" height="${size}">
    <style>
      .title { font-family: Arial, Helvetica, sans-serif; font-size: 52px; font-weight: bold; fill: white; text-anchor: middle; }
      .sub { font-family: Arial, Helvetica, sans-serif; font-size: 28px; fill: ${style.accent}; text-anchor: middle; }
      .label { font-family: Arial, Helvetica, sans-serif; font-size: 20px; fill: rgba(255,255,255,0.4); text-anchor: middle; }
    </style>
    <text x="${size/2}" y="${size/2 - 30}" class="title">${line1}</text>
    ${line2 ? `<text x="${size/2}" y="${size/2 + 30}" class="title">${line2}</text>` : ''}
    <text x="${size/2}" y="${size/2 + 80}" class="sub">CourtZon Marketplace</text>
    <text x="${size/2}" y="${size - 40}" class="label">${label} View</text>
  </svg>`;

  const textBuf = await sharp(Buffer.from(svgText)).resize(size, size).png().toBuffer();

  // Composite gradient + text
  const composite = await sharp(gradientBuf)
    .composite([{ input: textBuf, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return composite;
}

// ── Local storage save ──
function saveToDisk(buffer, relativePath) {
  const resolvedBase = join(__dirname, '..', 'uploads');
  const fullPath = join(resolvedBase, relativePath);
  const dir = dirname(fullPath);
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  try { chmodSync(dir, DIR_MODE); } catch {}
  writeFileSync(fullPath, buffer);
  return `${URL_PREFIX}/${relativePath}`;
}

// ── Main ──
async function main() {
  const pool = mysql.createPool(DB);

  // Find products needing images
  const [products] = await pool.execute(
    `SELECT p.id, p.name, p.seller_id, pc.name as category_name
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.deleted_at IS NULL AND p.status = 'active'
       AND (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) = 0
     ORDER BY p.id`
  );

  console.log(`\n📦 Products found: ${products.length}`);
  if (products.length === 0) {
    console.log('✅ All products already have images. Nothing to do.');
    await pool.end();
    return;
  }

  let updated = 0, skipped = 0, totalImages = 0;

  for (const product of products) {
    try {
      const productDir = `marketplace/${product.seller_id}/products/${product.id}`;

      for (let i = 0; i < 3; i++) {
        const imgBuffer = await generateDemoImage(product.name, product.category_name, i);
        const filename = `${randomUUID()}.jpg`;
        const relativePath = `${productDir}/${filename}`;
        const filePath = saveToDisk(imgBuffer, relativePath);

        // Insert into uploads table
        await pool.execute(
          `INSERT INTO uploads (public_id, entity_type, entity_id, file_category, original_name, mime_type, file_path, file_size, width, height, processing_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), 'product', product.id, 'gallery', `demo_${i+1}.jpg`, 'image/jpeg', filePath, imgBuffer.length, 800, 800, 'ready']
        );

        // Insert into product_images
        await pool.execute(
          `INSERT INTO product_images (product_id, media_url, alt_text, sort_order, is_primary)
           VALUES (?, ?, ?, ?, ?)`,
          [product.id, filePath, `${product.name} - View ${i + 1}`, i, i === 0 ? 1 : 0]
        );

        totalImages++;
      }

      updated++;
      console.log(`  ✅ ${product.name} → 3 images added`);
    } catch (err) {
      skipped++;
      console.error(`  ❌ ${product.name}: ${err.message}`);
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Products found:    ${products.length}`);
  console.log(`  Products updated:  ${updated}`);
  console.log(`  Products skipped:  ${skipped}`);
  console.log(`  Images added:      ${totalImages}`);
  console.log(`═══════════════════════════════════════\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
