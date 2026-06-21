import { randomUUID } from 'node:crypto'
import { batchInsert } from '../run.mjs'

// Egyptian names for realism
const FIRST_NAMES = ['Ahmed','Mohamed','Mahmoud','Omar','Ali','Hassan','Hussein','Karim','Youssef','Amr','Khaled','Tarek','Mostafa','Sherif','Wael','Nour','Layla','Fatima','Aisha','Mariam','Nada','Heba','Rania','Sara','Mona','Dina','Yasmin','Salma','Hana','Farida']
const LAST_NAMES = ['Ibrahim','Hassan','Ali','Sayed','Mahmoud','Abdelrahman','Fathy','Nasser','Youssef','Omar']

const ORG_NAMES = ['Zamalek Sporting Club','Gezira Club','Heliopolis Sporting Club','Cairo Fitness Center','Egyptian Market Traders']
const BRANCH_AREAS = ['Zamalek','Maadi','Heliopolis','Nasr City','6th of October','Sheikh Zayed','New Cairo','Dokki','Mohandessin','Garden City']
const RESOURCE_NAMES = ['Court 1','Court 2','Court 3','Court 4','Main Court','VIP Court','Pool Lane 1','Pool Lane 2','Training Court','Championship Court']

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDecimal(min, max, decimals = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(decimals)) }
function randomPhone() { return `01${rand(0,2)}${String(rand(10000000,99999999))}` }
function randomDate(start, end) {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return d.toISOString().split('T')[0]
}
function randomTime() {
  const h = rand(6, 23); const m = rand(0, 3) * 15
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}
function endTime(start) {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + rand(1, 4) * 30
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}
function uuid() { return randomUUID() }

