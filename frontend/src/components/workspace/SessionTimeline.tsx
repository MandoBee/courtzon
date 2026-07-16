interface TimelineEvent {
  id: number;
  event: string;
  actor_role: string | null;
  created_at: string;
  metadata?: Record<string, any> | null;
}

const EVENT_LABELS: Record<string, { icon: string; label: string }> = {
  requested: { icon: '📩', label: 'Request submitted' },
  accepted: { icon: '✅', label: 'Coach accepted' },
  declined: { icon: '❌', label: 'Coach declined' },
  counter_proposal: { icon: '🔄', label: 'Coach sent counter proposal' },
  court_selected: { icon: '🎾', label: 'Court selected' },
  confirmed: { icon: '✔️', label: 'Session confirmed' },
  started: { icon: '▶️', label: 'Session started' },
  completed: { icon: '🏁', label: 'Session completed' },
  cancelled: { icon: '🚫', label: 'Session cancelled' },
  no_show: { icon: '👤', label: 'Player did not show' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  events: TimelineEvent[];
  title?: string;
}

export default function SessionTimeline({ events, title = 'Timeline' }: Props) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text)] mb-2">{title}</p>
        <p className="text-xs text-[var(--color-text-muted)]">No events yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-3">{title}</p>
      <div className="space-y-0">
        {events.map((ev, idx) => {
          const info = EVENT_LABELS[ev.event] || { icon: '📌', label: ev.event };
          const isLast = idx === events.length - 1;
          return (
            <div key={ev.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-sm shrink-0">
                  {info.icon}
                </div>
                {!isLast && <div className="w-px flex-1 bg-[var(--color-border)] my-1" />}
              </div>
              <div className={`pb-4 ${isLast ? '' : ''}`}>
                <p className="text-sm text-[var(--color-text)]">{info.label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{formatTime(ev.created_at)}</p>
                {ev.metadata?.reason && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Reason: {ev.metadata.reason}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
