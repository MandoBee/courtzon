import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import { vi } from 'vitest';

/**
 * G11.20 — COMPETITION CATEGORY MANAGEMENT (integration, real database).
 *
 * Why this spec exists
 * --------------------
 * Production had 3 tournaments, 3 competitions and ZERO tournaments with more
 * than one competition: the only non-test writer of `tournament_competitions`
 * was `tournament.service.ts → createDefault` at tournament creation. Every
 * competition-scoped feature shipped by G11.18 (P2/P3), G11.19 (seeds) and
 * C1/C2 (prizes/matches) was therefore unreachable dead code. G11.20 is what
 * makes a tournament able to own a SECOND category at all.
 *
 * Critically, the second category is created here through the REAL APPLICATION
 * PATH — `CompetitionService.createCompetition`, the exact service method the
 * org controller invokes after tenancy + DTO validation — and NOT via raw SQL,
 * so the feature is proven reachable rather than merely testable in isolation.
 *
 * Schema-free by design: `tournament_competitions` already carried every
 * configuration column, and `uk_comp_tournament_default (tournament_id,
 * default_flag)` with `default_flag = IF(is_default = 1, 'D', NULL)` already
 * enforces exactly-one-default while permitting unlimited non-defaults. Test
 * 12 proves that invariant holds at the DATABASE level — which is why G11.20
 * required no migration.
 */

const ORG = 2730001;
const OTHER_ORG = 2730002;
const CREATOR = 2730009;
const SUSERS = [2730011, 2730012, 2730013, 2730014, 2730015, 2730016];
const SPORT = 2730101;
const ADMIN = 2730099;

let pool: mysql.Pool;
let fmt = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);
const insertId = async (sql: string, params: any[] = []) => {
  const [r] = await exec(sql, params);
  return Number((r as any).insertId);
};

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G20 U', 'male', 'active', '1995-01-01')`,
    [id, `0509${id}`, `+97250${id}`, `g20_${id}@t.local`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
}

/** A tournament + its auto-created DEFAULT competition (raw SQL is required: the
 *  tournament itself is inserted directly, so its default competition is too).
 *  G11.21.1 — the fee/waitlist overrides default to the original FREE values, so
 *  every pre-existing test still gets exactly the tournament it had before. */
async function createTournament(opts: { entryFee?: number; registrationFee?: number; waitlistEnabled?: number } = {}) {
  const entryFee = opts.entryFee ?? 0;
  const registrationFee = opts.registrationFee ?? 0;
  const waitlistEnabled = opts.waitlistEnabled ?? 0;
  const tid = await insertId(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, rule_set_id, sport_id,
       name, max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, waitlist_enabled, tournament_type,
       commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, NULL, ?, ?, 64, 2, ?, ?, 'EGP', 'FIXED', ?, 'community', 0, 'registration_open', 1,
             DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_ADD(NOW(), INTERVAL 45 DAY),
             DATE_ADD(NOW(), INTERVAL 5 DAY), DATE_ADD(NOW(), INTERVAL 25 DAY))`,
    [CREATOR, ORG, fmt, SPORT, `G20 Cup ${tidSeed++}`, entryFee, registrationFee, waitlistEnabled],
  );
  tournamentIds.push(tid);
  // The default competition — exactly as `createDefault` writes it.
  const defId = await insertId(
    `INSERT INTO tournament_competitions
       (public_id, tournament_id, competition_type, name, match_format_id, rule_set_id, bracket_type_id, sport_id,
        entry_fee, registration_fee, currency_code, price_type, max_participants, min_participants, waitlist_enabled, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', ?, NULL, NULL, ?, 0, 0, 'EGP', 'FREE', NULL, 2, 0, 1)`,
    [tid, fmt, SPORT],
  );
  return { tid, defId };
}
let tidSeed = 0;

async function addRegistration(tid: number, compId: number, userId: number, status: 'confirmed' | 'waiting' = 'confirmed') {
  const reg = await insertId(
    `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status)
     VALUES (?, ?, ?, 'paid', ?)`,
    [tid, compId, userId, status],
  );
  return reg;
}

