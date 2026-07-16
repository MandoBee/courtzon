import { getPool } from '../../../database/mysql.js';

type RowData = any[];

const COACH_SESSION_STATUSES = [
  'requested', 'accepted', 'declined', 'counter_proposal',
  'pending_acceptance', 'confirmed', 'in_progress', 'completed',
  'cancelled', 'no_show',
] as const;

type CoachSessionStatus = typeof COACH_SESSION_STATUSES[number];

const TRANSITIONS: Record<CoachSessionStatus, CoachSessionStatus[]> = {
  requested: ['accepted', 'declined', 'counter_proposal', 'cancelled'],
  accepted: ['pending_acceptance', 'cancelled'],
  declined: [],
  counter_proposal: ['pending_acceptance', 'cancelled'],
  pending_acceptance: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
  }
}

export class CoachSessionStateService {
  /**
   * Validate that a state transition is allowed.
   */
  validateTransition(from: string, to: string): void {
    const allowed = TRANSITIONS[from as CoachSessionStatus];
    if (!allowed || !allowed.includes(to as CoachSessionStatus)) {
      throw new InvalidTransitionError(from, to);
    }
  }

  /**
   * Apply a state transition to a coach session.
   * - Validates the transition
   * - Updates the session status + timestamp
   * - Logs an immutable timeline event
   * - Returns the updated session
   */
  async transition(
    sessionId: number,
    to: string,
    actor: { id: number; role: string },
    metadata?: Record<string, any>,
  ): Promise<{ session: any; eventId: number }> {
    const pool = getPool();

    // 1. Fetch current session
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM coach_sessions WHERE id = ? LIMIT 1',
      [sessionId],
    );
    if (!rows.length) {
      throw new Error('Coach session not found');
    }
    const session = rows[0];
    const from = session.status;

    // 2. Idempotency: if already in target state, return success
    if (from === to) {
      const [existingEvents] = await pool.execute<RowData>(
        'SELECT id FROM coach_session_events WHERE session_id = ? AND event = ? ORDER BY id DESC LIMIT 1',
        [sessionId, this.eventNameForTransition(from, to)],
      );
      return {
        session,
        eventId: existingEvents.length ? (existingEvents[0] as any).id : 0,
      };
    }

    // 3. Validate transition
    this.validateTransition(from, to);

    // 4. Build timestamp updates
    const now = new Date();
    const timestampCol = this.timestampColumnFor(to);
    const extras: string[] = [];
    const extraParams: any[] = [];

    if (timestampCol) {
      extras.push(`${timestampCol} = ?`);
      extraParams.push(now);
    }

    if (to === 'cancelled') {
      if (metadata?.cancelledBy) {
        extras.push('cancelled_by = ?');
        extraParams.push(metadata.cancelledBy);
      }
      if (metadata?.reason) {
        extras.push('cancellation_reason = ?');
        extraParams.push(metadata.reason);
      }
    }

    if (to === 'counter_proposal' || to === 'pending_acceptance') {
      if (metadata?.proposedStartTime) {
        extras.push('proposed_start_time = ?');
        extraParams.push(metadata.proposedStartTime);
      }
      if (metadata?.proposedEndTime) {
        extras.push('proposed_end_time = ?');
        extraParams.push(metadata.proposedEndTime);
      }
      if (metadata?.proposedCourtId) {
        extras.push('proposed_court_id = ?');
        extraParams.push(metadata.proposedCourtId);
      }
    }

    extras.push('status = ?');
    extraParams.push(to);

    // 5. Apply transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `UPDATE coach_sessions SET ${extras.join(', ')} WHERE id = ?`,
        [...extraParams, sessionId],
      );

      const eventName = this.eventNameForTransition(from, to);
      const [eventResult] = await conn.execute<RowData>(
        `INSERT INTO coach_session_events (session_id, event, actor_id, actor_role, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          eventName,
          actor.id,
          actor.role,
          metadata ? JSON.stringify(metadata) : null,
        ],
      );
      const eventId = (eventResult as any).insertId;

      // Re-fetch updated session
      const [updatedRows] = await conn.execute<RowData>(
        'SELECT * FROM coach_sessions WHERE id = ?',
        [sessionId],
      );

      await conn.commit();

      return { session: updatedRows[0], eventId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Log an immutable timeline event without changing session status.
   */
  async logEvent(
    sessionId: number,
    event: string,
    actor: { id: number; role: string },
    metadata?: Record<string, any>,
  ): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute<RowData>(
      `INSERT INTO coach_session_events (session_id, event, actor_id, actor_role, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, event, actor.id, actor.role, metadata ? JSON.stringify(metadata) : null],
    );
    return (result as any).insertId;
  }

  /**
   * Get the timeline for a session.
   */
  async getTimeline(sessionId: number): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM coach_session_events WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId],
    );
    return rows;
  }

  /**
   * Get all available transitions from current status.
   */
  getAllowedTransitions(from: string): string[] {
    return TRANSITIONS[from as CoachSessionStatus] || [];
  }

  /**
   * Map a state transition to a canonical event name.
   */
  private eventNameForTransition(from: string, to: string): string {
    const map: Record<string, Record<string, string>> = {
      requested: {
        accepted: 'accepted',
        declined: 'declined',
        counter_proposal: 'counter_proposal',
        cancelled: 'cancelled',
      },
      accepted: {
        pending_acceptance: 'court_selected',
        cancelled: 'cancelled',
      },
      counter_proposal: {
        pending_acceptance: 'court_selected',
        cancelled: 'cancelled',
      },
      pending_acceptance: {
        confirmed: 'confirmed',
        cancelled: 'cancelled',
      },
      confirmed: {
        in_progress: 'started',
        cancelled: 'cancelled',
      },
      in_progress: {
        completed: 'completed',
        cancelled: 'cancelled',
      },
    };
    return map[from]?.[to] || to;
  }

  /**
   * Which timestamp column to populate for a given status.
   */
  private timestampColumnFor(status: string): string | null {
    const map: Record<string, string> = {
      requested: 'requested_at',
      accepted: 'responded_at',
      declined: 'responded_at',
      counter_proposal: 'responded_at',
      confirmed: 'confirmed_at',
    };
    return map[status] || null;
  }
}

export const coachSessionStateService = new CoachSessionStateService();
