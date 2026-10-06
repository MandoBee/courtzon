import { Fragment } from 'react';

/**
 * Tournament Hub hero — presentational only.
 *
 * Renders the premium tournament header: status, identity, meta, one
 * lifecycle-aware primary action, a secondary action menu, a derived phase
 * progress indicator (no new lifecycle statuses), and a KPI strip.
 *
 * The component performs no permission checks and no data fetching. The caller
 * decides which actions to pass (already filtered by the exact backend
 * permission) so the UI can never expose an action the backend would reject.
 */

export interface HubKpi {
  key: string;
  label: string;
  value: string | number;
}

export interface HubPhase {
  key: string;
  label: string;
}

export interface HubAction {
  key: string;
  label: string;
  onAct: () => void;
  pending?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'neutral' | 'danger';
}

export interface HubMetaItem {
  label: string;
  value: string;
}

interface TournamentHeroProps {
  name: string;
  statusLabel: string;
  statusClass: string;
  meta: HubMetaItem[];
  kpis: HubKpi[];
  phases: HubPhase[];
  phaseIndex: number;
  primary?: HubAction | null;
  secondary?: HubAction[];
  backLabel?: string;
  onBack?: () => void;
  progressLabel: string;
  moreLabel: string;
}

function phaseDotClass(state: 'done' | 'current' | 'todo'): string {
  if (state === 'done') return 'bg-[var(--color-primary)] text-white';
  if (state === 'current')
    return 'bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary-bg)]';
  return 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]';
}

function phaseLabelClass(state: 'done' | 'current' | 'todo'): string {
  if (state === 'current') return 'font-semibold text-[var(--color-text)]';
  if (state === 'done') return 'text-[var(--color-text)]';
  return 'text-[var(--color-text-muted)]';
}

export function TournamentHero({
  name,
  statusLabel,
  statusClass,
  meta,
  kpis,
  phases,
  phaseIndex,
  primary,
  secondary = [],
  backLabel,
  onBack,
  progressLabel,
  moreLabel,
}: TournamentHeroProps) {
  return (
    <section className="cz-hub-enter rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      {/* ── Identity + actions (premium gradient surface) ── */}
      <div
        className="rounded-t-[var(--radius-xl)] p-5 text-white md:p-6"
        style={{ backgroundImage: 'var(--gradient-hero)' }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            {onBack && backLabel && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 rounded-[var(--radius-md)] text-xs font-medium text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span aria-hidden="true">←</span> {backLabel}
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl">{name}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-white/25 ${statusClass || 'bg-white/15 text-white'}`}
              >
                {statusLabel}
              </span>
            </div>
            {meta.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
                {meta.map((m) => (
                  <span key={m.label} className="inline-flex items-center gap-1">
                    <span className="text-white/60">{m.label}:</span>
                    <span className="font-medium">{m.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {(primary || secondary.length > 0) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {primary && (
                <button
                  type="button"
                  onClick={primary.onAct}
                  disabled={primary.pending || primary.disabled}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-white px-4 text-sm font-semibold text-[var(--color-primary-dark)] shadow-[var(--shadow-sm)] transition-colors hover:bg-white/90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {primary.label}
                </button>
              )}
              {secondary.length > 0 && (
                <details className="relative">
                  <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded-[var(--radius-md)] bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                    {moreLabel}
                    <span aria-hidden="true" className="text-[10px]">▾</span>
                  </summary>
                  <div className="absolute right-0 z-40 mt-2 min-w-[13rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-lg)]">
                    {secondary.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={a.onAct}
                        disabled={a.pending || a.disabled}
                        className={`flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] ${
                          a.tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Derived phase progress ── */}
      <div className="border-t border-[var(--color-border)] px-4 py-3 md:px-5">
        <nav
          aria-label={progressLabel}
          className="cz-scrollbar-hide flex items-center gap-2 overflow-x-auto py-1"
        >
          {phases.map((p, i) => {
            const state: 'done' | 'current' | 'todo' =
              i < phaseIndex ? 'done' : i === phaseIndex ? 'current' : 'todo';
            return (
              <Fragment key={p.key}>
                <div
                  className="flex shrink-0 items-center gap-2"
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${phaseDotClass(state)}`}
                  >
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className={`whitespace-nowrap text-xs ${phaseLabelClass(state)}`}>{p.label}</span>
                </div>
                {i < phases.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`h-px w-6 shrink-0 md:w-10 ${
                      i < phaseIndex ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                    }`}
                  />
                )}
              </Fragment>
            );
          })}
        </nav>
      </div>

      {/* ── KPI strip ── */}
      {kpis.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3 md:px-5 md:pb-5">
          <div className="cz-scrollbar-hide flex snap-x gap-3 overflow-x-auto md:grid md:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.key}
                className="min-w-[8.5rem] snap-start rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 md:min-w-0"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  {k.label}
                </p>
                <p className="mt-1 truncate text-lg font-bold text-[var(--color-text)]">{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