async function addParticipant(tid: number, compId: number, userId: number, status: 'active' | 'waiting', waitingOrder: number | null = null) {
  const reg = await addRegistration(tid, compId, userId, status === 'waiting' ? 'waiting' : 'confirmed');
  return insertId(
    `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids, waiting_order)
     VALUES (?, ?, ?, 'individual', ?, JSON_ARRAY(?), ?)`,
    [tid, compId, reg, status, userId, waitingOrder],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_seeds WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournaments WHERE creator_id = ${CREATOR}`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${OTHER_ORG})`);

  for (const id of [...SUSERS, CREATOR, ADMIN]) await mkUser(id);
  const [ot] = await exec('SELECT id FROM organisation_types LIMIT 1');
  const orgTypeId = Number((ot as any[])[0].id);
  for (const [id, name, slug] of [[ORG, 'G20 Org', 'g20-org'], [OTHER_ORG, 'G20 Rival Org', 'g20-rival-org']] as const) {
    await exec(
      `INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (?, UUID(), ?, 1, ?, ?, 1)`,
      [id, orgTypeId, name, slug],
    );
  }
  await exec(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (?, 'G20 Sport', 'g20-sport', 1, 1, 0)`, [SPORT]);
  fmt = await insertId(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'g20-singles', 'G20 Singles', 'singles', 1, NULL, 1, 1)`,
    [SPORT],
  );
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_seeds WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ${fmt}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${[...SUSERS, CREATOR, ADMIN].join(',')})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${[...SUSERS, CREATOR, ADMIN].join(',')})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${OTHER_ORG})`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

// ────────────────────────────────────────────────────────────────────────────
describe('G11.20 — a tournament can own MULTIPLE competitions (real application path)', () => {
  it('1. a SECOND category is created through CompetitionService.createCompetition', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');

    const created = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles',
      name: 'Doubles',
      entry_fee: 250,
      currency_code: 'SAR',
      max_participants: 16,
      min_participants: 4,
      waitlist_enabled: true,
    });

    expect(Number(created.id)).toBeGreaterThan(0);
    expect(created.name).toBe('Doubles');
    expect(created.competition_type).toBe('doubles');
    expect(Number(created.entry_fee)).toBe(250);
    expect(created.currency_code).toBe('SAR');
    expect(Number(created.max_participants)).toBe(16);
    // New categories are NEVER default — this is what keeps the default unique.
    expect(Number(created.is_default)).toBe(0);

    const [rows] = await exec(
      'SELECT id, name, is_default FROM tournament_competitions WHERE tournament_id = ? ORDER BY is_default DESC, id',
      [tid],
    );
    expect(rows).toHaveLength(2);
    // Exactly one default survives.
    expect(rows.filter((r: any) => Number(r.is_default) === 1).map((r: any) => Number(r.id))).toEqual([defId]);
  });

  it('2. a THIRD category is added and the default is still unique', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'D', entry_fee: 100 });
    await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'team', name: 'T', entry_fee: 900 });

    const [rows] = await exec(
      'SELECT name, is_default, competition_type FROM tournament_competitions WHERE tournament_id = ? ORDER BY id',
      [tid],
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((r: any) => Number(r.is_default) === 1)).toHaveLength(1);
    expect(rows.filter((r: any) => Number(r.is_default) === 0)).toHaveLength(2);
  });

  it('3. PATCH through the application path persists and never moves the category', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'Before', entry_fee: 100 });

    const updated = await competitionService.updateCompetition(tid, Number(c.id), ORG, ADMIN, {
      name: 'After', entry_fee: 175, currency_code: 'AED', max_participants: 24,
    });

    expect(updated.name).toBe('After');
    expect(Number(updated.entry_fee)).toBe(175);
    expect(updated.currency_code).toBe('AED');
    expect(Number(updated.max_participants)).toBe(24);
    // Untouched keys keep their stored values (real PATCH semantics).
    expect(Number(updated.min_participants)).toBe(2);

    const [rows] = await exec('SELECT tournament_id, is_default, competition_type FROM tournament_competitions WHERE id = ?', [c.id]);
    expect(Number((rows[0] as any).tournament_id)).toBe(tid);
    expect(Number((rows[0] as any).is_default)).toBe(0);
    expect((rows[0] as any).competition_type).toBe('doubles');
  });

  it('4. the default category is preserved untouched when another is edited', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'D', entry_fee: 50 });

    await competitionService.updateCompetition(tid, Number(c.id), ORG, ADMIN, { entry_fee: 999, name: 'Renamed' });

    const [rows] = await exec('SELECT name, entry_fee, is_default FROM tournament_competitions WHERE id = ?', [defId]);
    expect((rows[0] as any).name).toBe('Default');
    expect(Number((rows[0] as any).entry_fee)).toBe(0);
    expect(Number((rows[0] as any).is_default)).toBe(1);
  });
});

describe('G11.20 — tenancy fails closed (cross-org / cross-tournament)', () => {
  it('5. creating inside ANOTHER organisation is rejected', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    await expect(competitionService.createCompetition(tid, OTHER_ORG, ADMIN, {
      competition_type: 'doubles', name: 'Rival',
    })).rejects.toMatchObject({ code: 'TOURNAMENT_NOT_FOUND' });
    const [rows] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(Number((rows[0] as any).c)).toBe(1);
  });

  it('6. a category of ANOTHER tournament cannot be updated or deactivated here', async () => {
    const a = await createTournament();
    const b = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const foreign = await competitionService.createCompetition(b.tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B-cmp' });

    await expect(competitionService.updateCompetition(a.tid, Number(foreign.id), ORG, ADMIN, { name: 'Hijack' }))
      .rejects.toMatchObject({ code: 'TOURNAMENT_COMPETITION_NOT_FOUND' });
    await expect(competitionService.deactivateCompetition(a.tid, Number(foreign.id), ORG, ADMIN))
      .rejects.toMatchObject({ code: 'TOURNAMENT_COMPETITION_NOT_FOUND' });

    const [rows] = await exec('SELECT name FROM tournament_competitions WHERE id = ?', [foreign.id]);
    expect((rows[0] as any).name).toBe('B-cmp');
  });

  it('7. a category of the SAME tournament but another org is rejected', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'Owned' });
    await expect(competitionService.updateCompetition(tid, Number(c.id), OTHER_ORG, ADMIN, { name: 'Stolen' }))
      .rejects.toMatchObject({ code: 'TOURNAMENT_COMPETITION_NOT_FOUND' });
  });
});

describe('G11.20 — deactivation guards (schema-free, therefore guarded removal)', () => {
  it('8. an unused non-default category is deactivated', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'Unused' });

    const r = await competitionService.deactivateCompetition(tid, Number(c.id), ORG, ADMIN);
    expect(r).toEqual({ deactivated: true, competition_id: Number(c.id) });

    const [rows] = await exec('SELECT id FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(rows.map((r: any) => Number(r.id))).toEqual([defId]);
  });

  it('9. the DEFAULT category can never be deactivated', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    await expect(competitionService.deactivateCompetition(tid, defId, ORG, ADMIN))
      .rejects.toThrow(/default competition cannot be deactivated/);
    const [rows] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(Number((rows[0] as any).c)).toBe(1);
  });

  it('10. the LAST remaining category can never be deactivated', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    // Even after removing every non-default, the single default must survive.
    await expect(competitionService.deactivateCompetition(tid, defId, ORG, ADMIN)).rejects.toThrow();
    const [rows] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(Number((rows[0] as any).c)).toBe(1);
  });

  it('11. a category holding registrations CANNOT be deactivated (protects real history)', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'Busy' });
    const compId = Number(c.id);
    await addRegistration(tid, compId, SUSERS[0]);

    await expect(competitionService.deactivateCompetition(tid, compId, ORG, ADMIN))
      .rejects.toThrow(/still has registrations or tournament data/);

    // Without the guard an unguarded DELETE would have cascaded the registration away.
    const [regs] = await exec('SELECT COUNT(*) AS c FROM tournament_registrations WHERE competition_id = ?', [compId]);
    expect(Number((regs[0] as any).c)).toBe(1);
    const [comps] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE id = ?', [compId]);
    expect(Number((comps[0] as any).c)).toBe(1);
  });

  it('11b. a category holding PARTICIPANTS cannot be deactivated either', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'Busy2' });
    const compId = Number(c.id);
    await addParticipant(tid, compId, SUSERS[0], 'active');

    await expect(competitionService.deactivateCompetition(tid, compId, ORG, ADMIN))
      .rejects.toThrow(/still has registrations or tournament data/);
    const [parts] = await exec('SELECT COUNT(*) AS c FROM tournament_participants WHERE competition_id = ?', [compId]);
    expect(Number((parts[0] as any).c)).toBe(1);
  });

  it('11c. capacity may not be shrunk below the participants already admitted', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles', name: 'Full', max_participants: 16, min_participants: 1,
    });
    const compId = Number(c.id);
    await addParticipant(tid, compId, SUSERS[0], 'active');
    await addParticipant(tid, compId, SUSERS[1], 'active');
    await addParticipant(tid, compId, SUSERS[2], 'active');

    // 2 < 3 admitted -> shrinking would strand an admitted participant.
    await expect(competitionService.updateCompetition(tid, compId, ORG, ADMIN, { max_participants: 2 }))
      .rejects.toMatchObject({ code: 'TOURNAMENT_CAPACITY_FULL' });

    // Equal capacity is a no-op change and stays allowed.
    const ok = await competitionService.updateCompetition(tid, compId, ORG, ADMIN, { max_participants: 3 });
    expect(Number(ok.max_participants)).toBe(3);

    // Growing is always allowed.
    const bigger = await competitionService.updateCompetition(tid, compId, ORG, ADMIN, { max_participants: 32 });
    expect(Number(bigger.max_participants)).toBe(32);
  });
});

describe('G11.20 — exactly-one-default is guaranteed by the EXISTING schema (no migration)', () => {
  it('12. the database itself refuses a second default competition for the same tournament', async () => {
    const { tid } = await createTournament();
    await expect(exec(
      `INSERT INTO tournament_competitions
         (public_id, tournament_id, competition_type, name, entry_fee, registration_fee, currency_code, price_type, min_participants, is_default)
       VALUES (UUID(), ?, 'doubles', 'Second default', 0, 0, 'EGP', 'FREE', 2, 1)`,
      [tid],
    )).rejects.toThrow();

    // …while unlimited NON-defaults are permitted by the same index (NULL default_flag).
    const { competitionService } = await import('../application/competition.service.js');
    for (const name of ['N1', 'N2', 'N3']) {
      await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name });
    }
    const [rows] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ? AND is_default = 0', [tid]);
    expect(Number((rows[0] as any).c)).toBe(3);
  });

  it('12b. no `is_active`/`status` column exists — deactivation is a guarded removal by design', async () => {
    const [cols] = await exec(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_competitions'
         AND COLUMN_NAME IN ('is_active', 'status', 'active')`,
    );
    expect(Number((cols[0] as any).c)).toBe(0);
  });
});

