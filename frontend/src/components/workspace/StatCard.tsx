interface Props {
  icon: string;
  label: string;
  value: number | string;
  color?: string;
}

export default function StatCard({ icon, label, value, color = 'var(--color-text)' }: Props) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-3 md:p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="text-xl md:text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
