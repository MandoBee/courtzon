import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const auditLogs = []
  const actions = ['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','APPROVE','REJECT']
  const entities = ['user','booking','resource','organisation','product','order','payment','role','notification','branch']
  const IPs = ['192.168.1.100','10.0.0.45','172.16.0.89','192.168.1.200','10.0.0.1']
  for (let i = 0; i < 400; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    auditLogs.push({
      id: i + 1,
      actor_id: i % 10 === 0 ? null : userId,
      action: actions[i % actions.length],
      entity_type: entities[i % entities.length],
      entity_id: (i % 50) + 1,
      before_state: i % 4 === 0 ? JSON.stringify({ status: 'pending' }) : null,
      after_state: i % 4 === 0 ? JSON.stringify({ status: 'confirmed' }) : JSON.stringify({ status: 'active' }),
      ip_address: IPs[i % IPs.length],
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      reason: i % 10 === 0 ? 'System operation' : null,
    })
  }
  total += await batchInsert(conn, 'audit_logs', ['id','actor_id','action','entity_type','entity_id','before_state','after_state','ip_address','user_agent','reason'], auditLogs)

  const activityLogs = []
  const actTypes = ['page_view','search','booking_created','payment_made','login','profile_update','resource_viewed','coupon_applied','review_submitted','session_booked']
  for (let i = 0; i < 500; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    activityLogs.push({
      id: i + 1,
      user_id: userId,
      activity_type: actTypes[i % actTypes.length],
      description: `User ${userId} performed ${actTypes[i % actTypes.length]}`,
      metadata: JSON.stringify({ page: `/${['dashboard','bookings','courts','products','orders','profile'][i % 6]}`, referrer: 'https://courtzon.com' }),
      ip_address: IPs[i % IPs.length],
    })
  }
  total += await batchInsert(conn, 'activity_logs', ['id','user_id','activity_type','description','metadata','ip_address'], activityLogs)

  return total
}
