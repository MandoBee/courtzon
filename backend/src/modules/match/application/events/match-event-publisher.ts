import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { eventBusV2 } from '../../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';
import type { MatchDomainEvent, MatchRealtimeAudience } from './match.events.js';

const log = createModuleLogger('match-event-publisher');

export interface MatchPublishOptions {
  /**
   * Executor for the source audience read. When the domain event is emitted
   * from inside the same transaction, pass the transaction connection so the
   * context (including match_participants) is visible.
   */
  executor?: mysql.Pool | mysql.PoolConnection;
  /** Explicit audience overrides (e.g. a roster captured before it is cleared). */
  audience?: Partial<MatchRealtimeAudience>;
}

export class MatchEventPublisher {
  async publish(event: MatchDomainEvent, options: MatchPublishOptions = {}): Promise<void> {
    let payload = event.payload as unknown as Record<string, unknown>;
    try {
      const context = await this.resolveAudience(event.payload.matchId, options);
      payload = { ...event.payload, ...context };
    } catch (err) {
      // A failed context read must never swallow the domain event.
      log.error({ err, type: event.type, matchId: event.payload.matchId }, 'match.audience_resolve_failed');
    }

    // When the domain event is created inside a transaction, the outbox row and
    // the socket/notification delivery MUST be transaction-bound: the outbox
    // insert goes through the SAME connection (atomic with the business write)
    // and the in-memory handlers fire only after commit via the ALS transaction
    // context established by withTransaction / runProvidedTransaction.
    const executor = options.executor ?? null;
    const isConnection = executor != null && typeof (executor as mysql.PoolConnection).beginTransaction === 'function';
    const transactionConnection = isConnection ? (executor as mysql.PoolConnection) : undefined;
    eventBusV2.emit(event.type as never, payload as never, undefined, transactionConnection);
  }

  private async resolveAudience(matchId: number, options: MatchPublishOptions): Promise<MatchRealtimeAudience> {
    const db = options.executor ?? getPool();

    const [matchRows] = await db.execute<mysql.RowDataPacket[]>(
      `SELECT m.id AS match_id,
              m.booking_id,
              m.tournament_id,
              pmd.creator_id AS public_creator_id,
              pmd.visibility,
              b.user_id AS booking_user_id,
              b.organisation_id AS booking_organisation_id,
              b.branch_id AS booking_branch_id,
              t.creator_id AS tournament_creator_id,
              t.organisation_id AS tournament_organisation_id,
              t.branch_id AS tournament_branch_id
       FROM matches m
       LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
       LEFT JOIN bookings b ON b.id = m.booking_id
       LEFT JOIN tournaments t ON t.id = COALESCE(
         m.tournament_id,
         (SELECT tm.tournament_id FROM tournament_matches tm WHERE tm.match_id = m.id ORDER BY tm.id LIMIT 1)
       )
       WHERE m.id = ?`,
      [matchId],
    );
    const row = matchRows[0] as Record<string, unknown> | undefined;

    const [participantRows] = await db.execute<mysql.RowDataPacket[]>(
      'SELECT user_id FROM match_participants WHERE match_id = ?',
      [matchId],
    );

    const context: MatchRealtimeAudience = {
      organisationId: row ? (row.tournament_organisation_id ?? row.booking_organisation_id ?? null) as number | null : null,
      branchId: row ? (row.tournament_branch_id ?? row.booking_branch_id ?? null) as number | null : null,
      bookingId: row ? row.booking_id as number | null : null,
      tournamentId: row ? row.tournament_id as number | null : null,
      visibility: row ? row.visibility as MatchRealtimeAudience['visibility'] : null,
      creatorId: row
        ? (row.public_creator_id ?? row.tournament_creator_id ?? row.booking_user_id ?? null) as number | null
        : undefined,
      participantUserIds: participantRows.map((r) => Number((r as Record<string, unknown>).user_id)),
    };

    return {
      ...context,
      ...(options.audience ?? {}),
    };
  }
}

export const matchEventPublisher = new MatchEventPublisher();