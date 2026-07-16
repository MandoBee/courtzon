interface Props {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  variant?: 'dashed' | 'solid' | 'gradient';
  gradientFrom?: string;
  gradientTo?: string;
}

export default function EmptyStateCard({
  icon, title, description, action, variant = 'dashed',
  gradientFrom = 'from-[var(--color-primary)]/5',
  gradientTo = 'to-[var(--color-info)]/5',
}: Props) {
  if (variant === 'gradient') {
    return (
      <section
        className={`rounded-[var(--radius-lg)] bg-gradient-to-r ${gradientFrom} ${gradientTo} border border-dashed border-[var(--color-border)] p-4 md:p-5`}
      >
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          {description}
          {action && (
            <>
              {' — '}
              <button onClick={action.onClick} className="text-[var(--color-primary)] hover:underline font-medium">
                {action.label}
              </button>
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <div className={`rounded-[var(--radius-lg)] bg-[var(--color-surface)] border ${variant === 'dashed' ? 'border-dashed' : 'border-solid'} border-[var(--color-border)] p-4 md:p-5`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
          {description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>}
        </div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-sm text-[var(--color-primary)] font-medium hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
