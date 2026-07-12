#!/usr/bin/env node
// ============================================================================
// Backfill: start_at_utc, end_at_utc, business_date
// ============================================================================
// Populates the new Time Engine columns for existing bookings and intents.
// Works in Docker containers where env vars come from compose env_file.
// Does NOT depend on load-file-env.js — uses process.env directly.
//
// Usage: node scripts/backfill-time-columns.mjs
// ============================================================================

import { createPool } from 'mysql2/promise'

const DB_CONFIG = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'courtzon_v3',
  timezone: '+00:00',
  multipleStatements: false,
}

// ── Simple local→UTC conversion (no TimeEngine dependency needed for backfill) ──

function localToUtc(dateStr, timeStr, timezone) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.split(':').map(Number)

  let tentativeUtc = Date.UTC(y, m - 1, d, h, min)
  let prevOffset = null

  for (let i = 0; i < 5; i++) {
    const offset = getUtcOffsetMinutes(new Date(tentativeUtc).toISOString(), timezone)
    if (prevOffset !== null && offset === prevOffset) break
    prevOffset = offset
    tentativeUtc = Date.UTC(y, m - 1, d, h, min) - offset * 60000
  }

  return new Date(tentativeUtc).toISOString()
}

function getUtcOffsetMinutes(isoString, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(isoString))

  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT'
  const match = tzName.match(/GMT([+-]\d{2}):(\d{2})/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    return hours * 60 + (hours >= 0 ? mins : -mins)
  }
  return 0
}

function utcToLocalDate(isoString, timezone) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoString))

  const y = parts.find(p => p.type === 'year')?.value || '2026'
  const mo = parts.find(p => p.type === 'month')?.value || '01'
  const d = parts.find(p => p.type === 'day')?.value || '01'
  return `${y}-${mo}-${d}`
}

function utcToLocalTime(isoString, timezone) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(isoString))

  const h = parts.find(p => p.type === 'hour')?.value || '00'
  const min = parts.find(p => p.type === 'minute')?.value || '00'
  return `${h}:${min}`
}

// ── Compute business_date from UTC instant + branch hours ──

function computeBusinessDate(utcInstant, openingHours, closingHours, timezone) {
  const localDate = utcToLocalDate(utcInstant, timezone)
  const localTime = utcToLocalTime(utcInstant, timezone)
  const isOvernight = closingHours <= openingHours

  if (!isOvernight) return localDate

  if (localTime >= openingHours) return localDate

  if (localTime < closingHours) {
    const [y, m, d] = localDate.split('-').map(Number)
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
    const yStr = yesterday.getUTCFullYear().toString()
    const mStr = (yesterday.getUTCMonth() + 1).toString().padStart(2, '0')
    const dStr = yesterday.getUTCDate().toString().padStart(2, '0')
    return `${yStr}-${mStr}-${dStr}`
  }

  return localDate
}

// ── Format UTC ISO string for MySQL TIMESTAMP ──

function toMysqlDatetime(isoString) {
  return isoString.replace('T', ' ').replace(/\.\d+Z$/, '')
}

// ── Format possibly-Date value from MySQL to string ──

function formatTime(val) {
  if (val == null) return '00:00'
  if (val instanceof Date) {
    return `${String(val.getUTCHours()).padStart(2, '0')}:${String(val.getUTCMinutes()).padStart(2, '0')}`
  }
  return String(val).slice(0, 5)
}

