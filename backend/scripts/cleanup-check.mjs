import mysql from 'mysql2/promise';

const c = await mysql.createConnection({
  host: 'localhost', port: 3306, user: 'root',
  password: 'CourtZon2026', database: 'courtzon_v2',
});

// Check product_variants columns
const [pvCols] = await c.query("SHOW COLUMNS FROM product_variants");
console.log('product_variants columns:');
for (const col of pvCols) console.log(`  ${col.Field} (${col.Type})`);

// Check product_images columns
const [piCols] = await c.query("SHOW COLUMNS FROM product_images");
console.log('\nproduct_images columns:');
for (const col of piCols) console.log(`  ${col.Field} (${col.Type})`);

// Check what existing products have for images
const [existing] = await c.query(
  'SELECT id, name, images, seller_id, currency_code, price FROM products WHERE seller_id = 6 LIMIT 5'
);
console.log('\nExisting product:', JSON.stringify(existing, null, 2));

// Check existing variants
const [vars] = await c.query('SELECT * FROM product_variants LIMIT 5');
console.log('\nExisting variants sample:', JSON.stringify(vars, null, 2));

await c.end();
