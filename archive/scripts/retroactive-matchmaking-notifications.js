// Retroactively send matchmaking notifications for existing bookings
// Run: docker compose exec backend node scripts/retroactive-matchmaking-notifications.js

import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
const fileEnv = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  fileEnv[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}

const host = fileEnv.DB_HOST || 'localhost';
const resolvedHost = host === 'localhost' || host === '127.0.0.1'
  ? 'host.docker.internal'
  : host;

const config = {
  host: resolvedHost,
  port: Number(fileEnv.DB_PORT || 3306),
  user: fileEnv.DB_USER || 'root',
  password: fileEnv.DB_PASSWORD || '',
  database: fileEnv.DB_NAME || 'courtzon_v2',
};

async function main() {
  const conn = await mysql.createConnection(config);
  console.log('Connected');

  // Get all public_match bookings with matchmaking requests
  const [bookings] = await conn.query(`
    SELECT b.id, b.user_id as creator_id, u.full_name as creator_name,
           b.resource_id, b.booking_type, b.booking_date,
           b.start_time, b.end_time, br.name as branch_name
    FROM bookings b
    JOIN booking_matchmaking_requests mmr ON mmr.booking_id = b.id
    JOIN users u ON u.id = b.user_id
    JOIN resources r ON r.id = b.resource_id
    JOIN branches br ON br.id = b.branch_id
    WHERE b.booking_type = 'public_match'
    ORDER BY b.id
  `);

  console.log(`Found ${bookings.length} bookings with matchmaking requests`);

  for (const booking of bookings) {
    // Get resource sport
    const [resRows] = await conn.query(
      'SELECT sport_id FROM resources WHERE id = ?', [booking.resource_id]
    );
    if (!resRows.length || !resRows[0].sport_id) {
      console.log(`  Booking ${booking.id}: resource has no sport, skipping`);
      continue;
    }
    const sportId = resRows[0].sport_id;

    // Get matchmaking request criteria
    const [mmrRows] = await conn.query(
      'SELECT * FROM booking_matchmaking_requests WHERE booking_id = ?', [booking.id]
    );
    if (!mmrRows.length) continue;
    const mmr = mmrRows[0];

    // Find matching players
    const params = [sportId, booking.creator_id];
    const conditions = ['pp.main_sport_id = ?', 'u.id != ?', 'u.account_status = \'active\''];
    if (mmr.target_gender && mmr.target_gender !== 'any') {
      conditions.push('u.gender = ?');
      params.push(mmr.target_gender);
    }
    const [players] = await conn.query(`
      SELECT u.id, u.full_name
      FROM users u
      JOIN player_profiles pp ON pp.user_id = u.id
      WHERE ${conditions.join(' AND ')}
    `, params);

    if (players.length === 0) {
      console.log(`  Booking ${booking.id}: no matching players found (sport_id=${sportId})`);
      continue;
    }

    // Get or create notification action
    let actionId;
    const [actRows] = await conn.query(
      'SELECT id FROM notification_actions WHERE action_key = ?',
      ['view_matchmaking_booking']
    );
    if (actRows.length) {
      actionId = actRows[0].id;
    } else {
      const [ins] = await conn.query(
        'INSERT INTO notification_actions (action_key) VALUES (?)',
        ['view_matchmaking_booking']
      );
      actionId = ins.insertId;
    }

    // Get category ID
    let categoryId = null;
    const [catRows] = await conn.query(
      'SELECT id FROM notification_categories WHERE slug = ?', ['community']
    );
    if (catRows.length) categoryId = catRows[0].id;

    let sent = 0;
    for (const player of players) {
      const startStr = String(booking.start_time).slice(0, 5);
      const endStr = String(booking.end_time).slice(0, 5);
      const dateStr = new Date(booking.booking_date).toLocaleDateString();
      const body = `A ${booking.booking_type.replace(/_/g, ' ')} has opened at ${booking.branch_name || 'a nearby branch'} on ${dateStr} from ${startStr} to ${endStr}.`;

      const [existing] = await conn.query(
        `SELECT n.id FROM notifications n
         JOIN notification_actions na ON na.id = n.action_id
         WHERE n.user_id = ? AND na.action_key = 'view_matchmaking_booking'
           AND JSON_EXTRACT(n.action_payload, '$.bookingId') = ?
         LIMIT 1`,
        [player.id, booking.id]
      );
      if (existing.length) {
        console.log(`  Booking ${booking.id}: notification already exists for user ${player.id} (${player.full_name})`);
        continue;
      }

      const [result] = await conn.query(
        `INSERT INTO notifications (user_id, category_id, action_id, action_payload, title, body, icon, is_pushed)
         VALUES (?, ?, ?, ?, 'Looking for Players!', ?, '🎯', TRUE)`,
        [player.id, categoryId, actionId, JSON.stringify({ bookingId: booking.id }), body]
      );

      await conn.query(
        `INSERT INTO notification_queue (user_id, notification_id, channel, status)
         VALUES (?, ?, 'in_app', 'sent')`,
        [player.id, result.insertId]
      );

      sent++;
      console.log(`  Booking ${booking.id}: notification sent to user ${player.id} (${player.full_name})`);
    }

    console.log(`  Booking ${booking.id}: sent ${sent}/${players.length} notifications`);
  }

  await conn.end();
  console.log('Done');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
