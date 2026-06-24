import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
]);
function env(key, fallback) { return envFrom(fileEnv, key, fallback); }

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};
const dbName = env('DB_NAME', 'courtzon_v2');

const SELLER_ID = 6;
const SPORT_ID = 22;
const CURRENCY = 'EGP';
const ORG_SLUG = 'padel-edge';

const B = {
  Nike:75, Adidas:76, Puma:77, UnderArmour:78, Wilson:79, Yonex:80,
  Head:81, Babolat:82, Asics:87, Mizuno:88, Decathlon:90, Kipsta:91,
  NewBalance:86, Reebok:85, Bullpadel:142, Nox:143, Siux:144, Penn:146,
  Prince:141, Oakley:138,
};

const products = [
  // ===== RACKETS (cat=7) =====
  { cat:7, name:'Bullpadel Vertex 04 Ctrl', brand:B.Bullpadel, price:7500, desc:'Professional-grade padel racket with carbon fiber frame and advanced vibration control.', gender:'unisex', skill:'professional', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Bullpadel Hack 03', brand:B.Bullpadel, price:8200, desc:'Top-tier padel racket used by world-class players. Multi-layer carbon construction.', gender:'unisex', skill:'professional', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Bullpadel Flow Light', brand:B.Bullpadel, price:4800, desc:'Lightweight padel racket ideal for intermediate players. Excellent maneuverability.', gender:'unisex', skill:'intermediate', material:'Fiberglass/Carbon', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Adidas Metalbone CTRL 3.2', brand:B.Adidas, price:7800, desc:'Ale Galán signature racket. Advanced spin and control with weight customization.', gender:'unisex', skill:'professional', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Adidas Adipower Multiweight', brand:B.Adidas, price:6500, desc:'Versatile padel racket with adjustable weight system. Suitable for all play styles.', gender:'unisex', skill:'intermediate', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Head Zephyr Pro', brand:B.Head, price:6200, desc:'Premium padel racket with Graphene 360+ technology. Optimal balance of power and control.', gender:'unisex', skill:'professional', material:'Graphene/Carbon', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Head Graphene 360+ Alpha Pro', brand:B.Head, price:5500, desc:'High-performance padel racket with enhanced sweet spot. Great for attacking players.', gender:'unisex', skill:'intermediate', material:'Graphene Composite', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Nox ML10 Pro Cup', brand:B.Nox, price:8800, desc:'Miguel Lamperti signature racket. Premium 12K carbon face construction.', gender:'unisex', skill:'professional', material:'12K Carbon', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Nox AT10 Luxury', brand:B.Nox, price:9500, desc:'Agustín Tapia signature racket. The ultimate in power and precision with diamond shape.', gender:'unisex', skill:'professional', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Siux Electra ST2', brand:B.Siux, price:5200, desc:'Stylish and powerful racket with hybrid frame. Ideal for club-level players.', gender:'unisex', skill:'intermediate', material:'Fiberglass/Carbon', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Bullpadel Ionic Pro', brand:B.Bullpadel, price:3800, desc:'Entry-level pro racket with great feel. Perfect for transitioning to advanced play.', gender:'unisex', skill:'beginner', material:'Fiberglass', variants:['Grip S','Grip M','Grip L'] },
  { cat:7, name:'Siux Revolution 4', brand:B.Siux, price:5800, desc:'Aggressive-shaped racket for power players. 100% carbon construction.', gender:'unisex', skill:'intermediate', material:'Carbon Fiber', variants:['Grip S','Grip M','Grip L'] },

  // ===== BALLS (cat=27) =====
  { cat:27, name:'Bullpadel Premium Ball Tube', brand:B.Bullpadel, price:220, desc:'Official WPT match balls. Consistent bounce and durability. 3 balls per tube.', gender:'unisex', skill:'professional', variants:['1 Tube','3-Pack','Box of 12'] },
  { cat:27, name:'Head Padel Pro Balls', brand:B.Head, price:180, desc:'IFT-approved padel balls with excellent durability and consistent bounce.', gender:'unisex', skill:'intermediate', variants:['1 Tube','3-Pack','Box of 12'] },
  { cat:27, name:'Adidas Padel Pro Ball', brand:B.Adidas, price:200, desc:'Tournament-grade padel balls. Optimized felt for longer play.', gender:'unisex', skill:'professional', variants:['1 Tube','3-Pack','Box of 12'] },
  { cat:27, name:'Wilson Padel Ball', brand:B.Wilson, price:150, desc:'Reliable padel training balls. Great value for club play and practice.', gender:'unisex', skill:'beginner', variants:['1 Tube','3-Pack','Box of 12'] },
  { cat:27, name:'Penn Padel Championship Ball', brand:B.Penn, price:175, desc:'Premium padel competition balls. Consistent pressure and felt quality.', gender:'unisex', skill:'intermediate', variants:['1 Tube','3-Pack','Box of 12'] },

  // ===== SHOES (cat=18) =====
  { cat:18, name:'Asics Gel-Padel Pro 5', brand:B.Asics, price:3200, desc:'Purpose-built padel shoe with Gel cushioning and pivot point outsole.', gender:'unisex', skill:'professional', material:'Mesh/Synthetic', variants:['EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46'] },
  { cat:18, name:'Asics Gel-Game 9 Padel', brand:B.Asics, price:2400, desc:'Comfortable padel training shoe with excellent grip for court surfaces.', gender:'unisex', skill:'intermediate', material:'Mesh/Synthetic', variants:['EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46'] },
  { cat:18, name:'Adidas Adizero Ubersonic 4', brand:B.Adidas, price:2900, desc:'Lightweight padel shoe with speed-focused design and Primeknit upper.', gender:'unisex', skill:'professional', material:'Primeknit', variants:['EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46'] },
  { cat:18, name:'Nike Court Air Zoom Vapor Pro', brand:B.Nike, price:3500, desc:'Premium court shoe with Zoom Air cushioning. Excellent for quick direction changes.', gender:'unisex', skill:'professional', material:'Mesh/Synthetic', variants:['EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46'] },
  { cat:18, name:'Head Sprint Pro 3.5', brand:B.Head, price:2700, desc:'Padel-specific shoe with reinforced toe and lateral support. Hybrid outsole.', gender:'unisex', skill:'intermediate', material:'Mesh/Synthetic', variants:['EU 39','EU 40','EU 41','EU 42','EU 43','EU 44','EU 45','EU 46'] },

  // ===== MEN'S APPAREL (cat=11) =====
  { cat:11, name:'Bullpadel Competition Shirt', brand:B.Bullpadel, price:850, desc:'Performance padel shirt with moisture-wicking fabric. Ergonomic fit.', gender:'male', skill:'professional', material:'Polyester/Elastane', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Adidas Padel Training Tee', brand:B.Adidas, price:650, desc:'Breathable training t-shirt with AEROREADY technology.', gender:'male', skill:'intermediate', material:'Polyester', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Head Padel Performance Polo', brand:B.Head, price:950, desc:'Classic padel polo with modern performance fabric. UV protection.', gender:'male', skill:'professional', material:'Pique Knit', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Nike Dri-FIT Padel Shorts', brand:B.Nike, price:750, desc:'Lightweight padel shorts with Dri-FIT technology. Built-in brief.', gender:'male', skill:'intermediate', material:'Polyester', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Bullpadel Padel Shorts Pro', brand:B.Bullpadel, price:700, desc:'Professional padel shorts with stretch fabric and secure zip pocket.', gender:'male', skill:'professional', material:'Polyester/Spandex', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Adidas Padel 3-Stripes Shorts', brand:B.Adidas, price:600, desc:'Classic 3-stripes padel shorts. Lightweight and breathable.', gender:'male', skill:'beginner', material:'Polyester', variants:['S','M','L','XL','XXL'] },
  { cat:11, name:'Under Armour Padel HeatGear Tee', brand:B.UnderArmour, price:800, desc:'Compression-fit base layer with HeatGear technology. Wicks sweat.', gender:'male', skill:'intermediate', material:'Elastane/Polyester', variants:['S','M','L','XL','XXL'] },

  // ===== WOMEN'S APPAREL (cat=12) =====
  { cat:12, name:"Bullpadel Women's Padel Dress", brand:B.Bullpadel, price:1200, desc:'Stylish padel dress with built-in shorts. Lightweight and moisture-wicking.', gender:'female', skill:'professional', material:'Polyester/Spandex', variants:['XS','S','M','L','XL'] },
  { cat:12, name:"Adidas Women's Padel Skirt", brand:B.Adidas, price:850, desc:'Performance padel skirt with built-in shorts. AEROREADY moisture management.', gender:'female', skill:'intermediate', material:'Polyester', variants:['XS','S','M','L','XL'] },
  { cat:12, name:"Head Women's Performance Tank", brand:B.Head, price:700, desc:'Sleeveless padel tank top with racerback design. Maximum range of motion.', gender:'female', skill:'professional', material:'Polyester', variants:['XS','S','M','L','XL'] },
  { cat:12, name:"Nike Women's Dri-FIT Padel Tee", brand:B.Nike, price:650, desc:"Women's padel t-shirt with Dri-FIT technology. Relaxed fit for comfort.", gender:'female', skill:'beginner', material:'Polyester', variants:['XS','S','M','L','XL'] },
  { cat:12, name:"Puma Women's Padel Capri Leggings", brand:B.Puma, price:950, desc:'Capri-length leggings with moisture-wicking fabric. High waistband.', gender:'female', skill:'intermediate', material:'Polyester/Elastane', variants:['XS','S','M','L','XL'] },

  // ===== SOCKS (cat=25) =====
  { cat:25, name:'Bullpadel Performance Socks 3-Pack', brand:B.Bullpadel, price:280, desc:'Cushioned padel socks with arch support. Pack of 3 pairs.', gender:'unisex', skill:'intermediate', material:'Cotton/Polyester', variants:['EU 36-39','EU 40-43','EU 44-47'] },
  { cat:25, name:'Nike Elite Padel Socks', brand:B.Nike, price:320, desc:'Premium crew socks with Dri-FIT moisture management. Strategic cushioning.', gender:'unisex', skill:'professional', material:'Polyester/Cotton', variants:['EU 36-39','EU 40-43','EU 44-47'] },

  // ===== ACCESSORIES =====
  { cat:56, name:'Bullpadel Insulated Water Bottle', brand:B.Bullpadel, price:350, desc:'750ml stainless steel water bottle. Double-wall insulation.', gender:'unisex', skill:'beginner', material:'Stainless Steel', variants:['750ml'] },
  { cat:57, name:'Head Padel Towel', brand:B.Head, price:400, desc:'Large microfiber padel towel. Quick-drying and highly absorbent.', gender:'unisex', skill:'beginner', material:'Microfiber', variants:['40x60cm','60x100cm','80x120cm'] },
  { cat:15, name:'Adidas Padel Overgrip 3-Pack', brand:B.Adidas, price:180, desc:'Super-soft overgrips for padel rackets. Absorbs sweat. Pack of 3.', gender:'unisex', skill:'intermediate', material:'Polyurethane', variants:['White','Black','Blue','Red'] },
  { cat:15, name:'Bullpadel Vibration Dampener Set', brand:B.Bullpadel, price:120, desc:'Silicone vibration dampeners for padel rackets. Set of 4.', gender:'unisex', skill:'beginner', material:'Silicone', variants:['Neon Green','Pink','Orange'] },
  { cat:60, name:'Oakley Padel Sunglasses', brand:B.Oakley, price:1500, desc:'High-performance sports sunglasses with Prizm lens technology.', gender:'unisex', skill:'professional', material:'Plutonite', variants:['Black Frame','Matt Frame','White Frame'] },

  // ===== BAGS =====
  { cat:62, name:'Bullpadel Tour Padel Bag', brand:B.Bullpadel, price:2200, desc:'Large padel bag for 3 rackets. Insulated compartment and shoe pocket.', gender:'unisex', skill:'professional', material:'Polyester', variants:['3-Racket','6-Racket','12-Racket'] },
  { cat:63, name:'Adidas Padel Duffel Bag', brand:B.Adidas, price:1800, desc:'Spacious duffel bag. Separate wet/dry compartments.', gender:'unisex', skill:'intermediate', material:'Polyester', variants:['Small 40L','Medium 60L','Large 80L'] },
  { cat:64, name:'Head Padel Backpack', brand:B.Head, price:1200, desc:'Compact backpack with racket compartment. Fits 2 rackets.', gender:'unisex', skill:'beginner', material:'Polyester', variants:['Black','Blue','Red'] },

  // ===== RACQUET COVERS (cat=66) =====
  { cat:66, name:'Bullpadel Premium Racket Cover', brand:B.Bullpadel, price:550, desc:'Thermal-protective racket cover. Insulated lining.', gender:'unisex', skill:'professional', material:'Neoprene', variants:['Single','Double'] },
  { cat:66, name:'Nox Racket Cover 2025', brand:B.Nox, price:650, desc:'Premium racket cover with carbon-fiber pattern. Full-length zip.', gender:'unisex', skill:'intermediate', material:'Polyester', variants:['Single','Double'] },

  // ===== HATS & CAPS (cat=61) =====
  { cat:61, name:'Bullpadel Padel Cap', brand:B.Bullpadel, price:300, desc:'Performance baseball cap with moisture-wicking sweatband.', gender:'unisex', skill:'beginner', material:'Cotton/Polyester', variants:['Black','White','Navy'] },
  { cat:61, name:'Head Padel Visor', brand:B.Head, price:280, desc:'Open-top visor for maximum ventilation. Terry cloth sweatband.', gender:'unisex', skill:'intermediate', material:'Polyester', variants:['White','Pink'] },

  // ===== HEADBANDS & WRISTBANDS =====
  { cat:58, name:'Bullpadel Padel Headband', brand:B.Bullpadel, price:150, desc:'Moisture-wicking headband with silicone grip.', gender:'unisex', skill:'beginner', material:'Polyester/Silicone', variants:['White','Black','Navy'] },
  { cat:59, name:'Adidas Padel Wristband Set', brand:B.Adidas, price:180, desc:'Terry cloth wristbands for sweat management. Set of 2.', gender:'unisex', skill:'intermediate', material:'Cotton/Polyester', variants:['White','Black'] },

  // ===== PROTECTIVE GEAR =====
  { cat:52, name:'Bullpadel Knee Pads', brand:B.Bullpadel, price:450, desc:'Lightweight knee pads for padel players. EVA foam padding.', gender:'unisex', skill:'professional', material:'EVA Foam/Neoprene', variants:['S','M','L'] },
];

async function main() {
  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  await conn.query(`USE \`${dbName}\``);

  let count = 0;
  for (const p of products) {
    const key = p.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
    const images = JSON.stringify([`https://placehold.co/600x600/EEE/31343C?text=${encodeURIComponent(key)}`]);
    const discounted = p.price > 1000 ? Math.round(p.price * (0.80 + Math.random() * 0.15)) : null;

    // Insert product
    const [result] = await conn.execute(
      `INSERT INTO products (seller_id, seller_type, category_id, brand_id, sport_id, name, description, price, discounted_price, currency_code, quantity, status, gender, age_group, skill_level, material, images, is_active, rating_avg, rating_count, sales_count)
       VALUES (?, 'org', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'adult', ?, ?, ?, 1, ROUND(RAND() * 2 + 3, 2), FLOOR(RAND() * 100) + 5, FLOOR(RAND() * 80) + 5)`,
      [SELLER_ID, p.cat, p.brand || null, SPORT_ID, p.name,
        p.desc, p.price, discounted, CURRENCY,
        Math.floor(Math.random() * 100) + 50 + (p.cat === 27 ? 500 : 0),
        p.gender || 'unisex', p.skill || 'intermediate', p.material || null, images]
    );
    const productId = result.insertId;
    count++;

    // Insert product_images
    const imgUrl = `https://placehold.co/600x600/EEE/31343C?text=${encodeURIComponent(key)}`;
    await conn.execute(
      `INSERT INTO product_images (product_id, media_url, alt_text, sort_order, is_primary) VALUES (?, ?, ?, 0, 1), (?, ?, ?, 1, 0)`,
      [productId, imgUrl, p.name, productId, imgUrl, `${p.name} - Side`]
    );

    // Insert variants
    if (p.variants) {
      for (let vi = 0; vi < p.variants.length; vi++) {
        const v = p.variants[vi];
        const varType =
          p.cat === 7 ? 'grip_size' :
          p.cat === 27 ? 'pack_size' :
          p.cat === 18 ? 'size' :
          p.cat === 11 || p.cat === 12 ? 'size' :
          p.cat === 25 ? 'size' :
          p.cat === 52 ? 'size' :
          p.cat === 56 ? 'capacity' :
          p.cat === 57 ? 'size' :
          p.cat === 15 && p.brand === B.Adidas && v.match(/^(White|Black|Blue|Red)$/) ? 'color' :
          p.cat === 15 && p.brand === B.Bullpadel ? 'color' :
          p.cat === 60 ? 'color' :
          p.cat === 62 || p.cat === 63 ? 'capacity' :
          p.cat === 64 || p.cat === 66 ? 'size' :
          p.cat === 61 || p.cat === 58 || p.cat === 59 ? 'color' :
          'other';
        const isColor = varType === 'color';
        const varQty = Math.floor(Math.random() * 40) + 5;
        await conn.execute(
          `INSERT INTO product_variants (product_id, variant_name, variant_type, variant_color, price_adjustment, quantity, sort_order, is_active, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [productId, v, varType, isColor ? (v === 'White' ? '#FFFFFF' : v === 'Black' ? '#000000' : v === 'Navy' ? '#000080' : v === 'Blue' ? '#0000FF' : v === 'Red' ? '#FF0000' : v === 'Pink' ? '#FFC0CB' : v === 'Neon Green' ? '#39FF14' : v === 'Orange' ? '#FFA500' : v === 'Matt Frame' ? '#555555' : v === 'Black Frame' ? '#000000' : v === 'White Frame' ? '#EEEEEE' : null) : null,
          0, varQty, vi, vi === 0 ? 1 : 0]
        );
      }
    }

    console.log(`  [${count}/50] ${p.name} — EGP ${p.price} (${(p.variants || []).length} variants)`);
  }

  // Verify
  const [verification] = await conn.query(
    'SELECT COUNT(*) as total FROM products WHERE seller_id = ?', [SELLER_ID]
  );
  const [varCount] = await conn.query(
    'SELECT COUNT(*) as total FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.seller_id = ?', [SELLER_ID]
  );
  const [imgCount] = await conn.query(
    'SELECT COUNT(*) as total FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE p.seller_id = ?', [SELLER_ID]
  );
  console.log(`\n✓ Done! ${verification[0].total} products, ${varCount[0].total} variants, ${imgCount[0].total} images for Padel Edge.`);
  await conn.end();
}

main().catch(console.error);
