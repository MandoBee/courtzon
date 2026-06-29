// Migrate Shopify CDN product images to local storage
// Downloads external images, saves via upload system, updates products.images + product_images
// Usage: node scripts/migrate-shopify-images.mjs

import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, '..', 'uploads');
const URL_PREFIX = '/uploads';
const DB = { host: 'mysql', port: 3306, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' };

async function downloadImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const pool = mysql.createPool(DB);

  // Find all products with Shopify images
  const [products] = await pool.execute(
    "SELECT id, name, images, seller_id FROM products WHERE images LIKE '%shopify%'"
  );

  console.log(`\n🛒 Products with Shopify images: ${products.length}\n`);

  let downloaded = 0, failed = 0, totalImages = 0;

  for (const product of products) {
    let urls;
    try {
      urls = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      if (!Array.isArray(urls) || urls.length === 0) continue;
    } catch { continue; }

    const localUrls = [];
    const productDir = `products/${product.seller_id}/${product.id}`;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (!url || !url.includes('shopify')) {
        localUrls.push(url); // non-Shopify URL — keep as-is
        continue;
      }

      try {
        console.log(`  ⬇ ${product.name} [${i+1}/${urls.length}]`);
        const buffer = await downloadImage(url);

        // Save to uploads directory
        const filename = `${randomUUID()}.jpg`;
        const relativePath = `${productDir}/${filename}`;
        const fullDir = join(UPLOADS_ROOT, productDir);
        mkdirSync(fullDir, { recursive: true });
        writeFileSync(join(UPLOADS_ROOT, relativePath), buffer);

        const localPath = `${URL_PREFIX}/${relativePath}`;
        localUrls.push(localPath);
        downloaded++;

        // Insert into product_images if not already there
        const [existing] = await pool.execute(
          'SELECT id FROM product_images WHERE product_id = ? AND sort_order = ?',
          [product.id, i]
        );
        if (existing.length === 0) {
          await pool.execute(
            `INSERT INTO product_images (product_id, media_url, alt_text, sort_order, is_primary)
             VALUES (?, ?, ?, ?, ?)`,
            [product.id, localPath, `${product.name} - Image ${i + 1}`, i, i === 0 ? 1 : 0]
          );
        } else {
          await pool.execute(
            'UPDATE product_images SET media_url = ? WHERE id = ?',
            [localPath, existing[0].id]
          );
        }

        totalImages++;
      } catch (err) {
        console.error(`    ❌ Failed: ${err.message}`);
        localUrls.push(url); // keep old URL on failure
        failed++;
      }
    }

    // Update the products.images column with local URLs
    await pool.execute(
      'UPDATE products SET images = ? WHERE id = ?',
      [JSON.stringify(localUrls), product.id]
    );

    console.log(`  ✅ ${product.name} → updated\n`);
  }

  // Verify
  const [remaining] = await pool.execute(
    "SELECT COUNT(*) as cnt FROM products WHERE images LIKE '%shopify%'"
  );

  console.log(`═══════════════════════════════════════`);
  console.log(`  Products processed: ${products.length}`);
  console.log(`  Images downloaded:  ${downloaded}`);
  console.log(`  Images failed:      ${failed}`);
  console.log(`  Product_images rows: ${totalImages}`);
  console.log(`  Remaining Shopify URLs: ${remaining[0].cnt}`);
  console.log(`═══════════════════════════════════════\n`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
