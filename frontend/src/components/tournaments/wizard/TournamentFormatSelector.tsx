import { useTranslation } from '../../../i18n';

/**
 * Tournament Creation Wizard — Format selector.
 *
 * Clearly separates TOURNAMENT FORMAT (bracket) from MATCH FORMAT / RULE SET
 * (handled on the Format step by the sport cascade in the page).
 *
 * The five target formats are presented as cards. Every card states its real
 * state — a format is NEVER shown as "Active" unless the engine can execute it:
 *   • single-elimination, round-robin   → selectable (engine executes)
 *   • double-elimination, swiss         → "Engine preparation" (planned)
 *   • group-stage-knockout              → "Engine preparation" + future
 *                                         configuration journey preview
 *
 * Planned formats are never submitted to the backend as executable: the page
 * only writes a bracket type id for engine-executable formats.
 */

export interface TournamentFormatCard {
  /** DB bracket-type slug when a row exists; `null` for planned formats without a row */
  slug: string | null;
  key: string;
  name: string;
  executable: boolean;
  /** DB id when available AND executable */
  dbId: number | null;
  unavailable?: boolean;
}

interface TournamentFormatSelectorProps {
  cards: TournamentFormatCard[];
  /** selected bracket type id ('' = none, executable formats only) */
  selectedId: string;
  /** planned format currently revealed for explanation */
  plannedKey: string | null;
  onSelect: (id: string) => void;
  onRevealPlanned: (key: string | null) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function TournamentFormatSelector({
  cards,
  selectedId,
  plannedKey,
  onSelect,
  onRevealPlanned,
  disabled,
  disabledReason,
}: TournamentFormatSelectorProps) {
  const { t } = useTranslation();
  const revealsLinked = (key: string) => (plannedKey === key ? null : key);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const isSelected = !card.executable ? false : selectedId === String(card.dbId);
          const isPlannedRevealed = plannedKey === card.key;
          const clickable = !disabled && (card.executable ? card.dbId != null : true);
          return (
            <button
              key={card.key}
              type="button"
              data-testid={`format-card-${card.key}`}
              onClick={() => {
                if (disabled) return;
                if (card.executable) {
                  if (card.dbId != null) onSelect(String(card.dbId));
                } else {
                  onRevealPlanned(revealsLinked(card.key));
                }
              }}
              disabled={!clickable}
              aria-pressed={card.executable ? isSelected : false}
              className={`flex min-h-[92px] flex-col items-start gap-1 rounded-[var(--radius-lg)] border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-55 ${
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]'
                  : isPlannedRevealed
                    ? 'border-[var(--color-warning)] bg-[var(--color-warning-bg)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border)]'
              }`}
            >
              <span className="text-sm font-semibold text-[var(--color-text)]">{card.name}</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  card.executable
                    ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                    : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                }`}
              >
                {card.executable
                  ? t('tournaments.wizard.format.available', 'Available')
                  : t('tournaments.wizard.format.engine_prep', 'Engine preparation')}
              </span>
              {card.unavailable && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {t('tournaments.wizard.format.unavailable', 'Unavailable for this organisation')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-[var(--color-text-muted)]">{disabledReason}</p>
      )}

      {/* ── Planned-format explanation panel ── */}
      {plannedKey && (
        <div
          className="rounded-[var(--radius-lg)] border border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)]/40 p-4 space-y-2"
          data-testid="format-planned-panel"
        >
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {t('tournaments.wizard.format.engine_prep_title', 'Engine preparation')}
          </p>
          <p className="text-xs text-[var(--color-text)]">
            {t(
              'tournaments.wizard.format.engine_prep_hint',
              'This tournament format is part of the CourtZon roadmap. The execution engine is not available yet, so it cannot be created today.',
            )}
          </p>

          {plannedKey === 'group-stage-knockout' && (
            <div className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4" data-testid="gsk-preview">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {t('tournaments.wizard.gsk.title', 'Group Stage + Knockout — future configuration')}
              </p>
              <p className="whitespace-pre-line text-xs leading-relaxed text-[var(--color-text)]">
                {t(
                  'tournaments.wizard.gsk.journey',
                  '32 Participants\n    ↓\n8 Groups × 4\n    ↓\nGroup Round Robin\n    ↓\nTop 2 from each group\n    ↓\n16 Qualified\n    ↓\nRound of 16\n    ↓\nQuarter Final\n    ↓\nSemi Final\n    ↓\nFinal',
                )}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {t(
                  'tournaments.wizard.gsk.config',
                  'Planned configuration: number of groups, participants per group, group round-robin rules, qualifiers per group, best third-place participants, qualification ordering, seeding (manual/automatic), knockout start round, rematch prevention, group-winner separation.',
                )}
              </p>
              <p className="text-[11px] text-[var(--color-warning-text)]">
                {t(
                  'tournaments.wizard.gsk.note',
                  'Not yet submit-ready — no group-stage configuration is persisted until the Group Stage + Knockout engine ships. This is a UX foundation only.',
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Selected executable format journey preview ── */}
      {!plannedKey && selectedId && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4" data-testid="format-journey-preview">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {t('tournaments.wizard.format.outline', 'Tournament outline')}
          </p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[var(--color-text)]">
            {journeyFor(selectedId, cards, t)}
          </p>
        </div>
      )}
    </div>
  );
}

function journeyFor(selectedId: string, cards: TournamentFormatCard[], t: (k: string, d?: string, p?: Record<string, string | number>) => string): string {
  const card = cards.find((c) => c.executable && String(c.dbId) === selectedId);
  if (!card) return '';
  if (card.slug === 'round-robin') {
    return t(
      'tournaments.wizard.format.journey.round_robin',
      'Participants\n    ↓\nEveryone plays everyone\n    ↓\nStandings\n    ↓\nChampion',
    );
  }
  return t(
    'tournaments.wizard.format.journey.knockout',
    'Participants\n    ↓\nSingle elimination bracket\n    ↓\nFinal\n    ↓\nChampion',
  );
}