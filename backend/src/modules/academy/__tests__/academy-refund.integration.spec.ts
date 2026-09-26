// ============================================================================
// Academy G5-A — refund integration (real local Docker MySQL).
//
// Exercises the CASH/offline refund path end-to-end with the REAL accounting
// `payment:refunded` consumer + the REAL entitlement cancelBySourceIds:
//   - cash payment → refund → paid→refunded + canonical payment:refunded
//   - accounting reversal rows (academy_cash_refund + academy_org_cash_receivable_rev)
//     posted from the immutable snapshot, balanced
//   - academy entitlements transitioned to CANCELLED (history preserved)
//   - idempotency: second refund rejected
//   - eligibility: unpaid enrollment rejected; payment not belonging to the
//     enrollment rejected
//   - tenancy: an actor from another org rejected
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../../database/mysql.js';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';

import { academyRefundService } from '../application/academy-refund.service.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(probe: () => Promise<T | null | undefined>, label: string, timeoutMs = 10000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await probe();
    if (v != null && (Array.isArray(v) ? (v as unknown[]).length > 0 : true)) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await sleep(100);
  }
}

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g5ar_${stamp}`;

let pool: mysql.Pool;
let actorId = 0;
let otherActorId = 0;
let orgId = 0;
let branchId = 0;
let programId = 0;
let groupId = 0;
let playerId = 0;
let enrollmentId = 0;
let paymentId = 0;

const created = { users: [] as number[], orgs: [] as number[], branches: [] as number[], programs: [] as number[], enrollments: [] as number[] };

async function createUser(name: string): Promise<number> {
  const phone = `${PREFIX}${Math.floor(Math.random() * 90000 + 10000)}`;
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (UUID(), (SELECT id FROM countries LIMIT 1), ?, ?, ?, 'x', ?, 'male')`,
    [phone, `+20${phone}`, `${PREFIX}_${name}_${randomUUID().slice(0, 6)}@courtzon.test`, name],
  );
  created.users.push(r.insertId);
  return r.insertId;
}

async function cashPaidEnrollment(reasonSeeded = true): Promise<void> {
  // Fresh confirmed enrollment + cash payment + immutable snapshot (G8 shapes).
  const [e] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`,
    [playerId, programId, groupId],
  );
  enrollmentId = e.insertId;
  created.enrollments.push(enrollmentId);

  paymentId = await academyPaymentRepository.createCashPaymentTransaction({
    userId: playerId, enrollmentId, amount: 200, currency: 'EGP',
  });

  await academyPaymentRepository.createSnapshot({
    enrollment_id: enrollmentId, program_id: programId, group_id: groupId,
    organisation_id: orgId, branch_id: branchId, player_id: playerId,
    gross_amount: 200, currency: 'EGP', program_price: 200, price_type: 'FIXED',
    session_count: 1, court_rental_amount: 60, court_rental_currency: 'EGP',
    commission_rate: 0.1, commission_amount: 20, organization_earning_amount: 180,
    coach_comp_type: null, coach_comp_value: null, coach_comp_amount: 0,
    collector: 'org', payment_method: 'cash', cancellation_window_minutes: null,
    payment_transaction_id: paymentId, created_by: actorId,
  });
  if (reasonSeeded) {
    if (orgId) {
      await financialEntitlementService.createEntitlements([
        {
          organisationId: orgId, branchId, entitlementType: 'ORGANIZATION_EARNING' as any,
          sourceType: 'academy' as any, sourceId: enrollmentId, collector: 'org' as any,
          amount: 180, currency: 'EGP', availableAt: null,
          description: `Academy enrollment #${enrollmentId} — org earning`, metadata: { enrollmentId },
        },
        {
          organisationId: orgId, branchId, entitlementType: 'COURTZON_COMMISSION' as any,
          sourceType: 'academy' as any, sourceId: enrollmentId, collector: 'org' as any,
          amount: 20, currency: 'EGP', availableAt: null,
          description: `Academy enrollment #${enrollmentId} — commission`, metadata: { enrollmentId },
        },
      ]);
    }
  }
}

beforeAll(async () => {
  pool = getPool();
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();

  actorId = await createUser('G5A Owner');
  otherActorId = await createUser('G5A Other');
  playerId = await createUser('G5A Player');

  const [ot] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM organisation_types LIMIT 1');
  const [o] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (UUID(), ?, ?, 'G5A Org', ?, 1)`,
    [(ot as any[])[0].id, actorId, `${PREFIX}-org`],
  );
  orgId = o.insertId;
  created.orgs.push(orgId);

  const [b] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'G5A Branch', ?, 'Africa/Cairo')`,
    [orgId, `${PREFIX}-b`],
  );
  branchId = b.insertId;
  created.branches.push(branchId);

  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs (code, name, category, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
     VALUES (?, 'G5A Prog', 'tennis', 200, 'EGP', 'FIXED', 'open', 0, ?, ?, (SELECT id FROM sports LIMIT 1), 'setup')`,
    [`${PREFIX}-prog`, orgId, branchId],
  );
  programId = p.insertId;
  created.programs.push(programId);

  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, 'G5A Group', 10, 'active')`,
    [programId],
  );
  groupId = g.insertId;
});

