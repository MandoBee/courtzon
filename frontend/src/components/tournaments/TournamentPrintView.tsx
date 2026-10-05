import { useTranslation } from '../../i18n';
import { TournamentBracket } from './TournamentBracket';
import { formatISODate } from '../../utils/formatDate';
import type { TournamentBracketInfo, TournamentMatchNode, TournamentParticipantNode } from '../../types/tournamentBracket';

interface TournamentPrintViewProps {
  tournament?: TournamentBracketInfo | null;
  matches: TournamentMatchNode[];
  participants?: TournamentParticipantNode[];
  currentUserId?: number | null;
}

/**
 * Print-friendly bracket for organisers/referees.
 * Rendered inside a `.cz-print-area` container; the app chrome is hidden by the
 * `@media print` rules in index.css. Uses the SAME read data (`/tournaments/:id/matches`)
 * so no business logic is duplicated.
 */
export function TournamentPrintView({ tournament, matches, participants, currentUserId }: TournamentPrintViewProps) {
  const { t } = useTranslation();

  return (
    <div className="print-root p-4">
      <div className="mb-4 border-b border-black pb-3">
        <h1 className="text-xl font-bold">{tournament?.name || t('tournamentBracket.printTitle')}</h1>
        <p className="text-sm">
          {[tournament?.sport_name, tournament?.bracket_type_name, tournament?.status].filter(Boolean).join(' · ')}
          {tournament?.bracket_type_name ? '' : ''}
        </p>
        {tournament?.start_date && (
          <p className="text-xs">{t('tournamentBracket.printDate')}: {formatISODate(String(tournament.start_date))}</p>
        )}
      </div>
      <TournamentBracket tournament={tournament} matches={matches} participants={participants} currentUserId={currentUserId} printOnly />
      <p className="mt-4 text-xs text-gray-600">{t('tournamentBracket.seedLegend', { count: participants?.length ?? 0 })}</p>
    </div>
  );
}