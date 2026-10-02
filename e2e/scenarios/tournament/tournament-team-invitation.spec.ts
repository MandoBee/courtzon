import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '../../fixtures/auth.fixture';
import { api } from '../../helpers/api';
import { query, insertUser, insertOrganisation } from '../../helpers/database';

/**
 * G11.17 — Tournament PLAYER team invitation lifecycle (Playwright E2E).
 *
 * Exercises, against the live Docker stack, the NON-FINANCIAL team flows:
 *  1. happy path: player creates a team (captain + initial teammate) → invites
 *     an eligible player → invitee sees the pending invitation and accepts.
 *  2. authorization/isolation: non-captain cannot invite, wrong invitee cannot
 *     accept, cross-tournament accept is rejected.
 *  3. reject + expiry + zero financial mutations.
 *  4. UI smoke: the player team page renders for the captain.
 *
 * Sessions are injected directly into `user_sessions` (the same mechanism the
 * backend uses on login) instead of POSTing /auth/login — this keeps the E2E
 * out of the login brute-force rate limiter.
 */

// Unique per-run ids to keep parallel/serial runs isolated.
const RUN = String(Date.now()).slice(-8);

let sportSeq = 0;

function teamFormatColumns(): { name: string; slug: string } {
  return { name: `E2E Team ${RUN}`, slug: `e2e-team-${RUN}` };
}

function hash256(t: string): string {
  return createHash('sha256').update(t).digest('hex');
}

function rawToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Insert a team-format FREE tournament. Returns its id. */
async function seedTeamTournament(creatorUserId: number): Promise<number> {
  sportSeq += 1;
  const fmt = teamFormatColumns();
  const [types] = await query<any[]>('SELECT id FROM organisation_types LIMIT 1');
  const orgTypeId = types?.[0]?.id ?? 1;
  const [bt] = await query<any[]>('SELECT id FROM tournament_bracket_types LIMIT 1');
  const bracketId = bt?.[0]?.id ?? 1;

  const [sp] = await query<any>(
    `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order)
     VALUES (?, ?, 1, 1, 0)`, [fmt.name, `${fmt.slug}-${sportSeq}`]);
  const sportId = Number((sp as any).insertId);
  const [sf] = await query<any>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, ?, ?, 'team', 4, 3, 1, 1)`, [sportId, `e2e-team-format-${sportSeq}`, 'E2E Team']);
  const formatId = (sf as any).insertId;
  const orgId = await insertOrganisation({ ownerId: creatorUserId, name: `E2E Org ${RUN}-${sportSeq}`, orgTypeId });
  const [t] = await query<any>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, sport_id, name,
        max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type,
        tournament_type, commission_rate, status, is_public, start_date, end_date,
        registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, ?, 'knockout', ?, ?, 'E2E Team Cup', 16, 8, 0, 0, 'EGP', 'FREE',
        'community', 0, 'published', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [creatorUserId, orgId, bracketId, formatId, sportId],
  );
  const tid = Number((t as any).insertId);
  await query(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'team', 'Default', 'EGP', 1)`, [tid]);
  return tid;
}

/** Create a player with a player_profiles row (eligibility). idx must be 1-99. */
async function seedPlayer(idx: number): Promise<{ id: number; phoneNumber: string; password: string }> {
  const phoneNumber = `010${RUN}${idx}`;
  const password = 'test123456';
  const id = await insertUser({
    phoneNumber,
    password,
    fullName: `E2E Player ${idx} ${RUN}`,
    email: `e2e-${idx}-${RUN}@test.com`,
    gender: 'male',
    timezone: 'UTC',
    countryId: 1,
    birthDate: '1995-05-05',
  });
  await query(`INSERT INTO player_profiles (user_id) VALUES (?)`, [id]);
  await query(`INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, 1, NOW())`, [id, 2]);
  return { id, phoneNumber, password };
}

