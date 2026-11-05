import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '../../fixtures/auth.fixture';
import { api } from '../../helpers/api';
import { query, insertUser, insertOrganisation } from '../../helpers/database';

/**
 * G11.18 Phase 3 — Tournament VENUE / map flow (Playwright E2E, live stack).
 *   A. Organisation Courts: only org-owned courts are eligible; a cross-org
 *      court cannot be assigned.
 *   B. External Venue: full venue payload persisted + maps_url derived from
 *      coordinates + player-facing detail exposes it.
 *   C. Competition override: competition B overrides the tournament venue;
 *      competition A inherits; no leakage.
 *   D. Security: forged cross-organisation resource fails closed server-side.
 *
 * DATA SAFETY (P7-02) — this scenario is INSERT-only:
 *   - No `SET FOREIGN_KEY_CHECKS`, no DELETE/TRUNCATE, and no UPDATE of a
 *     pre-existing row. No pre-run cleanup of any kind.
 *   - Every UNIQUE key it touches is run-unique:
 *       sports.slug                       -> v-sport-<RUN>-<seq>
 *       sport_formats (sport_id, slug)    -> new sport + v-singles-<RUN>-<seq>
 *       sport_rule_sets (format_id, v1)   -> new format each run
 *       users.full_phone / users.email    -> random local number + run-tagged email
 *       organisations.slug                -> randomised by insertOrganisation()
 *     resources.name / branches.slug / organisations.name are NOT unique in the
 *     schema, so they never needed a purge in the first place.
 *   - Sports/formats/rule-sets use DB-assigned AUTO_INCREMENT ids (no explicit
 *     ids, no INSERT IGNORE), so a collision can never be silently masked.
 *   - Seeded reference rows (country, resource type, org type, bracket type,
 *     super_admin role) are resolved up-front and a missing row fails loudly
 *     BEFORE any fixture write — there is no silent `?? 1` fallback.
 *   - Fixtures are intentionally left behind in the local test DB (matrix §6.1:
 *     no per-test cleanup).
 */

// Per-run tag: timestamp tail + random hex, so serial and parallel runs never
// collide on the unique keys above.
const RUN = `${String(Date.now()).slice(-8)}${randomBytes(3).toString('hex')}`;
let seq = 0;

const hash256 = (value: string) => createHash('sha256').update(value).digest('hex');
const rawToken = () => randomBytes(48).toString('base64url');

/** Local Egyptian mobile number (11 digits): 010 + 8 random digits. */
const uniqueLocalPhone = () =>
  `010${String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(8, '0')}`;

/**
 * Resolve a required seeded reference row. A missing row must fail loudly here,
 * before any fixture write, instead of falling back to a guessed id.
 */
async function requireReferenceId(sql: string, label: string): Promise<number> {
  const [rows] = await query<any[]>(sql);
  const id = rows?.[0]?.id;
  if (id == null) {
    throw new Error(
      `B6 fixture precondition failed: required reference row is missing (${label}). ` +
        'Apply database/seeds/001_baseline.sql to the local test database first.',
    );
  }
  return Number(id);
}

