/**
 * Tournament Creation Wizard — step indicator.
 *
 * Accessible, responsive step progress:
 *  - Desktop: horizontal labelled stepper (numbered circles, completed check)
 *  - Mobile:  compact "Step X of N · Label" header + a scrollable dot strip
 *  - Completed/current/upcoming + per-step validation-error markers
 *  - Only reached steps are clickable (prevents skipping forward)
 *
 * The wizard never renders any action the user cannot take: buttons are limited
 * to already-visited steps, and `onSelect` is the caller's gate.
 */

export interface WizardStepItem {
  id: string;
  label: string;
}

interface CreateWizardStepperProps {
  steps: WizardStepItem[];
  current: number;
  /** ids of steps whose required configuration is currently complete */
  completed: string[];
  /** ids of steps that failed validation on an attempted Continue */
  failed: string[];
  maxReached: number;
  onSelect: (index: number) => void;
}

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function CreateWizardStepper({ steps, current, completed, failed, maxReached, onSelect }: CreateWizardStepperProps) {
  const stepNumber = current + 1;
  return (
    <div className="w-full">
      {/* Mobile — compact progress header */}
      <div className="md:hidden" data-testid="wizard-progress-mobile">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[var(--color-text)]">
            {`Step ${stepNumber} of ${steps.length}`}
          </span>
          <span className="truncate pl-2 text-xs font-medium text-[var(--color-text-muted)]">
            {steps[current]?.label}
          </span>
        </div>
        <ol className="mt-2 flex items-center gap-1 overflow-x-auto cz-scrollbar-hide" aria-hidden="true">
          {steps.map((s, i) => {
            const done = completed.includes(s.id);
            const err = failed.includes(s.id);
            const active = i === current;
            const reached = i <= maxReached;
            return (
              <li key={s.id} className={cn('h-1.5 shrink-0 flex-1 rounded-full transition-colors', done ? 'bg-[var(--color-primary)]' : err ? 'bg-[var(--color-error)]' : active ? 'bg-[var(--color-primary)]/60' : reached ? 'bg-[var(--color-border)]' : 'bg-[var(--color-bg)]')} />
            );
          })}
        </ol>
      </div>

      {/* Desktop — labelled stepper */}
      <ol
        className="hidden w-full items-start gap-1 md:flex"
        data-testid="wizard-progress-desktop"
        aria-label={steps.map((s) => s.label).join(', ')}
      >
        {steps.map((s, i) => {
          const done = completed.includes(s.id);
          const err = failed.includes(s.id);
          const active = i === current;
          const reached = i <= maxReached;
          return (
            <li key={s.id} className={cn('flex min-w-0 flex-1 flex-col items-center gap-1.5', active && 'font-semibold')}>
              <button
                type="button"
                data-testid={`wizard-step-${s.id}`}
                onClick={() => reached && onSelect(i)}
                disabled={!reached}
                aria-current={active ? 'step' : undefined}
                aria-label={`${s.label}${active ? ' (current)' : done ? ' (complete)' : ''}`}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : done
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                      : err
                        ? 'border-[var(--color-error)] bg-[var(--color-error-bg)] text-[var(--color-error)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]',
                )}
              >
                {done ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span aria-hidden="true">{i + 1}</span>
                )}
              </button>
              <span
                className={cn(
                  'max-w-full truncate text-[11px] leading-tight',
                  active ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <span aria-hidden="true" className="absolute" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}