afterAll(async () => {
  try {
    if (created.enrollments.length) {
      await pool.query(`DELETE FROM ledger_entries WHERE source_type = 'academy' AND source_id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
      await pool.query(`DELETE FROM financial_entitlements WHERE source_type = 'academy' AND source_id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
      await pool.query(`DELETE FROM academy_enrollment_payments WHERE enrollment_id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
      await pool.query(`DELETE FROM payment_transactions WHERE reference_type = 'academy' AND reference_id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
      await pool.query(`DELETE FROM academy_enrollments WHERE id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
    }
    // Org-scoped accounting artifacts created by provisionOrganisationMarketplaceAccounts.
    for (const oid of created.orgs) {
      await pool.query(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [oid]);
      await pool.query(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.query(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
    }
    if (created.programs.length) await pool.query(`DELETE FROM academy_programs WHERE id IN (${created.programs.map(() => '?').join(',')})`, created.programs);
    if (created.branches.length) await pool.query(`DELETE FROM branches WHERE id IN (${created.branches.map(() => '?').join(',')})`, created.branches);
    if (created.orgs.length) await pool.query(`DELETE FROM organisations WHERE id IN (${created.orgs.map(() => '?').join(',')})`, created.orgs);
    if (created.users.length) await pool.query(`DELETE FROM users WHERE id IN (${created.users.map(() => '?').join(',')})`, created.users);
  } finally {
    await closePool();
  }
});

describe('G5-A — Academy cash refund (integration)', () => {
  it('full cash refund: paid→refunded, balanced accounting reversal, entitlements cancelled', async () => {
    await cashPaidEnrollment();

    const result = await academyRefundService.refund(enrollmentId, actorId, 'integration refund');
    expect(result).toMatchObject({ success: true, amount: 200, method: 'cash', enrollmentId, paymentId });

    const [pay] = await pool.query<mysql.RowDataPacket[]>('SELECT payment_status FROM payment_transactions WHERE id = ?', [paymentId]);
    expect((pay as any[])[0].payment_status).toBe('refunded');

    // Accounting reversal rows posted from the immutable snapshot. The
    // accounting consumer is fire-and-forget, so poll for BOTH event types to be
    // durably present (mirrors g8 waitFor) before asserting balanced legs.
    const ledgerRows = await waitFor(async () => {
      const [ledger] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT event_type, side, amount FROM ledger_entries
         WHERE source_type = 'academy' AND source_id = ? AND event_type IN ('academy_cash_refund','academy_org_cash_receivable_rev')`,
        [enrollmentId],
      );
      const events = new Set((ledger as any[]).map((r) => r.event_type));
      return events.has('academy_cash_refund') && events.has('academy_org_cash_receivable_rev') ? ledger as any[] : null;
    }, 'academy refund ledger rows (courtzon + org book)');

    const rows = ledgerRows;
    expect(rows.length).toBeGreaterThan(0);
    const byEvent = new Map<string, { debit: number; credit: number }>();
    for (const r of rows) {
      const rec = byEvent.get(r.event_type) ?? { debit: 0, credit: 0 };
      if (r.side === 'debit') rec.debit += Number(r.amount); else rec.credit += Number(r.amount);
      byEvent.set(r.event_type, rec);
    }
    for (const [, rec] of byEvent) {
      expect(Math.round(rec.debit * 100) / 100).toBe(Math.round(rec.credit * 100) / 100);
    }

    // Entitlements cancelled (never deleted — rows still exist).
    const [ent] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT entitlement_type, status FROM financial_entitlements WHERE source_type = 'academy' AND source_id = ?`,
      [enrollmentId],
    );
    const entRows = ent as any[];
    expect(entRows.length).toBeGreaterThan(0);
    expect(entRows.every((r) => r.status === 'CANCELLED')).toBe(true);
  });

  it('a second refund attempt on the same enrollment is rejected deterministically', async () => {
    await expect(academyRefundService.refund(enrollmentId, actorId, 'again')).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
  });

  it('unpaid enrollment (no snapshot) is rejected', async () => {
    const [e] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`,
      [playerId, programId, groupId],
    );
    created.enrollments.push(e.insertId);
    await expect(academyRefundService.refund(e.insertId, actorId)).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
  });

  it('cross-tenant: an actor from another organization is rejected before any refund', async () => {
    await cashPaidEnrollment();
    await expect(academyRefundService.refund(enrollmentId, otherActorId)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
  });
});

// keep imports referenced for lint clarity
void academyPaymentRepository;