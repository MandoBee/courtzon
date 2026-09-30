// ============================================================================
// Tournament create — UAT blocker regression + G11 Phase 3 (integration, real
// MySQL schema).
//
// Reproduces the Super Admin platform create that returned HTTP 500:
//   ER_BAD_NULL_ERROR: Column 'registration_fee' cannot be null
//
// Proves against a THROWAWAY Testcontainers MySQL (full baseline + seeds):
//   A. G11 Phase 3 — an org-less ("platform") create is REJECTED with
//      TOURNAMENT_ORGANISATION_REQUIRED; nothing is persisted. The CourtZon
//      PLATFORM never creates, owns, funds, or recognises a tournament.
//   B. Organisation create (registration_fee omitted) succeeds → organisation_id
//      is the authorized org, commission stays server-derived (a client-supplied
//      commission_rate can never override it).
//   C. A supplied registration_fee passes through unchanged.
//   D. Detail endpoint shape on the real schema: type is ALWAYS 'community'.
//   T1–T10 — G11 Phase 3 organisation-only invariants (below).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, type TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool, closePool } from '../../../database/mysql.js';

let ctx: TestContext;
let pool: any;
let creatorId: number;
let orgId: number;
let orgName: string;
const stamp = Date.now().toString().slice(-8);
const createdTournamentIds: number[] = [];

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const { getPool } = await import('../../../database/mysql.js');
  pool = getPool();

  // The canonical fresh baseline may skip Padel sport rows while the sports
  // table is empty during import — insert idempotently to be faithful to UAT.
  await pool.execute('INSERT IGNORE INTO sports (id, name, slug) VALUES (22, ?, ?)', ['Padel', 'padel']);

  const [u] = await pool.execute(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
    [randomUUID(), `5${stamp}`, `+9715${stamp}`, `tc_${stamp}@test.com`, `Tournament Creator ${stamp}`],
  );
  creatorId = (u as any).insertId;

  const [orgs] = await pool.execute<any[]>('SELECT id, name FROM organisations ORDER BY id LIMIT 1');
  if (!orgs.length) throw new Error('seed data missing: organisation');
  orgId = orgs[0].id;
  orgName = orgs[0].name;
}, 180000);

afterAll(async () => {
  try {
    if (createdTournamentIds.length) {
      await pool.query(`DELETE FROM tournaments WHERE id IN (${createdTournamentIds.map(() => '?').join(',')})`, createdTournamentIds);
    }
    if (creatorId) await pool.query('DELETE FROM users WHERE id = ?', [creatorId]);
  } finally {
    await closePool();
    await stopContainers();
  }
}, 30000);

// The raw CLIENT payload. G11 Phase 3 — the client never sends
// `organisation_id` or `tournament_type`: the org-scoped controller injects the
// owning organisation from `:orgId` and the service derives `community`.
function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    bracket_type_id: 1, // Single Elimination
    format: 'knockout',
    sport_id: 22, // Padel
    name: `UAT Padel ${stamp}`,
    max_participants: 16,
    min_participants: 2,
    entry_fee: 800,
    currency_code: 'AED',
    price_type: 'FIXED',
    start_date: '2026-10-01',
    end_date: '2026-10-05',
    // registration_fee intentionally omitted — the reported UAT path.
    ...overrides,
  };
}

