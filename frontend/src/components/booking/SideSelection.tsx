import { useTranslation } from '../../i18n';

export type SideOption = 'home' | 'away';

export interface SideSlot {
  side: SideOption;
  userId: number;
  fullName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
}

interface SideSelectionProps {
  formatName?: string | null;
  formatType?: string | null;
  playersPerSide?: number | null;
  slots: SideSlot[];
  selected?: SideOption | null;
  currentUserId?: number | null;
  onSelect: (side: SideOption) => void;
  editable?: boolean;
  showAvatars?: boolean;
}

/**
 * Group 3 — format-driven side selection UI.
 * Renders Home / Away slots generated from the Match's authoritative format
 * snapshot (never hardcoded sport names). Shows capacity (count/capacity),
 * marks full sides as unavailable, and highlights the current user's side.
 * Used by the join flow and the "change side" action on the Match lobby.
 */
export default function SideSelection({
  formatName,
  formatType,
  playersPerSide,
  slots,
  selected,
  currentUserId,
  onSelect,
  editable = false,
  showAvatars = true,
}: SideSelectionProps) {
  const { t } = useTranslation();

  const home = slots.filter((s) => s.side === 'home');
  const away = slots.filter((s) => s.side === 'away');
  const capacity = playersPerSide ?? null;

  const isFull = (side: SideOption) =>
    capacity != null && capacity > 0 && (side === 'home' ? home.length : away.length) >= capacity;

  const renderSide = (side: SideOption) => {
    const members = side === 'home' ? home : away;
    const full = isFull(side);
    const active = selected === side;
    return (
      <button
        type="button"
        onClick={() => onSelect(side)}
        disabled={!editable || full}
        className={`flex-1 text-left rounded-[var(--radius-lg)] border p-3 transition-colors ${
          full
            ? 'border-[var(--color-border)] bg-[var(--color-surface-muted)] opacity-60 cursor-not-allowed'
            : active
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {side === 'home' ? t('match.side_home') : t('match.side_away')}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            full
              ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
              : active
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
          }`}>
            {capacity != null && capacity > 0
              ? full
                ? t('match.side_full')
                : t('match.side_capacity', { count: members.length, capacity })
              : `${members.length}`}
          </span>
        </div>
        <div className="space-y-1.5">
          {members.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('match.side_available')}</p>
          ) : (
            members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2 text-xs text-[var(--color-text)]">
                {showAvatars && m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.fullName || 'Player'}
                    className="w-6 h-6 rounded-full object-cover bg-[var(--color-surface-muted)]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center text-[10px] font-semibold uppercase">
                    {(m.fullName || 'P').charAt(0)}
                  </span>
                )}
                <span className="truncate">
                  {m.fullName || `Player ${m.userId}`}
                  {currentUserId != null && Number(m.userId) === Number(currentUserId) && (
                    <span className="ml-1 text-[10px] font-semibold text-[var(--color-primary)]">({t('match.side_you')})</span>
                  )}
                  {m.role === 'host' && (
                    <span className="ml-1 text-[10px] font-semibold text-[var(--color-primary)]">Host</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      {(formatName || formatType) && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          {formatName
            ? t('match.side_format', { format: formatName })
            : `${formatType}`}
        </p>
      )}
      {capacity == null ? (
        <p className="text-xs text-[var(--color-text-muted)]">{t('match.side_legacy')}</p>
      ) : (
        <div className="flex gap-3">
          {renderSide('home')}
          {renderSide('away')}
        </div>
      )}
    </div>
  );
}