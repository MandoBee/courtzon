interface Stat { label: string; value: string; }
interface StatsBlockProps { data: { stats?: Stat[] }; title?: string; }

export default function StatsBlock({ data, title }: StatsBlockProps) {
  return (
    <section className="cz-hero cz-landing-section">
      <div className="cz-landing-inner">
        {title && (
          <h2 className="cz-landing-h2 text-center mb-12 animate-fade-in">{title}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 cz-landing-grid">
          {data.stats?.map((s, i) => (
            <div key={i} className="text-center animate-fade-in" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="cz-hero-stat-value text-4xl sm:text-5xl font-extrabold mb-2">{s.value}</div>
              <div className="cz-hero-stat-label text-sm font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
