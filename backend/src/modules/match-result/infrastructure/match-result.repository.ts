import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type {
  FinalResult,
  MatchParticipantSlot,
  MatchResultParticipant,
  MatchResultRecord,
  ParticipantSlot,
  RawMatchResultPayload,
  SportFormat,
  SportRuleSet,
} from '../domain/match-result.types.js';
import type { MatchFormatSnapshot } from '../../match/domain/match.types.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';
import { SUBMISSION_WINDOW_HOURS } from '../application/result-window.js';

type RowData = mysql.RowDataPacket[];

/**
 * Normalize a timestamp value to a MySQL DATETIME/TIMESTAMP literal before
 * binding. The match-result service produces ISO-8601 strings
 * (`new Date().toISOString()` → `2026-09-15T00:27:54.952Z`) which MySQL strict
 * mode rejects for DATETIME/TIMESTAMP columns. This converts them to the same
 * UTC instant in `YYYY-MM-DD HH:mm:ss` form (the app-wide convention — see
 * `shared/utils/mysql-date.ts`). Dates and already-valid literals pass through.
 */
function toMySqlTs(v: unknown): any {
  if (v == null) return null; // undefined → SQL NULL (mysql2 rejects undefined bindings)
  if (v instanceof Date) return toMySqlDateTime(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return `${s.slice(0, 10)} ${s.slice(11, 19)}`;
  }
  return s;
}

