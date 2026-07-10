#!/usr/bin/env node
import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'courtzon_v3',
} = process.env;

async function migrate() {
  const pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 1,
  });

  try {
    const [rows] = await pool.execute(
      `SELECT b.id, b.user_id, b.resource_id, b.organisation_id, b.branch_id,
              b.booking_date, b.start_time, b.end_time, b.total_amount,
              r.sport_id
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       WHERE b.booking_type = 'public_match'
         AND b.booking_status = 'confirmed'
         AND b.payment_status = 'paid'
         AND b.booking_date >= CURDATE()`
    );
    const bookings = rows;

    console.log(`Found ${bookings.length} active public matches to migrate`);

    for (const bk of bookings) {
      const [existingRows] = await pool.execute(
        'SELECT id FROM matches WHERE booking_id = ?', [bk.id]
      );
      if (existingRows.length > 0) {
        console.log(`  Booking ${bk.id}: match already exists, skipping`);
        continue;
      }

      const [matchResult] = await pool.execute(
        `INSERT INTO matches (type, status, booking_id, sport_id)
         VALUES ('public', 'open', ?, ?)`,
        [bk.id, bk.sport_id]
      );
      const matchId = matchResult.insertId;

      const [mmRows] = await pool.execute(
        `SELECT min_age, max_age, target_gender, target_level_id,
                max_players, deadline, auto_apply
         FROM booking_matchmaking_requests
         WHERE booking_id = ?`, [bk.id]
      );
      const mm = mmRows[0] || {};

      await pool.execute(
        `INSERT INTO public_match_details
         (match_id, creator_id, visibility, auto_accept, max_players,
          min_age, max_age, target_gender, target_level_id, deadline)
         VALUES (?, ?, 'public', ?, ?, ?, ?, ?, ?, ?)`,
        [matchId, bk.user_id, mm.auto_apply || 0, mm.max_players || 2,
         mm.min_age || null, mm.max_age || null,
         mm.target_gender || 'any', mm.target_level_id || null,
         mm.deadline || null]
      );

      await pool.execute(
        `INSERT INTO match_participants (match_id, user_id, role)
         VALUES (?, ?, 'host')`,
        [matchId, bk.user_id]
      );

      console.log(`  Booking ${bk.id}: created match ${matchId}`);
    }

    console.log('Migration complete');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
