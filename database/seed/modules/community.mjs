import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const events = []
  for (let i = 0; i < 20; i++) {
    const futureDate = new Date(Date.now() + 86400000 * (7 + i * 5))
    const start = new Date(futureDate)
    start.setHours(9, 0, 0, 0)
    const end = new Date(futureDate)
    end.setHours(18, 0, 0, 0)
    events.push({
      id: i + 1,
      creator_id: ctx.userIds[i % ctx.userIds.length],
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      title: ['Padel Tournament','Tennis Open Day','Football 5-a-side Cup','Yoga in the Park','Swimming Gala','Squash Championship','Basketball 3x3','Boxing Exhibition'][i % 8],
      description: `Join us for an exciting ${['sports','competitive','fun-filled','charity','community'][i % 5]} event!`,
      event_type: ['match','training','social','tournament','other'][i % 5],
      start_time: start.toISOString().slice(0, 19).replace('T', ' '),
      end_time: end.toISOString().slice(0, 19).replace('T', ' '),
      max_participants: 10 + (i * 5),
      is_public: i % 3 !== 0 ? 1 : 0,
      status: i < 12 ? 'active' : 'cancelled',
    })
  }
  total += await batchInsert(conn, 'community_events', ['id','creator_id','organisation_id','title','description','event_type','start_time','end_time','max_participants','is_public','status'], events)
  ctx.eventIds = events.map(e => e.id)

  const eventParticipants = []
  let epId = 1
  for (const ev of events) {
    const count = 3 + (ev.id % 5)
    for (let p = 0; p < count; p++) {
      eventParticipants.push({
        id: epId++,
        event_id: ev.id,
        user_id: ctx.userIds[(ev.id + p) % ctx.userIds.length],
        status: ['going','going','maybe','declined'][p % 4],
      })
    }
  }
  total += await batchInsert(conn, 'community_event_participants', ['id','event_id','user_id','status'], eventParticipants)

  const tournaments = []
  for (let i = 0; i < 10; i++) {
    const startDate = new Date(Date.now() + 86400000 * (14 + i * 10))
    tournaments.push({
      id: i + 1,
      creator_id: ctx.userIds[i % ctx.userIds.length],
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      sport_id: (i % 11) + 1,
      bracket_type_id: (i % 4) + 1,
      name: ['Summer Championship','Club Cup','Presidents Cup','League Championship','Open Challenge','Elite Series','Pro Qualifiers','Annual Tournament','Friendly Cup','Club Open'][i],
      description: `Annual sports tournament organized by ${['Gezeta','Wadi Degla','Smouha','Black Ball'][i % 4]}`,
      tournament_type: i < 7 ? 'platform' : 'community',
      max_participants: [8, 16, 16, 32, 8, 16, 32, 16, 8, 16][i],
      min_participants: 2,
      entry_fee: i % 2 === 0 ? 200 : 0,
      currency_code: 'EGP',
      prize_description: `Winner: ${[5000,10000,3000,15000,2000,8000,12000,6000,2000,5000][i]} EGP + Trophy`,
      status: i < 3 ? 'open' : (i < 7 ? 'in_progress' : 'completed'),
      start_date: startDate.toISOString().slice(0, 10),
      end_date: new Date(startDate.getTime() + 86400000 * 14).toISOString().slice(0, 10),
      is_featured: i < 2 ? 1 : 0,
      image_url: `/images/tournaments/tournament-${i + 1}.jpg`,
    })
  }
  total += await batchInsert(conn, 'community_tournaments', ['id','creator_id','organisation_id','sport_id','bracket_type_id','name','description','tournament_type','max_participants','min_participants','entry_fee','currency_code','prize_description','status','start_date','end_date','is_featured','image_url'], tournaments)
  ctx.tournamentIds = tournaments.map(t => t.id)

  const registrations = []
  let regId = 1
  for (const t of tournaments) {
    const count = Math.min(6, t.max_participants / 2)
    for (let r = 0; r < count; r++) {
      registrations.push({
        id: regId++,
        tournament_id: t.id,
        player_id: ctx.userIds[(t.id + r) % ctx.userIds.length],
        seed_rank: r + 1,
        payment_status: t.entry_fee > 0 ? 'paid' : 'unpaid',
        status: 'confirmed',
        registered_at: NOW,
      })
    }
  }
  total += await batchInsert(conn, 'tournament_registrations', ['id','tournament_id','player_id','seed_rank','payment_status','status','registered_at'], registrations)

  const matches = []
  let mtchId = 1
  for (let i = 0; i < 20; i++) {
    const t = tournaments[i % tournaments.length]
    const player1Id = ctx.userIds[(i * 2) % ctx.userIds.length]
    const player2Id = ctx.userIds[(i * 2 + 1) % ctx.userIds.length]
    const startTime = new Date(Date.now() + 86400000 * (21 + i))
    startTime.setHours(9 + (i % 8), 0, 0, 0)
    const endTime = new Date(startTime.getTime() + 3600000)
    matches.push({
      id: mtchId++,
      tournament_id: t.id,
      round: Math.floor(i / 4) + 1,
      match_number: (i % 4) + 1,
      player1_id: player1Id,
      player2_id: player2Id,
      start_time: startTime.toISOString().slice(0, 19).replace('T', ' '),
      end_time: endTime.toISOString().slice(0, 19).replace('T', ' '),
      status: i < 10 ? 'scheduled' : 'completed',
    })
  }
  total += await batchInsert(conn, 'tournament_matches', ['id','tournament_id','round','match_number','player1_id','player2_id','start_time','end_time','status'], matches)

  const scores = []
  let scId = 1
  for (const m of matches.filter(m => m.status === 'completed')) {
    scores.push({
      id: scId++,
      match_id: m.id,
      set_number: 1,
      player1_score: String(Math.floor(4 + Math.random() * 6)),
      player2_score: String(Math.floor(1 + Math.random() * 5)),
      entered_by: ctx.userIds[0],
    })
  }
  total += await batchInsert(conn, 'tournament_match_scores', ['id','match_id','set_number','player1_score','player2_score','entered_by'], scores)

  const announcements = []
  for (let i = 0; i < 20; i++) {
    announcements.push({
      id: i + 1,
      user_id: ctx.userIds[i % ctx.userIds.length],
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      content: `We are excited to announce ${['new state-of-the-art courts','special summer discounts','updated holiday operating hours','new experienced coaches joining our team','major facility upgrades','latest league match results','a special appreciation day for all members','an upcoming charity sports event'][i % 8]}. Stay tuned for more details!`,
      images: JSON.stringify([`/images/announcements/ann-${(i % 8) + 1}.jpg`]),
      is_pinned: i < 3 ? 1 : 0,
    })
  }
  total += await batchInsert(conn, 'announcements', ['id','user_id','organisation_id','content','images','is_pinned'], announcements)

  const comments = []
  let cmId = 1
  for (let i = 0; i < 30; i++) {
    comments.push({
      id: cmId++,
      announcement_id: announcements[i % announcements.length].id,
      user_id: ctx.userIds[(i + 5) % ctx.userIds.length],
      content: ['Great news!','Looking forward to this!','When will this be available?','Thanks for the update!','Excellent initiative!','Can you share more details?','I signed up already!','Very exciting progress!'][i % 8],
    })
  }
  total += await batchInsert(conn, 'announcement_comments', ['id','announcement_id','user_id','content'], comments)

  const likes = []
  let lkId = 1
  for (let i = 0; i < 40; i++) {
    likes.push({
      id: lkId++,
      announcement_id: announcements[i % announcements.length].id,
      user_id: ctx.userIds[(i + 3) % ctx.userIds.length],
    })
  }
  total += await batchInsert(conn, 'announcement_likes', ['id','announcement_id','user_id'], likes)

  const conversations = []
  for (let i = 0; i < 15; i++) {
    conversations.push({
      id: i + 1,
      conversation_type: i % 2 === 0 ? 'direct' : 'group',
      name: i % 2 === 0 ? null : ['Match Coordination','Training Squad','Equipment Team','Social Club','Tournament Crew'][i % 5],
    })
  }
  total += await batchInsert(conn, 'conversations', ['id','conversation_type','name'], conversations)

  const convParts = []
  let cpId = 1
  for (const conv of conversations) {
    const count = conv.conversation_type === 'direct' ? 2 : 3 + (conv.id % 4)
    for (let p = 0; p < count; p++) {
      convParts.push({
        id: cpId++,
        conversation_id: conv.id,
        user_id: ctx.userIds[(conv.id + p) % ctx.userIds.length],
      })
    }
  }
  total += await batchInsert(conn, 'conversation_participants', ['id','conversation_id','user_id'], convParts)

  const messages = []
  let msgId = 1
  for (let i = 0; i < 60; i++) {
    const conv = conversations[i % conversations.length]
    const content = ['Hey, are you free for a game this weekend?','Yes, Saturday morning works for me.','Great! Let\'s book Court 3 at 10 AM.','Perfect, see you there!','Can we reschedule to Sunday?','Sure, no problem.','What time on Sunday?','Let\'s say 11 AM.'][i % 8]
    messages.push({
      id: msgId++,
      conversation_id: conv.id,
      sender_id: ctx.userIds[(i + 2) % ctx.userIds.length],
      message_type: 'text',
      content: content,
    })
  }
  total += await batchInsert(conn, 'messages', ['id','conversation_id','sender_id','message_type','content'], messages)

  return total
}
