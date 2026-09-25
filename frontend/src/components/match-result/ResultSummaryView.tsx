import { useTranslation } from '../../i18n';
import { EntityImage } from '../ui/EntityImage';
import { formatDateTime } from '../../utils/formatDate';
import type { MatchResultParticipant, MatchResultRecord } from '../../types/match-result';

interface Props {
  record: MatchResultRecord;
  participants?: MatchResultParticipant[];
  showRating?: boolean;
}

const statusStyles: Record<string, string> = {
  pending_confirmation: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  approved: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  disputed: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  withdrawn: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
  no_result: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
};

const statusKey: Record<string, string> = {
  pending_confirmation: 'matchResult.statusPending',
  approved: 'matchResult.statusApproved',
  disputed: 'matchResult.statusDisputed',
  withdrawn: 'matchResult.statusWithdrawn',
  no_result: 'matchResult.statusNoResult',
};

const outcomeKey: Record<string, string> = {
  win: 'matchResult.outcome.win',
  draw: 'matchResult.outcome.draw',
  loss: 'matchResult.outcome.loss',
};

function outcomeBadgeClass(outcome: string): string {
  if (outcome === 'win') return 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]';
  if (outcome === 'draw') return 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]';
  return 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]';
}

/**
 * Group 4 — result card read model. The card shows the REAL player identity
 * (avatar + name) instead of "#userId", grouped by authoritative side/team, and
 * the full display context (sport, format, venue, date, tournament/round when
 * applicable). All display data is read-only context assembled by the result
 * API — nothing here is persisted or recomputed.
 */
export default function ResultSummaryView({ record, participants, showRating = false }: Props) {
  const { t } = useTranslation();
  const list: MatchResultParticipant[] = participants ?? (record as any).participants ?? [];
  const scoreSummary = record.finalResult?.scoreSummary || record.rawResult?.outcome || record.outcome;
  const winners = list.filter((p) => p.outcome === 'win');
  const draw = list.some((p) => p.outcome === 'draw');

  const sport = (record as any).sport ?? null;
  const format = (record as any).format ?? null;
  const venue = (record as any).venue ?? null;
  const tournament = (record as any).tournament ?? null;

  const venueLine = [venue?.organisationName, venue?.branchName, venue?.resourceName]
    .filter(Boolean)
    .join(' · ');

  const home = list.filter((p) => p.side === 'home');
  const away = list.filter((p) => p.side === 'away');
  const sides = [
    { side: 'home', members: home },
    { side: 'away', members: away },
  ];

  const hasTeamIndex = list.some((p) => p.teamIndex != null && p.teamIndex > 0);

  return (
    <div className="text-sm text-[var(--color-text)]">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{scoreSummary}</div>
        <span className={`inline-block px-2 py-0.5 text-xs rounded-full shrink-0 ${statusStyles[record.submissionStatus] || ''}`}>
          {t(statusKey[record.submissionStatus] || record.submissionStatus.replace('_', ' '))}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
        {sport?.sportName && (
          <span className="inline-flex items-center gap-1.5">
            {sport.sportIcon && (
              <img
                src={sport.sportIcon}
                alt={sport.sportName}
                className="w-4 h-4 rounded object-cover bg-[var(--color-surface-muted)]"
                referrerPolicy="no-referrer"
              />
            )}
            {sport.sportName}
          </span>
        )}
        {format?.formatName && (
          <span>{t('matchResult.format', { format: format.formatName })}</span>
        )}
        {record.playedAt && (
          <span>{t('matchResult.playedAt')}: {formatDateTime(record.playedAt)}</span>
        )}
      </div>

      {venueLine && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">
          {t('matchResult.venue')}: {venueLine}
        </div>
      )}

      {tournament?.tournamentName && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">
          {t('matchResult.tournament')}: {tournament.tournamentName}
          {(tournament.roundName || tournament.round) && (
            <span> · {t('matchResult.round')}: {tournament.roundName || tournament.round}</span>
          )}
        </div>
      )}

      {draw ? (
        <div className="text-xs text-[var(--color-text-muted)] mt-2">{t('matchResult.drawNoRating')}</div>
      ) : winners.length > 0 ? (
        <div className="text-xs text-[var(--color-text-muted)] mt-2">
          {t('matchResult.winner')}: {winners.map((w) => w.displayName || `#${w.userId}`).join(', ')}
        </div>
      ) : null}

      {list.length > 0 && (
        <div className="mt-2 space-y-2">
          {sides.map(({ side, members }) =>
            members.length > 0 ? (
              <div key={side}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                    {side === 'home' ? t('matchResult.home') : t('matchResult.away')}
                  </span>
                  {hasTeamIndex && members[0]?.teamIndex != null && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {t('matchResult.team', { n: members[0].teamIndex + 1 })}
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-1">
                  {members.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <EntityImage
                          src={p.avatarUrl}
                          name={p.displayName || `Player ${p.userId}`}
                          alt={p.displayName || undefined}
                          className="w-7 h-7 rounded-full text-[10px]"
                        />
                        <span className="truncate">{p.displayName || t('matchResult.playerLabel', { id: p.userId })}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full ${outcomeBadgeClass(p.outcome)}`}>
                          {t(outcomeKey[p.outcome] || p.outcome)}
                        </span>
                        {showRating && p.ratingAfter != null && (
                          <span className="text-[var(--color-text-muted)]">{t('matchResult.rating')} {p.ratingAfter}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}

      {record.disputeReason && (
        <p className="mt-2 text-xs text-[var(--color-error-text)]">{t('matchResult.disputeLabel')}: {record.disputeReason}</p>
      )}
      {record.autoApproved && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('matchResult.autoApprovedNotice')}</p>
      )}
    </div>
  );
}