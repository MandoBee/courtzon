import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type {
  FinalResult,
  MatchResultParticipant,
  MatchResultRecord,
  ParticipantSlot,
  RawMatchResultPayload,
  SportFormat,
  SportRuleSet,
} from '../domain/match-result.types.js';

type RowData = mysql.RowDataPacket[];

export interface MatchContext {
  matchId: number;
  sportId: number;
  status: string;
  branchId: number | null;
  resourceId: number | null;
  playedAt: string | null;
  timezone: string | null;
  participantUserIds: number[];
}

export interface ResultInsert {
  matchId: number;
  sportId: number;
  formatId: number;
  ruleSetId: number;
  rulesSnapshot: unknown;
  matchType: 'public';
  playedAt: string;
  branchId: number | null;
  resourceId: number | null;
  timezone: string | null;
  participantPayload: ParticipantSlot[];
  rawResult: RawMatchResultPayload;
  submissionStatus: MatchResultRecord['submissionStatus'];
  outcome: MatchResultRecord['outcome'];
  submittedBy?: number | null;
  submittedAt?: string | null;
  acceptedBy?: number | null;
  acceptedAt?: string | null;
  autoApproved?: boolean;
  disputedBy?: number | null;
  disputedAt?: string | null;
  disputeReason?: string | null;
  resolvedBy?: number | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  submissionDeadlineAt: string | null;
  autoApprovalDeadlineAt: string | null;
}

