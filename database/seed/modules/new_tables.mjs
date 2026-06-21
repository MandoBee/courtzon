import { batchInsert } from '../run.mjs'

export default async function newTables(conn, ctx) {
  let total = 0
  console.log('  Generating data for new tables (transactions, entries, sellers, settlements)...')

  // Get existing data
  const [users] = await conn.query('SELECT id FROM users')
  const [orgs] = await conn.query('SELECT id, org_type_id, name FROM organisations')
  const [branches] = await conn.query('SELECT id, organisation_id, name FROM branches')
  const [plans] = await conn.query('SELECT id, plan_name FROM subscription_plans WHERE is_active = 1')

  if (!users.length) { console.log('  No users found, skipping'); return 0 }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
  function randDecimal(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(2)) }
  function uuid() { const { randomUUID } = require('crypto') || require('node:crypto'); return crypto ? crypto.randomUUID() : '' }

  // Ensure wallets exist for all users
  console.log('  ├─ Ensuring wallets...')
  const walletMap = {}
  const [existingWallets] = await conn.query('SELECT id, user_id, balance FROM user_wallets')
  for (const w of existingWallets) walletMap[w.user_id] = w

  for (const u of users) {
    if (!walletMap[u.id]) {
      const [wRes] = await conn.query('INSERT INTO user_wallets (user_id, balance, currency_code) VALUES (?, ?, ?)', [u.id, randDecimal(200, 5000), 'EGP'])
      walletMap[u.id] = { id: wRes.insertId, user_id: u.id, balance: randDecimal(200, 5000) }
      total++
    }
  }

  // ── 1. TRANSACTIONS + ENTRIES (independent of bookings) ─────────────────
  console.log('  ├─ Transactions & entries...')
  let txnEntries = 0

  // Wallet topups (40)
  for (let i = 0; i < 40; i++) {
    const u = pick(users)
    const wallet = walletMap[u.id]
    if (!wallet) continue
    const amount = randDecimal(100, 2000)
    const [tr] = await conn.query(`INSERT INTO transactions (type, source_type, currency_id, total_amount, status) VALUES ('wallet_topup','admin',2,?,'completed')`, [amount])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tr.insertId, 'debit', 'platform_account', 1, amount, 2, 'Wallet topup funding'])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tr.insertId, 'credit', 'user_wallet', wallet.id, amount, 2, `Topup ${amount} EGP`])
    txnEntries += 2
  }

  // Booking-style payments (60 simulated, using branches directly)
  for (let i = 0; i < 60; i++) {
    const u = pick(users)
    const wallet = walletMap[u.id]
    const branch = pick(branches)
    if (!wallet || !branch) continue
    const gross = randDecimal(50, 1000)
    const comm = Math.round(gross * randDecimal(5, 18) * 100) / 100
    const net = gross - comm

    const [tr] = await conn.query(`INSERT INTO transactions (type, source_type, currency_id, total_amount, status) VALUES ('booking_payment','booking',2,?,'completed')`, [gross])
    const tId = tr.insertId
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tId, 'debit', 'user_wallet', wallet.id, gross, 2, `Booking payment`])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tId, 'credit', 'platform_account', 1, gross, 2, `Received booking payment`])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tId, 'debit', 'platform_account', 1, gross, 2, `Route payment`])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description) VALUES (?,?,?,?,?,?,?,?,?)`,
      [tId, 'credit', 'branch', branch.id, net, 2, branch.id, branch.organisation_id, `Branch revenue`])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tId, 'credit', 'platform_account', 2, comm, 2, `Commission`])
    txnEntries += 5
  }

  // Refunds (20)
  for (let i = 0; i < 20; i++) {
    const u = pick(users)
    const wallet = walletMap[u.id]
    const branch = pick(branches)
    if (!wallet || !branch) continue
    const refundAmt = randDecimal(30, 500)
    const [tr] = await conn.query(`INSERT INTO transactions (type, source_type, currency_id, total_amount, status) VALUES ('refund','booking',2,?,'completed')`, [refundAmt])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description) VALUES (?,?,?,?,?,?,?,?,?)`,
      [tr.insertId, 'debit', 'branch', branch.id, refundAmt, 2, branch.id, branch.organisation_id, `Refund`])
    await conn.query(`INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, description) VALUES (?,?,?,?,?,?,?)`,
      [tr.insertId, 'credit', 'user_wallet', wallet.id, refundAmt, 2, `Refund ${refundAmt} EGP`])
    txnEntries += 2
  }
  console.log(`    ├─ ${txnEntries} transaction entries created`)
  total += txnEntries

  // ── 2. SELLER DATA ─────────────────────────────────────────────────────
  console.log('  ├─ Seller profiles...')
  const sellerOrg = orgs.find(o => o.org_type_id === 10)
  if (sellerOrg) {
    const sellerBranch = branches.find(b => b.organisation_id === sellerOrg.id)
    const sellerUser = users[Math.min(4, users.length - 1)]
    const [spRes] = await conn.query(
      `INSERT INTO seller_profiles (user_id, organisation_id, branch_id, shop_name, shop_description, is_subscribed, max_free_listings, total_listings, is_active) VALUES (?,?,?,?,?,?,?,?,?)`,
      [sellerUser.id, sellerOrg.id, sellerBranch?.id || null, 'Egyptian Sports Shop', 'Premium sports equipment and apparel', 1, 5, 8, 1]
    )
    const sellerId = spRes.insertId
    total++
    await conn.query(`UPDATE player_profiles SET is_seller = 1 WHERE user_id = ?`, [sellerUser.id])

    const productData = [
      ['Tennis Racket Pro','Professional tennis racket', randDecimal(500, 2000), 'EGP', rand(10, 50), 'active'],
      ['Squash Ball Set','2-pack Dunlop balls', randDecimal(100, 300), 'EGP', rand(20, 100), 'active'],
      ['Football Jersey','Egypt national team', randDecimal(200, 600), 'EGP', rand(5, 30), 'active'],
      ['Swimming Goggles','Anti-fog pro goggles', randDecimal(50, 150), 'EGP', rand(10, 80), 'active'],
      ['Basketball','Official size 7', randDecimal(150, 400), 'EGP', rand(5, 25), 'active'],
      ['Yoga Mat','Premium 6mm mat', randDecimal(100, 300), 'EGP', rand(15, 60), 'draft'],
      ['Gym Bag','Duffel bag 50L', randDecimal(80, 250), 'EGP', rand(10, 40), 'active'],
      ['Running Shoes','Lightweight trainers', randDecimal(300, 800), 'EGP', rand(5, 20), 'active'],
    ]
    const prodRows = productData.map(p => ({
      seller_id: sellerId, category_id: rand(1, 8), name: p[0], description: p[1], price: p[2], currency_code: p[3], quantity: p[4], status: p[5], is_active: 1,
    }))
    total += await batchInsert(conn, 'products', ['seller_id','category_id','name','description','price','currency_code','quantity','status','is_active'], prodRows)

    await conn.query(`INSERT INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew) VALUES (?, 5, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1) ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id)`, [sellerOrg.id])

    ctx.sellerIds = [sellerId]
    const [prodIds] = await conn.query('SELECT id FROM products WHERE seller_id = ?', [sellerId])
    ctx.productIds = prodIds.map(r => r.id)
  }

  // ── 3. SUBSCRIPTIONS ───────────────────────────────────────────────────
  console.log('  ├─ Organisation subscriptions...')
  for (const org of orgs.filter(o => o.org_type_id !== 10)) {
    const plan = pick(plans.filter(p => !p.plan_name.includes('Seller')))
    await conn.query(
      `INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew) VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1)`,
      [org.id, plan.id]
    )
    total++
  }

  // ── 4. SETTLEMENTS ─────────────────────────────────────────────────────
  console.log('  ├─ Settlements...')
  for (let s = 0; s < Math.min(5, orgs.length); s++) {
    const org = orgs[s]
    const orgBranches = branches.filter(b => b.organisation_id === org.id)
    if (!orgBranches.length) continue

    const gross = randDecimal(5000, 50000)
    const comm = Math.round(gross * randDecimal(5, 18) * 100) / 100
    const net = gross - comm

    const [sRes] = await conn.query(
      `INSERT INTO settlements (organisation_id, settlement_type, gross_amount, commission_amount, net_amount, settlement_status, settlement_period_start, settlement_period_end) VALUES (?, 'org_to_courtzon', ?, ?, ?, ?, CURDATE() - INTERVAL 7 DAY, CURDATE())`,
      [org.id, gross, comm, net, s % 2 === 0 ? 'completed' : 'processing']
    )
    const sId = sRes.insertId
    for (const b of orgBranches.slice(0, 3)) {
      const itemGross = randDecimal(500, 10000)
      const itemComm = Math.round(itemGross * randDecimal(5, 18) * 100) / 100
      await conn.query(
        `INSERT INTO settlement_items (settlement_id, booking_id, gross_amount, commission_amount, net_amount, branch_id) VALUES (?,NULL,?,?,?,?)`,
        [sId, itemGross, itemComm, itemGross - itemComm, b.id]
      )
      total++
    }
    total++
  }

  // ── 5. WITHDRAWAL REQUESTS ─────────────────────────────────────────────
  console.log('  ├─ Withdrawal requests...')
  const withdrawalData = []
  for (let i = 0; i < 10; i++) {
    const u = pick(users)
    const wallet = walletMap[u.id]
    if (!wallet || Number(wallet.balance) < 100) continue
    withdrawalData.push({
      user_id: u.id, wallet_id: wallet.id,
      amount: randDecimal(50, Math.min(500, Number(wallet.balance) * 0.5)),
      status: pick(['pending','pending','approved','completed','cancelled']),
      admin_notes: Math.random() > 0.5 ? 'Auto-approved' : null,
    })
  }
  total += await batchInsert(conn, 'withdrawal_requests', ['user_id','wallet_id','amount','status','admin_notes'], withdrawalData)

  // ── 6. NOTIFICATIONS ───────────────────────────────────────────────────
  console.log('  ├─ Notifications...')
  const notifData = []
  for (let i = 0; i < 50; i++) {
    const u = pick(users)
    notifData.push({
      user_id: u.id, category_id: rand(1, 5),
      title: pick(['Booking Confirmed','Payment Received','New Message','Reminder','Welcome!','Settlement Complete']),
      body: pick(['Your booking has been confirmed.','Payment processed successfully.','You have a new message.','Upcoming booking in 1 hour.','Welcome to CourtZon!','Your settlement has been completed.']),
      is_read: Math.random() > 0.4 ? 1 : 0, is_pushed: 1,
    })
  }
  total += await batchInsert(conn, 'notifications', ['user_id','category_id','title','body','is_read','is_pushed'], notifData)

  console.log(`\n  ✅ New tables seed complete — ${total} rows inserted`)
  return total
}