export interface MatchContext {
  matchId: number;
  sportId: number;
  status: string;
  formatId: number | null;
  formatSnapshot: MatchFormatSnapshot | null;
  ruleSetId: number | null;
  ruleSnapshot: Record<string, unknown> | null;
  branchId: number | null;
  resourceId: number | null;
  playedAt: string | null;
  endAtUtc: string | null;
  timezone: string | null;
  participantUserIds: number[];
  /** Authoritative side/team assignments from match_participants (side may be null on legacy matches). */
  participantSlots: MatchParticipantSlot[];
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
  finalResult?: FinalResult | null;
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

/** match_result_records columns that store UTC instants (normalized to MySQL literals on write). */
const DATETIME_COLUMNS = new Set([
  'played_at', 'submitted_at', 'accepted_at', 'disputed_at', 'resolved_at',
  'submission_deadline_at', 'auto_approval_deadline_at', 'rating_applied_at',
]);

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
      `SELECT m.id AS match_id, m.sport_id, m.status, m.format_id, m.format_snapshot, m.rule_set_id, m.rule_snapshot,
              b.branch_id, b.resource_id, b.end_at_utc,
              COALESCE(
                (SELECT COALESCE(ms.ended_at, ms.started_at) FROM match_sessions ms
                 WHERE ms.match_id = m.id ORDER BY ms.id DESC LIMIT 1),
                CASE WHEN b.end_at_utc IS NOT NULL AND b.end_at_utc <= UTC_TIMESTAMP()
                     THEN b.end_at_utc ELSE NULL END
              ) AS played_at,
              br.timezone
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       WHERE m.id = ?`,
      [matchId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    const [parts] = await pool.execute<RowData>(
      'SELECT user_id, side, team_index FROM match_participants WHERE match_id = ?',
      [matchId],
    );
    const slots = (parts as any[]).map((p: any) => ({
      userId: Number(p.user_id),
      side: p.side ?? null,
      teamIndex: p.team_index != null ? Number(p.team_index) : null,
    }));
    return {
      matchId: r.match_id,
      sportId: r.sport_id,
      status: r.status,
      formatId: r.format_id != null ? Number(r.format_id) : null,
      formatSnapshot: r.format_snapshot ? (typeof r.format_snapshot === 'string' ? JSON.parse(r.format_snapshot) : r.format_snapshot) : null,
      ruleSetId: r.rule_set_id != null ? Number(r.rule_set_id) : null,
      ruleSnapshot: r.rule_snapshot ? (typeof r.rule_snapshot === 'string' ? JSON.parse(r.rule_snapshot) : r.rule_snapshot) : null,
      branchId: r.branch_id ?? null,
      resourceId: r.resource_id ?? null,
      playedAt: r.played_at ?? null,
      endAtUtc: r.end_at_utc ?? null,
      timezone: r.timezone ?? null,
      participantUserIds: slots.map((s) => s.userId),
      participantSlots: slots,
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

  /**
   * Active rule set for a SPECIFIC format (authoritative Match format). Used by
   * result submission when the Match already knows its format — so the scoring
   * rules follow the Match's historical format, not the current sport default.
   */
  async findActiveRuleSetForFormat(formatId: number): Promise<{ formatId: number; ruleSetId: number; version: number; rules: any; standingsRules: any } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sf.id AS format_id, srs.id AS rule_set_id, srs.version, srs.rules, srs.standings_rules
       FROM sport_formats sf
       JOIN sport_rule_sets srs ON srs.format_id = sf.id AND srs.is_active = 1
       WHERE sf.id = ? AND sf.is_active = 1
       ORDER BY srs.version DESC
       LIMIT 1`,
      [formatId],
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
          branch_id, resource_id, timezone, participant_payload, raw_result, final_result, outcome,
          submission_status, submitted_by, submitted_at, accepted_by, accepted_at, auto_approved,
          disputed_by, disputed_at, dispute_reason, resolved_by, resolved_at, resolution_note,
          submission_deadline_at, auto_approval_deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.matchId,
        input.sportId,
        input.formatId,
        input.ruleSetId,
        JSON.stringify(input.rulesSnapshot),
        input.matchType,
        toMySqlTs(input.playedAt),
        input.branchId,
        input.resourceId,
        input.timezone,
        JSON.stringify(input.participantPayload),
        JSON.stringify(input.rawResult),
        input.finalResult ? JSON.stringify(input.finalResult) : null,
        input.outcome,
        input.submissionStatus,
        input.submittedBy ?? null,
        toMySqlTs(input.submittedAt),
        input.acceptedBy ?? null,
        toMySqlTs(input.acceptedAt),
        input.autoApproved ? 1 : 0,
        input.disputedBy ?? null,
        toMySqlTs(input.disputedAt),
        input.disputeReason ?? null,
        input.resolvedBy ?? null,
        toMySqlTs(input.resolvedAt),
        input.resolutionNote ?? null,
        toMySqlTs(input.submissionDeadlineAt),
        toMySqlTs(input.autoApprovalDeadlineAt),
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
      params.push(DATETIME_COLUMNS.has(column) ? toMySqlTs(value) : (typeof value === 'object' && value !== null ? JSON.stringify(value) : value));
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
    const [rows] = await pool.query<RowData>(
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
    const [rows] = await pool.query<RowData>(
      `SELECT r.* FROM match_result_records r ${whereSql} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit ?? 20, filters.offset ?? 0],
    );
    return { records: rows.map(ROW_MAPPER), total: Number((count[0] as any).c) };
  }

  /**
   * Organisation-scoped result moderation — only results whose match's booking
   * belongs to the organisation. Used by the org portal Match Results screen.
   * Tenant isolation: the caller is already org-approved by the route guard and
   * this filter narrows every row to bookings.organisation_id = :orgId.
   */
  async listForOrg(orgId: number, filters: { status?: string; limit?: number; offset?: number }): Promise<{ records: MatchResultRecord[]; total: number }> {
    const pool = getPool();
    const where: string[] = ['b.organisation_id = ?'];
    const params: any[] = [orgId];
    if (filters.status) {
      where.push('r.submission_status = ?');
      params.push(filters.status);
    }
    const [count] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c
       FROM match_result_records r
       JOIN matches m ON m.id = r.match_id
       JOIN bookings b ON b.id = m.booking_id
       WHERE ${where.join(' AND ')}`,
      params,
    );
    const [rows] = await pool.query<RowData>(
      `SELECT r.*
       FROM match_result_records r
       JOIN matches m ON m.id = r.match_id
       JOIN bookings b ON b.id = m.booking_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit ?? 50, filters.offset ?? 0],
    );
    return { records: rows.map(ROW_MAPPER), total: Number((count[0] as any).c) };
  }

  /** Resolve the owning organisation of a result record (null when it has no booking link). */
  async getResultOrgId(resultId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT b.organisation_id
       FROM match_result_records r
       JOIN matches m ON m.id = r.match_id
       JOIN bookings b ON b.id = m.booking_id
       WHERE r.id = ?`,
      [resultId],
    );
    if (!rows.length) return null;
    return Number((rows[0] as any).organisation_id);
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
      playersPerSide: r.players_per_side != null ? Number(r.players_per_side) : null,
      description: r.description,
      isDefault: Boolean(r.is_default),
      isActive: Boolean(r.is_active),
    }));
  }

  /**
   * Resolve the authoritative Sport Format for a sport at Match creation time.
   * Prefers the single default/active format (existing resolution semantics:
   * `is_default` first, then id for determinism). Returns null when the sport
   * has no active format — the caller decides whether to fail or leave the
   * Match format-less (legacy behavior preserved).
   */
  async resolveDefaultFormatForSport(sportId: number): Promise<{ formatId: number; formatType: 'singles' | 'doubles' | 'team'; playersPerSide: number | null; name: string } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, format_type, players_per_side, name
       FROM sport_formats
       WHERE sport_id = ? AND is_active = 1
       ORDER BY is_default DESC, id ASC
       LIMIT 1`,
      [sportId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      formatId: Number(r.id),
      formatType: r.format_type,
      playersPerSide: r.players_per_side != null ? Number(r.players_per_side) : null,
      name: r.name,
    };
  }

  /** Resolve a single Sport Format by id (for explicit format_id validation). */
  async findFormatById(formatId: number): Promise<{ formatId: number; sportId: number; formatType: 'singles' | 'doubles' | 'team'; playersPerSide: number | null; name: string; isActive: boolean } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, sport_id, format_type, players_per_side, name, is_active
       FROM sport_formats WHERE id = ?`,
      [formatId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      formatId: Number(r.id),
      sportId: Number(r.sport_id),
      formatType: r.format_type,
      playersPerSide: r.players_per_side != null ? Number(r.players_per_side) : null,
      name: r.name,
      isActive: Boolean(r.is_active),
    };
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

  /** Worker: eligible matches (status in the eligible set) with no result and whose window expired. */
  async findExpiredNoResultMatches(now: string): Promise<Array<{ matchId: number; sportId: number; branchId: number | null; resourceId: number | null; playedAt: string; timezone: string | null; participantUserIds: number[]; participantSlots: MatchParticipantSlot[]; formatId: number | null; ruleSetId: number | null; ruleSnapshot: Record<string, unknown> | null }>> {
    const pool = getPool();
    // Same authoritative played_at computation as getMatchContext: the session
    // row wins when present, otherwise the scheduled booking end (end_at_utc)
    // is used once it has passed. Without the booking fallback, a match whose
    // session row is missing/late could never be marked No Result.
    const playedAtExpr = `COALESCE(
      (SELECT COALESCE(ms.ended_at, ms.started_at) FROM match_sessions ms
       WHERE ms.match_id = m.id ORDER BY ms.id DESC LIMIT 1),
      CASE WHEN b.end_at_utc IS NOT NULL AND b.end_at_utc <= UTC_TIMESTAMP()
           THEN b.end_at_utc ELSE NULL END
    )`;
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id AS match_id, m.sport_id, m.format_id, m.rule_set_id, m.rule_snapshot, b.branch_id, b.resource_id,
              ${playedAtExpr} AS played_at,
              br.timezone
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       LEFT JOIN match_result_records r ON r.match_id = m.id
       WHERE r.id IS NULL
         AND m.status IN ('full', 'closed', 'in_progress', 'completed')
         AND (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id) >= 2
         AND ${playedAtExpr} IS NOT NULL
         AND ${playedAtExpr} <= ?
         AND ${playedAtExpr} < DATE_SUB(?, INTERVAL ${SUBMISSION_WINDOW_HOURS} HOUR)`,
      [now, now],
    );
    const result: Array<{ matchId: number; sportId: number; branchId: number | null; resourceId: number | null; playedAt: string; timezone: string | null; participantUserIds: number[]; participantSlots: MatchParticipantSlot[]; formatId: number | null; ruleSetId: number | null; ruleSnapshot: Record<string, unknown> | null }> = [];
    for (const r of rows as any[]) {
      const [parts] = await pool.execute<RowData>('SELECT user_id, side, team_index FROM match_participants WHERE match_id = ?', [r.match_id]);
      const slots = (parts as any[]).map((p: any) => ({
        userId: Number(p.user_id),
        side: p.side ?? null,
        teamIndex: p.team_index != null ? Number(p.team_index) : null,
      }));
      result.push({
        matchId: Number(r.match_id),
        sportId: r.sport_id,
        branchId: r.branch_id ?? null,
        resourceId: r.resource_id ?? null,
        playedAt: r.played_at,
        timezone: r.timezone ?? null,
        participantUserIds: slots.map((s) => s.userId),
        participantSlots: slots,
        formatId: r.format_id != null ? Number(r.format_id) : null,
        ruleSetId: r.rule_set_id != null ? Number(r.rule_set_id) : null,
        ruleSnapshot: r.rule_snapshot ? (typeof r.rule_snapshot === 'string' ? JSON.parse(r.rule_snapshot) : r.rule_snapshot) : null,
      });
    }
    return result;
  }

  /**
   * Concurrency-safe state transition for pending results (Part C8). The UPDATE
   * only succeeds while submission_status is still 'pending_confirmation' — if a
   * dispute landed first, zero rows are affected and the caller must not proceed.
   */
  async approvePending(resultId: number, fields: Record<string, unknown>): Promise<boolean> {
    const pool = getPool();
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const column = COLUMN_MAP[key] ?? key;
      sets.push(`\`${column}\` = ?`);
      params.push(DATETIME_COLUMNS.has(column) ? toMySqlTs(value) : (typeof value === 'object' && value !== null ? JSON.stringify(value) : value));
    }
    if (!sets.length) return false;
    params.push(resultId);
    const [res] = await pool.execute(
      `UPDATE match_result_records SET ${sets.join(', ')} WHERE id = ? AND submission_status = 'pending_confirmation'`,
      params,
    );
    return Number((res as any).affectedRows) > 0;
  }
}

export const matchResultRepository = new MatchResultRepository();