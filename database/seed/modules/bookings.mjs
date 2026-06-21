import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0
  const resources = ctx.resourceIds
  const users = ctx.userIds
  const orgs = ctx.orgIds

  const bookings = []
  let bkId = 1
  const types = ['public_match','private_match','academy','clinic','coach_session']
  const statuses = ['confirmed','confirmed','completed','completed','cancelled']
  const payStatuses = ['paid','paid','paid','paid','refunded']

  for (let i = 0; i < 300; i++) {
    const orgId = orgs[i % orgs.length]
    const courtId = resources[i % resources.length]
    const userId = users[(i + 1) % users.length]
    const daysAgo = 90 - i
    const bkDate = new Date(Date.now() - 86400000 * daysAgo)
    const startHour = 8 + (i % 10)
    const total = 200 + (i % 10) * 50
    const commission = Math.round(total * 0.1 * 100) / 100
    const net = total - commission
    const clubAmt = Math.round(total * 0.9 * 100) / 100

    bookings.push({
      id: bkId,
      public_id: `bk${String(bkId).padStart(8, '0')}-0000-4000-8000-${String(bkId).padStart(12, '0')}`,
      user_id: userId,
      organisation_id: orgId,
      resource_id: courtId,
      booking_type: types[i % types.length],
      visibility: i % 4 === 0 ? 'private' : 'public',
      booking_date: bkDate.toISOString().slice(0, 10),
      start_time: `${String(startHour).padStart(2, '0')}:00:00`,
      end_time: `${String(startHour + 1).padStart(2, '0')}:00:00`,
      total_amount: total,
      commission_rate: 10.00,
      commission_amount: commission,
      net_amount: net,
      club_amount: clubAmt,
      payment_status: payStatuses[i % payStatuses.length],
      booking_status: statuses[i % statuses.length],
      cancellation_policy_snapshot: JSON.stringify({ window_hours: 24, fee_percent: 0 }),
      notes: i % 5 === 0 ? `Booking notes for reference #${bkId}` : null,
      version: 1,
      created_at: bkDate.toISOString().slice(0, 19).replace('T', ' '),
    })
    bkId++
  }
  total += await batchInsert(conn, 'bookings', ['id','public_id','user_id','organisation_id','resource_id','booking_type','visibility','booking_date','start_time','end_time','total_amount','commission_rate','commission_amount','net_amount','club_amount','payment_status','booking_status','cancellation_policy_snapshot','notes','version','created_at'], bookings)
  ctx.bookingIds = bookings.map(b => b.id)

  const slots = []
  let slId = 1
  for (const booking of bookings) {
    const resId = resources[booking.id % resources.length]
    slots.push({
      id: slId++,
      booking_id: booking.id,
      resource_id: resId,
      booking_date: booking.booking_date,
      slot_start: booking.start_time,
      slot_end: booking.end_time,
      is_available: 0,
      created_at: booking.created_at,
    })
  }
  total += await batchInsert(conn, 'booking_slots', ['id','booking_id','resource_id','booking_date','slot_start','slot_end','is_available','created_at'], slots)

  const participants = []
  let ptId = 1
  for (let i = 0; i < 200; i++) {
    const bk = bookings[i % bookings.length]
    const userId = users[(i + 5) % users.length]
    participants.push({
      id: ptId++,
      booking_id: bk.id,
      user_id: userId,
      full_name: null,
      email: null,
      phone: null,
      created_at: bk.created_at,
    })
  }
  total += await batchInsert(conn, 'booking_participants', ['id','booking_id','user_id','full_name','email','phone','created_at'], participants)

  const invitations = []
  let invId = 1
  for (let i = 0; i < 80; i++) {
    const bk = bookings[i % bookings.length]
    const invitedUser = users[(i + 10) % users.length]
    const invStatus = ['pending','accepted','accepted','declined'][i % 4]
    const token = `inv_${i}_${Date.now().toString(36)}`
    invitations.push({
      id: invId++,
      booking_id: bk.id,
      invited_user_id: invitedUser,
      email: null,
      status: invStatus,
      token: token,
      responded_at: invStatus !== 'pending' ? NOW : null,
      created_at: bk.created_at,
    })
  }
  total += await batchInsert(conn, 'booking_invitations', ['id','booking_id','invited_user_id','email','status','token','responded_at','created_at'], invitations)

  const cancellations = []
  let canId = 1
  const cancelledBookings = bookings.filter(b => b.booking_status === 'cancelled')
  for (const bk of cancelledBookings) {
    cancellations.push({
      id: canId++,
      booking_id: bk.id,
      cancelled_by: bk.user_id,
      reason: ['Schedule conflict','Weather conditions','Injury','Personal emergency','Other reason'][canId % 5],
      refund_amount: Math.round(bk.total_amount * 0.85 * 100) / 100,
      refund_status: ['processed','processed','pending'][canId % 3],
      processed_at: ['processed','processed','pending'][canId % 3] !== 'pending' ? NOW : null,
      created_at: new Date(new Date(bk.booking_date).getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' '),
    })
  }
  total += await batchInsert(conn, 'booking_cancellations', ['id','booking_id','cancelled_by','reason','refund_amount','refund_status','processed_at','created_at'], cancellations)

  return total
}