function formatDate(val) {
  if (val == null) return '2026-01-01'
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

// ── Main ──

async function main() {
  console.log('=== Backfill: Time Engine Columns ===')
  console.log(`Database: ${DB_CONFIG.database}@${DB_CONFIG.host}:${DB_CONFIG.port}`)
  console.log()

  const pool = createPool(DB_CONFIG)

  try {
    // ── Step 1: Fetch all branches ──
    const [branches] = await pool.execute(
      'SELECT id, timezone, opening_time, closing_time FROM branches'
    )
    const branchMap = new Map()
    for (const b of branches) {
      const tz = b.timezone || 'Africa/Cairo'
      const opening = b.opening_time ? formatTime(b.opening_time) : '08:00'
      const closing = b.closing_time ? formatTime(b.closing_time) : '22:00'
      branchMap.set(b.id, { timezone: tz, openingHours: opening, closingHours: closing })
    }
    console.log(`Loaded ${branchMap.size} branches`)

    // ── Step 2: Backfill bookings ──
    const [bookings] = await pool.execute(
      `SELECT b.id, b.branch_id, b.booking_date, b.start_time, b.end_time
       FROM bookings b
       WHERE b.start_at_utc IS NULL
       ORDER BY b.id ASC`
    )
    console.log(`Bookings to backfill: ${bookings.length}`)

    let bookingUpdated = 0
    let bookingError = 0

    for (const bk of bookings) {
      try {
        const branch = branchMap.get(bk.branch_id)
        if (!branch) {
          console.warn(`  ⚠ Booking #${bk.id}: branch ${bk.branch_id} not found, skipping`)
          bookingError++
          continue
        }

        const bookingDate = formatDate(bk.booking_date)
        const startTime = formatTime(bk.start_time)
        const endTime = formatTime(bk.end_time)

        const startAtUtc = localToUtc(bookingDate, startTime, branch.timezone)
        const endAtUtc = localToUtc(bookingDate, endTime, branch.timezone)
        const businessDate = computeBusinessDate(
          startAtUtc, branch.openingHours, branch.closingHours, branch.timezone
        )

        await pool.execute(
          `UPDATE bookings SET start_at_utc = ?, end_at_utc = ?, business_date = ? WHERE id = ?`,
          [toMysqlDatetime(startAtUtc), toMysqlDatetime(endAtUtc), businessDate, bk.id]
        )
        bookingUpdated++
      } catch (err) {
        console.error(`  ✗ Booking #${bk.id}: ${err.message}`)
        bookingError++
      }
    }
    console.log(`  Updated: ${bookingUpdated}, Errors: ${bookingError}`)

    // ── Step 3: Backfill booking_intents ──
    const [intents] = await pool.execute(
      `SELECT i.id, i.branch_id, i.booking_date, i.start_time, i.end_time
       FROM booking_intents i
       WHERE i.start_at_utc IS NULL
       ORDER BY i.id ASC`
    )
    console.log(`\nIntents to backfill: ${intents.length}`)

    let intentUpdated = 0
    let intentError = 0

    for (const intent of intents) {
      try {
        const branch = branchMap.get(intent.branch_id)
        if (!branch) {
          console.warn(`  ⚠ Intent #${intent.id}: branch ${intent.branch_id} not found, skipping`)
          intentError++
          continue
        }

        const bookingDate = formatDate(intent.booking_date)
        const startTime = formatTime(intent.start_time)
        const endTime = formatTime(intent.end_time)

        const startAtUtc = localToUtc(bookingDate, startTime, branch.timezone)
        const endAtUtc = localToUtc(bookingDate, endTime, branch.timezone)
        const businessDate = computeBusinessDate(
          startAtUtc, branch.openingHours, branch.closingHours, branch.timezone
        )

        await pool.execute(
          `UPDATE booking_intents SET start_at_utc = ?, end_at_utc = ?, business_date = ? WHERE id = ?`,
          [toMysqlDatetime(startAtUtc), toMysqlDatetime(endAtUtc), businessDate, intent.id]
        )
        intentUpdated++
      } catch (err) {
        console.error(`  ✗ Intent #${intent.id}: ${err.message}`)
        intentError++
      }
    }
    console.log(`  Updated: ${intentUpdated}, Errors: ${intentError}`)

    // ── Summary ──
    console.log('\n=== Backfill Complete ===')
    console.log(`Bookings updated: ${bookingUpdated}`)
    console.log(`Intents updated:  ${intentUpdated}`)
    console.log(`Total errors:     ${bookingError + intentError}`)

    if (bookingError + intentError > 0) {
      console.log('\n⚠ Some rows had errors. Review the output above.')
      process.exit(1)
    }

    console.log('\n✅ All rows backfilled successfully.')
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
