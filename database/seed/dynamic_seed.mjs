import mysql from 'mysql2/promise'
import { readFileSync, mkdirSync, appendFileSync } from 'fs'
import { execSync } from 'child_process'

const DB_HOST = process.env.DB_HOST || 'db'
const DB_PORT = parseInt(process.env.DB_PORT || '3306')
const DB_USER = process.env.DB_USER || 'root'
const DB_PASS = process.env.DB_PASSWORD || process.env.DB_PASS || 'CourtZon2026'
const DB_NAME = process.env.DB_NAME || 'courtzon_v2'
const BATCH = 50
const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')
const NOW_DATE = NOW.slice(0, 10)

function log(m) {
  const line = `[${new Date().toISOString()}] ${m}`
  console.log(line)
  try { mkdirSync('database/seed', { recursive: true }); appendFileSync('database/seed/seed_dynamic.log', line + '\n') } catch {}
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'"
  return "'" + String(v).replace(/'/g, "''") + "'"
}

async function getCols(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, IF(COLUMN_KEY='PRI',1,0) as IS_PK
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [DB_NAME, table]
  )
  return rows.filter(r => !r.EXTRA?.includes('auto_increment') && !r.IS_PK && r.COLUMN_NAME !== 'created_at' && r.COLUMN_NAME !== 'updated_at' && r.COLUMN_NAME !== 'deleted_at')
}

async function insertRows(conn, table, rows, updateCols = null) {
  if (!rows.length) return 0
  const cols = await getCols(conn, table)
  if (!cols.length) return 0
  const names = cols.map(c => '`' + c.COLUMN_NAME + '`')
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = chunk.map(r => {
      const colVals = cols.map(c => esc(r[c.COLUMN_NAME] !== undefined ? r[c.COLUMN_NAME] : null))
      return '(' + colVals.join(', ') + ')'
    }).join(',\n')
    let onDup = ''
    if (updateCols && updateCols.length) {
      onDup = ' ON DUPLICATE KEY UPDATE ' + updateCols.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(', ')
    }
    const sql = `INSERT IGNORE INTO \`${table}\` (${names.join(', ')}) VALUES\n${vals}${onDup};`
    try {
      const [res] = await conn.query(sql)
      inserted += res.affectedRows || 0
    } catch (err) {
      log(`  ⚠ ${table}: ${err.message}`)
    }
  }
  return inserted
}

// ── Factory helpers ────────────────────────────────────────────────────────
function makeEmail(n) { return `user${n}@courtzon.eg` }
function makePhone(n) { return `010${String(5000000 + n * 7013).slice(0, 7)}` }
function makeFullPhone(n) { return `+20${makePhone(n)}` }
const EGYPTIAN_NAMES = [
  'Mohamed Niazy','Ahmed Hassan','Sara Mahmoud','Khaled Ali','Nour Ibrahim',
  'Omar Saleh','Heba Mostafa','Amr Youssef','Dina Samy','Tamer Shaker',
  'Yassin Adel','Salma Fahmy','Ziad Khalil','Mariam Sadek','Seif Galal',
  'Aya Osman','Karim Rashwan','Reem Shalaby','Hany Abdou','Nada El Sharkawy',
  'Sameh Mansour','Ghada Fouad','Nabil Essa','Habiba Naguib','Ramy Badawy',
  'Farida El Shazly','Maged El Kady','Laila El Nagar','Raouf Shahine','Kenzy El Shamy',
  'Adam Lotfy','Malak Gamal','Fady Saad','Rana Elgendy','Ehab Shaker',
  'Noha Tawfik','Ashraf El Gammal','Donia El Desouky','Hesham El Shafei','Omneya Soliman',
  'Mahmoud Rady','Manal El Wakeel','Moustafa Sabry','Shaimaa Ezz','Walid Shokry',
  'Samar Hamdy','Nader Helmy','Rania El Shafei','Sherif Abaza','Mai Ghoneim',
]

// ── Table seeders ──────────────────────────────────────────────────────────
// Each function returns an array of row objects for its table.
// Columns not in the actual DB are auto-filtered by insertRows().

const PWHASH = '$pbkdf2-sha512$AgADNFAAQJFZqKimEh5gM-VOeAWbANqziCzdIeU1MKKKzmQgFWLhSdvu5-jVWLwdDqbiDD50kUFihRSmRaG1y0ciyP5qzrMc1Xmc-CnM-9jUndR4ubYuk0QxiQk3_FlsNqCUyZD1YQ'

function seedLanguages() {
  return [
    { code: 'en', name: 'English', native_name: 'English', is_rtl: 0, sort_order: 1, is_active: 1 },
    { code: 'ar', name: 'Arabic', native_name: 'العربية', is_rtl: 1, sort_order: 2, is_active: 1 },
    { code: 'fr', name: 'French', native_name: 'Français', is_rtl: 0, sort_order: 3, is_active: 0 },
  ]
}

function seedCountries() {
  return [
    { iso_code: 'EG', iso_code_3: 'EGY', name: 'Egypt', native_name: 'مصر', phone_code: '+20', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'EGP', flag_emoji: '🇪🇬', sort_order: 1, is_active: 1 },
    { iso_code: 'SA', iso_code_3: 'SAU', name: 'Saudi Arabia', native_name: 'المملكة العربية السعودية', phone_code: '+966', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'SAR', flag_emoji: '🇸🇦', sort_order: 2, is_active: 1 },
    { iso_code: 'AE', iso_code_3: 'ARE', name: 'UAE', native_name: 'الإمارات', phone_code: '+971', phone_max_length: 15, phone_min_length: 7, default_locale: 'ar', default_currency: 'AED', flag_emoji: '🇦🇪', sort_order: 3, is_active: 1 },
    { iso_code: 'US', iso_code_3: 'USA', name: 'United States', native_name: 'United States', phone_code: '+1', phone_max_length: 15, phone_min_length: 7, default_locale: 'en', default_currency: 'USD', flag_emoji: '🇺🇸', sort_order: 4, is_active: 0 },
    { iso_code: 'GB', iso_code_3: 'GBR', name: 'United Kingdom', native_name: 'United Kingdom', phone_code: '+44', phone_max_length: 15, phone_min_length: 7, default_locale: 'en', default_currency: 'GBP', flag_emoji: '🇬🇧', sort_order: 5, is_active: 0 },
  ]
}

