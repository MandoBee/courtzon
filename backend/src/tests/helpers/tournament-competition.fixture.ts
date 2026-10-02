import type { RowDataPacket } from 'mysql2';

/**
 * G11.18 Phase 1 — seeding helper for integration specs.
 *
 * A tournament that is inserted DIRECTLY with SQL (instead of through the
 * tournament service) has no `tournament_competitions` row, but migration 187
 * makes `competition_id` NOT NULL on registrations/participants/matches/
 * placements/prizes/awards. This helper creates the single DEFAULT competition
 * for such tournaments so the BEFORE-INSERT triggers can scope descendant rows.
 */
export async function seedDefaultCompetition(
  run: (sql: string, params?: unknown[]) => PromiseLike<unknown>,
  tournamentId: number,
  opts: {
    type?: 'singles' | 'doubles' | 'team';
    matchFormatId?: number | null;
    ruleSetId?: number | null;
    bracketTypeId?: number | null;
    sportId?: number | null;
    entryFee?: number;
    currency?: string;
    priceType?: string;
    maxParticipants?: number;
    minParticipants?: number;
  } = {},
): Promise<void> {
  await run(
    `INSERT INTO tournament_competitions
       (public_id, tournament_id, competition_type, name, match_format_id, rule_set_id, bracket_type_id, sport_id,
        entry_fee, registration_fee, currency_code, price_type, max_participants, min_participants, is_default)
     VALUES (UUID(), ?, ?, 'Default', ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, 1)`,
    [
      tournamentId,
      opts.type ?? 'singles',
      opts.matchFormatId ?? null,
      opts.ruleSetId ?? null,
      opts.bracketTypeId ?? null,
      opts.sportId ?? null,
      opts.entryFee ?? 0,
      opts.entryFee ?? 0,
      opts.currency ?? 'EGP',
      opts.priceType ?? (opts.entryFee && opts.entryFee > 0 ? 'FIXED' : 'FREE'),
      opts.maxParticipants ?? null,
      opts.minParticipants ?? 2,
    ],
  );
}

export type { RowDataPacket };