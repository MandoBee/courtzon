import { useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { MatchCard } from './MatchCard';
import { isKnockoutFormat, type TournamentBracketInfo, type TournamentMatchNode, type TournamentParticipantNode } from '../../types/tournamentBracket';

interface TournamentBracketProps {
  tournament?: TournamentBracketInfo | null;
  matches: TournamentMatchNode[];
  participants?: TournamentParticipantNode[];
  currentUserId?: number | null;
  onMatchClick?: (match: TournamentMatchNode) => void;
  /** Per-match action slot passed through to MatchCard (e.g. "Enter Score"). */
  footer?: (match: TournamentMatchNode) => React.ReactNode;
  /** Print mode: compact, non-interactive layout. */
  printOnly?: boolean;
}

export function TournamentBracket({ tournament, matches, participants, currentUserId, onMatchClick, footer, printOnly }: TournamentBracketProps) {
  const { t } = useTranslation();

  const rounds = useMemo(() => {
    const map = new Map<number, TournamentMatchNode[]>();
    for (const m of matches) {
      const r = m.round ?? 0;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(m);
    }
    return Array.from(map.keys())
      .sort((a, b) => a - b)
      .map((r) => ({
        round: r,
        label1: matches.find((m) => m.round === r)?.round_name || t('tournamentBracket.round', { round: r }),
        items: (map.get(r) || []).slice().sort((a, b) => (a.bracket_position ?? a.match_number ?? 0) - (b.bracket_position ?? b.match_number ?? 0)),
      }));
  }, [matches, t]);

  const knockout = isKnockoutFormat(tournament);
  const participantCount = participants?.length ?? 0;
  const tbdCount = matches.filter((m) => !m.player1_id || !m.player2_id).length;

  if (matches.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] text-center py-8">{t('tournamentBracket.empty')}</p>
    );
  }

  // ── Knockout (Single/Double Elimination): visual rounds → final columns ──
  if (knockout) {
    return (
      <div className="space-y-4">
        <div className={`flex ${printOnly ? 'print-rounds' : 'gap-3 overflow-x-auto pb-2'} md:gap-4`}>
          {rounds.map((r, i) => (
            <div
              key={r.round}
              className={`${printOnly ? 'min-w-0' : 'min-w-[220px] flex-1 cz-bracket-col'} space-y-2`}
              style={printOnly ? undefined : { animationDelay: `${i * 60}ms` }}
            >
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">{r.label1}</h4>
              {r.items.map((m) => (
                <MatchCard key={m.id} match={m} currentUserId={currentUserId} onClick={onMatchClick} footer={footer} />
              ))}
            </div>
          ))}
        </div>
        {!printOnly && tbdCount > 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">{t('tournamentBracket.tbdHint', { count: tbdCount })}</p>
        )}
      </div>
    );
  }

  // ── Round Robin / Swiss / League / other: round-grouped match list ──
  return (
    <div className="space-y-5">
      {!printOnly && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('tournamentBracket.tableModeHint', { type: tournament?.bracket_type_name || tournament?.format || '' })}
        </p>
      )}
      {rounds.map((r, i) => (
        <div
          key={r.round}
          className={printOnly ? undefined : 'cz-bracket-col'}
          style={printOnly ? undefined : { animationDelay: `${i * 60}ms` }}
        >
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">{r.label1}</h4>
          <div className={`grid ${printOnly ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} gap-3`}>
            {r.items.map((m) => (
              <MatchCard key={m.id} match={m} currentUserId={currentUserId} onClick={onMatchClick} footer={footer} />
            ))}
          </div>
        </div>
      ))}
      {participantCount > 0 && (
        <div className="pt-1">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">{t('tournamentBracket.participants')} ({participantCount})</h4>
          <div className="flex flex-wrap gap-2">
            {participants?.map((p) => (
              <span key={p.id} className="px-2 py-1 text-xs bg-[var(--color-bg)] rounded-full capitalize">
                {p.player_name || `Player #${p.player_id}`}
                {p.seed_rank != null && <span className="text-[var(--color-text-muted)]"> (seed {p.seed_rank})</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}