/**
 * G11.14 — PURE knockout placement resolver (FAIL-CLOSED).
 *
 * Derives tournament placements from PERSISTED bracket data only — never from
 * operator assertion, never from guesses. The resolver is deliberately pure:
 * no repository, no database, no clock, no randomness. Identical inputs produce
 * identical outputs, so the read path, the completion path and the tests all
 * evaluate EXACTLY the same rule from EXACTLY the same place.
 *
 * CONTRACT (locked):
 *   • A placement is resolved from the terminal (final) bracket slot and its
 *     downstream elimination matches.
 *   • No placement may be resolved when the bracket graph is structurally
 *     ambiguous (zero or multiple terminal slots, an unresolvable winner, or a
 *     terminal slot that is not terminally resolved).
 *   • A loser is NEVER invented: `runner-up` and `third` are written only when
 *     a REAL losing participant is determinable. A bye/placeholder/unplayed
 *     slot and a withdrawn-slot resolution never produce a loser.
 *   • `third` is resolved ONLY when exactly one participant was uniquely
 *     eliminated in the round immediately preceding the final. Two (or more)
 *     elimination losers in that round (e.g. an 8-player bracket) make a tie →
 *     `third` is omitted (fail closed, never fabricated).
 *
 * OUTCOME SEMANTICS
 *   • status 'resolved'  — placements[] holds every uniquely derivable placing.
 *   • status 'incomplete'— the tournament is not (yet) terminally resolvable
 *                          (final slot exists but is not completed / has no
 *                          winner). placements=[].
 *   • status 'ambiguous' — structurally undecidable. placements=[].
 *   • status 'not_knockout' — no bracket matches supplied. placements=[].
 */
import type { TournamentMatch } from './tournament-aggregate.js';

/** The bracket provenance stored in `tournament_matches.progression_meta`. */
export interface KnockoutProgressionMeta {
  is_bracket?: boolean;
  bye?: boolean;
  target_round?: number | null;
  target_bracket_position?: number | null;
  target_side?: 'player1' | 'player2' | null;
}

/** Normalized, pure match projection accepted by the resolver. */
export interface KnockoutMatchInput {
  round: number;
  bracket_position?: number | null;
  participant1_id?: number | null;
  participant2_id?: number | null;
  player1_id?: number | null;
  player2_id?: number | null;
  winner_id?: number | null;
  winner_participant_id?: number | null;
  loser_participant_id?: number | null;
  status?: string | null;
  progression_state?: string | null;
  progression_meta?: Record<string, unknown> | string | null;
  /** The shared `matches` row id. NULL for byes/placeholders and withdrawn-slot resolutions. */
  match_id?: number | null;
}

/** One resolved placing (participant-authoritative, user display mirror). */
export interface PlacementCandidate {
  placement: number;
  participantId: number | null;
  userId: number | null;
  source: 'bracket';
}

export type PlacementResolutionOutcome =
  | { status: 'resolved'; placements: PlacementCandidate[] }
  | { status: 'incomplete'; reason: string; placements: [] }
  | { status: 'ambiguous'; reason: string; placements: [] }
  | { status: 'not_knockout'; reason?: string; placements: [] };

const NOT_COMPLETED = new Set(['scheduled', 'in_progress', 'forfeit', 'no_show']);

function parseMeta(meta: Record<string, unknown> | string | null | undefined): KnockoutProgressionMeta | null {
  if (meta == null) return null;
  if (typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      return (parsed && typeof parsed === 'object' ? parsed : null) as KnockoutProgressionMeta | null;
    } catch {
      return null;
    }
  }
  return meta as KnockoutProgressionMeta;
}

/** Map a TournamentMatch into the pure input shape (defensive numeric coercion). */
export function toKnockoutMatchInput(m: TournamentMatch): KnockoutMatchInput {
  const meta = parseMeta(m.progression_meta);
  return {
    round: Number(m.round) || 0,
    bracket_position: m.bracket_position != null ? Number(m.bracket_position) : null,
    participant1_id: m.participant1_id != null ? Number(m.participant1_id) : null,
    participant2_id: m.participant2_id != null ? Number(m.participant2_id) : null,
    player1_id: m.player1_id != null ? Number(m.player1_id) : null,
    player2_id: m.player2_id != null ? Number(m.player2_id) : null,
    winner_id: m.winner_id != null ? Number(m.winner_id) : null,
    winner_participant_id: m.winner_participant_id != null ? Number(m.winner_participant_id) : null,
    loser_participant_id: m.loser_participant_id != null ? Number(m.loser_participant_id) : null,
    status: m.status ?? 'scheduled',
    progression_state: m.progression_state ?? null,
    progression_meta: m.progression_meta != null ? (typeof m.progression_meta === 'string' ? m.progression_meta : m.progression_meta as Record<string, unknown>) : null,
    match_id: m.match_id != null ? Number(m.match_id) : null,
  };
}

function isTerminalSlot(m: KnockoutMatchInput, meta: KnockoutProgressionMeta): boolean {
  return meta.is_bracket === true
    && meta.bye !== true
    && (meta.target_round == null || !Number.isFinite(Number(meta.target_round)))
    && (meta.target_bracket_position == null || !Number.isFinite(Number(meta.target_bracket_position)));
}

function isTerminallyResolved(m: KnockoutMatchInput): boolean {
  if (m.status == null || NOT_COMPLETED.has(String(m.status))) return false;
  if (m.progression_state != null && String(m.progression_state) !== 'completed') return false;
  return true;
}

