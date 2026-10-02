import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.17 — PLAYER team self-service (create / join / invite / accept / reject).
 *
 * NON-FINANCIAL verification against the real schema (isolated data):
 *   • team creation by a player (captain + initial teammate) — FREE tournament
 *     (no payment rows); the existing rule “team starts with ≥2 active members”
 *     is preserved;
 *   • invitations: captain-only, duplicate-safe, expiry, cross-tournament and
 *     wrong-invitee rejected, accept re-validates eligibility/capacity/uniqueness
 *     atomically (concurrent accept serialised by the row locks);
 *   • join flow; roster capacity; admin team creation still works;
 *   • G11.17 team workflow creates ZERO financial rows
 *     (wallet / ledger / entitlements / prize awards).
 */

const ORG = 2690001;
const CREATOR = 2690009;
const CAP1 = 2690021;   // team captain
const M2 = 2690022;     // initial teammate / invited player
const P3 = 2690023;     // invitee / joiner
const P4 = 2690024;     // reject + wrong-invitee target
const P5 = 2690025;     // expiry + capacity target
const SPORT = 2690101;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
let teamFormatId = 0;

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date, language_id)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.17 U', 'male', 'active', '1995-05-05', NULL)`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1117-${id}@test.com`],
  );
  await exec(`INSERT INTO player_profiles (user_id, main_sport_id) VALUES (?, ?)`, [id, SPORT]);
}

async function seedBase() {
  // Idempotent: clear any leftover fixture rows from a previous (possibly
  // interrupted) run before seeding, so re-runs are safe.
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${CAP1}, ${M2}, ${P3}, ${P4}, ${P5})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${CAP1}, ${M2}, ${P3}, ${P4}, ${P5})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`DELETE FROM sport_formats WHERE sport_id = ${SPORT}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (${ORG}, UUID(), ?, 1, 'G11.17 Org', 'g1117-org', 1)`, [otId]);
  await pool.execute(`INSERT INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G1117 Sport', 'g1117-sport', 1, 1, 0)`);
  const [fmt] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'g1117-team', 'Team', 'team', 4, 3, 1, 1)`, [SPORT]);
  teamFormatId = Number((fmt as any).insertId);
  for (const u of [CREATOR, CAP1, M2, P3, P4, P5]) await mkUser(u);
}

/** Team-format FREE tournament (status published → team flows allowed). */
async function createTeamTournament(): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, sport_id, name,
        max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type,
        tournament_type, commission_rate, status, is_public, start_date, end_date,
        registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'G11.17 Team Cup', 16, 8, 0, 0, 'EGP', 'FREE',
        'community', 0, 'published', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, teamFormatId, SPORT],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await exec(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'team', 'Default', 'EGP', 1)`, [tid]);
  return tid;
}

async function activeMembers(tid: number, pid: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    "SELECT COUNT(*) c FROM tournament_participant_members WHERE tournament_id=? AND participant_id=? AND status='active'", [tid, pid]);
  return Number((rows as any[])[0].c);
}

