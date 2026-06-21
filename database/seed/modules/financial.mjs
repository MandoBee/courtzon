import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const wtxns = []
  let wtId = 1
  for (let i = 0; i < 80; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    const amount = Math.round((50 + Math.random() * 1000) * 100) / 100
    const isCredit = i % 3 !== 0
    wtxns.push({
      id: wtId++,
      public_id: `wt${String(i + 1).padStart(8, '0')}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      wallet_id: (userId % 50) + 1,
      transaction_type: ['deposit','withdrawal','payment','refund','commission','settlement'][i % 6],
      amount: amount,
      direction: isCredit ? 'credit' : 'debit',
      reference_type: ['booking','booking','wallet','order','commission'][i % 5],
      reference_id: (i % 50) + 1,
      description: `${isCredit ? 'Added to' : 'Deducted from'} wallet — ${['Court booking payment','Booking refund','Wallet top-up via card','Order payment','Commission deduction'][i % 5]}`,
    })
  }
  total += await batchInsert(conn, 'wallet_transactions', ['id','public_id','wallet_id','transaction_type','amount','direction','reference_type','reference_id','description'], wtxns)

  const ptxns = []
  let ptId = 1
  for (let i = 0; i < 100; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    const amount = Math.round((100 + Math.random() * 3000) * 100) / 100
    const bookingId = ctx.bookingIds ? ctx.bookingIds[i % ctx.bookingIds.length] : null
    ptxns.push({
      id: ptId++,
      user_id: userId,
      booking_id: i % 4 !== 0 ? bookingId : null,
      payment_method: ['wallet','cash','card','bank_transfer'][i % 4],
      gateway_provider: ['paymob','fawry','vodafone_cash',null][i % 4],
      gateway_reference: `GTX${String(Date.now()).slice(-8)}${String(i).padStart(4, '0')}`,
      amount: amount,
      payment_status: i % 6 === 0 ? 'failed' : (i % 10 === 0 ? 'pending' : 'paid'),
      paid_at: i % 6 !== 0 && i % 10 !== 0 ? new Date(Date.now() - 86400000 * (60 - i)).toISOString().slice(0, 19).replace('T', ' ') : null,
    })
  }
  total += await batchInsert(conn, 'payment_transactions', ['id','user_id','booking_id','payment_method','gateway_provider','gateway_reference','amount','payment_status','paid_at'], ptxns)

  const plans = [
    { id: 1, plan_name: 'Basic Club', billing_cycle: 'monthly', price: 999.00, features: JSON.stringify(['Up to 5 resources','Basic reporting','Email support','Up to 200 bookings/month']), is_active: 1 },
    { id: 2, plan_name: 'Pro Club', billing_cycle: 'monthly', price: 2499.00, features: JSON.stringify(['Up to 20 resources','Advanced analytics','Priority support','Up to 1000 bookings/month','Marketplace access','Custom branding']), is_active: 1 },
    { id: 3, plan_name: 'Enterprise', billing_cycle: 'monthly', price: 9999.00, features: JSON.stringify(['Unlimited resources','Multi-branch support','Dedicated account manager','Unlimited bookings','White-label solution','API access','Advanced security','24/7 support']), is_active: 1 },
    { id: 4, plan_name: 'Basic Club Yearly', billing_cycle: 'yearly', price: 9990.00, features: JSON.stringify(['Same as Basic Club','2 months free']), is_active: 1 },
  ]
  total += await batchInsert(conn, 'subscription_plans', ['id','plan_name','billing_cycle','price','features','is_active'], plans)

  const sRates = []
  let srId = 1
  for (const plan of plans) {
    sRates.push({
      id: srId++,
      plan_id: plan.id,
      applicable_entity: 'organisation',
      rate_type: 'percentage',
      amount: 10.00,
    })
  }
  total += await batchInsert(conn, 'subscription_plan_rates', ['id','plan_id','applicable_entity','rate_type','amount'], sRates)

  const entries = []
  let jeId = 1
  const entryTypes = ['revenue','expense','commission','settlement','refund']
  for (let i = 0; i < 30; i++) {
    entries.push({
      id: jeId++,
      entry_type: entryTypes[i % 5],
      reference_type: ['booking','commission','settlement','order'][i % 4],
      reference_id: (i % 50) + 1,
      debit_account: ['revenue.booking','expense.utilities','liability.commission','asset.cash','revenue.refund'][i % 5],
      credit_account: ['asset.cash','expense.utilities','revenue.commission','liability.settlement','expense.refund'][i % 5],
      amount: Math.round((1000 + Math.random() * 50000) * 100) / 100,
      description: `${entryTypes[i % 5]} entry for ${new Date(Date.now() - 86400000 * (30 - i * 3)).toISOString().slice(0, 10)}`,
    })
  }
  total += await batchInsert(conn, 'financial_journal_entries', ['id','entry_type','reference_type','reference_id','debit_account','credit_account','amount','description'], entries)

  const settlements = []
  for (let i = 0; i < 10; i++) {
    settlements.push({
      id: i + 1,
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      settlement_type: i % 2 === 0 ? 'club_to_courtzon' : 'courtzon_to_club',
      gross_amount: Math.round((5000 + Math.random() * 30000) * 100) / 100,
      commission_amount: Math.round((500 + Math.random() * 3000) * 100) / 100,
      net_amount: Math.round((4500 + Math.random() * 27000) * 100) / 100,
      settlement_status: i < 7 ? 'completed' : 'pending',
      settlement_period_start: new Date(Date.now() - 86400000 * (30 + i * 7)).toISOString().slice(0, 10),
      settlement_period_end: new Date(Date.now() - 86400000 * (15 - i * 5)).toISOString().slice(0, 10),
      processed_at: i < 7 ? NOW : null,
    })
  }
  total += await batchInsert(conn, 'settlements', ['id','organisation_id','settlement_type','gross_amount','commission_amount','net_amount','settlement_status','settlement_period_start','settlement_period_end','processed_at'], settlements)

  const sItems = []
  let siId = 1
  for (const s of settlements) {
    for (let j = 0; j < 5; j++) {
      sItems.push({
        id: siId++,
        settlement_id: s.id,
        booking_id: (j % 50) + 1,
        gross_amount: Math.round((200 + Math.random() * 2000) * 100) / 100,
        commission_amount: Math.round((20 + Math.random() * 200) * 100) / 100,
        net_amount: Math.round((180 + Math.random() * 1800) * 100) / 100,
      })
    }
  }
  total += await batchInsert(conn, 'settlement_items', ['id','settlement_id','booking_id','gross_amount','commission_amount','net_amount'], sItems)

  const withdrawals = []
  for (let i = 0; i < 8; i++) {
    withdrawals.push({
      id: i + 1,
      user_id: ctx.userIds[(i + 2) % ctx.userIds.length],
      wallet_id: (ctx.userIds[(i + 2) % ctx.userIds.length] % 50) + 1,
      amount: Math.round((500 + Math.random() * 5000) * 100) / 100,
      bank_account_id: (i % 5) + 1,
      status: ['pending','approved','rejected','completed','cancelled'][i % 5],
      admin_notes: null,
      created_at: new Date(Date.now() - 86400000 * (20 - i)).toISOString().slice(0, 19).replace('T', ' '),
    })
  }
  total += await batchInsert(conn, 'withdrawal_requests', ['id','user_id','wallet_id','amount','bank_account_id','status','admin_notes','created_at'], withdrawals)

  const gwConfigs = [
    { id: 1, organisation_id: null, gateway_provider: 'paymob', is_active: 1, config: JSON.stringify({ api_key: '***', hmac: '***' }) },
    { id: 2, organisation_id: null, gateway_provider: 'fawry', is_active: 1, config: JSON.stringify({ merchant_code: 'FWY123', hash_key: '***' }) },
    { id: 3, organisation_id: null, gateway_provider: 'vodafone_cash', is_active: 1, config: JSON.stringify({ merchant_id: 'VC456' }) },
  ]
  total += await batchInsert(conn, 'payment_gateway_config', ['id','organisation_id','gateway_provider','is_active','config'], gwConfigs)

  return total
}
