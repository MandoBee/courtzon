import { useRef } from 'react';

/**
 * Accessible, responsive tab navigation for the Tournament Hub.
 *
 * - Semantic `role="tablist"` / `role="tab"` with `aria-selected` / `aria-controls`
 * - Roving tabindex + Arrow/Home/End keyboard navigation
 * - Horizontally scrollable on mobile (no page-level overflow)
 * - No CSS-only hiding; callers only pass tabs the user may access
 *
 * `idPrefix` keeps DOM ids unique when tabs are nested (e.g. Competition sub-tabs).
 */

export interface HubTabItem {
  id: string;
  label: string;
}

interface TournamentTabsProps {
  tabs: HubTabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  idPrefix?: string;
}

export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function panelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

export function TournamentTabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  idPrefix = 'cz-hub',
}: TournamentTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="cz-scrollbar-hide flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
    >
      {tabs.map((tab, index) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`-mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] md:px-4 ${
              selected
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