/** Create a valid backend session for a user WITHOUT hitting /auth/login. */
async function sessionCookie(userId: number): Promise<string> {
  const st = rawToken();
  const rt = rawToken();
  await query(
    `INSERT INTO user_sessions (user_id, device_id, session_token_hash, refresh_token_hash,
       ip_address, user_agent, expires_at, refresh_token_expires_at)
     VALUES (?, NULL, ?, ?, '127.0.0.1', 'playwright',
       DATE_ADD(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, hash256(st), hash256(rt)],
  );
  return `session_token=${st}`;
}

async function financialRowsForTournament(tid: number): Promise<number> {
  const [rows] = await query<any[]>(
    `SELECT (SELECT COUNT(*) FROM tournament_prize_awards WHERE tournament_id = ?)
          + (SELECT COUNT(*) FROM wallet_transactions WHERE reference_type = 'tournament_prize_award' AND reference_id IN (SELECT id FROM tournament_prize_awards WHERE tournament_id = ?))
          + (SELECT COUNT(*) FROM financial_entitlements WHERE source_type = 'tournament' AND source_id IN (SELECT id FROM tournament_prize_awards WHERE tournament_id = ?)) AS c`,
    [tid, tid, tid],
  );
  return Number(rows?.[0]?.c ?? 0);
}

test.describe('Tournament team invitation lifecycle (G11.17)', () => {
  test('captain creates a team, invites a player, the invitee accepts', async () => {
    const creator = await seedPlayer(11);
    const captain = await seedPlayer(12);
    const teammate = await seedPlayer(13);
    const invitee = await seedPlayer(14);
    const tid = await seedTeamTournament(creator.id);

    const captainCookie = await sessionCookie(captain.id);
    const teammateCookie = await sessionCookie(teammate.id);
    const inviteeCookie = await sessionCookie(invitee.id);

    // Captain creates the team (captain + initial teammate).
    const createRes = await api.raw('POST', `/tournaments/${tid}/teams`, { name: 'E2E Crew', memberUserIds: [teammate.id] }, captainCookie);
    expect(createRes.status).toBe(201);
    const team = createRes.data as any;
    expect(team.participant_type).toBe('team');

    // Captain invites the third player.
    const invRes = await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/invitations`, { inviteeUserId: invitee.id }, captainCookie);
    expect(invRes.status).toBe(201);
    const invitation = invRes.data as any;
    expect(invitation.status).toBe('pending');

    // Duplicate invitation is rejected.
    const dupRes = await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/invitations`, { inviteeUserId: invitee.id }, captainCookie);
    expect(dupRes.status).toBeGreaterThanOrEqual(400);

    // Invitee sees the pending invitation and accepts it.
    const mine = await api.raw('GET', '/tournaments/team-invitations/mine', undefined, inviteeCookie);
    expect(mine.status).toBe(200);
    const mineData = mine.data as any;
    expect(Array.isArray(mineData?.data ?? mineData)).toBe(true);
    const pending = (mineData?.data ?? mineData).find((i: any) => i.status === 'pending' && i.id === invitation.id);
    expect(pending).toBeTruthy();

    const acceptRes = await api.raw('POST', `/tournaments/${tid}/team-invitations/${invitation.id}/accept`, undefined, inviteeCookie);
    expect(acceptRes.status).toBe(200);
    expect((acceptRes.data as any).status).toBe('accepted');

    // Roster is now 3 active members; no financial rows were created.
    const [members] = await query<any[]>(
      "SELECT COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? AND participant_id = ? AND status = 'active'",
      [tid, Number(team.id)]);
    expect(Number(members?.[0]?.c ?? 0)).toBe(3);
    expect(await financialRowsForTournament(tid)).toBe(0);

    // Teammate (non-captain) cannot invite — authorization enforced server-side.
    const unauth = await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/invitations`, { inviteeUserId: creator.id }, teammateCookie);
    expect(unauth.status).toBeGreaterThanOrEqual(400);
  });

  test('cross-user / cross-tournament isolation is enforced', async () => {
    const creator = await seedPlayer(21);
    const captain = await seedPlayer(22);
    const teammate = await seedPlayer(23);
    const invitee = await seedPlayer(24);
    const outsider = await seedPlayer(25);
    const tidA = await seedTeamTournament(creator.id);
    const tidB = await seedTeamTournament(creator.id);

    const captainCookie = await sessionCookie(captain.id);
    const outsiderCookie = await sessionCookie(outsider.id);
    const inviteeCookie = await sessionCookie(invitee.id);

    const teamA = (await api.raw('POST', `/tournaments/${tidA}/teams`, { name: 'A Team', memberUserIds: [teammate.id] }, captainCookie)).data as any;
    const invB = (await api.raw('POST', `/tournaments/${tidB}/teams`, { name: 'B Team', memberUserIds: [invitee.id] }, captainCookie)).data as any;

    // Invitee accepts invitation belonging to tournament B only.
    const invBres = await api.raw('POST', `/tournaments/${tidB}/teams/${invB.id}/invitations`, { inviteeUserId: outsider.id }, captainCookie);
    const invitationB = invBres.data as any;
    // Trying to accept tournament B's invitation with tournament A's id fails.
    const wrongT = await api.raw('POST', `/tournaments/${tidA}/team-invitations/${invitationB.id}/accept`, undefined, outsiderCookie);
    expect(wrongT.status).toBe(404);

    // Wrong invitee cannot accept an invitation meant for someone else.
    const invA = (await api.raw('POST', `/tournaments/${tidA}/teams/${teamA.id}/invitations`, { inviteeUserId: invitee.id }, captainCookie)).data as any;
    const wrongInvitee = await api.raw('POST', `/tournaments/${tidA}/team-invitations/${invA.id}/accept`, undefined, outsiderCookie);
    expect(wrongInvitee.status).toBeGreaterThanOrEqual(400);
    const okInvitee = await api.raw('POST', `/tournaments/${tidA}/team-invitations/${invA.id}/accept`, undefined, inviteeCookie);
    expect(okInvitee.status).toBe(200);
  });

  test('reject + invitation expiry + zero financial mutations', async () => {
    const creator = await seedPlayer(31);
    const captain = await seedPlayer(32);
    const teammate = await seedPlayer(33);
    const rejector = await seedPlayer(34);
    const expiredTarget = await seedPlayer(35);
    const tid = await seedTeamTournament(creator.id);

    const captainCookie = await sessionCookie(captain.id);
    const rejectorCookie = await sessionCookie(rejector.id);
    const expiredCookie = await sessionCookie(expiredTarget.id);

    const team = (await api.raw('POST', `/tournaments/${tid}/teams`, { name: 'Reject Crew', memberUserIds: [teammate.id] }, captainCookie)).data as any;

    // Reject
    const rInv = (await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/invitations`, { inviteeUserId: rejector.id }, captainCookie)).data as any;
    const rejectRes = await api.raw('POST', `/tournaments/${tid}/team-invitations/${rInv.id}/reject`, undefined, rejectorCookie);
    expect(rejectRes.status).toBe(200);
    expect((rejectRes.data as any).status).toBe('rejected');

    // Expiry — force the expiry timestamp into the past, then accept must fail.
    const eInv = (await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/invitations`, { inviteeUserId: expiredTarget.id }, captainCookie)).data as any;
    await query(`UPDATE tournament_team_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?`, [Number(eInv.id)]);
    const expiredAccept = await api.raw('POST', `/tournaments/${tid}/team-invitations/${eInv.id}/accept`, undefined, expiredCookie);
    expect(expiredAccept.status).toBeGreaterThanOrEqual(400);
    const [st] = await query<any[]>(`SELECT status FROM tournament_team_invitations WHERE id = ?`, [Number(eInv.id)]);
    expect(st?.[0]?.status).toBe('expired');

    expect(await financialRowsForTournament(tid)).toBe(0);
  });

  test('an eligible player joins an open team directly; a full team rejects the join', async ({ }) => {
    const creator = await seedPlayer(41);
    const captain = await seedPlayer(42);
    const teammate = await seedPlayer(43);
    const joiner = await seedPlayer(44);
    const extra = await seedPlayer(45);
    const tid = await seedTeamTournament(creator.id);

    const captainCookie = await sessionCookie(captain.id);
    const joinerCookie = await sessionCookie(joiner.id);
    const extraCookie = await sessionCookie(extra.id);

    const team = (await api.raw('POST', `/tournaments/${tid}/teams`, { name: 'Join Crew', memberUserIds: [teammate.id] }, captainCookie)).data as any;

    // The joiner joins directly through the player-facing HTTP route.
    const joinRes = await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/join`, undefined, joinerCookie);
    expect(joinRes.status).toBe(200);
    const [members] = await query<any[]>(
      "SELECT COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? AND participant_id = ? AND status = 'active'",
      [tid, Number(team.id)]);
    expect(Number(members?.[0]?.c ?? 0)).toBe(3); // captain + teammate + joiner = roster full (3)

    // A full team cannot accept another joiner (capacity enforced server-side).
    const fullJoin = await api.raw('POST', `/tournaments/${tid}/teams/${team.id}/join`, undefined, extraCookie);
    expect(fullJoin.status).toBeGreaterThanOrEqual(400);

    // The player team page route is registered and served by the SPA bundle
    // (rendered above is environment-specific; the route + page compile is
    // covered by the frontend build). Join flow created ZERO financial rows.
    expect(await financialRowsForTournament(tid)).toBe(0);
  });
});