function seedCurrencies() {
  return [
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimal_places: 2, is_active: 1 },
    { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_active: 1 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_active: 0 },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimal_places: 2, is_active: 0 },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimal_places: 2, is_active: 0 },
    { code: 'GBP', name: 'British Pound', symbol: '£', decimal_places: 2, is_active: 0 },
  ]
}

function seedSports() {
  return [
    { name: 'Football', slug: 'football', icon: 'soccer', is_active: 1, sort_order: 1 },
    { name: 'Padel', slug: 'padel', icon: 'padel', is_active: 1, sort_order: 2 },
    { name: 'Tennis', slug: 'tennis', icon: 'tennis', is_active: 1, sort_order: 3 },
    { name: 'Basketball', slug: 'basketball', icon: 'basketball', is_active: 1, sort_order: 4 },
    { name: 'Squash', slug: 'squash', icon: 'squash', is_active: 1, sort_order: 5 },
    { name: 'Swimming', slug: 'swimming', icon: 'swimming', is_active: 1, sort_order: 6 },
    { name: 'Boxing', slug: 'boxing', icon: 'boxing', is_active: 1, sort_order: 7 },
    { name: 'Martial Arts', slug: 'martial-arts', icon: 'martial-arts', is_active: 1, sort_order: 8 },
    { name: 'Volleyball', slug: 'volleyball', icon: 'volleyball', is_active: 1, sort_order: 9 },
    { name: 'Yoga', slug: 'yoga', icon: 'yoga', is_active: 1, sort_order: 10 },
    { name: 'Fitness', slug: 'fitness', icon: 'fitness', is_active: 1, sort_order: 11 },
  ]
}

function seedUsers() {
  return EGYPTIAN_NAMES.map((name, i) => {
    // Override for Mohamed Niazy (index 0)
    if (i === 0) {
      return {
        public_id: uuid(), full_name: 'Mohamed Niazy', email: 'mniazyy@gmail.com',
        phone_number: '01012637733', full_phone: '+201012637733',
        password_hash: PWHASH, gender: 'male', country_id: 1,
        account_status: 'active', is_email_verified: 1, is_phone_verified: 1,
        language_id: 1, timezone: 'Africa/Cairo',
      }
    }
    return {
      public_id: uuid(), full_name: name, email: makeEmail(i), phone_number: makePhone(i), full_phone: makeFullPhone(i),
      password_hash: PWHASH,
      gender: (['Ahmed','Khaled','Omar','Amr','Tamer','Yassin','Ziad','Seif','Karim','Hany','Sameh','Nabil','Ramy','Maged','Raouf','Adam','Fady','Ehab','Ashraf','Hesham','Mahmoud','Moustafa','Walid','Nader','Sherif'].some(m => name.startsWith(m))) ? 'male' : 'female',
      country_id: 1, account_status: 'active', is_email_verified: 1, is_phone_verified: i % 2,
      language_id: 1, timezone: 'Africa/Cairo',
    }
  })
}

function seedUserRoles(userCount) {
  const rows = []
  const roleIds = [1, 2, 2, 3, 3, 4, 4, 4, 4, 4, ...Array.from({length: userCount - 10}, () => 5)]
  for (let i = 0; i < userCount && i < roleIds.length; i++) {
    rows.push({ user_id: i + 1, role_id: roleIds[i], assigned_by: 1, is_active: 1 })
  }
  return rows
}

function seedPlayerProfiles() {
  return EGYPTIAN_NAMES.slice(10).map((_, i) => ({
    user_id: i + 11, main_sport_id: (i % 11) + 1, main_level_id: (i % 5) + 1, is_coach: 0, is_seller: i < 5 ? 1 : 0, bio: `Player profile for user ${i + 11}`,
  }))
}

function seedCoachProfiles() {
  return [6,7,8,9,10].map((uid, i) => ({
    user_id: uid, bio: `Certified coach with ${5 + i} years experience.`, experience_years: 5 + i,
    certifications: JSON.stringify(['Level 1','First Aid']), sports: JSON.stringify([i + 1]),
    hourly_rate: 200 + i * 50, currency_code: 'EGP', is_available: 1, is_verified: 1,
  }))
}

function seedPermissions() {
  const slugs = ['dashboard','bookings','resources','users','roles','organisations','marketplace','payments','coaching','academies','community','notifications','reports','settings','advertising','cms','subscriptions']
  const actions = ['view','create','edit','delete','approve','export']
  const rows = []
  for (const [mi, slug] of slugs.entries()) {
    for (const action of actions) { rows.push({ module_id: mi + 1, permission_key: `${slug}.${action}` }) }
  }
  return rows
}

function seedPermissionModules() {
  return [
    { slug: 'dashboard', sort_order: 1 }, { slug: 'bookings', sort_order: 2 },
    { slug: 'resources', sort_order: 3 }, { slug: 'users', sort_order: 4 },
    { slug: 'roles', sort_order: 5 }, { slug: 'organisations', sort_order: 6 },
    { slug: 'marketplace', sort_order: 7 }, { slug: 'payments', sort_order: 8 },
    { slug: 'coaching', sort_order: 9 }, { slug: 'academies', sort_order: 10 },
    { slug: 'community', sort_order: 11 }, { slug: 'notifications', sort_order: 12 },
    { slug: 'reports', sort_order: 13 }, { slug: 'settings', sort_order: 14 },
    { slug: 'advertising', sort_order: 15 }, { slug: 'cms', sort_order: 16 },
    { slug: 'subscriptions', sort_order: 17 },
  ]
}