async function financialCounts(tid: number) {
  const [a] = await pool.execute<RowData>('SELECT COUNT(*) c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
  const [w] = await pool.execute<RowData>(
    `SELECT COUNT(*) c FROM wallet_transactions wt JOIN tournament_prize_awards a ON a.id = wt.reference_id WHERE a.tournament_id = ?`, [tid]);
  const [e] = await pool.execute<RowData>(
    `SELECT COUNT(*) c FROM financial_entitlements fe JOIN tournament_prize_awards a ON a.id = fe.source_id WHERE a.tournament_id = ?`, [tid]);
  const [l] = await pool.execute<RowData>(`SELECT COUNT(*) c FROM ledger_entries WHERE source_type='tournament' AND source_id IN (${tid})`);
  return { awards: Number((a as any[])[0].c), wallet: Number((w as any[])[0].c), entitlements: Number((e as any[])[0].c), ledger: Number((l as any[])[0].c) };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await pool.execute(`DELETE FROM tournament_team_invitations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ${teamFormatId}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${CAP1}, ${M2}, ${P3}, ${P4}, ${P5})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${CAP1}, ${M2}, ${P3}, ${P4}, ${P5})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.17 player team self-service', () => {
  it('T1. a player creates a team (captain + initial teammate); a lone player cannot', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    await expect(teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Solo' })).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Alpha', memberUserIds: [M2] });
    expect(team.participant_type).toBe('team');
    expect((team.member_user_ids as number[]).map(Number)).toEqual([CAP1, M2]);
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('T2+T3. captain invites an eligible player; duplicate invitation rejected', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Beta', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    expect(inv.status).toBe('pending');
    expect(inv.invitee_user_id).toBe(P3);
    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_DUPLICATE',
    });
    const mine = await teamInvitationService.listMyInvitations(P3);
    expect(mine.some((i: any) => Number(i.id) === Number(inv.id))).toBe(true);
  });

  it('T4. invited player accepts → becomes an active member; zero financial rows', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Gamma', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    const accepted = await teamInvitationService.acceptInvitation(tid, Number(inv.id), P3);
    expect(accepted.status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(3);
    const counts = await financialCounts(tid);
    expect(counts).toEqual({ awards: 0, wallet: 0, entitlements: 0, ledger: 0 });
  });

  it('T5+T6. reject works; an expired pending invitation cannot be accepted and turns expired', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Delta', memberUserIds: [M2] });
    // Reject
    const invReject = await teamInvitationService.invitePlayer(tid, Number(team.id), P4, CAP1);
    const rejected = await teamInvitationService.rejectInvitation(tid, Number(invReject.id), P4);
    expect(rejected.status).toBe('rejected');
    // Expiry — a PENDING invitation past its expiry cannot be accepted.
    const invExpire = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    await pool.execute(
      `UPDATE tournament_team_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?`, [Number(invExpire.id)]);
    await expect(teamInvitationService.acceptInvitation(tid, Number(invExpire.id), P5)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_EXPIRED',
    });
    const [st] = await pool.execute<RowData>('SELECT status FROM tournament_team_invitations WHERE id = ?', [Number(invExpire.id)]);
    expect((st as any[])[0].status).toBe('expired');
    const mine = await teamInvitationService.listMyInvitations(P5);
    const expInv = mine.find((i: any) => Number(i.id) === Number(invExpire.id));
    expect(expInv?.status).toBe('expired');
  });

  it('T7+T8+T12. authorization: non-captain invite rejected; wrong invitee cannot accept; cross-tournament rejected', async () => {
    const tid = await createTeamTournament();
    const tid2 = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Epsilon', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    // Non-captain (M2, a plain member) cannot invite.
    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), P4, M2)).rejects.toMatchObject({
      statusCode: 403,
    });
    // Wrong invitee (P4) cannot accept P3's invitation.
    await expect(teamInvitationService.acceptInvitation(tid, Number(inv.id), P4)).rejects.toMatchObject({
      statusCode: 403,
    });
    // Cross-tournament: using tournament A to accept an invitation of tournament B.
    const team2 = await teamInvitationService.createTeamForPlayer(tid2, CAP1, { name: 'Zeta', memberUserIds: [M2] });
    const inv2 = await teamInvitationService.invitePlayer(tid2, Number(team2.id), P3, CAP1);
    await expect(teamInvitationService.acceptInvitation(tid, Number(inv2.id), P3)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_NOT_FOUND',
    });
    // Tenant isolation: no invitee can see/act invitations of another team.
    const secondInv = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    await expect(teamInvitationService.acceptInvitation(tid, Number(secondInv.id), P3)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('T9+T10. join flow works; roster capacity enforced at accept', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    // roster_size = 3 → max 3 active members.
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Eta', memberUserIds: [M2] });
    await teamInvitationService.joinTeam(tid, Number(team.id), P3);      // CAP1+M2+P3 = 3 (full)
    expect(await activeMembers(tid, Number(team.id))).toBe(3);
    const inv4 = await teamInvitationService.invitePlayer(tid, Number(team.id), P4, CAP1);
    await expect(teamInvitationService.acceptInvitation(tid, Number(inv4.id), P4)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });
  });

  it('T11. concurrent accepts serialise safely (exactly one succeeds)', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Theta', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    const results = await Promise.allSettled([
      teamInvitationService.acceptInvitation(tid, Number(inv.id), P3),
      teamInvitationService.acceptInvitation(tid, Number(inv.id), P3),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
    const [st] = await pool.execute<RowData>('SELECT status FROM tournament_team_invitations WHERE id = ?', [Number(inv.id)]);
    expect((st as any[])[0].status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(3);
  });

  it('T13. admin team creation (existing management path) still works', async () => {
    const tid = await createTeamTournament();
    const { participantMemberService } = await import('../application/participant-member.service.js');
    const team = await participantMemberService.createTeamParticipant(tid, { name: 'Admin Team', memberUserIds: [M2, P3] }, CREATOR);
    expect(team.participant_type).toBe('team');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('T14. the whole team workflow creates ZERO financial rows', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Iota', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    await teamInvitationService.acceptInvitation(tid, Number(inv.id), P3);
    const counts = await financialCounts(tid);
    expect(counts).toEqual({ awards: 0, wallet: 0, entitlements: 0, ledger: 0 });
  });
});