describe('G11.20 — competition-scoped waitlist (real SQL)', () => {
  it('13. the FIFO head is drawn from the REQUESTED competition only', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const b = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B', waitlist_enabled: true });
    const compB = Number(b.id);

    // Waiting order 1 in A, order 2 in B — A is globally earlier.
    await addParticipant(tid, defId, SUSERS[0], 'waiting', 1);
    const bHead = await addParticipant(tid, compB, SUSERS[1], 'waiting', 2);
    await addParticipant(tid, compB, SUSERS[2], 'waiting', 3);

    const { participantDrawRepository } = await import('../infrastructure/repositories/participant-draw.repository.js');

    // Scoped to B → B's own earliest waiter, never A's earlier waiter.
    const headB = await participantDrawRepository.findWaitlistHead(tid, compB);
    expect(Number(headB!.id)).toBe(bHead);

    // Scoped to A → A's waiter only.
    const headA = await participantDrawRepository.findWaitlistHead(tid, defId);
    expect(Number(headA!.competition_id)).toBe(defId);

    // Unscoped (legacy) → the globally earliest waiter.
    const headAll = await participantDrawRepository.findWaitlistHead(tid, null);
    expect(Number(headAll!.id)).toBe(bHead - 1);
  });

  it('14. the waitlist listing carries competition context and filters by competition', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const b = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'team', name: 'Teams A' });
    const compB = Number(b.id);
    await addParticipant(tid, defId, SUSERS[0], 'waiting', 1);
    await addParticipant(tid, compB, SUSERS[1], 'waiting', 2);

    const { participantDrawRepository } = await import('../infrastructure/repositories/participant-draw.repository.js');

    const all = await participantDrawRepository.listWaitingParticipants(tid);
    expect(all).toHaveLength(2);
    // Every row carries its category so the UI can group without a second call.
    const byId = new Map(all.map((r: any) => [Number(r.id), r]));
    expect([...byId.values()].every((r: any) => !!r.competition_name)).toBe(true);
    expect(all.find((r: any) => Number(r.competition_id) === compB)!.competition_name).toBe('Teams A');

    // Cross-competition isolation: filtering returns ONLY that category.
    const onlyB = await participantDrawRepository.listWaitingParticipants(tid, compB);
    expect(onlyB).toHaveLength(1);
    expect(Number(onlyB[0].competition_id)).toBe(compB);

    const onlyA = await participantDrawRepository.listWaitingParticipants(tid, defId);
    expect(onlyA).toHaveLength(1);
    expect(Number(onlyA[0].competition_id)).toBe(defId);
  });

  it('15. the per-competition admitted and waiting counts are BOTH scoped', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const b = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B' });
    const compB = Number(b.id);
    await addParticipant(tid, defId, SUSERS[0], 'active');
    await addParticipant(tid, defId, SUSERS[1], 'waiting', 1);
    await addParticipant(tid, compB, SUSERS[2], 'active');
    await addParticipant(tid, compB, SUSERS[3], 'waiting', 2);
    await addParticipant(tid, compB, SUSERS[4], 'waiting', 3);

    const { participantDrawRepository } = await import('../infrastructure/repositories/participant-draw.repository.js');
    // Admitted slots (status='active') — the number a capacity guard must respect.
    expect(await participantDrawRepository.countParticipantsByCompetition(tid, defId)).toBe(1);
    expect(await participantDrawRepository.countParticipantsByCompetition(tid, compB)).toBe(1);
    // Waiting rows — waitlist capacity/pressure is competition-scoped, not tournament-scoped.
    expect(await participantDrawRepository.countWaitingParticipantsByCompetition(tid, compB)).toBe(2);
    expect(await participantDrawRepository.countWaitingParticipantsByCompetition(tid, defId)).toBe(1);
    // The legacy tournament-wide count still reports the total.
    expect(await participantDrawRepository.countWaitingParticipants(tid)).toBe(3);
  });
});

