const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({ host: 'host.docker.internal', port: 3306, user: 'root', password: 'CourtZon2026', database: 'courtzon_v2' });
  
  // Check raw images format
  const [rows] = await conn.query('SELECT id, name, images, condition_status FROM products WHERE seller_id = 18 LIMIT 3');
  for (const p of rows) {
    console.log('---');
    console.log('id:', p.id, 'name:', p.name);
    console.log('images type:', typeof p.images);
    console.log('images:', p.images?.substring(0, 120));
    // If string, try to parse
    try {
      const parsed = typeof p.images === 'string' ? JSON.parse(p.images) : p.images;
      console.log('parsed:', Array.isArray(parsed) ? parsed.length + ' items' : 'not array');
    } catch(e) {
      console.log('parse error:', e.message);
    }
  }
  
  // Check tags format
  console.log('\n=== Tags for product 1000000 ===');
  const [tags] = await conn.query(
    'SELECT t.id, t.name FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = ?',
    [1000000]
  );
  console.log(tags);
  
  // Check variants
  console.log('\n=== Variants for product 1000000 ===');
  const [variants] = await conn.query(
    'SELECT id, variant_name, variant_type, variant_color, price_adjustment, quantity, sku FROM product_variants WHERE product_id = ?',
    [1000000]
  );
  console.log(JSON.stringify(variants, null, 2));
  
  await conn.end();
}
main().catch(e => console.error('Error:', e));