async function sessionCookie(userId: number): Promise<string> {
  const st = rawToken();
  await query(
    `INSERT INTO user_sessions (user_id, device_id, session_token_hash, refresh_token_hash, ip_address, user_agent, expires_at, refresh_token_expires_at)
     VALUES (?, NULL, ?, ?, '127.0.0.1', 'playwright', DATE_ADD(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, hash256(st), hash256(rawToken())],
  );
  return `session_token=${st}`;
}

test.describe('Tournament venue / courts flow (G11.18 Phase 3)', () => {
  test('org courts, external venue, override, and cross-org security', async () => {
    // ── Preflight: resolve seeded reference rows BEFORE any write ──
    // (source: database/seeds/001_baseline.sql — countries:154, resource_types:448,
    //  organisation_types:274, tournament_bracket_types:578, roles:468)
    const countryId = await requireReferenceId(
      'SELECT id FROM countries WHERE id = 1 LIMIT 1',
      'countries.id = 1 (Egypt, phone_code +20)',
    );
    const resourceTypeId = await requireReferenceId(
      'SELECT id FROM resource_types WHERE id = 1 LIMIT 1',
      'resource_types.id = 1 (court/venue resource type; eligibility ignores the type)',
    );
    const orgTypeId = await requireReferenceId(
      "SELECT id FROM organisation_types WHERE slug = 'sports-club' LIMIT 1",
      "organisation_types.slug = 'sports-club'",
    );
    const bracketTypeId = await requireReferenceId(
      "SELECT id FROM tournament_bracket_types WHERE slug = 'single-elimination' LIMIT 1",
      "tournament_bracket_types.slug = 'single-elimination'",
    );
    const superAdminRoleId = await requireReferenceId(
      "SELECT id FROM roles WHERE slug IN ('super_admin','super-admin') ORDER BY id LIMIT 1",
      "roles.slug = 'super_admin' (required for org-scoped tournament routes)",
    );

    // ── Fixtures (new, run-unique rows only — nothing is deleted or reused) ──
    seq += 1;
    const tag = `${RUN}-${seq}`;

    const creator = await insertUser({
      phoneNumber: uniqueLocalPhone(),
      password: 'test123456',
      fullName: `V Creator ${tag}`,
      email: `v-c-${tag}@t.com`,
      gender: 'male',
      timezone: 'UTC',
      countryId,
      birthDate: '1995-05-05',
    });
    await query(`INSERT INTO player_profiles (user_id) VALUES (?)`, [creator]);

    // Brand-new sport / format / rule set per run: ids are DB-assigned and the
    // slugs carry the run tag, so `sports.slug` and `sport_formats(sport_id,slug)`
    // are satisfied without touching any existing row.
    const [sp] = await query<any>(
      `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order)
       VALUES (?, ?, 1, 1, 0)`,
      [`V Sport ${tag}`, `v-sport-${tag}`],
    );
    const sportId = Number((sp as any).insertId);
    const [sf] = await query<any>(
      `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
       VALUES (?, ?, 'Singles', 'singles', 1, NULL, 1, 1)`,
      [sportId, `v-singles-${tag}`],
    );
    const fmt = Number((sf as any).insertId);
    const [rs] = await query<any>(
      `INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, ?, '{"scoring":"sets"}')`,
      [fmt, `VR ${tag}`],
    );
    const ruleSet = Number((rs as any).insertId);

    const orgA = await insertOrganisation({ ownerId: creator, name: `V OrgA ${tag}`, orgTypeId });
    const orgB = await insertOrganisation({ ownerId: creator, name: `V OrgB ${tag}`, orgTypeId });
    const [bA] = await query<any>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active)
       VALUES (UUID(), ?, ?, ?, 'Cairo', ?, 'UTC', 1)`,
      [orgA, `VenueA Branch ${tag}`, `ve2e-ba-${tag}`, countryId],
    );
    const [bB] = await query<any>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active)
       VALUES (UUID(), ?, ?, ?, 'Giza', ?, 'UTC', 1)`,
      [orgB, `VenueB Branch ${tag}`, `ve2e-bb-${tag}`, countryId],
    );
    const branchA = Number((bA as any).insertId);
    const branchB = Number((bB as any).insertId);
    const [rA] = await query<any>(
      `INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active)
       VALUES (UUID(), ?, ?, ?, ?, 4, 1)`,
      [branchA, `CourtA-${tag}`, resourceTypeId, sportId],
    );
    const [rB] = await query<any>(
      `INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active)
       VALUES (UUID(), ?, ?, ?, ?, 4, 1)`,
      [branchB, `CourtB-${tag}`, resourceTypeId, sportId],
    );
    const courtA = Number((rA as any).insertId);
    const courtB = Number((rB as any).insertId);

    // Organisation-Courts tournament owned by orgA (branch orgA).
    const [tA] = await query<any>(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, venue_type, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
         max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
       VALUES (UUID(), ?, ?, ?, 'ORGANISATION_COURTS', ?, 'knockout', ?, ?, ?, 'Venue Org Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
      [creator, orgA, branchA, bracketTypeId, fmt, ruleSet, sportId],
    );
    const tidA = Number((tA as any).insertId);
    const [cA1] = await query<any>(
      `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 1)`,
      [tidA, fmt],
    );
    const compADefault = Number((cA1 as any).insertId);

    // External-Venue tournament (location auto-captured; latitude/longitude set by the picker payload).
    const [tB] = await query<any>(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, venue_type, venue_name, venue_address, venue_city, venue_country, latitude, longitude, place_id, venue_contact, maps_url, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
         max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
       VALUES (UUID(), ?, ?, 'EXTERNAL_VENUE', 'Garden Arena', '12 Maadi', 'Cairo', 'Egypt', 30.0444, 31.2357, 'osm:77', '+20 100', 'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357', ?, 'knockout', ?, ?, ?, 'Venue Ext Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
      [creator, orgA, bracketTypeId, fmt, ruleSet, sportId],
    );
    const tidB = Number((tB as any).insertId);
    const [cB1] = await query<any>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 1)`, [tidB, fmt]);
    const [cB2] = await query<any>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'team', 'Teams', ?, 'EGP', 0)`, [tidB, fmt]);
    const compBDefault = Number((cB1 as any).insertId);
    const compB2 = Number((cB2 as any).insertId);

    // Super-admin grant for the creator => org-tournament management + player reads.
    // Fresh user + explicitly resolved role => `uk_user_role (user_id, role_id)`
    // cannot collide, so a plain INSERT surfaces real failures instead of hiding
    // them. `assigned_by` is nullable; NULL is the honest value for a synthetic
    // test grant and removes the hidden dependency on seeded user id 1.
    await query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)`,
      [creator, superAdminRoleId],
    );

    // ── Sessions ──
    const adminCookie = await sessionCookie(creator);

    // A. Organisation Courts — only org-A courts are eligible.
    const courts = await api.raw('GET', `/org/${orgA}/tournaments/${tidA}/matches/eligible-courts`, undefined, adminCookie);
    expect(courts.status).toBe(200);
    const courtsData = (courts.data as any)?.data ?? [];
    const ids = courtsData.map((c: any) => Number(c.id));
    expect(ids).toContain(Number(courtA));
    expect(ids).not.toContain(Number(courtB));

    // D. Security — a forged cross-org court cannot be assigned (schedule rejects server-side).
    // `scheduleMatch` rejects a bye/placeholder slot BEFORE the court-eligibility
    // check, so the bracket slot must link a REAL shared match (`match_id` NOT
    // NULL); otherwise this assertion would pass for the wrong reason.
    // `matches` NOT NULL columns without defaults are `type` and `sport_id`;
    // every FK target below is a row created by this run.
    const [sharedMatch] = await query<any>(
      `INSERT INTO matches (type, status, sport_id, tournament_id, format_id, rule_set_id)
       VALUES ('public', 'open', ?, ?, ?, ?)`,
      [sportId, tidA, fmt, ruleSet],
    );
    const sharedMatchId = Number((sharedMatch as any).insertId);
    const [m] = await query<any>(
      `INSERT INTO tournament_matches (tournament_id, competition_id, match_id, round, match_number, status)
       VALUES (?, ?, ?, 1, 1, 'scheduled')`,
      [tidA, compADefault, sharedMatchId],
    );
    const tournamentMatchId = Number((m as any).insertId);
    const crossAssign = await api.raw('POST', `/org/${orgA}/tournaments/${tidA}/matches/${tournamentMatchId}/schedule`,
      { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: Number(courtB) }, adminCookie);
    expect(crossAssign.status).toBeGreaterThanOrEqual(400);
    // Prove the rejection is the tenant/court rule, not the bye/placeholder guard
    // (`app.ts` returns AppError.code as `code`).
    expect((crossAssign.data as any)?.code).toBe('TOURNAMENT_COURT_NOT_ELIGIBLE');

    // No partial side effect: the rejected call must leave the slot untouched
    // (a successful path would set resource/start/end and reserve the court
    // through the shared booking capability).
    const [afterSchedule] = await query<any[]>(
      'SELECT resource_id, start_time, end_time FROM tournament_matches WHERE id = ? LIMIT 1',
      [tournamentMatchId],
    );
    expect(afterSchedule?.[0]?.resource_id ?? null).toBeNull();
    expect(afterSchedule?.[0]?.start_time ?? null).toBeNull();
    expect(afterSchedule?.[0]?.end_time ?? null).toBeNull();

    // B. External Venue — player-facing detail exposes venue + coordinate-derived maps_url.
    const detail = await api.raw('GET', `/tournaments/${tidB}`, undefined, adminCookie);
    expect(detail.status).toBe(200);
    const body = (detail.data as any)?.data ?? detail.data;
    const venue = body?.venue ?? body;
    expect(venue?.venueMode ?? 'EXTERNAL_VENUE').toBe('EXTERNAL_VENUE');
    expect(venue?.name ?? body?.venue_name).toBe('Garden Arena');
    expect(venue?.mapsUrl ?? body?.venue_maps_url).toContain('30.0444');

    // C. Competition override — competition B overrides; A inherits; no leakage.
    const overrideRes = await api.raw('PUT', `/org/${orgA}/tournaments/${tidB}/competitions/${compB2}/venue`,
      { venue_override: { venueName: 'Teams Court', latitude: 25.1, longitude: 55.2 } }, adminCookie);
    expect(overrideRes.status).toBe(200);
    expect((overrideRes.data as any)?.venue_override?.mapsUrl).toContain('25.1');

    const comps = await api.raw('GET', `/tournaments/${tidB}/competitions`, undefined, adminCookie);
    const compsData = ((comps.data as any)?.data ?? []) as any[];
    const compDefault = compsData.find((c) => Number(c.id) === Number(compBDefault));
    const compTeams = compsData.find((c) => Number(c.id) === Number(compB2));
    expect(compDefault?.venue_override ?? null).toBeNull(); // inherits the tournament venue
    expect(compTeams?.venue_override?.venueName).toBe('Teams Court'); // own override
    expect(compDefault?.venue_name).toBeUndefined(); // the default comp has NO venue data leaked
  });
});