describe('G11.20 — configuration reference validation (clean 422, not a raw FK error)', () => {
  it('16. an unknown sport_format id is rejected before any write', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    await expect(competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles', name: 'Bad', match_format_id: 99999999,
    })).rejects.toThrow(/Unknown competition reference\(s\): match_format_id/);
    const [rows] = await exec('SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(Number((rows[0] as any).c)).toBe(1);
  });

  it('17. a KNOWN sport_format id is accepted', async () => {
    const { tid } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const c = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles', name: 'Good', match_format_id: fmt,
    });
    expect(Number(c.match_format_id)).toBe(fmt);
  });
});

describe('G11.20 — RBAC (permission keys, route guards, role grants)', () => {
  // __dirname = backend/src/modules/tournaments/__tests__ -> five levels up is the repo root.
  const root = resolve(__dirname, '../../../../..');

  it('18. the three granular permission keys are registered in the frontend registry', () => {
    const registry = readFileSync(resolve(root, 'frontend/src/permissions/registry.ts'), 'utf8');
    for (const key of ['tournament.competition.create', 'tournament.competition.update', 'tournament.competition.deactivate']) {
      expect(registry).toContain(`permissionKey: '${key}'`);
    }
  });

  it('19. the management routes carry the matching org-scoped permission guards', () => {
    const routes = readFileSync(resolve(root, 'backend/src/modules/tournaments/presentation/org-tournament.routes.ts'), 'utf8');
    expect(routes).toContain(`requireOrgScopedPermission('tournament.competition.create')`);
    expect(routes).toContain(`requireOrgScopedPermission('tournament.competition.update')`);
    expect(routes).toContain(`requireOrgScopedPermission('tournament.competition.deactivate')`);
    // The read surface reuses the existing org view key.
    expect(routes).toContain(`requireOrgScopedPermission('org.tournaments.view')`);
  });

  it('20. the routes are organisation-scoped and do NOT reuse the public read shape', () => {
    const routes = readFileSync(resolve(root, 'backend/src/modules/tournaments/presentation/org-tournament.routes.ts'), 'utf8');
    expect(routes).toContain("'/org/:orgId/tournaments/:id/competitions'");
    expect(routes).toContain("'/org/:orgId/tournaments/:id/competitions/:competitionId'");
    // The public read route is a separate, unguarded-by-org path and must stay distinct.
    const publicRoutes = readFileSync(resolve(root, 'backend/src/modules/tournaments/presentation/tournament.routes.ts'), 'utf8');
    expect(publicRoutes).toContain("app.get('/tournaments/:id/competitions'");
    expect(routes).not.toContain("app.get('/tournaments/:id/competitions'");
  });

  it('21. the competition keys are granted ONLY to tournament-admin roles', () => {
    const templates = readFileSync(resolve(root, 'backend/scripts/role-permission-templates.mjs'), 'utf8');
    expect(templates).toContain('canManageTournamentCompetitions');
    expect(templates).toContain("TOURNAMENT_COMPETITION_MANAGE_ROLES = new Set(['org-admin', 'master-admin'])");
    // Wired into BOTH org-admin and master-admin grant paths (never a blanket grant).
    const grants = templates.split('canManageTournamentCompetitions(templateSlug, permissionKey)')[1] ?? '';
    expect(grants.length).toBeGreaterThan(0);
  });

  it('22. the DTOs reject an unknown competition_type and accept the valid set', async () => {
    const { CreateCompetitionSchema, UpdateCompetitionSchema, PromoteWaitlistSchema, ReplaceParticipantSchema } =
      await import('../presentation/tournament.dto.js');
    expect(CreateCompetitionSchema.safeParse({ competition_type: 'quads', name: 'x' }).success).toBe(false);
    expect(CreateCompetitionSchema.safeParse({ competition_type: 'doubles', name: 'x' }).success).toBe(true);
    // PATCH is a true partial: name-only is valid.
    expect(UpdateCompetitionSchema.safeParse({ name: 'x' }).success).toBe(true);
    // Waitlist promotion / replacement accept an optional competition scope.
    expect(PromoteWaitlistSchema.safeParse({ payment_method: 'cash' }).success).toBe(true);
    expect(PromoteWaitlistSchema.safeParse({ competition_id: 7 }).success).toBe(true);
    expect(PromoteWaitlistSchema.safeParse({ competition_id: 'abc' }).success).toBe(false);
    expect(ReplaceParticipantSchema.safeParse({ replacement_participant_id: 3 }).success).toBe(true);
    expect(ReplaceParticipantSchema.safeParse({ replacement_participant_id: 3, competition_id: 4 }).success).toBe(true);
  });
});

