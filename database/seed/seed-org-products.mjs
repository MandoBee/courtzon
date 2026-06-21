import mysql from 'mysql2/promise';

const DB = { host: 'host.docker.internal', port: 3306, user: 'root', password: 'CourtZon2026', database: 'courtzon_v2' };

const products = [
  { name: 'Nike Phantom GX Elite FG', cat: 9, brand: 75, sport: 19, price: 249.99, disc: 199.99, qty: 50, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Elite-level football boot with Gripknit technology for superior ball control on firm ground.', tags: [32, 39, 29], variants: [{ n: 'UK 7', t: 'size' }, { n: 'UK 8', t: 'size' }, { n: 'UK 9', t: 'size' }, { n: 'UK 10', t: 'size' }, { n: 'UK 11', t: 'size' }] },
  { name: 'Adidas Predator Accuracy.1', cat: 9, brand: 76, sport: 19, price: 229.99, disc: 179.99, qty: 40, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Precision-engineered football boot with Strikeskin technology for powerful, accurate shots.', tags: [32, 38, 39], variants: [{ n: 'UK 7', t: 'size' }, { n: 'UK 8', t: 'size' }, { n: 'UK 9', t: 'size' }, { n: 'UK 10', t: 'size' }] },
  { name: 'Puma Future 7 Ultimate', cat: 9, brand: 77, sport: 19, price: 219.99, disc: null, qty: 35, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Adaptable football boot with FUZIONFIT+ technology for personalized fit and agility.', tags: [38, 29, 32], variants: [{ n: 'UK 7', t: 'size' }, { n: 'UK 8', t: 'size' }, { n: 'UK 9', t: 'size' }, { n: 'UK 10', t: 'size' }] },
  { name: 'Nike Strike Elite Match Ball', cat: 27, brand: 75, sport: 19, price: 149.99, disc: 119.99, qty: 100, cond: 'new', gender: 'unisex', age: 'adult', desc: 'FIFA Quality Pro match ball with 12-panel aerodynamic design for true flight.', tags: [32, 34, 39], variants: [{ n: 'Size 5', t: 'size' }, { n: 'Size 4', t: 'size' }, { n: 'Size 3', t: 'size' }] },
  { name: 'Adidas UCL Pro Match Ball', cat: 27, brand: 76, sport: 19, price: 159.99, disc: null, qty: 80, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Official UEFA Champions League match ball with seamless thermal bonding.', tags: [32, 34, 37], variants: [{ n: 'Size 5', t: 'size' }, { n: 'Size 4', t: 'size' }] },
  { name: 'Nike Dri-FIT Strike Jersey', cat: 21, brand: 75, sport: 19, price: 89.99, disc: 69.99, qty: 200, cond: 'new', gender: 'male', age: 'adult', desc: 'Moisture-wicking performance jersey with breathable mesh panels.', tags: [28, 29, 31], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }, { n: 'XXL', t: 'size' }] },
  { name: 'Adidas Tiro 23 Competition Shorts', cat: 22, brand: 76, sport: 19, price: 44.99, disc: 34.99, qty: 250, cond: 'new', gender: 'male', age: 'adult', desc: 'Lightweight game-day shorts with AEROREADY moisture management.', tags: [28, 29, 26], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'Puma Teamfinal Jersey', cat: 21, brand: 77, sport: 19, price: 79.99, disc: 59.99, qty: 180, cond: 'new', gender: 'male', age: 'adult', desc: 'Professional replica jersey with dryCELL moisture-wicking fabric.', tags: [28, 29, 31], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'Nike Mercurial Superfly 9 Elite', cat: 9, brand: 75, sport: 19, price: 274.99, disc: 239.99, qty: 30, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Speed-focused football boot with AtomKnit upper and Aerotrak soleplate.', tags: [32, 37, 26], variants: [{ n: 'UK 7', t: 'size' }, { n: 'UK 8', t: 'size' }, { n: 'UK 9', t: 'size' }, { n: 'UK 10', t: 'size' }] },
  { name: 'Adidas Predator Pro Goalkeeper Gloves', cat: 39, brand: 76, sport: 19, price: 129.99, disc: 99.99, qty: 45, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Professional goalkeeper gloves with UR 2.0 latex for maximum grip.', tags: [32, 45], variants: [{ n: '7', t: 'size' }, { n: '8', t: 'size' }, { n: '9', t: 'size' }, { n: '10', t: 'size' }, { n: '11', t: 'size' }] },
  { name: 'Nike LeBron 21', cat: 18, brand: 135, sport: 20, price: 199.99, disc: 169.99, qty: 40, cond: 'new', gender: 'male', age: 'adult', desc: 'LeBron James signature basketball shoe with cushioned Zoom Air support.', tags: [32, 37, 39], variants: [{ n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }, { n: 'US 12', t: 'size' }] },
  { name: 'Spalding TF-1000 Basketball', cat: 27, brand: 96, sport: 20, price: 69.99, disc: 54.99, qty: 120, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Official FIBA-approved indoor/outdoor basketball with premium composite cover.', tags: [34, 32, 39], variants: [{ n: 'Size 7', t: 'size' }, { n: 'Size 6', t: 'size' }, { n: 'Size 5', t: 'size' }] },
  { name: 'Nike Air Jordan 37', cat: 18, brand: 135, sport: 20, price: 184.99, disc: 154.99, qty: 35, cond: 'new', gender: 'male', age: 'adult', desc: 'Latest Air Jordan with Formula 23 foam and herringbone traction pattern.', tags: [32, 37, 38], variants: [{ n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }] },
  { name: 'Wilson Evo NXT Basketball', cat: 27, brand: 79, sport: 20, price: 59.99, disc: null, qty: 90, cond: 'new', gender: 'unisex', age: 'youth', desc: 'Durable indoor/outdoor composite basketball with cushion core technology.', tags: [33, 31], variants: [{ n: 'Size 7', t: 'size' }, { n: 'Size 6', t: 'size' }] },
  { name: 'Nike Dri-FIT NBA Swingman Jersey', cat: 21, brand: 75, sport: 20, price: 109.99, disc: 89.99, qty: 60, cond: 'new', gender: 'male', age: 'adult', desc: 'Authentic NBA jersey with player name and number in moisture-wicking fabric.', tags: [28, 29, 37], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'Wilson US Open Tennis Ball', cat: 27, brand: 79, sport: 21, price: 12.99, disc: 9.99, qty: 500, cond: 'new', gender: 'unisex', age: 'all', desc: 'Official US Open tennis ball with premium felt for consistent performance.', tags: [34, 32, 39], variants: [{ n: '3-Pack', t: 'size' }, { n: 'Can', t: 'size' }] },
  { name: 'Babolat Pure Drive 2024', cat: 28, brand: 82, sport: 21, price: 259.99, disc: 229.99, qty: 25, cond: 'new', gender: 'unisex', age: 'adult', desc: 'The iconic Pure Drive racquet with NF2 Tech and HTR System for power.', tags: [32, 34, 39], variants: [{ n: '4 1/4', t: 'size' }, { n: '4 3/8', t: 'size' }, { n: '4 1/2', t: 'size' }] },
  { name: 'Head Radical MP 2024', cat: 28, brand: 81, sport: 21, price: 269.99, disc: 239.99, qty: 20, cond: 'new', gender: 'unisex', age: 'adult', desc: 'The new Radical MP with Graphene 360+ technology for optimized energy transfer.', tags: [32, 34, 37], variants: [{ n: '4 1/4', t: 'size' }, { n: '4 3/8', t: 'size' }, { n: '4 1/2', t: 'size' }] },
  { name: 'Yonex Ezone 100', cat: 28, brand: 80, sport: 21, price: 249.99, disc: 219.99, qty: 22, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Yonex Ezone 100 with 2G-Namd SPEED technology for explosive power.', tags: [32, 34, 39], variants: [{ n: '4 1/4', t: 'size' }, { n: '4 3/8', t: 'size' }, { n: '4 1/2', t: 'size' }] },
  { name: 'NikeCourt Dri-FIT Advantage Jersey', cat: 11, brand: 75, sport: 21, price: 74.99, disc: 59.99, qty: 150, cond: 'new', gender: 'male', age: 'adult', desc: 'Moisture-wicking tennis jersey with mesh back panel for ventilation.', tags: [28, 29, 43], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'Nike Vaporfly 3', cat: 18, brand: 75, sport: 25, price: 259.99, disc: 224.99, qty: 30, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Elite marathon racing shoe with ZoomX foam and carbon fiber plate.', tags: [32, 26, 39], variants: [{ n: 'US 7', t: 'size' }, { n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }] },
  { name: 'Asics Gel-Nimbus 25', cat: 18, brand: 87, sport: 25, price: 199.99, disc: 169.99, qty: 45, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium cushioned running shoe with PureGEL technology and FF BLAST PLUS ECO foam.', tags: [45, 39, 46], variants: [{ n: 'US 7', t: 'size' }, { n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }, { n: 'US 12', t: 'size' }] },
  { name: 'New Balance Fresh Foam 1080v13', cat: 18, brand: 86, sport: 25, price: 189.99, disc: 149.99, qty: 40, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Plush-cushioned daily trainer with Fresh Foam X midsole for a soft ride.', tags: [39, 28, 45], variants: [{ n: 'US 7', t: 'size' }, { n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }] },
  { name: 'Under Armour HeatGear Top', cat: 26, brand: 78, sport: 25, price: 34.99, disc: 27.99, qty: 300, cond: 'new', gender: 'male', age: 'adult', desc: 'Compression base layer with HeatGear fabric wicks sweat and keeps you cool.', tags: [28, 29, 41], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }, { n: 'XXL', t: 'size' }] },
  { name: 'Nike Dri-FIT Trail Cap', cat: 61, brand: 75, sport: 25, price: 27.99, disc: 22.99, qty: 200, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Lightweight running cap with Dri-FIT moisture management and reflective elements.', tags: [28, 29, 42], variants: [{ n: 'One Size', t: 'size' }] },
  { name: 'Rogue Ohio Barbell', cat: 14, brand: 130, sport: 26, price: 349.99, disc: 299.99, qty: 15, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium 190,000 PSI tensile strength steel barbell with dual knurl marks.', tags: [32, 39], variants: [] },
  { name: 'Nike Superrep Go 3', cat: 18, brand: 75, sport: 26, price: 129.99, disc: 99.99, qty: 55, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Versatile training shoe with React foam and flexible grooves for multi-directional movement.', tags: [28, 29, 39], variants: [{ n: 'US 7', t: 'size' }, { n: 'US 8', t: 'size' }, { n: 'US 9', t: 'size' }, { n: 'US 10', t: 'size' }, { n: 'US 11', t: 'size' }] },
  { name: 'TheraBand Resistance Bands Set', cat: 46, brand: 147, sport: 26, price: 24.99, disc: 19.99, qty: 400, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Set of 5 resistance levels from extra light to extra heavy for progressive training.', tags: [33, 36, 46], variants: [{ n: 'Light', t: 'size' }, { n: 'Medium', t: 'size' }, { n: 'Heavy', t: 'size' }, { n: 'X-Heavy', t: 'size' }] },
  { name: 'Liforme Yoga Mat', cat: 45, brand: 109, sport: 29, price: 149.99, disc: 119.99, qty: 60, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium eco-friendly yoga mat with alignment guide system and Warrior-Grip material.', tags: [46, 35, 39], variants: [{ n: 'Standard', t: 'size' }, { n: 'Travel', t: 'size' }] },
  { name: 'Manduka Pro Yoga Mat', cat: 45, brand: 110, sport: 29, price: 134.99, disc: 109.99, qty: 70, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Professional 6mm yoga mat with dense cushioning and closed-cell surface.', tags: [32, 46, 39], variants: [{ n: '6mm', t: 'size' }, { n: '4mm', t: 'size' }] },
  { name: 'Speedo Fastskin LZR Pure Intent', cat: 41, brand: 83, sport: 24, price: 399.99, disc: 349.99, qty: 20, cond: 'new', gender: 'male', age: 'adult', desc: 'Elite racing swimsuit with intelligent compression and water-repellent coating.', tags: [32, 34, 29], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'Arena Carbon Ultra 2', cat: 41, brand: 84, sport: 24, price: 374.99, disc: 329.99, qty: 18, cond: 'new', gender: 'male', age: 'adult', desc: 'Carbon-infused racing suit with extreme hydrodynamics and muscle stabilization.', tags: [32, 34, 26], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }, { n: 'XL', t: 'size' }] },
  { name: 'TYR Tracer-X Goggles', cat: 38, brand: 124, sport: 24, price: 49.99, disc: 39.99, qty: 150, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Competition swimming goggles with mirrored lenses and wide peripheral vision.', tags: [43, 27, 32], variants: [{ n: 'Clear', t: 'size' }, { n: 'Smoke', t: 'size' }, { n: 'Blue Mirror', t: 'size' }] },
  { name: 'Speedo Biofuse 2.0 Goggles', cat: 38, brand: 83, sport: 24, price: 34.99, disc: 27.99, qty: 200, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Comfortable swim goggles with IQ Fit technology and UV protection.', tags: [43, 28, 33], variants: [{ n: 'Clear', t: 'size' }, { n: 'Smoke', t: 'size' }] },
  { name: 'Arena Unisex Swim Cap', cat: 42, brand: 84, sport: 24, price: 9.99, disc: 7.99, qty: 500, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Silicone swim cap with durable non-slip design for competitive training.', tags: [27, 29, 36], variants: [{ n: 'Black', t: 'color', c: '#000000' }, { n: 'White', t: 'color', c: '#FFFFFF' }, { n: 'Blue', t: 'color', c: '#0000FF' }, { n: 'Red', t: 'color', c: '#FF0000' }] },
  { name: 'Giro Aether MIPS Helmet', cat: 37, brand: 102, sport: 27, price: 299.99, disc: 249.99, qty: 25, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium road cycling helmet with MIPS Spherical technology and Roc Loc Air ventilation.', tags: [32, 45, 49], variants: [{ n: 'S', t: 'size' }, { n: 'M', t: 'size' }, { n: 'L', t: 'size' }] },
  { name: 'Shimano PD-R8000 Pedals', cat: 14, brand: 103, sport: 27, price: 149.99, disc: 129.99, qty: 40, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Ultegra-level SPD-SL pedals with carbon composite body and wide platform.', tags: [32, 26, 39], variants: [] },
  { name: 'Oakley Sutro Sunglasses', cat: 60, brand: 138, sport: 27, price: 199.99, disc: 169.99, qty: 80, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Sport performance sunglasses with Prizm lens technology and O-Matter frame.', tags: [43, 49, 42], variants: [{ n: 'Black', t: 'color', c: '#000000' }, { n: 'Matte White', t: 'color', c: '#F5F5F5' }, { n: 'Matte Navy', t: 'color', c: '#000080' }] },
  { name: 'Yonex Nanoflare 800 Pro', cat: 28, brand: 80, sport: 33, price: 239.99, disc: 209.99, qty: 18, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Head-light badminton racquet with Sonic Flare system for explosive smashes.', tags: [32, 34, 26], variants: [{ n: '4U', t: 'size' }, { n: '3U', t: 'size' }] },
  { name: 'Yonex Aerosensa 30 Shuttlecocks', cat: 49, brand: 80, sport: 33, price: 29.99, disc: 24.99, qty: 300, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium goose feather shuttlecocks with consistent flight for tournament play.', tags: [32, 34, 39], variants: [{ n: 'Tube of 12', t: 'size' }] },
  { name: 'Li-Ning Turbo Charging 75', cat: 28, brand: 89, sport: 33, price: 219.99, disc: 189.99, qty: 15, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Stiff badminton racquet with TB Nano technology for powerful clears.', tags: [32, 34, 38], variants: [{ n: '4U', t: 'size' }, { n: '5U', t: 'size' }] },
  { name: 'Everlast Pro Style Boxing Gloves', cat: 39, brand: 97, sport: 34, price: 79.99, disc: 64.99, qty: 100, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Professional training gloves with EverFresh antibacterial lining and multi-layer foam.', tags: [32, 45, 39], variants: [{ n: '12 oz', t: 'size' }, { n: '14 oz', t: 'size' }, { n: '16 oz', t: 'size' }] },
  { name: 'Venum Challenger 2.0 Boxing Gloves', cat: 39, brand: 98, sport: 34, price: 69.99, disc: 54.99, qty: 120, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Versatile training gloves with injected foam padding and ergonomic thumb position.', tags: [33, 39], variants: [{ n: '12 oz', t: 'size' }, { n: '14 oz', t: 'size' }, { n: '16 oz', t: 'size' }] },
  { name: 'Fairtex BGV1 Boxing Gloves', cat: 39, brand: 99, sport: 34, price: 89.99, disc: 74.99, qty: 70, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Premium Thai boxing gloves with premium leather and 3-layer foam system.', tags: [32, 39], variants: [{ n: '12 oz', t: 'size' }, { n: '14 oz', t: 'size' }, { n: '16 oz', t: 'size' }] },
  { name: 'Nike Legend Duffel Bag', cat: 17, brand: 75, sport: 19, price: 59.99, disc: 49.99, qty: 90, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Spacious duffel bag with separate shoe compartment and multiple zip pockets.', tags: [31, 36, 39], variants: [{ n: 'Small', t: 'size' }, { n: 'Medium', t: 'size' }, { n: 'Large', t: 'size' }] },
  { name: 'Adidas Defender 4 Duffel Bag', cat: 63, brand: 76, sport: 25, price: 49.99, disc: 39.99, qty: 120, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Durable duffel bag with water-resistant base and ventilated shoe compartment.', tags: [27, 31, 36], variants: [{ n: 'Small', t: 'size' }, { n: 'Medium', t: 'size' }, { n: 'Large', t: 'size' }] },
  { name: 'Wilson Super Tour Tennis Bag', cat: 66, brand: 79, sport: 21, price: 139.99, disc: 109.99, qty: 35, cond: 'new', gender: 'unisex', age: 'adult', desc: 'Professional 6-racquet tennis bag with thermal compartment and accessory pockets.', tags: [32, 39, 31], variants: [{ n: '6-Pack', t: 'size' }, { n: '9-Pack', t: 'size' }, { n: '12-Pack', t: 'size' }] },
  { name: 'Gray-Nicolls Oblivion Cricket Bat', cat: 29, brand: 113, sport: 30, price: 349.99, disc: 299.99, qty: 15, cond: 'new', gender: 'male', age: 'adult', desc: 'Premium English willow cricket bat with Pro Balance handle for power and control.', tags: [32, 34], variants: [{ n: 'Short Handle', t: 'size' }, { n: 'Long Handle', t: 'size' }] },
  { name: 'Kookaburra Kahuna Cricket Bat', cat: 29, brand: 114, sport: 30, price: 329.99, disc: 279.99, qty: 12, cond: 'new', gender: 'male', age: 'adult', desc: 'Grade 1 English willow cricket bat with sweet-spot enhancement technology.', tags: [32, 34, 39], variants: [{ n: 'Short Handle', t: 'size' }, { n: 'Long Handle', t: 'size' }] },
  { name: 'Gunn & Moore Diamond Cricket Bat', cat: 29, brand: 115, sport: 30, price: 319.99, disc: 269.99, qty: 10, cond: 'new', gender: 'male', age: 'adult', desc: 'Premium cricket bat with GM Digital Grain Technology for optimal performance.', tags: [32, 34, 37], variants: [{ n: 'Short Handle', t: 'size' }, { n: 'Long Handle', t: 'size' }] },
];

const conn = await mysql.createConnection(DB);
const nextId = 1_000_000; // high base to avoid collisions

// Fetch existing product IDs to calculate auto_increment
const [maxRow] = await conn.query('SELECT MAX(id) as maxId FROM products');
const startId = Math.max(nextId, (maxRow[0]?.maxId || 0) + 1);
const placeholderUrl = (name) => `https://picsum.photos/seed/${encodeURIComponent(name.replace(/\s+/g, '-').toLowerCase())}/400/400`;

let pid = startId;
let allVariants = [];

for (const p of products) {
  const images = JSON.stringify([placeholderUrl(p.name), placeholderUrl(p.name + ' alt'), placeholderUrl(p.name + ' side')]);
  await conn.execute(
    `INSERT INTO products (id, seller_id, seller_type, category_id, brand_id, sport_id, name, description, price, discounted_price, currency_code, quantity, condition_status, gender, age_group, status, images, is_active, created_at, updated_at)
     VALUES (?, 18, 'org', ?, ?, ?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, 'active', ?, 1, NOW(), NOW())`,
    [pid, p.cat, p.brand, p.sport, p.name, p.desc, p.price, p.disc, p.qty, p.cond, p.gender, p.age, images]
  );

  // Tags
  if (p.tags?.length) {
    const tagVals = p.tags.map(tid => `(${pid}, ${tid})`).join(', ');
    await conn.execute(`INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES ${tagVals}`);
  }

  // Variants
  if (p.variants?.length) {
    let sortOrder = 0;
    for (const v of p.variants) {
      const vid = pid * 100 + sortOrder;
      allVariants.push({ id: vid, productId: pid, v, sortOrder });
      sortOrder++;
    }
  }

  pid++;
}

// Insert variants
if (allVariants.length) {
  const vRows = allVariants.map(v => [
    v.id, v.productId, `${v.v.n.toLowerCase().replace(/\s+/g, '-')}-${v.productId}`,
    v.v.n, v.v.t, 0, 5, 1, v.v.c || null, v.sortOrder
  ]);
  const placeholders = vRows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flat = vRows.flat();
  await conn.execute(
    `INSERT INTO product_variants (id, product_id, sku, variant_name, variant_type, price_adjustment, quantity, is_default, variant_color, sort_order) VALUES ${placeholders}`,
    flat
  );
}

// Auto-increment update
await conn.execute(`ALTER TABLE products AUTO_INCREMENT = ${pid + 100}`);

console.log(`Inserted ${products.length} products with ${allVariants.length} variants for org 18`);
await conn.end();
