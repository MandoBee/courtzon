import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const academies = [
    { id: 1, organisation_id: ctx.orgIds[0], sport_id: 1, name: 'Gezeta Football Academy', description: 'Youth football development program for ages 8-18', image_url: '/images/academies/gezeta-football.jpg', is_active: 1 },
    { id: 2, organisation_id: ctx.orgIds[4], sport_id: 2, name: 'Black Ball Padel Academy', description: 'Premier padel training for all levels', image_url: '/images/academies/bb-padel.jpg', is_active: 1 },
    { id: 3, organisation_id: ctx.orgIds[2], sport_id: 6, name: 'Smouha Swimming Academy', description: 'Learn swimming from Olympic-level coaches', image_url: '/images/academies/smouha-swim.jpg', is_active: 1 },
    { id: 4, organisation_id: ctx.orgIds[1], sport_id: 3, name: 'Wadi Degla Tennis Academy', description: 'World-class tennis training with ITF-certified coaches', image_url: '/images/academies/wd-tennis.jpg', is_active: 1 },
  ]
  total += await batchInsert(conn, 'academies', ['id','organisation_id','sport_id','name','description','image_url','is_active'], academies)

  const curriculums = [
    { id: 1, academy_id: 1, name: 'Beginner Football', description: 'Introduction to football fundamentals', duration_weeks: 12, price: 2000.00, currency_code: 'EGP', is_active: 1 },
    { id: 2, academy_id: 1, name: 'Intermediate Football', description: 'Advanced skills and tactical awareness', duration_weeks: 12, price: 3000.00, currency_code: 'EGP', is_active: 1 },
    { id: 3, academy_id: 2, name: 'Padel Beginners', description: 'Learn padel from scratch', duration_weeks: 8, price: 2500.00, currency_code: 'EGP', is_active: 1 },
    { id: 4, academy_id: 2, name: 'Padel Advanced', description: 'Advanced padel techniques and match play', duration_weeks: 8, price: 4000.00, currency_code: 'EGP', is_active: 1 },
    { id: 5, academy_id: 3, name: 'Swimming Level 1', description: 'Learn to swim — water confidence', duration_weeks: 6, price: 1500.00, currency_code: 'EGP', is_active: 1 },
    { id: 6, academy_id: 3, name: 'Swimming Level 2', description: 'Stroke improvement and endurance', duration_weeks: 6, price: 2000.00, currency_code: 'EGP', is_active: 1 },
    { id: 7, academy_id: 4, name: 'Tennis Beginners', description: 'Tennis fundamentals for new players', duration_weeks: 10, price: 2800.00, currency_code: 'EGP', is_active: 1 },
    { id: 8, academy_id: 4, name: 'Tennis Competitive', description: 'Competitive tennis training and tournament prep', duration_weeks: 12, price: 5000.00, currency_code: 'EGP', is_active: 1 },
  ]
  total += await batchInsert(conn, 'academy_curriculums', ['id','academy_id','name','description','duration_weeks','price','currency_code','is_active'], curriculums)

  const enrollments = []
  let enrId = 1
  for (let c = 0; c < curriculums.length; c++) {
    const curriculum = curriculums[c]
    const count = Math.min(5, Math.floor(ctx.userIds.length / 4))
    for (let s = 0; s < count; s++) {
      const studentId = ctx.userIds[(c * count + s + 10) % ctx.userIds.length]
      enrollments.push({
        id: enrId++,
        academy_id: curriculum.academy_id,
        curriculum_id: curriculum.id,
        player_id: studentId,
        status: ['active','active','active','completed','dropped'][s % 5],
        enrolled_at: new Date(Date.now() - 86400000 * (60 + s * 10)).toISOString().slice(0, 19).replace('T', ' '),
        completed_at: s % 4 === 0 ? new Date(Date.now() - 86400000 * 10).toISOString().slice(0, 19).replace('T', ' ') : null,
      })
    }
  }
  total += await batchInsert(conn, 'academy_enrollments', ['id','academy_id','curriculum_id','player_id','status','enrolled_at','completed_at'], enrollments)

  const academySessions = []
  let asId = 1
  for (let i = 0; i < 40; i++) {
    const acad = academies[i % academies.length]
    const curr = curriculums.find(c => c.academy_id === acad.id) || curriculums[0]
    const sessionDate = new Date(Date.now() - 86400000 * (30 - i * 3))
    const start = new Date(sessionDate)
    start.setHours(10, 0, 0, 0)
    const end = new Date(sessionDate)
    end.setHours(11, 30, 0, 0)
    academySessions.push({
      id: asId++,
      academy_id: acad.id,
      curriculum_id: curr.id,
      title: `${curr.name} — Session ${Math.ceil((i + 1) / 4)}`,
      description: `Regular training session for ${curr.name}`,
      start_time: start.toISOString().slice(0, 19).replace('T', ' '),
      end_time: end.toISOString().slice(0, 19).replace('T', ' '),
      max_participants: 10,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'academy_sessions', ['id','academy_id','curriculum_id','title','description','start_time','end_time','max_participants','created_at'], academySessions)

  const attendance = []
  let attId = 1
  for (const enrollment of enrollments.slice(0, 30)) {
    for (let s = 0; s < 5; s++) {
      attendance.push({
        id: attId++,
        session_id: academySessions.find(a => a.academy_id === enrollment.academy_id)?.id || 1,
        player_id: enrollment.player_id,
        status: ['present','present','present','absent','excused'][s % 5],
        created_at: NOW,
      })
    }
  }
  total += await batchInsert(conn, 'academy_session_attendance', ['id','session_id','player_id','status','created_at'], attendance)

  const evaluations = []
  let evId = 1
  for (let i = 0; i < 20; i++) {
    const enrollment = enrollments[i % enrollments.length]
    evaluations.push({
      id: evId++,
      academy_id: enrollment.academy_id,
      player_id: enrollment.player_id,
      evaluator_id: ctx.coachIds[i % ctx.coachIds.length],
      skill_scores: JSON.stringify({ technical: 75, tactical: 70, physical: 80 }),
      overall_score: 75.00,
      notes: `Good progress in ${['ball control','positioning','fitness','teamwork','technique'][i % 5]}`,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'academy_evaluations', ['id','academy_id','player_id','evaluator_id','skill_scores','overall_score','notes','created_at'], evaluations)

  const agreements = []
  let agrId = 1
  for (let i = 0; i < 10; i++) {
    agreements.push({
      id: agrId++,
      coach_id: ctx.coachIds[i % ctx.coachIds.length],
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      coach_split_pct: 70.00,
      org_split_pct: 30.00,
      is_active: 1,
      created_at: NOW,
    })
  }
  total += await batchInsert(conn, 'coach_org_agreements', ['id','coach_id','organisation_id','coach_split_pct','org_split_pct','is_active','created_at'], agreements)

  const coachSessions = []
  let csId = 1
  for (let i = 0; i < 30; i++) {
    const coachId = ctx.coachIds[i % ctx.coachIds.length]
    const playerId = ctx.userIds[(i + 10) % ctx.userIds.length]
    const sessionDate = new Date(Date.now() - 86400000 * (60 - i * 2))
    const durationMin = [30, 60, 90][i % 3]
    const start = new Date(sessionDate)
    start.setHours(8 + (i % 10), 0, 0, 0)
    const end = new Date(start.getTime() + durationMin * 60000)
    coachSessions.push({
      id: csId++,
      coach_id: coachId,
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      player_id: playerId,
      start_time: start.toISOString().slice(0, 19).replace('T', ' '),
      end_time: end.toISOString().slice(0, 19).replace('T', ' '),
      price: 200 + (i * 25),
      currency_code: 'EGP',
      platform_commission_pct: 10.00,
      coach_earnings: (200 + (i * 25)) * 0.9,
      org_earnings: (200 + (i * 25)) * 0.1,
      status: ['completed','completed','completed','cancelled','scheduled'][i % 5],
    })
  }
  total += await batchInsert(conn, 'coach_sessions', ['id','coach_id','organisation_id','player_id','start_time','end_time','price','currency_code','platform_commission_pct','coach_earnings','org_earnings','status'], coachSessions)

  const reviews = []
  let rvId = 1
  for (let i = 0; i < 15; i++) {
    reviews.push({
      id: rvId++,
      coach_id: ctx.coachIds[i % ctx.coachIds.length],
      player_id: ctx.userIds[(i + 10) % ctx.userIds.length],
      session_id: coachSessions[i]?.id || 1,
      rating: Math.floor(3 + Math.random() * 3),
      review_text: ['Excellent coach! Very professional.','Great session, learned a lot.','Very knowledgeable and patient.','Good but could improve communication.','Amazing technique training!'][i % 5],
    })
  }
  total += await batchInsert(conn, 'coach_reviews', ['id','coach_id','player_id','session_id','rating','review_text'], reviews)

  return total
}
