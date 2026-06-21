interface Feature { icon?: string; title: string; description: string; }
interface FeaturesBlockProps { data: { columns?: number; features?: Feature[] }; title?: string; subtitle?: string; }

const iconMap: Record<string, string> = {
  booking: '📅', calendar: '📅', compete: '🏆', tournament: '🏆',
  community: '👥', marketplace: '🛒', coach: '🎾', shield: '🛡️',
  chart: '📊', star: '⭐', bolt: '⚡', heart: '❤️', globe: '🌍',
  lock: '🔒', phone: '📱', search: '🔍', settings: '⚙️',
};

export default function FeaturesBlock({ data, title, subtitle }: FeaturesBlockProps) {
  const cols = data.columns || 3;
  const gridCols = cols === 4 ? 'lg:grid-cols-4' : cols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner">
        {(title || subtitle) && (
          <div className="cz-landing-section-header animate-fade-in">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} cz-landing-grid`}>
          {data.features?.map((f, i) => (
            <div
              key={i}
              className="group cz-landing-card animate-fade-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="cz-landing-feature-icon">
                {f.icon ? (iconMap[f.icon] || '✨') : '✨'}
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