describe('Tournament create — registration_fee NOT NULL contract (UAT blocker)', () => {
  it('A. G11 Phase 3 — an org-less (platform) create is REJECTED and nothing persists', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const beforeCount = await pool.query<any[]>('SELECT COUNT(*) AS c FROM tournaments');
    await expect(tournamentService.create(basePayload(), creatorId))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_ORGANISATION_REQUIRED, statusCode: 422 });
    const afterCount = await pool.query<any[]>('SELECT COUNT(*) AS c FROM tournaments');
    expect(afterCount[0][0].c).toBe(beforeCount[0][0].c);
  });

  it('B. organisation create succeeds; commission stays server-derived (client cannot override)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    // commission_rate: 99 is a client override attempt — the service must derive
    // it server-side (0 here because the seeded org has no subscription).
    const t = await tournamentService.create(
      basePayload({ organisation_id: orgId, commission_rate: 99 }),
      creatorId,
    );
    createdTournamentIds.push(t.id!);

    expect(t.id).toBeGreaterThan(0);
    const [rows] = await pool.query<any[]>('SELECT * FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].organisation_id).toBe(orgId);
    expect(rows[0].registration_fee).toBe('0.00');
    expect(rows[0].commission_rate).not.toBe('99.00');
    expect(rows[0].commission_rate).toBe('0.00');
    // G11 Phase 3 — a created org tournament can never carry a platform type.
    expect(rows[0].tournament_type).toBe('community');
  });

  it('C. a supplied registration_fee passes through unchanged', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const t = await tournamentService.create(basePayload({ organisation_id: orgId, registration_fee: 25 }), creatorId);
    createdTournamentIds.push(t.id!);

    const [rows] = await pool.query<any[]>('SELECT registration_fee FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].registration_fee).toBe('25.00');
  });

  it('D. detail endpoint shape: enriched management detail (sport_name/max_players/type) on the real schema', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const t = await tournamentService.create(basePayload({ organisation_id: orgId }), creatorId);
    createdTournamentIds.push(t.id!);

    const detail = await tournamentService.getByIdDetailed(t.id!);
    expect(detail.id).toBe(t.id);
    expect(detail.sport_name).toBe('Padel');
    expect(detail.max_players).toBe(16);
    expect(detail.max_participants).toBe(16);
    // G11 Phase 3 — the ONLY tournament_type that can exist is 'community'.
    expect(detail.type).toBe('community');
    expect(detail.organisation_name).toBe(orgName);
  });
});

