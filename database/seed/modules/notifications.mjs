import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const notifs = []
  const noteCategories = [1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 8]
  const noteActions = [1, 2, 3, 5, 6, 9, 11, 12, 13, 15, 16]
  for (let i = 0; i < 300; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    const catId = noteCategories[i % noteCategories.length]
    const actionId = noteActions[i % noteActions.length]
    const date = new Date(Date.now() - 86400000 * (60 - i % 60))
    notifs.push({
      id: i + 1,
      user_id: userId,
      category_id: catId,
      action_id: actionId,
      action_payload: JSON.stringify({ reference_id: (i % 50) + 1 }),
      title: ['Booking Confirmed','Booking Reminder','Booking Cancelled','Payment Received','Payment Refunded','Special Offer','System Update','Event Reminder','Order Shipped','Session Reminder','Enrollment Update','General Notification'][i % 12],
      body: `Your ${['booking','payment','subscription','order','session'][i % 5]} has been ${['confirmed','updated','cancelled','processed','approved'][i % 5]}.`,
      icon: ['calendar','wallet','megaphone','settings','users','shopping-bag','graduation-cap','book-open'][i % 8],
      is_read: i < 200 ? 1 : 0,
      is_pushed: i < 250 ? 1 : 0,
      read_at: i < 200 ? date.toISOString().slice(0, 19).replace('T', ' ') : null,
    })
  }
  total += await batchInsert(conn, 'notifications', ['id','user_id','category_id','action_id','action_payload','title','body','icon','is_read','is_pushed','read_at'], notifs)

  const queue = []
  for (let i = 0; i < 50; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    queue.push({
      id: i + 1,
      user_id: userId,
      notification_id: (i % 300) + 1,
      channel: ['push','email','sms','in_app'][i % 4],
      status: i < 30 ? 'sent' : (i < 45 ? 'pending' : 'failed'),
      scheduled_at: new Date(Date.now() + 3600000 * i).toISOString().slice(0, 19).replace('T', ' '),
      sent_at: i < 30 ? NOW : null,
    })
  }
  total += await batchInsert(conn, 'notification_queue', ['id','user_id','notification_id','channel','status','scheduled_at','sent_at'], queue)

  return total
}
