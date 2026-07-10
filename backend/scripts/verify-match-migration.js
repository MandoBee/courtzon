#!/usr/bin/env node
import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'courtzon_v3',
} = process.env;

async function verify() {
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
    const checks = [
      { name: 'matches table', sql: 'SELECT COUNT(*) as cnt FROM matches', expectedMin: 0 },
      { name: 'public_match_details table', sql: 'SELECT COUNT(*) as cnt FROM public_match_details', expectedMin: 0 },
      { name: 'invitations table', sql: 'SELECT COUNT(*) as cnt FROM invitations', expectedMin: 0 },
      { name: 'join_requests table', sql: 'SELECT COUNT(*) as cnt FROM join_requests', expectedMin: 0 },
      { name: 'match_participants table', sql: 'SELECT COUNT(*) as cnt FROM match_participants', expectedMin: 0 },
      { name: 'match_sessions table', sql: 'SELECT COUNT(*) as cnt FROM match_sessions', expectedMin: 0 },
      { name: 'waiting_list table', sql: 'SELECT COUNT(*) as cnt FROM waiting_list', expectedMin: 0 },
    ];

    let allPassed = true;

    for (const check of checks) {
      const [rows] = await pool.execute(check.sql);
      const count = Number(rows[0]?.cnt ?? 0);
      const passed = count >= check.expectedMin;
      console.log(`${passed ? '✅' : '❌'} ${check.name}: ${count} rows (expected >= ${check.expectedMin})`);
      if (!passed) allPassed = false;
    }

    const [fkIssues] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM matches m
       LEFT JOIN bookings b ON b.id = m.booking_id
       WHERE m.booking_id IS NOT NULL AND b.id IS NULL`
    );
    const orphanCount = Number(fkIssues[0]?.cnt ?? 0);
    if (orphanCount > 0) {
      console.log(`❌ Orphan matches (booking_id not found): ${orphanCount}`);
      allPassed = false;
    } else {
      console.log(`✅ No orphan matches`);
    }

    const [pmdOrphans] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM public_match_details pmd
       LEFT JOIN matches m ON m.id = pmd.match_id
       WHERE m.id IS NULL`
    );
    const pmdOrphanCount = Number(pmdOrphans[0]?.cnt ?? 0);
    if (pmdOrphanCount > 0) {
      console.log(`❌ Orphan public_match_details: ${pmdOrphanCount}`);
      allPassed = false;
    } else {
      console.log(`✅ No orphan public_match_details`);
    }

    if (allPassed) {
      console.log('\n✅ All checks passed');
      process.exit(0);
    } else {
      console.log('\n❌ Some checks failed');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
