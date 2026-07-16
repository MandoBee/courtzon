interface Props {
  icon: string;
  title: string;
  description: string;
  accentColor?: string;
}

export default function SummaryCard({ icon, title, description, accentColor }: Props) {
  const from = accentColor ? `${accentColor}10` : 'var(--color-primary)/5';
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-gradient-to-r border border-dashed border-[var(--color-border)] p-4 md:p-5"
      style={{
        background: `linear-gradient(to right, color-mix(in srgb, ${from}, transparent), color-mix(in srgb, ${from}, transparent) 50%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </section>
  );
}