describe('G11 Phase 3 — organisation-only tournament invariants (T1–T10, database contract)', () => {
  it('T1. the admin unsafe create route is GONE — POST /admin/tournaments is 404', async () => {
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { readFileSync } = await import('node:fs');
    const dir = dirname(fileURLToPath(import.meta.url));
    const routes = readFileSync(resolve(dir, '../presentation/tournament.routes.ts'), 'utf8');
    // The platform-wide CREATE route (`app.post('/admin/tournaments', ...)`, no
    // `:id`) that used to call createTournamentHandler is removed. All other
    // `/admin/tournaments/...` management routes are preserved.
    expect(routes).not.toMatch(/app\.post\(\s*['"`]\/admin\/tournaments['"`]/);
    expect(routes).not.toContain('createTournamentHandler');
  });

  it('T2. the legacy activities tournament create/PUT routes are GONE (D3) — no new org-less path', async () => {
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { readFileSync } = await import('node:fs');
    const dir = dirname(fileURLToPath(import.meta.url));
    const routes = readFileSync(resolve(dir, '../../../modules/activities/presentation/activities.routes.ts'), 'utf8');
    // Comments may still explain the removal, but NO tournament route is
    // registered on the legacy activities sub-app (D3): no app.{get,post,put,
    // delete} with a /tournaments or /tournament/:id path remains.
    expect(routes).not.toMatch(/app\.(get|post|put|delete|patch)\s*\(\s*['"`]\/tournaments?/);
    const repoRoot = resolve(dir, '../../../modules/activities/infrastructure/repositories/activities.repository.ts');
    const repo = readFileSync(repoRoot, 'utf8');
    // Comments may document the removal, but no method BODY may exist.
    expect(repo).not.toMatch(/(createTournament|updateTournament)\s*\([^)]*\)\s*\{/);
  });

  it('T3. the service rejects an org-less create with TOURNAMENT_ORGANISATION_REQUIRED (422)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    await expect(tournamentService.create(basePayload(), creatorId))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_ORGANISATION_REQUIRED, statusCode: 422 });
  });

  it('T4. tournament_type "platform" is UNSUPPLIABLE — the DTO and service both strip/force it', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    // A hostile payload that sneaks `tournament_type: 'platform'` into the
    // service is still normalised to the owning organisation's type.
    const t = await tournamentService.create(
      basePayload({ organisation_id: orgId, tournament_type: 'platform' }) as any,
      creatorId,
    );
    createdTournamentIds.push(t.id!);
    const [rows] = await pool.query<any[]>('SELECT tournament_type FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].tournament_type).toBe('community');
  });

  it('T4b. the create DTO rejects a client-supplied tournament_type outright', async () => {
    const { CreateTournamentSchema } = await import('../presentation/tournament.dto.js');
    const parsed = CreateTournamentSchema.safeParse({ ...basePayload({ organisation_id: orgId }), tournament_type: 'platform' });
    expect(parsed.success).toBe(true);
    // The schema strips the key entirely — the business rule is server-derived.
    expect((parsed as any).data).not.toHaveProperty('tournament_type');
    expect((parsed as any).data).not.toHaveProperty('organisation_id');
  });

  it('T5. every newly created tournament row is org-owned + community (no org-less rows can be created)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const before = await pool.query<any[]>('SELECT COUNT(*) AS c FROM tournaments WHERE organisation_id IS NULL');
    const t = await tournamentService.create(basePayload({ organisation_id: orgId }), creatorId);
    createdTournamentIds.push(t.id!);
    const [rows] = await pool.query<any[]>('SELECT organisation_id, tournament_type FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].organisation_id).toBe(orgId);
    expect(rows[0].tournament_type).toBe('community');
    const after = await pool.query<any[]>('SELECT COUNT(*) AS c FROM tournaments WHERE organisation_id IS NULL');
    expect(after[0][0].c).toBe(before[0][0].c);
  });

  it('T6. the platform accounting concepts are GONE from the concept registry (nothing can post against them)', async () => {
    const { EVENT_CONCEPTS } = await import('../../financial/application/accounting-concepts.js');
    expect(EVENT_CONCEPTS).not.toHaveProperty('tournament_platform_card_payment');
    expect(EVENT_CONCEPTS).not.toHaveProperty('tournament_prize_award');
    expect(EVENT_CONCEPTS).not.toHaveProperty('tournament_prize_refund');
  });

  it('T7. the DATABASE rejects tournament_type = "platform" (enum narrowed to community)', async () => {
    const { randomUUID } = await import('node:crypto');
    // First, the definitive schema contract: the column enum no longer contains
    // 'platform' at all.
    const [cols] = await pool.query<any[]>(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournaments' AND COLUMN_NAME = 'tournament_type'`,
    );
    expect(cols[0].COLUMN_TYPE).toBe("enum('community')");
    // Then raw SQL — even a fully valid row (public_id present, every NOT NULL
    // column filled) that declares a platform type is refused by the narrowed
    // enum. Defense in depth below every service/repo guard.
    await expect(pool.query(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, sport_id, name, max_participants, min_participants, entry_fee, currency_code, price_type, tournament_type, status, start_date, format)
       VALUES (?, ?, ?, 1, 22, 'ENUM PLATFORM ATTEMPT', 8, 2, 0, 'AED', 'FREE', 'platform', 'draft', '2026-10-01', 'knockout')`,
      [randomUUID(), creatorId, orgId],
    )).rejects.toThrow();
  });

  it('T8. the DATABASE rejects funding_source = "platform" (prize funding enum narrowed to organization)', async () => {
    // The definitive schema contract: `tournament_prize_awards.funding_source`
    // can only ever hold 'organization' — the CourtZon platform never funds a
    // prize, so a platform-funded row is structurally impossible.
    const [cols] = await pool.query<any[]>(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_prize_awards' AND COLUMN_NAME = 'funding_source'`,
    );
    expect(cols[0].COLUMN_TYPE).toBe("enum('organization')");
  });

  it('T10. frontend cannot render or submit the create form without an owning organisation (source contract)', async () => {
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { readFileSync } = await import('node:fs');
    const dir = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(resolve(dir, '../../../../../frontend/src/pages/tournaments/TournamentCreatePage.tsx'), 'utf8');
    // The submission endpoint is ALWAYS org-scoped; there is no /admin/tournaments
    // fallback in the submit flow (comments that explain the removal are fine, but
    // the endpoint computation can never target the platform route).
    expect(page).toMatch(/endpoint\s*=.*`\/org\/\$\{effectiveOrgId\}\/tournaments`/);
    expect(page).not.toMatch(/endpoint\s*=\s*[^;]*admin/);
    // Before an owning organisation is selected the submit is disabled and
    // onSubmit refuses to fire an API call.
    expect(page).toMatch(/!hasOwningOrg/);
    expect(page).toMatch(/disabled=\{!hasOwningOrg\}/);
  });
});