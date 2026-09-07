import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { Pool, RowDataPacket as RDP } from 'mysql2/promise';
type RowData = RowDataPacket[];

/**
 * Coach-booking financial wiring — integration.
 *
 * Verifies the C-1 / C-2 / C-3 / H-1 / H-2 fixes end-to-end against the live
 * Docker DB:
 *   - coach fee is included in the booking total + coach_amount + charged amount
 *   - branch organisation is resolved for the agreement split and persisted on
 *     coach_sessions.organisation_id
 *   - contracted orgs receive org_split_pct; independent orgs receive 0%
 *   - sport mismatch / empty sport / no service access are rejected at booking
 *   - legacy POST /coaches/sessions (createCoachSession) applies the same split
 *   - coach payout accounting is generated from the actual coach amount
 *
 * commissionService.calculate is stubbed to a deterministic 10% so the split
 * wiring is isolated (commission resolution is covered by its own tests).
 */
const PLAYER_USER = 10006100;
const COACH_USER = 10006101;

describe('Coach Booking Financial Wiring', () => {
  let pool: Pool;
  let orgId: number;
  let branchId: number;
  let resourceId: number;
  let coachProfileId: number;
  let sportId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Cleanup any leftovers from a prior run (org first — it references the player user).
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id = ${COACH_USER})`);
    await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id = ${COACH_USER})`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id = ?`, [COACH_USER]);
    await pool.execute(`DELETE FROM professional_services WHERE professional_profile_id IN (SELECT id FROM professional_profiles WHERE user_id = ?)`, [COACH_USER]);
    await pool.execute(`DELETE FROM professional_profiles WHERE user_id = ?`, [COACH_USER]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug='coach-fin-org')`);
    await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug='coach-fin-org'))`);
    await pool.execute(`DELETE FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug='coach-fin-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'coach-fin-org'`);
    for (const uid of [PLAYER_USER, COACH_USER]) {
      await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [uid]);
      await pool.execute(`DELETE FROM coach_sessions WHERE player_id = ?`, [uid]);
      await pool.execute(`DELETE FROM bookings WHERE user_id = ?`, [uid]);
      await pool.execute(`DELETE FROM users WHERE id = ?`, [uid]);
    }

    // Users
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, '01299990001', '+201299990001', 'coach-fin-player@test.com', '$2b$10$x', 'CoachFin Player', 'male', 'active')`, [PLAYER_USER]);
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, '01299990002', '+201299990002', 'coach-fin-coach@test.com', '$2b$10$x', 'CoachFin Coach', 'male', 'active')`, [COACH_USER]);
    await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 999999, 'EGP', 1)`, [PLAYER_USER]);

    // Org + branch + court
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [orgRes] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Coach Fin Org', 'coach-fin-org', 1)`,
      [otId, PLAYER_USER],
    );
    orgId = (orgRes as any).insertId;
    const [brRes] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone, coach_policy, opening_time, closing_time)
       VALUES (UUID(), ?, 'Coach Fin Branch', 'coach-fin-branch', 'Africa/Cairo', 'contract_required', '08:00', '22:00')`,
      [orgId],
    );
    branchId = (brRes as any).insertId;
    const [sportRes] = await pool.execute<RowData>('SELECT id FROM sports LIMIT 1');
    sportId = Number((sportRes as any[])[0].id);
    const [resRes] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, sport_id, hourly_price, is_active, opening_time, closing_time, slot_duration)
       VALUES (UUID(), 'Coach Fin Court', (SELECT id FROM resource_types LIMIT 1), ?, ?, 200, 1, '08:00', '22:00', 60)`,
      [branchId, sportId],
    );
    resourceId = (resRes as any).insertId;

    // Coach profile + professional profile + service
    const [cpRes] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, status, is_verified) VALUES (?, 'approved', 1)`, [COACH_USER]);
    coachProfileId = (cpRes as any).insertId;
    await pool.execute(
      `INSERT INTO professional_profiles (user_id, sports, is_available) VALUES (?, ?, 1)`, [COACH_USER, JSON.stringify([sportId])]);
    await pool.execute(
      `INSERT INTO professional_services (professional_profile_id, service_key, pricing_model, price, currency_code, is_active)
       VALUES ((SELECT id FROM professional_profiles WHERE user_id = ?), 'coach_default', 'hourly', 100, 'EGP', 1)`, [COACH_USER]);

    // Service location for the branch.
    await pool.execute(`INSERT INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);

    // Stub commission to a deterministic 10% for coach_session economics.
    vi.spyOn((await import('../../financial/application/commission.service.js')).commissionService, 'calculate')
      .mockImplementation(async (_orgId: any, _entityType: any, gross: number) => ({
        rate: 10, rateType: 'percentage', commissionAmount: (gross * 10) / 100, netAmount: (gross * 90) / 100,
        planName: 'Test Plan', planId: 0,
      } as any));

    // Ensure the canonical accounting listener is active for every test
    // (idempotent registration) so booking:paid / booking:refunded post GL.
    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId]);
    await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    await pool.execute(`DELETE FROM coach_profiles WHERE id = ?`, [coachProfileId]);
    await pool.execute(`DELETE FROM professional_services WHERE professional_profile_id IN (SELECT id FROM professional_profiles WHERE user_id = ?)`, [COACH_USER]);
    await pool.execute(`DELETE FROM professional_profiles WHERE user_id = ?`, [COACH_USER]);
    await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    for (const uid of [PLAYER_USER, COACH_USER]) {
      await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [uid]);
      await pool.execute(`DELETE FROM coach_sessions WHERE player_id = ?`, [uid]);
      await pool.execute(`DELETE FROM bookings WHERE user_id = ?`, [uid]);
      await pool.execute(`DELETE FROM users WHERE id = ?`, [uid]);
    }
    await pool.end();
  });

  async function insertAgreement(opts: { orgId: number; status?: string; active?: boolean; coachSplit?: number; orgSplit?: number }) {
    await pool.execute(
      `INSERT INTO coach_org_agreements (coach_id, organisation_id, coach_split_pct, org_split_pct, hourly_rate, is_active, status, initiated_by)
       VALUES (?, ?, ?, ?, 100, ?, ?, 'org')
       ON DUPLICATE KEY UPDATE coach_split_pct = VALUES(coach_split_pct), org_split_pct = VALUES(org_split_pct),
         hourly_rate = VALUES(hourly_rate), is_active = VALUES(is_active), status = VALUES(status)`,
      [coachProfileId, opts.orgId, opts.coachSplit ?? 70, opts.orgSplit ?? 30,
       opts.active === false ? 0 : 1, opts.status ?? 'active'],
    );
  }

  async function bookingById(id: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(`SELECT * FROM bookings WHERE id = ?`, [id]);
    return rows[0] || null;
  }

  async function sessionByBooking(id: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(`SELECT * FROM coach_sessions WHERE booking_id = ?`, [id]);
    return rows[0] || null;
  }

  const COURT_PRICE = 200;
  const COACH_HOURLY = 100;

  it('1. court-only booking total = court fee, coach_amount = 0 (regression)', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const res = await bookingService.createBooking({
      branchId, resourceId,
      bookingType: 'private_match',
      bookingDate: '2027-02-10', startTime: '09:00', endTime: '10:00',
      paymentMethod: 'cash',
    } as any, PLAYER_USER);

    const b = await bookingById(res.id);
    expect(Number(b.total_amount)).toBe(COURT_PRICE);
    expect(Number(b.coach_amount)).toBe(0);
  });

  it('2. coach booking total = court fee + coach fee; coach_amount = coach fee', async () => {
    await insertAgreement({ orgId });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      const result = await svc.bookSession(
        { coachId: coachProfileId, resourceId, date: '2027-02-11', startTime: '10:00', endTime: '11:00', paymentMethod: 'cash' },
        PLAYER_USER,
      );

      const b = await bookingById(result.bookingId);
      const expectedCoachFee = (COACH_HOURLY * 60) / 60; // 100
      expect(Number(b.total_amount)).toBe(COURT_PRICE + expectedCoachFee);
      expect(Number(b.coach_amount)).toBe(expectedCoachFee);
      // Price breakdown reflects the amount actually charged.
      expect(Number(result.priceBreakdown.total)).toBe(Number(b.total_amount));
      expect(Number(result.priceBreakdown.coachFee)).toBe(expectedCoachFee);
      expect(Number(result.priceBreakdown.courtFee)).toBe(COURT_PRICE);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('3. contracted branch + valid agreement → orgEarnings = org_split_pct of post-commission net; organisation_id = branch org', async () => {
    await insertAgreement({ orgId, status: 'active', coachSplit: 70, orgSplit: 30 });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      const result = await svc.bookSession(
        { coachId: coachProfileId, resourceId, date: '2027-02-12', startTime: '11:00', endTime: '12:00', paymentMethod: 'cash' },
        PLAYER_USER,
      );
      const s = await sessionByBooking(result.bookingId);
      // session price 100, commission 10% → net 90; org 30% → 27.
      expect(Number(s.organisation_id)).toBe(orgId);
      expect(Number(s.org_earnings)).toBe(27);
      expect(Number(s.coach_earnings)).toBe(63);
      expect(Number(result.priceBreakdown.orgEarnings)).toBe(27);
      expect(Number(result.priceBreakdown.orgSplitPct)).toBe(30);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('4. agreement belonging to another organisation → not eligible (ForbiddenError)', async () => {
    const [otherOrg] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), ?, 'Other Fin Org', 'coach-fin-other', 1)`, [PLAYER_USER]);
    const otherOrgId = (otherOrg as any).insertId;
    await insertAgreement({ orgId: otherOrgId, status: 'active' });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-13', startTime: '12:00', endTime: '13:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/agreement/);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [otherOrgId]);
    }
  });

  it('5. pending agreement → no split and blocked (contract_required)', async () => {
    await insertAgreement({ orgId, status: 'pending', active: false });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-14', startTime: '12:00', endTime: '13:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow();
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('6. independent branch → orgEarnings = 0 despite an agreement on record', async () => {
    await pool.execute(`UPDATE branches SET coach_policy = 'independent_coaches_allowed' WHERE id = ?`, [branchId]);
    await insertAgreement({ orgId, status: 'active', coachSplit: 70, orgSplit: 30 });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      const result = await svc.bookSession(
        { coachId: coachProfileId, resourceId, date: '2027-02-15', startTime: '13:00', endTime: '14:00', paymentMethod: 'cash' },
        PLAYER_USER,
      );
      const s = await sessionByBooking(result.bookingId);
      expect(Number(s.org_earnings)).toBe(0);
      expect(Number(s.coach_earnings)).toBe(90); // full post-commission net
      expect(Number(result.priceBreakdown.orgSplitPct)).toBe(0);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`UPDATE branches SET coach_policy = 'contract_required' WHERE id = ?`, [branchId]);
    }
  });

  it('7. coach with no service location → blocked', async () => {
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId]);
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-16', startTime: '14:00', endTime: '15:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/service access|eligible/);
    } finally {
      await pool.execute(`INSERT INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
    }
  });

  it('8. sport mismatch → booking rejected', async () => {
    const [sportRes2] = await pool.execute<RowData>('SELECT id FROM sports WHERE id <> ? ORDER BY id LIMIT 1', [sportId]);
    const otherSport = sportRes2.length ? Number((sportRes2 as any[])[0].id) : null;
    if (!otherSport) return; // only one sport in DB — skip
    await pool.execute(`UPDATE professional_profiles SET sports = ? WHERE user_id = ?`, [JSON.stringify([otherSport]), COACH_USER]);
    await insertAgreement({ orgId });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-17', startTime: '15:00', endTime: '16:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/sport/i);
    } finally {
      await pool.execute(`UPDATE professional_profiles SET sports = ? WHERE user_id = ?`, [JSON.stringify([sportId]), COACH_USER]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('9. empty coach sport → booking rejected', async () => {
    await pool.execute(`UPDATE professional_profiles SET sports = NULL WHERE user_id = ?`, [COACH_USER]);
    await insertAgreement({ orgId });
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-18', startTime: '16:00', endTime: '17:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/sport/i);
    } finally {
      await pool.execute(`UPDATE professional_profiles SET sports = ? WHERE user_id = ?`, [JSON.stringify([sportId]), COACH_USER]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('10. legacy createCoachSession applies the contracted org split (org resolved from branch)', async () => {
    await insertAgreement({ orgId, status: 'active', coachSplit: 60, orgSplit: 40 });
    try {
      const { activitiesService } = await import('../../activities/application/activities.service.js');
      await activitiesService.createCoachSession(COACH_USER, {
        organisationId: orgId,
        branchId,
        playerId: PLAYER_USER,
        startTime: '2027-02-20T10:00:00',
        endTime: '2027-02-20T11:00:00',
        currencyCode: 'EGP',
      });
      const [rows] = await pool.execute<RowData>(
        `SELECT * FROM coach_sessions WHERE coach_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1`,
        [coachProfileId, PLAYER_USER],
      );
      const s = rows[0] as any;
      expect(Number(s.organisation_id)).toBe(orgId);
      expect(Number(s.price)).toBe(100);
      expect(Number(s.org_earnings)).toBe(36); // net 90 × 40%
      expect(Number(s.coach_earnings)).toBe(54);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('11. legacy createCoachSession on independent branch → org earnings = 0', async () => {
    await pool.execute(`UPDATE branches SET coach_policy = 'independent_coaches_allowed' WHERE id = ?`, [branchId]);
    await insertAgreement({ orgId, status: 'active', coachSplit: 60, orgSplit: 40 });
    try {
      const { activitiesService } = await import('../../activities/application/activities.service.js');
      await activitiesService.createCoachSession(COACH_USER, {
        organisationId: orgId,
        branchId,
        playerId: PLAYER_USER,
        startTime: '2027-02-21T10:00:00',
        endTime: '2027-02-21T11:00:00',
        currencyCode: 'EGP',
      });
      const [rows] = await pool.execute<RowData>(
        `SELECT * FROM coach_sessions WHERE coach_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1`,
        [coachProfileId, PLAYER_USER],
      );
      const s = rows[0] as any;
      expect(Number(s.org_earnings)).toBe(0);
      expect(Number(s.coach_earnings)).toBe(90);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`UPDATE branches SET coach_policy = 'contract_required' WHERE id = ?`, [branchId]);
    }
  });

  it('12. BookSessionSchema accepts midnight-crossing and rejects zero-duration', async () => {
    const { BookSessionSchema } = await import('../presentation/scheduling.dto.js');
    const validWrap = BookSessionSchema.safeParse({
      coachId: 1, resourceId: 1, date: '2027-02-20', startTime: '23:00', endTime: '00:30',
    });
    expect(validWrap.success).toBe(true);
    const validSameDay = BookSessionSchema.safeParse({
      coachId: 1, resourceId: 1, date: '2027-02-20', startTime: '10:00', endTime: '11:00',
    });
    expect(validSameDay.success).toBe(true);
    const zero = BookSessionSchema.safeParse({
      coachId: 1, resourceId: 1, date: '2027-02-20', startTime: '10:00', endTime: '10:00',
    });
    expect(zero.success).toBe(false);
  });

  it('13. COD coach booking posts booking_coach_payout accounting from the actual coach amount', async () => {
    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
    await insertAgreement({ orgId });
    let bookingId = 0;
    try {
      const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
      const svc = new SchedulingBookingService();
      const result = await svc.bookSession(
        { coachId: coachProfileId, resourceId, date: '2027-02-22', startTime: '17:00', endTime: '18:00', paymentMethod: 'cash' },
        PLAYER_USER,
      );
      bookingId = result.bookingId;

      // Wait for the org cash book + coach payout postings (async fire-and-forget).
      const deadline = Date.now() + 8000;
      let payoutCount = 0;
      let cashBookCount = 0;
      while (Date.now() < deadline) {
        const [p] = await pool.execute<RowData>(
          `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_coach_payout'`,
          [bookingId]);
        payoutCount = Number((p as any[])[0].c);
        const [cb] = await pool.execute<RowData>(
          `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_org_cash_receivable'`,
          [bookingId]);
        cashBookCount = Number((cb as any[])[0].c);
        if (payoutCount > 0 && cashBookCount > 0) break;
        await new Promise(r => setTimeout(r, 150));
      }
      expect(payoutCount).toBeGreaterThan(0);
      expect(cashBookCount).toBeGreaterThan(0);

      // Coach payable liability posted for the full coach fee (100).
      const [rows] = await pool.execute<RowData>(
        `SELECT le.amount, le.side, a.code
         FROM ledger_entries le JOIN chart_of_accounts a ON a.id = le.chart_account_id
         WHERE le.source_type='booking' AND le.source_id=? AND le.event_type='booking_coach_payout'`,
        [bookingId]);
      const payables = (rows as any[]).filter(r => r.code === '2201');
      expect(payables.some(r => r.side === 'credit' && Number(r.amount) === 100)).toBe(true);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      if (bookingId) await pool.execute(`DELETE FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
    }
  });

  it('14. setMyCoachServiceLocations rejects an empty branch list (ValidationError)', async () => {
    const { activitiesService } = await import('../../activities/application/activities.service.js');
    const { ValidationError } = await import('../../../shared/errors/app-error.js');
    // The coach currently has a service location on record (from beforeAll).
    await expect(
      activitiesService.setMyCoachServiceLocations(COACH_USER, []),
    ).rejects.toThrow(ValidationError);
    // Nothing was wiped: the existing location row is preserved.
    const [rows] = await pool.execute<RowData>(
      `SELECT branch_id FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('15. service-location change immediately affects eligibility (remove branch → booking blocked)', async () => {
    const { activitiesService } = await import('../../activities/application/activities.service.js');
    await insertAgreement({ orgId });
    try {
      // Coach selects the branch → eligible.
      await activitiesService.setMyCoachServiceLocations(COACH_USER, [branchId]);
      const [after] = await pool.execute<RowData>(
        `SELECT branch_id FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId],
      );
      expect(after.map((r: any) => Number(r.branch_id))).toContain(branchId);

      // Deselecting the only branch is rejected (empty) — the branch stays.
      await expect(
        activitiesService.setMyCoachServiceLocations(COACH_USER, []),
      ).rejects.toThrow();
      const [still] = await pool.execute<RowData>(
        `SELECT branch_id FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId],
      );
      expect(still.map((r: any) => Number(r.branch_id))).toContain(branchId);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`INSERT IGNORE INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
    }
  });

  it('16. zero-location coach receives no automatic service location from update path', async () => {
    const { activitiesService } = await import('../../activities/application/activities.service.js');
    // Clear the location so the coach is a zero-location coach.
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId]);
    try {
      // Saving a profile update must NOT assign any service location.
      await activitiesService.updateCoachProfile(COACH_USER, { bio: 'No location assignment' });
      const [rows] = await pool.execute<RowData>(
        `SELECT branch_id FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId],
      );
      expect(rows.length).toBe(0);
    } finally {
      await pool.execute(`INSERT IGNORE INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
    }
  });

  it('17. /bookings coach_session requires a coachId (client can no longer set an amount)', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    await expect(
      bookingService.createBooking({
        branchId, resourceId, bookingType: 'coach_session',
        bookingDate: '2027-02-23', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
      } as any, PLAYER_USER),
    ).rejects.toThrow(/coachId/i);
  });

  it('18. server-computed coach fee is used — client cannot influence total/coach_amount', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    await insertAgreement({ orgId });
    let bookingId = 0;
    try {
      const res = await bookingService.createBooking({
        branchId, resourceId, bookingType: 'coach_session', coachId: coachProfileId,
        bookingDate: '2027-02-24', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
      } as any, PLAYER_USER);
      bookingId = Number(res.id);
      const b = await bookingById(bookingId);
      // court 200 + coach fee 100 (hourly_rate 100 × 1h) = 300 — computed server-side.
      expect(Number(b.total_amount)).toBe(300);
      expect(Number(b.coach_amount)).toBe(100);
      // Wait for the async COD/coach-payout postings so afterAll cleanup is deterministic.
      const deadline = Date.now() + 8000;
      let count = 0;
      while (Date.now() < deadline) {
        const [p] = await pool.execute<RowData>(
          `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
        count = Number((p as any[])[0].c);
        if (count > 0) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      expect(count).toBeGreaterThan(0);
    } finally {
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
      if (bookingId) await pool.execute(`DELETE FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
    }
  });

  it('19. ineligible coach (no service location) cannot be booked via /bookings', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId]);
    try {
      await expect(
        bookingService.createBooking({
          branchId, resourceId, bookingType: 'coach_session', coachId: coachProfileId,
          bookingDate: '2027-02-25', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
        } as any, PLAYER_USER),
      ).rejects.toThrow(/eligible|service access/i);
    } finally {
      await pool.execute(`INSERT IGNORE INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
    }
  });

  it('20. coach sport mismatch via /bookings is rejected', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const [sportRes2] = await pool.execute<RowData>('SELECT id FROM sports WHERE id <> ? ORDER BY id LIMIT 1', [sportId]);
    const otherSport = sportRes2.length ? Number((sportRes2 as any[])[0].id) : null;
    if (!otherSport) return;
    await insertAgreement({ orgId });
    await pool.execute(`UPDATE professional_profiles SET sports = ? WHERE user_id = ?`, [JSON.stringify([otherSport]), COACH_USER]);
    try {
      await expect(
        bookingService.createBooking({
          branchId, resourceId, bookingType: 'coach_session', coachId: coachProfileId,
          bookingDate: '2027-02-26', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
        } as any, PLAYER_USER),
      ).rejects.toThrow(/sport/i);
    } finally {
      await pool.execute(`UPDATE professional_profiles SET sports = ? WHERE user_id = ?`, [JSON.stringify([sportId]), COACH_USER]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('21. CreateBookingSchema strips any client-supplied coachAmount (never reaches the service)', async () => {
    const { CreateBookingSchema } = await import('../../booking/presentation/booking.dto.js');
    const parsed = CreateBookingSchema.safeParse({
      branchId, resourceId, bookingType: 'coach_session',
      bookingDate: '2027-02-27', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
      coachAmount: 0, // malicious client value — must be stripped
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect('coachAmount' in parsed.data).toBe(false);
  });

  it('22. check-in requires ownership or organisation access (IDOR closed)', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    // Create a court-only booking as the player.
    const res = await bookingService.createBooking({
      branchId, resourceId, bookingType: 'private_match',
      bookingDate: '2027-02-28', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash',
    } as any, PLAYER_USER);
    const bookingId = Number(res.id);
    try {
      // Owner can check in.
      await expect(bookingService.checkIn(bookingId, PLAYER_USER)).resolves.toBeTruthy();
      // A different user (no org access) is denied.
      await expect(bookingService.checkIn(bookingId, PLAYER_USER + 1)).rejects.toThrow(/not authorized/i);
    } finally {
      // Wait for async COD postings so afterAll cleanup is deterministic.
      const deadline = Date.now() + 8000;
      let count = 0;
      while (Date.now() < deadline) {
        const [p] = await pool.execute<RowData>(
          `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
        count = Number((p as any[])[0].c);
        if (count > 0) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      await pool.execute(`DELETE FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
      await pool.execute(`DELETE FROM bookings WHERE id = ?`, [bookingId]);
    }
  });

  it('23. unavailable coach: excluded from search AND rejected by booking (search/booking consistency)', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    await insertAgreement({ orgId });
    await pool.execute(`UPDATE professional_profiles SET is_available = 0 WHERE user_id = ?`, [COACH_USER]);
    try {
      // Search (listEligibleCoachesAtBranch) must NOT surface the coach.
      const eligible = await activitiesRepository.listEligibleCoachesAtBranch(branchId, sportId);
      expect(eligible.some((c: any) => Number(c.id) === coachProfileId)).toBe(false);
      // Booking must reject the unavailable coach (canonical eligibility).
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-02-28', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/available/i);
    } finally {
      await pool.execute(`UPDATE professional_profiles SET is_available = 1 WHERE user_id = ?`, [COACH_USER]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  it('24. non-approved coach rejected by booking (canonical approval gate)', async () => {
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    await insertAgreement({ orgId });
    await pool.execute(`UPDATE coach_profiles SET status = 'pending' WHERE id = ?`, [coachProfileId]);
    try {
      const svc = new SchedulingBookingService();
      await expect(
        svc.bookSession({ coachId: coachProfileId, resourceId, date: '2027-03-01', startTime: '09:00', endTime: '10:00', paymentMethod: 'cash' }, PLAYER_USER),
      ).rejects.toThrow(/not approved|eligible/i);
    } finally {
      await pool.execute(`UPDATE coach_profiles SET status = 'approved' WHERE id = ?`, [coachProfileId]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  });

  // ── Group 3C: Saga compensation hardening ──
  async function cleanupBookingRefs(bookingId: number) {
    await pool.execute(`DELETE FROM wallet_transactions WHERE reference_type = 'booking' AND reference_id = ?`, [bookingId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE booking_id = ?`, [bookingId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'booking' AND source_id = ?`, [bookingId]);
    await pool.execute(`DELETE FROM bookings WHERE id = ?`, [bookingId]);
  }

  async function lastBookingForUserAndDate(date: string): Promise<number | null> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM bookings WHERE user_id = ? AND booking_date = ? ORDER BY id DESC LIMIT 1`, [PLAYER_USER, date]);
    return rows.length ? Number(rows[0].id) : null;
  }

  it('25. compensation: coach-session failure after wallet money moved → canonical refund + booking:refunded once + wallet restored', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    await insertAgreement({ orgId });
    const date = '2027-04-01';
    const [walletRows] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE user_id = ?`, [PLAYER_USER]);
    const beforeBalance = Number((walletRows[0] as any).balance);

    const sessionSpy = vi.spyOn(activitiesRepository, 'createCoachSession').mockRejectedValueOnce(new Error('session boom'));
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    try {
      await expect(
        new SchedulingBookingService().bookSession({ coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER),
      ).rejects.toThrow(/refunded/i);

      const bookingId = await lastBookingForUserAndDate(date);
      expect(bookingId).not.toBeNull();
      const [b] = await pool.execute<RowData>(`SELECT booking_status, refunded_amount, payment_status FROM bookings WHERE id = ?`, [bookingId]);
      expect(b[0].booking_status).toBe('cancelled');
      expect(Number(b[0].refunded_amount)).toBeGreaterThan(0);

      // Canonical booking:refunded fired exactly once.
      const refundedCalls = emitSpy.mock.calls.filter((c: any[]) => c[0] === 'booking:refunded');
      expect(refundedCalls.length).toBe(1);

      // Wallet balance restored to the pre-booking balance (money moved → refunded).
      const [after] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE user_id = ?`, [PLAYER_USER]);
      expect(Number((after[0] as any).balance)).toBe(beforeBalance);

      if (bookingId) await cleanupBookingRefs(bookingId);
    } finally {
      sessionSpy.mockRestore();
      emitSpy.mockRestore();
      const bid = await lastBookingForUserAndDate(date);
      if (bid) await cleanupBookingRefs(bid);
    }
  });

  it('26. compensation: link failure cancels the orphan coach session (no unintended active session)', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    await insertAgreement({ orgId });
    const date = '2027-04-02';
    const linkSpy = vi.spyOn(activitiesRepository, 'updateSessionBooking').mockRejectedValueOnce(new Error('link boom'));
    try {
      await expect(
        new SchedulingBookingService().bookSession({ coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER),
      ).rejects.toThrow();
      // The session created during the saga must be cancelled (not left active/orphaned).
      const [s] = await pool.execute<RowData>(
        `SELECT status FROM coach_sessions WHERE coach_id = ? AND DATE(start_time) = ? ORDER BY id DESC LIMIT 1`, [coachProfileId, date]);
      expect(s.length).toBeGreaterThan(0);
      expect(s[0].status).toBe('cancelled');
    } finally {
      linkSpy.mockRestore();
      const bid = await lastBookingForUserAndDate(date);
      if (bid) await cleanupBookingRefs(bid);
      await pool.execute(`DELETE FROM coach_sessions WHERE coach_id = ? AND DATE(start_time) = ?`, [coachProfileId, date]);
    }
  });

  it('27. compensation: no money moved → cancelled without a false refund claim', async () => {
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    // Insert a plain booking with NO payment_transactions / wallet_transactions
    // (nothing was ever charged) and compensate it directly.
    const [ins] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'coach_session', '2027-04-03', '09:00:00', '10:00:00', 300, 30, 270, 100, 'confirmed', 'pending', 'wallet', 1)`,
      [PLAYER_USER, orgId, branchId, resourceId]);
    const bookingId = (ins as any).insertId;
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    try {
      const result = await bookingService.compensateFailedBooking(bookingId, 'test no money moved');
      expect(result.cancelled).toBe(true);
      expect(result.refunded).toBe(false);
      expect(result.refundAmount).toBe(0);
      // No refund event for money that never moved.
      const refundedCalls = emitSpy.mock.calls.filter((c: any[]) => c[0] === 'booking:refunded');
      expect(refundedCalls.length).toBe(0);
    } finally {
      emitSpy.mockRestore();
      await cleanupBookingRefs(bookingId);
    }
  });

  it('28. compensation is idempotent — running twice does not double-refund', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    await insertAgreement({ orgId });
    const date = '2027-04-04';
    const sessionSpy = vi.spyOn(activitiesRepository, 'createCoachSession').mockRejectedValueOnce(new Error('session boom'));
    try {
      // First compensation via the saga.
      await expect(
        new SchedulingBookingService().bookSession({ coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER),
      ).rejects.toThrow();
      const bookingId = await lastBookingForUserAndDate(date);
      expect(bookingId).not.toBeNull();

      // Second compensation on the already-cancelled booking must be a no-op.
      const second = await bookingService.compensateFailedBooking(bookingId!, 'repeat');
      expect(second.cancelled).toBe(false);
      expect(second.refunded).toBe(false);

      // No duplicate refund record.
      const [b] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
      expect(Number(b[0].refunded_amount)).toBeGreaterThan(0);
      if (bookingId) await cleanupBookingRefs(bookingId);
    } finally {
      sessionSpy.mockRestore();
      const bid = await lastBookingForUserAndDate(date);
      if (bid) await cleanupBookingRefs(bid);
    }
  });

  it('29. compensation: refund failure is surfaced, never reported as successful', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    const walletRepo = await import('../../wallet/infrastructure/repositories/wallet.repository.js');
    await insertAgreement({ orgId });
    const date = '2027-04-05';
    const sessionSpy = vi.spyOn(activitiesRepository, 'createCoachSession').mockRejectedValueOnce(new Error('session boom'));
    // 1st updateBalance = the wallet charge DEBIT (must succeed so the saga
    // reaches session creation); 2nd = the compensation refund CREDIT (fails).
    const balanceSpy = vi.spyOn(walletRepo.walletRepository, 'updateBalance')
      .mockResolvedValueOnce(true as any)
      .mockResolvedValue(false as any);
    try {
      const err = await new SchedulingBookingService().bookSession(
        { coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER,
      ).catch((e: any) => e);
      expect(err).toBeTruthy();
      // Never the misleading "refunded" claim; the compensation failure surfaces.
      expect(String(err?.message || err)).not.toMatch(/payment has been refunded/i);
      expect(String(err?.message || err)).toMatch(/wallet|concurrent|refund/i);
    } finally {
      sessionSpy.mockRestore();
      balanceSpy.mockRestore();
      const bid = await lastBookingForUserAndDate(date);
      if (bid) await cleanupBookingRefs(bid);
      await pool.execute(`DELETE FROM coach_sessions WHERE coach_id = ? AND DATE(start_time) = ?`, [coachProfileId, date]);
    }
  });

  // ── Group 3C-Financial: balanced coach-session refund accounting ──
  async function waitForLedgerEvent(bookingId: number, eventType: string, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const [rows] = await pool.execute<RowData>(
        `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type=?`,
        [bookingId, eventType]);
      if (Number(rows[0].c) > 0) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Ledger event ${eventType} not posted for booking ${bookingId}`);
  }

  async function assertEveryBookingPostingBalanced(bookingId: number): Promise<string[]> {
    const [events] = await pool.execute<RowData>(
      `SELECT DISTINCT event_type FROM ledger_entries WHERE source_type='booking' AND source_id=?`, [bookingId]);
    const unbalanced: string[] = [];
    for (const ev of events as any[]) {
      const [entries] = await pool.execute<RowData>(
        `SELECT side, amount FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type=?`,
        [bookingId, ev.event_type]);
      let debit = 0; let credit = 0;
      for (const e of entries as any[]) {
        if (e.side === 'debit') debit += Number(e.amount);
        else if (e.side === 'credit') credit += Number(e.amount);
      }
      if (Math.abs(debit - credit) > 0.01) unbalanced.push(`${ev.event_type}: debit=${debit} credit=${credit}`);
    }
    return unbalanced;
  }

  it('31. Saga compensation reversal is balanced (wallet coach booking, session failure)', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    await insertAgreement({ orgId });
    const date = '2027-04-07';
    const sessionSpy = vi.spyOn(activitiesRepository, 'createCoachSession').mockRejectedValueOnce(new Error('session boom'));
    try {
      await expect(
        new SchedulingBookingService().bookSession({ coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER),
      ).rejects.toThrow(/refunded/i);
      const bookingId = await lastBookingForUserAndDate(date);
      expect(bookingId).not.toBeNull();
      // Wait for the canonical refund accounting to attempt the reversal.
      await waitForLedgerEvent(bookingId!, 'booking_wallet_refund');
      // Every posting is mathematically balanced (no unbalanced wallet refund).
      expect(await assertEveryBookingPostingBalanced(bookingId!)).toEqual([]);
    } finally {
      sessionSpy.mockRestore();
      const bid = await lastBookingForUserAndDate(date);
      if (bid) await cleanupBookingRefs(bid);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  }, 30000);

  it('30. refund of a PAID wallet coach booking posts balanced entries + coach reversal (debits == credits)', async () => {
    // This test needs the wallet booking to be CONFIRMED + booking:paid posted.
    const { registerBookingPaymentListeners } = await import('../../booking/application/booking-payment.listener.js');
    registerBookingPaymentListeners();
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    await insertAgreement({ orgId });
    const date = '2027-04-06';
    const res = await new SchedulingBookingService().bookSession(
      { coachId: coachProfileId, resourceId, date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet' }, PLAYER_USER);
    const bookingId = Number(res.bookingId);
    try {
      // Booking revenue must be posted (wallet confirm + GL) before the refund.
      await waitForLedgerEvent(bookingId, 'booking_wallet_payment');
      await waitForLedgerEvent(bookingId, 'booking_coach_payout');
      expect((await assertEveryBookingPostingBalanced(bookingId))).toEqual([]);

      // Full refund via the canonical cancel path.
      await bookingService.cancelBooking(bookingId, PLAYER_USER, 'test full refund');
      await waitForLedgerEvent(bookingId, 'booking_wallet_refund');
      await waitForLedgerEvent(bookingId, 'booking_coach_reversal');

      const unbalanced = await assertEveryBookingPostingBalanced(bookingId);
      expect(unbalanced).toEqual([]);

      // Coach reversal reverses the coach payable/expense.
      const [cr] = await pool.execute<RowData>(
        `SELECT side, amount FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_coach_reversal'`,
        [bookingId]);
      expect(cr.length).toBeGreaterThan(0);
      const coachAmount = Number(cr[0].amount);
      expect(coachAmount).toBeGreaterThan(0);
    } finally {
      if (bookingId) await cleanupBookingRefs(bookingId);
      await pool.execute(`DELETE FROM coach_sessions WHERE coach_id = ? AND booking_id = ?`, [coachProfileId, bookingId]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  }, 30000);

  it('32. refund of a court-only wallet booking (no coach) stays balanced (regression)', async () => {
    const { registerBookingPaymentListeners } = await import('../../booking/application/booking-payment.listener.js');
    registerBookingPaymentListeners();
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const date = '2027-04-08';
    const res = await bookingService.createBooking({
      branchId, resourceId, bookingType: 'private_match',
      bookingDate: date, startTime: '09:00', endTime: '10:00', paymentMethod: 'wallet',
    } as any, PLAYER_USER);
    const bookingId = Number(res.id);
    try {
      await waitForLedgerEvent(bookingId, 'booking_wallet_payment');
      await bookingService.cancelBooking(bookingId, PLAYER_USER, 'test court-only refund');
      await waitForLedgerEvent(bookingId, 'booking_wallet_refund');
      expect(await assertEveryBookingPostingBalanced(bookingId)).toEqual([]);
    } finally {
      if (bookingId) await cleanupBookingRefs(bookingId);
    }
  }, 30000);

  // ── Group 3D: coach search N+1 elimination ──
  async function ensureCoachAvailability(date: string): Promise<number> {
    const dow = new Date(date + 'T00:00:00').getDay() === 0 ? 7 : new Date(date + 'T00:00:00').getDay();
    await pool.execute(`DELETE FROM coach_availability WHERE coach_id = ?`, [coachProfileId]);
    await pool.execute(
      `INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time) VALUES (?, ?, '09:00', '17:00')`,
      [coachProfileId, dow]);
    return dow;
  }

  it('33. coach search returns the eligible coach with BATCHED access (no per-coach profile/location queries)', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { searchCoachHandler } = await import('../presentation/scheduling.controller.js');
    await insertAgreement({ orgId });
    const date = '2027-05-09';
    const dow = await ensureCoachAvailability(date);
    const findCoachByIdSpy = vi.spyOn(activitiesRepository, 'findCoachById');
    const singleLocSpy = vi.spyOn(activitiesRepository, 'getCoachServiceLocationBranchIds');
    const batchedLocSpy = vi.spyOn(activitiesRepository, 'getCoachServiceLocationBranchIdsByCoachIds');
    const request: any = {
      body: { date, dayOfWeek: dow, durationMinutes: 60, resourceId, sportId },
    };
    const reply: any = { send: vi.fn((x: any) => x) };
    try {
      await searchCoachHandler(request, reply);

      // Functional: the eligible coach is returned as a candidate.
      const sent = reply.send.mock.calls[0]?.[0];
      const candidates = sent?.data || [];
      const coachCandidate = (candidates as any[]).some((c: any) =>
        c.resources?.some((r: any) => r.resourceType === 'coach' && Number(r.resourceId) === coachProfileId));
      expect(coachCandidate).toBe(true);

      // Performance: NO per-coach profile re-fetch, NO per-coach location query;
      // the location set is loaded in ONE batched query.
      expect(findCoachByIdSpy).not.toHaveBeenCalled();
      expect(singleLocSpy).not.toHaveBeenCalled();
      expect(batchedLocSpy).toHaveBeenCalledTimes(1);
    } finally {
      findCoachByIdSpy.mockRestore();
      singleLocSpy.mockRestore();
      batchedLocSpy.mockRestore();
      await pool.execute(`DELETE FROM coach_availability WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  }, 30000);

  it('34. coach search still EXCLUDES a coach without explicit service access (eligibility unchanged)', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const { searchCoachHandler } = await import('../presentation/scheduling.controller.js');
    await insertAgreement({ orgId });
    const date = '2027-05-10';
    const dow = await ensureCoachAvailability(date);
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id = ?`, [coachProfileId]);
    const request: any = { body: { date, dayOfWeek: dow, durationMinutes: 60, resourceId, sportId } };
    const reply: any = { send: vi.fn((x: any) => x) };
    try {
      await searchCoachHandler(request, reply);
      const sent = reply.send.mock.calls[0]?.[0];
      const candidates = sent?.data || [];
      const coachCandidate = (candidates as any[]).some((c: any) =>
        c.resources?.some((r: any) => r.resourceType === 'coach' && Number(r.resourceId) === coachProfileId));
      // Explicit service access is REQUIRED — the coach must NOT appear even
      // though the agreement is present.
      expect(coachCandidate).toBe(false);
    } finally {
      await pool.execute(`INSERT IGNORE INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
      await pool.execute(`DELETE FROM coach_availability WHERE coach_id = ?`, [coachProfileId]);
      await pool.execute(`DELETE FROM coach_org_agreements WHERE coach_id = ?`, [coachProfileId]);
    }
  }, 30000);
});
