import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/package.json'))
const mysql = require('mysql2/promise')

// ── Config ──────────────────────────────────────────────────────────────────
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT || '3306')
const DB_USER = process.env.DB_USER || 'root'
const DB_PASS = process.env.DB_PASSWORD || process.env.DB_PASS || ''
const DB_NAME = process.env.DB_NAME || 'courtzon_v2'
const BATCH_SIZE = 50
const LOG_FILE = 'database/seed/seed.log'

// ensure log dir
mkdirSync('database/seed', { recursive: true })

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try { appendFileSync(LOG_FILE, line + '\n') } catch {}
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  // escape single quotes for SQL
  return "'" + String(val).replace(/'/g, "''") + "'"
}

// ── Batch Insert Engine ─────────────────────────────────────────────────────
// Processes rows in small batches, each as a single INSERT IGNORE statement.
// Returns number of rows inserted.
export async function batchInsert(conn, table, columns, rows, batchSize = BATCH_SIZE) {
  if (!rows.length) return 0
  let inserted = 0
  const colList = columns.map(c => `\`${c}\``).join(', ')
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const values = chunk.map(row => {
      const vals = columns.map(c => esc(row[c]))
      return '(' + vals.join(', ') + ')'
    }).join(',\n')
    const sql = `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES\n${values};`
    try {
      const [result] = await conn.query(sql)
      inserted += result.affectedRows || 0
    } catch (err) {
      log(`  ⚠ ${table} batch ${i / batchSize + 1}: ${err.message}`)
    }
  }
  return inserted
}

// ── Module Loader ───────────────────────────────────────────────────────────
async function loadModule(name, conn, ctx) {
  log(`\n📦 Module: ${name}`)
  const mod = await import(`./modules/${name}.mjs`)
  const count = await mod.default(conn, ctx)
  log(`  ✅ ${name} → ${count} total rows inserted`)
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════')
  log('CourtZon-V2 Full Seed System v2')
  log('═══════════════════════════════════════════')
  log(`Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}`)

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    multipleStatements: false,
    connectTimeout: 30000,
  })
  log('Connected to database')

  // context object passed to all modules for sharing generated IDs
  const ctx = {
    userIds: [],
    orgIds: [],
    branchIds: [],
    resourceIds: [],
    bookingIds: [],
    productIds: [],
    orderIds: [],
    categoryIds: [],
    couponIds: [],
    eventIds: [],
    tournamentIds: [],
    adCampaignIds: [],
    coachIds: [],
    sellerIds: [],
  }

  const modules = [
    'polygons',    // province & city navigation polygons (runs after SQL seed deletes/re-inserts)
    'reference',   // countries, currencies, sports, settings, design_tokens, lookups
    'rbac',        // permission_modules, permissions, roles, role_permissions
    'users',       // users, profiles, wallets, addresses, devices
    'orgs',        // orgs, branches, resources, amenities, operating_hours, holidays, bank_accounts
    'academies',   // academies, curriculums, enrollments, evaluations, sessions
    'bookings',    // booking_slots, bookings, participants, invitations, cancellations
    'marketplace', // categories, products, reviews, orders, coupons, cart_items
    'community',   // events, tournaments, announcements, conversations
    'financial',   // wallet_txns, payment_txns, commission_rules, subscriptions, settlements
    'notifications', // notifications, notification_queue
    'activity',    // audit_logs, activity_logs
    'misc',        // translations, cron_jobs, media_uploads, cms, ads
    'new_tables',  // transactions, entries, sellers, settlements, subscriptions
  ]

  for (const modName of modules) {
    try {
      await loadModule(modName, conn, ctx)
    } catch (err) {
      log(`  ❌ ${modName} FAILED: ${err.message}`)
      // continue to next module
    }
  }

  log('\n═══════════════════════════════════════════')
  log('Seed complete!')
  log('═══════════════════════════════════════════')

  await conn.end()
}

main().catch(err => {
  log(`FATAL: ${err.message}`)
  process.exit(1)
})
