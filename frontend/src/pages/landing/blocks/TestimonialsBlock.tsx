import { EntityImage } from '../../../components/ui';

interface Testimonial { name: string; role?: string; photo?: string; quote: string; }
interface TestimonialsBlockProps { data: { testimonials?: Testimonial[] }; title?: string; subtitle?: string; }

export default function TestimonialsBlock({ data, title, subtitle }: TestimonialsBlockProps) {
  return (
    <section className="cz-landing-section cz-landing-section--surface">
      <div className="cz-landing-inner">
        {(title || subtitle) && (
          <div className="cz-landing-section-header animate-fade-in">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 cz-landing-grid">
          {data.testimonials?.map((t, i) => (
            <div
              key={i}
              className="cz-landing-card cz-landing-card--flat animate-fade-in"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className="flex mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} className="w-5 h-5 text-[var(--color-warning)]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-[var(--color-text-muted)] leading-relaxed mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-bg)] flex items-center justify-center overflow-hidden">
                  <EntityImage src={t.photo} name={t.name} className="w-full h-full rounded-xl text-lg" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text)]">{t.name}</div>
                  {t.role && <div className="text-xs text-[var(--color-text-muted)]">{t.role}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