function seedRoles() {
  return [
    { name: 'Super Admin', slug: 'super-admin', description: 'Full platform access', is_system: 1 },
    { name: 'Org Admin', slug: 'org-admin', description: 'Organisation administration', is_system: 1 },
    { name: 'Branch Manager', slug: 'branch-manager', description: 'Branch management', is_system: 0 },
    { name: 'Coach', slug: 'coach', description: 'Coach with session management', is_system: 0 },
    { name: 'Player', slug: 'player', description: 'Regular player/customer', is_system: 1 },
  ]
}

function seedOrganisations() {
  return [
    { public_id: uuid(), org_type_id: 1, owner_id: 1, name: 'Gezeta Sporting Club', slug: 'gezeta-sc', description: 'Prestigious Cairo sports club', email: 'info@gezeta.com.eg', is_verified: 1, is_active: 1 },
    { public_id: uuid(), org_type_id: 1, owner_id: 2, name: 'Wadi Degla Sporting Club', slug: 'wadi-degla-sc', description: 'New Cairo multi-sport complex', email: 'info@wadidegla.com', is_verified: 1, is_active: 1 },
    { public_id: uuid(), org_type_id: 1, owner_id: 3, name: 'Smouha Sporting Club', slug: 'smouha-sc', description: 'Alexandria Premier sports club', email: 'info@smouha.com', is_verified: 1, is_active: 1 },
    { public_id: uuid(), org_type_id: 2, owner_id: 1, name: 'Black Ball Academy', slug: 'black-ball-academy', description: 'New Cairo sports academy', email: 'info@blackball.eg', is_verified: 1, is_active: 1 },
    { public_id: uuid(), org_type_id: 1, owner_id: 2, name: 'Shams Sporting Club', slug: 'shams-sc', description: 'Heliopolis historic club', email: 'info@shamsclub.com', is_verified: 0, is_active: 1 },
  ]
}