const ROW_MAPPER = (r: any): MatchResultRecord => ({
  id: r.id,
  matchId: r.match_id,
  sportId: r.sport_id,
  formatId: r.format_id,
  ruleSetId: r.rule_set_id,
  rulesSnapshot: typeof r.rules_snapshot === 'string' ? JSON.parse(r.rules_snapshot) : r.rules_snapshot,
  matchType: r.match_type,
  playedAt: r.played_at,
  branchId: r.branch_id,
  resourceId: r.resource_id,
  tournamentId: r.tournament_id,
  academyId: r.academy_id,
  timezone: r.timezone,
  participantPayload: typeof r.participant_payload === 'string' ? JSON.parse(r.participant_payload) : r.participant_payload,
  rawResult: typeof r.raw_result === 'string' ? JSON.parse(r.raw_result) : r.raw_result,
  finalResult: r.final_result ? (typeof r.final_result === 'string' ? JSON.parse(r.final_result) : r.final_result) as FinalResult : null,
  outcome: r.outcome,
  submissionStatus: r.submission_status,
  submittedBy: r.submitted_by,
  submittedAt: r.submitted_at,
  acceptedBy: r.accepted_by,
  acceptedAt: r.accepted_at,
  autoApproved: Boolean(r.auto_approved),
  disputedBy: r.disputed_by,
  disputedAt: r.disputed_at,
  disputeReason: r.dispute_reason,
  resolvedBy: r.resolved_by,
  resolvedAt: r.resolved_at,
  resolutionNote: r.resolution_note,
  submissionDeadlineAt: r.submission_deadline_at,
  autoApprovalDeadlineAt: r.auto_approval_deadline_at,
  evidenceCounted: Boolean(r.evidence_counted),
  ratingAppliedAt: r.rating_applied_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** camelCase JS keys used by the service → actual DB column names. */
const COLUMN_MAP: Record<string, string> = {
  rulesSnapshot: 'rules_snapshot',
  rawResult: 'raw_result',
  finalResult: 'final_result',
  submissionStatus: 'submission_status',
  submittedAt: 'submitted_at',
  acceptedBy: 'accepted_by',
  acceptedAt: 'accepted_at',
  autoApproved: 'auto_approved',
  disputedBy: 'disputed_by',
  disputedAt: 'disputed_at',
  disputeReason: 'dispute_reason',
  resolvedBy: 'resolved_by',
  resolvedAt: 'resolved_at',
  resolutionNote: 'resolution_note',
  submissionDeadlineAt: 'submission_deadline_at',
  autoApprovalDeadlineAt: 'auto_approval_deadline_at',
  evidenceCounted: 'evidence_counted',
  ratingAppliedAt: 'rating_applied_at',
};

const PARTICIPANT_MAPPER = (r: any): MatchResultParticipant => ({
  id: r.id,
  resultId: r.result_id,
  matchId: r.match_id,
  userId: r.user_id,
  teamIndex: r.team_index,
  side: r.side,
  outcome: r.outcome,
  matchEvidence: r.match_evidence != null ? (Number(r.match_evidence) as MatchResultParticipant['matchEvidence']) : null,
  evidenceCounted: Boolean(r.evidence_counted),
  ratingSnapshotPercent: r.rating_snapshot_percent != null ? Number(r.rating_snapshot_percent) : null,
  ratingBefore: r.rating_before != null ? Number(r.rating_before) : null,
  ratingAfter: r.rating_after != null ? Number(r.rating_after) : null,
});

export class MatchResultRepository {
  async resolveMatchId(id: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM matches WHERE id = ? UNION SELECT id FROM matches WHERE booking_id = ?',
      [id, id],
    );
    if (!rows.length) return 0;
    return Number((rows[0] as any).id);
  }

  async getMatchContext(matchId: number): Promise<MatchContext | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id AS match_id, m.sport_id, m.status,
              b.branch_id, b.resource_id,
              COALESCE(ms.ended_at, ms.started_at, b.end_at_utc, b.start_at_utc) AS played_at,
              br.timezone
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       LEFT JOIN match_sessions ms ON ms.match_id = m.id
       WHERE m.id = ?`,
      [matchId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    const [parts] = await pool.execute<RowData>(
      'SELECT user_id FROM match_participants WHERE match_id = ?',
      [matchId],
    );
    return {
      matchId: r.match_id,
      sportId: r.sport_id,
      status: r.status,
      branchId: r.branch_id ?? null,
      resourceId: r.resource_id ?? null,
      playedAt: r.played_at ?? null,
      timezone: r.timezone ?? null,
      participantUserIds: parts.map((p: any) => Number(p.user_id)),
    };
  }

  async findActiveRuleSet(sportId: number): Promise<{ formatId: number; ruleSetId: number; version: number; rules: any; standingsRules: any } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sf.id AS format_id, srs.id AS rule_set_id, srs.version, srs.rules, srs.standings_rules
       FROM sport_formats sf
       JOIN sport_rule_sets srs ON srs.format_id = sf.id AND srs.is_active = 1
       WHERE sf.sport_id = ? AND sf.is_active = 1
       ORDER BY sf.is_default DESC, srs.version DESC
       LIMIT 1`,
      [sportId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      formatId: Number(r.format_id),
      ruleSetId: Number(r.rule_set_id),
      version: r.version,
      rules: typeof r.rules === 'string' ? JSON.parse(r.rules) : r.rules,
      standingsRules: r.standings_rules ? (typeof r.standings_rules === 'string' ? JSON.parse(r.standings_rules) : r.standings_rules) : null,
    };
  }

  async findByMatchId(matchId: number): Promise<MatchResultRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM match_result_records WHERE match_id = ?', [matchId]);
    if (!rows.length) return null;
    return ROW_MAPPER(rows[0]);
  }

  async findById(resultId: number): Promise<MatchResultRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM match_result_records WHERE id = ?', [resultId]);
    if (!rows.length) return null;
    return ROW_MAPPER(rows[0]);
  }

  async getParticipants(resultId: number): Promise<MatchResultParticipant[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM match_result_participants WHERE result_id = ?',
      [resultId],
    );
    return rows.map(PARTICIPANT_MAPPER);
  }

  async insert(input: ResultInsert): Promise<number> {
    const pool = getPool();
    const [res] = await pool.execute(
      `INSERT INTO match_result_records
         (match_id, sport_id, format_id, rule_set_id, rules_snapshot, match_type, played_at,
          branch_id, resource_id, timezone, participant_payload, raw_result, outcome,
          submission_status, submitted_by, submitted_at, accepted_by, accepted_at, auto_approved,
          disputed_by, disputed_at, dispute_reason, resolved_by, resolved_at, resolution_note,
          submission_deadline_at, auto_approval_deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.matchId,
        input.sportId,
        input.formatId,
        input.ruleSetId,
        JSON.stringify(input.rulesSnapshot),
        input.matchType,
        input.playedAt,
        input.branchId,
        input.resourceId,
        input.timezone,
        JSON.stringify(input.participantPayload),
        JSON.stringify(input.rawResult),
        input.outcome,
        input.submissionStatus,
        input.submittedBy ?? null,
        input.submittedAt ?? null,
        input.acceptedBy ?? null,
        input.acceptedAt ?? null,
        input.autoApproved ? 1 : 0,
        input.disputedBy ?? null,
        input.disputedAt ?? null,
        input.disputeReason ?? null,
        input.resolvedBy ?? null,
        input.resolvedAt ?? null,
        input.resolutionNote ?? null,
        input.submissionDeadlineAt,
        input.autoApprovalDeadlineAt,
      ],
    );
    return Number((res as any).insertId);
  }

  async updateResult(resultId: number, fields: Partial<ResultInsert> & Record<string, unknown>): Promise<void> {
    const pool = getPool();
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const column = COLUMN_MAP[key] ?? key;
      sets.push(`\`${column}\` = ?`);
      params.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    }
    if (!sets.length) return;
    params.push(resultId);
    await pool.execute(`UPDATE match_result_records SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async replaceParticipants(resultId: number, matchId: number, participants: Array<{ userId: number; teamIndex: number; side: 'home' | 'away'; outcome: 'win' | 'draw' | 'loss'; matchEvidence: number | null; evidenceCounted: boolean }>): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM match_result_participants WHERE result_id = ?', [resultId]);
      for (const p of participants) {
        await conn.execute(
          `INSERT INTO match_result_participants
             (result_id, match_id, user_id, team_index, side, outcome, match_evidence, evidence_counted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultId, matchId, p.userId, p.teamIndex, p.side, p.outcome, p.matchEvidence, p.evidenceCounted ? 1 : 0],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateParticipantRating(resultId: number, userId: number, fields: { ratingSnapshotPercent: number; ratingBefore: number; ratingAfter: number; evidenceCounted: boolean }): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE match_result_participants
       SET rating_snapshot_percent = ?, rating_before = ?, rating_after = ?, evidence_counted = ?
       WHERE result_id = ? AND user_id = ?`,
      [fields.ratingSnapshotPercent, fields.ratingBefore, fields.ratingAfter, fields.evidenceCounted ? 1 : 0, resultId, userId],
    );
  }

  async listForUser(userId: number, limit: number, offset: number): Promise<{ records: MatchResultRecord[]; total: number }> {
    const pool = getPool();
    const [count] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM match_result_records r
       WHERE r.match_id IN (SELECT match_id FROM match_result_participants WHERE user_id = ?)
          OR (r.match_id IN (SELECT id FROM matches m JOIN match_participants mp ON mp.match_id = m.id WHERE mp.user_id = ?))`,
      [userId, userId],
    );
    const [rows] = await pool.execute<RowData>(
      `SELECT r.* FROM match_result_records r
       WHERE r.match_id IN (SELECT match_id FROM match_result_participants WHERE user_id = ?)
          OR (r.match_id IN (SELECT id FROM matches m JOIN match_participants mp ON mp.match_id = m.id WHERE mp.user_id = ?))
       ORDER BY r.played_at DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, limit, offset],
    );
    return { records: rows.map(ROW_MAPPER), total: Number((count[0] as any).c) };
  }

  async listForAdmin(filters: { status?: string; disputedOnly?: boolean; limit?: number; offset?: number }): Promise<{ records: MatchResultRecord[]; total: number }> {
    const pool = getPool();
    const where: string[] = [];
    const params: any[] = [];
    if (filters.status) {
      where.push('r.submission_status = ?');
      params.push(filters.status);
    }
    if (filters.disputedOnly) {
      where.push('r.submission_status = ?');
      params.push('disputed');
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [count] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM match_result_records r ${whereSql}`, params);
    const [rows] = await pool.execute<RowData>(
      `SELECT r.* FROM match_result_records r ${whereSql} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit ?? 20, filters.offset ?? 0],
    );
    return { records: rows.map(ROW_MAPPER), total: Number((count[0] as any).c) };
  }

  async listFormats(sportId?: number): Promise<SportFormat[]> {
    const pool = getPool();
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (sportId) {
      where += ' AND sf.sport_id = ?';
      params.push(sportId);
    }
    const [rows] = await pool.execute<RowData>(
      `SELECT sf.*, s.name AS sport_name FROM sport_formats sf JOIN sports s ON s.id = sf.sport_id ${where} ORDER BY sf.sport_id ASC, sf.is_default DESC`,
      params,
    );
    return rows.map((r: any) => ({
      id: r.id,
      sportId: r.sport_id,
      slug: r.slug,
      name: r.name,
      formatType: r.format_type,
      description: r.description,
      isDefault: Boolean(r.is_default),
      isActive: Boolean(r.is_active),
    }));
  }

  async listRuleSets(formatId: number, activeOnly = false): Promise<SportRuleSet[]> {
    const pool = getPool();
    let where = 'WHERE srs.format_id = ?';
    const params: any[] = [formatId];
    if (activeOnly) {
      where += ' AND srs.is_active = 1';
    }
    const [rows] = await pool.execute<RowData>(
      `SELECT srs.*, sf.name AS format_name FROM sport_rule_sets srs JOIN sport_formats sf ON sf.id = srs.format_id ${where} ORDER BY srs.version DESC`,
      params,
    );
    return rows.map((r: any) => ({
      id: r.id,
      formatId: r.format_id,
      version: r.version,
      name: r.name,
      rules: typeof r.rules === 'string' ? JSON.parse(r.rules) : r.rules,
      standingsRules: r.standings_rules ? (typeof r.standings_rules === 'string' ? JSON.parse(r.standings_rules) : r.standings_rules) : null,
      isActive: Boolean(r.is_active),
      isDefault: Boolean(r.is_default),
    }));
  }

  async listRuleSetsBySport(sportId: number, activeOnly = false): Promise<Array<{ format: SportFormat; ruleSets: SportRuleSet[] }>> {
    const formats = await this.listFormats(sportId);
    const out: Array<{ format: SportFormat; ruleSets: SportRuleSet[] }> = [];
    for (const format of formats) {
      out.push({ format, ruleSets: await this.listRuleSets(format.id, activeOnly) });
    }
    return out;
  }

  async createRuleSet(input: { formatId: number; name: string | null; rules: unknown; standingsRules: unknown | null; isActive?: boolean; isDefault?: boolean }): Promise<number> {
    const pool = getPool();
    const [maxRows] = await pool.execute<RowData>('SELECT COALESCE(MAX(version),0) + 1 AS next_version FROM sport_rule_sets WHERE format_id = ?', [input.formatId]);
    const version = Number((maxRows[0] as any).next_version);
    if (input.isDefault) {
      await pool.execute('UPDATE sport_rule_sets SET is_default = 0 WHERE format_id = ? AND is_default = 1', [input.formatId]);
    }
    const [res] = await pool.execute(
      `INSERT INTO sport_rule_sets (format_id, version, name, rules, standings_rules, is_active, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.formatId, version, input.name ?? null, JSON.stringify(input.rules), input.standingsRules ? JSON.stringify(input.standingsRules) : null, input.isActive !== false ? 1 : 0, input.isDefault ? 1 : 0],
    );
    return Number((res as any).insertId);
  }

  /** Worker: results awaiting opponent acceptance past the auto-approval deadline. */
  async findAutoApprovable(now: string): Promise<MatchResultRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM match_result_records
       WHERE submission_status = 'pending_confirmation'
         AND auto_approval_deadline_at IS NOT NULL
         AND auto_approval_deadline_at <= ?`,
      [now],
    );
    return rows.map(ROW_MAPPER);
  }

  /** Worker: eligible matches (status in_progress/completed with participants) that have no result and whose window expired. */
  async findExpiredNoResultMatches(now: string): Promise<Array<{ matchId: number; sportId: number; branchId: number | null; resourceId: number | null; playedAt: string; timezone: string | null; participantUserIds: number[] }>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id AS match_id, m.sport_id, b.branch_id, b.resource_id,
              COALESCE(ms.ended_at, ms.started_at, b.end_at_utc, b.start_at_utc) AS played_at,
              br.timezone
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       LEFT JOIN match_sessions ms ON ms.match_id = m.id
       LEFT JOIN match_result_records r ON r.match_id = m.id
       WHERE r.id IS NULL
         AND m.status IN ('in_progress', 'completed')
         AND (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id) >= 2
         AND COALESCE(ms.ended_at, ms.started_at, b.end_at_utc, b.start_at_utc) IS NOT NULL
         AND COALESCE(ms.ended_at, ms.started_at, b.end_at_utc, b.start_at_utc) <= ?`,
      [now],
    );
    const result: Array<{ matchId: number; sportId: number; branchId: number | null; resourceId: number | null; playedAt: string; timezone: string | null; participantUserIds: number[] }> = [];
    for (const r of rows as any[]) {
      const [parts] = await pool.execute<RowData>('SELECT user_id FROM match_participants WHERE match_id = ?', [r.match_id]);
      result.push({
        matchId: Number(r.match_id),
        sportId: r.sport_id,
        branchId: r.branch_id ?? null,
        resourceId: r.resource_id ?? null,
        playedAt: r.played_at,
        timezone: r.timezone ?? null,
        participantUserIds: parts.map((p: any) => Number(p.user_id)),
      });
    }
    return result;
  }
}

export const matchResultRepository = new MatchResultRepository();