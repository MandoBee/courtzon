// ONE-SHOT IDEMPOTENT REMEDIATION
// Backfills the missing Organization-book cash receipt
// (booking_org_cash_receivable, org-scoped ORG-CASH / Court Rental Revenue /
// Commission Expense / CourtZon Payable) for legacy CASH/COD bookings created
// BEFORE the org cash book was implemented (pre 2026-09-05). It also re-posts
// the CourtZon-book COD recognition (booking_cod_payment) and the coach payout
// event when missing.
//
// Safe to re-run at any time: every posting is idempotent via hasPosting() +
// the ledger_entries dedup key. Existing entries (including the old,
// org-attributed booking_cod_payment rows) are NEVER modified or deleted.
//
// Usage (from backend/): node scripts/backfill-booking-org-cash.mjs [id,id,...]
import mysql from 'mysql2/promise';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'courtzon2026';
process.env.DB_NAME = process.env.DB_NAME || 'courtzon_v3';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

const { getPool } = await import('../src/database/mysql.js');
const { postAccountingEvent } = await import('../src/modules/financial/application/accounting-event.listener.js');
const { bookingAccounting } = await import('../src/modules/financial/application/booking-accounting.service.js');

const pool = getPool();
const log = (...a) => console.log(...a);

async function findAffected(targets) {
  if (targets && targets.length) {
    const [rows] = await pool.execute(
      `SELECT id, organisation_id, payment_method, booking_status, total_amount, commission_amount
       FROM bookings WHERE id IN (?) ORDER BY id`, [targets],
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT b.id, b.organisation_id, b.payment_method, b.booking_status,
            b.total_amount, b.commission_amount
     FROM bookings b
     JOIN (
       SELECT DISTINCT source_id FROM ledger_entries
       WHERE source_type='booking' AND event_type='booking_cod_payment'
     ) cod ON cod.source_id = b.id
     WHERE b.payment_method IN ('cod','cash')
       AND b.organisation_id IS NOT NULL
       AND b.booking_status IN ('completed','checked_in','confirmed','in_progress')
       AND NOT EXISTS (
         SELECT 1 FROM ledger_entries le
         WHERE le.source_type='booking' AND le.source_id=b.id
           AND le.event_type='booking_org_cash_receivable'
       )
     ORDER BY b.id`,
  );
  return rows;
}

async function isPosted(bookingId, eventType) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type=? LIMIT 1`,
    [bookingId, eventType],
  );
  return rows.length > 0;
}

const [hasPostedEnt] = await pool.execute(
  `SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name='ledger_entries' AND column_name='has_posting' LIMIT 1`,
  [process.env.DB_NAME],
);
const hasPostingCol = hasPostedEnt.length > 0;

async function backfill(bookingId) {
  const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
  if (!econ) { log(`  skipt booking#${bookingId}: economics not resolvable`); return false; }
  const orgId = econ.organisationId;
  if (orgId == null) { log(`  skipt booking#${bookingId}: no organisation`); return false; }

  let changed = false;

  // CourtZon book COD recognition (idempotent skip if already present).
  if (!(await isPosted(bookingId, 'booking_cod_payment'))) {
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, null,
      {
        marketplace_receivable: econ.commissionAmount + econ.taxAmount,
        platform_commission: econ.commissionAmount,
        tax_liability: econ.taxAmount,
      },
      econ.currency,
      `Booking #${bookingId} COD payment (commission/tax receivable)`,
      undefined,
      { marketplace_receivable: null, platform_commission: null, tax_liability: null },
    );
    changed = true;
  }

  // Organization book cash receipt (the core backfill).
  if (!(await isPosted(bookingId, 'booking_org_cash_receivable'))) {
    const cashGross = Math.round((econ.orgAmount + econ.commissionAmount) * 100) / 100;
    await postAccountingEvent(
      'booking_org_cash_receivable', 'booking', bookingId, orgId,
      {
        org_cash_bank: cashGross,
        commission_expense: econ.commissionAmount,
        court_rental_revenue: cashGross,
        courtzon_payable: econ.commissionAmount,
      },
      econ.currency,
      `Booking #${bookingId} organization book (COD cash collected)`,
      undefined,
      {
        org_cash_bank: orgId,
        commission_expense: orgId,
        court_rental_revenue: orgId,
        courtzon_payable: orgId,
      },
    );
    changed = true;
  } else {
    log(`  booking#${bookingId}: booking_org_cash_receivable already posted — skip`);
  }

  // Coach payout event (only when the booking has a coach share).
  if (econ.coachAmount > 0 && !(await isPosted(bookingId, 'booking_coach_payout'))) {
    await postAccountingEvent(
      'booking_coach_payout', 'booking', bookingId, orgId,
      { coach_expense: econ.coachAmount, coach_payable: econ.coachAmount },
      econ.currency,
      `Booking #${bookingId} coach payout`,
    );
    changed = true;
  }

  const [le] = await pool.execute(
    `SELECT event_type, chart_account_id, organisation_id, side, amount
     FROM ledger_entries WHERE source_type='booking' AND source_id=? ORDER BY id`, [bookingId],
  );
  log(`  booking#${bookingId} ledger summary (${le.length} entries):`);
  for (const r of le) log(`    [${r.event_type}] org=${r.organisation_id ?? 'GLOBAL'} ${r.side} ${Number(r.amount)} (acct ${r.chart_account_id})`);

  return changed;
}

const targets = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const affected = await findAffected(targets.length ? targets : undefined);
log(`Found ${affected.length} CASH/COD booking(s) missing the organization cash book receipt.`);
if (!affected.length) process.exit(0);

const results = [];
for (const b of affected) {
  log(`\nProcessing booking#${b.id} (org=${b.organisation_id}, ${b.payment_method}, status=${b.booking_status}, total=${b.total_amount}, commission=${b.commission_amount})`);
  results.push({ id: b.id, changed: await backfill(b.id) });
}

if (hasPostingCol) {
  log('\nNOTE: has_posting column detected; postings are dedup-safe.');
}
log('\nDone. Summary: ' + JSON.stringify(results));
await pool.end();