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
 * Phase 3 — doubles TEAM INVITATION LIFECYCLE (non-financial, real schema).
 *
 * Verifies the increments layered on top of G11.17:
 *   • FORMING teams — a player creates a pair with the captain as the FIRST (and
 *     initially only) active member, then completes it via invitation;
 *   • invite a partner BY PHONE NUMBER (resolved to an eligible player);
 *   • explicit accept / reject (re-validated atomically);
 *   • CANCEL a pending invitation (captain-only; the transient row is removed);
 *   • safe RE-INVITATION after rejection or expiration (the row is re-opened;
 *     history is preserved, never duplicated);
 *   • authorization + tenant isolation + duplicate-membership protections;
 *   • notifications are emitted through the existing event bus;
 *   • existing admin pairing (participantMemberService, strict 2-member minimum)
 *     and the draw guard (an incomplete team cannot enter play) still hold;
 *   • ZERO financial rows anywhere in the lifecycle.
 */

const ORG = 2690002;
const CREATOR = 2690010;
const CAP1 = 2690031;   // captain of the forming team
const M2 = 2690032;     // initial teammate / non-captain
const P3 = 2690033;     // phone-invite target
const P4 = 2690034;     // reject + reinvite target
const P5 = 2690035;     // cancel + expiry target
const SPORT = 2690102;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
let teamFormatId = 0;
const captured: Array<Record<string, any>> = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date, language_id)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'Phase3 U', 'male', 'active', '1995-05-05', NULL)`,
    [id, `051${String(id).slice(-8)}`, `+250${String(id).slice(-8)}`, `phase3-${id}@test.com`],
  );
  await exec(`INSERT INTO player_profiles (user_id, main_sport_id) VALUES (?, ?)`, [id, SPORT]);
}

async function userPhone(id: number): Promise<{ full_phone: string; phone_number: string }> {
  const [rows] = await pool.execute<RowData>('SELECT full_phone, phone_number FROM users WHERE id = ?', [id]);
  return { full_phone: (rows as any[])[0].full_phone, phone_number: (rows as any[])[0].phone_number };
}

async function seedBase() {
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
     VALUES (${ORG}, UUID(), ?, 1, 'Phase3 Org', 'phase3-org', 1)`, [otId]);
  await pool.execute(`INSERT INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'P3 Sport', 'p3-sport', 1, 1, 0)`);
  const [fmt] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'p3-team', 'Team', 'team', 4, 3, 1, 1)`, [SPORT]);
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
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'Phase3 Team Cup', 16, 8, 0, 0, 'EGP', 'FREE',
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

async function invitationRow(id: number): Promise<any | null> {
  const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_team_invitations WHERE id = ?', [Number(id)]);
  return (rows as any[])[0] ?? null;
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

/**
 * The service emits domain events fire-and-forget (`void eventBusV2.emit(...)`) and
 * the bus persists the envelope BEFORE invoking its in-memory handlers, so the
 * handler runs just after the service call returns. Poll briefly for it.
 */
async function waitForEvent(pred: (e: Record<string, any>) => boolean, timeoutMs = 2500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (captured.some(pred)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return captured.some(pred);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2.on('tournament:team-invitation', (data: any) => { captured.push(data); });
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

beforeEach(() => { vi.clearAllMocks(); captured.length = 0; });

describe('Phase 3 — doubles team invitation lifecycle', () => {
  it('L1. a forming pair + PHONE invite + accept completes the roster and emits notifications', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');

    // Create the pair FORMING: the captain is the first (only) active member.
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Forming' });
    expect(team.participant_type).toBe('team');
    expect((team.member_user_ids as number[]).map(Number)).toEqual([CAP1]);
    expect(await activeMembers(tid, Number(team.id))).toBe(1);

    // Invite the partner BY PHONE (E.164 form as stored in full_phone).
    const phone = (await userPhone(P3)).full_phone;
    const inv = await teamInvitationService.invitePlayerByPhone(tid, Number(team.id), phone, CAP1);
    expect(inv.status).toBe('pending');
    expect(Number(inv.invitee_user_id)).toBe(P3);
    expect(await waitForEvent((e) => e.status === 'sent' && Number(e.inviteeUserId) === P3)).toBe(true);

    // Accept → the roster completes (2 active members) and the invitee sees nothing pending.
    const accepted = await teamInvitationService.acceptInvitation(tid, Number(inv.id), P3);
    expect(accepted.status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
    expect(await waitForEvent((e) => e.status === 'accepted' && Number(e.inviterUserId) === CAP1)).toBe(true);
    const mine = await teamInvitationService.listMyInvitations(P3);
    expect(mine.some((i: any) => Number(i.id) === Number(inv.id) && i.status === 'accepted')).toBe(true);

    expect(await financialCounts(tid)).toEqual({ awards: 0, wallet: 0, entitlements: 0, ledger: 0 });
  });

  it('L2. a phone number that does not resolve to an eligible player is rejected', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'UnknownPhone' });
    await expect(teamInvitationService.invitePlayerByPhone(tid, Number(team.id), '+999000111222', CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_INVITEE_NOT_FOUND',
    });
  });

  it('L3. the local phone_number form also resolves (invite without a country prefix)', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'LocalPhone' });
    const local = (await userPhone(P3)).phone_number;
    const inv = await teamInvitationService.invitePlayerByPhone(tid, Number(team.id), local, CAP1);
    expect(Number(inv.invitee_user_id)).toBe(P3);
  });

  it('L4. reject then RE-INVITE re-opens the same row (history preserved, no duplicate) and accept works', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Reinvite' });

    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P4, CAP1);
    const rejected = await teamInvitationService.rejectInvitation(tid, Number(inv.id), P4);
    expect(rejected.status).toBe('rejected');
    expect(await waitForEvent((e) => e.status === 'rejected' && Number(e.inviterUserId) === CAP1)).toBe(true);

    // Re-invite: the SAME row is re-opened to pending (UNIQUE(participant,invitee)).
    const reinvited = await teamInvitationService.invitePlayer(tid, Number(team.id), P4, CAP1);
    expect(Number(reinvited.id)).toBe(Number(inv.id));
    expect(reinvited.status).toBe('pending');
    const row = await invitationRow(Number(inv.id));
    expect(row.status).toBe('pending');
    expect(row.rejected_at).toBeNull();

    // Only ONE row exists for the pair.
    const [cnt] = await pool.execute<RowData>(
      'SELECT COUNT(*) c FROM tournament_team_invitations WHERE participant_id = ? AND invitee_user_id = ?',
      [Number(team.id), P4]);
    expect(Number((cnt as any[])[0].c)).toBe(1);

    const accepted = await teamInvitationService.acceptInvitation(tid, Number(inv.id), P4);
    expect(accepted.status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('L5. an EXPIRED invitation can be safely re-invited then accepted', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Expiry' });

    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    await pool.execute(`UPDATE tournament_team_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?`, [Number(inv.id)]);
    await expect(teamInvitationService.acceptInvitation(tid, Number(inv.id), P5)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_EXPIRED',
    });
    expect((await invitationRow(Number(inv.id))).status).toBe('expired');

    const reinvited = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    expect(Number(reinvited.id)).toBe(Number(inv.id));
    expect(reinvited.status).toBe('pending');
    const accepted = await teamInvitationService.acceptInvitation(tid, Number(inv.id), P5);
    expect(accepted.status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('L6. a PENDING invitation cannot be re-invited (duplicate guard)', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Duplicate' });
    await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_DUPLICATE',
    });
  });

  it('L7. cancelling a pending invitation removes it and frees the pair for a fresh invite', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Cancel' });

    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    const result = await teamInvitationService.cancelInvitation(tid, Number(inv.id), CAP1);
    expect(result).toEqual({ id: Number(inv.id), status: 'cancelled' });
    expect(await invitationRow(Number(inv.id))).toBeNull();
    expect(await waitForEvent((e) => e.status === 'cancelled' && Number(e.inviteeUserId) === P5)).toBe(true);
    const mine = await teamInvitationService.listMyInvitations(P5);
    expect(mine.some((i: any) => Number(i.id) === Number(inv.id))).toBe(false);

    // A fresh invite for the same pair succeeds (the row was removed).
    const fresh = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    expect(fresh.status).toBe('pending');
    expect(Number(fresh.id)).not.toBe(Number(inv.id));
  });

  it('L8. cancellation authorization: only the captain who sent it may cancel; non-pending cannot be cancelled', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'CancelAuthz', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);

    // A non-captain member cannot cancel.
    await expect(teamInvitationService.cancelInvitation(tid, Number(inv.id), M2)).rejects.toMatchObject({ statusCode: 403 });
    // The invitation still stands.
    expect((await invitationRow(Number(inv.id))).status).toBe('pending');

    // An accepted invitation can never be cancelled.
    await teamInvitationService.acceptInvitation(tid, Number(inv.id), P3);
    await expect(teamInvitationService.cancelInvitation(tid, Number(inv.id), CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_DUPLICATE',
    });
  });

  it('L9. authorization + isolation: non-captain cannot invite; cross-tournament cancel/accept fail', async () => {
    const tid = await createTeamTournament();
    const tid2 = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Isolation', memberUserIds: [M2] });
    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);

    // Non-captain (plain member) cannot invite.
    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), P4, M2)).rejects.toMatchObject({ statusCode: 403 });
    // Cross-tournament cancel is not found.
    await expect(teamInvitationService.cancelInvitation(tid2, Number(inv.id), CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_NOT_FOUND',
    });
    // Wrong invitee cannot accept.
    await expect(teamInvitationService.acceptInvitation(tid, Number(inv.id), P4)).rejects.toMatchObject({ statusCode: 403 });
    // Cross-tournament accept is not found.
    await expect(teamInvitationService.acceptInvitation(tid2, Number(inv.id), P3)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_NOT_FOUND',
    });
  });

  it('L10. duplicate-membership protection: an already-active member cannot be invited', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    // M2 is already an active member of this team.
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'DupMember', memberUserIds: [M2] });
    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), M2, CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_ACTIVE_DUPLICATE',
    });
  });

  it('L11. an incomplete (forming) team cannot enter the draw; a completed team can', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const { participantDrawService } = await import('../application/participant-draw.service.js');

    const forming = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Incomplete' });
    // A second, complete team gives the draw the minimum 2 participants.
    await teamInvitationService.createTeamForPlayer(tid, M2, { name: 'Complete', memberUserIds: [P4] });

    await expect(participantDrawService.generateDraw(tid, CREATOR, 31415)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });

    // Complete the forming team → the draw now succeeds.
    const phone = (await userPhone(P3)).full_phone;
    const inv = await teamInvitationService.invitePlayerByPhone(tid, Number(forming.id), phone, CAP1);
    await teamInvitationService.acceptInvitation(tid, Number(inv.id), P3);
    const draw = await participantDrawService.generateDraw(tid, CREATOR, 31415);
    expect(Number(draw.id)).toBeGreaterThan(0);
  });

  it('L12. existing admin pairng is preserved (strict 2-member minimum for the management path)', async () => {
    const tid = await createTeamTournament();
    const { participantMemberService } = await import('../application/participant-member.service.js');
    // Admin/management creation still requires at least 2 members.
    await expect(participantMemberService.createTeamParticipant(tid, { name: 'Bad', memberUserIds: [M2] }, CREATOR)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });
    const team = await participantMemberService.createTeamParticipant(tid, { name: 'Admin Team', memberUserIds: [M2, P4] }, CREATOR);
    expect(team.participant_type).toBe('team');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('L13. F2 — an OVERDUE pending invitation can be re-invited without any prior lazy-expiry read', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Overdue' });

    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    // Force the row OVERDUE while its status REMAINS 'pending' (no accept/reject
    // and no list read ever triggered lazy expiry).
    await exec(`UPDATE tournament_team_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?`, [Number(inv.id)]);
    expect((await invitationRow(Number(inv.id))).status).toBe('pending');

    // F2 regression: the re-invite must RE-OPEN THE SAME ROW instead of failing
    // as a duplicate, and must refresh the expiry.
    const reinvited = await teamInvitationService.invitePlayer(tid, Number(team.id), P5, CAP1);
    expect(Number(reinvited.id)).toBe(Number(inv.id));
    expect(reinvited.status).toBe('pending');
    const row = await invitationRow(Number(inv.id));
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());

    // The refreshed invitation is usable and completes the roster.
    const accepted = await teamInvitationService.acceptInvitation(tid, Number(inv.id), P5);
    expect(accepted.status).toBe('accepted');
    expect(await activeMembers(tid, Number(team.id))).toBe(2);
  });

  it('L14. F2 — a NON-overdue pending invitation is still rejected as a duplicate', async () => {
    const tid = await createTeamTournament();
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const team = await teamInvitationService.createTeamForPlayer(tid, CAP1, { name: 'Live' });

    const inv = await teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1);
    expect((await invitationRow(Number(inv.id))).status).toBe('pending');
    expect(new Date((await invitationRow(Number(inv.id))).expires_at).getTime()).toBeGreaterThan(Date.now());

    await expect(teamInvitationService.invitePlayer(tid, Number(team.id), P3, CAP1)).rejects.toMatchObject({
      code: 'TOURNAMENT_TEAM_INVITATION_DUPLICATE',
    });
  });
});
