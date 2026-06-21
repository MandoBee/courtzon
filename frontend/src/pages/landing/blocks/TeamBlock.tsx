import { EntityImage } from '../../../components/ui';

interface TeamMember { name: string; role: string; photo?: string; bio?: string; }
interface TeamBlockProps { data: { members?: TeamMember[]; columns?: number }; title?: string; subtitle?: string; }

export default function TeamBlock({ data, title, subtitle }: TeamBlockProps) {
  return (
    <section className="cz-landing-section cz-landing-section--surface">
      <div className="cz-landing-inner">
        {(title || subtitle) && (
          <div className="cz-landing-section-header animate-fade-in">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 cz-landing-grid">
          {data.members?.map((m, i) => (
            <div key={i} className="text-center group animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="w-28 h-28 mx-auto mb-4 rounded-2xl bg-[var(--color-primary-bg)] flex items-center justify-center overflow-hidden ring-4 ring-[var(--color-bg)] group-hover:ring-[var(--color-primary)]/20 transition-all duration-300">
                <EntityImage src={m.photo} name={m.name} className="w-full h-full rounded-2xl text-3xl" />
              </div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">{m.name}</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{m.role}</p>
              {m.bio && <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">{m.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
