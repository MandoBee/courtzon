import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const orgs = [
    { id: 1, public_id: 'o00000001-0000-4000-8000-000000000001', org_type_id: 1, owner_id: ctx.userIds[0], name: 'Gezeta Sporting Club', slug: 'gezeta-sc', description: 'Prestigious multi-sport club established in 1882 in Zamalek, Cairo', email: 'info@gezeta.com.eg', phone: '0227380000', website: 'https://gezeta.com.eg', cr_number: 'CR-123456', is_verified: 1, is_active: 1, version: 1 },
    { id: 2, public_id: 'o00000001-0000-4000-8000-000000000002', org_type_id: 1, owner_id: ctx.userIds[1], name: 'Wadi Degla Sporting Club', slug: 'wadi-degla-sc', description: 'Modern sports complex in New Cairo with world-class facilities', email: 'info@wadidegla.com', phone: '0224610000', website: 'https://wadidegla.com', cr_number: 'CR-789012', is_verified: 1, is_active: 1, version: 1 },
    { id: 3, public_id: 'o00000001-0000-4000-8000-000000000003', org_type_id: 1, owner_id: ctx.userIds[2], name: 'Smouha Sporting Club', slug: 'smouha-sc', description: 'Historic Alexandria-based sports club with excellent facilities', email: 'info@smouha.com', phone: '034270000', cr_number: 'CR-345678', is_verified: 1, is_active: 1, version: 1 },
    { id: 4, public_id: 'o00000001-0000-4000-8000-000000000004', org_type_id: 1, owner_id: ctx.userIds[1], name: 'Shams Sporting Club', slug: 'shams-sc', description: 'Premier sports club in Cairo', email: 'info@shamsclub.com', phone: '0224560000', is_verified: 0, is_active: 1, version: 1 },
    { id: 5, public_id: 'o00000001-0000-4000-8000-000000000005', org_type_id: 2, owner_id: ctx.userIds[0], name: 'Black Ball Academy', slug: 'black-ball-academy', description: 'Elite sports academy in New Cairo specializing in padel and tennis', email: 'info@blackball.eg', phone: '0225360000', website: 'https://blackball.eg', cr_number: 'CR-901234', is_verified: 1, is_active: 1, version: 1 },
    { id: 6, public_id: 'o00000001-0000-4000-8000-000000000006', org_type_id: 1, owner_id: ctx.userIds[2], name: 'Police Union Club', slug: 'police-union', description: 'Sports club affiliated with the Egyptian Police', email: 'info@policeunion.eg', phone: '0238470000', is_verified: 0, is_active: 1, version: 1 },
    { id: 7, public_id: 'o00000001-0000-4000-8000-000000000007', org_type_id: 1, owner_id: ctx.userIds[0], name: 'Sporting Club Alexandria', slug: 'sporting-alex', description: 'Historic Alexandria sports club founded in 1890', email: 'info@sporting-alex.com', phone: '035831000', cr_number: 'CR-567890', is_verified: 1, is_active: 1, version: 1 },
    { id: 8, public_id: 'o00000001-0000-4000-8000-000000000008', org_type_id: 1, owner_id: ctx.userIds[3], name: 'El Rawad Sporting Club', slug: 'el-rawad-sc', description: 'Modern sports club in Giza with comprehensive facilities', email: 'info@elrawad.eg', phone: '0238000000', is_verified: 0, is_active: 1, version: 1 },
  ]
  total += await batchInsert(conn, 'organisations', ['id','public_id','org_type_id','owner_id','name','slug','description','email','phone','website','cr_number','is_verified','is_active','version'], orgs)
  ctx.orgIds = orgs.map(o => o.id)

  const branches = []
  let brId = 1
  const branchNames = ['Main Branch', 'North Complex', 'South Arena', 'East Wing', 'West Campus', 'Premier Clubhouse', 'Sports Village', 'Elite Center']
  const baseCities = ['Cairo', 'New Cairo', 'Alexandria', 'Cairo', 'New Cairo', 'Giza', 'Alexandria', 'Giza']
  const baseStates = ['Cairo Governorate', 'Cairo Governorate', 'Alexandria Governorate', 'Cairo Governorate', 'Cairo Governorate', 'Giza Governorate', 'Alexandria Governorate', 'Giza Governorate']
  for (const org of orgs) {
    for (let b = 0; b < 2 && brId <= 16; b++) {
      const idx = (brId - 1) % 8
      branches.push({
        id: brId,
        public_id: `b${String(brId).padStart(8, '0')}-0000-4000-8000-${String(brId).padStart(12, '0')}`,
        organisation_id: org.id,
        name: `${org.name} — ${branchNames[idx]}`,
        slug: `${org.slug}-branch-${b + 1}`,
        description: `${branchNames[idx]} of ${org.name}`,
        email: `branch${brId}@${org.slug}.eg`,
        phone: `+2010${String(7000000 + brId * 1000).slice(0, 9)}`,
        address_line1: `${Math.floor(Math.random() * 200) + 1} ${['Sports Avenue','Olympic Road','Champions Street','Victory Lane','Athletes Boulevard'][idx]}`,
        city: baseCities[idx],
        state: baseStates[idx],
        country_id: 1,
        postal_code: String(10000 + Math.floor(Math.random() * 90000)),
        access_type: ['open','open','restricted','open','open','invite_only','open','restricted'][idx % 8],
        is_active: 1,
        currency_id: 1,
        timezone: 'Africa/Cairo',
        version: 1,
        created_at: NOW,
      })
      brId++
    }
  }
  total += await batchInsert(conn, 'branches', ['id','public_id','organisation_id','name','slug','description','email','phone','address_line1','city','state','country_id','postal_code','access_type','is_active','currency_id','timezone','version','created_at'], branches)
  ctx.branchIds = branches.map(b => b.id)

  // Fetch actual sport IDs from DB
  const [sportRows] = await conn.query("SELECT id, LOWER(name) as name FROM sports")
  const sportMap = Object.fromEntries(sportRows.map(r => [r.name, r.id]))

  const resources = []
  let resId = 1
  for (const branch of branches) {
    const orgIdx = orgs.findIndex(o => o.id === branch.organisation_id)
    const resourceCount = orgIdx === 0 ? 4 : (orgIdx === 1 ? 3 : 2)
    for (let r = 0; r < resourceCount && resId <= 50; r++) {
      const typeId = [2, 3, 1, 5, 6, 8, 9][resId % 7]
      const sportName = { 1: 'football', 2: 'padel', 3: 'tennis', 5: 'squash', 6: 'swimming' }[typeId]
      const sportId = sportName ? (sportMap[sportName] || null) : null
      const capacity = typeId === 1 ? 22 : (typeId === 6 ? 8 : (typeId === 2 ? 4 : 2))
      const names = ['Padel Court','Tennis Court','Football Pitch','Squash Court','Swimming Pool','Multi-Purpose Hall','Yoga Studio']
      resources.push({
        id: resId,
        public_id: `r${String(resId).padStart(8, '0')}-0000-4000-8000-${String(resId).padStart(12, '0')}`,
        branch_id: branch.id,
        resource_type_id: typeId,
        sport_id: sportId,
        name: `${names[resId % 7]} ${Math.ceil(resId / 7)}`,
        description: `${['Indoor','Outdoor'][resId % 2]} ${['padel','tennis','football','squash','swimming','multi-purpose','yoga'][resId % 7]} facility at ${branch.name}`,
        capacity: capacity,
        hourly_price: [300, 250, 800, 200, 150, 500, 200][resId % 7],
        images: JSON.stringify([`/images/resources/${names[resId % 7].toLowerCase().replace(/\s+/g, '-')}-${Math.ceil(resId / 7)}.jpg`]),
        is_active: 1,
        slot_duration: typeId === 1 ? 90 : 60,
        max_bookings_per_slot: 1,
        version: 1,
        created_at: NOW,
      })
      resId++
    }
  }
  total += await batchInsert(conn, 'resources', ['id','public_id','branch_id','resource_type_id','sport_id','name','description','capacity','hourly_price','images','is_active','slot_duration','max_bookings_per_slot','version','created_at'], resources)
  ctx.resourceIds = resources.map(r => r.id)

  const resAttrs = []
  let raId = 1
  for (const res of resources) {
    const attrVals = {
      1: { attrId: 1, val: resId % 2 === 1 ? '7-a-side' : '11-a-side' },
      2: { attrId: res.id % 2 === 0 ? 4 : 3, val: res.id % 2 === 0 ? 'Outdoor' : 'Indoor' },
      3: { attrId: res.id % 2 === 0 ? 5 : 6, val: res.id % 2 === 0 ? 'Hard' : 'Indoor' },
      6: { attrId: 7, val: 'Semi-Olympic' },
      9: { attrId: 10, val: 'Hatha' },
    }
    const mapping = attrVals[res.resource_type_id]
    if (mapping) {
      resAttrs.push({
        id: raId++,
        resource_id: res.id,
        attribute_id: mapping.attrId,
        value: mapping.val,
      })
    }
  }
  total += await batchInsert(conn, 'resource_attribute_values', ['id','resource_id','attribute_id','value'], resAttrs)

  const amenityAssign = []
  let aaId = 1
  for (const res of resources) {
    for (let a = 1; a <= 4; a++) {
      amenityAssign.push({ id: aaId++, resource_id: res.id, amenity_id: a, value: null, created_at: NOW })
    }
  }
  total += await batchInsert(conn, 'branch_amenity_assignments', ['id','branch_id','amenity_id','value','created_at'], amenityAssign)

  const hours = []
  let hourId = 1
  const dayNames = [1, 2, 3, 4, 5, 6, 7]
  for (const branch of branches) {
    for (const day of dayNames) {
      const isWeekend = day === 5 || day === 6
      hours.push({
        id: hourId++,
        owner_type: 'branch',
        owner_id: branch.id,
        day_of_week: day,
        is_open: 1,
        open_time: isWeekend ? '08:00:00' : '06:00:00',
        close_time: isWeekend ? '22:00:00' : '23:00:00',
        created_at: NOW,
      })
    }
  }
  total += await batchInsert(conn, 'operating_hours', ['id','owner_type','owner_id','day_of_week','is_open','open_time','close_time','created_at'], hours)

  const policies = [
    { id: 1, organisation_id: 1, cancellation_window_minutes: 1440, refund_percent: 100.00, is_active: 1 },
    { id: 2, organisation_id: 1, cancellation_window_minutes: 720, refund_percent: 100.00, is_active: 1 },
    { id: 3, organisation_id: 1, cancellation_window_minutes: 2880, refund_percent: 50.00, is_active: 1 },
    { id: 4, organisation_id: 1, cancellation_window_minutes: 0, refund_percent: 0.00, is_active: 1 },
  ]
  total += await batchInsert(conn, 'cancellation_policies', ['id','organisation_id','cancellation_window_minutes','refund_percent','is_active'], policies)

  const holidays = [
    { id: 1, owner_type: 'branch', owner_id: ctx.branchIds[0], name: 'Eid al-Fitr', date_from: '2026-03-30', date_to: '2026-04-01', is_recurring: 0, created_at: NOW },
    { id: 2, owner_type: 'branch', owner_id: ctx.branchIds[0], name: 'Eid al-Adha', date_from: '2026-06-06', date_to: '2026-06-08', is_recurring: 0, created_at: NOW },
    { id: 3, owner_type: 'branch', owner_id: ctx.branchIds[1], name: 'Sinai Liberation Day', date_from: '2026-04-25', date_to: '2026-04-25', is_recurring: 1, created_at: NOW },
    { id: 4, owner_type: 'branch', owner_id: ctx.branchIds[2], name: 'Revolution Day', date_from: '2026-01-25', date_to: '2026-01-25', is_recurring: 1, created_at: NOW },
  ]
  total += await batchInsert(conn, 'holidays', ['id','owner_type','owner_id','name','date_from','date_to','is_recurring','created_at'], holidays)

  const access = []
  let acId = 1
  for (let i = 0; i < 15; i++) {
    access.push({
      id: acId++,
      branch_id: ctx.branchIds[i % ctx.branchIds.length],
      player_id: ctx.userIds[(i + 5) % ctx.userIds.length],
      status: i % 2 === 0 ? 'approved' : 'pending',
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'branch_player_access', ['id','branch_id','player_id','status','created_at'], access)

  const maint = []
  let mtId = 1
  for (let i = 0; i < 10; i++) {
    const res = resources[i % resources.length]
    const startDate = new Date(Date.now() + 86400000 * (30 + i * 15))
    const endDate = new Date(startDate.getTime() + 86400000 * 2)
    maint.push({
      id: mtId++,
      resource_id: res.id,
      reason: `Scheduled ${['cleaning','resurfacing','inspection','repair','upgrade'][i % 5]}`,
      date_from: startDate.toISOString().slice(0, 19).replace('T', ' '),
      date_to: endDate.toISOString().slice(0, 19).replace('T', ' '),
      is_active: 1,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'resource_maintenance', ['id','resource_id','reason','date_from','date_to','is_active','created_at'], maint)

  const orgAttrVals = [
    { id: 1, organisation_id: 1, attribute_id: 1, value: '5000' },
    { id: 2, organisation_id: 2, attribute_id: 1, value: '3000' },
    { id: 3, organisation_id: 5, attribute_id: 3, value: 'Egyptian Tennis Federation' },
  ]
  total += await batchInsert(conn, 'organisation_attribute_values', ['id','organisation_id','attribute_id','value'], orgAttrVals)

  const finDetails = [
    { id: 1, organisation_id: 1, bank_name: 'National Bank of Egypt', bank_account_name: 'Gezeta SC', bank_account_number: '1000123456789', iban: 'EG1000123456789012345678901', swift: 'NBEGEGCX', billing_email: 'finance@gezeta.com.eg', commission_rate: 10.00, payout_schedule: 'monthly', currency_id: 1, created_at: NOW },
    { id: 2, organisation_id: 2, bank_name: 'Banque Misr', bank_account_name: 'Wadi Degla SC', bank_account_number: '1000234567890', iban: 'EG1000234567890012345678902', swift: 'BMRXEGCX', billing_email: 'finance@wadidegla.com', commission_rate: 10.00, payout_schedule: 'monthly', currency_id: 1, created_at: NOW },
    { id: 3, organisation_id: 5, bank_name: 'CIB Egypt', bank_account_name: 'Black Ball Academy', bank_account_number: '1000345678901', iban: 'EG1000345678901012345678903', swift: 'CIBEEGCX', billing_email: 'finance@blackball.eg', commission_rate: 12.00, payout_schedule: 'biweekly', currency_id: 1, created_at: NOW },
  ]
  total += await batchInsert(conn, 'organisation_financial_details', ['id','organisation_id','bank_name','bank_account_name','bank_account_number','iban','swift','billing_email','commission_rate','payout_schedule','currency_id','created_at'], finDetails)

  const bankAccs = []
  let baId = 1
  const banks = ['National Bank of Egypt','Banque Misr','CIB Egypt','QNB Al Ahli','HSBC Egypt']
  const holderNames = ['Gezeta SC — Main Branch','Gezeta SC — North Complex','Wadi Degla SC — Main Branch','Wadi Degla SC — South Arena','Smouha SC — Main Branch','Smouha SC — East Wing','Shams SC — Main Branch','Shams SC — West Campus','Black Ball Academy — Main Branch','Black Ball Academy — Premier Clubhouse','Police Union Club — Main Branch','Police Union Club — Sports Village','Sporting Alex — Main Branch','Sporting Alex — Elite Center','El Rawad SC — Main Branch','El Rawad SC — North Complex']
  for (let i = 0; i < ctx.branchIds.length; i++) {
    bankAccs.push({
      id: baId++,
      branch_id: ctx.branchIds[i],
      bank_name: banks[i % banks.length],
      account_number: String(1000000000000000 + Math.floor(Math.random() * 9000000000000000)),
      account_holder_name: holderNames[i % holderNames.length],
      iban: `EG${String(Math.floor(Math.random() * 100000000000000000000000000)).padStart(27, '0')}`,
      is_default: i === 0 ? 1 : 0,
    })
  }
  total += await batchInsert(conn, 'bank_accounts', ['id','branch_id','bank_name','account_number','account_holder_name','iban','is_default'], bankAccs)

  return total
}
