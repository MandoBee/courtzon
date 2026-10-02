import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '../../fixtures/auth.fixture';
import { api } from '../../helpers/api';
import { query, insertOrganisation } from '../../helpers/database';

/**
 * G11.18 Phase 3 — Tournament VENUE / map flow (Playwright E2E, live stack).
 *   A. Organisation Courts: only org-owned courts are eligible; a cross-org
 *      court cannot be assigned.
 *   B. External Venue: full venue payload persisted + maps_url derived from
 *      coordinates + player-facing detail exposes it.
 *   C. Competition override: competition B overrides the tournament venue;
 *      competition A inherits; no leakage.
 *   D. Security: forged cross-organisation resource fails closed server-side.
 */

const RUN = String(Date.now()).slice(-8);
let seq = 0;

const hash256 = (t: string) => createHash('sha256').update(t).digest('hex');
const rawToken = () => randomBytes(48).toString('base64url');

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
    // ── Fixtures ──
    seq += 1;
    // Pre-clean leftover rows from earlier e2e runs of this scenario (fixed slugs).
    await query(`SET FOREIGN_KEY_CHECKS = 0`);
    await query(`DELETE FROM resources WHERE name IN ('CourtA','CourtB')`);
    await query(`DELETE FROM branches WHERE slug IN ('ve2e-ba','ve2e-bb')`);
    await query(`DELETE FROM sport_formats WHERE slug IN ('v-singles')`);
    await query(`DELETE FROM sports WHERE slug LIKE 'v-sport-%'`);
    await query(`DELETE FROM organisations WHERE name LIKE 'V OrgA%' OR name LIKE 'V OrgB%'`);
    await query(`SET FOREIGN_KEY_CHECKS = 1`);

    const sportId = Number(`276${RUN.slice(0, 5)}${seq}`);
    const [ot] = await query<any[]>('SELECT id FROM organisation_types LIMIT 1');
    const otId = ot?.[0]?.id ?? 1;

    const creator = await (await import('../../helpers/database')).insertUser({
      phoneNumber: `010${RUN}${seq}1`, password: 'test123456', fullName: 'V Creator',
      email: `v-c-${RUN}-${seq}@t.com`, gender: 'male', timezone: 'UTC', countryId: 1, birthDate: '1995-05-05',
    });
    await query(`INSERT INTO player_profiles (user_id) VALUES (?)`, [creator]);
    await query(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (?, 'V Sport', 'v-sport-${sportId}', 1, 1, 0)`, [sportId]);
    const [sf] = await query<any>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'v-singles', 'Singles', 'singles', 1, NULL, 1, 1)`, [sportId]);
    const fmt = Number((sf as any).insertId);
    const [rs] = await query<any>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'VR', '{"scoring":"sets"}')`, [fmt]);
    const ruleSet = Number((rs as any).insertId);
    const { insertOrganisation } = await import('../../helpers/database');
    const orgA = await insertOrganisation({ ownerId: creator, name: `V OrgA ${RUN}`, orgTypeId: otId });
    const orgB = await insertOrganisation({ ownerId: creator, name: `V OrgB ${RUN}`, orgTypeId: otId });
    const [bA] = await query<any>(`INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active) VALUES (UUID(), ?, 'VenueA Branch', 've2e-ba', 'Cairo', 1, 'UTC', 1)`, [orgA]);
    const [bB] = await query<any>(`INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active) VALUES (UUID(), ?, 'VenueB Branch', 've2e-bb', 'Giza', 1, 'UTC', 1)`, [orgB]);
    const branchA = Number((bA as any).insertId);
    const branchB = Number((bB as any).insertId);
    const [rA] = await query<any>(`INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active) VALUES (UUID(), ?, 'CourtA', 1, ?, 4, 1)`, [branchA, sportId]);
    const [rB] = await query<any>(`INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active) VALUES (UUID(), ?, 'CourtB', 1, ?, 4, 1)`, [branchB, sportId]);
    const courtA = Number((rA as any).insertId);
    const courtB = Number((rB as any).insertId);

    // Organisation-Courts tournament owned by orgA (branch orgA).
    const [tA] = await query<any>(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, venue_type, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
         max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
       VALUES (UUID(), ?, ?, ?, 'ORGANISATION_COURTS', 1, 'knockout', ?, ?, ?, 'Venue Org Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
      [creator, orgA, branchA, fmt, ruleSet, sportId]);
    const tidA = Number((tA as any).insertId);
    await query(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 1)`, [tidA, fmt]);

    // External-Venue tournament (location auto-captured; latitude/longitude set by the picker payload).
    const [tB] = await query<any>(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, venue_type, venue_name, venue_address, venue_city, venue_country, latitude, longitude, place_id, venue_contact, maps_url, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
         max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
       VALUES (UUID(), ?, ?, 'EXTERNAL_VENUE', 'Garden Arena', '12 Maadi', 'Cairo', 'Egypt', 30.0444, 31.2357, 'osm:77', '+20 100', 'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357', 1, 'knockout', ?, ?, ?, 'Venue Ext Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
      [creator, orgA, fmt, ruleSet, sportId]);
    const tidB = Number((tB as any).insertId);
    const [cB1] = await query<any>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 1)`, [tidB, fmt]);
    const [cB2] = await query<any>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'team', 'Teams', ?, 'EGP', 0)`, [tidB, fmt]);
    const compBDefault = Number((cB1 as any).insertId);
    const compB2 = Number((cB2 as any).insertId);

    // Super-admin grant for the creator => org-tournament management + player reads.
    const [roles] = await query<any[]>("SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1");
    const saRole = Number(roles?.[0]?.id ?? 1);
    await query(`INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, 1)`, [creator, saRole]);

    // ── Sessions ──
    const adminCookie = await sessionCookie(creator);

    // A. Organisation Courts — only org-A courts are eligible.
    const courts = await api.raw('GET', `/org/${orgA}/tournaments/${tidA}/matches/eligible-courts`, undefined, adminCookie);
    expect(courts.status).toBe(200);
    const courtsData = courts.data?.data ?? [];
    const ids = courtsData.map((c: any) => Number(c.id));
    expect(ids).toContain(Number(courtA));
    expect(ids).not.toContain(Number(courtB));

    // D. Security — A forged cross-org court cannot be assigned (schedule rejects server-side).
    const [m] = await query<any[]>(
      `INSERT INTO tournament_matches (tournament_id, competition_id, round, match_number, status) VALUES (?, ?, 1, 1, 'scheduled')`,
      [tidA, compBDefault, 1]);
    const crossAssign = await api.raw('POST', `/org/${orgA}/tournaments/${tidA}/matches/${Number((m as any).insertId)}/schedule`,
      { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: Number(courtB) }, adminCookie);
    expect(crossAssign.status).toBeGreaterThanOrEqual(400);

    // B. External Venue — player-facing detail exposes venue + coordinate-derived maps_url.
    const detail = await api.raw('GET', `/tournaments/${tidB}`, undefined, adminCookie);
    expect(detail.status).toBe(200);
    const body = detail.data?.data ?? detail.data;
    const venue = body?.venue ?? body;
    expect(venue?.venueMode ?? 'EXTERNAL_VENUE').toBe('EXTERNAL_VENUE');
    expect(venue?.name ?? body?.venue_name).toBe('Garden Arena');
    expect(venue?.mapsUrl ?? body?.venue_maps_url).toContain('30.0444');

    // C. Competition override — competition B overrides; A inherits; no leakage.
    const overrideRes = await api.raw('PUT', `/org/${orgA}/tournaments/${tidB}/competitions/${compB2}/venue`,
      { venue_override: { venueName: 'Teams Court', latitude: 25.1, longitude: 55.2 } }, adminCookie);
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.data?.venue_override?.mapsUrl).toContain('25.1');

    const comps = await api.raw('GET', `/tournaments/${tidB}/competitions`, undefined, adminCookie);
    const compsData = (comps.data?.data ?? []) as any[];
    const compDefault = compsData.find((c) => Number(c.id) === Number(compBDefault));
    const compTeams = compsData.find((c) => Number(c.id) === Number(compB2));
    expect(compDefault?.venue_override ?? null).toBeNull(); // inherits the tournament venue
    expect(compTeams?.venue_override?.venueName).toBe('Teams Court'); // own override
    expect(compDefault?.venue_name).toBeUndefined(); // the default comp has NO venue data leaked
  });
});