export default async function comprehensive(conn, ctx) {
  let total = 0
  console.log('  Generating comprehensive seed data...')

  // Fetch actual sport IDs from DB to avoid stale mappings
  const [sportRows] = await conn.query('SELECT id FROM sports ORDER BY id')
  const sportIds = sportRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 1. USERS (50)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Users...')
  const users = []
  const wallets = []
  for (let i = 0; i < 50; i++) {
    const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES)
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@courtzon.test`
    const phone = randomPhone()
    const uid = uuid()
    users.push({
      public_id: uid,
      country_id: 1,
      phone_number: phone,
      full_phone: `+20${phone}`,
      email,
      password_hash: '$2b$10$placeholderhash',
      full_name: `${fn} ${ln}`,
      gender: Math.random() > 0.5 ? 'male' : 'female',
      birth_date: randomDate(new Date('1985-01-01'), new Date('2005-01-01')),
      language_id: Math.random() > 0.3 ? 1 : 2,
      timezone: 'Africa/Cairo',
      account_status: Math.random() > 0.05 ? 'active' : pick(['suspended', 'banned']),
      is_phone_verified: 1,
      is_email_verified: Math.random() > 0.2 ? 1 : 0,
      version: 1,
    })
  }
  total += await batchInsert(conn, 'users',
    ['public_id','country_id','phone_number','full_phone','email','password_hash','full_name','gender','birth_date','language_id','timezone','account_status','is_phone_verified','is_email_verified','version'],
    users)

  // Get actual user IDs
  const [userRows] = await conn.query('SELECT id, full_name, email FROM users ORDER BY id')
  const userIdMap = {}
  for (const r of userRows) userIdMap[r.id] = r
  ctx.userIds = userRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PLAYER PROFILES (all users)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Player profiles...')
  const profiles = []
  for (const u of userRows) {
    profiles.push({ user_id: u.id, main_sport_id: sportIds.length ? sportIds[rand(0, sportIds.length - 1)] : null, main_level_id: rand(1, 5), is_coach: Math.random() > 0.85 ? 1 : 0, is_seller: 0 })
  }
  total += await batchInsert(conn, 'player_profiles', ['user_id','main_sport_id','main_level_id','is_coach','is_seller'], profiles)

  // ──────────────────────────────────────────────────────────────────────────
  // 3. USER WALLETS (all users)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Wallets...')
  const walletData = []
  for (const u of userRows) {
    walletData.push({ user_id: u.id, balance: randDecimal(100, 5000), currency_code: 'EGP', version: 1 })
  }
  total += await batchInsert(conn, 'user_wallets', ['user_id','balance','currency_code','version'], walletData)

  const [walletRows] = await conn.query('SELECT id, user_id, balance FROM user_wallets ORDER BY id')
  const walletByUser = {}
  for (const w of walletRows) walletByUser[w.user_id] = w

  // ──────────────────────────────────────────────────────────────────────────
  // 4. ORGANISATIONS (5: 3 clubs, 1 gym, 1 seller)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Organisations...')
  const orgs = []
  for (let i = 0; i < 5; i++) {
    const name = ORG_NAMES[i]
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const orgTypeId = i < 3 ? 5 : i === 3 ? 6 : 10 // club, club, club, gym, seller
    orgs.push({
      public_id: uuid(),
      org_type_id: orgTypeId,
      owner_id: userRows[i].id,
      name,
      slug: `${slug}-${i}`,
      description: `${name} — premier sports and wellness destination`,
      email: `contact@${slug}.test`,
      phone: randomPhone(),
      website: `https://${slug}.test`,
      country_id: 1,
      is_verified: 1,
      is_active: 1,
      rating_avg: randDecimal(3.5, 5.0, 1),
      rating_count: rand(5, 200),
      version: 1,
    })
  }
  total += await batchInsert(conn, 'organisations',
    ['public_id','org_type_id','owner_id','name','slug','description','email','phone','website','country_id','is_verified','is_active','rating_avg','rating_count','version'],
    orgs)

  const [orgRows] = await conn.query('SELECT id, org_type_id, name FROM organisations ORDER BY id')
  ctx.orgIds = orgRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 5. ORGANISATION FINANCIAL DETAILS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Org financial details...')
  const finDetails = []
  for (const org of orgRows) {
    finDetails.push({
      organisation_id: org.id,
      bank_name: pick(['National Bank of Egypt','Banque Misr','CIB','HSBC Egypt','QNB']),
      bank_account_name: org.name,
      bank_account_number: String(rand(1000000000, 9999999999)),
      iban: `EG${rand(1000000000, 9999999999)}`,
      billing_email: `billing@${org.name.toLowerCase().replace(/\s+/g, '')}.com`,
      commission_rate: randDecimal(5, 18),
      payout_schedule: pick(['weekly','biweekly','monthly']),
      currency_id: 2,
    })
  }
  total += await batchInsert(conn, 'organisation_financial_details',
    ['organisation_id','bank_name','bank_account_name','bank_account_number','iban','billing_email','commission_rate','payout_schedule','currency_id'],
    finDetails)

  // ──────────────────────────────────────────────────────────────────────────
  // 6. BRANCHES (2 per org = 10)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Branches...')
  const branches = []
  for (let i = 0; i < orgRows.length; i++) {
    for (let b = 0; b < 2; b++) {
      const area = pick(BRANCH_AREAS)
      const name = b === 0 ? `${orgRows[i].name} — Main` : `${orgRows[i].name} — ${area}`
      branches.push({
        public_id: uuid(),
        organisation_id: orgRows[i].id,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        description: `Branch in ${area}`,
        email: `branch@${orgRows[i].name.toLowerCase().replace(/\s+/g, '')}.test`,
        phone: randomPhone(),
        address_line1: `${rand(1, 50)} ${pick(['El Tahrir','El Nasr','El Hegaz','El Orouba'])} St`,
        city: area,
        country_id: 1,
        postal_code: String(rand(10000, 99999)),
        latitude: randDecimal(29.9, 30.1, 6),
        longitude: randDecimal(31.1, 31.4, 6),
        access_type: 'open',
        is_active: 1,
        rating_avg: randDecimal(3.0, 5.0, 1),
        rating_count: rand(2, 100),
        version: 1,
      })
    }
  }
  total += await batchInsert(conn, 'branches',
    ['public_id','organisation_id','name','slug','description','email','phone','address_line1','city','country_id','postal_code','latitude','longitude','access_type','is_active','rating_avg','rating_count','version'],
    branches)

  const [branchRows] = await conn.query('SELECT id, organisation_id, name FROM branches ORDER BY id')
  ctx.branchIds = branchRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 7. RESOURCES (3 courts + 2 pools per branch = 5 per branch, 50 total)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Resources...')
  const resources = []
  for (const br of branchRows) {
    for (let r = 0; r < 5; r++) {
      const isPool = r >= 3
      resources.push({
        public_id: uuid(),
        branch_id: br.id,
        resource_type_id: isPool ? 2 : 1,
        sport_id: isPool ? null : pick(sportIds),
        name: isPool ? `Pool Lane ${r - 2}` : RESOURCE_NAMES[r],
        description: isPool ? '25m pool lane' : 'Professional-grade court with lighting',
        capacity: isPool ? 1 : rand(2, 4),
        hourly_price: randDecimal(50, 500),
        is_active: 1,
        slot_duration: 60,
        max_bookings_per_slot: 1,
        version: 1,
      })
    }
  }
  total += await batchInsert(conn, 'resources',
    ['public_id','branch_id','resource_type_id','sport_id','name','description','capacity','hourly_price','is_active','slot_duration','max_bookings_per_slot','version'],
    resources)

  const [resourceRows] = await conn.query('SELECT id, branch_id, name, hourly_price FROM resources ORDER BY id')
  ctx.resourceIds = resourceRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 8. BOOKINGS (200)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Bookings...')
  const bookingStatuses = ['pending','confirmed','cancelled','completed']
  const paymentStatuses = ['pending','paid','partial','refunded','failed']
  const bookingTypes = ['public_match','private_match','academy','clinic','coach_session']
  const bookings = []
  const now = new Date()

  for (let i = 0; i < 200; i++) {
    const resource = pick(resourceRows)
    const branch = branchRows.find(b => b.id === resource.branch_id)
    const org = orgRows.find(o => o.id === branch.organisation_id)
    const user = pick(userRows)
    const dateOffset = rand(-30, 30)
    const bdate = new Date(now)
    bdate.setDate(bdate.getDate() + dateOffset)
    const bookingDate = bdate.toISOString().split('T')[0]
    const startTime = randomTime()
    const et = endTime(startTime)
    const price = Number(resource.hourly_price) * ((parseInt(et.split(':')[0]) - parseInt(startTime.split(':')[0])) + 1)
    const commission = Math.round(price * randDecimal(0.05, 0.18) * 100) / 100
    const net = Math.round((price - commission) * 100) / 100
    const bStatus = dateOffset > 0 ? pick(['confirmed','pending','completed']) : pick(['completed','cancelled'])
    const pStatus = bStatus === 'completed' ? 'paid' : bStatus === 'cancelled' ? pick(['refunded','failed']) : pick(['pending','paid'])

    bookings.push({
      public_id: uuid(),
      user_id: user.id,
      organisation_id: org.id,
      branch_id: branch.id,
      resource_id: resource.id,
      booking_type: pick(bookingTypes),
      booking_date: bookingDate,
      start_time: startTime,
      end_time: et,
      total_amount: price,
      commission_rate: commission > 0 ? randDecimal(5, 18) : 0,
      commission_amount: commission,
      net_amount: net,
      club_amount: net,
      payment_status: pStatus,
      booking_status: bStatus,
      version: 1,
    })
  }
  total += await batchInsert(conn, 'bookings',
    ['public_id','user_id','organisation_id','branch_id','resource_id','booking_type','booking_date','start_time','end_time','total_amount','commission_rate','commission_amount','net_amount','club_amount','payment_status','booking_status','version'],
    bookings)

  const [bookingRows] = await conn.query('SELECT id, user_id, organisation_id, branch_id, resource_id, total_amount, commission_amount, payment_status, booking_status FROM bookings ORDER BY id')
  ctx.bookingIds = bookingRows.map(r => r.id)

  // ──────────────────────────────────────────────────────────────────────────
  // 9. TRANSACTIONS + ENTRIES (double-entry for wallet-paid bookings)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Transactions & entries...')
  let txnTotal = 0
  const walletPaidBookings = bookingRows.filter(b => b.payment_status === 'paid')

  for (const b of walletPaidBookings.slice(0, 80)) {
    const wallet = walletByUser[b.user_id]
    if (!wallet) continue

    const [txnRes] = await conn.query(
      `INSERT INTO transactions (type, source_type, source_id, currency_id, total_amount, status) VALUES ('booking_payment','booking',?,2,?,'completed')`,
      [b.id, Number(b.total_amount)]
    )
    const txnId = txnRes.insertId
    const netAmount = Number(b.total_amount) - (Number(b.commission_amount) || 0)

    const entries = [
      [txnId, 'debit', 'user_wallet', wallet.id, Number(b.total_amount), 2, null, null, `Booking #${b.id} payment`],
      [txnId, 'credit', 'platform_account', 1, Number(b.total_amount), 2, null, null, `Received booking #${b.id}`],
      [txnId, 'debit', 'platform_account', 1, Number(b.total_amount), 2, null, null, `Route booking #${b.id}`],
      [txnId, 'credit', 'branch', b.branch_id, netAmount, 2, b.branch_id, b.organisation_id, `Revenue booking #${b.id}`],
      [txnId, 'credit', 'platform_account', 2, Number(b.commission_amount) || 0, 2, null, null, `Commission booking #${b.id}`],
    ]

    for (const e of entries) {
      await conn.query(
        `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description) VALUES (?,?,?,?,?,?,?,?,?)`,
        e
      )
      txnTotal++
    }
  }

  // Wallet topups (20)
  for (let i = 0; i < 20; i++) {
    const user = pick(userRows)
    const wallet = walletByUser[user.id]
    if (!wallet) continue
    const amount = randDecimal(100, 2000)
    const [tr] = await conn.query(
      `INSERT INTO transactions (type, source_type, currency_id, total_amount, status) VALUES ('wallet_topup','admin',2,?,'completed')`,
      [amount]
    )
    await conn.query(
      `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tr.insertId, 'debit', 'platform_account', 1, amount, 2, 'Wallet topup funding']
    )
    await conn.query(
      `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tr.insertId, 'credit', 'user_wallet', wallet.id, amount, 2, `Topup ${amount} EGP`]
    )
    txnTotal += 2
  }
  console.log(`    ├─ ${txnTotal} transaction entries created`)
  total += txnTotal

  // ──────────────────────────────────────────────────────────────────────────
  // 10. SELLER PROFILES + PRODUCTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Sellers & Products...')
  const sellerOrg = orgRows.find(o => o.org_type_id === 10)
  if (sellerOrg) {
    const sellerBranch = branchRows.find(b => b.organisation_id === sellerOrg.id)
    const sellerUser = pick(userRows.slice(0, 10))

    const [spRes] = await conn.query(
      `INSERT INTO seller_profiles (user_id, organisation_id, branch_id, shop_name, shop_description, is_subscribed, max_free_listings, total_listings, is_active)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [sellerUser.id, sellerOrg.id, sellerBranch?.id || null, 'Egyptian Sports Shop', 'Premium sports equipment', 1, 5, 8, 1]
    )
    const sellerId = spRes.insertId
    ctx.sellerIds = [sellerId]

    await conn.query(`UPDATE player_profiles SET is_seller = 1 WHERE user_id = ?`, [sellerUser.id])

    const productData = []
    const productNames = ['Tennis Racket Pro','Squash Ball Set','Football Jersey','Swimming Goggles','Basketball','Yoga Mat','Gym Bag','Running Shoes']
    for (let p = 0; p < 8; p++) {
      productData.push({
        seller_id: sellerId,
        category_id: rand(1, 8),
        name: productNames[p],
        description: `High quality ${productNames[p].toLowerCase()}`,
        price: randDecimal(50, 2000),
        currency_code: 'EGP',
        quantity: rand(5, 100),
        status: pick(['active','active','active','draft']),
        is_active: 1,
      })
    }
    total += await batchInsert(conn, 'products',
      ['seller_id','category_id','name','description','price','currency_code','quantity','status','is_active'],
      productData)
    const [prodRows] = await conn.query('SELECT id FROM products WHERE seller_id = ?', [sellerId])
    ctx.productIds = prodRows.map(r => r.id)

    // Seller subscription
    await conn.query(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew)
       VALUES (?, 5, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1)`,
      [sellerOrg.id]
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 11. ORG SUBSCRIPTIONS (for clubs/gym)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Subscriptions...')
  for (const org of orgRows.filter(o => o.org_type_id !== 10)) {
    await conn.query(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew)
       VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1)`,
      [org.id, pick([1, 2, 3])]
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 12. SETTLEMENTS (3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Settlements...')
  for (let s = 0; s < 3; s++) {
    const org = orgRows[s]
    const [sRes] = await conn.query(
      `INSERT INTO settlements (organisation_id, settlement_type, gross_amount, commission_amount, net_amount, settlement_status, settlement_period_start, settlement_period_end)
       VALUES (?, 'org_to_courtzon', ?, ?, ?, 'completed', CURDATE() - INTERVAL 7 DAY, CURDATE())`,
      [org.id, randDecimal(5000, 50000), randDecimal(500, 5000), randDecimal(4500, 45000)]
    )
    const sId = sRes.insertId
    const orgBranches = branchRows.filter(b => b.organisation_id === org.id)
    for (const b of orgBranches.slice(0, 2)) {
      await conn.query(
        `INSERT INTO settlement_items (settlement_id, booking_id, gross_amount, commission_amount, net_amount, branch_id) VALUES (?,NULL,?,?,?,?)`,
        [sId, randDecimal(500, 5000), randDecimal(50, 500), randDecimal(450, 4500), b.id]
      )
      total++
    }
    total++
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 13. NOTIFICATIONS (100)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Notifications...')
  const notifs = []
  for (let i = 0; i < 100; i++) {
    const u = pick(userRows)
    notifs.push({
      user_id: u.id,
      category_id: rand(1, 5),
      title: pick(['Booking Confirmed','Payment Received','New Message','Reminder','Welcome!']),
      body: pick(['Your booking has been confirmed','Payment processed successfully','You have a new message','Upcoming booking in 1 hour','Welcome to CourtZon!']),
      is_read: Math.random() > 0.5 ? 1 : 0,
      is_pushed: 1,
    })
  }
  total += await batchInsert(conn, 'notifications', ['user_id','category_id','title','body','is_read','is_pushed'], notifs)

  // ──────────────────────────────────────────────────────────────────────────
  // 14. ACTIVITY LOGS (100)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Activity logs...')
  const activities = []
  const activityTypes = ['login','booking.create','booking.cancel','wallet.deposit','wallet.withdraw','profile.update','product.create','order.place']
  for (let i = 0; i < 100; i++) {
    const u = pick(userRows)
    const atype = pick(activityTypes)
    activities.push({
      user_id: u.id,
      activity_type: atype,
      description: `${u.full_name} performed ${atype}`,
      ip_address: `192.168.1.${rand(1, 255)}`,
    })
  }
  total += await batchInsert(conn, 'activity_logs', ['user_id','activity_type','description','ip_address'], activities)

  // ──────────────────────────────────────────────────────────────────────────
  // 15. AUDIT LOGS (50)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Audit logs...')
  const audits = []
  for (let i = 0; i < 50; i++) {
    const u = pick(userRows)
    const action = pick(['booking.create','booking.cancel','user.update','org.update','wallet.deposit','product.create','order.status_change'])
    audits.push({
      actor_id: u.id,
      action,
      entity_type: action.split('.')[0],
      entity_id: rand(1, 50),
      ip_address: `192.168.1.${rand(1, 255)}`,
    })
  }
  total += await batchInsert(conn, 'audit_logs', ['actor_id','action','entity_type','entity_id','ip_address'], audits)

  // ──────────────────────────────────────────────────────────────────────────
  // 16. PLAYER LEVELS (seed if missing)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Player levels...')
  await conn.query(`INSERT IGNORE INTO player_levels (id, name, level_order, is_active) VALUES
    (1,'Beginner',1,1),(2,'Intermediate',2,1),(3,'Advanced',3,1),(4,'Professional',4,1),(5,'Elite',5,1)`)

  // ──────────────────────────────────────────────────────────────────────────
  // 17. NOTIFICATION ACTIONS + CATEGORIES
  // ──────────────────────────────────────────────────────────────────────────
  console.log('  ├─ Notification config...')
  await conn.query(`INSERT IGNORE INTO notification_categories (id, slug, is_active, sort_order) VALUES
    (1,'booking',1,1),(2,'payment',1,2),(3,'system',1,3),(4,'social',1,4),(5,'marketplace',1,5)`)

  console.log(`\n  ✅ Comprehensive seed complete — ${total} rows inserted`)
  return total
}