async function main() {
  log('═══════════════════════════════════════════')
  log('CourtZon-V2 Dynamic Seed Engine v3')
  log('═══════════════════════════════════════════')

  const conn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS,
    database: DB_NAME, connectTimeout: 30000,
  })
  log('Connected to database')

  // First run the existing core seed (works correctly)
  log('\n📦 Running 001_seed_core.sql...')
  try {
    const sql = readFileSync('database/seed/001_seed_core.sql', 'utf8')
    const inserts = sql.match(/(INSERT\s+(?:IGNORE\s+)?INTO\s+[^;]+;)/gi)
    if (inserts) {
      let coreTotal = 0
      for (const stmt of inserts) {
        try {
          const [res] = await conn.query(stmt)
          coreTotal += res.affectedRows || 0
        } catch (e) { log(`  ⚠ core seed stmt: ${e.message}`) }
      }
      log(`  ✅ core seed: ${coreTotal} rows`)
    }
  } catch (e) { log(`  ⚠ core seed file: ${e.message}`) }

  // Clear FK-safe tables for the dynamic seed (if data already exists)
  const dynamicTables = [
    'academies','academy_curriculums','academy_enrollments','academy_evaluations','academy_session_attendance','academy_sessions',
    'activity_logs','ad_campaigns','ad_clicks','ad_creatives','ad_impressions','ad_placements','ad_pricing','ad_targeting_rules',
    'announcement_comments','announcement_likes','announcements','audit_logs','bank_accounts',
    'booking_cancellations','booking_invitations','booking_participants','booking_slots','bookings',
    'branch_player_access','branches','cancellation_policies','cart_items',
    'cms_blogs','cms_pages','cms_sections','coach_org_agreements','coach_profiles','coach_reviews','coach_sessions','commission_rules',
    'community_event_participants','community_events','community_tournaments','conversation_participants','conversations',
    'coupon_usage','coupons',    'branch_amenity_assignments','cron_jobs','design_tokens',
    'email_verification_tokens','exchange_rates','financial_journal_entries','holidays',
    'media_uploads','messages','notification_queue','notifications','operating_hours',
    'order_items','order_status_history','orders','organisation_attribute_values','organisation_financial_details',
    'payment_gateway_config','payment_transactions','permission_modules','permissions','player_levels','player_profiles','player_ratings',
    'product_categories','product_reviews','product_variants','products',
    'resource_attribute_values','resource_maintenance','resource_type_attributes','resource_types','resources',
    'revert_logs','role_permissions','roles','scheduled_jobs','seller_profiles','seller_subscriptions','app_settings',
    'settlement_items','settlements','sport_positions','sports','subscription_plan_rates','subscription_plans','system_settings',
    'tournament_bracket_types','tournament_match_scores','tournament_matches','tournament_registrations','tournaments',
    'translations','user_addresses','user_devices','user_follows','user_friends','user_notification_preferences','user_role_scopes',
    'user_roles','user_sessions','user_wallets','users','wallet_transactions','wishlist_items','withdrawal_requests',
    'organisation_type_attributes','organisation_types',
  ]

  await conn.query('SET FOREIGN_KEY_CHECKS=0')
  // Truncate dynamic tables (safest approach: one by one with error tolerance)
  for (const tn of dynamicTables) {
    try { await conn.query(`TRUNCATE TABLE \`${tn}\``) } catch {}
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1')

  let total = 0

  // ════════════════════════════════════════════
  // REFERENCE + RBAC
  // ════════════════════════════════════════════
  total += await insertRows(conn, 'languages', seedLanguages())
  log(`  languages: ${total}`)
  total += await insertRows(conn, 'countries', seedCountries())
  total += await insertRows(conn, 'currencies', seedCurrencies())
  total += await insertRows(conn, 'sports', seedSports())
  total += await insertRows(conn, 'permission_modules', seedPermissionModules())
  total += await insertRows(conn, 'permissions', seedPermissions())
  total += await insertRows(conn, 'roles', seedRoles())
  log(`  ref+rbac: ${total}`)

  // ════════════════════════════════════════════
  // USERS
  // ════════════════════════════════════════════
  const users = seedUsers()
  total += await insertRows(conn, 'users', users, ['password_hash'])
  const userCount = users.length
  total += await insertRows(conn, 'user_roles', seedUserRoles(userCount))
  total += await insertRows(conn, 'player_profiles', seedPlayerProfiles())
  total += await insertRows(conn, 'coach_profiles', seedCoachProfiles())

  // User wallets
  total += await insertRows(conn, 'user_wallets', Array.from({length: userCount}, (_, i) => ({
    user_id: i + 1, balance: Math.round(Math.random() * 5000 * 100) / 100, currency_code: 'EGP', version: 1,
  })))

  // User addresses (30)
  const addrRows = []
  const cities = ['Cairo','Alexandria','Giza','New Cairo','Hurghada','Mansoura','Tanta']
  const streets = ['El Tahrir','El Nasr','El Haram','El Nil','Abbas El Akkad','El Thawra','El Galaa']
  for (let i = 0; i < 30; i++) {
    addrRows.push({
      user_id: (i % userCount) + 1, label: ['Home','Work','Other'][i % 3],
      street_address: `${Math.floor(Math.random() * 200) + 1} ${streets[i % streets.length]} St`,
      city: cities[i % cities.length], state: `${cities[i % cities.length]} Governorate`,
      country: 'Egypt', postal_code: String(10000 + Math.floor(Math.random() * 90000)),
      address_type: 'both', is_default: i < 3 ? 1 : 0,
    })
  }
  total += await insertRows(conn, 'user_addresses', addrRows)
  log(`  users: ${total}`)

  // ════════════════════════════════════════════
  // ORGANISATIONS
  // ════════════════════════════════════════════
  total += await insertRows(conn, 'organisations', seedOrganisations())
  const orgCount = 5

  const branchRows = []
  for (let o = 0; o < orgCount; o++) {
    branchRows.push({ public_id: uuid(), organisation_id: o + 1, name: `${['Gezeta','Wadi Degla','Smouha','Black Ball','Shams'][o]} Main`, slug: `${['gezeta','wadi-degla','smouha','black-ball','shams'][o]}-main`, description: `${['Gezeta','Wadi Degla','Smouha','Black Ball','Shams'][o]} main facility`, city: ['Cairo','New Cairo','Alexandria','New Cairo','Heliopolis'][o], is_active: 1, timezone: 'Africa/Cairo' })
    branchRows.push({ public_id: uuid(), organisation_id: o + 1, name: `${['Gezeta','Wadi Degla','Smouha','Black Ball','Shams'][o]} North`, slug: `${['gezeta','wadi-degla','smouha','black-ball','shams'][o]}-north`, description: `North branch`, city: ['Cairo','New Cairo','Alexandria','New Cairo','Heliopolis'][o], is_active: 1, timezone: 'Africa/Cairo' })
  }
  total += await insertRows(conn, 'branches', branchRows)
  const branchCount = branchRows.length

  const typeNames = {1:'Football', 2:'Padel', 3:'Tennis', 5:'Squash', 6:'Swimming'}
  const resOpts = [
    {typeId:2, sportId:2, name:'Padel Court', cap:4, price:300, dur:60},
    {typeId:3, sportId:3, name:'Tennis Court', cap:4, price:250, dur:60},
    {typeId:1, sportId:1, name:'Football Pitch', cap:22, price:800, dur:120},
    {typeId:5, sportId:5, name:'Squash Court', cap:2, price:200, dur:45},
    {typeId:6, sportId:6, name:'Swimming Pool', cap:8, price:150, dur:60},
  ]
  const resRows = []
  for (let b = 0; b < branchCount; b++) {
    for (let t = 0; t < 3; t++) {
      const opt = resOpts[(b * 3 + t) % 5]
      resRows.push({
        public_id: uuid(), branch_id: b + 1, resource_type_id: opt.typeId, sport_id: opt.sportId,
        name: `${opt.name} ${Math.ceil((b * 3 + t + 1) / 5)}`,
        capacity: opt.cap, hourly_price: opt.price, is_active: 1, slot_duration: opt.dur, max_bookings_per_slot: 1,
      })
    }
  }
  total += await insertRows(conn, 'resources', resRows)
  const resCount = resRows.length
  log(`  orgs: ${total}`)

  // ════════════════════════════════════════════
  // BOOKINGS
  // ════════════════════════════════════════════
  const bkRows = []
  for (let i = 0; i < 200; i++) {
    const daysAgo = 90 - i; const bkDate = new Date(Date.now() - 86400000 * daysAgo)
    const sh = 8 + (i % 10); const total = 200 + (i % 10) * 50; const comm = Math.round(total * 0.1 * 100) / 100
    bkRows.push({
      public_id: `BK-${String(i+1).padStart(6,'0')}`, user_id: (i%userCount)+1, organisation_id: (i%orgCount)+1, resource_id: (i%resCount)+1,
      booking_type: ['public_match','private_match','academy','clinic','coach_session'][i%5],
      visibility: i%4===0?'private':'public',
      booking_date: bkDate.toISOString().slice(0,10),
      start_time: `${String(sh).padStart(2,'0')}:00:00`, end_time: `${String(sh+1).padStart(2,'0')}:00:00`,
      total_amount: total, commission_rate: 10, commission_amount: comm, net_amount: total-comm,
      payment_status: ['pending','paid','paid','paid','refunded'][i%5],
      booking_status: ['pending','confirmed','confirmed','completed','cancelled'][i%5],
    })
  }
  total += await insertRows(conn, 'bookings', bkRows)
  const bkCount = bkRows.length

  // Booking slots
  const slotRows = bkRows.map((bk, i) => ({
    booking_id: i + 1, resource_id: (i % resCount) + 1,
    booking_date: bk.booking_date, slot_start: bk.start_time, slot_end: bk.end_time, is_available: 0,
  }))
  total += await insertRows(conn, 'booking_slots', slotRows)
  log(`  bookings: ${total}`)

  // ════════════════════════════════════════════
  // REMAINING TABLES (smaller ones)
  // ════════════════════════════════════════════
  // Player levels
  total += await insertRows(conn, 'player_levels', [
    { name: 'Beginner', level_order: 1 }, { name: 'Intermediate', level_order: 2 },
    { name: 'Advanced', level_order: 3 }, { name: 'Professional', level_order: 4 },
    { name: 'Elite', level_order: 5 },
  ])

  // Tournament bracket types
  total += await insertRows(conn, 'tournament_bracket_types', [
    { name: 'Single Elimination', slug: 'single-elimination' }, { name: 'Double Elimination', slug: 'double-elimination' },
    { name: 'Round Robin', slug: 'round-robin' }, { name: 'Swiss System', slug: 'swiss' },
  ])

  // Resource types
  total += await insertRows(conn, 'resource_types', [
    { slug: 'football-pitch', name: 'Football Pitch', has_slots: 1, default_slot_duration: 120, sort_order: 1 },
    { slug: 'padel-court', name: 'Padel Court', has_slots: 1, default_slot_duration: 60, sort_order: 2 },
    { slug: 'tennis-court', name: 'Tennis Court', has_slots: 1, default_slot_duration: 60, sort_order: 3 },
    { slug: 'squash-court', name: 'Squash Court', has_slots: 1, default_slot_duration: 45, sort_order: 4 },
    { slug: 'swimming-pool', name: 'Swimming Pool', has_slots: 1, default_slot_duration: 60, sort_order: 5 },
    { slug: 'multi-purpose-hall', name: 'Multi-Purpose Hall', has_slots: 1, default_slot_duration: 60, sort_order: 6 },
    { slug: 'yoga-studio', name: 'Yoga Studio', has_slots: 1, default_slot_duration: 60, sort_order: 7 },
  ])

  // Organisation types
  total += await insertRows(conn, 'organisation_types', [
    { slug: 'sports-club', sort_order: 1 }, { slug: 'sports-academy', sort_order: 2 },
    { slug: 'fitness-center', sort_order: 3 }, { slug: 'padel-club', sort_order: 4 },
  ])

  // App settings defaults
  total += await insertRows(conn, 'app_settings', [
    { setting_key: 'site_name', value: JSON.stringify('CourtZon') },
    { setting_key: 'support_email', value: JSON.stringify('support@courtzon.com') },
    { setting_key: 'favicon_url', value: JSON.stringify('/images/favicon.ico') },
    { setting_key: 'site_logo_url', value: JSON.stringify('/images/logo.svg') },
    { setting_key: 'pwa_icon_192', value: JSON.stringify('/icon-192.png') },
    { setting_key: 'pwa_icon_512', value: JSON.stringify('/icon-512.png') },
    { setting_key: 'domain_name', value: JSON.stringify('') },
    { setting_key: 'site_tagline', value: JSON.stringify('Book. Play. Connect.') },
    { setting_key: 'meta_description', value: JSON.stringify('') },
    { setting_key: 'maintenance_mode', value: JSON.stringify(false) },
  ])

  // Exchange rates
  total += await insertRows(conn, 'exchange_rates', [
    { from_currency: 'EGP', to_currency: 'EGP', rate: 1.0, recorded_at: NOW, source: 'system' },
    { from_currency: 'EGP', to_currency: 'USD', rate: 0.032, recorded_at: NOW, source: 'system' },
    { from_currency: 'USD', to_currency: 'EGP', rate: 31.25, recorded_at: NOW, source: 'system' },
  ])

  // Notification categories + actions
  total += await insertRows(conn, 'notification_categories', [
    { slug: 'booking', sort_order: 1 }, { slug: 'payment', sort_order: 2 },
    { slug: 'promotion', sort_order: 3 }, { slug: 'system', sort_order: 4 },
    { slug: 'community', sort_order: 5 }, { slug: 'marketplace', sort_order: 6 },
  ])
  total += await insertRows(conn, 'notification_actions', [
    { action_key: 'booking.confirmed', route_pattern: '/bookings/{id}' },
    { action_key: 'booking.reminder', route_pattern: '/bookings/{id}' },
    { action_key: 'payment.received', route_pattern: '/payments/{id}' },
    { action_key: 'payment.refunded', route_pattern: '/payments/{id}' },
  ])

  // Amenities
  total += await insertRows(conn, 'amenities', [
    { name_en: 'Floodlights', name_ar: 'أضواء', icon: 'lightbulb', category: 'facilities', sort_order: 1 },
    { name_en: 'Changing Rooms', name_ar: 'غرف', icon: 'door', category: 'facilities', sort_order: 2 },
    { name_en: 'Parking', name_ar: 'موقف', icon: 'car', category: 'accessibility', sort_order: 3 },
    { name_en: 'Cafeteria', name_ar: 'كافيتيريا', icon: 'coffee', category: 'convenience', sort_order: 4 },
    { name_en: 'WiFi', name_ar: 'واي فاي', icon: 'wifi', category: 'convenience', sort_order: 5 },
  ])

  // System settings
  total += await insertRows(conn, 'system_settings', [
    { key: 'platform.name', value: JSON.stringify('CourtZon'), description: 'Platform name' },
    { key: 'platform.support_email', value: JSON.stringify('support@courtzon.com'), description: 'Support email' },
    { key: 'platform.default_currency', value: JSON.stringify('EGP'), description: 'Default currency' },
    { key: 'booking.buffer_minutes', value: JSON.stringify(30), description: 'Booking buffer' },
  ])

  // Design tokens
  total += await insertRows(conn, 'design_tokens', [
    { token_key: 'primary_color', token_type: 'color', default_value: '#1d4ed8', current_value: '#1d4ed8', category: 'brand', description: 'Primary' },
    { token_key: 'border_radius', token_type: 'radius', default_value: '8px', current_value: '8px', category: 'layout', description: 'Radius' },
  ])

  // Media uploads
  total += await insertRows(conn, 'media_uploads', [
    { owner_type: 'user', owner_id: 1, file_url: '/uploads/avatar1.jpg', file_type: 'image/jpeg', file_size: 102400, file_name: 'avatar1.jpg', uploaded_by: 1 },
    { owner_type: 'organization', owner_id: 1, file_url: '/uploads/logo1.png', file_type: 'image/png', file_size: 51200, file_name: 'logo1.png', uploaded_by: 1 },
  ])

  // Seat of convenience: insert some reasonable defaults for remaining table types
  // Product categories
  total += await insertRows(conn, 'product_categories', [
    { name: 'Racket Sports', slug: 'racket-sports', description: 'Tennis, padel, squash', sort_order: 1, is_active: 1 },
    { name: 'Football', slug: 'football', description: 'Football gear', sort_order: 2, is_active: 1 },
    { name: 'Swimming', slug: 'swimming', description: 'Swimwear', sort_order: 3, is_active: 1 },
    { name: 'Fitness', slug: 'fitness', description: 'Gym equipment', sort_order: 4, is_active: 1 },
    { name: 'Apparel', slug: 'apparel', description: 'Sports clothing', sort_order: 5, is_active: 1 },
  ])

  // Translations
  total += await insertRows(conn, 'translations', [
    { key: 'site.title', locale: 'en', value: 'CourtZon' },
    { key: 'site.title', locale: 'ar', value: 'كورت زون' },
    { key: 'button.book_now', locale: 'en', value: 'Book Now' },
    { key: 'button.book_now', locale: 'ar', value: 'احجز الآن' },
    { key: 'nav.bookings', locale: 'en', value: 'Bookings' },
    { key: 'nav.bookings', locale: 'ar', value: 'الحجوزات' },
  ])

  // Bank accounts
  total += await insertRows(conn, 'bank_accounts', [
    { branch_id: 1, bank_name: 'National Bank of Egypt', account_number: '1000123456789', account_holder_name: 'Gezeta SC — Main Branch', iban: 'EG100010000000000000001234', is_default: 1 },
    { branch_id: 2, bank_name: 'Banque Misr', account_number: '1000234567890', account_holder_name: 'Gezeta SC — North Complex', iban: 'EG100020000000000000001235', is_default: 1 },
  ])

  // Commission rules
  total += await insertRows(conn, 'commission_rules', [
    { rule_name: 'Booking Commission', rule_type: 'percentage', amount: 10, applicable_entity: 'booking', is_active: 1 },
    { rule_name: 'Marketplace Commission', rule_type: 'percentage', amount: 12, applicable_entity: 'product', is_active: 1 },
  ])

  // Payment gateway config
  total += await insertRows(conn, 'payment_gateway_config', [
    { organisation_id: 1, gateway_provider: 'fawry', is_active: 1, config: JSON.stringify({ merchant_code: 'FWY123' }) },
    { organisation_id: 1, gateway_provider: 'paymob', is_active: 1, config: JSON.stringify({ api_key: '***' }) },
  ])

  // Subscription plans
  total += await insertRows(conn, 'subscription_plans', [
    { plan_name: 'Basic', billing_cycle: 'monthly', price: 999, features: JSON.stringify(['Up to 5 resources','Basic reporting']), is_active: 1 },
    { plan_name: 'Pro', billing_cycle: 'monthly', price: 2499, features: JSON.stringify(['Up to 20 resources','Advanced analytics','Priority support']), is_active: 1 },
    { plan_name: 'Enterprise', billing_cycle: 'monthly', price: 9999, features: JSON.stringify(['Unlimited resources','Dedicated support','White-label']), is_active: 1 },
  ])

  // Cron jobs
  total += await insertRows(conn, 'cron_jobs', [
    { job_name: 'Process Expired Bookings', handler: 'App\\Jobs\\ProcessExpiredBookings', cron_expression: '0 * * * *', is_active: 1 },
    { job_name: 'Send Reminders', handler: 'App\\Jobs\\SendBookingReminders', cron_expression: '*/15 * * * *', is_active: 1 },
  ])

  // Seller profiles
  total += await insertRows(conn, 'seller_profiles', [
    { user_id: 11, shop_name: 'CourtZon Pro Shop', shop_description: 'Premium sports gear', is_subscribed: 1, max_free_listings: 5, total_listings: 10, is_active: 1 },
    { user_id: 12, shop_name: 'Sports Egypt', shop_description: 'Egyptian sports equipment', is_subscribed: 0, max_free_listings: 5, total_listings: 3, is_active: 1 },
  ])

  // Products
  const prodRows = []
  const prodNames = ['Wilson Tennis Racket','Padel Pro Racket','Football Boots','Swim Goggles','Yoga Mat','Training Jersey','Basketball','Resistance Bands','Tennis Balls (3)','Swim Cap']
  for (let i = 0; i < 30; i++) {
    const price = [1200,800,2500,350,600,450,900,200,150,100][i % 10]
    prodRows.push({
      seller_id: (i % 2) + 1, category_id: (i % 5) + 1, name: `${prodNames[i % 10]} ${2026 - Math.floor(i / 10)}`,
      description: `High-quality ${prodNames[i % 10].toLowerCase()} for sports enthusiasts.`,
      price: price, currency_code: 'EGP', quantity: 10 + i * 2, status: 'active', is_active: 1,
    })
  }
  total += await insertRows(conn, 'products', prodRows)

  // Coupons
  total += await insertRows(conn, 'coupons', [
    { code: 'WELCOME20', discount_type: 'percentage', discount_value: 20, min_order_amount: 200, max_uses: 100, max_uses_per_user: 1, starts_at: new Date(Date.now() - 86400000 * 30).toISOString().slice(0,19).replace('T',' '), expires_at: new Date(Date.now() + 86400000 * 120).toISOString().slice(0,19).replace('T',' '), is_active: 1 },
    { code: 'SUMMER15', discount_type: 'percentage', discount_value: 15, max_uses: 200, max_uses_per_user: 2, starts_at: new Date(Date.now() - 86400000 * 15).toISOString().slice(0,19).replace('T',' '), expires_at: new Date(Date.now() + 86400000 * 60).toISOString().slice(0,19).replace('T',' '), is_active: 1 },
    { code: 'PADEL10', discount_type: 'fixed', discount_value: 100, min_order_amount: 500, max_uses: 50, max_uses_per_user: 1, starts_at: NOW, expires_at: new Date(Date.now() + 86400000 * 90).toISOString().slice(0,19).replace('T',' '), is_active: 1 },
    { code: 'EGYPT5', discount_type: 'percentage', discount_value: 5, max_uses: 500, max_uses_per_user: 5, starts_at: new Date(Date.now() - 86400000 * 60).toISOString().slice(0,19).replace('T',' '), expires_at: new Date(Date.now() + 86400000 * 180).toISOString().slice(0,19).replace('T',' '), is_active: 1 },
  ])

  // Orders
  const orderRows = []
  for (let i = 0; i < 60; i++) {
    const subtotal = Math.round((300 + Math.random() * 2000) * 100) / 100
    const shipping = i % 3 === 0 ? 50 : 0
    const discount = i % 4 === 0 ? Math.round(subtotal * 0.2 * 100) / 100 : 0
    orderRows.push({
      public_id: `ORD-${String(i+1).padStart(6,'0')}`, buyer_id: (i % userCount) + 1,
      status: ['confirmed','confirmed','confirmed','shipped','delivered','cancelled'][i % 6],
      payment_status: ['paid','paid','paid','paid','paid','refunded'][i % 6],
      subtotal: subtotal, shipping_cost: shipping, discount_amount: discount,
      tax_amount: Math.round(subtotal * 0.14 * 100) / 100,
      total: Math.round((subtotal + shipping - discount + subtotal * 0.14) * 100) / 100,
      currency_code: 'EGP',
      paid_at: i % 3 !== 0 ? new Date(Date.now() - 86400000 * (30 - i)).toISOString().slice(0,19).replace('T',' ') : null,
    })
  }
  total += await insertRows(conn, 'orders', orderRows)
  const orderCount = orderRows.length

  // Order items
  const orderItemRows = []
  for (let i = 0; i < 120; i++) {
    const orderId = (i % orderCount) + 1
    const prodId = (i % 30) + 1
    const qty = 1 + (i % 3)
    const price = [1200,800,2500,350,600,450,900,200,150,100][prodId % 10]
    orderItemRows.push({
      order_id: orderId, product_id: prodId, seller_id: (prodId % 2) + 1,
      quantity: qty, unit_price: price, total_price: price * qty,
    })
  }
  total += await insertRows(conn, 'order_items', orderItemRows)

  // Order status history
  const statusHistRows = []
  for (const o of orderRows) {
    const flow = ['pending','confirmed','processing','shipped','delivered']
    const endIdx = flow.indexOf(o.status)
    if (endIdx >= 1) {
      statusHistRows.push({ order_id: orderRows.indexOf(o) + 1, from_status: 'pending', to_status: 'confirmed', changed_by: o.buyer_id, changed_by_role: 'buyer', note: 'Order placed' })
    }
    if (endIdx >= 2) {
      statusHistRows.push({ order_id: orderRows.indexOf(o) + 1, from_status: 'confirmed', to_status: 'processing', changed_by: 1, changed_by_role: 'admin', note: 'Payment confirmed' })
    }
  }
  total += await insertRows(conn, 'order_status_history', statusHistRows)

  // Coupon usage
  const cupRows = []
  for (let i = 0; i < 20; i++) {
    cupRows.push({ coupon_id: (i % 4) + 1, user_id: (i % userCount) + 1, order_id: (i % orderCount) + 1, used_at: NOW })
  }
  total += await insertRows(conn, 'coupon_usage', cupRows)

  // Wallet transactions
  const wtxRows = []
  for (let i = 0; i < 80; i++) {
    const userId = (i % userCount) + 1
    const amt = Math.round((50 + Math.random() * 1000) * 100) / 100
    wtxRows.push({
      public_id: uuid(), wallet_id: userId,
      transaction_type: i % 4 === 0 ? 'refund' : (i % 3 === 0 ? 'withdrawal' : 'deposit'),
      amount: amt, direction: i % 5 === 0 ? 'debit' : 'credit',
      reference_type: ['booking','order','commission','settlement'][i % 4],
      reference_id: BigInt((i % 100) + 1),
      description: `${['Deposit','Withdrawal','Refund','Commission'][i % 4]} — ${new Date(Date.now() - 86400000 * (45 - i)).toISOString().slice(0,10)}`,
    })
  }
  total += await insertRows(conn, 'wallet_transactions', wtxRows)

  // Payment transactions
  const ptxRows = []
  for (let i = 0; i < 80; i++) {
    ptxRows.push({
      user_id: (i % userCount) + 1, booking_id: (i % 200) + 1,
      payment_method: ['wallet','card','bank_transfer','cash'][i % 4],
      gateway_provider: ['fawry','paymob','vodafone_cash','bank'][i % 4],
      gateway_reference: `GTX${String(Date.now()).slice(-8)}${i}`,
      amount: Math.round((100 + Math.random() * 3000) * 100) / 100,
      payment_status: ['paid','paid','paid','failed','refunded'][i % 5],
      paid_at: i % 5 !== 3 ? NOW : null,
    })
  }
  total += await insertRows(conn, 'payment_transactions', ptxRows)

  // Notifications
  const notifRows = []
  for (let i = 0; i < 200; i++) {
    notifRows.push({
      user_id: (i % userCount) + 1, category_id: (i % 6) + 1, action_id: (i % 4) + 1,
      action_payload: JSON.stringify({ ref_id: (i % 100) + 1 }),
      title: ['Booking confirmed','Payment received','New offer available','Booking reminder','Order shipped','Session reminder'][i % 6],
      body: `Notification for user ${(i % userCount) + 1} — ${['booking','payment','promotion','order','session','system'][i % 6]} update.`,
      icon: ['calendar','wallet','gift','bell','package','clock'][i % 6],
      is_read: i < 140 ? 1 : 0,
      is_pushed: 1,
      read_at: i < 140 ? NOW : null,
    })
  }
  total += await insertRows(conn, 'notifications', notifRows)

  // Notification queue
  const nqRows = []
  for (let i = 0; i < 30; i++) {
    nqRows.push({
      user_id: (i % userCount) + 1, notification_id: (i % 200) + 1,
      channel: ['push','email','sms','in_app'][i % 4],
      status: ['sent','sent','pending','failed'][i % 4],
      max_retries: 3, retry_count: i % 3,
      scheduled_at: NOW, sent_at: i % 4 !== 2 ? NOW : null,
    })
  }
  total += await insertRows(conn, 'notification_queue', nqRows)

  // Audit logs
  const auditRows = []
  const entities = ['user','booking','resource','organisation','product','order','payment']
  const auditActions = ['CREATE','UPDATE','DELETE','LOGIN','APPROVE']
  for (let i = 0; i < 200; i++) {
    auditRows.push({
      actor_id: (i % userCount) + 1, action: auditActions[i % 5],
      entity_type: entities[i % 7], entity_id: (i % 50) + 1,
      before_state: i % 3 === 0 ? JSON.stringify({ status: 'pending' }) : null,
      after_state: JSON.stringify({ status: ['active','confirmed','completed','paid'][i % 4] }),
      reason: i % 4 === 0 ? 'User request' : null,
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })
  }
  total += await insertRows(conn, 'audit_logs', auditRows)

  // Activity logs
  const actRows = []
  const actTypes = ['page_view','booking_created','login','payment_made','profile_update','search']
  for (let i = 0; i < 200; i++) {
    actRows.push({
      user_id: (i % userCount) + 1, activity_type: actTypes[i % 6],
      description: `User performed ${actTypes[i % 6]}`,
      metadata: JSON.stringify({ page: `/${['dashboard','bookings','courts','products'][i % 4]}`, referrer: 'https://courtzon.com' }),
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    })
  }
  total += await insertRows(conn, 'activity_logs', actRows)

  // Community events
  const evRows = []
  for (let i = 0; i < 10; i++) {
    const evDate = new Date(Date.now() + 86400000 * (14 + i * 7))
    evRows.push({
      creator_id: (i % userCount) + 1, organisation_id: (i % 5) + 1,
      title: ['Padel Tournament','Tennis Open Day','Football 5-a-side Cup','Yoga Session','Swimming Gala','Squash Championship','Basketball 3x3','Boxing Exhibition','Yoga Retreat','Cycling Event'][i],
      description: `Join us for an exciting sports event!`,
      event_type: ['match','training','social','tournament'][i % 4],
      start_time: evDate.toISOString().slice(0,19).replace('T',' '),
      end_time: new Date(evDate.getTime() + 3600000 * 3).toISOString().slice(0,19).replace('T',' '),
      max_participants: 8 + i * 4, is_public: 1, status: ['active','active','active','active','active','active','active','cancelled','completed','completed'][i],
    })
  }
  total += await insertRows(conn, 'community_events', evRows)

  // Announcements
  total += await insertRows(conn, 'announcements', [
    { user_id: 1, organisation_id: 1, content: 'Welcome to the new season! New courts and facilities are now available.', is_pinned: 1 },
    { user_id: 2, organisation_id: 2, content: 'Special summer discounts on all padel court bookings. Book now!', is_pinned: 0 },
    { user_id: 1, organisation_id: 1, content: 'Holiday schedule: Our facilities will be open from 8 AM to 10 PM during Eid.', is_pinned: 0 },
  ])

  log(`  remaining: ${total}`)

  // ✅ Final count
  log(`\n═══════════════════════════════════════════`)
  log(`Total: ${total} rows inserted across all tables`)
  log(`═══════════════════════════════════════════`)

  // Show per-table counts
  const [tables] = await conn.query('SHOW TABLES')
  log('\n📊 Table row counts:')
  for (const t of tables) {
    const tn = t[`Tables_in_${DB_NAME}`]
    const [[{c}]] = await conn.query(`SELECT COUNT(*) as c FROM \`${tn}\``)
    if (c > 0) log(`  ${tn}: ${c}`)
  }

  await conn.end()
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1) })