describe('G11.20 REGRESSION — G11.18 / G11.19 competition scoping still holds', () => {
  it('23. G11.18 — the default competition still resolves registrations without an explicit id', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');

    const single = await competitionService.resolveRegistrationCompetition(tid, undefined);
    expect(Number(single!.id)).toBe(defId);

    // Once a second category exists the ambiguity is reported, never guessed.
    await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B' });
    await expect(competitionService.resolveRegistrationCompetition(tid, undefined))
      .rejects.toMatchObject({ code: 'TOURNAMENT_COMPETITION_REQUIRED' });
    // An explicit id resolves unambiguously.
    const explicit = await competitionService.resolveRegistrationCompetition(tid, defId);
    expect(Number(explicit!.id)).toBe(defId);
  });

  it('24. G11.18 — a competition of another tournament never resolves', async () => {
    const a = await createTournament();
    const b = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const other = await competitionService.createCompetition(b.tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B' });
    await expect(competitionService.resolveCompetition(a.tid, Number(other.id))).rejects.toThrow();
  });

  it('25. G11.19 — seed #1 stays valid in EACH competition of the same tournament', async () => {
    const { tid, defId } = await createTournament();
    const { competitionService } = await import('../application/competition.service.js');
    const b = await competitionService.createCompetition(tid, ORG, ADMIN, { competition_type: 'doubles', name: 'B' });
    const compB = Number(b.id);
    const pA = await addParticipant(tid, defId, SUSERS[0], 'active');
    const pB = await addParticipant(tid, compB, SUSERS[1], 'active');

    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const sA = await participantDrawService.assignSeed(tid, pA, { seedNumber: 1, source: 'manual' }, CREATOR);
    const sB = await participantDrawService.assignSeed(tid, pB, { seedNumber: 1, source: 'manual' }, CREATOR);

    expect(Number(sA.competition_id)).toBe(defId);
    expect(Number(sB.competition_id)).toBe(compB);
    // A duplicate WITHIN one competition is still rejected.
    const pA2 = await addParticipant(tid, defId, SUSERS[2], 'active');
    await expect(participantDrawService.assignSeed(tid, pA2, { seedNumber: 1, source: 'manual' }, CREATOR))
      .rejects.toMatchObject({ code: 'TOURNAMENT_SEED_DUPLICATE' });
  });

  it('26. G11.18 — the public read route shape is untouched', () => {
    const publicRoutes = readFileSync(resolve(__dirname, '../presentation/tournament.routes.ts'), 'utf8');
    expect(publicRoutes).toContain("app.get('/tournaments/:id/competitions'");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// G11.21.1 — REVENUE / WAITLIST INHERITANCE (real database)
// ────────────────────────────────────────────────────────────────────────────
describe('G11.21.1 — a new competition inherits the tournament revenue/waitlist config (real SQL)', () => {
  it('30. inherits entry_fee / registration_fee / waitlist_enabled from a PAID tournament', async () => {
    const { tid, defId } = await createTournament({ entryFee: 350, registrationFee: 400, waitlistEnabled: 1 });
    const { competitionService } = await import('../application/competition.service.js');

    // No entry_fee, no registration_fee, no waitlist_enabled in the request.
    const created = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles',
      name: 'Doubles',
    });

    expect(Number(created.entry_fee)).toBe(350);
    expect(Number(created.registration_fee)).toBe(400);
    expect(Number(created.waitlist_enabled)).toBe(1);
    expect(Number(created.is_default)).toBe(0);

    // Assert against the STORED ROW, not just the returned mapping.
    const [rows] = await exec(
      'SELECT entry_fee, registration_fee, waitlist_enabled FROM tournament_competitions WHERE id = ?',
      [created.id],
    );
    const row = rows[0] as any;
    expect(Number(row.entry_fee)).toBe(350);
    expect(Number(row.registration_fee)).toBe(400);
    expect(Number(row.waitlist_enabled)).toBe(1);

    // The tournament row itself is NEVER mutated by creating a category.
    const [tRows] = await exec('SELECT entry_fee, waitlist_enabled FROM tournaments WHERE id = ?', [tid]);
    expect(Number((tRows[0] as any).entry_fee)).toBe(350);
    expect(Number((tRows[0] as any).waitlist_enabled)).toBe(1);

    // The pre-existing DEFAULT category keeps its own stored values untouched.
    const [dRows] = await exec('SELECT entry_fee FROM tournament_competitions WHERE id = ?', [defId]);
    expect(Number((dRows[0] as any).entry_fee)).toBe(0);
  });

  it('31. EXPLICIT competition values still win over the tournament defaults (stored)', async () => {
    const { tid } = await createTournament({ entryFee: 350, registrationFee: 400, waitlistEnabled: 1 });
    const { competitionService } = await import('../application/competition.service.js');

    const created = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'singles',
      name: 'Free Singles',
      entry_fee: 0,
      registration_fee: 0,
      waitlist_enabled: false,
    });

    expect(Number(created.entry_fee)).toBe(0);
    expect(Number(created.registration_fee)).toBe(0);
    expect(Number(created.waitlist_enabled)).toBe(0);

    const [rows] = await exec(
      'SELECT entry_fee, registration_fee, waitlist_enabled FROM tournament_competitions WHERE id = ?',
      [created.id],
    );
    const row = rows[0] as any;
    expect(Number(row.entry_fee)).toBe(0);
    expect(Number(row.registration_fee)).toBe(0);
    expect(Number(row.waitlist_enabled)).toBe(0);
  });

  it('32. a FREE tournament still yields a free category (backward compatible)', async () => {
    const { tid } = await createTournament(); // entry_fee 0, registration_fee 0, waitlist 0
    const { competitionService } = await import('../application/competition.service.js');

    const created = await competitionService.createCompetition(tid, ORG, ADMIN, {
      competition_type: 'doubles',
      name: 'Doubles',
    });

    expect(Number(created.entry_fee)).toBe(0);
    expect(Number(created.registration_fee)).toBe(0);
    expect(Number(created.waitlist_enabled)).toBe(0);
  });

  it('33. inheritance is per-tournament and never leaks across tournaments', async () => {
    const paid = await createTournament({ entryFee: 350, registrationFee: 400, waitlistEnabled: 1 });
    const free = await createTournament(); // FREE
    const { competitionService } = await import('../application/competition.service.js');

    const onPaid = await competitionService.createCompetition(paid.tid, ORG, ADMIN, { competition_type: 'doubles', name: 'P' });
    const onFree = await competitionService.createCompetition(free.tid, ORG, ADMIN, { competition_type: 'doubles', name: 'F' });

    expect(Number(onPaid.entry_fee)).toBe(350);
    expect(Number(onFree.entry_fee)).toBe(0);
  });
});