/** Resolve the WINNING participant of a slot to a single tournament participant id. */
function resolveWinnerParticipant(m: KnockoutMatchInput): { participantId: number | null; userId: number | null } {
  if (m.winner_participant_id != null) {
    return { participantId: Number(m.winner_participant_id), userId: m.winner_id != null ? Number(m.winner_id) : null };
  }
  if (m.winner_id == null) return { participantId: null, userId: null };
  const wid = Number(m.winner_id);
  if (m.player1_id != null && wid === Number(m.player1_id) && m.participant1_id != null) {
    return { participantId: Number(m.participant1_id), userId: wid };
  }
  if (m.player2_id != null && wid === Number(m.player2_id) && m.participant2_id != null) {
    return { participantId: Number(m.participant2_id), userId: wid };
  }
  return { participantId: null, userId: wid };
}

/** The side participant/user mirrors that did NOT win the slot. */
function resolveLoserSide(m: KnockoutMatchInput, championParticipant: number): { participantId: number | null; userId: number | null } {
  const p1 = m.participant1_id != null ? Number(m.participant1_id) : null;
  const p2 = m.participant2_id != null ? Number(m.participant2_id) : null;
  if (p1 != null && p2 != null) {
    if (p1 === championParticipant) return { participantId: p2, userId: m.player2_id != null ? Number(m.player2_id) : null };
    if (p2 === championParticipant) return { participantId: p1, userId: m.player1_id != null ? Number(m.player1_id) : null };
  }
  return { participantId: null, userId: null };
}

/**
 * The pure, deterministic placement resolver. Fail-closed: an undecidable graph
 * yields zero placements, never a guess.
 */
export function resolveKnockoutPlacements(input: readonly KnockoutMatchInput[]): PlacementResolutionOutcome {
  const matches = (Array.isArray(input) ? input : []).filter((m) => m != null);
  if (matches.length === 0) return { status: 'not_knockout', placements: [] };

  const bracketed: Array<{ m: KnockoutMatchInput; meta: KnockoutProgressionMeta }> = [];
  for (const m of matches) {
    const meta = parseMeta(m.progression_meta);
    if (!meta || meta.is_bracket !== true) continue;
    bracketed.push({ m, meta });
  }
  if (bracketed.length === 0) return { status: 'not_knockout', reason: 'no_bracket_slots', placements: [] };

  // 1. Locate the UNIQUE terminal slot.
  const finals = bracketed.filter(({ m, meta }) => isTerminalSlot(m, meta));
  if (finals.length === 0) return { status: 'ambiguous', reason: 'no_terminal_slot', placements: [] };
  if (finals.length > 1) return { status: 'ambiguous', reason: 'multiple_terminal_slots', placements: [] };

  const final = finals[0].m;

  // 2. Fail closed on an unresolved final.
  if (!isTerminallyResolved(final)) {
    return { status: 'incomplete', reason: 'final_not_resolved', placements: [] };
  }

  // 3. Champion — the final's winner, resolved to a single participant.
  const champion = resolveWinnerParticipant(final);
  if (champion.participantId == null) {
    return { status: 'ambiguous', reason: 'final_winner_unresolvable', placements: [] };
  }

  const placements: PlacementCandidate[] = [
    { placement: 1, participantId: champion.participantId, userId: champion.userId, source: 'bracket' },
  ];

  // 4. Runner-up — only when a REAL losing participant is determinable.
  const finalRound = Number(final.round) || 0;
  const loserSide = resolveLoserSide(final, champion.participantId);
  const finalHasResultDelivery = final.loser_participant_id != null || final.match_id != null;
  if (loserSide.participantId != null && finalHasResultDelivery) {
    placements.push({
      placement: 2,
      participantId: Number(final.loser_participant_id != null ? final.loser_participant_id : loserSide.participantId),
      userId: loserSide.userId,
      source: 'bracket',
    });
  }

  // 5. Third — only when EXACTLY ONE participant was uniquely eliminated in the
  //    round immediately preceding the final (a "bye cascade" / 3-player single
  //    semi). Two or more elimination losers make a tie → third is omitted.
  //    Withdrawn/placeholder/bye slots never contribute a loser.
  if (placements.some((p) => p.placement === 2)) {
    const eliminatedSet = new Map<number, { participantId: number; userId: number | null }>();
    for (const { m } of bracketed) {
      const meta = m.progression_meta == null ? undefined : parseMeta(m.progression_meta);
      const targetRound = meta?.target_round != null ? Number(meta.target_round) : null;
      if (targetRound !== finalRound) continue;
      if (!isTerminallyResolved(m)) continue;
      if (meta?.bye === true) continue;
      // A determinable loser only: explicit loser column, or a genuinely played
      // match (shared match delivered) whose loser side is real.
      let loserParticipant: number | null = null;
      let loserUserId: number | null = null;
      if (m.loser_participant_id != null) {
        loserParticipant = Number(m.loser_participant_id);
        // G11.14 — mirror the loser's user id from the seated side.
        const p1 = m.participant1_id != null ? Number(m.participant1_id) : null;
        const p2 = m.participant2_id != null ? Number(m.participant2_id) : null;
        if (p1 === loserParticipant) loserUserId = m.player1_id != null ? Number(m.player1_id) : null;
        else if (p2 === loserParticipant) loserUserId = m.player2_id != null ? Number(m.player2_id) : null;
      } else if (m.match_id != null) {
        const winner = resolveWinnerParticipant(m);
        if (winner.participantId != null) {
          const ls = resolveLoserSide(m, winner.participantId);
          loserParticipant = ls.participantId;
          loserUserId = ls.userId;
        }
      }
      if (loserParticipant == null) continue;
      eliminatedSet.set(loserParticipant, { participantId: loserParticipant, userId: loserUserId });
    }
    if (eliminatedSet.size === 1) {
      const [third] = [...eliminatedSet.values()];
      placements.push({ placement: 3, participantId: third.participantId, userId: third.userId, source: 'bracket' });
    }
  }

  return { status: 'resolved', placements };
}